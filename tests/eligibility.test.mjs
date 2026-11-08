import test from 'node:test';
import assert from 'node:assert/strict';
import TB from '../lib/engine.js';
import {applyAction} from '../lib/operations.js';
import {eligibility} from '../lib/eligibility.js';
test('borrowers cannot forge completion counts or faction levels',()=>{
 const s=TB.newState(),id='9000001';s.bankOnline=true;
 assert.throws(()=>applyAction(s,id,'apply',TB.sampleApp({tier:2,completed:999})),/does not qualify/);
 assert.throws(()=>applyAction(s,id,'apply',TB.sampleApp({lane:'external',product:'bank',tier:3,completed:999})),/does not qualify/);
 assert.throws(()=>applyAction(s,id,'apply',TB.sampleApp({lane:'external',product:'bank',tier:4,piRto:true})),/does not qualify/);
 s.borrowers[id]={completed:1,trust:{tier:1},flags:[],strikes:[]};
 assert.equal(eligibility(s,id,'faction').allowed[1],true);
 assert.equal(eligibility(s,id,'faction').allowed[2],false);
 const out=applyAction(s,id,'apply',TB.sampleApp({lane:'external',product:'bank',tier:1,completed:999,piRto:true}),TB.today(),{networth:600e6,checkedAt:new Date().toISOString()});
 assert.equal(out.applications[0].completed,1);assert.equal(out.applications[0].piRto,false);
});
