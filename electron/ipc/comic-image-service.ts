import type {ComicImageService,TagComicGenerateRequest} from '../../src/types';
import {compatibleComicInput} from '../../src/comic/compatible-comic';
import {getSettings,getToken} from './store';
import {comicSourceBinding} from './agent-comic-run';

/** Secrets never cross IPC; the HMAC is process-local and expires on any source change. */
export function currentComicImageBinding(){
 const settings=getSettings();
 return comicSourceBinding(settings,settings.imageProvider==='openai-images'?'':getToken()??'');
}
export function assertComicImageBinding(binding:string){
 let current='';try{current=currentComicImageBinding();}catch{/* Invalidated source is not the approved source. */}
 if(!binding||current!==binding)throw Error('漫画图片服务或凭据已变化；未提交后续图片，请重新确认任务。');
}
export function prepareComicImageService(requests:TagComicGenerateRequest[]):ComicImageService{
 if(!Array.isArray(requests)||!requests.length)throw Error('没有需要生成的分镜');
 const settings=getSettings(),binding=currentComicImageBinding();
 if(settings.imageProvider==='openai-images'){
  for(const request of requests)compatibleComicInput(settings,request);
  return {binding,provider:'openai-images',model:settings.compatibleImage!.model,size:settings.compatibleImage!.size};
 }
 return {binding,provider:'novelai'};
}
