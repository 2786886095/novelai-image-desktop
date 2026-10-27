import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {app} from 'electron';
import {
  getBuiltinTemplates,isTemplateSlot,normalizeTemplateBody,validateTemplateName,parseTemplateImport,resolveTemplateSlot,
  type TemplateSlot,type TemplateRef,type CustomPromptTemplate,type TemplateOrigin,type TemplateImportEntry,
  type TemplateLibraryState,type TemplateLibraryMutation,type TemplateLibraryResult,
} from '../../shared/template-library';

const SCHEMA='langbai.template-library/1';
const MAX_LIBRARY_BYTES=16*1024*1024,MAX_CUSTOM_RECORDS=128;
type LibraryFile={schema:typeof SCHEMA;revision:number;custom:CustomPromptTemplate[];selection:Partial<Record<TemplateSlot,TemplateRef>>;quarantine:unknown[]};
const empty=():LibraryFile=>({schema:SCHEMA,revision:0,custom:[],selection:{},quarantine:[]});
const hash=(data:string|Buffer)=>createHash('sha256').update(data).digest('hex');
const EMPTY_REVISION=hash('langbai.template-library/1:absent');
const own=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function origin(value:unknown):TemplateOrigin {
  if(own(value)&&value.kind==='import'&&typeof value.fileName==='string'&&['txt','md','json'].includes(String(value.format)))return {kind:'import',fileName:value.fileName.split(/[\\/]/).pop()!.slice(0,180),format:value.format as 'txt'|'md'|'json'};
  if(own(value)&&value.kind==='fork'&&typeof value.builtinId==='string'&&typeof value.builtinSha256==='string')return {kind:'fork',builtinId:value.builtinId,builtinSha256:value.builtinSha256};
  return {kind:'blank'};
}
function validRecord(raw:unknown):CustomPromptTemplate|null {
  try{
    if(!own(raw)||typeof raw.id!=='string'||!raw.id||!isTemplateSlot(raw.slot)||typeof raw.createdAt!=='string'||typeof raw.updatedAt!=='string'||!Number.isSafeInteger(raw.rev)||Number(raw.rev)<1)return null;
    const name=validateTemplateName(raw.name),body=normalizeTemplateBody(raw.body);
    if(raw.sha256!==hash(body))return null;
    return {id:raw.id,slot:raw.slot,name,body,sha256:hash(body),origin:origin(raw.origin),createdAt:raw.createdAt,updatedAt:raw.updatedAt,rev:Number(raw.rev)};
  }catch{return null;}
}
/** Strict backup decode; damaged original bytes remain recoverable, never a silent built-in fallback. */
export function decodePromptTemplateLibraryBackup(raw:Buffer|string):LibraryFile {
  if(Buffer.byteLength(raw)>MAX_LIBRARY_BYTES)throw Error('模板库备份超过 16 MiB。');
  const text=typeof raw==='string'?raw:new TextDecoder('utf-8',{fatal:true}).decode(raw);
  const value:unknown=JSON.parse(text.replace(/^\uFEFF/,''));
  if(!own(value)||value.schema!==SCHEMA||!Number.isSafeInteger(value.revision)||Number(value.revision)<0||!Array.isArray(value.custom)||value.custom.length>MAX_CUSTOM_RECORDS||!own(value.selection)||!Array.isArray(value.quarantine))throw Error('模板库备份结构无效。');
  const data=empty();data.revision=Number(value.revision);data.quarantine=[...value.quarantine];const ids=new Set<string>();
  for(const item of value.custom){const row=validRecord(item);if(!row||ids.has(row.id))throw Error('模板库备份包含损坏或重复的模板。');ids.add(row.id);data.custom.push(row);}
  for(const [slot,ref] of Object.entries(value.selection)){
    if(!isTemplateSlot(slot)||!own(ref)||typeof ref.id!=='string'||!['builtin','custom'].includes(String(ref.kind)))throw Error('模板库备份选用无效。');
    const valid=ref.kind==='custom'?data.custom.some(row=>row.id===ref.id&&row.slot===slot):getBuiltinTemplates().some(row=>row.id===ref.id&&row.slot===slot);
    if(!valid)throw Error('模板库备份选用的模板不存在。');data.selection[slot]={kind:ref.kind as 'builtin'|'custom',id:ref.id};
  }
  return data;
}
/** Factory is injected for tests. Importing this module never reads Electron userData. */
export function createPromptTemplateLibraryStore(root:string|(()=>string),options:{id?:()=>string;now?:()=>Date;beforeCommit?:()=>void}={}) {
  const file=()=>path.join(typeof root==='function'?root():root,'prompt-template-library.json');
  function read(){
    const target=file(),warnings:string[]=[];let revision=EMPTY_REVISION;
    try{
      const stat=fs.statSync(target);if(!stat.isFile()||stat.size>MAX_LIBRARY_BYTES)throw Error('模板库不是普通文件或超过 16 MiB。');
      const raw=fs.readFileSync(target);revision=hash(raw);const parsed:unknown=JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,''));
      if(!own(parsed)||parsed.schema!==SCHEMA||!Number.isSafeInteger(parsed.revision)||Number(parsed.revision)<0||!Array.isArray(parsed.custom)||!own(parsed.selection)||!Array.isArray(parsed.quarantine))throw Error('模板库结构或版本不兼容。');
      if(parsed.custom.length>MAX_CUSTOM_RECORDS)throw Error('模板记录超过上限。');
      const data=empty();data.revision=Number(parsed.revision);data.quarantine=[...parsed.quarantine];const ids=new Set<string>();
      for(const row of parsed.custom){const valid=validRecord(row);if(!valid||ids.has(valid.id)){data.quarantine.push(row);warnings.push('有无法识别的自定义记录，已保留为隔离记录，未选用。');continue;}ids.add(valid.id);data.custom.push(valid);}
      for(const [slot,ref] of Object.entries(parsed.selection)){
        if(!isTemplateSlot(slot)||!own(ref)||!['builtin','custom'].includes(String(ref.kind))||typeof ref.id!=='string'){data.quarantine.push({selection:{[slot]:ref}});warnings.push('有无法识别的选用记录，已保留，当前回退内置。');continue;}
        const valid=ref.kind==='custom'?data.custom.some(t=>t.id===ref.id&&t.slot===slot):getBuiltinTemplates().some(t=>t.id===ref.id&&t.slot===slot);
        data.selection[slot]={kind:ref.kind as 'builtin'|'custom',id:ref.id};
        if(!valid)warnings.push('选用的模板已失效；原选用和自定义记录均已保留。请明确重新选择模板，未验证的选用不能提交转换。');
      }
      return {data,revision,warnings,readOnly:false,target};
    }catch(error){
      if((error as NodeJS.ErrnoException).code==='ENOENT')return {data:empty(),revision,warnings,readOnly:false,target};
      warnings.push('模板库读取失败，原文件保留且禁止覆盖：'+(error instanceof Error?error.message:String(error)));
      return {data:empty(),revision,warnings,readOnly:true,target};
    }
  }
  const state=(loaded:ReturnType<typeof read>):TemplateLibraryState=>({revision:loaded.revision,custom:loaded.data.custom.map(t=>({...t,origin:{...t.origin}})),selection:{...loaded.data.selection},builtins:getBuiltinTemplates(),warnings:[...loaded.warnings],...(loaded.readOnly?{readOnly:true}:{})});
  function get():TemplateLibraryState{return state(read());}
  function persist(target:string,data:LibraryFile,expectedRevision:string){
    const bytes=Buffer.from(JSON.stringify(data,null,2),'utf8');if(bytes.length>MAX_LIBRARY_BYTES)throw Error('模板库超过 16 MiB，未写入。');
    fs.mkdirSync(path.dirname(target),{recursive:true});const temp=target+'.'+randomUUID()+'.tmp';
    try{
      const fd=fs.openSync(temp,'wx');try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      if(!fs.readFileSync(temp).equals(bytes))throw Error('模板库临时文件读回不一致。');
      options.beforeCommit?.();
      const now=read();if(now.readOnly||now.revision!==expectedRevision)throw Error('TEMPLATE_LIBRARY_STALE');
      fs.renameSync(temp,target);
    }finally{try{fs.unlinkSync(temp);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
  }
  function mutate(request:TemplateLibraryMutation):TemplateLibraryResult {
    let loaded:ReturnType<typeof read>;try{loaded=read();}catch{return {ok:false,code:'io',message:'无法定位模板库存储目录。'};}
    const oldState=state(loaded);
    if(loaded.readOnly)return {ok:false,code:'corrupt',message:loaded.warnings.join('\n'),state:oldState};
    if(!own(request)||typeof request.expectedRevision!=='string')return {ok:false,code:'invalid',message:'模板库操作缺少版本，请刷新后重试。',state:oldState};
    if(request.expectedRevision!==loaded.revision)return {ok:false,code:'stale',message:'模板库已被其他操作更新，请刷新后重试。',state:oldState};
    const data:LibraryFile=JSON.parse(JSON.stringify(loaded.data));const addedIds:string[]=[];
    const uniqueName=(name:string,id?:string)=>{const base=validateTemplateName(name);let next=base,index=2;const used=new Set(data.custom.filter(t=>t.id!==id).map(t=>t.name.toLocaleLowerCase()));while(used.has(next.toLocaleLowerCase())){const suffix=` (${index++})`;next=Array.from(base).slice(0,60-Array.from(suffix).length).join('')+suffix;}return next;};
    try{
      if(request.action==='import'||request.action==='create'){
        let entries:TemplateImportEntry[];
        if(request.action==='import')entries='entries' in request?request.entries:parseTemplateImport(request.text,request.fileName,request.slot,request.name).entries;
        else {const builtin=request.fromBuiltinId?getBuiltinTemplates().find(t=>t.id===request.fromBuiltinId&&t.slot===request.slot):undefined;if(request.fromBuiltinId&&!builtin)throw Error('所选内置模板不存在或用途不匹配。');entries=[{slot:request.slot,name:request.name,body:request.body,origin:builtin?{kind:'fork',builtinId:builtin.id,builtinSha256:builtin.sha256}:{kind:'blank'}}];}
        if(!Array.isArray(entries)||!entries.length||entries.length>32||data.custom.length+entries.length>MAX_CUSTOM_RECORDS)throw Error('模板数量无效（每次最多 32 份，总计最多 128 份）。');
        // Validate the whole bundle before creating records or writing anything.
        const checked=entries.map(row=>{if(!own(row)||!isTemplateSlot(row.slot))throw Error('模板用途无效。');return {slot:row.slot,name:validateTemplateName(row.name),body:normalizeTemplateBody(row.body),origin:origin(row.origin)};});
        for(const row of checked){let id=(options.id??randomUUID)();if(!id||data.custom.some(t=>t.id===id)||getBuiltinTemplates().some(t=>t.id===id))id=randomUUID();const at=(options.now?.()??new Date()).toISOString();data.custom.push({...row,id,name:uniqueName(row.name),sha256:hash(row.body),createdAt:at,updatedAt:at,rev:1});addedIds.push(id);if(request.activate)data.selection[row.slot]={kind:'custom',id};}
      }else if(request.action==='update'){
        const row=data.custom.find(t=>t.id===request.id);if(!row)return {ok:false,code:'not-found',message:'只能编辑已存在的自定义模板；内置模板请另存为副本。',state:oldState};
        if(request.name!==undefined)row.name=uniqueName(request.name,row.id);if(request.body!==undefined)row.body=normalizeTemplateBody(request.body);row.sha256=hash(row.body);row.updatedAt=(options.now?.()??new Date()).toISOString();row.rev++;
      }else if(request.action==='select'){
        if(!isTemplateSlot(request.slot)||!own(request.ref)||!['builtin','custom'].includes(request.ref.kind))throw Error('模板选择无效。');
        const found=request.ref.kind==='custom'?data.custom.find(t=>t.id===request.ref.id&&t.slot===request.slot):getBuiltinTemplates().find(t=>t.id===request.ref.id&&t.slot===request.slot);if(!found)throw Error('模板不存在或用途不匹配。');data.selection[request.slot]={kind:request.ref.kind,id:request.ref.id};
      }else if(request.action==='reset'){
        if(!isTemplateSlot(request.slot))throw Error('模板用途无效。');delete data.selection[request.slot];
      }else if(request.action==='remove'){
        const row=data.custom.find(t=>t.id===request.id);if(!row)return {ok:false,code:'not-found',message:'自定义模板不存在；内置模板不能删除。',state:oldState};data.custom=data.custom.filter(t=>t.id!==request.id);for(const slot of Object.keys(data.selection) as TemplateSlot[])if(data.selection[slot]?.kind==='custom'&&data.selection[slot]?.id===request.id)delete data.selection[slot];
      }else throw Error('未知模板库操作。');
    }catch(error){return {ok:false,code:'invalid',message:error instanceof Error?error.message:String(error),state:oldState};}
    data.revision++;
    try{persist(loaded.target,data,loaded.revision);return {ok:true,state:get(),...(addedIds.length?{addedIds}:{})};}
    catch(error){return {ok:false,code:error instanceof Error&&error.message==='TEMPLATE_LIBRARY_STALE'?'stale':'io',message:error instanceof Error?error.message:'模板库写入失败，原文件未替换。',state:get()};}
  }
  function exportBackup():Buffer|null {
    try{const target=file(),stat=fs.statSync(target);if(!stat.isFile()||stat.size>MAX_LIBRARY_BYTES)throw Error('模板库备份源无效或过大。');return fs.readFileSync(target);}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  }
  function mergeBackup(raw:Buffer|string,expectedRevision:string):TemplateLibraryResult {
    const loaded=read(),oldState=state(loaded);if(loaded.readOnly)return {ok:false,code:'corrupt',message:'当前模板库损坏，原始字节保留，禁止覆盖。',state:oldState};
    if(loaded.revision!==expectedRevision)return {ok:false,code:'stale',message:'模板库已变化，未覆盖。',state:oldState};
    try{
      const incoming=decodePromptTemplateLibraryBackup(raw),data:LibraryFile=JSON.parse(JSON.stringify(loaded.data)),ids=new Map<string,string>(),addedIds:string[]=[];
      for(const row of incoming.custom){
        const identical=data.custom.find(item=>item.slot===row.slot&&item.sha256===row.sha256&&(item.name===row.name||item.name.startsWith(row.name+' (')&&/^\d+\)$/.test(item.name.slice(row.name.length+2))));
        if(identical){ids.set(row.id,identical.id);continue;}
        if(data.custom.length>=MAX_CUSTOM_RECORDS)throw Error('合并模板库超过 128 份，未写入。');
        let id=row.id;if(data.custom.some(item=>item.id===id))id=randomUUID();
        const names=new Set(data.custom.map(item=>item.name.toLocaleLowerCase()));let name=row.name,index=2;
        while(names.has(name.toLocaleLowerCase())){const suffix=` (${index++})`;name=Array.from(row.name).slice(0,60-Array.from(suffix).length).join('')+suffix;}
        data.custom.push({...row,id,name});ids.set(row.id,id);addedIds.push(id);
      }
      for(const [slot,ref] of Object.entries(incoming.selection) as [TemplateSlot,TemplateRef][]){
        if(data.selection[slot])continue;data.selection[slot]=ref.kind==='custom'?{kind:'custom',id:ids.get(ref.id)!}:{...ref};
      }
      data.quarantine.push(...incoming.quarantine);data.revision+=1;persist(loaded.target,data,expectedRevision);return {ok:true,state:get(),addedIds};
    }catch(error){return {ok:false,code:error instanceof Error&&error.message==='TEMPLATE_LIBRARY_STALE'?'stale':'invalid',message:error instanceof Error?error.message:String(error),state:get()};}
  }
  return {get,mutate,exportBackup,mergeBackup,resolve:(slot:TemplateSlot)=>{
    const current=get();if(current.readOnly)throw Error('模板库不可读取，未静默改用内置模板。请先恢复模板库文件或在设置中排查。');
    const selected=current.selection[slot],resolved=resolveTemplateSlot(slot,current);
    if(selected&&(selected.kind!==resolved.ref.kind||selected.id!==resolved.ref.id))throw Error('选用的模板已失效，未静默改用内置模板。请在设置中重新选择或恢复默认。');
    return resolved;
  }};
}
let defaultStore:ReturnType<typeof createPromptTemplateLibraryStore>|undefined;
function currentStore(){return defaultStore??=(createPromptTemplateLibraryStore(()=>{const root=app?.getPath?.('userData');if(!root)throw Error('Electron userData 尚不可用。');return root;}));}
export function getPromptTemplateLibrary(){return currentStore().get();}
export function mutatePromptTemplateLibrary(request:TemplateLibraryMutation){return currentStore().mutate(request);}
export function resolveTemplateLibrarySlot(slot:TemplateSlot){return currentStore().resolve(slot);}
export function exportPromptTemplateLibraryBackup(){return currentStore().exportBackup();}
export function mergePromptTemplateLibraryBackup(raw:Buffer|string,expectedRevision:string){return currentStore().mergeBackup(raw,expectedRevision);}
