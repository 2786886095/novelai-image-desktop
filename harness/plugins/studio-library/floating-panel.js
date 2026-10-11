import React,{useEffect,useRef,useState} from 'react';
import {defaultPanel,clampPanel,changePanel} from './panel-geometry.js';
const h=React.createElement;
const viewport=()=>{const v=window.visualViewport;return {x:v?.offsetLeft??0,y:v?.offsetTop??0,width:v?.width??innerWidth,height:v?.height??innerHeight}};
export function FloatingPanel({call,onClose,children}){
 const [view,setView]=useState(viewport),[preferred,setPreferred]=useState(null),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const profile=view.width<=600?'phone':'desktop';
 const rect=preferred?clampPanel(preferred,view):defaultPanel(view);
 const current=useRef(rect),gesture=useRef(null),changed=useRef(0),mounted=useRef(true),queue=useRef(Promise.resolve()),panel=useRef(null),before=useRef(null);
 current.current=rect;
 useEffect(()=>{mounted.current=true;before.current=document.activeElement;panel.current?.focus({preventScroll:true});return()=>{mounted.current=false;if(before.current?.isConnected)before.current.focus({preventScroll:true})}},[]);
 useEffect(()=>{const update=()=>{gesture.current=null;setView(viewport())};window.addEventListener('resize',update);window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);return()=>{window.removeEventListener('resize',update);window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update)}},[]);
 useEffect(()=>{let live=true;const revision=++changed.current;setPreferred(null);call('studio_panel_layout',{profile}).then(v=>{if(live&&changed.current===revision){setPreferred(v.rect);setError('')}}).catch(e=>{if(live)setError('布局读取失败：'+e.message)});return()=>{live=false}},[call,profile]);
 function save(value){
  const revision=++changed.current;setSaving(true);
  queue.current=queue.current.catch(()=>{}).then(()=>call('studio_save_panel_layout',{profile,rect:value})).then(()=>{if(mounted.current&&changed.current===revision){setError('');setSaving(false)}}).catch(e=>{if(mounted.current&&changed.current===revision){setError('布局未保存：'+e.message);setSaving(false)}});
 }
 function start(e,resize){
  if(e.button!==0||(!resize&&e.target.closest('button')))return;
  changed.current++;gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,rect:current.current,resize};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();
 }
 function move(e){const g=gesture.current;if(!g||g.id!==e.pointerId)return;const next=changePanel(g.rect,e.clientX-g.x,e.clientY-g.y,g.resize,viewport());current.current=next;setPreferred(next)}
 function finish(e,cancel=false){const g=gesture.current;if(!g||g.id!==e.pointerId)return;gesture.current=null;if(cancel){current.current=g.rect;setPreferred(g.rect)}else save(current.current);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}
 function keys(e,resize){const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta||e.target!==e.currentTarget)return;e.preventDefault();const step=e.shiftKey?32:8,next=changePanel(current.current,delta[0]*step,delta[1]*step,resize,viewport());current.current=next;setPreferred(next);save(next)}
 const handlers=resize=>({onPointerDown:e=>start(e,resize),onPointerMove:move,onPointerUp:e=>finish(e),onPointerCancel:e=>finish(e,true),onLostPointerCapture:()=>{gesture.current=null},onKeyDown:e=>keys(e,resize)});
 return h('section',{ref:panel,tabIndex:-1,className:'studio-floating-panel',role:'dialog','aria-modal':false,'aria-label':'软件参数',style:{left:rect.x,top:rect.y,width:rect.width,height:rect.height},onKeyDown:e=>{if(e.key==='Escape'&&!e.defaultPrevented){e.stopPropagation();onClose()}}},
  h('header',{className:'studio-floating-header',tabIndex:0,'aria-label':'拖动参数面板','aria-description':'拖动标题栏，或使用方向键移动',...handlers(false)},h('strong',null,'软件参数'),h('button',{type:'button',onClick:()=>{setPreferred(null);current.current=defaultPanel(viewport());save(null)},title:'恢复默认位置和大小','aria-label':'恢复默认位置和大小'},'恢复默认'),h('button',{type:'button','aria-label':'关闭软件面板',onClick:onClose},'×')),
  h('div',{className:'studio-floating-body'},children),
  h('footer',{className:'studio-floating-footer'},h('small',{'aria-live':'polite'},error|| (saving?'正在保存布局…':'拖动标题栏移动 · 右下角调整大小')),error?h('button',{onClick:()=>save(preferred)},'重试保存'):null,h('button',{type:'button',className:'studio-floating-resize','aria-label':'调整参数面板大小',title:'拖动或使用方向键调整大小',...handlers(true)},'↘')));
}
export const floatingPanelCSS=`
.studio-floating-panel{position:fixed;z-index:25;pointer-events:auto;display:flex;flex-direction:column;box-sizing:border-box;min-width:0;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 8px 28px #0002;font:inherit;outline:none}
.studio-floating-header{display:flex;align-items:center;gap:8px;flex:none;padding:10px 12px;min-height:48px;box-sizing:border-box;border-bottom:1px solid var(--dsw-alias-border-l2);cursor:move;touch-action:none;user-select:none}
.studio-floating-header strong{flex:1;min-width:0;font-size:14px}.studio-floating-header button,.studio-floating-footer button{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;cursor:pointer;padding:4px 8px;min-height:32px}
.studio-floating-body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.studio-floating-body>.studio-library{max-height:none;overflow:visible;padding:12px}.studio-floating-footer{display:flex;align-items:center;gap:4px;flex:none;min-height:32px;padding-left:12px;border-top:1px solid var(--dsw-alias-border-l2)}.studio-floating-footer small{flex:1;color:var(--dsw-alias-label-secondary);font-size:11px;overflow-wrap:anywhere}.studio-floating-footer .studio-floating-resize{border:0;border-radius:0;cursor:nwse-resize;touch-action:none;user-select:none;width:36px;min-height:36px;background:transparent}
.studio-floating-panel :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.studio-floating-panel .studio-library-field{gap:6px;margin-bottom:10px}.studio-floating-panel .studio-library-toolbar{gap:6px;margin-bottom:8px}.studio-floating-panel .studio-session-controls{font-size:13px}.studio-floating-panel .studio-session-controls h3{font-size:14px;margin:0 0 8px}.studio-floating-panel .studio-session-controls p{margin:6px 0}.studio-floating-panel .studio-session-controls .studio-library-field input[type=number]{width:90px!important;max-width:90px!important;flex:0 0 90px}.studio-floating-panel .studio-session-controls .studio-library-field{flex-direction:row;align-items:center;justify-content:space-between}.studio-floating-panel .studio-parameter-tabs{margin:8px 0}.studio-floating-panel .studio-parameter-tabs button{min-height:36px}.studio-floating-panel .studio-parameter-card{gap:6px;padding:10px}.studio-floating-panel .studio-parameter-card p{margin:0}.studio-floating-panel .studio-parameter-actions:empty{display:none}@media(max-width:600px){.studio-floating-header{min-height:52px}.studio-floating-header button{min-height:40px}.studio-floating-footer .studio-floating-resize{width:44px;min-height:44px}}
`;
