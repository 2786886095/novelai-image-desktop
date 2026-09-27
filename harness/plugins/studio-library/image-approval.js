import React,{useState,useEffect,useRef} from 'react';
import {approvalSummary} from './approval-summary.js';
const h=React.createElement;
export function ImageApproval({call,sessionId}) {
 const box=useRef(null);
 const [pending,setPending]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let live=true,inflight=false;setPending(null);setError('');if(!sessionId)return;
  const read=async()=>{if(inflight)return;inflight=true;try{const item=await call('studio_image_approval',{sessionId});if(live)setPending(item)}catch(e){if(live)setError(e.message)}finally{inflight=false}};
  read();const timer=setInterval(()=>{if(document.visibilityState==='visible')read()},1500);
  return()=>{live=false;clearInterval(timer)};
 },[call,sessionId]);
 useEffect(()=>{
  if(!pending)return;const previous=document.activeElement;box.current?.querySelector('button')?.focus();
  return()=>{if(previous?.isConnected)previous.focus()};
 },[pending?.id]);
 async function decide(approved){setBusy(true);setError('');try{await call('studio_resolve_image_approval',{sessionId,id:pending.id,approved});setPending(null)}catch(e){setError(e.message)}finally{setBusy(false)}}
 if(!pending)return null;
 const summary=approvalSummary(pending);
 return h('div',{className:'studio-approval-shade'},h('section',{
  ref:box,className:'studio-library studio-approval-card',role:'dialog','aria-modal':true,'aria-label':summary.title,'aria-busy':busy,
  onKeyDown:e=>{if(e.key==='Escape'&&!busy){e.preventDefault();decide(false)}if(e.key==='Tab'){const list=[...box.current.querySelectorAll('button:not(:disabled),summary')];const first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}
 },h('h3',null,summary.title),
 h('div',{className:'studio-approval-body'},
  h('p',null,summary.description),summary.target?h('p',null,summary.target):null,summary.categories?h('p',null,'所选资料：'+summary.categories):null,
  h('details',null,h('summary',null,'查看本次参数'),h('p',{className:'studio-library-muted'},pending.tool),h('pre',{style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}},JSON.stringify(pending.parameters,null,2))),
  error?h('p',{role:'alert'},error):null),
 h('div',{className:'studio-library-toolbar'},h('button',{disabled:busy,onClick:()=>decide(false)},'取消'),h('button',{disabled:busy,onClick:()=>decide(true)},busy?'正在提交…':summary.confirm))));
}
export const approvalCSS=`.studio-approval-shade{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:12px;background:rgb(0 0 0 / .2)}.studio-approval-card{width:min(480px,100%);max-height:80dvh;overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#171717);border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:14px;padding:20px;overflow-wrap:anywhere}.studio-approval-card h3{flex-shrink:0;margin:0 0 12px}.studio-approval-body{min-height:0;overflow:auto}.studio-approval-card .studio-library-toolbar{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;flex-shrink:0;border-top:1px solid var(--dsw-alias-border-l2,#ddd);padding-top:12px;margin-top:12px}.studio-approval-card button{min-height:44px;min-width:80px;font:inherit;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:6px;padding:7px 12px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#fff));color:inherit;cursor:pointer}.studio-approval-card button:focus-visible,.studio-approval-card summary:focus-visible{outline:2px solid currentColor;outline-offset:2px}.studio-approval-card summary{min-height:44px;display:flex;align-items:center;cursor:pointer}`;
