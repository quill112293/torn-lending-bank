import {createServer} from '../server/context.js';
import {role} from '../lib/operations.js';
import {reconcileTrade} from '../lib/trades.js';
import TB from '../lib/engine.js';
export function route(env){
const {body,identity,loadState,saveState,ownKey,torn,response,rateLimit}=createServer(env);
async function POST(req:Request){try{const u=await identity(req),a=await body(req);await rateLimit(u.platformId+':trades',3);const initial=await loadState();if(role(initial,u.torn_id)==='borrower')throw Error('Only receiving staff can verify trades.');await ownKey(a.key,u.torn_id);let ids:string[]=[];if(a.tradeId){ids=[TB.ident(a.tradeId)];}else{const list=await torn(a.key,'user/trades?cat=finished&limit=10&sort=desc');ids=(list.trades||[]).filter((t:any)=>t.completed_at).map((t:any)=>String(t.id));}const details=[];for(const id of ids){if(initial.receipts?.some((r:any)=>r.tradeId===id))continue;details.push((await torn(a.key,'user/'+id+'/trade')).trade);}let s=await loadState();const rev=s.revision;const results=[];for(const trade of details){try{const r=reconcileTrade(s,u.torn_id,trade);s=r.state;results.push({tradeId:trade.id,result:r.status});}catch(e:any){results.push({tradeId:trade?.id,result:e.message});}}if(details.length){TB.refreshStrikes(s);await saveState(s,rev);}return response({results});}catch(e:any){return response({error:e.message},e.status||400);}}
return { POST };
}
