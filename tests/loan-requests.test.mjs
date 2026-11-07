import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import TB from '../lib/engine.js';
import {applyAction,project} from '../lib/operations.js';

const built=await build({entryPoints:['src/LoanRequests.tsx'],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic'});
const {default:LoanRequests}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const owner='3542697',borrower='1234567',today='2026-11-07';
function state(){const s=TB.newState();s.loans=[{id:'loan',borrowerId:borrower,name:'Tester',product:'bank',principal:100e6,rate:.005,freeDays:0,start:today,maturity:'2027-01-06',status:'active',payments:[],extensions:[],rules:TB.clone(s.rules),issuer:owner}];return s;}
function requested(){let s=applyAction(state(),borrower,'paymentIntent',{id:'loan',amount:10e6,recipient:owner},today);return applyAction(s,borrower,'requestExtension',{id:'loan',originalDue:'2027-01-06',until:'2027-01-13',reason:'More time needed'},today);}
const render=(s,isStaff,loanId)=>renderToStaticMarkup(React.createElement(LoanRequests,{state:s,isStaff,loanId,staffName:id=>id,onRecord:()=>{},onReviewPayment:()=>{},onReviewExtension:()=>{}}));

test('saved borrower payment and extension requests are visible on the selected loan',()=>{
 const s=project(requested(),borrower,today).state,html=render(s,false,'loan');
 assert.match(html,/\$10,000,000/);assert.match(html,/More time needed/);assert.match(html,/Awaiting lender review/);
 assert.doesNotMatch(html,/<button/);
 assert.equal(TB.balance(s.loans[0],today).total,100e6);assert.equal(s.loans[0].extensions.length,0);
});

test('lender sees both saved request types and review controls on the list and selected loan',()=>{
 for(const loanId of [undefined,'loan']){
  const html=render(requested(),true,loanId);
  assert.match(html,/Record received payment/);assert.match(html,/Review extension/);
  assert.match(html,/\$10,000,000/);assert.match(html,/2027-01-13/);
 }
 assert.doesNotMatch(render(requested(),true,'other-loan'),/More time needed|\$10,000,000/);
});

test('a payment request moves through receipt review to accepted payment exactly once',()=>{
 let s=requested();const intentId=s.paymentIntents[0].id;
 s=applyAction(s,owner,'payment',{id:'loan',intentId,cash:10e6,recipient:owner,date:today,reference:'TEST-RECEIPT-1'},today);
 assert.equal(s.paymentIntents[0].status,'review');assert.equal(s.loans[0].payments.length,0);
 assert.match(render(s,true,'loan'),/Review payment/);
 assert.doesNotMatch(render(s,true,'loan'),/Record received payment/);
 assert.throws(()=>applyAction(s,owner,'payment',{id:'loan',intentId,cash:10e6,recipient:owner,date:today,reference:'TEST-RECEIPT-2'},today),/pending payment request/);
 const paymentId=s.pendingPayments[0].id;
 s=applyAction(s,owner,'acceptPayment',{id:paymentId},today);
 assert.equal(s.paymentIntents[0].status,'received');assert.equal(TB.balance(s.loans[0],today).total,90e6);
 assert.match(render(project(s,borrower,today).state,false,'loan'),/Payment received/);
 assert.throws(()=>applyAction(s,owner,'acceptPayment',{id:paymentId},today),/not pending/);
});

test('rejected receipt returns its payment request to awaiting verification without credit',()=>{
 let s=requested();const intentId=s.paymentIntents[0].id;
 s=applyAction(s,owner,'payment',{id:'loan',intentId,cash:10e6,recipient:owner,date:today,reference:'TEST-REJECT'},today);
 s=applyAction(s,owner,'rejectPayment',{id:s.pendingPayments[0].id,reason:'Receipt not confirmed'},today);
 assert.equal(s.paymentIntents[0].status,'pending');assert.equal(s.paymentIntents[0].paymentId,undefined);
 assert.equal(TB.balance(s.loans[0],today).total,100e6);
 assert.match(render(s,true,'loan'),/Record received payment/);
});

test('only a lender can resolve borrower requests; results remain visible to the borrower',()=>{
 let s=requested();const id=s.extensionRequests[0].id;
 assert.throws(()=>applyAction(s,borrower,'extensionDecision',{id,approve:true},today),/Staff permission/);
 assert.throws(()=>applyAction(s,'7654321','paymentIntent',{id:'loan',amount:1e6,recipient:owner},today),/not accessible/);
 assert.throws(()=>applyAction(s,owner,'payment',{id:'loan',intentId:s.paymentIntents[0].id,cash:10e6,recipient:'7654321',reference:'WRONG'},today),/receiving lender/);
 s=applyAction(s,owner,'extensionDecision',{id,approve:true,reason:'Approved for seven days'},today);
 assert.equal(s.loans[0].extensions[0].until,'2027-01-13');
 const html=render(project(s,borrower,today).state,false,'loan');
 assert.match(html,/Extension approved/);assert.match(html,/Approved for seven days/);
 assert.throws(()=>applyAction(s,owner,'extensionDecision',{id,approve:true},today),/not pending/);
});
