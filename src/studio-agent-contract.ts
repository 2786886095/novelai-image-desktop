import {NAI_MODELS, NAI_SAMPLERS, NAI_INPAINT_MODELS, DIRECTOR_TOOLS} from './types';
import {STYLE_SORTS} from './style-library';

export interface StudioAgentRequest { id:string; action:'read'|'list'|'prepare'|'apply'|'backup-capture'|'backup-restore'|'tasks'|'collections'|'comic-project'|'batch-project'; args:Record<string,unknown>; }
export interface StudioAgentReply { ok:boolean; data?:unknown; error?:string; }
export interface FieldRule { type:'string'|'boolean'|'number'|'enum'; min?:number; max?:number; step?:number; enum?:readonly (string|number)[]; }
const str:FieldRule={type:'string',max:30000};
const bool:FieldRule={type:'boolean'};
const num=(min:number,max:number,step?:number):FieldRule=>({type:'number',min,max,step});
const choice=(...values:(string|number)[]):FieldRule=>({type:typeof values[0]==='number'?'number':'string',enum:values});
export const STUDIO_WRITABLE:Record<string,Record<string,FieldRule>>={
  params:{
    model:choice(...NAI_MODELS.map(x=>x.value)), stylePrompt:str,positivePrompt:str,negativePrompt:str,
    width:num(64,4096,64),height:num(64,4096,64),steps:num(1,50,1),cfgScale:num(0,10),cfgRescale:num(0,1),
    sampler:choice(...NAI_SAMPLERS.map(x=>x.value)),noiseSchedule:choice('native','karras','exponential'),
    seed:num(0,0xffffffff,1),seedMode:choice('random','fixed'),ucPreset:choice(0,1,2,3),
    qualityPreset:choice('standard','light','none'),qualityToggle:bool,transparentBackground:bool,
    smea:bool,smeaDyn:bool,variety:bool,fileNamePrefix:{type:'string',max:100},
  },
  workbench:{
    batchCount:num(1,999,1),batchIntervalSeconds:num(0,3600,1),
    inpaintModel:choice(...NAI_INPAINT_MODELS.map(x=>x.value)),inpaintStrength:num(0,1),inpaintNoise:num(0,0.99),
    inpaintPositivePrompt:str,brushSize:num(1,500,1),brushOpacity:num(0.05,1),brushShape:choice('round','square'),
    upscaleScale:{type:'enum',enum:[2,4,'max']},
    directorTool:choice(...DIRECTOR_TOOLS.map(x=>x.value)),
  },
  i2iParams:{strength:num(0,1),noise:num(0,0.99),extraNoiseSeed:num(0,2147483647,1)},
  augmentOptions:{defry:num(0,5,1),colorizePrompt:str,emotion:choice('neutral','happy','sad','angry','surprised','scared','disgusted','amazed'),emotionLevel:num(0,5,1)},
  settings:{
    language:choice('zh-CN','zh-TW','en-US','ja-JP','ko-KR'),theme:choice('light','dark','system'),
    reduceMotion:bool,autoComplete:bool,weightHighlight:bool,promptRandomizer:bool,superDrop:bool,
    streamPreviewEnabled:bool,showFloatingToolbar:bool,historyJumpAfterGenerate:bool,loggingEnabled:bool,keepImageMetadata:bool,
    autoBackupEnabled:bool,autoBackupIntervalHours:num(1,8760,1),autoBackupRetentionCount:num(1,365,1),autoBackupIncludeImages:bool,
    lockStylePrompt:bool,lockNegativePrompt:bool,savedStylePrompt:str,savedNegativePrompt:str,
    persistGenerateParams:bool,persistI2IParams:bool,persistInpaintParams:bool,persistUpscaleParams:bool,persistDirectorParams:bool,
    visionApiModel:str,visionSystemPrompt:str,convertApiModel:str,convertSystemPrompt:str,
    agentApiModel:str,agentProviderName:str,agentContextWindow:num(8192,2000000,1),agentMaxOutputTokens:num(512,131072,1),
    agentAutoCompact:bool,agentVisionEnabled:bool,
    reversePromptMode:choice('tags','natural','mixed'),convertMode:choice('tags','natural','mixed'),
    reversePromptTemplateVersion:choice('v4.5','v5'),convertPromptTemplateVersion:choice('v4.5','v5'),
    reverseConvertDshEnabled:bool,reverseConvertDshMode:choice('focused','strict'),promptOptimizeTemplate:str,promptAssistantTemplate:str,
    translateProvider:choice('google','baidu','ai'),translateAiModel:str,
    stylePromptPresetSort:choice(...STYLE_SORTS),
  },
};

