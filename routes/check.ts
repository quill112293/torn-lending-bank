import {createServer} from '../server/context.js';
import {role} from '../lib/operations.js';
import TB from '../lib/engine.js';
export function route(env){
const {body,identity,loadState,saveState,torn,ownKey,response,rateLimit,database,flagConfirmedProfile}=createServer(env);
async function POST(req:Request){try{
 const u=await identity(req),a=await body(req);await rateLimit(u.platformId+':check',8);await ownKey(a.key,u.torn_id);
 const target=TB.ident(a.id||u.torn_id),s=await loadState();if(target!==u.torn_id&&role(s,u.torn_id)==='borrower')throw Error('Borrowers can check only their own account.');
 const profile=(await torn(a.key,'user/'+target+'/profile')).profile;if(String(profile?.id)!==target)throw Error('The Torn profile response did not match the requested account.');
 const info:any={profile:{id:profile.id,name:profile.name,faction_id:profile.faction_id,status:profile.status},checkedAt:new Date().toISOString()};
 if(target===u.torn_id){for(const [kind,path] of [['stats','user/personalstats?stat=networth'],['job','user/job']]){try{info[kind]=await torn(a.key,path);}catch(e:any){info[kind+'Error']=e.message;}}
 const owner=await database().prepare('SELECT profile FROM identities WHERE torn_id=?').bind('3542697').first();const ownerProfile=owner?JSON.parse(owner.profile):{};
 const stored={factionMember:!!profile.faction_id&&profile.faction_id===(target==='3542697'?profile.faction_id:ownerProfile.faction_id),...info.profile,checkedAt:info.checkedAt,networth:info.stats?.personalstats?.find((v:any)=>v.name==='networth')?.value,job:info.job?.job};
 await database().prepare('UPDATE identities SET profile=?,name=?,verified_at=? WHERE id=?').bind(JSON.stringify(stored),profile.name,info.checkedAt,u.platformId).run();}
 if(flagConfirmedProfile(s,profile,u.torn_id)){await saveState(s,s.revision);info.banFlagged=true;}
 return response(info);
 }catch(e:any){return response({error:e.message},e.status||400);}}
return { POST };
}
