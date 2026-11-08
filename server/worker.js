import TB from '../lib/engine.js';
import {role} from '../lib/operations.js';
import {createServer,OWNER_ID,SESSION_MS,digest,token,fail} from './context.js';
import {route as bank} from '../routes/bank.ts';
import {route as check} from '../routes/check.ts';
import {route as trades} from '../routes/trades.ts';
import {route as market} from '../routes/market.ts';
import {route as staffCash} from '../routes/staff-cash.ts';
import {route as collateralCheck} from '../routes/collateral-check.ts';
const routes={bank,check,trades,market,'staff-cash':staffCash,'collateral-check':collateralCheck};
const origins=new Set(['https://www.torn.com','https://torn.com']);
export function allowedOrigin(request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin||origins.has(origin);}
export async function handle(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
 const origin=request.headers.get('origin');
 if(!allowedOrigin(request))return Response.json({error:'This origin is not allowed.'},{status:403});
 let result;const srv=createServer(env);const {database,response,body,identity,rateLimit,loadState,saveState,allowed,torn,flagConfirmedProfile}=srv;
 try{
  if(request.method==='OPTIONS')result=new Response(null,{status:204});
  else if(path==='/api/health'&&request.method==='GET')result=response({ok:true,version:'1.1.0-beta.19'});
  else if(path==='/api/link'&&request.method==='POST'){
   const ip=request.headers.get('cf-connecting-ip')||'local';await rateLimit('login:'+await digest(ip),5);
   const a=await body(request);const p=(await torn(a.key,'user/profile')).profile;
   if(!p?.id||!p?.name)fail('Torn did not return a usable profile.');const id=String(p.id);
   if(!await allowed(id))fail('This private beta needs an invitation from Aaron112293 [3542697].',403);
   const stamp=new Date().toISOString(),slim={id:p.id,name:p.name,faction_id:p.faction_id,status:p.status,checkedAt:stamp};
   await database().prepare('INSERT INTO identities (id,torn_id,name,profile,verified_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,profile=excluded.profile,verified_at=excluded.verified_at').bind('torn:'+id,id,p.name,JSON.stringify(slim),stamp).run();
   const s=await loadState();if(flagConfirmedProfile(s,p,id))await saveState(s,s.revision);
   const bearer=token(),expires=Date.now()+SESSION_MS;
   // Rotate this account's login; store only a digest of the new session token.
   await database().batch([database().prepare('DELETE FROM sessions WHERE torn_id=? OR expires_at<=?').bind(id,Date.now()),database().prepare('INSERT INTO sessions(token_hash,torn_id,expires_at) VALUES(?,?,?)').bind(await digest(bearer),id,expires)]);
   result=response({ok:true,id:p.id,name:p.name,token:bearer,expiresAt:expires});
  }else if(path==='/api/logout'&&request.method==='POST'){
   const u=await identity(request);await body(request);await database().prepare('DELETE FROM sessions WHERE token_hash=?').bind(u.sessionHash).run();result=response({ok:true});
  }else if(path==='/api/access'){
   const u=await identity(request);if(u.torn_id!==OWNER_ID)fail('Only the owner can manage invitations.',403);
   if(request.method==='GET')result=response({members:(await database().prepare('SELECT a.torn_id,a.created_at,i.name FROM allowed_members a LEFT JOIN identities i ON i.torn_id=a.torn_id ORDER BY a.created_at').all()).results});
   else if(request.method==='POST'){
    await rateLimit(u.platformId+':access',15);const a=await body(request),id=TB.ident(a.id);if(id===OWNER_ID)fail('The owner always has access.');
    if(a.action==='invite')await database().prepare('INSERT OR IGNORE INTO allowed_members(torn_id,created_at,created_by) VALUES(?,?,?)').bind(id,new Date().toISOString(),u.torn_id).run();
    else if(a.action==='revoke'){if(role(await loadState(),id)!=='borrower')fail('Disable this staff member in Team first.');await database().batch([database().prepare('DELETE FROM allowed_members WHERE torn_id=?').bind(id),database().prepare('DELETE FROM sessions WHERE torn_id=?').bind(id)]);}
    else fail('Choose invite or revoke.');result=response({ok:true});
   }else fail('Method not allowed.',405);
  }else if(path==='/api/import'&&request.method==='POST'){
   const u=await identity(request);if(u.torn_id!==OWNER_ID)fail('Only the owner can import records.',403);
   await rateLimit(u.platformId+':import',2);const a=await body(request);if(a.confirm!=='IMPORT')fail('Confirm the migration import.');
   const current=await loadState();if(current.loans.length||current.applications.length||current.ledger.length||current.staff.length>1||current.pendingPayments.length||current.transfers.length||current.audit.length)fail('Import is allowed only into a new empty bank.');
   if(a.export?.role!=='owner'||String(a.export?.user?.id)!==OWNER_ID)fail('Use an owner export from the existing bank.');
   const next=a.export.state;validateImport(next);next.processedRequests=[];next.actorId=OWNER_ID;next.testDate=TB.today();TB.log(next,'Imported previous bank','Owner migration export');await saveState(next,current.revision);result=response({ok:true});
  }else{
   const key=path.slice('/api/'.length),factory=routes[key];if(!factory)fail('Unknown bank endpoint.',404);const handler=factory(env)[request.method];if(!handler)fail('Method not allowed.',405);result=await handler(request);
  }
 }catch(error){const message=String(error?.message||'Request failed.');result=response({error:message.startsWith('D1_')||message.includes('SQLITE')?'Database request failed. Check the database setup or free-plan limits.':TB.text(message,500)},error.status||400);}
 const headers=new Headers(result.headers);headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Vary','Origin');
 if(origin){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');headers.set('Access-Control-Allow-Headers','Content-Type,Authorization,X-TLB-Action');headers.set('Access-Control-Max-Age','600');}
 return new Response(result.body,{status:result.status,headers});
}
export function validateImport(s){
 if(!s||typeof s!=='object'||Array.isArray(s))fail('Invalid bank export.');
 for(const key of ['staff','loans','applications','ledger','transfers','audit','pendingPayments'])if(!Array.isArray(s[key]))fail('Incomplete bank export: '+key);
 if(!s.borrowers||typeof s.borrowers!=='object'||Array.isArray(s.borrowers))fail('Invalid borrower records.');
 const owners=s.staff.filter(p=>p.role==='owner');if(owners.length!==1||owners[0].id!==OWNER_ID||owners[0].disabled)fail('The export owner does not match Aaron112293.');
 if(s.staff.some(p=>!/^\d{1,10}$/.test(p.id)||!['owner','vault','staff'].includes(p.role)))fail('Invalid staff records.');
 if(new Set(s.staff.map(p=>p.id)).size!==s.staff.length)fail('Duplicate staff records.');
 TB.validateRules(s.rules);for(const loan of s.loans){TB.balance(loan,TB.today());if(!loan.id||!/^\d{1,10}$/.test(loan.borrowerId))fail('Invalid loan record.');}
}
export default {fetch:handle,async scheduled(_event,env){await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(Date.now()),env.DB.prepare('DELETE FROM api_limits WHERE bucket<?').bind(Math.floor(Date.now()/60000)-2)]);}};
