const directEvents=new Set(['User statuses updated','Test participant status','Faction trust promoted','Strike recorded','Confirmed ban flag','Confirmed Torn ban','Owner restriction review','Team member added','Team role changed','Public lending allocation updated','Beta invitation added','Beta invitation revoked']);
export function historyIndex(s){
 const records=[s,...(s.recordArchives||[]).map(a=>a.records||{})],loans=records.flatMap(r=>r.loans||[]),apps=records.flatMap(r=>r.applications||[]),links=new Map();
 function add(key,id,isTest=false,reference=''){if(key&&id){const k=String(key);if(!links.has(k))links.set(k,[]);links.get(k).push({key:k,id:String(id),isTest,reference});}}
 for(const a of apps){add(a.id,a.borrowerId,a.isTest,a.reference);add(a.reference,a.borrowerId,a.isTest,a.reference);}
 for(const l of loans){add(l.id,l.borrowerId,l.isTest,l.reference);add(l.reference,l.borrowerId,l.isTest,l.reference);for(const p of l.payments||[])add(p.id,l.borrowerId,l.isTest,l.reference);}
 for(const r of records)for(const key of ['pendingPayments','paymentIntents','extensionRequests','collateral','receipts'])for(const p of r[key]||[]){const l=loans.find(l=>l.id===p.loanId);add(p.id,p.borrowerId||p.borrower||l?.borrowerId,l?.isTest,l?.reference);}
 for(const t of s.transfers||[]){add(t.id,t.from);add(t.id,t.to);}
 return links;
}
export function enrichHistory(s,entry,index=historyIndex(s)){
 const subjects=new Set(entry.subjectIds||[]),refs=new Set(entry.references||[]),detail=String(entry.detail||'');let isTest=entry.isTest===true;
 for(const token of new Set(detail.split(/[^A-Za-z0-9_-]+/)))for(const link of index.get(token)||[]){subjects.add(link.id);if(link.reference)refs.add(link.reference);isTest ||= link.isTest===true;}
 if(directEvents.has(entry.event)){const id=detail.match(/^(\d{1,10})(?:\s|\/|$)/)?.[1];if(id)subjects.add(id);}
 if(entry.event==='Transfer requested'||entry.event==='Shift handover requested'){const m=detail.match(/ from (\d+) to (\d+)/);if(m){subjects.add(m[1]);subjects.add(m[2]);}}
 return {...entry,subjectIds:[...subjects],references:[...refs],isTest};
}
export function historyUsers(s,entries){const names=new Map();for(const p of s.staff||[])names.set(p.id,p.name);for(const r of [s,...(s.recordArchives||[]).map(a=>a.records||{})])for(const a of [...r.applications||[],...r.loans||[]])names.set(a.borrowerId,a.name);for(const id of Object.keys(s.borrowers||{}))if(!names.has(id))names.set(id,id);for(const e of entries)for(const id of [e.actor,...e.subjectIds||[]])if(id&&!names.has(id))names.set(id,id==='system'?'System':id);return [...names].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name));}
export function filterHistory(s,filters={}){
 const index=historyIndex(s),entries=(s.audit||[]).map(e=>enrichHistory(s,e,index)),users=historyUsers(s,entries),names=new Map(users.map(u=>[u.id,u.name]));
 const query=String(filters.query||'').toLowerCase().trim();
 return entries.filter(e=>{const day=e.testDate||e.at?.slice(0,10)||'';return (!filters.userId||e.actor===filters.userId||e.subjectIds.includes(filters.userId))&&(!filters.event||e.event===filters.event)&&(!filters.from||day>=filters.from)&&(!filters.to||day<=filters.to)&&(!filters.recordType||filters.recordType==='all'||(filters.recordType==='test')===!!e.isTest)&&(!query||[e.event,e.detail,e.actor,...e.subjectIds,...e.references,names.get(e.actor),...e.subjectIds.map(id=>names.get(id))].join(' ').toLowerCase().includes(query));}).reverse();
}
