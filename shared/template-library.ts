import imageCatalog from './prompt-skill-catalog-v3.json';
import comicCatalog from './comic-template-catalog.json';

export const TEMPLATE_SLOTS = [
  'image.reverse.tags','image.reverse.natural','image.reverse.mixed',
  'image.convert.tags','image.convert.natural','image.convert.mixed',
  'comic.jp-page','comic.single-panel',
] as const;
export type TemplateSlot = typeof TEMPLATE_SLOTS[number];
export type TemplateRef = {kind:'builtin'|'custom';id:string};
export interface BuiltinPromptTemplate {
  id:string;slot:TemplateSlot;name:string;title:string;body:string;sha256:string;
  sourceFile:string;sourceVersion?:string;skillVersion?:string;
}
export type TemplateOrigin = {kind:'import';fileName:string;format:'txt'|'md'|'json'} | {kind:'fork';builtinId:string;builtinSha256:string} | {kind:'blank'};
export interface CustomPromptTemplate {
  id:string;slot:TemplateSlot;name:string;body:string;sha256:string;origin:TemplateOrigin;
  createdAt:string;updatedAt:string;rev:number;
}
export interface TemplateLibraryState {
  revision:string;custom:CustomPromptTemplate[];selection:Partial<Record<TemplateSlot,TemplateRef>>;
  builtins:BuiltinPromptTemplate[];warnings:string[];readOnly?:boolean;
}
export interface ResolvedLibrarySlot {
  slot:TemplateSlot;ref:TemplateRef;name:string;body:string;sha256:string;
  source:'builtin'|'custom';sourceVersion?:string;revision:string;
}
export interface TemplateImportEntry {slot:TemplateSlot;name:string;body:string;origin?:TemplateOrigin}
export interface TemplateImportPreview {entries:TemplateImportEntry[];warnings:string[]}
type Revision = {expectedRevision:string};
export type TemplateLibraryMutation = Revision & (
  | {action:'import';entries:TemplateImportEntry[];activate?:boolean}
  | {action:'import';text:string;fileName:string;slot:TemplateSlot;name?:string;activate?:boolean}
  | {action:'create';slot:TemplateSlot;name:string;body:string;fromBuiltinId?:string;activate?:boolean}
  | {action:'update';id:string;name?:string;body?:string}
  | {action:'select';slot:TemplateSlot;ref:TemplateRef}
  | {action:'reset';slot:TemplateSlot}
  | {action:'remove';id:string}
);
export type TemplateLibraryResult = {ok:true;state:TemplateLibraryState;addedIds?:string[]} | {ok:false;code:'stale'|'invalid'|'corrupt'|'io'|'not-found';message:string;state?:TemplateLibraryState};
export const MAX_TEMPLATE_BYTES = 256 * 1024;
export const MAX_TEMPLATE_IMPORT_BYTES = 8 * 1024 * 1024;
export const MAX_TEMPLATE_IMPORT_RECORDS = 32;

