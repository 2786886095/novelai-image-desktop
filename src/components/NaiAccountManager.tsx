import { useEffect, useLayoutEffect, useState, useRef, useCallback, useId, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { relayDashboardOrigin, nextNaiAccountLabel, NAI_ACCOUNT_METHODS, naiAccountTabKey, type NaiAccountsBridge, type NaiAccountMethod, type NaiAccountProfile, type NaiAccountValidationResult } from '../nai-accounts';
import { naiAccountText, type NaiAccountTextKey } from '../nai-accounts-locales';
import { useAppStore } from '../store';
import { SelectMenuCompat } from './ui';
import { LuKeyRound, LuMail, LuGlobe, LuPlus, LuX, LuUserRound, LuEye, LuEyeOff, LuCopy } from 'react-icons/lu';
import {confirmAction} from './confirm';
import { motionReduced } from '../motion-system';
import './NaiAccountManager.css';
function validationText(code:NaiAccountValidationResult['code']):NaiAccountTextKey {return code==='passed'?'validationPassed':code==='auth'?'validationAuth':code==='unsupported'?'validationUnsupported':code==='network'?'validationNetwork':code==='invalid-input'?'validationInput':code==='invalid-response'?'validationResponse':'validationHttp';}
function bridge(): NaiAccountsBridge | undefined { return (window as unknown as { naiAccounts?: NaiAccountsBridge }).naiAccounts; }
export function NaiAccountDialogFrame({children,title,closeLabel,titleId,panelRef,onClose,closing=false}:{closing?:boolean;children:ReactNode;title:string;closeLabel:string;titleId:string;panelRef:RefObject<HTMLDivElement|null>;onClose:()=>void}) {
 return <div className={`nai-account-overlay${closing?' is-leaving':''}`} onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><div className="nai-account-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><header className="nai-account-dialog-header"><h3 id={titleId}>{title}</h3><button type="button" aria-label={closeLabel} onClick={onClose}><LuX aria-hidden/></button></header>{children}</div></div>;
}
export function NaiAccountManager({variant='toolbar',onSelectionChange}:{variant?:'toolbar'|'settings';onSelectionChange?:(id:string|undefined)=>void}={}) {
 const language=useAppStore(s=>s.settings?.language); const nt=(key:NaiAccountTextKey)=>naiAccountText(language,key);
 const [open,setOpen]=useState(variant==='settings'),[accounts,setAccounts]=useState<NaiAccountProfile[]>([]),[method,setMethod]=useState<NaiAccountMethod>('token');
 const [revealed,setRevealed]=useState<{id:string;value:string}>(),[showToken,setShowToken]=useState(false);
 const secretRequest=useRef(0),deleteAbort=useRef<AbortController|null>(null);
 const nameInput=useRef<HTMLInputElement>(null),focusAfterDelete=useRef(false);
 const [confirming,setConfirming]=useState(false);
 const [label,setLabel]=useState('用户1'),[token,setToken]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [api,setApi]=useState(''),[image,setImage]=useState(''),[message,setMessage]=useState<NaiAccountTextKey|''>(''),[httpStatus,setHttpStatus]=useState<number>();
 const [busy,setBusy]=useState(false),[selected,setSelected]=useState<string|undefined>(),[hostBusy,setHostBusy]=useState(false);
 useEffect(()=>{setLabel(nextNaiAccountLabel(accounts));},[accounts.map(a=>a.id).join('|')]);
 const [closing,setClosing]=useState(false); const closeTimer=useRef<number|undefined>(undefined);
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);const uid=useId();
 const clearSecrets=useCallback(()=>{secretRequest.current++;setRevealed(undefined);setShowToken(false);setToken('');setPassword('');},[]);
 const close=useCallback(()=>{deleteAbort.current?.abort();clearSecrets();setClosing(true);closeTimer.current=window.setTimeout(()=>{setOpen(false);setClosing(false);trigger.current?.focus();},motionReduced()?0:160);},[clearSecrets]);
 useEffect(()=>()=>{deleteAbort.current?.abort();secretRequest.current++;window.clearTimeout(closeTimer.current);},[]);
 const generating=useAppStore(s=>s.isGenerating);
 const refresh=async()=>{const [list,state]=await Promise.all([bridge()!.list(),bridge()!.state()]);setAccounts(list);setSelected(state.selectedId);setHostBusy(state.busy);if(state.migrationIssue)setMessage('migrationFailed');onSelectionChange?.(state.selectedId);};
 useEffect(()=>{if(!bridge())return;const changed=()=>void refresh().catch(()=>setMessage('unavailable'));window.addEventListener('studio:nai-accounts-changed',changed);void refresh().catch(()=>setMessage('unavailable'));const id=setInterval(()=>void bridge()!.state().then(s=>{setSelected(s.selectedId);setHostBusy(s.busy);onSelectionChange?.(s.selectedId);}).catch(()=>{}),1500);return()=>{clearInterval(id);window.removeEventListener('studio:nai-accounts-changed',changed);};},[]);
 useEffect(()=>{
  if(!open||variant==='settings')return;panel.current?.focus();
  const keydown=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||event.target instanceof Element&&event.target.closest('.select-menu-popover,.app-confirm-backdrop'))return;
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
 async function action(callback:()=>Promise<void>){setBusy(true);setHttpStatus(undefined);try{await callback();await refresh();window.dispatchEvent(new Event('studio:nai-accounts-changed'));}catch(error){const match=String(error).match(/NAI_ACCOUNT_VALIDATION:([\w-]+):(\d+)/);if(match){setHttpStatus(Number(match[2])||undefined);setMessage(validationText(match[1] as NaiAccountValidationResult['code']));}else setMessage('failed');}finally{setBusy(false);}}
 async function add(){setMessage('validating');await action(async()=>{if(method==='official-login'){const input={label,email,password};setPassword('');try{const result=await bridge()!.login(input);if(!result.ok){if(result.validation){setHttpStatus(result.validation.status||undefined);setMessage(validationText(result.validation.code));return;}setMessage(result.code==='otp-unsupported'?'otpUnsupported':result.code==='network'?'networkFailed':'authFailed');return;}}finally{input.password='';}}else{await bridge()!.add({label,token,method,apiBaseUrl:method==='relay'?api:'https://api.novelai.net',imageBaseUrl:method==='relay'?image:'https://image.novelai.net'});setToken('');}setMessage('saved');});}
 const locked=busy||confirming||hostBusy||generating;
 useLayoutEffect(()=>{if(!busy&&focusAfterDelete.current){focusAfterDelete.current=false;const focused=document.activeElement;if(!focused||focused===document.body||!focused.isConnected||focused.closest('[inert],.app-confirm-backdrop.is-leaving'))nameInput.current?.focus({preventScroll:true});}},[busy,accounts.map(a=>a.id).join('|')]);
 async function removeAccount(account:NaiAccountProfile){
  if(locked)return;setConfirming(true);const controller=new AbortController();deleteAbort.current=controller;
  try{
   if(!await confirmAction(`${nt('confirmDelete')}\n${account.label}`,nt('remove'),undefined,controller.signal,{confirm:nt('remove'),cancel:nt('cancel')}))return;
   if(controller.signal.aborted)return;
   await action(async()=>{clearSecrets();await bridge()!.remove(account.id);await syncActiveAccount();focusAfterDelete.current=true;setMessage('deleted');});
  }finally{deleteAbort.current=null;setConfirming(false);}
 }
 useEffect(()=>{secretRequest.current++;setRevealed(undefined);},[selected,accounts.map(a=>a.id).join('|')]);
 async function syncActiveAccount(){const [settings,account]=await Promise.all([window.naiDesktop.getSettings(),window.naiDesktop.accountCached()]);useAppStore.setState({settings,account});}
 async function keyAction(id:string,copy=false){
  if(!copy&&revealed?.id===id){secretRequest.current++;setRevealed(undefined);return;}
  const request=++secretRequest.current;setBusy(true);
  try{const value=await bridge()!.reveal(id);if(request!==secretRequest.current)return;
   if(copy){await navigator.clipboard.writeText(value);if(request===secretRequest.current)setMessage('keyCopied');}
   else setRevealed({id,value});
  }catch{if(request===secretRequest.current)setMessage(copy?'keyCopyFailed':'keyFailed');}finally{setBusy(false);}
 }
 async function select(id?:string){await action(async()=>{await bridge()!.select(id);setMessage('switched');await syncActiveAccount();});}
 function chooseMethod(value:NaiAccountMethod){setMethod(value);clearSecrets();}
 if(!bridge())return null;
 const selector=<div className="nai-account-selector"><LuUserRound aria-hidden/><span className="nai-account-selector-label">{nt('selector')}</span><SelectMenuCompat aria-label={nt('selector')} disabled={locked} value={selected??''} onChange={e=>void select(e.target.value||undefined)}>{!selected&&<option value="" disabled>{nt('noAccount')}</option>}{accounts.map(a=><option key={a.id} value={a.id}>{a.label} · {nt(a.method==='token'?'officialToken':a.method==='relay'?'relay':'login')}</option>)}</SelectMenuCompat></div>;
 const content=<div className="nai-account-surface">
 <p className="nai-account-note">{nt('safety')}</p><h4 className="nai-account-form-title"><LuPlus aria-hidden/>{nt('addAccount')}</h4>
 <div className="nai-account-method-tabs" role="tablist" aria-label={nt('method')}>{NAI_ACCOUNT_METHODS.map(value=><button type="button" key={value} disabled={busy} role="tab" id={`${uid}-${value}`} aria-selected={value===method} aria-controls={`${uid}-fields`} tabIndex={value===method?0:-1} onClick={()=>chooseMethod(value)} onKeyDown={event=>{const next=naiAccountTabKey(value,event.key);if(next!==value){event.preventDefault();chooseMethod(next);event.currentTarget.parentElement?.querySelector<HTMLElement>(`[id="${uid}-${next}"]`)?.focus();}}}>{value==='token'?<LuKeyRound aria-hidden/>:value==='relay'?<LuGlobe aria-hidden/>:<LuMail aria-hidden/>}{nt(value==='token'?'officialToken':value==='relay'?'relay':'login')}</button>)}</div>
 <div className="nai-account-fields" key={method} role="tabpanel" id={`${uid}-fields`} aria-labelledby={`${uid}-${method}`}>
 <label>{nt('name')}<input ref={nameInput} disabled={busy} autoComplete="off" value={label} onChange={e=>setLabel(e.target.value)}/></label>
 {method==='official-login'?<><label>{nt('email')}<input disabled={busy} type="email" autoComplete="off" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)}/></label><label>{nt('password')}<input disabled={busy} type="password" autoComplete="off" spellCheck={false} value={password} onChange={e=>setPassword(e.target.value)}/></label><p className="nai-account-note">{nt('loginSafety')}</p></>:<label>{nt(method==='relay'?'relayToken':'officialToken')}<span className="nai-key-field"><input disabled={busy} type={showToken?'text':'password'} autoComplete="off" spellCheck={false} value={token} onChange={e=>setToken(e.target.value)}/><button type="button" aria-label={nt(showToken?'hideKey':'viewKey')} title={nt(showToken?'hideKey':'viewKey')} aria-pressed={showToken} onClick={()=>setShowToken(!showToken)}>{showToken?<LuEyeOff/>:<LuEye/>}</button></span></label>}
 {method==='relay'&&<><label>{nt('api')}<input disabled={busy} placeholder="https://relay.example" autoComplete="off" value={api} onChange={e=>setApi(e.target.value)}/></label><p className="nai-account-note">{nt('apiHelp')}</p><button type="button" onClick={()=>{try{setApi(relayDashboardOrigin(api));setMessage('origin');}catch{setMessage('https');}}}>{nt('extract')}</button><label>{nt('imageOptional')}<input disabled={busy} placeholder="https://images.relay.example" autoComplete="off" value={image} onChange={e=>setImage(e.target.value)}/></label><p className="nai-account-note">{nt('relaySafety')}</p></>}
 <button type="button" className="nai-account-primary" disabled={locked||!label||(method==='official-login'?!email||!password:!token)} onClick={()=>void add()}>{busy?nt('validating'):nt(method==='official-login'?'saveLogin':'save')}</button>
 </div>
 <ul className="nai-account-list">{accounts.map(a=><li key={a.id}>
 <div className="nai-account-row"><div className="nai-account-identity"><strong>{a.label}</strong><span className="nai-login-badge" title={nt('loginMethod')}>{a.method==='relay'?<LuGlobe/>:a.method==='official-login'?<LuMail/>:<LuKeyRound/>}{nt(a.method==='token'?'officialToken':a.method==='relay'?'relay':'login')}</span></div><div className="nai-account-actions"><button type="button" aria-pressed={a.id===selected} disabled={locked||a.id===selected} onClick={()=>void select(a.id)}>{nt(a.id===selected?'current':'useAccount')}</button><button type="button" disabled={locked} onClick={()=>void action(async()=>{const r=await bridge()!.probe(a.id);setHttpStatus(r.status===0?undefined:r.status);setMessage(r.code?validationText(r.code):r.status===200?'validationPassed':r.status===401||r.status===403?'validationAuth':'validationHttp');})}>{nt('probe')}</button><button type="button" disabled={locked} onClick={()=>void removeAccount(a)}>{nt('remove')}</button></div></div>
 <div className="nai-saved-key"><input readOnly type={revealed?.id===a.id?'text':'password'} aria-label={`${a.label} Key`} autoComplete="off" spellCheck={false} value={revealed?.id===a.id?revealed.value:'••••••••••••'}/><button type="button" disabled={locked} aria-label={`${nt(revealed?.id===a.id?'hideKey':'viewKey')}: ${a.label}`} title={nt(revealed?.id===a.id?'hideKey':'viewKey')} aria-pressed={revealed?.id===a.id} onClick={()=>void keyAction(a.id)}>{revealed?.id===a.id?<LuEyeOff/>:<LuEye/>}</button><button type="button" disabled={locked} aria-label={`${nt('copyKey')}: ${a.label}`} title={nt('copyKey')} onClick={()=>void keyAction(a.id,true)}><LuCopy/></button></div>
 </li>)}</ul>
 <p role="status" aria-live="polite">{httpStatus!==undefined?`HTTP ${httpStatus}: `:''}{message?nt(message):''}</p>
 </div>;
 if(variant==='settings')return <section className="nai-account-settings" aria-label={nt('title')}><header><div><h3>{nt('title')}</h3><p className="nai-account-note">{nt('settingsHint')}</p></div></header>{selector}{content}</section>;
 return <section className="nai-account-manager">{selector}<button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setClosing(false);setOpen(true)}}><LuPlus aria-hidden/>{nt('manage')}</button>
 {open&&createPortal(<NaiAccountDialogFrame title={nt('title')} closeLabel={nt('close')} titleId={`${uid}-title`} panelRef={panel} onClose={close} closing={closing}>{selector}{content}</NaiAccountDialogFrame>,document.body)}</section>;
}
