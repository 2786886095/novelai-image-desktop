import {useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {createPortal} from 'react-dom';
/** Non-modal, viewport-clamped popover. Never creates an invisible input shield. */
export function AnchoredPopover({anchor,children,onClose,label}:{anchor:RefObject<HTMLElement|null>;children:ReactNode;onClose:()=>void;label:string}){
 const panel=useRef<HTMLDivElement>(null),[position,setPosition]=useState({left:8,top:8,width:390,maxHeight:300});
 useLayoutEffect(()=>{
  const update=()=>{const a=anchor.current,p=panel.current;if(!a||!p)return;const viewport=window.visualViewport,originX=viewport?.offsetLeft??0,originY=viewport?.offsetTop??0,w=viewport?.width??window.innerWidth,h=viewport?.height??window.innerHeight,r=a.getBoundingClientRect(),width=Math.min(390,w-16),above=r.top-originY-16,below=originY+h-r.bottom-16,up=above>=Math.min(p.scrollHeight,300)||above>below,maxHeight=Math.max(48,Math.min(300,up?above:below)),height=Math.min(p.scrollHeight,maxHeight);setPosition({left:Math.max(originX+8,Math.min(originX+w-width-8,r.right-width)),top:up?Math.max(originY+8,r.top-height-8):r.bottom+8,width,maxHeight});};
  const dismiss=(event:PointerEvent)=>{const n=event.target as Element;if(panel.current?.contains(n)||anchor.current?.contains(n)||n.closest('.select-menu-popover'))return;onClose();};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();onClose();anchor.current?.focus({preventScroll:true});}};
  const observer=new ResizeObserver(update);if(panel.current)observer.observe(panel.current);update();
  window.addEventListener('resize',update);window.addEventListener('scroll',update,true);window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);document.addEventListener('pointerdown',dismiss,true);document.addEventListener('keydown',key);
  return()=>{observer.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);document.removeEventListener('pointerdown',dismiss,true);document.removeEventListener('keydown',key);};
 },[anchor,onClose]);
 return createPortal(<div ref={panel} className="pi-agent pi-context-popover" role="region" aria-label={label} style={position}>{children}</div>,document.body);
}
