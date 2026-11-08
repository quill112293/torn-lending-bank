import test from 'node:test';
import assert from 'node:assert/strict';
import TB from '../lib/engine.js';
import {applyAction,project} from '../lib/operations.js';
import {verifyCollateral} from '../lib/collateral-proof.js';
const owner='3542697',borrower='9000001';
const verified={networth:1e9,factionMember:true,checkedAt:new Date().toISOString()};
function base(){const s=TB.newState();s.bankOnline=true;TB.topup(s,1e9,'initial');return s;}
function input(overrides={}){return {...TB.sampleApp({tier:0,items:[],cashCollateral:100e6,requested:100e6,...overrides}),acceptPreapproval:true};}
function apply(s,a=input(),who=borrower,v=verified){return applyAction(s,who,'apply',a,TB.today(),v);}
function trade(s,id=123,cash=100e6){return {id,completed_at:Math.ceil(Date.parse(s.applications[0].created)/1000)+1,user:{id:Number(owner)},trader:{id:Number(borrower)},items:[{user_id:Number(borrower),type:'Money',details:{amount:cash}}]};}
test('reference is reserved once and retained through submit, edit, notes and loan',()=>{
 let s=applyAction(base(),borrower,'startApplication',{});const d=s.applicationDrafts[0];assert.match(d.reference,/^TLB-[A-F0-9]{12}$/);
 s=applyAction(s,borrower,'startApplication',{});assert.equal(s.applicationDrafts.length,1);
 s=apply(s,{...input(),id:d.id});assert.equal(s.applications[0].reference,d.reference);assert.equal(s.loans[0].reference,d.reference);assert.equal(s.applicationDrafts.length,0);
 s=applyAction(s,borrower,'applicationNote',{id:d.id,note:'Please confirm receipt'});s=applyAction(s,owner,'applicationNote',{id:d.id,note:'Reviewing'});assert.equal(s.applications[0].notes.length,2);
 assert.throws(()=>applyAction(s,'8000000','applicationNote',{id:d.id,note:'bad'}),/not accessible/);
});
test('automatic cash approval uses verified net worth and cannot fund until Torn receipt and terms',()=>{
 let s=apply(base(),input({networth:999e9}));const a=s.applications[0],l=s.loans[0];assert.equal(a.networth,1e9);assert.equal(a.decision.automatic,true);assert.equal(l.status,'approved');assert.equal(TB.cash(s,owner),1e9);assert.equal(TB.spendable(s,owner),900e6);
 assert.throws(()=>applyAction(s,owner,'fund',{id:l.id,reference:'sent'}),/collateral/);
 assert.throws(()=>applyAction(s,owner,'confirmCollateral',{id:l.id,amount:100e6,reference:'fake'}),/Unknown/);
 verifyCollateral(s,owner,l.id,trade(s));assert.equal(TB.cash(s,owner),1e9);assert.equal(s.loans[0].collateralConfirmed.source,'Torn API completed trade');
 assert.throws(()=>applyAction(s,owner,'fund',{id:l.id,reference:'sent'}),/confirmation/);
 s=applyAction(s,borrower,'confirmTerms',{id:l.id});s=applyAction(s,owner,'fund',{id:l.id,reference:'completed outgoing transfer'});assert.equal(s.loans[0].status,'active');assert.equal(TB.cash(s,owner),900e6);
});
test('items, excess request, missing acceptance, missing funds and restrictions never auto approve',()=>{
 for(const a of [input({items:[{name:'Item',qty:1,reference:90e6}]}),input({requested:250e6}),{...input(),acceptPreapproval:false}]){const s=apply(base(),a);assert.equal(s.loans.length,0);assert.equal(s.applications[0].status,'pending');}
 const empty=base();empty.ledger=[];assert.equal(apply(empty).loans.length,0);
 const red=base();TB.person(red,borrower).flags.push({id:'blocked'});assert.equal(apply(red).loans.length,0);
 assert.throws(()=>apply(base(),input(),borrower,null),/verified net worth/);
});
test('offline pauses new applications but permits existing notes',()=>{
 let s=apply(base());s=applyAction(s,owner,'bankStatus',{online:false});assert.throws(()=>apply(s),/offline/);assert.throws(()=>applyAction(s,borrower,'startApplication',{}),/offline/);s=applyAction(s,borrower,'applicationNote',{id:s.applications[0].id,note:'Existing loan question'});assert.equal(s.applications[0].notes.length,1);
});
test('manual changes preserve reference, original request and notes; changed amount needs acceptance',()=>{
 let s=apply(base(),input({requested:250e6}));const a=s.applications[0];s=applyAction(s,borrower,'applicationNote',{id:a.id,note:'Need 250m'});
 s=applyAction(s,owner,'editApplication',{id:a.id,application:{...a,cashCollateral:250e6}});assert.equal(s.applications[0].reference,a.reference);assert.equal(s.applications[0].originalRequested,250e6);assert.equal(s.applications[0].notes.length,1);
 s=applyAction(s,owner,'approve',{id:a.id,amount:200e6,reason:'Offer 200m',checks:true});assert.equal(s.loans[0].principal,200e6);assert.equal(s.loans[0].borrowerConfirmed,undefined);
});
test('cash snapshots obey owner/vault/staff/borrower privacy including serialization',()=>{
 const s=base();s.staff.push({id:'2',role:'vault',name:'Vault'},{id:'3',role:'staff',name:'Staff'},{id:'4',role:'staff',name:'Other'});
 s.staff.forEach((p,i)=>{p.verifiedCash={amount:123456789+i,checkedAt:'now'};p.lendingAllocation=20e6;});
 for(const [id,visible] of [[owner,[owner,'2','3','4']],['2',['2','3','4']],['3',['3']],[borrower,[]]]){const out=project(s,id);assert.deepEqual(out.state.staff.filter(p=>p.verifiedCash).map(p=>p.id),visible);for(const p of s.staff.filter(p=>!visible.includes(p.id)))assert.ok(!JSON.stringify(out).includes(String(p.verifiedCash.amount)));}
 assert.equal(project(s,borrower).state.staff[0].lendingAllocation,20e6);assert.equal(project(s,borrower).state.ledger.length,0);
 assert.throws(()=>applyAction(s,'2','allocation',{id:'2',amount:1e9}),/owner/);
});
test('Torn collateral rejects wrong sender, items, outgoing money, underpayment, old and reused trades',()=>{
 const s=apply(base()),l=s.loans[0],t=trade(s);
 assert.throws(()=>verifyCollateral(TB.clone(s),owner,l.id,{...t,trader:{id:999}}),/participant|borrower/);
 assert.throws(()=>verifyCollateral(TB.clone(s),owner,l.id,{...t,items:[...t.items,{user_id:Number(borrower),type:'Item',details:{amount:1}}]}),/cash-only/);
 assert.throws(()=>verifyCollateral(TB.clone(s),owner,l.id,{...t,items:[...t.items,{user_id:Number(owner),type:'Money',details:{amount:1}}]}),/cash-only/);
 assert.throws(()=>verifyCollateral(TB.clone(s),owner,l.id,trade(s,1,1)),/cover/);
 assert.throws(()=>verifyCollateral(TB.clone(s),owner,l.id,{...t,completed_at:1}),/after/);
 s.receipts=[{reference:'torn-api-trade:123'}];assert.throws(()=>verifyCollateral(s,owner,l.id,t),/already/);
});
