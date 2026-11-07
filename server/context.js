import TB from '../lib/engine.js';
import {project, role} from '../lib/operations.js';
export const OWNER_ID = '3542697';
export const SESSION_MS = 12 * 60 * 60 * 1000;
export function fail(message,status=400){const error=new Error(message);error.status=status;throw error;}
export async function digest(value){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');}
export function token(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');}
export function createServer(env){
 function database(){if(!env.DB)fail('The bank database is not connected.',503);return env.DB;}
 function response(data,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
 async function body(req){
  if(!req.headers.get('content-type')?.startsWith('application/json')||req.headers.get('x-tlb-action')!=='1')fail('Use the bank application to submit this request.');
  const reader=req.body?.getReader();if(!reader)fail('Request body missing.');const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1500000){await reader.cancel();fail('Request is too large.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail('Invalid JSON request.');}
 }
 async function loadState(){let row=await database().prepare('SELECT data,revision FROM bank_state WHERE id = ?').bind('main').first();if(!row){const s=TB.newState();s.processedRequests=[];s.extensionRequests=[];s.paymentIntents=[];s.receipts=[];await database().prepare('INSERT OR IGNORE INTO bank_state (id,data,revision) VALUES (?,?,0)').bind('main',JSON.stringify(s)).run();row=await database().prepare('SELECT data,revision FROM bank_state WHERE id = ?').bind('main').first();}const s=JSON.parse(row.data);s.revision=row.revision;s.testDate=TB.today();return s;}
 async function saveState(s,expected){const serialized=JSON.stringify({...s,revision:expected+1});if(new TextEncoder().encode(serialized).length>1500000)fail('Export and archive bank history before adding more records.');const r=await database().prepare('UPDATE bank_state SET data = ?, revision = revision + 1 WHERE id = ? AND revision = ?').bind(serialized,'main',expected).run();if(r.meta.changes!==1)fail('Another person updated the bank. Refresh and review the latest balances before retrying.',409);s.revision=expected+1;}
 async function allowed(id){if(id===OWNER_ID)return true;const s=await loadState();if(role(s,id)!=='borrower')return true;return !!(await database().prepare('SELECT torn_id FROM allowed_members WHERE torn_id=?').bind(id).first());}
 async function identity(req){
  const auth=req.headers.get('authorization')||'';if(!/^Bearer [a-f0-9]{64}$/.test(auth))fail('Verify your Torn account to sign in.',401);
  const hash=await digest(auth.slice(7));const session=await database().prepare('SELECT torn_id,expires_at FROM sessions WHERE token_hash=?').bind(hash).first();
  if(!session||session.expires_at<=Date.now())fail('Your session ended. Verify your Torn account again.',401);
  if(!await allowed(session.torn_id))fail('The owner has not enabled bank access for this Torn account.',403);
  const user=await database().prepare('SELECT torn_id,name,profile,verified_at FROM identities WHERE id = ?').bind('torn:'+session.torn_id).first();
  if(!user)fail('Verify your Torn account again.',401);
  return {...user,platformId:'torn:'+user.torn_id,profile:JSON.parse(user.profile),sessionHash:hash};
 }
 function view(s,u){const result=project(s,u.torn_id);delete result.state.processedRequests;return {...result,user:{id:u.torn_id,name:u.name,profile:u.profile,verifiedAt:u.verified_at}};}
 async function rateLimit(id,max=12){const bucket=Math.floor(Date.now()/60000);const row=await database().prepare('INSERT INTO api_limits (id,bucket,count) VALUES (?,?,1) ON CONFLICT(id) DO UPDATE SET bucket=excluded.bucket,count=CASE WHEN api_limits.bucket=excluded.bucket THEN api_limits.count+1 ELSE 1 END RETURNING count').bind(id,bucket).first();if(row.count>max)fail('Please wait one minute before making more requests.',429);}
 async function torn(key,path){if(!/^[a-zA-Z0-9]{16}$/.test(key||''))fail('Enter a valid 16-character Torn API key.');const u=new URL('https://api.torn.com/v2/'+path);u.searchParams.set('comment','TornLendingBank');const r=await fetch(u,{headers:{Authorization:'ApiKey '+key,Accept:'application/json'},signal:AbortSignal.timeout(15000)});if(!r.ok)fail('Torn API is unavailable. Try again later.',502);const data=await r.json();if(data.error)fail('Torn API: '+TB.text(data.error.error||data.error.message||'access denied',180));return data;}
 async function ownKey(key,id){const b=await torn(key,'user/basic');if(String(b.profile?.id)!==id)fail('Use the API key belonging to your connected Torn account.');return b;}
 function flagConfirmedProfile(s,profile,actorId){if(profile.status?.state!=='Federal')return false;const target=String(profile.id),p=TB.person(s,target),signature=JSON.stringify([profile.status.description,profile.status.details,profile.status.until]);if(p.flags.some(f=>f.cause==='ban'&&f.signature===signature))return false;s.actorId=actorId;s.testDate=TB.today();p.flags.push({id:TB.uid('FLAG'),cause:'ban',signature,reason:'Torn API reports Federal: '+TB.text(profile.status.description,300),created:TB.today(),checkedAt:new Date().toISOString()});TB.log(s,'Confirmed Torn ban',target);return true;}
 return {database,response,body,loadState,saveState,allowed,identity,view,rateLimit,torn,ownKey,flagConfirmedProfile};
}
