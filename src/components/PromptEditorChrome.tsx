import {Icon} from './icons';
import {useId,useRef,useState,type ReactNode} from 'react';
import {resolutionLabels} from '../resolution-tiers';

export function SlidingPromptToolbar({children,language,onCollapse}:{children:ReactNode;language:unknown;onCollapse:()=>void}) {
  const [open,setOpen]=useState(false),id=useId(),toggle=useRef<HTMLButtonElement>(null),labels=resolutionLabels(language);
  function close(){setOpen(false);onCollapse();toggle.current?.focus();}
  return <div className="prompt-toolbar-dock" data-open={open} onKeyDown={e=>{if(!e.currentTarget.contains(e.target as Node))return;if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();close();}}}>
    <div id={id} className="prompt-toolbar-reveal" inert={!open} aria-hidden={!open}><div className="prompt-toolbar-content">{children}</div></div>
    <button ref={toggle} type="button" className="compact-icon-button prompt-toolbar-toggle" aria-label={open?labels.collapse:labels.expand} title={open?labels.collapse:labels.expand} aria-expanded={open} aria-controls={id} onClick={()=>{if(open)close();else setOpen(true);}}><Icon name={open?'chevronDown':'sparkles'}/></button>
  </div>;
}
export function PromptResizeHandle({language}:{language:unknown}) {
  const ref=useRef<HTMLDivElement>(null),drag=useRef<{y:number;height:number}|null>(null),[height,setHeight]=useState(240),label=resolutionLabels(language).resize;
  function resize(value:number|null){const editor=ref.current?.closest<HTMLElement>('.prompt-editor');if(!editor)return;const next=value===null?240:Math.max(140,Math.min(720,Math.round(value)));setHeight(next);if(value===null)editor.style.removeProperty('--prompt-editor-height');else editor.style.setProperty('--prompt-editor-height',`${next}px`);}
  return <div ref={ref} className="prompt-resize-handle" role="separator" aria-orientation="horizontal" aria-label={label} title={label} tabIndex={0} aria-valuemin={140} aria-valuemax={720} aria-valuenow={height}
    onDoubleClick={()=>resize(null)} onKeyDown={e=>{if(e.key==='Home'){e.preventDefault();resize(null);}else if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();resize(height+(e.key==='ArrowUp'?-20:20));}}}
    onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();const textarea=ref.current?.closest('.prompt-editor')?.querySelector('textarea');if(!textarea)return;drag.current={y:e.clientY,height:textarea.getBoundingClientRect().height};e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{if(drag.current)resize(drag.current.height+e.clientY-drag.current.y);}}
    onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}><span/></div>;
}
