export function eligibility(state,id,lane){
 const record=state.borrowers[id]||{};
 const completed=Number(record.completed)||0;
 const piRto=record.piRto===true||state.applications.some(a=>a.borrowerId===id&&a.status==='approved'&&a.piRto===true);
 const maxTier=record.trust?.tier??0;
 return {completed,piRto,allowed:state.rules[lane].map((t,i)=>lane==='faction'?i<=maxTier:i===4?piRto:completed>=t.completed)};
}
