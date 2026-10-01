import {useId,useLayoutEffect,useRef,useState} from 'react';
import {AppPortal,Button} from './ui';
import {Icon} from './icons';
import {historyPathText} from '../agent/preferences';
export function FilePathDialog({path,title,copyLabel,copiedLabel,closeLabel,unavailable,onClose}:{path:string;title:string;copyLabel:string;copiedLabel:string;closeLabel:string;unavailable:string;onClose:()=>void}){
 const id=useId(),ref=useRef<HTMLElement>(null),[copied,setCopied]=useState(false),[error,setError]=useState(''),value=historyPathText(path);
 useLayoutEffect(()=>{ref.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});},[]);
 return <AppPortal><div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}} onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();onClose();}}}>
  <section ref={ref} className="modal input-modal history-path-dialog" role="dialog" aria-modal="true" aria-labelledby={id}>
   <header><h2 id={id}>{title}</h2><button aria-label={closeLabel} onClick={onClose}><Icon name="close"/></button></header>
   <div className="input-modal-body"><textarea readOnly aria-label={title} value={value||unavailable} rows={3}/>{error&&<p role="alert">{error}</p>}</div>
   <footer><Button disabled={!value} onClick={async()=>{try{await navigator.clipboard.writeText(value);setCopied(true);setError('');}catch(reason){setError(String(reason));}}}><Icon name="copy"/>{copied?copiedLabel:copyLabel}</Button><Button variant="primary" onClick={onClose}>{closeLabel}</Button></footer>
  </section>
 </div></AppPortal>;
}
