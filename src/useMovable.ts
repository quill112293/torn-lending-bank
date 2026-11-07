import {useEffect,useRef,useState} from 'react';
import {clampPosition} from './panel-position.js';
export function useMovable(key){
 const ref=useRef(null),drag=useRef(null),moved=useRef(false);
 const [position,setPosition]=useState(()=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}});
 function place(p){const el=ref.current;if(!el)return;const r=el.getBoundingClientRect();if(!r.width||!r.height)return;const next=clampPosition(p,r.width,r.height,window.innerWidth,window.innerHeight);setPosition(old=>old?.x===next.x&&old?.y===next.y?old:next);try{localStorage.setItem(key,JSON.stringify(next));}catch{}}
 useEffect(()=>{function resize(){if(position)place(position);}window.addEventListener('resize',resize);resize();return()=>window.removeEventListener('resize',resize);},[position?.x,position?.y]);
 useEffect(()=>{if(!ref.current||typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(()=>{if(position)place(position);});observer.observe(ref.current);return()=>observer.disconnect();},[position?.x,position?.y]);
 const handlers={onPointerDown(e){if(!e.isPrimary||e.button!==0)return;const r=ref.current.getBoundingClientRect();drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};moved.current=false;e.currentTarget.setPointerCapture(e.pointerId);},onPointerMove(e){const d=drag.current;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)+Math.abs(dy)>5)moved.current=true;if(moved.current)place({x:d.left+dx,y:d.top+dy});},onPointerUp(){drag.current=null;},onPointerCancel(){drag.current=null;},onClickCapture(e){if(moved.current){e.preventDefault();e.stopPropagation();moved.current=false;}},onKeyDown(e){const moves={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]};if(!moves[e.key])return;e.preventDefault();const r=ref.current.getBoundingClientRect(),[x,y]=moves[e.key];place({x:r.left+x,y:r.top+y});}};
 return {ref,handlers,style:position?{left:position.x,top:position.y,right:'auto',bottom:'auto'}:undefined};
}
