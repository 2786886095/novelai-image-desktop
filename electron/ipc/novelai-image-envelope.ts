import {getSettings} from './store';
import axios from 'axios';
import {NAI_RELAY_MODEL_IDS} from '../../src/nai-accounts';
import {imageGenerationEndpoint,buildCompatibleImageRequest} from '../../src/image-provider-contract';
import type {CompatibleImageSettings} from '../../src/types';
import {proxyConfigForUrl} from './proxy';
export async function verifyNovelAiImageEnvelope(config:CompatibleImageSettings,key:string) {
  if(typeof key!=='string'||!key.trim()||/[\r\n]/.test(key)||!NAI_RELAY_MODEL_IDS.includes(config?.model?.trim() as any)) throw Error('Unsupported NovelAI model');
  const endpoint=imageGenerationEndpoint(config.baseUrl);
  buildCompatibleImageRequest(config,{prompt:'readonly configuration check',size:config.size,n:1,extensions:config.extensions});
  const models=endpoint.replace(/\/images\/generations$/,'/models');
  const route=await proxyConfigForUrl('ai',models,getSettings());
  const response=await axios.get(models,{...route,headers:{Authorization:`Bearer ${key.trim()}`},timeout:15000,maxRedirects:0,maxContentLength:2*1024*1024,validateStatus:()=>true});
  if(response.status!==200||response.data?.success===false||response.data?.error!=null||!Array.isArray(response.data?.data)||!response.data.data.some((m:any)=>m?.id===config.model.trim())) throw Error('Readonly validation failed');
}
