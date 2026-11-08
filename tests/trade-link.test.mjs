import test from 'node:test';
import assert from 'node:assert/strict';
import TB from '../lib/engine.js';
import {linkRepayment,repaymentParties} from '../lib/trade-link.js';
import {reconcileTrade} from '../lib/trades.js';
function fixture(){const s=TB.seed(TB.newState()),l=s.loans[0],recipient='9000102';const trade={id:990,user:{id:Number(recipient)},trader:{id:Number(l.borrowerId)},completed_at:Math.floor(Date.now()/1000),items:[{user_id:Number(l.borrowerId),type:'Money',details:{amount:10e6}}]};return {s,l,recipient,trade};}
test('linked trades use actual API amount without a borrower amount declaration',()=>{
 let {s,l,recipient,trade}=fixture();linkRepayment(s,l.borrowerId,l.id,trade);s=reconcileTrade(s,recipient,trade).state;
 assert.equal(s.loans[0].payments[0].credited,10e6);assert.equal(s.paymentIntents[0].amount,10e6);
 assert.equal(reconcileTrade(s,recipient,trade).state.loans[0].payments.length,1);
});
test('trade linkage refuses another borrower, unrelated lender and reassignment',()=>{
 const {s,l,recipient,trade}=fixture();assert.throws(()=>repaymentParties(s,'1234',l.id,trade),/accessible/);
 assert.throws(()=>repaymentParties(s,'3542697',l.id,trade),/involve/);
 linkRepayment(s,l.borrowerId,l.id,trade);assert.equal(s.paymentIntents.length,1);linkRepayment(s,l.borrowerId,l.id,trade);assert.equal(s.paymentIntents.length,1);
 s.loans.push({...l,id:'second'});assert.throws(()=>linkRepayment(s,l.borrowerId,'second',trade),/another loan/);
});
test('incomplete, mixed, two-way and excess trades do not auto-credit',()=>{
 for(const mode of ['incomplete','items','two-way','excess']){
  const {s,l,recipient,trade}=fixture();
  if(mode==='incomplete')trade.completed_at=null;
  if(mode==='items')trade.items.push({user_id:Number(l.borrowerId),type:'Item',details:{id:206,amount:1}});
  if(mode==='two-way')trade.items.push({user_id:Number(recipient),type:'Money',details:{amount:1}});
  if(mode==='excess')trade.items[0].details.amount=1e10;
  linkRepayment(s,l.borrowerId,l.id,trade);
  if(mode==='incomplete')assert.throws(()=>reconcileTrade(s,recipient,trade),/completed/);
  else assert.equal(reconcileTrade(s,recipient,trade).state.loans[0].payments.length,0,mode);
 }
});
