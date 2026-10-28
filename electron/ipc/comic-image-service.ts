import {createHmac,randomBytes} from 'node:crypto';
import type {AppSettings,ComicImageService,TagComicGenerateRequest} from '../../src/types';
import {compatibleComicInput} from '../../src/comic/compatible-comic';
import {imageGenerationEndpoint,buildCompatibleImageRequest} from '../../src/image-provider-contract';
import {bindAgentImageProvider} from './agent-image-provider';
import {getSettings,getToken} from './store';

const sourceKey=randomBytes(32);
export function comicSourceBinding(settings:AppSettings,token:string){
 if(settings.imageProvider==='openai-images'){
  const config=settings.compatibleImage;
  if(!config||!settings.imageApiKey?.trim()||/[\r\n]/.test(settings.imageApiKey))throw Error('请先保存兼容图片服务配置与独立 API Key；未自动切换服务');
  imageGenerationEndpoint(config.baseUrl);
  buildCompatibleImageRequest(config,{prompt:'configuration validation',size:config.size,n:1,extensions:config.extensions});
  return bindAgentImageProvider(settings).revision;
 }
 if(!token)throw Error('请先配置 NovelAI Token');
 return createHmac('sha256',sourceKey).update(JSON.stringify([token,settings.imageProvider,settings.apiBaseUrl,settings.imageBaseUrl,settings.allowCustomEndpoint,settings.outputDir,settings.proxyMode,settings.proxyUrl,settings.proxyForAi])).digest('hex');
}
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
