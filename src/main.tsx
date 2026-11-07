import {isBankPage} from './panel-position.js';
import {useMovable} from './useMovable';
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import BankClient from './BankClient';
import {createTransport,normalizeOrigin} from './transport';
import css from './bank.css';
const native=typeof __NATIVE__!=='undefined'&&__NATIVE__;
const configured=typeof __BANK_ORIGIN__!=='undefined'?__BANK_ORIGIN__:'';
const roleLabel=typeof __ROLE_LABEL__!=='undefined'?__ROLE_LABEL__:'Bank';
const pauseState={visible:!native};
let activeTransport=null;
function App(){
 const panel=useMovable('tlb-panel-position:'+roleLabel),launcher=useMovable('tlb-launch-position:'+roleLabel);
 const [origin,setOrigin]=useState(native?configured:location.origin),[draft,setDraft]=useState(configured),[error,setError]=useState(''),[demo,setDemo]=useState(!native&&location.pathname.startsWith('/demo'));
 const [visible,setVisible]=useState(!native),[generation,setGeneration]=useState(0);
 const [transport,setTransport]=useState(()=>origin?createTransport(origin,{native}):null);
 function connect(e){e.preventDefault();try{const next=normalizeOrigin(draft);if(!next.endsWith('.workers.dev'))throw Error('Use the bank’s Cloudflare workers.dev address.');setOrigin(next);setTransport(createTransport(next,{native}));setError('');}catch(err){setError(err.message);}}
 activeTransport=transport;pauseState.visible=visible;
 function close(){setVisible(false);setGeneration(v=>v+1);}
 const body=<>{!origin&&!demo?<main className='welcome'><section className='welcome-card'><h1>Torn Lending Bank</h1><p>The in-Torn interface is ready. Connect it to your deployed bank to share records.</p><form onSubmit={connect}><label className='field'>Bank address<input type='url' required value={draft} placeholder='Your bank’s https://…workers.dev address' onChange={e=>setDraft(e.target.value)}/></label><button className='primary full'>Connect to bank</button></form><button className='secondary full' onClick={()=>setDemo(true)}>Try the working demo</button>{error&&<p className='notice red'>{error}</p>}</section></main>:<BankClient key={generation+':'+String(demo)} demo={demo} transport={transport} bankOrigin={origin} active={visible} keyRole={roleLabel} onExitDemo={()=>setDemo(false)} onDemo={()=>setDemo(true)}/>}</>;
 if(!native)return body;
 return <><button ref={launcher.ref} style={launcher.style} {...launcher.handlers} className='tlb-launch' aria-expanded={visible} onClick={()=>setVisible(!visible)}>Bank · {roleLabel}</button><section ref={panel.ref} style={panel.style} className='tlb-panel' hidden={!visible} aria-label='Torn Lending Bank'><header className='tlb-bar'><strong className='tlb-drag' tabIndex={0} role='button' aria-label='Move bank panel' title='Drag to move' {...panel.handlers}>⠿ Torn Lending Bank{demo?' · DEMO':''}</strong><button onClick={()=>setVisible(false)}>Minimize</button><button aria-label='Close bank panel' onClick={close}>×</button></header><div className='tlb-body'>{body}</div></section></>;
}
const host=document.createElement('div');host.id='tlb-portal-host';
if(!native||window.top===window.self&&!document.getElementById(host.id)){
 const root=native?host.attachShadow({mode:'closed'}):host;
 const style=document.createElement('style');style.textContent=css.replace(/:root/g,':host').replace(/\bbody\b/g,':host')+`
 :host{font-family:system-ui,sans-serif;line-height:1.55;color:#eef5f3;font-size:14px}button,input,select,textarea{font-family:inherit}
 .tlb-launch{position:fixed;right:12px;bottom:calc(58px + env(safe-area-inset-bottom));z-index:2147483000;touch-action:none;cursor:grab;padding:12px 16px;background:#183b2b;color:#eaffee;border:1px solid #4f7b63;border-radius:12px;font-size:14px}
 .tlb-panel{position:fixed;left:4vw;top:8px;width:92vw;max-width:1100px;height:80dvh;z-index:2147483001;background:var(--bg);border:1px solid #4f7b63;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 15px 60px #0009;transform:translateZ(0)}.tlb-panel[hidden]{display:none}.tlb-bar{display:flex;align-items:center;gap:10px;padding:8px 12px;background:#132522;border-bottom:1px solid var(--border);flex-shrink:0}.tlb-drag{touch-action:none;cursor:grab;user-select:none;min-height:40px;display:flex;align-items:center}.tlb-bar strong{flex:1;font-size:13px}.tlb-bar button{min-height:40px;min-width:40px;border:1px solid #4f7b63;border-radius:8px;background:#183b2b;color:#eaffee;font-size:12px}.tlb-body{overflow:auto;flex:1;min-height:0;overscroll-behavior:contain}.tlb-body .app-shell,.tlb-body .welcome{min-height:100%}.tlb-body .sidebar{position:sticky;top:0;align-self:flex-start;height:calc(100dvh - 130px);flex-shrink:0}.tlb-body .main-shell{margin-left:0}.tlb-body .welcome{padding:25px 15px}.tlb-body .modal-shade{z-index:200}.tlb-body .toast{z-index:201}
 @media(max-width:760px){.tlb-body .sidebar{height:auto}}
 `;
 if(!native){style.textContent=css;document.head.append(style);}
 else root.append(style);
 const container=document.createElement('div');root.append(container);let appRoot=null;
 function updatePage(){const allowed=!native||isBankPage(location.href);if(allowed&&!appRoot){document.body.append(host);appRoot=createRoot(container);appRoot.render(<App/>);}else if(!allowed&&appRoot){appRoot.unmount();appRoot=null;host.remove();activeTransport=null;pauseState.visible=false;}}
 updatePage();if(native){window.addEventListener('popstate',updatePage);window.addEventListener('hashchange',updatePage);setInterval(updatePage,300);}
}
