import {supportsNAIPreciseReference,supportsNAIVibeTransfer,type PreciseReferenceType} from './types';
import type {VibeTransferImage,PreciseReferenceImage} from './types';
type ReferenceState={
  bootDone:boolean; activeTab:string; inpaintModel:string; params:{model:string;positivePrompt?:string;negativePrompt?:string;stylePrompt?:string};setParam?:(key:'positivePrompt'|'negativePrompt'|'stylePrompt',value:string)=>void; settings?:{imageProvider?:string;inpaintEngine?:string}|null;
  isGenerating:boolean; vibeImages:VibeTransferImage[]; preciseReferences:PreciseReferenceImage[];
  addVibeImage(image:VibeTransferImage):boolean;addPreciseReference(image:PreciseReferenceImage):void;
  updateVibeImage?(id:string,patch:Partial<Pick<VibeTransferImage,'strength'|'infoExtracted'>>):void;
  updatePreciseReference?(id:string,patch:Partial<Pick<PreciseReferenceImage,'strength'|'type'|'fidelity'>>):void;
  removeVibeImage(id:string):void;removePreciseReference(id:string):void;
};

export type RefKind='vibe'|'precise';
export type WorkbenchCommand={
  op:'list'|'mount'|'unmount'|'updateMany'|'unmountMany'|'mountMany'|'prompt'; slot?:'positivePrompt'|'negativePrompt'|'stylePrompt';expected?:string;value?:string; images?:Array<{base64:string;mime:string;width:number;height:number}>; updates?:Array<{id:string;strength?:number;information?:number;fidelity?:number;type?:PreciseReferenceType}>; expires:number; kind?:RefKind; id?:string; base64?:string;
  mime?:string; width?:number; height?:number; type?:PreciseReferenceType;
  strength?:number; fidelity?:number; information?:number;
};
export function applyWorkbenchReference(s:ReferenceState, c:WorkbenchCommand){
  if(!s.bootDone || Date.now()>=c.expires)throw Error('工作台尚未就绪或操作已过期，请重新读取。');
  const model=s.activeTab==='inpaint'?s.inpaintModel:s.params.model;
  const catalog=()=>({model,vibe:s.vibeImages.map(({id,strength,infoExtracted})=>({id,strength,infoExtracted})),
    precise:s.preciseReferences.map(({id,strength,type,fidelity})=>({id,strength,type,fidelity}))});
  if(c.op==='list')return catalog();
  if(c.op==='prompt'){
    if(s.activeTab!=='generate'||!c.slot||!['positivePrompt','negativePrompt','stylePrompt'].includes(c.slot))throw Error('请先打开生成工作台。');
    const text=s.params[c.slot]??'';if(c.value===undefined)return {text};
    if(s.isGenerating||!s.setParam||text!==c.expected)throw Error('生成中或提示词已变化，未应用。');
    s.setParam(c.slot,c.value);return {applied:true,slot:c.slot};
  }
  if(s.isGenerating)throw Error('生成中，不能改变工作台参考图。');
  if(c.kind!=='vibe'&&c.kind!=='precise')throw Error('必须指定 vibe 或 precise。');
  const list=c.kind==='vibe'?s.vibeImages:s.preciseReferences;
  if(c.op==='mountMany'){
    const images=c.images;if(!images?.length||images.length>8||list.length+images.length>16||images.some(i=>!i.base64||!i.mime))throw Error('批量挂载超过限制或图片无效。');
    const ids:string[]=[];try{for(const im of images){const r=applyWorkbenchReference(s,{...c,...im,op:'mount',images:undefined}) as {id:string};ids.push(r.id);}}
    catch(e){for(const id of ids){if(c.kind==='vibe')s.removeVibeImage(id);else s.removePreciseReference(id);}throw e;}
    return {applied:true,ids,kind:c.kind};
  }
  if(c.op==='updateMany'||c.op==='unmountMany'){
    const edits=c.updates??[];if(!edits.length||edits.length>16||new Set(edits.map(e=>e.id)).size!==edits.length||edits.some(e=>!list.some(r=>r.id===e.id)))throw Error('参考图不存在或重复，未修改。');
    for(const e of edits)if(c.op==='updateMany'&&((c.kind==='vibe'&&(e.fidelity!==undefined||e.type!==undefined))||(c.kind==='precise'&&e.information!==undefined)||[e.strength,e.information,e.fidelity,e.type].every(v=>v===undefined)))throw Error('参数与用途不符，未修改。');
    if(c.op==='updateMany'&&!(c.kind==='vibe'?s.updateVibeImage:s.updatePreciseReference))throw Error('当前工作台无法更新参考图');
    for(const e of edits){if(c.op==='unmountMany'){if(c.kind==='vibe')s.removeVibeImage(e.id);else s.removePreciseReference(e.id);}
      else {const common=e.strength===undefined?{}:{strength:e.strength};if(c.kind==='vibe')s.updateVibeImage!(e.id,{...common,...(e.information===undefined?{}:{infoExtracted:e.information})});
      else s.updatePreciseReference!(e.id,{...common,...(e.type===undefined?{}:{type:e.type}),...(e.fidelity===undefined?{}:{fidelity:e.fidelity})});}}
    return {applied:true,ids:edits.map(e=>e.id),kind:c.kind};
  }
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
