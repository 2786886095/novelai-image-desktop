import { useEffect, useState, useRef, useCallback, useId, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { relayDashboardOrigin, nextNaiAccountLabel, NAI_ACCOUNT_METHODS, naiAccountTabKey, type NaiAccountsBridge, type NaiAccountMethod, type NaiAccountProfile } from '../nai-accounts';
import { naiAccountText, type NaiAccountTextKey } from '../nai-accounts-locales';
import { useAppStore } from '../store';
import { SelectMenuCompat } from './ui';
import { LuKeyRound, LuMail, LuGlobe, LuPlus, LuX, LuUserRound } from 'react-icons/lu';
import { motionReduced } from '../motion-system';
import './NaiAccountManager.css';
function bridge(): NaiAccountsBridge | undefined { return (window as unknown as { naiAccounts?: NaiAccountsBridge }).naiAccounts; }
export function NaiAccountDialogFrame({children,title,closeLabel,titleId,panelRef,onClose,closing=false}:{closing?:boolean;children:ReactNode;title:string;closeLabel:string;titleId:string;panelRef:RefObject<HTMLDivElement|null>;onClose:()=>void}) {
 return <div className={`nai-account-overlay${closing?' is-leaving':''}`} onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><div className="nai-account-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><header className="nai-account-dialog-header"><h3 id={titleId}>{title}</h3><button type="button" aria-label={closeLabel} onClick={onClose}><LuX aria-hidden/></button></header>{children}</div></div>;
}
export function NaiAccountManager({variant='toolbar',onSelectionChange}:{variant?:'toolbar'|'settings';onSelectionChange?:(id:string|undefined)=>void}={}) {
 const language=useAppStore(s=>s.settings?.language); const nt=(key:NaiAccountTextKey)=>naiAccountText(language,key);
 const [open,setOpen]=useState(variant==='settings'),[accounts,setAccounts]=useState<NaiAccountProfile[]>([]),[method,setMethod]=useState<NaiAccountMethod>('token');
 const [label,setLabel]=useState('用户1'),[token,setToken]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [api,setApi]=useState(''),[image,setImage]=useState(''),[message,setMessage]=useState<NaiAccountTextKey|''>(''),[httpStatus,setHttpStatus]=useState<number>();
 const [busy,setBusy]=useState(false),[selected,setSelected]=useState<string|undefined>(),[hostBusy,setHostBusy]=useState(false);
 useEffect(()=>{setLabel(nextNaiAccountLabel(accounts));},[accounts.map(a=>a.id).join('|')]);
 const [closing,setClosing]=useState(false); const closeTimer=useRef<number|undefined>(undefined);
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);const uid=useId();
 const clearSecrets=useCallback(()=>{setToken('');setPassword('');},[]);
 const close=useCallback(()=>{clearSecrets();setClosing(true);closeTimer.current=window.setTimeout(()=>{setOpen(false);setClosing(false);trigger.current?.focus();},motionReduced()?0:160);},[clearSecrets]);
 useEffect(()=>()=>window.clearTimeout(closeTimer.current),[]);
 const generating=useAppStore(s=>s.isGenerating);
 const refresh=async()=>{const [list,state]=await Promise.all([bridge()!.list(),bridge()!.state()]);setAccounts(list);setSelected(state.selectedId);setHostBusy(state.busy);if(state.migrationIssue)setMessage('migrationFailed');onSelectionChange?.(state.selectedId);};
 useEffect(()=>{if(!bridge())return;const changed=()=>void refresh().catch(()=>setMessage('unavailable'));window.addEventListener('studio:nai-accounts-changed',changed);void refresh().catch(()=>setMessage('unavailable'));const id=setInterval(()=>void bridge()!.state().then(s=>{setSelected(s.selectedId);setHostBusy(s.busy);onSelectionChange?.(s.selectedId);}).catch(()=>{}),1500);return()=>{clearInterval(id);window.removeEventListener('studio:nai-accounts-changed',changed);};},[]);
 useEffect(()=>{
  if(!open||variant==='settings')return;panel.current?.focus();
  const keydown=(event:KeyboardEvent)=>{
   if(event.target instanceof Element&&event.target.closest('.select-menu-popover'))return;
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
 async function action(callback:()=>Promise<void>){setBusy(true);setHttpStatus(undefined);try{await callback();await refresh();window.dispatchEvent(new Event('studio:nai-accounts-changed'));}catch{setMessage('failed');}finally{setBusy(false);}}
 async function add(){await action(async()=>{if(method==='official-login'){const input={label,email,password};setPassword('');try{const result=await bridge()!.login(input);if(!result.ok){setMessage(result.code==='otp-unsupported'?'otpUnsupported':result.code==='network'?'networkFailed':'authFailed');return;}}finally{input.password='';}}else{await bridge()!.add({label,token,method,apiBaseUrl:method==='relay'?api:'https://api.novelai.net',imageBaseUrl:method==='relay'?image:'https://image.novelai.net'});setToken('');}setMessage('saved');});}
 const locked=busy||hostBusy||generating;
 async function select(id?:string){await action(async()=>{await bridge()!.select(id);setMessage('switched');const [settings,account]=await Promise.all([window.naiDesktop.getSettings(),window.naiDesktop.accountCached()]);useAppStore.setState({settings,account});});}
 function chooseMethod(value:NaiAccountMethod){setMethod(value);clearSecrets();}
 const selector=<div className="nai-account-selector"><LuUserRound aria-hidden/><span className="nai-account-selector-label">{nt('selector')}</span><SelectMenuCompat aria-label={nt('selector')} disabled={locked} value={selected??''} onChange={e=>void select(e.target.value||undefined)}>{!selected&&<option value="" disabled>{nt('noAccount')}</option>}{accounts.map(a=><option key={a.id} value={a.id}>{a.label} · {nt(a.method==='token'?'officialToken':a.method==='relay'?'relay':'login')}</option>)}</SelectMenuCompat></div>;
 const content=<div className="nai-account-surface">
 <p className="nai-account-note">{nt('safety')}</p><h4 className="nai-account-form-title"><LuPlus aria-hidden/>{nt('addAccount')}</h4>
 <div className="nai-account-method-tabs" role="tablist" aria-label={nt('method')}>{NAI_ACCOUNT_METHODS.map(value=><button type="button" key={value} disabled={busy} role="tab" id={`${uid}-${value}`} aria-selected={value===method} aria-controls={`${uid}-fields`} tabIndex={value===method?0:-1} onClick={()=>chooseMethod(value)} onKeyDown={event=>{const next=naiAccountTabKey(value,event.key);if(next!==value){event.preventDefault();chooseMethod(next);event.currentTarget.parentElement?.querySelector<HTMLElement>(`[id="${uid}-${next}"]`)?.focus();}}}>{value==='token'?<LuKeyRound aria-hidden/>:value==='relay'?<LuGlobe aria-hidden/>:<LuMail aria-hidden/>}{nt(value==='token'?'officialToken':value==='relay'?'relay':'login')}</button>)}</div>
 <div className="nai-account-fields" key={method} role="tabpanel" id={`${uid}-fields`} aria-labelledby={`${uid}-${method}`}>
 <label>{nt('name')}<input autoComplete="off" value={label} onChange={e=>setLabel(e.target.value)}/></label>
 {method==='official-login'?<><label>{nt('email')}<input type="email" autoComplete="off" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)}/></label><label>{nt('password')}<input type="password" autoComplete="off" spellCheck={false} value={password} onChange={e=>setPassword(e.target.value)}/></label><p className="nai-account-note">{nt('loginSafety')}</p></>:<label>{nt(method==='relay'?'relayToken':'officialToken')}<input type="password" autoComplete="off" spellCheck={false} value={token} onChange={e=>setToken(e.target.value)}/></label>}
 {method==='relay'&&<><label>{nt('api')}<input autoComplete="off" value={api} onChange={e=>setApi(e.target.value)}/></label><button type="button" onClick={()=>{try{setApi(relayDashboardOrigin(api));setMessage('origin');}catch{setMessage('https');}}}>{nt('extract')}</button><label>{nt('imageOptional')}<input autoComplete="off" value={image} onChange={e=>setImage(e.target.value)}/></label><p className="nai-account-note">{nt('relaySafety')}</p></>}
 <button type="button" className="nai-account-primary" disabled={locked||!label||(method==='official-login'?!email||!password:!token)} onClick={()=>void add()}>{nt(method==='official-login'?'saveLogin':'save')}</button>
 </div>
 <ul className="nai-account-list">{accounts.map(a=><li key={a.id}><span>{a.label} · {nt(a.method==='token'?'officialToken':a.method==='relay'?'relay':'login')}</span><div><button type="button" aria-pressed={a.id===selected} disabled={locked||a.id===selected} onClick={()=>void select(a.id)}>{nt(a.id===selected?'current':'useAccount')}</button><button type="button" disabled={locked} onClick={()=>void action(async()=>{const r=await bridge()!.probe(a.id);setHttpStatus(r.status===0?undefined:r.status);setMessage(r.status===0?'probeSkipped':'probeStatus');})}>{nt('probe')}</button><button type="button" disabled={locked||a.id===selected} onClick={()=>{if(window.confirm(`${nt('confirmDelete')}\n${a.label}`))void action(async()=>{await bridge()!.remove(a.id);setMessage('deleted');});}}>{nt('remove')}</button></div></li>)}</ul>
 <p role="status" aria-live="polite">{httpStatus!==undefined?`HTTP ${httpStatus}: `:''}{message?nt(message):''}</p>
 </div>;
 if(variant==='settings')return <section className="nai-account-settings" aria-label={nt('title')}><header><div><h3>{nt('title')}</h3><p className="nai-account-note">{nt('settingsHint')}</p></div></header>{selector}{content}</section>;
 return <section className="nai-account-manager">{selector}<button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setClosing(false);setOpen(true)}}><LuPlus aria-hidden/>{nt('manage')}</button>
 {open&&createPortal(<NaiAccountDialogFrame title={nt('title')} closeLabel={nt('close')} titleId={`${uid}-title`} panelRef={panel} onClose={close} closing={closing}>{selector}{content}</NaiAccountDialogFrame>,document.body)}</section>;
}
