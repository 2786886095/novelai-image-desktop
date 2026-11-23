import {useEffect,useId,useRef,useState,type ButtonHTMLAttributes,type ReactNode} from 'react';
import {AppPortal,SelectMenu} from './ui';
import {RESOLUTION_TIERS,RESOLUTION_RATIOS,resolutionForTier,nearestResolutionTier,nearestResolutionRatio,resolutionLabels,resolutionPickerRatio,resolutionSizeAllowed} from '../resolution-tiers';
import {Icon,type IconName} from './icons';
import {capsuleTagUnits,capsuleWeightText,changeCapsuleWeight,removeCapsuleTag,compactText,capsuleWheelDirection} from '../compact-prompt';
import {tagPackKey,useTagPackLabels} from '../tag-pack-lookup';
import '../compact-prompt.css';

export function CompactIconButton({label,icon,children,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{label:string;icon:IconName}) {
 return <button {...props} type="button" className={`compact-icon-button ${props.className??''}`} title={label} aria-label={label} data-tooltip={label}><Icon name={icon}/>{children}</button>;
}
export function FurryModeSwitch({checked,onChange,label,disabled=false}:{checked:boolean;onChange:(value:boolean)=>void|Promise<void>;label:string;disabled?:boolean}) {
 const [busy,setBusy]=useState(false);
 return <button type="button" role="switch" aria-checked={checked} aria-label={label} title={label} data-tooltip={label} disabled={disabled||busy} className="compact-furry-switch" onClick={()=>{setBusy(true);void Promise.resolve().then(()=>onChange(!checked)).finally(()=>setBusy(false));}}><Icon name="paw"/><span className="compact-switch-track" aria-hidden="true"><span/></span></button>;
}
export function ResolutionPicker({width,height,onChange,language,children,maxDimension}:{width:number;height:number;onChange:(size:{width:number;height:number})=>void;language:unknown;children:ReactNode;maxDimension?:number}) {
 const root=useRef<HTMLDivElement>(null);const focusDimensions=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>root.current?.querySelector<HTMLInputElement>('input')?.focus()));
 const labels=resolutionLabels(language),tier=nearestResolutionTier(width,height),ratio=nearestResolutionRatio(width,height);
 const sizeRatio=resolutionPickerRatio(width,height);
 const allowed=(t:number,r:string)=>resolutionSizeAllowed(resolutionForTier(t,r),maxDimension);
 return <div ref={root} className="compact-resolution resolution-tier-picker">
  <div className="resolution-selectors">
   <div><span className="resolution-select-label">{labels.tier}</span><SelectMenu ariaLabel={labels.tier} value={String(tier)} options={[...RESOLUTION_TIERS.map((t,i)=>({value:String(t),label:`${t} MP · ${labels.tiers[i]}`,disabled:!allowed(t,sizeRatio)})),{value:'custom',label:labels.custom}]} onChange={value=>{if(value==='custom')focusDimensions();else if(allowed(Number(value),sizeRatio))onChange(resolutionForTier(Number(value),sizeRatio));}}/></div>
   <div><span className="resolution-select-label">{labels.ratio}</span><SelectMenu ariaLabel={labels.ratio} value={ratio} options={[...RESOLUTION_RATIOS.map(value=>({value,label:value,disabled:!allowed(tier==='custom'?1:tier,value)})),{value:'custom',label:labels.custom}]} onChange={value=>{if(value==='custom')focusDimensions();else if(allowed(tier==='custom'?1:tier,value))onChange(resolutionForTier(tier==='custom'?1:tier,value));}}/></div>
  </div>
  <div className="resolution-actual" title={width*height<=1024*1024?labels.normal:labels.large} aria-live="polite">{width} × {height} · {(width*height/1_000_000).toFixed(3)} MP</div>

  <div className="compact-custom-size">{children}</div>

 </div>;
}
export function CapsuleEditor({title,value,onChange,onAdd,onClose,language,children}:{title:string;value:string;onChange:(value:string)=>void;onAdd:(tag:string)=>void;onClose:()=>void;language:unknown;children:ReactNode}) {
 const ref=useRef<HTMLElement>(null),close=useRef(onClose),[draft,setDraft]=useState('');close.current=onClose;
 const [manual,setManual]=useState(false),manualId=useId();
 const text=compactText(language),units=capsuleTagUnits(value),labels=useTagPackLabels(units.map(unit=>unit.core));
 const [increase,decrease,gesture]=capsuleWeightText(language);
 const pending=useRef(value),rendered=useRef(value),write=useRef(onChange);
 if(rendered.current!==value){pending.current=value;rendered.current=value;}
 write.current=onChange;
 const held=useRef<{index:number;pointerId:number}|null>(null);
 function nudge(index:number,direction:1|-1){
  const base=pending.current;
  const next=changeCapsuleWeight(base,index,direction);
  if(next!==base){pending.current=next;write.current(next);}
 }
 useEffect(()=>{
  const release=(event:PointerEvent)=>{if(held.current?.pointerId===event.pointerId)held.current=null;};
  const blur=()=>{held.current=null;};
  let burst:{index:number;direction:1|-1;last:number;pending:number}|null=null;
  const wheel=(event:WheelEvent)=>{
   const direction=capsuleWheelDirection(event);
   if(!direction || !(event.target instanceof Element) || !ref.current?.contains(event.target))return;
   const hovered=event.target.closest<HTMLElement>('[data-capsule-wheel]');
   const index=held.current?.index??(hovered ? Number(hovered.dataset.capsuleWheel) : NaN);
   if(!Number.isInteger(index)||!capsuleTagUnits(pending.current)[index]?.adjustable)return;
   event.preventDefault();
   const now=performance.now();
   const amount=Math.abs(event.deltaY);
   // A small touchpad tick must work immediately after a pause. Coalesce the
   // remaining tiny events in that direction to avoid runaway weights.
   if(event.deltaMode===0 && amount<24 && burst?.index===index && burst.direction===direction && now-burst.last<140){
    burst.pending+=amount;
    if(burst.pending<24)return;
   }
   burst={index,direction,last:now,pending:0};
   nudge(index,direction);
  };
  const target=ref.current;
  target?.addEventListener('wheel',wheel,{passive:false});
  window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);window.addEventListener('blur',blur);
  return ()=>{target?.removeEventListener('wheel',wheel);window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);window.removeEventListener('blur',blur);};
 },[]);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){
    const menu=ref.current?.querySelector<HTMLButtonElement>('[data-capsule-pack-trigger][aria-expanded="true"]');
    const target=e.target;
    if(!menu&&target instanceof HTMLInputElement&&target.matches('[data-capsule-query]')&&target.value)return;
    e.preventDefault();e.stopPropagation();
    if(menu){menu.click();menu.focus();return;}
    close.current();return;
   }
   if(e.key!=='Tab')return;
   const elements=[...ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select,[tabindex="0"]')??[]].filter(el=>!el.closest("[inert]")&&el.getClientRects().length);
   const first=elements[0],last=elements[elements.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  };
  document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('keydown',key,true);previous?.focus({preventScroll:true});};
 },[]);
 return <AppPortal><div className="modal-backdrop compact-capsule-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={ref} className="modal compact-capsule-dialog" role="dialog" aria-modal="true" aria-label={title}>
  <header><h2>{title}</h2><CompactIconButton label={text[5]} icon="close" onClick={onClose}/></header>
  <div className="compact-capsule-body">
  <div className="capsule-selected-head"><h3>{text[2]}{units.length ? ` · ${units.length}` : ''}</h3>
   <button type="button" className="capsule-manual-toggle" aria-expanded={manual} aria-controls={manualId}
     onClick={()=>setManual(value=>!value)}><Icon name="plus"/>{({"zh-CN":"手动输入","zh-TW":"手動輸入","ja-JP":"手入力","ko-KR":"직접 입력"} as Record<string,string>)[String(language)]??"Enter manually"}</button>
  </div>{units.length>0&&<p className="compact-weight-gesture">{gesture}</p>}
  <div className="compact-current-tags">{units.map((unit,index)=>{
   const label=labels.get(tagPackKey(unit.core))?.description||unit.core;
   const shownWeight=unit.weight!==1?` ×${unit.weight}`:'';
   return <span key={index} data-capsule-term={unit.core}>
    <span className="compact-weight-step">
     <button type="button" disabled={!unit.adjustable} aria-label={`${increase}：${label}`} title={increase} onClick={()=>nudge(index,1)}>＋</button>
     <button type="button" disabled={!unit.adjustable} aria-label={`${decrease}：${label}`} title={decrease} onClick={()=>nudge(index,-1)}>－</button>
    </span>
    <button type="button" className="compact-weight-tag" data-capsule-hold data-capsule-wheel={unit.adjustable?index:undefined} title={unit.core}
      aria-label={`${label}${shownWeight} · ${gesture}`}
      onPointerDown={event=>{
       if(event.button!==0||!unit.adjustable)return;
       held.current={index,pointerId:event.pointerId};
      }}
      onKeyDown={event=>{
       if(!unit.adjustable||!['ArrowUp','ArrowDown','+','-'].includes(event.key))return;
       event.preventDefault();nudge(index,event.key==='ArrowUp'||event.key==='+'?1:-1);
      }}
    ><span>{label}</span>{shownWeight&&<small>{shownWeight}</small>}</button>
    <button type="button" aria-label={`${text[6]} ${label}`} title={`${text[6]} ${label}`} onClick={()=>onChange(removeCapsuleTag(value,index))}><Icon name="close"/></button>
   </span>;
  })}</div>
  {manual&&<form id={manualId} className="compact-tag-add" onSubmit={e=>{e.preventDefault();if(draft.trim()){onAdd(draft.trim());setDraft('');}}}><input autoFocus aria-label={text[4]} placeholder={text[4]} value={draft} onChange={e=>setDraft(e.target.value)}/><button type="submit" disabled={!draft.trim()}>{text[3]}</button></form>}
  {children}</div></section></div></AppPortal>;
}
