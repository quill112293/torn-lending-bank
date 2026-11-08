import TB from './engine.js';
const related=['pendingPayments','paymentIntents','extensionRequests','collateral','receipts'];
export function removalPlan(s,kind,id){
 const plan={kind,id,applications:[],loans:[],pendingPayments:[],paymentIntents:[],extensionRequests:[],collateral:[],receipts:[],drafts:[]};
 const match=(key,fn)=>{plan[key]=(s[key]||[]).filter(fn).map(x=>x.id);};
 if(kind==='testPerson'||kind==='allTests'){
  match('applications',a=>a.isTest&&(kind==='allTests'||a.borrowerId===id));match('loans',l=>l.isTest&&(kind==='allTests'||l.borrowerId===id));plan.drafts=(s.applicationDrafts||[]).filter(d=>d.isTest&&(kind==='allTests'||d.borrowerId===id)).map(d=>d.id);
 }else if(kind==='application'){
  const a=s.applications.find(x=>x.id===id);TB.need(a,'Application no longer exists.');plan.applications=[id];match('loans',x=>x.applicationId===id);
 }else if(kind==='loan'){
  const l=s.loans.find(x=>x.id===id);TB.need(l,'Loan no longer exists.');plan.loans=[id];if(l.applicationId&&s.applications.some(x=>x.id===l.applicationId))plan.applications=[l.applicationId];
 }else if(kind==='payment'){
  const p=s.pendingPayments.find(x=>x.id===id);TB.need(p,'Payment no longer exists.');TB.need(p.status!=='accepted','Accepted payments represent real funds. Archive the whole test loan instead, or reconcile a live correction.');plan.pendingPayments=[id];match('paymentIntents',x=>x.paymentId===id||x.id===p.intentId);match('receipts',x=>x.paymentId===id);
 }else if(kind==='paymentRequest'||kind==='extensionRequest'){
  const key=kind==='paymentRequest'?'paymentIntents':'extensionRequests',p=(s[key]||[]).find(x=>x.id===id);TB.need(p,'Request no longer exists.');TB.need(p.status==='pending','Only pending requests can be removed directly.');plan[key]=[id];
 }else throw Error('Choose an application, loan, payment or pending request.');
 const ids=new Set(plan.loans),loans=s.loans.filter(l=>ids.has(l.id));
 TB.need(loans.every(l=>l.isTest||l.status==='approved'&&!l.payments.length&&!(s.ledger||[]).some(e=>e.loanId===l.id)&&!(s.collateral||[]).some(e=>e.loanId===l.id)&&!l.collateralConfirmed),'Funded real loans and real loans with received collateral cannot be removed. Marking someone as a tester never changes existing real loans.');
 if(ids.size){for(const k of related.filter(k=>k!=='receipts'))match(k,x=>ids.has(x.loanId));const pays=new Set(plan.pendingPayments);match('receipts',x=>ids.has(x.loanId)||pays.has(x.paymentId));}
 plan.outstanding=loans.filter(l=>l.status==='active').reduce((n,l)=>n+TB.balance(l,s.testDate).total,0);
 plan.recordedCashOut=s.ledger.filter(e=>ids.has(e.loanId)&&e.type==='disbursement').reduce((n,e)=>n+e.amount,0);
 plan.recordedCashIn=s.ledger.filter(e=>ids.has(e.loanId)&&e.type==='repayment').reduce((n,e)=>n+e.amount,0);
 plan.summary=Object.entries(plan).filter(([k,v])=>Array.isArray(v)&&v.length).map(([k,v])=>({type:k,count:v.length}));return plan;
}
export function removeRecords(s,kind,id,reason){
 const p=removalPlan(s,kind,id);TB.need(p.summary.length,'No matching records remain.');
 const archive={id:TB.uid('ARCHIVE'),at:new Date().toISOString(),by:s.actorId,reason:TB.text(reason,500),plan:p,records:{}};
 s.removedReferences??=[];
 for(const r of [...s.receipts||[],...s.pendingPayments||[]])if(p.receipts.includes(r.id)||p.pendingPayments.includes(r.id)){if(r.reference&&!s.removedReferences.includes(r.reference))s.removedReferences.push(r.reference);}
 for(const l of s.loans.filter(l=>p.loans.includes(l.id))){for(const ref of [...l.payments.map(p=>p.reference),l.collateralConfirmed?.reference].filter(Boolean))if(!s.removedReferences.includes(ref))s.removedReferences.push(ref);}
 for(const k of ['applications','loans',...related]){archive.records[k]=(s[k]||[]).filter(x=>p[k].includes(x.id));s[k]=(s[k]||[]).filter(x=>!p[k].includes(x.id));}
 archive.records.drafts=(s.applicationDrafts||[]).filter(x=>p.drafts.includes(x.id));s.applicationDrafts=(s.applicationDrafts||[]).filter(x=>!p.drafts.includes(x.id));
 // Real Torn cash movements are never reversed by a screen cleanup.
 s.recordArchives??=[];s.recordArchives.push(archive);TB.log(s,'Records archived',kind+' '+id+' / '+TB.text(reason,400));return s;
}
