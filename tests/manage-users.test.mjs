import test from 'node:test';
import assert from 'node:assert/strict';
import TB from '../lib/engine.js';
import {applyAction,project} from '../lib/operations.js';
import {eligibility} from '../lib/eligibility.js';
import {removalPlan} from '../lib/manage.js';
import {reconcileTrade} from '../lib/trades.js';
const O='3542697',B='4334282',V={networth:1e9,factionMember:true,checkedAt:new Date().toISOString()};
function state(){const s=TB.newState();s.bankOnline=true;TB.topup(s,1e9,'actual incoming funding');return s;}
const act=(s,id,a,p)=>applyAction(s,id,a,p,TB.today(),V);
const app=(extra={})=>({...TB.sampleApp({borrowerId:B,name:'Sillyslaya',tier:0,items:[],cashCollateral:100e6,requested:100e6,...extra}),acceptPreapproval:true});
function status(s,extra={}){return act(s,O,'userStatus',{id:B,reason:'Owner verified test statuses',testParticipant:true,assignedTiers:{faction:0,external:0},piRto:false,oilEligible:false,...extra});}
test('only owner can assign test, VIP and special user statuses',()=>{
 let s=state();for(const id of [B,'2222'])assert.throws(()=>act(s,id,'userStatus',{id:B,reason:'forged'}),/owner/);
 s=status(s,{assignedTiers:{faction:2,external:3},piRto:true,oilEligible:true});const e=eligibility(s,B,'faction');assert.equal(e.assignedTier,2);assert.equal(e.manual,true);assert.equal(e.piRto,true);assert.equal(e.oilEligible,true);
 assert.throws(()=>status(s,{assignedTiers:{external:4},piRto:false}),/Private Island/);
});
test('borrower application detects owner assignments and ignores submitted status claims',()=>{
 let s=status(state(),{assignedTiers:{faction:2,external:3},piRto:true,oilEligible:true});s=act(s,B,'apply',app({tier:2,piRto:false,oilEligible:false}));const a=s.applications[0];assert.equal(a.piRto,true);assert.equal(a.oilEligible,true);assert.equal(a.isTest,true);assert.equal(a.ownerAssignedTier,true);assert.equal(s.loans[0].isTest,true);
 assert.throws(()=>act(s,B,'apply',app({tier:3})),/does not qualify/);
 const live=act(state(),B,'apply',{...app(),isTest:true,oilEligible:true,piRto:true});assert.equal(live.applications[0].isTest,false);assert.equal(live.applications[0].oilEligible,false);
});
test('manually assigned external level overrides completed-loan threshold but not collateral rules',()=>{
 const s=status(state(),{assignedTiers:{external:3}}),a=app({lane:'external',product:'bank',tier:3});const out=act(s,B,'apply',a);assert.equal(out.applications[0].completed,0);assert.equal(out.applications[0].decision.automatic,true);
});
test('test status does not relabel old real loans and ending it does not relabel test loans',()=>{
 let s=act(state(),B,'apply',app());const live=s.loans[0].id;s=status(s);s=act(s,B,'apply',app());const testLoan=s.loans[1].id;
 assert.equal(s.loans.find(l=>l.id===live).isTest,false);assert.equal(s.loans.find(l=>l.id===testLoan).isTest,true);s=act(s,O,'testParticipant',{id:B,enabled:false,reason:'Finished'});assert.equal(s.loans[1].isTest,true);
});
test('archiving real-money test loan preserves ledger, outstanding snapshot and all real loans',()=>{
 let s=act(state(),B,'apply',app());const live=s.loans[0].id;s=status(s);s=act(s,B,'apply',app());const l=s.loans[1];l.collateralConfirmed={source:'Torn API completed trade',reference:'torn-api-trade:99'};s=act(s,B,'confirmTerms',{id:l.id});s=act(s,O,'fund',{id:l.id,reference:'real outgoing test transfer'});
 const plan=removalPlan(s,'testPerson',B);assert.equal(plan.outstanding,100e6);assert.equal(plan.recordedCashOut,100e6);const ledger=JSON.stringify(s.ledger),cash=TB.cash(s,O);
 s=act(s,O,'removeRecords',{kind:'testPerson',id:B,confirm:'REMOVE '+B,reason:'Test complete'});assert.equal(TB.cash(s,O),cash);assert.equal(JSON.stringify(s.ledger),ledger);assert.equal(s.loans.length,1);assert.equal(s.loans[0].id,live);assert.equal(s.recordArchives[0].records.loans[0].id,l.id);assert.equal(project(s,B).state.recordArchives,undefined);
});
test('funded real loans cannot be removed and confirmation is exact',()=>{
 let s=act(state(),B,'apply',app());const l=s.loans[0];l.collateralConfirmed={reference:'real receipt'};s=act(s,B,'confirmTerms',{id:l.id});s=act(s,O,'fund',{id:l.id,reference:'real disbursement'});
 assert.throws(()=>removalPlan(s,'loan',l.id),/Funded real/);assert.throws(()=>act(s,O,'removeRecords',{kind:'allTests',id:'TESTS',confirm:'yes',reason:'test'}),/exact/);
});
test('test repayment and overdue dates do not change real trust, completion or strikes',()=>{
 let s=status(state());s=act(s,B,'apply',app());const l=s.loans[0];l.collateralConfirmed={reference:'actual received test collateral'};s=act(s,B,'confirmTerms',{id:l.id});s=act(s,O,'fund',{id:l.id,reference:'actual test funding'});
 s=act(s,O,'payment',{id:l.id,cash:100e6,date:TB.today(),reference:'actual repayment',recipient:O});s=act(s,O,'acceptPayment',{id:s.pendingPayments[0].id});assert.equal(s.loans[0].status,'repaid');assert.equal(s.borrowers[B].completed,undefined);assert.equal(s.borrowers[B].trust,undefined);
 s.testDate=TB.addDays(TB.today(),100);TB.refreshStrikes(s);assert.equal(s.borrowers[B].strikes.length,0);
});
test('clear all tests keeps real records, funds, statuses and blocks reuse of archived receipts',()=>{
 let s=status(state());s=act(s,B,'apply',app());const l=s.loans[0];s.receipts=[{id:'r',loanId:l.id,reference:'torn-api-trade:123'}];const ledger=JSON.stringify(s.ledger);
 s=act(s,O,'removeRecords',{kind:'allTests',id:'TESTS',confirm:'REMOVE TESTS',reason:'Clean start'});assert.equal(s.loans.length,0);assert.equal(s.applications.length,0);assert.equal(s.borrowers[B].testParticipant,true);assert.equal(JSON.stringify(s.ledger),ledger);
 const t={id:123,completed_at:1,user:{id:Number(O)},trader:{id:Number(B)},items:[]};assert.equal(reconcileTrade(s,O,t).status,'Already recorded');
});
test('pending payment deletion removes linked requests but not money movements',()=>{
 const s=state();s.pendingPayments=[{id:'p',status:'pending',reference:'receipt-p',loanId:'l'}];s.paymentIntents=[{id:'i',status:'review',paymentId:'p'}];const next=act(s,O,'removeRecords',{kind:'payment',id:'p',confirm:'REMOVE p',reason:'Duplicate input'});assert.equal(next.pendingPayments.length,0);assert.equal(next.paymentIntents.length,0);assert.deepEqual(next.ledger,s.ledger);
 s.pendingPayments[0].status='accepted';assert.throws(()=>removalPlan(s,'payment','p'),/Accepted payments/);
});
