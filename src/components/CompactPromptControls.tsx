import {useEffect,useRef,useState,type ButtonHTMLAttributes,type ReactNode} from 'react';
import {AppPortal,SelectMenu} from './ui';
import {RESOLUTION_TIERS,RESOLUTION_RATIOS,resolutionForTier,nearestResolutionTier,nearestResolutionRatio,resolutionLabels} from '../resolution-tiers';
import {Icon,type IconName} from './icons';
import {capsulePromptUnits,removeCapsuleUnit,compactText} from '../compact-prompt';
import '../compact-prompt.css';

export function CompactIconButton({label,icon,children,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{label:string;icon:IconName}) {
 return <button {...props} type="button" className={`compact-icon-button ${props.className??''}`} title={label} aria-label={label} data-tooltip={label}><Icon name={icon}/>{children}</button>;
}
export function FurryModeSwitch({checked,onChange,label,disabled=false}:{checked:boolean;onChange:(value:boolean)=>void|Promise<void>;label:string;disabled?:boolean}) {
 const [busy,setBusy]=useState(false);
 return <button type="button" role="switch" aria-checked={checked} aria-label={label} title={label} data-tooltip={label} disabled={disabled||busy} className="compact-furry-switch" onClick={()=>{setBusy(true);void Promise.resolve().then(()=>onChange(!checked)).finally(()=>setBusy(false));}}><Icon name="paw"/><span className="compact-switch-track" aria-hidden="true"><span/></span></button>;
}
export function ResolutionPicker({width,height,onChange,language,children}:{width:number;height:number;onChange:(size:{width:number;height:number})=>void;language:unknown;children:ReactNode}) {
 const root=useRef<HTMLDivElement>(null);const focusDimensions=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>root.current?.querySelector<HTMLInputElement>('input')?.focus()));
 const labels=resolutionLabels(language),tier=nearestResolutionTier(width,height),ratio=nearestResolutionRatio(width,height);
 const sizeRatio=ratio==='custom'?`${width}:${height}`:ratio;
 return <div ref={root} className="compact-resolution resolution-tier-picker">
  <div className="resolution-selectors">
   <div><span className="resolution-select-label">{labels.tier}</span><SelectMenu ariaLabel={labels.tier} value={String(tier)} options={[...RESOLUTION_TIERS.map((t,i)=>({value:String(t),label:`${t} MP · ${labels.tiers[i]}`})),{value:'custom',label:labels.custom}]} onChange={value=>{if(value!=='custom')onChange(resolutionForTier(Number(value),sizeRatio));else focusDimensions();}}/></div>
   <div><span className="resolution-select-label">{labels.ratio}</span><SelectMenu ariaLabel={labels.ratio} value={ratio} options={[...RESOLUTION_RATIOS.map(value=>({value,label:value})),{value:'custom',label:labels.custom}]} onChange={value=>{if(value!=='custom')onChange(resolutionForTier(tier==='custom'?1:tier,value));else focusDimensions();}}/></div>
  </div>
  <div className="resolution-actual" title={width*height<=1024*1024?labels.normal:labels.large} aria-live="polite">{width} × {height} · {(width*height/1_000_000).toFixed(3)} MP</div>

  <div className="compact-custom-size">{children}</div>

 </div>;
}
export function CapsuleEditor({title,value,onChange,onAdd,onClose,language,children}:{title:string;value:string;onChange:(value:string)=>void;onAdd:(tag:string)=>void;onClose:()=>void;language:unknown;children:ReactNode}) {
 const ref=useRef<HTMLElement>(null),close=useRef(onClose),[draft,setDraft]=useState('');close.current=onClose;
 const text=compactText(language),units=capsulePromptUnits(value);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close.current();return;}
   if(e.key!=='Tab')return;
   const elements=[...ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select,[tabindex="0"]')??[]].filter(el=>el.getClientRects().length);
   const first=elements[0],last=elements[elements.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  };
  document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('keydown',key,true);previous?.focus({preventScroll:true});};
 },[]);
 return <AppPortal><div className="modal-backdrop compact-capsule-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={ref} className="modal compact-capsule-dialog" role="dialog" aria-modal="true" aria-label={title}>
  <header><h2>{title}</h2><CompactIconButton label={text[5]} icon="close" onClick={onClose}/></header>
  <div className="compact-capsule-body"><h3>{text[2]}</h3><div className="compact-current-tags">{units.map((unit,index)=><span key={`${index}:${unit.text}`}><span>{unit.text}</span><button type="button" aria-label={`${text[6]} ${unit.text}`} title={`${text[6]} ${unit.text}`} onClick={()=>onChange(removeCapsuleUnit(value,index))}><Icon name="close"/></button></span>)}</div>
  <form className="compact-tag-add" onSubmit={e=>{e.preventDefault();if(draft.trim()){onAdd(draft.trim());setDraft('');}}}><input aria-label={text[4]} placeholder={text[4]} value={draft} onChange={e=>setDraft(e.target.value)}/><button type="submit" disabled={!draft.trim()}>{text[3]}</button></form>
  {children}</div></section></div></AppPortal>;
}
