import {createHmac,randomBytes} from 'node:crypto';
import type {BatchRedrawRequest,ComicImageService} from '../../src/types';
import {NAI_MODELS,supportsNAIVibeTransfer,supportsNAIPreciseReference} from '../../src/types';
import {isNAIImageSize} from '../../src/nai-dimensions';
import {getSettings,getToken} from './store';
const key=randomBytes(32);
export function currentBatchImageBinding(){const s=getSettings();if(s.imageProvider==='openai-images')throw Error('当前兼容服务接入的是文生图接口，批量重绘未提交；请先选择支持重绘的原生服务。');const token=getToken();if(!token)throw Error('请先配置 NovelAI Token');return createHmac('sha256',key).update(JSON.stringify([token,s.imageProvider,s.imageBaseUrl,s.apiBaseUrl,s.outputDir,s.allowCustomEndpoint,s.allowCustomEndpointFallback,s.proxyMode,s.proxyUrl,s.proxyForNai])).digest('hex');}
export function assertBatchImageBinding(binding:string){if(!binding||currentBatchImageBinding()!==binding)throw Error('批量重绘服务、凭据或输出配置已变化，未继续提交');}
export function prepareBatchImageService(requests:BatchRedrawRequest[]):ComicImageService{
 const binding=currentBatchImageBinding();if(!Array.isArray(requests)||!requests.length)throw Error('没有批量重绘任务');
 for(const r of requests){if(!r||!r.imageBase64?.trim()||!r.groupName?.trim()||!r.params?.positivePrompt?.trim()||!NAI_MODELS.some(m=>m.value===r.params.model)||!isNAIImageSize(r.params)||!Number.isFinite(r.strength)||r.strength<0||r.strength>1)throw Error('批量重绘参数、图片或尺寸无效');if(r.extras?.vibeImages?.length&&!supportsNAIVibeTransfer(r.params.model))throw Error('所选模型不支持Vibe参考');if(r.extras?.preciseReferences?.length&&!supportsNAIPreciseReference(r.params.model))throw Error('所选模型不支持精准参考');}
 return {binding,provider:'novelai'};
}
