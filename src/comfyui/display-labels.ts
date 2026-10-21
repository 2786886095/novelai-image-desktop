import type {ComfySlot} from './contract';
import {COMFY_NODE_DISPLAY_CATALOG} from './node-display-catalog';
import entries from './node-display-locales.json';

export type ComfyDisplayText=(key:string)=>string;
export const NODE_DISPLAY_LANGUAGES=['zh-CN','zh-TW','en-US','ja-JP','ko-KR'] as const;
const locales=entries as Record<string,string[]>;
const catalog=new Map(COMFY_NODE_DISPLAY_CATALOG.map(entry=>[entry.classType,entry]));
const aliases=new Map(COMFY_NODE_DISPLAY_CATALOG.map(entry=>[entry.classType,new Set([entry.classType,...entry.aliases])]));
const kinds=new Map<string,string>([
  ['positive','正面提示词'],['negative','负面提示词'],['prompt','正面提示词'],
  ['positive_prompt','正面提示词'],['negative_prompt','负面提示词'],
  ['width','宽度'],['height','高度'],['seed','种子'],['steps','步数'],['cfg','CFG'],
  ['batch','批量数'],['batch_size','批量数'],['sampler','采样器'],['scheduler','调度器'],['denoise','重绘强度'],
]);
// Only the previously supported neutral widget terms are global. New technical
// inputs are translated through their verified class-specific schema instead.
const inputs=new Map<string,string>([
  ['weight_dtype','权重数据类型'],['type','类型'],['device','运行设备'],
  ['scheduler','调度器'],['denoise','重绘强度'],['sampler_name','采样器'],
  ['strength_model','模型强度'],['strength_clip','文本编码器强度'],
  ['width','宽度'],['height','高度'],['batch_size','批量数'],['seed','种子'],['noise_seed','种子'],['steps','步数'],['cfg','CFG'],
]);
const titleOverrides=new Map<string,ReadonlyMap<string,string>>([
  ['CLIPLoader',new Map([['Text encoder (match model family)','文本编码器（匹配模型家族）']])],
  ['CLIPTextEncode',new Map([['Positive prompt','正面提示词'],['Negative prompt','负面提示词']])],
  ['ConditioningZeroOut',new Map([['Zeroed negative (Krea 2)','清零负面条件（Krea 2）']])],
]);

/** Independent five-language display catalog; unknown locales follow the app's
 * zh-CN fallback. Unknown text and protocol tokens pass through unchanged. */
export function comfyNodeDisplayText(language:string|undefined,key:string,fallback?:ComfyDisplayText):string {
  const row=Object.prototype.hasOwnProperty.call(locales,key)?locales[key]:undefined;
  if(!row)return fallback?fallback(key):key;
  const index=NODE_DISPLAY_LANGUAGES.indexOf(language as typeof NODE_DISPLAY_LANGUAGES[number]);
  return row[index<0?0:index]??row[0]??key;
}
function translated(key:string,ft:ComfyDisplayText,language:string|undefined):string {
  // Preserve the existing two-argument feature-text contract for callers that
  // have not opted into the independent catalog yet.
  return language===undefined?ft(key):comfyNodeDisplayText(language,key,ft);
}
export const COMFY_DISPLAY_LABEL_KEYS:readonly string[]=[...new Set([
  ...COMFY_NODE_DISPLAY_CATALOG.flatMap(item=>[item.titleKey,...Object.values(item.inputs)]),
  ...[...titleOverrides.values()].flatMap(map=>[...map.values()]),...kinds.values(),...inputs.values(),
  '主模型','文本编码器','VAE 文件',
])];
function rawNodeTitle(node:Pick<ComfySlot,'nodeTitle'|'classType'>):string {
  return node.nodeTitle?.trim()?node.nodeTitle:node.classType;
}

/** Exact registered ids/default display names and app-owned preset aliases
 * only. Custom titles, casing, whitespace and unknown node names stay raw. */
export function comfyDisplayNodeTitle(node:Pick<ComfySlot,'nodeTitle'|'classType'>,ft:ComfyDisplayText,language?:string):string {
  const title=rawNodeTitle(node),entry=catalog.get(node.classType);
  if(!entry||!aliases.get(node.classType)?.has(title))return title;
  return translated(titleOverrides.get(node.classType)?.get(title)??entry.titleKey,ft,language);
}

/** Translate generated presentation labels, never supplied custom/hint labels.
 * There is no mutation or localization of ids, filenames, values or options. */
export function comfyDisplayAdvancedLabel(slot:ComfySlot,ft:ComfyDisplayText,language?:string):string {
  if(slot.label!==`${rawNodeTitle(slot)} · ${slot.input}`)return slot.label;
  if(slot.kind==='model'){
    if(slot.role==='diffusion'||slot.role==='checkpoint')return translated('主模型',ft,language);
    if(slot.role==='text-encoder')return translated('文本编码器',ft,language);
    if(slot.role==='vae')return translated('VAE 文件',ft,language);
  }
  const nodeInputs=catalog.get(slot.classType)?.inputs;
  const specific=nodeInputs&&Object.prototype.hasOwnProperty.call(nodeInputs,slot.input)?nodeInputs[slot.input]:undefined;
  const key=kinds.get(slot.kind)??specific??inputs.get(slot.input);
  return key?translated(key,ft,language):slot.input;
}
