import React,{useState,useEffect,useRef} from 'react';
import {parseInviteId} from './invite-id.js';

export default function OwnerAccess({request,onImported}){
 const [members,setMembers]=useState([]),[id,setId]=useState(''),[error,setError]=useState('');
 const [pending,setPending]=useState(''),[message,setMessage]=useState('');
 const [file,setFile]=useState(null),[confirm,setConfirm]=useState('');
 const working=useRef(false),busy=!!pending;
 async function reload(){
  if(working.current)return;
  working.current=true;setPending('load');setError('');setMessage('Loading beta access…');
  try{setMembers((await request('access')).members);setMessage('');}
  catch(e){setError(e.message);setMessage('');}
  finally{working.current=false;setPending('');}
 }
 useEffect(()=>{reload();},[]);
 async function change(action,target){
  if(working.current)return;
  setError('');setMessage('');
  let targetId;
  try{targetId=parseInviteId(target);}catch(e){setError(e.message);return;}
  working.current=true;setPending(action);
  try{
   await request('access',{action,id:targetId});
   // The POST confirms the write. Update this list immediately without a second request.
   setMembers(current=>action==='invite'?(current.some(m=>m.torn_id===targetId)?current:[...current,{torn_id:targetId}]):current.filter(m=>m.torn_id!==targetId));
   if(action==='invite')setId('');
   setMessage(action==='invite'?'Borrower access enabled for Torn ID '+targetId+'. Share the borrower script with this tester; they sign in with their own Torn API key.':'Access removed for Torn ID '+targetId+'.');
  }catch(e){setError(e.message);}
  finally{working.current=false;setPending('');}
 }
 async function importRecords(e){
  e.preventDefault();if(working.current)return;
  working.current=true;setPending('import');setError('');setMessage('');
  try{
   if(!file||file.size>1400000)throw Error('Choose an owner JSON export smaller than 1.4 MB.');
   const value=JSON.parse(await file.text());await request('import',{confirm,export:value});
   setFile(null);setConfirm('');await onImported();setMessage('Bank records imported.');
  }catch(err){setError(err.message);}
  finally{working.current=false;setPending('');}
 }
 return <><section className='card'>
  <h2>Private beta access</h2>
  <p className='muted'>Only you, your active staff and the Torn IDs added here can sign in. This enables borrower access; it does not send a Torn message. Staff roles are managed in Team.</p>
  <form className='stack tight' noValidate onSubmit={e=>{e.preventDefault();change('invite',id);}}>
   <label className='field'><span>Tester’s Torn ID or profile link</span><input aria-label='Invite Torn ID' placeholder='1234567 or Name [1234567]' inputMode='numeric' maxLength={500} value={id} onChange={e=>setId(e.target.value)}/></label>
   <button type='button' className='primary' disabled={busy} onClick={()=>change('invite',id)}>{pending==='invite'?'Adding access…':'Invite borrower'}</button>
  </form>
  {error&&<p role='alert' className='notice red'>{error}</p>}
  {message&&<p role='status' className='notice'>{message}</p>}
  <div className='actions'><button type='button' className='subtle' disabled={busy} onClick={reload}>Refresh access list</button></div>
  {!members.length&&!busy&&!error&&<p className='muted'>No beta borrowers added yet.</p>}
  {members.map(m=><div className='record static' key={m.torn_id}><span className='record-main'>Torn ID {m.torn_id}</span><button type='button' className='subtle danger' disabled={busy} onClick={()=>change('revoke',m.torn_id)}>Remove access</button></div>)}
 </section><section className='card'>
  <h2>Move existing bank records</h2><p className='muted'>Export your records from Connections on the old bank. Import that owner export here before creating new applications, loans, funding or staff. Import is blocked once this bank has activity.</p>
  <input aria-label='Owner bank export' type='file' accept='.json,application/json' onChange={e=>setFile(e.target.files?.[0]||null)}/>
  <form className='inline-form' onSubmit={importRecords}><input aria-label='Import confirmation' placeholder='Type IMPORT' value={confirm} onChange={e=>setConfirm(e.target.value)}/><button className='secondary' disabled={busy||!file||confirm!=='IMPORT'}>Import records</button></form>
 </section></>;
}