// Credentials are deliberately represented only as presence. Never pass image bodies
// or credential-bearing URLs/stdio arguments through a model-facing read tool.
const secretKey=/(?:apikey|secret|password|authorization|cookie|credential|tagServerArgs|tagServerCommand)|^(?:token|accessToken|refreshToken)$/i;
const binaryKey=/(?:base64|encodings|inpaintMask|imageData|previewData)/i;
export function projectStudioData(value:unknown,key='',depth=0):unknown {
  if(secretKey.test(key))return {configured:!!value};
  if(binaryKey.test(key))return {present:!!value};
  if(depth>12)return {omitted:'depth limit'};
  if(typeof value==='string') {
    if(/^(data:|blob:)/i.test(value))return {present:true,omitted:'image body'};
    if(/url$/i.test(key) && value) {
      try { const url=new URL(value);url.username='';url.password='';url.search='';url.hash='';return url.toString(); }
      catch { return {configured:true,omitted:'nonstandard URL'}; }
    }
    return value.length>30000?{text:value.slice(0,30000),truncated:true,totalCharacters:value.length}:value;
  }
  if(Array.isArray(value))return value.length>50
    ?{items:value.slice(0,50).map(v=>projectStudioData(v,'',depth+1)),total:value.length,truncated:true}
    :value.map(v=>projectStudioData(v,'',depth+1));
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k,v])=>typeof v!=='function' && !['__proto__','constructor','prototype'].includes(k)).map(([k,v])=>[k,projectStudioData(v,k,depth+1)]));
  return value;
}

export function validateStudioPatch(args:Record<string,unknown>) {
  const target=String(args.target??'');
  if(!Object.hasOwn(STUDIO_WRITABLE,target))throw new Error('未知修改目标；先读取 writableSchema。');
  const patch=args.patch;
  if(!patch || typeof patch!=='object' || Array.isArray(patch) || Object.keys(patch).length!==1)
    throw new Error('每次修改一个字段：patch 必须恰好包含一个键。');
  const [key,value]=Object.entries(patch)[0];
  const rule=Object.hasOwn(STUDIO_WRITABLE[target],key)?STUDIO_WRITABLE[target][key]:undefined;
  if(!rule)throw new Error(`字段未开放修改：${target}.${key}`);
  if(rule.type!=='enum'&&typeof value!==rule.type)throw new Error(`字段类型错误：${key} 应为 ${rule.type}`);
  if(rule.enum && !rule.enum.includes(value as string|number))throw new Error(`字段选项错误：${key}`);
  if(typeof value==='number' && (!Number.isFinite(value) || value<(rule.min??-Infinity) || value>(rule.max??Infinity) || (rule.step && Math.abs(value/rule.step-Math.round(value/rule.step))>1e-8)))throw new Error(`字段超出范围或步长：${key}`);
  if(typeof value==='string' && value.length>(rule.max??30000))throw new Error(`字段过长：${key}`);
  return {target,key,value};
}

export function validateStyleInput(args:Record<string,unknown>) {
  const text=(key:string,max:number)=>{const value=args[key];if(typeof value!=='string' || !value.trim() || value.length>max)throw new Error(`${key} 必须是非空文字（最多 ${max} 字符）`);return value.trim();};
  const name=text('name',200),prompt=text('prompt',30000);
  const group=args.group===undefined?'Default':text('group',100);
  const rating=args.rating??0;
  if(typeof rating!=='number' || !Number.isFinite(rating) || rating<0 || rating>5)throw new Error('评分应在 0–5 之间');
  if(args.id!==undefined && (typeof args.id!=='string'||!args.id||args.id.length>200))throw new Error('风格 ID 无效');
  return {name,prompt,group,rating,id:args.id as string|undefined};
}