export function isTemplateSlot(value:unknown):value is TemplateSlot {
  return typeof value==='string' && (TEMPLATE_SLOTS as readonly string[]).includes(value);
}
export function normalizeTemplateBody(value:unknown):string {
  if(typeof value!=='string')throw Error('模板正文必须是文本。');
  const body=value.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
  if(!body.trim())throw Error('模板正文不能为空。');
  if(body.includes('\0'))throw Error('模板正文不能包含 NUL 字符。');
  if(new TextEncoder().encode(body).byteLength>MAX_TEMPLATE_BYTES)throw Error('每份模板正文不能超过 256 KiB（UTF-8）。');
  return body;
}
export function validateTemplateName(value:unknown):string {
  if(typeof value!=='string')throw Error('请为模板命名。');
  const name=value.trim();
  if(!name || Array.from(name).length>60 || /[\0\r\n]/.test(name))throw Error('模板名称须为 1–60 个字符，不能含换行或 NUL。');
  return name;
}
/** Built-in bodies are immutable source resources, never normalized or edited here. */
export function getBuiltinTemplates():BuiltinPromptTemplate[] {
  return [...imageCatalog.templates,...comicCatalog.templates].map(item=>{
    if(!isTemplateSlot(item.slot))throw Error('内置模板槽位无效。');
    return {id:item.id,slot:item.slot,name:item.title,title:item.title,body:item.body,sha256:item.sha256,sourceFile:item.sourceFile,
      ...('sourceVersion' in item ? {sourceVersion:String(item.sourceVersion)} : {skillVersion:'3.0.0'})};
  });
}
export function resolveTemplateSlot(slot:TemplateSlot,state:TemplateLibraryState):ResolvedLibrarySlot {
  if(!isTemplateSlot(slot))throw Error('模板槽位无效。');
  const builtin=state.builtins.find(item=>item.slot===slot);
  if(!builtin)throw Error('内置模板不存在。');
  const ref=state.selection[slot];
  const custom=ref?.kind==='custom'?state.custom.find(item=>item.id===ref.id&&item.slot===slot):undefined;
  const selected=custom??builtin;
  return {slot,ref:{kind:custom?'custom':'builtin',id:selected.id},name:selected.name,body:selected.body,sha256:selected.sha256,
    source:custom?'custom':'builtin',...(!custom&&builtin.sourceVersion?{sourceVersion:builtin.sourceVersion}:{}),revision:state.revision};
}
function recordSlot(value:Record<string,unknown>,fallback:TemplateSlot):TemplateSlot {
  if(value.slot!==undefined){if(!isTemplateSlot(value.slot))throw Error('JSON 模板槽位无效。');return value.slot;}
  if(value.comicFormat!==undefined){const key='comic.'+value.comicFormat;if(!isTemplateSlot(key))throw Error('JSON 漫画模板类型无效。');return key;}
  if(value.task!==undefined||value.mode!==undefined){const key='image.'+value.task+'.'+value.mode;if(!isTemplateSlot(key))throw Error('JSON 图片模板任务或模式无效。');return key;}
  return fallback;
}
/** Import is pure data parsing. IDs, scripts, paths and other unknown metadata are ignored. */
export function parseTemplateImport(text:string,fileName:string,defaultSlot:TemplateSlot,name?:string):TemplateImportPreview {
  if(!isTemplateSlot(defaultSlot))throw Error('请先选择模板用途。');
  if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>MAX_TEMPLATE_IMPORT_BYTES)throw Error('导入文件不能超过 8 MiB（UTF-8）。');
  const file=(String(fileName||'template.txt').split(/[\\/]/).pop()||'template.txt').slice(0,180);
  const extension=file.split('.').pop()?.toLowerCase();
  if(extension!=='txt'&&extension!=='md'&&extension!=='json')throw Error('仅支持 TXT、MD 和 JSON 模板。');
  const format:'txt'|'md'|'json'=extension;
  const defaultName=name??file.replace(/\.(?:txt|md|json)$/i,'');
  let rows:unknown[];
  if(extension==='json'){
    let parsed:unknown;try{parsed=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw Error('JSON 格式错误，未导入任何模板。');}
    if(Array.isArray(parsed))rows=parsed;
    else if(parsed&&typeof parsed==='object'&&Array.isArray((parsed as Record<string,unknown>).templates))rows=(parsed as {templates:unknown[]}).templates;
    else rows=[parsed];
  }else rows=[{name:defaultName,slot:defaultSlot,body:text}];
  if(!rows.length||rows.length>MAX_TEMPLATE_IMPORT_RECORDS)throw Error('每次须导入 1–32 份模板。');
  const warnings:string[]=[];
  const entries=rows.map((raw,index)=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error(`第 ${index+1} 份模板须为对象。`);
    const item=raw as Record<string,unknown>;const slot=recordSlot(item,defaultSlot);
    const entry:TemplateImportEntry={slot,name:validateTemplateName(item.name??(rows.length===1?defaultName:defaultName+' '+(index+1))),body:normalizeTemplateBody(item.body),origin:{kind:'import',fileName:file,format}};
    if(slot.startsWith('image.')&&!entry.body.includes('{{input}}'))warnings.push(`${entry.name}：缺少 {{input}}，用户内容仍由独立请求消息传入。`);
    if(slot.startsWith('image.reverse.')&&!entry.body.includes('{{image}}'))warnings.push(`${entry.name}：缺少 {{image}}，图像仍由实际附件传入。`);
    if(slot.startsWith('comic.')&&entry.body.includes('{{input}}'))warnings.push(`${entry.name}：包含 {{input}}，漫画请求会按字面替换用户内容。`);
    return entry;
  });
  return {entries,warnings};
}
export const parseImportedTemplate=parseTemplateImport;
