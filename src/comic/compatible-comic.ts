import type {AppSettings,TagComicGenerateRequest} from '../types';
import {buildCompatibleImageRequest,imageGenerationEndpoint,type CompatibleImageInput} from '../image-provider-contract';

/** Only the selected service's wire contract is sent; native controls are not translated implicitly. */
export function compatibleComicInput(settings:AppSettings,request:TagComicGenerateRequest):CompatibleImageInput {
 const config=settings.compatibleImage;
 if(settings.imageProvider!=='openai-images'||!config)throw Error('请先保存兼容图片服务配置');
 if(request.preciseReferences.length)throw Error('当前兼容漫画接口未接入参考图片；请先取消本批分镜的参考选择。未发送生成请求。');
 imageGenerationEndpoint(config.baseUrl);
 const size=request.imageSize;
 if(size&&(!Number.isSafeInteger(size.width)||!Number.isSafeInteger(size.height)||size.width<1||size.height<1))throw Error('逐格尺寸无效');
 const input={prompt:[request.globalStylePrompt.trim(),request.panelPrompt.trim()].filter(Boolean).join(', '),n:1,size:size?`${size.width}x${size.height}`:config.size,extensions:config.extensions};
 if(!request.panelPrompt.trim())throw Error('分镜提示词不能为空');
 buildCompatibleImageRequest(config,input);
 return input;
}
