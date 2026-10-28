import builtins from '../shared/negative-prompt-presets.json';
import {appendPromptText} from './prompt-append';
import {mergePromptTags,promptTagField} from './prompt-library-tags';
export interface NegativePromptPreset {id:string;name:string;prompt:string;tags?:string[];createdAt:string}
export const NEGATIVE_BUILTINS:readonly NegativePromptPreset[]=builtins;
function valid(p:unknown):p is NegativePromptPreset {if(!p||typeof p!=='object')return false;const v=p as NegativePromptPreset;return typeof v.id==='string'&&!!v.id&&v.id.length<=100&&typeof v.name==='string'&&!!v.name.trim()&&v.name.length<=100&&typeof v.prompt==='string'&&!!v.prompt.trim()&&v.prompt.length<=100000&&typeof v.createdAt==='string';}
export function normalizeNegativePromptPresets(value:unknown):NegativePromptPreset[]{
 if(value===undefined||value===null)return NEGATIVE_BUILTINS.map(p=>({...p}));
 if(!Array.isArray(value))return NEGATIVE_BUILTINS.map(p=>({...p}));
 const ids=new Set<string>();return value.filter(valid).filter(p=>{if(ids.has(p.id))return false;ids.add(p.id);return true;}).slice(0,2000).map(({id,name,prompt,tags,createdAt})=>({id,name,prompt,...promptTagField(tags),createdAt}));
}
export function parseNegativeLibrary(text:string):NegativePromptPreset[]{
 if(text.length>5000000)throw Error('词库文件超过 5 MB。');
 let doc:any;
 try{doc=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw Error('不是有效的负面提示词库文件。');}
 if(doc?.identifier!=='langbai-negative-prompt-library'||doc.version!==1||!Array.isArray(doc.presets)||doc.presets.length>2000||doc.presets.some((p:unknown)=>!valid(p)))throw Error('不是有效的负面提示词库文件。');
 const entries=normalizeNegativePromptPresets(doc.presets);if(entries.length!==doc.presets.length)throw Error('词库中有重复的预设 ID。');return entries;
}
export function exportNegativeLibrary(presets:NegativePromptPreset[]){return JSON.stringify({identifier:'langbai-negative-prompt-library',version:1,presets:normalizeNegativePromptPresets(presets)},null,2);}
/** Preserve literal tag weights, repetitions and line breaks. Do not normalize prompts. */
export function applyNegativePreset(current:string,prompt:string,mode:'replace'|'append') {return mode==='replace'?prompt:appendPromptText(current,prompt);}
export function mergeNegativeLibrary(current:NegativePromptPreset[],imported:NegativePromptPreset[],newId:()=>string):NegativePromptPreset[]{
 const next=current.map(p=>({...p}));for(const p of imported){const same=next.find(e=>e.name===p.name&&e.prompt===p.prompt);if(same){const tags=mergePromptTags(same.tags,p.tags);if(tags.length)same.tags=tags;continue;}next.push({...p,id:next.some(e=>e.id===p.id)?newId():p.id});}if(next.length>2000)throw Error('预设最多 2000 个。');return next;
}
const labels:Record<string,string[]>={
 'zh-CN':['负面提示词库','选择后预览，再替换或追加；不会改动正面提示词。','搜索名称或提示词','保存当前','新建','编辑','删除','导入','导出','替换','追加','关闭','保存','取消','名称','负面提示词','暂无预设','已保存','已应用负面提示词','确认删除此预设？']};
export function negativeLibraryText(language:unknown){return labels[String(language)]??labels['zh-CN'];}
