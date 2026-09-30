import { useEffect, useState, useRef, useCallback, useId, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { relayDashboardOrigin, NAI_ACCOUNT_METHODS, naiAccountTabKey, type NaiAccountsBridge, type NaiAccountMethod, type NaiAccountProfile } from '../nai-accounts';
import { naiAccountText, type NaiAccountTextKey } from '../nai-accounts-locales';
import { useAppStore } from '../store';
import './NaiAccountManager.css';
function bridge(): NaiAccountsBridge | undefined { return (window as unknown as { naiAccounts?: NaiAccountsBridge }).naiAccounts; }
export function NaiAccountDialogFrame({children,title,closeLabel,titleId,panelRef,onClose}:{children:ReactNode;title:string;closeLabel:string;titleId:string;panelRef:RefObject<HTMLDivElement|null>;onClose:()=>void}) {
 return <div className="nai-account-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><div className="nai-account-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><header className="nai-account-dialog-header"><h3 id={titleId}>{title}</h3><button type="button" aria-label={closeLabel} onClick={onClose}>×</button></header>{children}</div></div>;
}
export function NaiAccountManager() {
 const language=useAppStore(s=>s.settings?.language); const nt=(key:NaiAccountTextKey)=>naiAccountText(language,key);
 const [open,setOpen]=useState(false),[accounts,setAccounts]=useState<NaiAccountProfile[]>([]),[method,setMethod]=useState<NaiAccountMethod>('token');
 const [label,setLabel]=useState(''),[token,setToken]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [api,setApi]=useState(''),[image,setImage]=useState(''),[message,setMessage]=useState<NaiAccountTextKey|''>(''),[httpStatus,setHttpStatus]=useState<number>();
 const [busy,setBusy]=useState(false),[selected,setSelected]=useState<string|undefined>(),[hostBusy,setHostBusy]=useState(false);
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);const uid=useId();
 const clearSecrets=useCallback(()=>{setToken('');setPassword('');},[]);
 const close=useCallback(()=>{clearSecrets();setOpen(false);trigger.current?.focus();},[clearSecrets]);
 const generating=useAppStore(s=>s.isGenerating);
 const refresh=async()=>{const [list,state]=await Promise.all([bridge()!.list(),bridge()!.state()]);setAccounts(list);setSelected(state.selectedId);setHostBusy(state.busy);};
 useEffect(()=>{if(!bridge())return;void refresh().catch(()=>setMessage('unavailable'));const id=setInterval(()=>void bridge()!.state().then(s=>{setSelected(s.selectedId);setHostBusy(s.busy);}).catch(()=>{}),1500);return()=>clearInterval(id);},[]);
 useEffect(()=>{
  if(!open)return;panel.current?.focus();
  const keydown=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
   if(event.key!=='Tab')return;
   const items=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')??[]);
   if(!items.length){event.preventDefault();panel.current?.focus();return;}
   const first=items[0],last=items[items.length-1],active=document.activeElement;
   if(event.shiftKey&&(active===first||active===panel.current||!panel.current?.contains(active))){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&(active===last||active===panel.current||!panel.current?.contains(active))){event.preventDefault();first.focus();}
  };
  window.addEventListener('keydown',keydown,true);return()=>window.removeEventListener('keydown',keydown,true);
 },[open,close]);
 if(!bridge()) return null;
 async function action(callback:()=>Promise<void>){setBusy(true);setHttpStatus(undefined);try{await callback();await refresh();}catch{setMessage('failed');}finally{setBusy(false);}}
 async function add(){await action(async()=>{if(method==='official-login'){const input={label,email,password};setPassword('');try{const result=await bridge()!.login(input);if(!result.ok){setMessage(result.code==='otp-unsupported'?'otpUnsupported':result.code==='network'?'networkFailed':'authFailed');return;}}finally{input.password='';}}else{await bridge()!.add({label,token,method,apiBaseUrl:method==='relay'?api:'https://api.novelai.net',imageBaseUrl:method==='relay'?image:'https://image.novelai.net'});setToken('');}setMessage('saved');});}
 const locked=busy||hostBusy||generating;
 async function select(id?:string){await action(async()=>{await bridge()!.select(id);setMessage('switched');const [settings,account]=await Promise.all([window.naiDesktop.getSettings(),window.naiDesktop.accountCached()]);useAppStore.setState({settings,account});});}
 function chooseMethod(value:NaiAccountMethod){setMethod(value);clearSecrets();}
 return <section className="nai-account-manager">
 <label>{nt('selector')} <select disabled={locked} value={selected??''} onChange={e=>void select(e.target.value||undefined)}><option value="">{nt('legacy')}</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.label} · {nt(a.method==='token'?'officialToken':a.method==='relay'?'relay':'login')}</option>)}</select></label>
 <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>{nt('manage')}</button>
 {open&&createPortal(<NaiAccountDialogFrame title={nt('title')} closeLabel={nt('close')} titleId={`${uid}-title`} panelRef={panel} onClose={close}>
 <p className="nai-account-note">{nt('safety')}</p>
 <div className="nai-account-method-tabs" role="tablist" aria-label={nt('method')}>{NAI_ACCOUNT_METHODS.map(value=><button type="button" key={value} disabled={busy} role="tab" id={`${uid}-${value}`} aria-selected={value===method} aria-controls={`${uid}-fields`} tabIndex={value===method?0:-1} onClick={()=>chooseMethod(value)} onKeyDown={event=>{const next=naiAccountTabKey(value,event.key);if(next!==value){event.preventDefault();chooseMethod(next);panel.current?.querySelector<HTMLElement>(`[id="${uid}-${next}"]`)?.focus();}}}>{nt(value==='token'?'officialToken':value==='relay'?'relay':'login')}</button>)}</div>
 <div role="tabpanel" id={`${uid}-fields`} aria-labelledby={`${uid}-${method}`}>
 <label>{nt('name')}<input autoComplete="off" value={label} onChange={e=>setLabel(e.target.value)}/></label>
 {method==='official-login'?<><label>{nt('email')}<input type="email" autoComplete="off" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)}/></label><label>{nt('password')}<input type="password" autoComplete="off" spellCheck={false} value={password} onChange={e=>setPassword(e.target.value)}/></label><p className="nai-account-note">{nt('loginSafety')}</p></>:<label>{nt(method==='relay'?'relayToken':'officialToken')}<input type="password" autoComplete="off" spellCheck={false} value={token} onChange={e=>setToken(e.target.value)}/></label>}
 {method==='relay'&&<><label>{nt('api')}<input autoComplete="off" value={api} onChange={e=>setApi(e.target.value)}/></label><button type="button" onClick={()=>{try{setApi(relayDashboardOrigin(api));setMessage('origin');}catch{setMessage('https');}}}>{nt('extract')}</button><label>{nt('imageOptional')}<input autoComplete="off" value={image} onChange={e=>setImage(e.target.value)}/></label><p className="nai-account-note">{nt('relaySafety')}</p></>}
 <button type="button" className="nai-account-primary" disabled={busy||!label||(method==='official-login'?!email||!password:!token)} onClick={()=>void add()}>{nt(method==='official-login'?'saveLogin':'save')}</button>
 </div>
 <ul className="nai-account-list">{accounts.map(a=><li key={a.id}><span>{a.label} · {nt(a.method==='token'?'officialToken':a.method==='relay'?'relay':'login')}</span><div><button type="button" disabled={locked} onClick={()=>void action(async()=>{const r=await bridge()!.probe(a.id);setHttpStatus(r.status===0?undefined:r.status);setMessage(r.status===0?'probeSkipped':'probeStatus');})}>{nt('probe')}</button><button type="button" disabled={locked||a.id===selected} onClick={()=>{if(window.confirm(`${nt('confirmDelete')}\n${a.label}`))void action(async()=>{await bridge()!.remove(a.id);setMessage('deleted');});}}>{nt('remove')}</button></div></li>)}</ul>
 <button type="button" disabled={locked} onClick={()=>void action(async()=>{const r=await bridge()!.migrate();setMessage(r.migrated?'copied':'copySkipped');})}>{nt('migrate')}</button>
 <p role="status" aria-live="polite">{httpStatus!==undefined?`HTTP ${httpStatus}: `:''}{message?nt(message):''}</p>
 </NaiAccountDialogFrame>,document.body)}</section>;
}
