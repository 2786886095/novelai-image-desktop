import type {VibeTransferItem} from './types';

export interface VibeEncoding {model: string; infoExtracted: number; encoding: string}
export interface ImportedVibe extends VibeTransferItem {name: string; previewUrl: string}
const aliases: Record<string,string> = {'v4full':'nai-diffusion-4-full','v4curated':'nai-diffusion-4-curated-preview','v4-5full':'nai-diffusion-4-5-full','v4-5curated':'nai-diffusion-4-5-curated'};
const modelName=(value:string)=>Object.hasOwn(aliases,value)?aliases[value]:value;
const modelKey=(value:string)=>Object.entries(aliases).find(([,model])=>model===value)?.[0]??value;
const object=(v:unknown):Record<string,any>=>v && typeof v==='object' && !Array.isArray(v)?v as Record<string,any>:{};
function unit(v:unknown,fallback:number) {
 if(v===undefined)return fallback;
 if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)throw Error('Invalid Vibe parameter (0–1).');
 return v;
}
function base64(v:unknown) {
 if(typeof v!=='string'||!v.length||v.length>70_000_000||v.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(v))throw Error('Invalid Vibe data.');
 return v;
}
export function matchingVibeEncoding(vibe:VibeTransferItem,model:string):string|undefined {
 return vibe.encodings?.find(e=>e.model===model && Math.abs(e.infoExtracted-vibe.infoExtracted)<1e-8)?.encoding;
}
export function validateVibeModel(vibe:VibeTransferItem,model:string) {
 if(!matchingVibeEncoding(vibe,model)&&!vibe.base64)throw Error(`Vibe encoding has no original image. Select its model and extraction value: ${vibe.encodings?.map(e=>`${e.model} (${e.infoExtracted})`).join(', ')??'unknown'}`);
}
export function parseVibeFile(text:string):ImportedVibe[] {
 if(text.length>70_000_000)throw Error('Vibe file exceeds 50 MB.');
 const root=object(JSON.parse(text.replace(/^\uFEFF/,'')));
 if(root.version!==1)throw Error('Unsupported Vibe file version.');
 const list=root.identifier==='novelai-vibe-transfer-bundle'?root.vibes:root.identifier==='novelai-vibe-transfer'?[root]:null;
 if(!Array.isArray(list)||!list.length||list.length>16)throw Error('Expected a Vibe file with 1–16 references.');
 return list.map((value,index)=>{
  const v=object(value),info=object(v.importInfo);
  if(v.identifier!=='novelai-vibe-transfer'||v.version!==1||!['image','encoding'].includes(v.type))throw Error('Unsupported Vibe entry.');
  const encodings:VibeEncoding[]=[];
  for(const [key,variants] of Object.entries(object(v.encodings)))for(const raw of Object.values(object(variants))){
   const e=object(raw);const extracted=object(e.params).information_extracted ?? (modelName(key)===modelName(String(info.model))?info.information_extracted:undefined);
   if(extracted===undefined)continue; // Unknown extraction values must not be guessed.
   encodings.push({model:modelName(key),infoExtracted:unit(extracted,1),encoding:base64(e.encoding)});
  }
  const image=v.type==='image'&&v.image?base64(v.image):'';
  if(image&&!/^(iVBOR|\/9j\/|UklGR)/.test(image))throw Error('Unsupported Vibe image format.');
  if(!image&&!encodings.length)throw Error('No usable image or Vibe encoding.');
  const infoExtracted=unit(info.information_extracted,encodings[0]?.infoExtracted??1);
  if(!image&&!encodings.some(e=>Math.abs(e.infoExtracted-infoExtracted)<1e-8))throw Error('Vibe extraction value has no matching encoding.');
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
 const all:Record<string,string[]>={'zh-CN':['导入 Vibe 文件','导出 Vibe 文件','编码参考（无原图）','已导入 Vibe 参考','该编码没有原图，请使用以下模型和提取值：'],'zh-TW':['匯入 Vibe 檔案','匯出 Vibe 檔案','編碼參考（無原圖）','已匯入 Vibe 參考','此編碼無原圖，請使用以下模型和提取值：'],'ja-JP':['Vibe ファイルを読込','Vibe ファイルを書出し','エンコード参照（元画像なし）','Vibe を読み込みました','元画像がありません。対応モデルと抽出値：'],'ko-KR':['Vibe 파일 가져오기','Vibe 파일 내보내기','인코딩 참조 (원본 없음)','Vibe를 가져왔습니다','원본이 없습니다. 지원 모델 및 추출 값: ']};
 const [load,save,encoded,loaded,mismatch]=all[String(language??"zh-CN")]??['Import Vibe file','Export Vibe file','Encoded reference (no image)','Vibe references imported','No original image. Use this model and extraction value: '];return {load,save,encoded,loaded,mismatch};
};
