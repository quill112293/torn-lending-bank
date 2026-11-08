import TB from './engine.js';
export function reference(){return 'TLB-'+crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase();}
export function ensureReferences(s){for(const a of s.applications){a.reference ||= 'TLB-'+a.id;}for(const l of s.loans){l.reference ||= s.applications.find(a=>a.id===l.applicationId)?.reference || 'TLB-'+l.id;}}
export function lendingFunds(s){return Math.max(0,s.staff.filter(p=>!p.disabled).reduce((n,p)=>n+TB.spendable(s,p.id),0));}
export function canSeeCash(viewer,target){return viewer?.role==='owner'||viewer?.id===target.id||viewer?.role==='vault'&&target.role!=='owner';}
export function automaticApproval(s,a,verified,accepted){
 const q=TB.quote(a,s.rules);a.preapproval={amount:q.amount,maximum:q.maximum,credited:q.credited,ruleVersion:s.rules.version,at:new Date().toISOString()};
 const why=[];
 if(!verified)why.push('Verified applicant information needs review');
 if(a.items.length)why.push('Item collateral requires lender review');
 if(a.requested>q.maximum)why.push('Requested amount exceeds preapproval');
 if(!accepted)why.push('Borrower has not accepted the preapproval amount');
 if(!s.bankOnline)why.push('Bank is offline');
 if(TB.grade(s,a.borrowerId).color!=='green')why.push('Borrower standing needs review');
 why.push(...q.blockers,...q.warnings);
 if(q.amount<=0)why.push('No eligible amount');
 const issuer=s.staff.find(p=>!p.disabled&&TB.spendable(s,p.id)>=q.amount);
 if(!issuer)why.push('Lending funds need allocation');
 a.reviewReasons=[...new Set(why)];
 if(why.length)return;
 const actor=s.actorId;s.actorId=issuer.id;
 const l=TB.approve(s,a.id,q.amount,'Automatic cash-only approval; awaiting collateral receipt and borrower confirmation.',true);
 a.decision.automatic=true;a.decision.by='system';l.reference=a.reference;l.collateralRequired=TB.collateralRequired(a,q.amount,s.rules);l.collateralConfirmed=false;
 s.audit[s.audit.length-1].actor='system';s.actorId=actor;
}
