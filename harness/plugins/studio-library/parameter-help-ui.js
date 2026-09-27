import React,{useState,useEffect,useLayoutEffect,useRef,useId} from 'react';
import {parameterHelp} from './parameter-help.js';
const h=React.createElement;
export function ParameterHelp({name,field,rule}){
 const [hover,setHover]=useState(false),[focus,setFocus]=useState(false),[pinned,setPinned]=useState(false);
 const root=useRef(null),tip=useRef(null),id=useId(),open=hover||focus||pinned;
 const close=()=>{setPinned(false);setHover(false);setFocus(false)};
 useEffect(()=>{if(!open)return;const outside=e=>{if(!root.current?.contains(e.target))close()};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)},[open]);
 useLayoutEffect(()=>{
  if(!open||!tip.current)return;
  const node=tip.current,anchor=root.current.querySelector('button');
  // The native top layer escapes the floating panel's clipped scrolling body.
  // Merely raising z-index still leaves a tooltip invisible near its bottom edge.
  node.showPopover?.();
  const place=()=>{
   const a=anchor.getBoundingClientRect(),v=window.visualViewport;
   const left=v?.offsetLeft??0,top=v?.offsetTop??0,w=v?.width??innerWidth,height=v?.height??innerHeight;
   const body=anchor.closest('.studio-floating-body'),b=body?.getBoundingClientRect();
   if(b&&(a.bottom<=b.top||a.top>=b.bottom)){close();return;}
   const width=Math.min(360,Math.max(1,w-16));
   node.style.width=width+'px';node.style.maxHeight=Math.max(1,Math.min(220,height-16))+'px';
   const n=node.getBoundingClientRect(),below=a.bottom+6,above=a.top-n.height-6;
   node.style.left=Math.max(left+8,Math.min(a.left,left+w-width-8))+'px';
   node.style.top=Math.max(top+8,Math.min(below+n.height<=top+height-8?below:above,top+height-n.height-8))+'px';
  };
  place();const observer=new ResizeObserver(place);observer.observe(node);observer.observe(anchor);
  document.addEventListener('scroll',place,true);window.addEventListener('resize',place);vListen('addEventListener');
  function vListen(method){window.visualViewport?.[method]('resize',place);window.visualViewport?.[method]('scroll',place)}
  return()=>{observer.disconnect();document.removeEventListener('scroll',place,true);window.removeEventListener('resize',place);vListen('removeEventListener');if(node.hidePopover&&node.matches(':popover-open'))node.hidePopover();};
 },[open]);
 return h('span',{ref:root,className:'studio-help',onPointerEnter:e=>{if(e.pointerType==='mouse')setHover(true)},onPointerLeave:()=>setHover(false),onKeyDown:e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}}},
 h('button',{type:'button',className:'studio-help-trigger','aria-label':name+'说明','aria-expanded':open,'aria-describedby':open?id:undefined,onFocus:()=>setFocus(true),onBlur:()=>setFocus(false),onClick:()=>{if(pinned)close();else setPinned(true)}},'ⓘ'),
 open?h('span',{ref:tip,id,role:'tooltip',popover:'manual',className:'studio-help-content'},parameterHelp(field,rule)):null);
}
export const helpCSS=`.studio-parameter-card .studio-library-toolbar{position:relative}.studio-help{display:inline-flex;align-items:center}.studio-library .studio-help-trigger{padding:2px 6px;min-width:28px;min-height:28px;border:0;border-radius:6px;background:transparent;cursor:help;color:var(--dsw-alias-label-secondary)}.studio-help-content{position:fixed;z-index:100;inset:auto;margin:0;box-sizing:border-box;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 4px 16px #0002;white-space:pre-line;overflow-wrap:anywhere;max-height:220px;overflow:auto;font-size:13px;line-height:1.6}.studio-help-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)}@media(pointer:coarse){.studio-library .studio-help-trigger{min-width:44px;min-height:44px}}`;
