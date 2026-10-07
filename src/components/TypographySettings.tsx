import '../typography.css';
import {RangeInput} from './RangeInput';
import {useEffect,useRef,useState} from 'react';
import {useAppStore} from '../store';
import {DEFAULT_TYPOGRAPHY,isImportedFont,normalizeTypography,typographyText,type UiFont,type UiTypography} from '../typography';
import {ensureUiFontLoaded} from '../global-typography';
import {Button,SelectMenuCompat} from './ui';
import {BUILTIN_FONTS,builtinFont,builtinFontLabel,builtinFontHint} from '../builtin-fonts';
import {typographyHierarchyHint} from '../typography-hierarchy-text';
export function TypographySettings() {
  const settings=useAppStore(s=>s.settings),v=normalizeTypography(settings?.uiTypography),t=typographyText(settings?.language);
  const [items,setItems]=useState<UiFont[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const confirmed=useRef(v),queue=useRef(Promise.resolve()),revision=useRef(0);
  useEffect(()=>{let active=true;void window.naiDesktop.listUiFonts().then(x=>{if(active)setItems(x);}).catch(()=>{if(active)setMessage(t.failed);});const missing=(e:Event)=>setMessage((e as CustomEvent<string>).detail);window.addEventListener('ui-font-missing',missing);return()=>{active=false;window.removeEventListener('ui-font-missing',missing);};},[t.failed]);
  const save=(next:UiTypography)=>{
    const normalized=normalizeTypography(next),r=++revision.current;
    useAppStore.setState(s=>({settings:s.settings?{...s.settings,uiTypography:normalized}:s.settings}));
    queue.current=queue.current.then(async()=>{try{
      await ensureUiFontLoaded(normalized.font);
      const saved=normalizeTypography(await window.naiDesktop.setSetting('uiTypography',normalized));confirmed.current=saved;
      if(r===revision.current)setMessage(t.saved);
    }catch{if(r===revision.current){useAppStore.setState(s=>({settings:s.settings?{...s.settings,uiTypography:confirmed.current}:s.settings}));setMessage(t.failed);}}});
    return queue.current;
  };
  const known=items.some(x=>x.id===v.font);
  return <section className="typography-settings" data-testid="typography-settings" aria-label={t.title}>
    <h3>{t.title}</h3>
    <label className="field"><span>{t.font}</span><SelectMenuCompat disabled={busy} value={v.font} onChange={e=>void save({...v,font:e.target.value})}>
      {(['default','sans','serif','mono'] as const).map(id=><option key={id} value={id}>{t[id]}</option>)}
      {BUILTIN_FONTS.map(x=><option key={x.id} value={x.id}>{builtinFontLabel(x.id,settings?.language)}</option>)}
      {items.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
      {isImportedFont(v.font)&&!known&&<option value={v.font}>{t.missing}</option>}
    </SelectMenuCompat></label>
    <label className="field"><span>{t.scale} · {v.scale}%</span><RangeInput data-testid="typography-scale" min="80" max="200" step="5" value={v.scale} disabled={busy} onChange={e=>void save({...v,scale:Number(e.target.value)})}/></label>
    <p className="field-hint">{typographyHierarchyHint(settings?.language)}</p>
    <div className="row-actions"><Button disabled={busy} onClick={async()=>{setBusy(true);try{const entry=await window.naiDesktop.importUiFont();if(entry){try{await ensureUiFontLoaded(entry.id);}catch(e){if(!items.some(x=>x.id===entry.id))await window.naiDesktop.removeUiFont(entry.id);throw e;}setItems(await window.naiDesktop.listUiFonts());await save({...v,font:entry.id});}}catch{setMessage(t.failed);}finally{setBusy(false);}}}>{t.import} (TTF / OTF)</Button>
      {isImportedFont(v.font)&&<Button disabled={busy} onClick={async()=>{setBusy(true);try{await save({...v,font:'default'});if(confirmed.current.font==='default'){await window.naiDesktop.removeUiFont(v.font);setItems(await window.naiDesktop.listUiFonts());}}catch{setMessage(t.failed);}finally{setBusy(false);}}}>{t.remove}</Button>}
      <Button disabled={busy} onClick={()=>void save(DEFAULT_TYPOGRAPHY)}>{t.reset}</Button></div>
    <div className="typography-preview"><div className="typography-font-samples"><section className="typography-default-sample"><small>{t.default}</small><p>{t.preview}</p></section><section><small>{t.font} · {items.find(x=>x.id===v.font)?.name ?? (builtinFont(v.font)?builtinFontLabel(v.font,settings?.language):undefined) ?? (t as Record<string,string>)[v.font] ?? v.font}</small><p>{t.preview}</p></section></div><code>Prompt / Seed / CFG · 1girl, solo · 0123456789</code><label className="field"><span>{t.font}</span><input readOnly value={t.preview} aria-label={t.preview}/></label></div><p className="field-hint">{t.familyHint}</p>
    <p className="field-hint">{builtinFontHint(settings?.language)}</p>
    <p className="field-hint">{t.hint}</p>{message&&<p role="status">{message}</p>}
  </section>;
}
