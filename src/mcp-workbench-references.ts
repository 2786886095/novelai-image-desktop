import {supportsNAIPreciseReference,supportsNAIVibeTransfer,type PreciseReferenceType} from './types';
import type {VibeTransferImage,PreciseReferenceImage} from './types';
type ReferenceState={
  bootDone:boolean; activeTab:string; inpaintModel:string; params:{model:string}; settings?:{imageProvider?:string;inpaintEngine?:string}|null;
  isGenerating:boolean; vibeImages:VibeTransferImage[]; preciseReferences:PreciseReferenceImage[];
  addVibeImage(image:VibeTransferImage):boolean;addPreciseReference(image:PreciseReferenceImage):void;
  removeVibeImage(id:string):void;removePreciseReference(id:string):void;
};

export type RefKind='vibe'|'precise';
export type WorkbenchCommand={
  op:'list'|'mount'|'unmount'; expires:number; kind?:RefKind; id?:string; base64?:string;
  mime?:string; width?:number; height?:number; type?:PreciseReferenceType;
  strength?:number; fidelity?:number; information?:number;
};
export function applyWorkbenchReference(s:ReferenceState, c:WorkbenchCommand){
  if(!s.bootDone || Date.now()>=c.expires)throw Error('工作台尚未就绪或操作已过期，请重新读取。');
  const model=s.activeTab==='inpaint'?s.inpaintModel:s.params.model;
  const catalog=()=>({model,vibe:s.vibeImages.map(({id,strength,infoExtracted})=>({id,strength,infoExtracted})),
    precise:s.preciseReferences.map(({id,strength,type,fidelity})=>({id,strength,type,fidelity}))});
  if(c.op==='list')return catalog();
  if(s.isGenerating)throw Error('生成中，不能改变工作台参考图。');
  if(c.kind!=='vibe'&&c.kind!=='precise')throw Error('必须指定 vibe 或 precise。');
  const list=c.kind==='vibe'?s.vibeImages:s.preciseReferences;
  if(c.op==='unmount'){
    if(!c.id||!list.some(i=>i.id===c.id))throw Error('未找到该用途的参考图。');
    if(c.kind==='vibe')s.removeVibeImage(c.id);else s.removePreciseReference(c.id);
    return {removed:c.id,kind:c.kind};
  }
  if(c.op!=='mount'||!c.base64||!c.mime)throw Error('缺少图片。');
  const compatible=s.activeTab==='inpaint'?s.settings?.inpaintEngine==='openai':s.settings?.imageProvider==='openai-images';
  if(compatible||!(c.kind==='vibe'?supportsNAIVibeTransfer(model):supportsNAIPreciseReference(model)))throw Error('当前模型不支持这种参考图；未更改模型或底图。');
  if((c.kind==='vibe'?s.preciseReferences:s.vibeImages).length)throw Error('不能混用氛围迁移和精准参考；请先明确移除已有参考。');
  if(list.length>=16)throw Error('参考图数量已达上限。');
  const id=crypto.randomUUID(),common={id,base64:c.base64,previewUrl:'data:'+c.mime+';base64,'+c.base64,strength:c.strength??1};
  if(c.kind==='vibe'){if(!s.addVibeImage({...common,infoExtracted:c.information??1}))throw Error('氛围参考添加失败。');}
  else s.addPreciseReference({...common,type:c.type??'character',fidelity:c.fidelity??1,informationExtracted:1,srcWidth:c.width,srcHeight:c.height});
  return {id,kind:c.kind,model,count:list.length+1};
}
