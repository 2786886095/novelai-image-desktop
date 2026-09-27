export type LibraryRule={type:'string'|'number'|'boolean'|'array'|'object';label?:string;max?:number;min?:number;integer?:boolean;values?:string[];items?:LibraryRule;fields?:Record<string,LibraryRule>};
const text=(label:string,max=30000):LibraryRule=>({type:'string',label,max});
const num=(label:string,min:number,max:number,integer=false):LibraryRule=>({type:'number',label,min,max,integer});
const bool=(label:string):LibraryRule=>({type:'boolean',label});
const strings=(label:string):LibraryRule=>({type:'array',label,max:200,items:text(label,2000)});
const name=text('名称',160);
const visual:LibraryRule={type:'object',label:'角色生图参数',fields:{positivePrompt:text('正面提示词'),negativePrompt:text('负面提示词'),stylePrompt:text('风格提示词'),model:text('模型',100),width:num('宽度',64,4096,true),height:num('高度',64,4096,true),steps:num('步数',1,50,true),scale:num('引导强度',0,10),sampler:text('采样器',100),count:num('张数',1,8,true),referencePresetIds:{...strings('参考图预设 ID'),max:24}}};
const entry:LibraryRule={type:'object',fields:{id:text('条目 ID',200),keys:strings('关键词'),secondaryKeys:strings('辅助关键词'),content:text('条目内容'),enabled:bool('启用'),constant:bool('常驻'),selective:bool('辅助关键词筛选'),caseSensitive:bool('区分大小写'),insertionOrder:num('插入顺序',0,10000,true),priority:num('优先级',0,10000,true),position:{type:'string',label:'插入位置',values:['before-character','after-character','before-examples','after-examples','depth']},depth:num('深度',0,100,true),comment:text('备注',500)}};
export const LIBRARY_FIELDS:Record<string,Record<string,LibraryRule>>={
 characters:{name,nickname:text('昵称'),description:text('描述'),personality:text('性格'),scenario:text('场景'),firstMessage:text('开场白'),exampleMessages:text('对话示例'),creatorNotes:text('作者备注'),systemPrompt:text('系统提示词'),postHistoryInstructions:text('历史后提示词'),alternateGreetings:{...strings('备用开场白'),max:100},groupOnlyGreetings:{...strings('群聊开场白'),max:100},tags:strings('标签'),creator:text('作者',200),characterVersion:text('角色版本',80),favorite:bool('收藏'),visual},
 personas:{name,description:text('人设内容'),favorite:bool('收藏')},
 lorebooks:{name,description:text('世界书说明',10000),scanDepth:num('扫描深度',1,100,true),tokenBudget:num('Token 预算',128,131072,true),recursiveScanning:bool('递归扫描'),entries:{type:'array',label:'世界书条目',max:500,items:entry}},
 samplerPresets:{name,systemPrompt:text('系统提示词'),jailbreakPrompt:text('追加提示词'),temperature:num('温度',0,2),topP:num('Top P',0,1),frequencyPenalty:num('频率惩罚',-2,2),presencePenalty:num('重复惩罚',-2,2),maxOutputTokens:num('输出 Token 上限',128,131072,true),stop:{...strings('停止词'),max:32}},
 styles:{name,prompt:text('风格提示词'),group:text('分组',200),rating:num('评分',0,5)},
 positivePresets:{name,prompt:text('正面提示词')},
};
export function validateLibraryValue(value:unknown,rule:LibraryRule,path:string) {
 if(rule.type==='string'){if(typeof value!=='string'||value.length>(rule.max??30000)||rule.values&&!rule.values.includes(value))throw Error(path+' 文本或选项无效');}
 else if(rule.type==='number'){if(typeof value!=='number'||!Number.isFinite(value)||value<(rule.min??-Infinity)||value>(rule.max??Infinity)||rule.integer&&!Number.isInteger(value))throw Error(path+' 数值超出范围');}
 else if(rule.type==='boolean'){if(typeof value!=='boolean')throw Error(path+' 必须为开关值');}
 else if(rule.type==='array'){if(!Array.isArray(value)||value.length>(rule.max??200))throw Error(path+' 列表过长');value.forEach(x=>validateLibraryValue(x,rule.items!,path));}
 else {if(!value||typeof value!=='object'||Array.isArray(value))throw Error(path+' 应为对象');for(const [key,v] of Object.entries(value)){if(!Object.hasOwn(rule.fields!,key))throw Error(path+' 未开放字段：'+key);validateLibraryValue(v,rule.fields![key],path+'.'+key);}}
}
export function validateLibraryRequest(args:Record<string,unknown>){
 if(!Object.hasOwn(LIBRARY_FIELDS,String(args.collection)))throw Error('资料分类无效');
 if(!['read','create','update','delete'].includes(String(args.action)))throw Error('资料操作应为 read/create/update/delete');
 const allowed=args.action==='read'?['action','collection','id','offset','limit']:['action','collection','expectedRevision',...(args.action==='create'?['patch']:args.action==='update'?['id','patch']:['id'])];
 for(const key of Object.keys(args))if(!allowed.includes(key))throw Error('未知资料参数：'+key);
 if(args.id!==undefined&&(typeof args.id!=='string'||!args.id||args.id.length>200))throw Error('资料 ID 无效');
 if(['update','delete'].includes(String(args.action))&&!args.id)throw Error('请选择资料 ID');
 if(args.action!=='read'&&(typeof args.expectedRevision!=='string'||!args.expectedRevision))throw Error('请先读取资料并传入 expectedRevision');
 for(const [key,min,max] of [['offset',0,1000000],['limit',1,50]] as const)if(args[key]!==undefined&&(!Number.isSafeInteger(args[key])||Number(args[key])<min||Number(args[key])>max))throw Error('分页参数无效');
 if(['create','update'].includes(String(args.action))){
  validateLibraryValue(args.patch,{type:'object',fields:LIBRARY_FIELDS[String(args.collection)]},'资料');
  const patch=args.patch as Record<string,unknown>;if(!Object.keys(patch).length||JSON.stringify(patch).length>95000)throw Error('修改内容为空或过大');
  if('name' in patch&&!(patch.name as string).trim())throw Error('名称不能为空');
  if(args.action==='create'&&(!patch.name||['styles','positivePresets'].includes(String(args.collection))&&typeof patch.prompt!=='string'))throw Error('新建资料需要名称；提示词预设还需要 prompt');
 }
 return args as {action:'read'|'create'|'update'|'delete';collection:string;id?:string;patch?:Record<string,unknown>;expectedRevision?:string;offset?:number;limit?:number};
}
/** Patch nested objects without losing unedited reference lists, images or extension fields. */
export function mergeLibraryPatch(base:Record<string,unknown>,patch:Record<string,unknown>):Record<string,unknown>{return {...base,...Object.fromEntries(Object.entries(patch).map(([key,value])=>[key,value&&typeof value==='object'&&!Array.isArray(value)?mergeLibraryPatch((base[key]??{}) as Record<string,unknown>,value as Record<string,unknown>):value]))};}
