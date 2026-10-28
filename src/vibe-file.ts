import type {VibeTransferItem} from './types';

export interface VibeEncoding {model: string; infoExtracted: number; encoding: string}
export interface ImportedVibe extends VibeTransferItem {name: string; previewUrl: string}
const aliases: Record<string,string> = {'v4full':'nai-diffusion-4-full','v4curated':'nai-diffusion-4-curated-preview','v4-5full':'nai-diffusion-4-5-full','v4-5curated':'nai-diffusion-4-5-curated'};
const modelName=(value:string)=>Object.hasOwn(aliases,value)?aliases[value]:value;
const modelKey=(value:string)=>Object.entries(aliases).find(([,model])=>model===value)?.[0]??value;
const object=(v:unknown):Record<string,any>=>v && typeof v==='object' && !Array.isArray(v)?v as Record<string,any>:{};
function unit(v:unknown,fallback:number) {
 if(v===undefined)return fallback;
 if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)throw Error('Vibe 参数无效，应在 0–1 之间。');
 return v;
}
function base64(v:unknown) {
 if(typeof v!=='string'||!v.length||v.length>70_000_000||v.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(v))throw Error('Vibe 数据无效。');
 return v;
}
export function matchingVibeEncoding(vibe:VibeTransferItem,model:string):string|undefined {
 return vibe.encodings?.find(e=>e.model===model && Math.abs(e.infoExtracted-vibe.infoExtracted)<1e-8)?.encoding;
}
export function validateVibeModel(vibe:VibeTransferItem,model:string) {
 if(!matchingVibeEncoding(vibe,model)&&!vibe.base64)throw Error(`该 Vibe 编码没有原图，请使用以下模型和提取值：${vibe.encodings?.map(e=>`${e.model} (${e.infoExtracted})`).join(', ')??'未知'}`);
}
export function parseVibeFile(text:string):ImportedVibe[] {
 if(text.length>70_000_000)throw Error('Vibe 文件超过 50 MB。');
 let parsed:unknown;
 try{parsed=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw Error('Vibe 文件不是有效的 JSON。');}
 const root=object(parsed);
 if(root.version!==1)throw Error('不支持的 Vibe 文件版本。');
 const list=root.identifier==='novelai-vibe-transfer-bundle'?root.vibes:root.identifier==='novelai-vibe-transfer'?[root]:null;
 if(!Array.isArray(list)||!list.length||list.length>16)throw Error('Vibe 文件应包含 1–16 个参考。');
 return list.map((value,index)=>{
  const v=object(value),info=object(v.importInfo);
  if(v.identifier!=='novelai-vibe-transfer'||v.version!==1||!['image','encoding'].includes(v.type))throw Error('不支持的 Vibe 条目。');
  const encodings:VibeEncoding[]=[];
  for(const [key,variants] of Object.entries(object(v.encodings)))for(const raw of Object.values(object(variants))){
   const e=object(raw);const extracted=object(e.params).information_extracted ?? (modelName(key)===modelName(String(info.model))?info.information_extracted:undefined);
   if(extracted===undefined)continue; // Unknown extraction values must not be guessed.
   encodings.push({model:modelName(key),infoExtracted:unit(extracted,1),encoding:base64(e.encoding)});
  }
  const image=v.type==='image'&&v.image?base64(v.image):'';
  if(image&&!/^(iVBOR|\/9j\/|UklGR)/.test(image))throw Error('不支持的 Vibe 图片格式。');
  if(!image&&!encodings.length)throw Error('没有可用的图片或 Vibe 编码。');
  const infoExtracted=unit(info.information_extracted,encodings[0]?.infoExtracted??1);
  if(!image&&!encodings.some(e=>Math.abs(e.infoExtracted-infoExtracted)<1e-8))throw Error('Vibe 提取值没有对应的编码。');
  return {base64:image,encodings,infoExtracted,strength:unit(info.strength,1),name:typeof v.name==='string'?v.name.slice(0,160):`Vibe ${index+1}`,previewUrl:image?`data:image/${image.startsWith('/9j/')?'jpeg':image.startsWith('UklGR')?'webp':'png'};base64,${image}`:''};
 });
}
export function exportVibeFile(items:VibeTransferItem[]) {
 return JSON.stringify({identifier:'novelai-vibe-transfer-bundle',version:1,vibes:items.map((v,index)=>{
  const encodings:Record<string,Record<string,unknown>>=Object.create(null);
  for(const e of v.encodings??[])(encodings[modelKey(e.model)]??={})[String(e.infoExtracted)]={encoding:e.encoding,params:{information_extracted:e.infoExtracted}};
  return {identifier:'novelai-vibe-transfer',version:1,type:v.base64?'image':'encoding',name:v.name??`Vibe ${index+1}`,image:v.base64||undefined,encodings,importInfo:{model:v.encodings?.[0]?.model,information_extracted:v.infoExtracted,strength:v.strength}};
 })});
}
export const vibeFileLabels=(language:unknown)=>{
 const all:Record<string,string[]>={'zh-CN':['导入 Vibe 文件','导出 Vibe 文件','编码参考（无原图）','已导入 Vibe 参考','该编码没有原图，请使用以下模型和提取值：']};
 const [load,save,encoded,loaded,mismatch]=all[String(language??"zh-CN")]??all['zh-CN'];return {load,save,encoded,loaded,mismatch};
};
