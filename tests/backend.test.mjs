import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {handle,validateImport} from '../dist/worker.mjs';
import TB from '../lib/engine.js';
import {digest} from '../server/context.js';
const schema=await readFile(new URL('../migrations/0001_bank.sql',import.meta.url),'utf8');
const OWNER='3542697',BORROWER='1234567',OTHER='7654321';
const keys={['owner'.padEnd(16,'0')]:OWNER,['borrower'.padEnd(16,'0')]:BORROWER,['other'.padEnd(16,'0')]:OTHER};
function db(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(schema);return {sqlite,prepare(sql){let args=[];const statement={bind(...v){args=v;return statement;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};return statement;},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};}
function fixture(){const DB=db();return {DB,ASSETS:{fetch:async()=>new Response('page')}};}
async function call(env,path,{token,body,origin='https://www.torn.com',ip='1.2.3.4',method,extra={}}={}){const headers={origin,'cf-connecting-ip':ip,...extra};if(token)headers.authorization='Bearer '+token;if(body!==undefined){headers['content-type']='application/json';headers['x-tlb-action']='1';}const r=await handle(new Request('https://bank.example/api/'+path,{method:method||(body===undefined?'GET':'POST'),headers,body:body===undefined?undefined:JSON.stringify(body)}),env);return {status:r.status,headers:r.headers,data:await r.json()};}
async function login(env,key='owner',ip='1.2.3.4'){const r=await call(env,'link',{body:{key:key.padEnd(16,'0')},ip});return r;}
const realFetch=globalThis.fetch;
globalThis.fetch=async (url,options)=>{assert.equal(new URL(url).hostname,'api.torn.com');const key=options.headers.Authorization.slice(7),id=keys[key];if(!id)return Response.json({error:{error:'Invalid key'}});if(new URL(url).pathname.endsWith('/money'))return Response.json({money:{wallet:987654321,vault:888888888}});return Response.json({profile:{id:Number(id),name:id===OWNER?'Aaron112293':'Tester',status:{state:'Okay'},faction_id:1}});};
test.after(()=>{globalThis.fetch=realFetch;});
test('anonymous and forged platform headers cannot read the bank',async()=>{const e=fixture();assert.equal((await call(e,'bank',{extra:{'oai-authenticated-user-id':OWNER}})).status,401);});
test('owner login uses Torn identity, stores only token digest, and no API key',async()=>{const e=fixture(),r=await login(e);assert.equal(r.status,200);const t=r.data.token;assert.match(t,/^[a-f0-9]{64}$/);const session=e.DB.sqlite.prepare('SELECT * FROM sessions').get();assert.equal(session.token_hash,await digest(t));assert.notEqual(session.token_hash,t);assert.equal((await call(e,'bank',{token:t})).data.role,'owner');const dump=['identities','sessions','bank_state','api_limits'].map(n=>e.DB.sqlite.prepare('SELECT * FROM '+n).all());assert.ok(!JSON.stringify(dump).includes('owner'.padEnd(16,'0')));});
test('uninvited accounts cannot sign in; owner can invite a tester',async()=>{const e=fixture();assert.equal((await login(e,'borrower')).status,403);const owner=(await login(e)).data.token;assert.equal((await call(e,'access',{token:owner,body:{action:'invite',id:BORROWER}})).status,200);const borrower=(await login(e,'borrower')).data.token;const view=await call(e,'bank',{token:borrower});assert.equal(view.data.role,'borrower');assert.deepEqual(view.data.state.ledger,[]);assert.equal((await call(e,'access',{token:borrower})).status,403);});
test('revoking invitation blocks an existing session immediately',async()=>{const e=fixture(),o=(await login(e)).data.token;await call(e,'access',{token:o,body:{action:'invite',id:BORROWER}});const b=(await login(e,'borrower')).data.token;await call(e,'access',{token:o,body:{action:'revoke',id:BORROWER}});assert.equal((await call(e,'bank',{token:b})).status,401);});
test('new login rotates old session and logout revokes the new one',async()=>{const e=fixture(),first=(await login(e)).data.token,second=(await login(e)).data.token;assert.equal((await call(e,'bank',{token:first})).status,401);assert.equal((await call(e,'logout',{token:second,body:{}})).status,200);assert.equal((await call(e,'bank',{token:second})).status,401);});
test('expired session cannot read records',async()=>{const e=fixture(),t=(await login(e)).data.token;e.DB.sqlite.exec('UPDATE sessions SET expires_at=0');assert.equal((await call(e,'bank',{token:t})).status,401);});
test('cross-origin controls allow Torn and reject unexpected origins',async()=>{const e=fixture();const r=await call(e,'health');assert.equal(r.headers.get('access-control-allow-origin'),'https://www.torn.com');assert.equal((await call(e,'health',{origin:'https://attacker.example'})).status,403);});
test('login rate limit applies before Torn API requests',async()=>{const e=fixture();for(let i=0;i<5;i++)await login(e);assert.equal((await login(e)).status,429);});
test('borrower cannot change program rules or lift a restriction',async()=>{const e=fixture(),o=(await login(e)).data.token;await call(e,'access',{token:o,body:{action:'invite',id:BORROWER}});const b=(await login(e,'borrower')).data.token,v=(await call(e,'bank',{token:b})).data;for(const action of ['rules','lift']){const r=await call(e,'bank',{token:b,body:{action,payload:{rules:v.state.rules,borrowerId:BORROWER},revision:v.state.revision,requestId:action}});assert.equal(r.status,400);assert.match(r.data.error,/owner/i);}});
test('stale saves are rejected and repeated request IDs do not duplicate funding',async()=>{const e=fixture(),t=(await login(e)).data.token,s=(await call(e,'bank',{token:t})).data.state;const data={action:'topup',payload:{amount:1000000,reference:'TEST RECEIPT'},revision:s.revision,requestId:'same-request'};assert.equal((await call(e,'bank',{token:t,body:data})).status,200);const retry=await call(e,'bank',{token:t,body:data});assert.equal(retry.data.state.ledger.length,1);assert.equal((await call(e,'bank',{token:t,body:{...data,requestId:'new-request'}})).status,409);});
test('owner migration imports once into an empty bank and preserves ledger',async()=>{const e=fixture(),t=(await login(e)).data.token;await call(e,'bank',{token:t});const s=TB.newState();TB.topup(s,1000000,'Earlier recorded funds');const backup={role:'owner',user:{id:OWNER},state:s};const first=await call(e,'import',{token:t,body:{confirm:'IMPORT',export:backup}});assert.equal(first.status,200,first.data.error);assert.equal((await call(e,'bank',{token:t})).data.state.ledger.length,1);assert.equal((await call(e,'import',{token:t,body:{confirm:'IMPORT',export:backup}})).status,400);});
test('import rejects a changed owner',()=>{const s=TB.newState();s.staff[0].id=OTHER;assert.throws(()=>validateImport(s),/owner/);});
test('an empty check key returns the reported 400 shape without ending the bank session',async()=>{
 const e=fixture(),token=(await login(e)).data.token;
 const result=await call(e,'check',{token,body:{key:'',id:OWNER}});
 assert.equal(result.status,400);
 assert.deepEqual(result.data,{error:'Enter a valid 16-character Torn API key.'});
 assert.equal(JSON.stringify(result.data).length,52);
 assert.equal((await call(e,'bank',{token})).status,200);
});
test('owner beta invitations use only the bank session, persist once and appear in the access list',async()=>{
 const e=fixture(),token=(await login(e)).data.token;
 for(let i=0;i<2;i++)assert.equal((await call(e,'access',{token,body:{action:'invite',id:BORROWER}})).status,200);
 const list=await call(e,'access',{token});
 assert.equal(list.status,200);assert.equal(list.data.members.length,1);assert.equal(list.data.members[0].torn_id,BORROWER);
 const signedIn=await login(e,'borrower');assert.equal(signedIn.status,200);
 assert.equal((await call(e,'bank',{token:signedIn.data.token})).data.role,'borrower');
 assert.equal((await call(e,'access',{token:signedIn.data.token,body:{action:'invite',id:OTHER}})).status,403);
});
test('invalid beta invitation IDs cannot grant access',async()=>{
 const e=fixture(),token=(await login(e)).data.token;
 for(const id of ['', 'Tester', '0', '12345678901'])assert.equal((await call(e,'access',{token,body:{action:'invite',id}})).status,400);
 assert.deepEqual((await call(e,'access',{token})).data.members,[]);
});
test('borrower requests persist across reloads and lender decisions reach the borrower without a Torn key',async()=>{
 const e=fixture(),owner=(await login(e)).data.token;
 await call(e,'access',{token:owner,body:{action:'invite',id:BORROWER}});
 const borrower=(await login(e,'borrower')).data.token;
 const s=(await call(e,'bank',{token:owner})).data.state,today=TB.today(),maturity=TB.addDays(today,60);
 s.loans=[{id:'request-flow-loan',borrowerId:BORROWER,name:'Tester',product:'bank',principal:100e6,rate:.005,freeDays:0,start:today,maturity,status:'active',payments:[],extensions:[],rules:TB.clone(s.rules),issuer:OWNER}];
 TB.person(s,BORROWER);
 e.DB.sqlite.prepare('UPDATE bank_state SET data=? WHERE id=?').run(JSON.stringify(s),'main');
 let sequence=0;
 async function save(token,action,payload){
  const revision=(await call(e,'bank',{token})).data.state.revision;
  const r=await call(e,'bank',{token,body:{action,payload,revision,requestId:'request-flow-'+(++sequence)}});
  assert.equal(r.status,200,r.data.error);return r.data.state;
 }
 await save(borrower,'paymentIntent',{id:'request-flow-loan',amount:10e6,recipient:OWNER});
 await save(borrower,'requestExtension',{id:'request-flow-loan',originalDue:maturity,until:TB.addDays(maturity,7),reason:'Requested extra time'});
 const visible=(await call(e,'bank',{token:owner})).data.state;
 assert.equal(visible.paymentIntents.length,1);assert.equal(visible.extensionRequests.length,1);
 assert.equal(visible.loans[0].payments.length,0);assert.equal(visible.loans[0].extensions.length,0);
 const reviewed=await save(owner,'payment',{id:'request-flow-loan',intentId:visible.paymentIntents[0].id,cash:10e6,recipient:OWNER,date:today,reference:'VERIFIED-TEST-RECEIPT'});
 await save(owner,'acceptPayment',{id:reviewed.pendingPayments[0].id});
 await save(owner,'extensionDecision',{id:visible.extensionRequests[0].id,approve:true,reason:'Approved by lender'});
 const final=(await call(e,'bank',{token:borrower})).data.state;
 assert.equal(final.paymentIntents[0].status,'received');assert.equal(final.pendingPayments[0].status,'accepted');
 assert.equal(final.extensionRequests[0].status,'approved');assert.equal(final.loans[0].extensions[0].until,TB.addDays(maturity,7));
 assert.equal(TB.balance(final.loans[0],today).total,90e6);
});

test('bank reset requires owner, exact confirmation and current revision; retries cannot erase later writes',async()=>{
 const e=fixture(),o=(await login(e)).data.token;
 await call(e,'access',{token:o,body:{action:'invite',id:BORROWER}});
 const b=(await login(e,'borrower')).data.token;
 const send=async(token,action,payload,requestId,revision)=>call(e,'bank',{token,body:{action,payload,requestId,revision}});
 let s=(await call(e,'bank',{token:o})).data.state;
 let r=await send(o,'topup',{amount:1000,reference:'test funding'},'fund1',s.revision);s=r.data.state;
 assert.equal((await send(b,'resetBank',{confirm:'RESET BANK'},'bad-role',s.revision)).status,400);
 assert.equal((await send(o,'resetBank',{confirm:'RESET'},'bad-confirm',s.revision)).status,400);
 assert.equal((await send(o,'resetBank',{confirm:'RESET BANK'},'stale',s.revision-1)).status,409);
 assert.equal((await call(e,'bank',{token:o})).data.state.ledger.length,1);
 r=await send(o,'resetBank',{confirm:'RESET BANK'},'reset-once',s.revision);assert.equal(r.status,200,r.data.error);s=r.data.state;
 for(const key of ['loans','applications','ledger','transfers','pendingPayments','paymentIntents','extensionRequests','collateral','receipts'])assert.deepEqual(s[key],[]);
 assert.equal(s.staff.length,1);assert.equal(s.staff[0].id,OWNER);assert.equal(s.bankOnline,false);assert.equal(s.audit[0].event,'Bank records reset');
 assert.equal((await call(e,'bank',{token:b})).status,200);
 r=await send(o,'topup',{amount:2000,reference:'new funding'},'fund2',s.revision);s=r.data.state;
 r=await send(o,'resetBank',{confirm:'RESET BANK'},'reset-once',s.revision);assert.equal(r.status,200);assert.equal(r.data.state.ledger.length,1);
});

test('application API ignores forged net worth, identity and eligibility and persists its reference',async()=>{
 const e=fixture(),owner=(await login(e)).data.token;
 await call(e,'access',{token:owner,body:{action:'invite',id:BORROWER}});const borrower=(await login(e,'borrower')).data.token;
 const s=(await call(e,'bank',{token:owner})).data.state;s.bankOnline=true;TB.topup(s,1e9,'test funding');
 e.DB.sqlite.prepare('UPDATE bank_state SET data=? WHERE id=?').run(JSON.stringify(s),'main');
 const profile={id:Number(BORROWER),name:'Tester',networth:1e9,faction_id:1,checkedAt:new Date().toISOString()};e.DB.sqlite.prepare('UPDATE identities SET profile=? WHERE torn_id=?').run(JSON.stringify(profile),BORROWER);
 async function save(action,payload,requestId){const rev=(await call(e,'bank',{token:borrower})).data.state.revision;return call(e,'bank',{token:borrower,body:{action,payload,requestId,revision:rev}});}
 const draft=await save('startApplication',{},'begin');assert.equal(draft.status,200);const d=draft.data.state.applicationDrafts[0];
 const body={...TB.sampleApp({id:d.id,borrowerId:OTHER,name:'Forged',tier:0,networth:999e9,requested:100e6,cashCollateral:100e6,items:[]}),acceptPreapproval:true};
 const result=await save('apply',body,'submit');assert.equal(result.status,200,result.data.error);
 const a=result.data.state.applications[0];assert.equal(a.networth,1e9);assert.equal(a.borrowerId,BORROWER);assert.equal(a.name,'Tester');assert.equal(a.reference,d.reference);assert.equal(a.decision.automatic,true);assert.equal(result.data.state.loans[0].status,'approved');
 const retry=await save('apply',body,'submit');assert.equal(retry.data.state.loans.length,1);
});
test('staff cash API saves only own wallet and never exposes owner wallet to vault or borrower',async()=>{
 const e=fixture(),owner=(await login(e)).data.token;await call(e,'access',{token:owner,body:{action:'invite',id:BORROWER}});const borrower=(await login(e,'borrower')).data.token;
 const s=(await call(e,'bank',{token:owner})).data.state;s.staff.push({id:OTHER,role:'vault',name:'Vault',available:false});e.DB.sqlite.prepare('UPDATE bank_state SET data=? WHERE id=?').run(JSON.stringify(s),'main');
 const vault=(await login(e,'other')).data.token;
 const checked=await call(e,'staff-cash',{token:owner,body:{key:'owner'.padEnd(16,'0'),id:OTHER}});assert.equal(checked.status,200,checked.data.error);assert.equal(checked.data.state.staff[0].verifiedCash.amount,987654321);assert.equal(checked.data.state.staff[1].verifiedCash,undefined);
 const v=await call(e,'bank',{token:vault});assert.ok(!JSON.stringify(v.data).includes('987654321'));
 const b=await call(e,'bank',{token:borrower});assert.ok(!JSON.stringify(b.data).includes('987654321'));
 assert.equal((await call(e,'staff-cash',{token:borrower,body:{key:'borrower'.padEnd(16,'0')}})).status,403);
 assert.equal((await call(e,'staff-cash',{token:vault,body:{key:'owner'.padEnd(16,'0')}})).status,400);
});

test('every beta invitation supplies a user card before applying and gains verified name after login',async()=>{
 const e=fixture(),owner=(await login(e)).data.token;await call(e,'access',{token:owner,body:{action:'invite',id:BORROWER}});
 let members=(await call(e,'access',{token:owner})).data.members;assert.equal(members.length,1);assert.equal(members[0].torn_id,BORROWER);assert.equal(members[0].name,null);
 await login(e,'borrower');members=(await call(e,'access',{token:owner})).data.members;assert.equal(members[0].name,'Tester');assert.equal((await call(e,'bank',{token:owner})).data.state.applications.length,0);
 const s=(await call(e,'bank',{token:owner})).data.state;const assigned=await call(e,'bank',{token:owner,body:{action:'userStatus',payload:{id:BORROWER,testParticipant:true,assignedTiers:{faction:1},oilEligible:true,piRto:true,reason:'Beta participant setup'},revision:s.revision,requestId:'beta-user-card'}});assert.equal(assigned.status,200,assigned.data.error);assert.equal(assigned.data.state.borrowers[BORROWER].testParticipant,true);
});
