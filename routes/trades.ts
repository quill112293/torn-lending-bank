import {createServer} from '../server/context.js';
import {role} from '../lib/operations.js';
import {reconcileTrade} from '../lib/trades.js';
import {repaymentParties,linkRepayment} from '../lib/trade-link.js';
import TB from '../lib/engine.js';
export function route(env){
 const {body,identity,loadState,saveState,ownKey,torn,response,rateLimit}=createServer(env);
 async function POST(req:Request){try{
  const u=await identity(req),a=await body(req);await rateLimit(u.platformId+':trades',6);
  const initial=await loadState(),actor=u.torn_id,isStaff=role(initial,actor)!=='borrower';
  await ownKey(a.key,actor);
  const canCheck=p=>p.recipient===actor||p.borrowerId===actor;
  async function detail(id){const trade=(await torn(a.key,'user/'+id+'/trade')).trade;TB.need(String(trade?.id)===String(id),'Torn returned a different trade.');return trade;}
  if(a.action==='list'){
   const loan=initial.loans.find(l=>l.id===a.loanId);TB.need(loan&&loan.status==='active'&&(isStaff||loan.borrowerId===actor),'Loan is not accessible.');
   const lists=await Promise.all(['ongoing','finished'].map(cat=>torn(a.key,'user/trades?cat='+cat+'&limit=20&sort=desc')));
   const trades=[],seen=new Set();
   for(const t of lists.flatMap(r=>r.trades||[])){try{const {recipient}=repaymentParties(initial,actor,a.loanId,t);if(seen.has(String(t.id)))continue;seen.add(String(t.id));trades.push({id:t.id,description:TB.text(t.description,300),completed_at:t.completed_at,recipient});}catch{}}
   return response({trades});
  }
  if(a.action==='link'){
   const id=TB.ident(a.tradeId),trade=await detail(id);let s=await loadState();const rev=s.revision;
   const intent=linkRepayment(s,actor,a.loanId,trade);let result='Trade linked. Waiting for Torn to confirm completion.';
   if(trade.completed_at&&intent.status==='pending'){
    // Previously imported, unassigned receipts may now be linked to their actual loan.
    s.receipts=(s.receipts||[]).filter(r=>!(r.tradeId===id&&r.status==='review'&&!r.paymentId));
    const r=reconcileTrade(s,intent.recipient,trade);s=r.state;result=r.status;
   }
   await saveState(s,rev);return response({result});
  }
  TB.need(!a.action,'Unknown trade action.');
  const watches=(initial.paymentIntents||[]).filter(p=>p.status==='pending'&&p.verification==='torn-trade'&&canCheck(p)).sort((a,b)=>(a.checkedAt||0)-(b.checkedAt||0)).slice(0,5);
  let ids=watches.map(p=>p.tradeId);
  if(a.tradeId){TB.need(isStaff,'Choose a trade through your loan.');ids=[TB.ident(a.tradeId)];}
  else if(isStaff&&!a.linkedOnly){const list=await torn(a.key,'user/trades?cat=finished&limit=10&sort=desc');ids.push(...(list.trades||[]).filter(t=>t.completed_at).map(t=>String(t.id)));}
  ids=[...new Set(ids)];
  const details=[],results=[];
  for(const id of ids){if(initial.receipts?.some(r=>r.tradeId===id))continue;try{details.push(await detail(id));}catch(e){results.push({tradeId:id,result:e.message});}}
  let s=await loadState();const rev=s.revision;let changed=false;
  for(const trade of details){try{
   const watch=(s.paymentIntents||[]).find(p=>p.tradeId===String(trade.id)&&p.status==='pending'&&p.verification==='torn-trade'&&canCheck(p));
   if(watch){repaymentParties(s,actor,watch.loanId,trade);watch.checkedAt=Date.now();changed=true;}
   else TB.need(isStaff&&!a.linkedOnly,'No pending repayment trade matches.');
   if(!trade.completed_at){results.push({tradeId:trade.id,result:'Waiting for completion in Torn.'});continue;}
   const r=reconcileTrade(s,watch?.recipient||actor,trade);s=r.state;changed=true;results.push({tradeId:trade.id,result:r.status});
  }catch(e){results.push({tradeId:trade.id,result:e.message});}}
  if(changed){TB.refreshStrikes(s);await saveState(s,rev);}return response({results});
 }catch(e){return response({error:TB.text(e.message,500)},e.status||400);}}
 return {POST};
}
