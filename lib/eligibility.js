export function eligibility(state,id,lane){
 const record=state.borrowers[id]||{};
 const completed=Number(record.completed)||0;
 const piRto=typeof record.piRto==='boolean'?record.piRto:state.applications.some(a=>a.borrowerId===id&&!a.isTest&&a.status==='approved'&&a.piRto===true);
 const maxTier=record.trust?.tier??0,manual=record.assignedTiers?.[lane];
 const allowed=state.rules[lane].map((t,i)=>Number.isInteger(manual)?i===manual:lane==='faction'?i<=maxTier:i===4?piRto:completed>=t.completed);
 const assignedTier=Number.isInteger(manual)?manual:lane==='faction'?maxTier:allowed.lastIndexOf(true);
 return {completed,piRto,oilEligible:record.oilEligible===true,assignedTier:Math.max(0,assignedTier),manual:Number.isInteger(manual),allowed};
}
