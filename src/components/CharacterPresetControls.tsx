import {useState} from 'react';
import {characterEditLabels} from './CharacterEditing';
import {useAppStore} from '../store';
import {characterPresetText} from '../character-presets';
import {uniquePositivePromptPresetName} from '../positive-prompt-presets';
import {AppPortal, Button, SelectMenu} from './ui';

const saveLabels: Record<string,string> = {'zh-CN':'保存到正面预设','zh-TW':'儲存到正面預設','en-US':'Save to prompt presets','ja-JP':'正面プリセットに保存','ko-KR':'긍정 프리셋에 저장'};
export function CharacterPresetControls() {
 const settings=useAppStore(s=>s.settings), captions=useAppStore(s=>s.charCaptions);
 const text=characterPresetText(settings?.language), labels=characterEditLabels(settings?.language);
 const title=saveLabels[settings?.language ?? 'zh-CN'];
 const [open,setOpen]=useState(false),[target,setTarget]=useState('all'),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const save=async()=>{
  const chosen=captions.filter(c=>target==='all'||c.id===target).map(({id:_,...c})=>({...c}));
  if(!chosen.length||!name.trim())return;
  setBusy(true);setError('');
  try {
   const current=useAppStore.getState().settings?.positivePromptPresets ?? [];
   await window.naiDesktop.setSetting('positivePromptPresets',[...current,{id:crypto.randomUUID(),name:uniquePositivePromptPresetName(current,name).value,prompt:chosen.map(c=>c.prompt).join('\n'),captions:chosen,createdAt:new Date().toISOString(),previewImages:[]}]);
   await useAppStore.getState().refreshSettings();setOpen(false);useAppStore.getState().setToast(text.saved);
  }catch(e){setError(String(e));}finally{setBusy(false);}
 };
 return <section className="character-preset-controls">
  <Button disabled={!captions.length} onClick={()=>{setTarget('all');setName('');setError('');setOpen(true);}}>{title}</Button>
  {open&&<AppPortal><div className="modal-backdrop" onClick={()=>!busy&&setOpen(false)}><section className="modal character-save-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'&&!busy){e.stopPropagation();setOpen(false);}}}>
   <header><h2>{title}</h2></header><div className="character-save-body">
   <SelectMenu label={labels.select} ariaLabel={labels.select} value={target} onChange={setTarget} disabled={busy} options={[{value:'all',label:labels.all},...captions.map((c,i)=>({value:c.id,label:`${i+1} · ${c.prompt.slice(0,60)||'—'}`}))]}/>
   <label className="field"><span>{text.name}</span><input autoFocus value={name} disabled={busy} maxLength={120} onChange={e=>setName(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}</div>
   <footer><Button disabled={busy} onClick={()=>setOpen(false)}>{text.cancel}</Button><Button variant="primary" disabled={busy||!name.trim()||!captions.some(c=>target==='all'||c.id===target)} onClick={()=>void save()}>{text.save}</Button></footer>
  </section></div></AppPortal>}
 </section>;
}
