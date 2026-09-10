import {useState} from 'react';
import {useAppStore} from '../store';
import {maxNAICharacterPrompts} from '../types';
import {characterPresetText, normalizeCharacterCaptions, normalizeCharacterPresets, type CharacterPromptPreset} from '../character-presets';
import {Button, SelectMenu} from './ui';
import {confirmAction} from './confirm';

export function CharacterPresetControls() {
  const settings=useAppStore(s=>s.settings), captions=useAppStore(s=>s.charCaptions), model=useAppStore(s=>s.params.model);
  const text=characterPresetText(settings?.language), presets=normalizeCharacterPresets(settings?.characterPromptPresets);
  const [id,setId]=useState(''),[edit,setEdit]=useState<'save'|'rename'|null>(null),[name,setName]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const selected=presets.find(p=>p.id===id);
  const write=async(next:CharacterPromptPreset[])=>{
    setBusy(true);setError('');
    try {await window.naiDesktop.setSetting('characterPromptPresets',next);await useAppStore.getState().refreshSettings();setEdit(null);useAppStore.getState().setToast(text.saved);}
    catch(e){setError(String(e));}finally{setBusy(false);}
  };
  return <section aria-label={text.title}>
    <SelectMenu ariaLabel={text.title} label={text.title} value={id} options={[{value:'',label:'—'},...presets.map(p=>({value:p.id,label:p.name}))]} onChange={setId}/>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBlock:8}}>
      <Button disabled={busy||!captions.length} onClick={()=>{setEdit('save');setName('');}}>{text.create}</Button>
      <Button disabled={busy||!selected} onClick={()=>{if(!selected)return;if(selected.captions.length>maxNAICharacterPrompts(model)){setError(text.capacity);return;}useAppStore.getState().setCharCaptions(normalizeCharacterCaptions(selected.captions));setError('');useAppStore.getState().setToast(`${text.apply}: ${selected.name}`);}}>{text.apply}</Button>
      <Button disabled={busy||!selected} onClick={()=>{setEdit('rename');setName(selected?.name??'');}}>{text.rename}</Button>
      <Button disabled={busy||!selected} onClick={async()=>{if(selected&&await confirmAction(`${text.remove}: ${selected.name}?`)){await write(presets.filter(p=>p.id!==id));setId('');}}}>{text.remove}</Button>
    </div>
    {edit&&<div className="field"><label>{text.name}<input value={name} maxLength={120} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
      <div style={{display:'flex',gap:8}}><Button disabled={busy||!name.trim()} onClick={()=>{
        if(edit==='rename'){void write(presets.map(p=>p.id===id?{...p,name:name.trim()}:p));return;}
        const preset:CharacterPromptPreset={id:crypto.randomUUID(),name:name.trim(),createdAt:new Date().toISOString(),captions:captions.map(({id:_,...c})=>({...c}))};
        setId(preset.id);void write([...presets,preset]);
      }}>{text.save}</Button><Button disabled={busy} onClick={()=>setEdit(null)}>{text.cancel}</Button></div>
    </div>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
