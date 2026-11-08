import TB from './engine.js';
import {classifyTrade} from './trades.js';
export function verifyCollateral(s,staffId,loanId,trade){
 const l=s.loans.find(l=>l.id===loanId);TB.need(l?.status==='approved'&&l.collateralRequired&&!l.collateralConfirmed,'Choose a loan awaiting cash collateral.');
 const p=s.staff.find(p=>p.id===staffId&&!p.disabled);TB.need(p,'Only receiving staff may verify collateral.');
 const t=classifyTrade(trade,staffId);TB.need(t.borrower===l.borrowerId,'This trade is not from the borrower.');
 TB.need(!t.hasItems&&!t.outgoing,'Cash collateral must be a one-way cash-only trade.');TB.need(t.cash>=l.collateralRequired,'The cash received does not cover the required collateral.');
 const a=s.applications.find(a=>a.id===l.applicationId);TB.need(trade.completed_at*1000>=Date.parse(a.created),'Use a collateral trade completed after the application was created.');
 TB.need(!(s.removedReferences||[]).includes(t.reference)&&!(s.receipts||[]).some(r=>r.reference===t.reference)&&!s.pendingPayments.some(r=>r.reference===t.reference)&&!s.loans.some(x=>x.collateralConfirmed?.reference===t.reference||x.payments.some(p=>p.reference===t.reference)),'This trade is already recorded.');
 l.collateralConfirmed={by:staffId,amount:t.cash,reference:t.reference,at:new Date().toISOString(),source:'Torn API completed trade'};
 s.receipts??=[];s.receipts.push({...t,id:TB.uid('RECEIPT'),status:'collateral',loanId:l.id,reason:'Verified cash collateral; not spendable bank funds'});
 s.collateral??=[];s.collateral.push({id:TB.uid('COL'),loanId:l.id,borrowerId:l.borrowerId,event:'received',holder:staffId,description:'Verified cash collateral: '+t.cash,reference:t.reference,date:t.date,by:staffId});
 s.actorId=staffId;TB.log(s,'Cash collateral verified',l.reference);return s;
}
