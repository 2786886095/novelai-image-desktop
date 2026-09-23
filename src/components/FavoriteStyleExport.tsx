import {PreviewImageViewer} from './PreviewImageViewer';
import {useEffect,useState} from 'react';
import {useAppStore} from '../store';
import {AppPortal,Button} from './ui';
import type {StylePromptPreset} from '../types';
export const favoriteStyleLabels:Record<string,string[]>={
 'zh-CN':['保存为风格预设','全选','取消全选','保存','取消','已保存'],
 'zh-TW':['儲存為風格預設','全選','取消全選','儲存','取消','已儲存'],
 'en-US':['Save as style presets','Select all','Clear selection','Save','Cancel','Saved'],
 'ja-JP':['画風プリセットとして保存','すべて選択','選択解除','保存','キャンセル','保存しました'],
 'ko-KR':['스타일 프리셋으로 저장','전체 선택','선택 해제','저장','취소','저장됨']};
export type FavoriteStyleSource={id:string;prompt:string;image?:{filePath:string;fileUrl:string}};
export function FavoriteStyleExport({items}:{items:FavoriteStyleSource[]}) {
 const language=useAppStore(s=>s.settings?.language),t=favoriteStyleLabels[language??'en-US']??favoriteStyleLabels['en-US'];
 const [open,setOpen]=useState(false),[selected,setSelected]=useState<string[]>([]),[names,setNames]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [preview,setPreview]=useState<number|null>(null);
 const previewItems=items.filter(item=>item.image);
 useEffect(()=>{if(!open)return;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy){if(preview!==null)setPreview(null);else setOpen(false);}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[open,preview,busy]);
 async function save(ids=selected){
  if(busy)return;setBusy(true);setError('');const created:StylePromptPreset[]=[];let committed=false;
  try {
   for(const item of items.filter(i=>ids.includes(i.id))){
    const preset:StylePromptPreset={id:crypto.randomUUID(),name:names[item.id]?.trim()||item.prompt.slice(0,60),prompt:item.prompt,group:'Default',createdAt:new Date().toISOString(),previewImages:[]};
    created.push(preset);
    if(item.image){preset.previewImages=await window.naiDesktop.importStylePromptPresetImagePaths([item.image.filePath],preset.id,1);if(!preset.previewImages.length)throw new Error(item.image.filePath);}
   }
   const settings=await window.naiDesktop.getSettings();
   await window.naiDesktop.setSetting('stylePromptPresets',[...settings.stylePromptPresets,...created]);committed=true;
   await useAppStore.getState().refreshSettings();useAppStore.getState().setToast(`${t[5]} · ${created.length}`);setPreview(null);setOpen(false);
  }catch(e){
   if(!committed)await Promise.allSettled(created.map(p=>window.naiDesktop.deleteStylePromptPresetImages(p.id)));
   setError(String(e));
  }finally{setBusy(false);}
 }
 return <><Button disabled={!items.length} onClick={()=>{setSelected(items.map(i=>i.id));setNames(Object.fromEntries(items.map(i=>[i.id,i.prompt.slice(0,60)])));setError('');setPreview(null);setOpen(true);}}>{t[0]}</Button>
 {open&&<AppPortal><div className="modal-backdrop" onMouseDown={()=>{if(!busy)setOpen(false);}}><section className="modal" role="dialog" aria-modal="true" aria-label={t[0]} onMouseDown={e=>e.stopPropagation()} style={{width:860,maxWidth:'95vw'}}>
 <header><h2>{t[0]}</h2></header><div style={{overflowY:'auto',maxHeight:'60vh',padding:16}}>
 <Button disabled={busy} onClick={()=>setSelected(items.map(i=>i.id))}>{t[1]}</Button><Button disabled={busy} onClick={()=>setSelected([])}>{t[2]}</Button>
 <div className="favorite-style-grid">{items.map(item=><article key={item.id} className="favorite-style-card">
 <label><input type="checkbox" disabled={busy} checked={selected.includes(item.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,item.id]:s.filter(id=>id!==item.id))}/>{names[item.id]||item.prompt}</label>
 {item.image&&<button type="button" className="style-image-preview-button" aria-label={item.prompt} onClick={()=>setPreview(previewItems.findIndex(i=>i.id===item.id))}><img src={item.image.fileUrl} alt={item.prompt} loading="lazy"/></button>}
 <input aria-label={item.prompt} value={names[item.id]??''} maxLength={120} disabled={busy} onChange={e=>setNames(s=>({...s,[item.id]:e.target.value}))}/>
 </article>)}</div>
 {error&&<p role="alert">{error}</p>}</div><footer><Button disabled={busy} onClick={()=>setOpen(false)}>{t[4]}</Button><Button disabled={busy||!selected.length} onClick={()=>void save()}>{t[3]} · {selected.length}{busy?'…':''}</Button></footer>
 </section></div>{preview!==null&&previewItems[preview]&&<div className="style-image-lightbox" role="dialog" aria-modal="true" onClick={e=>{if(e.target===e.currentTarget)setPreview(null);}}>
 <PreviewImageViewer onBackgroundClick={()=>setPreview(null)} images={previewItems.map(i=>({src:i.image!.fileUrl,alt:names[i.id]||i.prompt}))} index={preview} onIndex={setPreview}/>
 <div className="favorite-style-preview-actions"><Button disabled={busy} onClick={()=>setPreview(null)}>{t[4]}</Button><Button variant="primary" disabled={busy} onClick={()=>void save([previewItems[preview].id])}>{t[0]}{busy?'…':''}</Button>{error&&<p role="alert">{error}</p>}</div>
 </div>}</AppPortal>}</>;
}
