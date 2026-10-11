import {useSyncExternalStore} from 'react';
import {useAppStore} from '../store';
import {getComicProjectStore} from './use-comic-project';
import {createComicGenerationQueue,type ComicGenerationQueue} from './generation-queue';
let shared:ComicGenerationQueue|undefined;
let balanceBefore:number|undefined;
export function getComicGenerationQueue(){
 return shared??=createComicGenerationQueue({
  store:getComicProjectStore(),storage:localStorage,
  hasToken:async()=>(await window.naiDesktop.hasToken()).hasToken,
  prepareService:requests=>window.naiDesktop.tagComicPrepareImageService(requests),
  async quote(tasks,service){
   if(service?.provider==='openai-images')return null;
   const cache=new Map<string,number>();let total=0;
   for(const {request:{params,preciseReferences}} of tasks){
    const key=JSON.stringify({model:params.model,width:params.width,height:params.height,steps:params.steps,smea:params.smea,smeaDyn:params.smeaDyn,precise:preciseReferences.length>0});
    let amount=cache.get(key);
    if(amount===undefined){const result=await window.naiDesktop.quoteAnlas({feature:'generate',params:{...params,stylePrompt:'',positivePrompt:'quote',negativePrompt:''},batchCount:1,extras:{vibeImages:[],charCaptions:[],preciseReferences:preciseReferences.length?[{base64:'',type:'character',strength:1,fidelity:1,informationExtracted:1}]:[]},account:useAppStore.getState().account});if(!result.ok||typeof result.amount!=='number')return null;amount=result.amount;cache.set(key,amount);}
    total+=amount;
   }return total;
  },
  generate:request=>{balanceBefore=useAppStore.getState().account.anlasBalance;return window.naiDesktop.tagComicGenerateCandidate(request);},cancel:runId=>window.naiDesktop.tagComicCancelGeneration(runId),
  async afterSaved(_request,result){
   // Generation output has already been persisted. Refresh failures must not replay a paid request.
   let after:number|undefined;if(result.items.every(item=>item.generationProvider!=='openai-images')){try{after=(await useAppStore.getState().refreshAccount()).anlasBalance;}catch{/* Ancillary account refresh. */}}
   if(typeof balanceBefore==='number'&&typeof after==='number'){const amount=Math.max(0,balanceBefore-after);getComicProjectStore().update(p=>({...p,panels:p.panels.map(panel=>panel.id===_request.panelId?{...panel,candidates:panel.candidates.map(c=>c.historyItemId===result.items[0].id?{...c,actualAnlas:amount}:c)}:panel)}));}
   try{await useAppStore.getState().refreshHistory(result.items[0].date);}catch{/* Native history already owns the files. */}
  },
 });
}
export function useComicGenerationQueue(){const service=getComicGenerationQueue();const run=useSyncExternalStore(service.subscribe,service.getSnapshot);return {service,run,queue:service.active?run:null};}
