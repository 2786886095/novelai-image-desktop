import {useAppStore} from './store';
import type {AppSettings,StylePromptPreset} from './types';
let pending:Promise<unknown>=Promise.resolve();
export function changeStyles(update:(items:StylePromptPreset[])=>StylePromptPreset[]) {
 const next=pending.catch(()=>{}).then(async()=>{const s=await window.naiDesktop.getSettings();const saved=await window.naiDesktop.setSetting('stylePromptPresets',update(s.stylePromptPresets));useAppStore.setState(state=>({settings:{...(state.settings??s),stylePromptPresets:saved}}));});pending=next;return next;
}
export async function countStyleUse(id:string){await changeStyles(items=>items.map(p=>p.id===id?{...p,usageCount:(p.usageCount||0)+1}:p));}
export async function setStyleSort(value:string){await window.naiDesktop.setSetting('stylePromptPresetSort',value as AppSettings['stylePromptPresetSort']);await useAppStore.getState().refreshSettings();}
export async function saveGalleryStyle(name:string,prompt:string,urls:string[]) {
 const preset:StylePromptPreset={id:crypto.randomUUID(),name:name.trim()||prompt.slice(0,40),prompt,group:'Default',createdAt:new Date().toISOString(),rating:0,usageCount:0,previewImages:[]};
 try {
  for(const url of [...new Set(urls.filter(Boolean))].slice(0,9)){
   const local=await window.naiDesktop.onlineGalleryCacheImage('quicktag',url);
   const copied=await window.naiDesktop.importStylePromptPresetImagePaths([local],preset.id,9-preset.previewImages!.length);
   if(!copied.length)throw Error('Preview image import failed');preset.previewImages!.push(...copied);
  }
  await changeStyles(items=>[...items,preset]);return preset;
 }catch(error){await window.naiDesktop.deleteStylePromptPresetImages(preset.id).catch(()=>{});throw error;}
}
