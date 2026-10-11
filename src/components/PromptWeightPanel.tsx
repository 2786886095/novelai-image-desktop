import {useEffect,useRef,type ReactNode} from 'react';
import {AppPortal} from './ui';
import {CompactIconButton} from './CompactPromptControls';
export function PromptWeightPanel({title,closeLabel,onClose,children}:{title:string;closeLabel:string;onClose:()=>void;children:ReactNode}) {
 const ref=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close.current();}if(e.key!=='Tab')return;
   const nodes=[...ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,[tabindex="0"]')??[]].filter(n=>n.getClientRects().length);
   if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}
  };document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('keydown',key,true);previous?.focus({preventScroll:true});};
 },[]);
 return <AppPortal><div className="modal-backdrop prompt-weight-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="prompt-weight-dialog" ref={ref} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><CompactIconButton label={closeLabel} icon="close" onClick={onClose}/></header><div className="prompt-weight-body">{children}</div></section></div></AppPortal>;
}
