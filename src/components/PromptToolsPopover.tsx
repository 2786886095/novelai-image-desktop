import {useLayoutEffect,useRef,useId,type ReactNode} from 'react';
import {AppPortal} from './ui';
import {Icon} from './icons';
import {useDisclosurePresence,disclosureAttributes} from './disclosure-motion';

/** Root overlay: the toolbar reveal intentionally clips, its actions must not. */
export function PromptToolsPopover({label,open,onOpenChange,children}:{label:string;open:boolean;onOpenChange:(open:boolean)=>void;children:ReactNode}){
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),id=useId();
 const internalPointerEvents=useRef(new WeakSet<Event>());
 const retained=useDisclosurePresence(open),close=useRef(onOpenChange);close.current=onOpenChange;
 useLayoutEffect(()=>{
  if(!open)return;
  const position=()=>{
   const anchor=trigger.current?.getBoundingClientRect(),node=panel.current;if(!anchor||!node)return;
   const rect=node.getBoundingClientRect(),pad=8,gap=6;
   node.style.left=`${Math.max(pad,Math.min(innerWidth-rect.width-pad,anchor.right-rect.width))}px`;
   node.style.top=`${Math.max(pad,Math.min(innerHeight-rect.height-pad,anchor.top>=rect.height+gap+pad?anchor.top-rect.height-gap:anchor.bottom+gap))}px`;
  };
  position();const observer=new ResizeObserver(position);if(panel.current)observer.observe(panel.current);
  const pointer=(e:PointerEvent)=>{const target=e.target as Node;if(internalPointerEvents.current.has(e)||panel.current?.contains(target)||trigger.current?.contains(target))return;close.current(false);};
  window.addEventListener('resize',position);window.addEventListener('scroll',position,true);document.addEventListener('pointerdown',pointer);
  return()=>{observer.disconnect();window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);document.removeEventListener('pointerdown',pointer);};
 },[open]);
 return <><button ref={trigger} type="button" className="compact-icon-button" title={label} aria-label={label} aria-expanded={open} aria-controls={id} onClick={()=>onOpenChange(!open)} onKeyDown={e=>{if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();onOpenChange(false);}if(e.key==='ArrowDown'){e.preventDefault();onOpenChange(true);requestAnimationFrame(()=>panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());}}}><Icon name="moreHorizontal"/></button>
 {retained&&<AppPortal><div ref={panel} id={id} className="prompt-tools-popover" role="group" aria-label={label} {...disclosureAttributes(open)} onPointerDownCapture={e=>internalPointerEvents.current.add(e.nativeEvent)} onKeyDown={e=>{if(!e.currentTarget.contains(e.target as Node))return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onOpenChange(false);trigger.current?.focus({preventScroll:true});}}}>{children}</div></AppPortal>}</>;
}
