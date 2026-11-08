import TB from './engine.js';
import {role} from './operations.js';
export function repaymentParties(s,actor,loanId,trade){
 const l=s.loans.find(l=>l.id===loanId);TB.need(l&&l.status==='active','Choose an active loan.');
 TB.need(role(s,actor)!=='borrower'||l.borrowerId===actor,'Loan is not accessible.');
 const ids=[String(trade?.user?.id),String(trade?.trader?.id)];
 TB.need(ids.includes(actor)&&ids.includes(l.borrowerId),'Trade must involve your account and this borrower.');
 const recipient=ids.find(id=>id!==l.borrowerId);
 TB.need(recipient&&role(s,recipient)!=='borrower','Trade recipient must be an active bank lender.');
 if(trade.completed_at)TB.need(new Date(trade.completed_at*1000).toISOString().slice(0,10)>=l.start,'Trade predates this loan.');
 return {loan:l,recipient};
}
export function linkRepayment(s,actor,loanId,trade){
 const {loan,recipient}=repaymentParties(s,actor,loanId,trade),tradeId=String(trade.id);
 TB.need(/^\d+$/.test(tradeId),'Torn did not return a valid trade ID.');
 s.paymentIntents??=[];
 const existing=s.paymentIntents.find(p=>p.tradeId===tradeId&&p.verification==='torn-trade');
 if(existing){TB.need(existing.loanId===loanId,'This trade is already linked to another loan.');return existing;}
 TB.need(!s.pendingPayments.some(p=>p.reference==='torn-api-trade:'+tradeId)&&!s.loans.some(l=>l.payments.some(p=>p.reference==='torn-api-trade:'+tradeId)),'This trade already has a payment record.');
 const p={id:TB.uid('INTENT'),loanId,borrowerId:loan.borrowerId,recipient,tradeId,verification:'torn-trade',amount:null,created:TB.today(),status:'pending'};
 s.paymentIntents.push(p);s.actorId=actor;TB.log(s,'Repayment trade linked',loanId+' / '+tradeId);return p;
}
