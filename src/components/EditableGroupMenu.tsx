import {useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {AppPortal} from './ui';
import {resolveSelectPortalLayer} from './portal-layer';
import {Icon} from './icons';

type Option={value:string;label:string};
export function EditableGroupMenu({label,value,placeholder,options,onChange,className='field'}:{
 label:string;value:string;placeholder:string;options:Option[];onChange:(value:string)=>void;className?:string
}){
 const id=useId(),list=id+'-list',input=useRef<HTMLInputElement>(null),root=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false),[filter,setFilter]=useState(false),[active,setActive]=useState(-1);
 const [position,setPosition]=useState<CSSProperties>({});
 const query=filter?value.trim().toLocaleLowerCase():'';
 const matches=options.filter(o=>!query||[o.value,o.label].some(s=>s.toLocaleLowerCase().includes(query)));
 const visible=open&&matches.length>0;
 const close=()=>{setOpen(false);setActive(-1);};
 const choose=(o:Option)=>{onChange(o.value);input.current?.focus();close();};
 useLayoutEffect(()=>{
  if(!visible||!input.current)return;
  const place=()=>{const el=input.current;if(!el)return;const r=el.getBoundingClientRect(),gap=6,below=window.innerHeight-r.bottom-gap,above=r.top-gap;
   const up=below<Math.min(matches.length*40+8,220)&&above>below;
   setPosition({position:'fixed',left:r.left,width:r.width,top:up?undefined:r.bottom+gap,bottom:up?window.innerHeight-r.top+gap:undefined,maxHeight:Math.max(48,Math.min(280,(up?above:below)-8)),zIndex:resolveSelectPortalLayer(el)});
  };place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[visible,matches.length]);
 useEffect(()=>{if(visible&&active>=0)document.getElementById(list+'-'+active)?.scrollIntoView({block:'nearest'});},[active,visible,list]);
 const toggle=()=>{const show=!visible;input.current?.focus();setFilter(false);setOpen(show);setActive(-1);};
 return <div className={className}><label htmlFor={id}>{label}</label><div className="studio-editable-group" ref={root}>
  <input ref={input} id={id} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={visible} aria-controls={visible?list:undefined} aria-activedescendant={visible&&active>=0?list+'-'+active:undefined}
   value={value} placeholder={placeholder} onFocus={()=>{setFilter(false);setOpen(true);}} onBlur={close}
   onChange={e=>{onChange(e.target.value);setFilter(true);setOpen(true);setActive(-1);}}
   onKeyDown={e=>{if(e.nativeEvent.isComposing)return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(!matches.length)return;e.preventDefault();setOpen(true);setActive(i=>(e.key==='ArrowDown'?i+1:i<0?matches.length-1:i-1+matches.length)%matches.length);}
    else if(e.key==='Enter'&&visible&&matches[active]){e.preventDefault();choose(matches[active]);}
    else if(e.key==='Escape'&&visible){e.preventDefault();e.stopPropagation();close();}
   }}/>
  {options.length>0&&<button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={visible} onMouseDown={e=>e.preventDefault()} onClick={toggle}><Icon name="chevronDown"/></button>}
  {visible&&<AppPortal container={root.current?.closest('dialog[open]')??undefined}><div className="select-menu-popover" style={position} role="listbox" aria-label={label} id={list}>
   {matches.map((o,i)=><button type="button" tabIndex={-1} role="option" key={o.value} id={list+'-'+i} aria-selected={i===active} className={'select-menu-option'+(i===active||o.value===value?' selected':'')} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(o)}>{o.label}</button>)}
  </div></AppPortal>}
 </div></div>;
}
