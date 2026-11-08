import React from 'react';
const money=value=>'$'+Math.round(Number(value)||0).toLocaleString('en-US');
const statusLabel=status=>({pending:'Awaiting lender review',review:'Payment under review',received:'Payment received',accepted:'Payment accepted',approved:'Extension approved',denied:'Extension denied',rejected:'Payment rejected'}[status]||status);
export default function LoanRequests({state,loanId,isStaff,staffName,onRecord,onReviewPayment,onReviewExtension}){
 const matches=row=>!loanId||row.loanId===loanId;
 const intents=(state.paymentIntents||[]).filter(matches),payments=(state.pendingPayments||[]).filter(matches),extensions=(state.extensionRequests||[]).filter(matches);
 const loanName=row=>state.loans.find(l=>l.id===row.loanId)?.name||'Loan';
 return <>
  <section className='card'><h2>Borrower payment requests</h2><p className='muted'>A request tells the lender to expect a payment. The balance changes only after receipt is verified and accepted.</p>
   {!intents.length&&<p className='muted'>No payment requests recorded.</p>}
   {intents.map(p=><div className='record static' key={p.id}><div className='record-main'><strong>{loanName(p)} · {money(p.amount)}</strong><span>Recipient: {staffName(p.recipient)} · {p.created}</span><span>{statusLabel(p.status)}</span>{p.tradeId&&<small>Trade ID: {p.tradeId}</small>}</div>{isStaff&&p.status==='pending'&&<button type='button' className='secondary' onClick={()=>onRecord(p)}>Record received payment</button>}</div>)}
  </section>
  <section className='card'><h2>Payment reviews</h2>
   {!payments.length&&<p className='muted'>No payment receipts recorded for review.</p>}
   {payments.map(p=><div className='record static' key={p.id}><div className='record-main'><strong>{loanName(p)} · {money(p.cash)} cash{p.hasItems?' + items':''}</strong><span>{p.reference} · {p.date}</span><span>{statusLabel(p.status)}</span>{p.reason&&<small>{p.reason}</small>}</div>{isStaff&&p.status==='pending'&&<button type='button' className='secondary' onClick={()=>onReviewPayment(p)}>Review payment</button>}</div>)}
  </section>
  <section className='card'><h2>Extension requests</h2><p className='muted'>The agreed deadline changes only after lender approval.</p>
   {!extensions.length&&<p className='muted'>No extension requests recorded.</p>}
   {extensions.map(p=><div className='record static' key={p.id}><div className='record-main'><strong>{loanName(p)} · {p.originalDue} → {p.until}</strong><span>{p.reason}</span><span>{statusLabel(p.status)}</span>{p.reviewReason&&<small>Lender note: {p.reviewReason}</small>}</div>{isStaff&&p.status==='pending'&&<button type='button' className='secondary' onClick={()=>onReviewExtension(p)}>Review extension</button>}</div>)}
  </section>
 </>;
}
