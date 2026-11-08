import TB from './engine.js';
export function classifyTrade(trade,recipient){
 TB.need(trade&&Number.isSafeInteger(trade.id)&&trade.completed_at,'A completed API trade is required.');
 const ids=[String(trade.user?.id),String(trade.trader?.id)];TB.need(ids.includes(recipient),'Trade does not involve this recipient.');
 const borrower=ids.find(id=>id!==recipient);TB.need(borrower&&Array.isArray(trade.items),'Trade details are incomplete.');
 let cash=0,outgoing=0;const items=[];let hasItems=false;
 for(const entry of trade.items){TB.need(ids.includes(String(entry.user_id)),'Unknown participant in trade.');if(entry.type==='Money'){const amount=TB.money(entry.details?.amount,'Trade cash');if(String(entry.user_id)===borrower)cash+=amount;else outgoing+=amount;}else{hasItems=true;items.push(entry);}}
 return {reference:'torn-api-trade:'+trade.id,tradeId:String(trade.id),borrower,recipient,cash,outgoing,hasItems,items,date:new Date(trade.completed_at*1000).toISOString().slice(0,10)};
}
export function reconcileTrade(state,recipient,trade){
 const s=TB.clone(state);s.actorId=recipient;s.testDate=TB.today();TB.requireRole(s);s.receipts??=[];
 const t=classifyTrade(trade,recipient);
 if((s.removedReferences||[]).includes(t.reference)||s.receipts.some(r=>r.reference===t.reference)||s.pendingPayments.some(r=>r.reference===t.reference)||s.loans.some(l=>l.payments.some(p=>p.reference===t.reference)))return {state:s,status:'Already recorded'};
 const matches=(s.paymentIntents||[]).filter(p=>p.status==='pending'&&p.recipient===recipient&&p.borrowerId===t.borrower&&(!p.tradeId||p.tradeId===t.tradeId)&&p.created<=t.date&&(p.amount===t.cash||t.hasItems));
 const receipt={...t,id:TB.uid('RECEIPT'),status:'review',reason:'Match needs review'};
 if(matches.length!==1||t.outgoing>0){receipt.reason=matches.length!==1?'No unique expected payment matches this trade.':'Recipient also supplied cash; review the trade.';s.receipts.push(receipt);TB.log(s,'Trade requires review',t.reference+' / '+receipt.reason);return {state:s,status:receipt.reason};}
 const intent=matches[0],l=s.loans.find(l=>l.id===intent.loanId&&l.status==='active');
 if(!l){receipt.reason='Matched loan is not active.';s.receipts.push(receipt);return {state:s,status:receipt.reason};}
 const p=TB.submitPayment(s,l.id,{cash:t.cash,hasItems:t.hasItems,itemReference:0,itemDescription:JSON.stringify(t.items),reference:t.reference,recipient,date:t.date});p.source='Verified Torn API completed trade';p.tradeItems=t.items;p.intentId=intent.id;intent.paymentId=p.id;
 if(t.hasItems){receipt.reason='Whole trade held for item valuation and lender acceptance.';intent.status='review';}
 else {try{TB.acceptPayment(s,p.id);intent.status='received';receipt.status='credited';receipt.reason='Exact cash-only payment verified and credited.';}catch(e){receipt.reason=e.message;intent.status='review';}}
 receipt.paymentId=p.id;s.receipts.push(receipt);TB.log(s,'Completed trade checked',t.reference+' / '+receipt.reason);return {state:s,status:receipt.reason};
}
