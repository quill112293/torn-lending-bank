export function normalizeOrigin(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('Enter only the HTTPS bank address.');return u.origin;}
export function createTransport(origin,{native=false,onExpired=()=>{}}={}){
 let bearer='';
 async function request(path,body){
  const method=body===undefined?'GET':'POST',headers={Accept:'application/json'};
  if(body!==undefined){headers['Content-Type']='application/json';headers['x-tlb-action']='1';}
  if(bearer)headers.Authorization='Bearer '+bearer;
  const url=origin+'/api/'+path,payload=body===undefined?undefined:JSON.stringify(body);
  let res;
  try{
   if(native&&typeof PDA_httpGet==='function'&&typeof PDA_httpPost==='function'){
    let timer;try{res=await Promise.race([method==='GET'?PDA_httpGet(url,headers):PDA_httpPost(url,headers,payload),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),25000);})]);}finally{clearTimeout(timer);}
   }else if(native&&typeof GM_xmlhttpRequest==='function'){
    res=await new Promise((resolve,reject)=>GM_xmlhttpRequest({method,url,headers,data:payload,timeout:25000,anonymous:true,onload:resolve,onerror:reject,ontimeout:reject}));
   }else{
    const r=await fetch(url,{method,headers,body:payload,credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(25000)});res={status:r.status,responseText:await r.text()};
   }
  }catch{throw Error('Connection interrupted. Refresh the bank before retrying a save.');}
  let data;try{data=JSON.parse(res.responseText);}catch{throw Error('The bank did not return a usable response. Check its address and deployment.');}
  if(res.status===401){bearer='';onExpired();}
  if(res.status<200||res.status>=300||data.error)throw Error(data.error||'Bank request failed.');
  if(path==='link'&&data.token){bearer=data.token;delete data.token;}
  return data;
 }
 return {request,hasSession:()=>!!bearer,clear:()=>{bearer='';},async logout(){try{if(bearer)await request('logout',{});}finally{bearer='';}}};
}
