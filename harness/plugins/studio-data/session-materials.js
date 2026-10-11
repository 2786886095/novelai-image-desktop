import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {convertMaterial,kinds} from './material-converter.js';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const identity=x=>typeof x==='string'&&/^[a-zA-Z0-9_.:-]{1,160}$/.test(x);
export function createMaterialWorkflow({directory,source,confirm,resolve,normalizeLoreBook}){
 const queues=new Map();
 async function read(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 async function write(file,value){await fs.mkdir(directory,{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(value),{mode:0o600,flag:'wx'});await fs.rename(tmp,file);}
 async function execute(args,exec){
  const sessionId=exec.agent?.session?.id,callId=exec.callId;
  if(!identity(sessionId)||!identity(callId))throw Error('请在已创建的酒馆会话内操作');
  const allowed=['action','collection','id',...(args.action==='apply'?['expectedRevision']:[])];
  if(!['inspect','apply'].includes(args.action)||Object.keys(args).some(k=>!allowed.includes(k))||!Object.hasOwn(kinds,args.collection)||typeof args.id!=='string'||!args.id||args.id.length>200)throw Error('本机资料绑定参数无效');
  const services=resolve(exec.agent,args.collection);
  if(!services?.sessions||!services.asset)throw Error('当前会话未启用相应 Roleplay 资料服务');
  const getProfile=()=>services.sessions.get(exec.agent);
  const load=async()=>{
   exec.signal?.throwIfAborted();
   const data=await source({collection:args.collection,id:args.id},exec);
   const converted=convertMaterial(args.collection,data.item,normalizeLoreBook);
   const profile=getProfile();
   if(!profile||!Number.isSafeInteger(profile.revision))throw Error('当前会话没有可读取的 Roleplay 状态');
   return {converted,profile,sourceHash:hash(data.item),revision:hash([sessionId,args.collection,args.id,data.item,profile])};
  };
  const eventFile=path.join(directory,'call-'+hash([sessionId,callId])+'.json');
  if(args.action==='apply'){
   const prior=await read(eventFile);
   if(prior){if(prior.input!==hash(args))throw Error('调用标识已用于其他参数');if(prior.result)return prior.result;throw Error('上次操作结果未确定，请读取会话和资料库，不自动重试创建');}
  }
  const current=await load(),{converted,profile,sourceHash}=current;
  const cacheFile=path.join(directory,'asset-'+hash([sessionId,args.collection,args.id,sourceHash])+'.json');
  if(args.action==='inspect')return {ok:true,collection:args.collection,id:args.id,name:converted.value.name,expectedRevision:current.revision,sessionRevision:profile.revision,currentBindings:profile.resources,warnings:converted.warnings,canApply:exec.fromUi?exec.agent.status==='idle':profile.runtime?.executionMode==='agent',instructions:'apply 传入本次 expectedRevision。确认只在当前 Agent 内出现；不会生成图片。'};
  if(typeof args.expectedRevision!=='string')throw Error('请先 inspect 读取本机资料和当前会话');
  if(exec.fromUi&&exec.agent.status!=='idle')throw Error('当前会话正在运行，请停止或等待本轮完成后再应用');
  if(!exec.fromUi&&profile.runtime?.executionMode!=='agent')throw Error('请先切换到 Agent 模式，再应用本机资料');
  if(current.revision!==args.expectedRevision)throw Error('本机资料或会话已变化，请重新 inspect');
  const cache=await read(cacheFile);
  if(cache?.state==='creating')throw Error('上次创建结果未确定，请检查酒馆资料库；未重复创建');
  if(cache?.asset){
   const detail=await services.asset.detail(cache.asset.id);
   const revision=detail.revision??detail.character?.revision;
   if(revision!==cache.asset.revision)throw Error('酒馆副本已被修改，请保留该副本并从原生酒馆资料库绑定；本次未覆盖');
   const bound=converted.slot==='lorebooks'?profile.resources.lorebooks?.some(x=>x.id===cache.asset.id):profile.resources[converted.slot]?.id===cache.asset.id;
   if(bound)return {ok:true,alreadyApplied:true,asset:cache.asset,binding:{applied:true,profileRevision:profile.revision},warnings:converted.warnings};
  }
  const approved=await confirm({name:converted.value.name,collection:args.collection,previous:profile.resources,warnings:converted.warnings,revision:current.revision},exec);
  if(!approved)return {ok:false,cancelled:true,assetCreated:false,binding:{applied:false}};
  if((await load()).revision!==args.expectedRevision)throw Error('确认期间资料或会话变化，请重新 inspect；尚未创建或绑定');
  exec.signal?.throwIfAborted();
  await write(eventFile,{input:hash(args),state:'pending',before:profile,source:{collection:args.collection,id:args.id,hash:sourceHash}});
  let asset=cache?.asset;
  if(!asset){
   await write(cacheFile,{state:'creating',callId});
   const result=await services.asset.create(converted.value);
   const saved=result.detail??result.created??result;
   const id=saved.id??result.created?.id;
   if(typeof id!=='string')throw Error('官方资料服务未返回持久化 ID，请检查资料库，不要重复创建');
   const detail=await services.asset.detail(id);
   asset={id,name:detail.name??detail.character?.name??converted.value.name,revision:detail.revision??detail.character?.revision};
   if(!Number.isSafeInteger(asset.revision))throw Error('官方资料回读缺少版本，请检查资料库');
   await write(cacheFile,{state:'created',asset});
  }
  let result={ok:false,asset,binding:{applied:false},warnings:converted.warnings};
  try{
   // CAS again after I/O. A saved copy may survive a bind failure, and is reused.
   if((await load()).revision!==args.expectedRevision)throw Error('创建副本期间资料或会话变化；副本已保存，未绑定，请重新 inspect');
   exec.signal?.throwIfAborted();
   const latest=await services.asset.detail(asset.id);
   if((latest.revision??latest.character?.revision)!==asset.revision)throw Error('酒馆副本在确认后变化；副本保留，未绑定');
   const changes=converted.slot==='lorebooks'?{lorebookIds:[...new Set([...(profile.resources.lorebooks??[]).map(x=>x.id),asset.id])]}:{[converted.slot==='card'?'cardId':converted.slot==='persona'?'personaId':'presetId']:asset.id};
   const after=await services.sessions[exec.fromUi?'bindAssetChanges':'bindAssetChangesDuringRun'](exec.agent,{expectedRevision:profile.revision,changes});
   result={...result,ok:true,binding:{applied:true,profileRevision:after.revision,resources:after.resources},recovery:{previousBindings:profile.resources,instructions:'原资料保留。恢复会话选择请通过 rp_asset bind，使用 previousBindings 中的原 ID。'}};
   try{if(exec.fromUi){result.contextRefreshed=false;result.effectiveNextTurn=true;}else{await services.runtime.refreshRunContext(exec.agent);result.contextRefreshed=true;}}catch(e){result.ok=false;result.contextRefreshed=false;result.error='绑定已保存，但本轮上下文刷新失败；请结束本轮再继续，不要重复导入：'+e.message;}
  }catch(e){result.error=e.message;}
  await write(eventFile,{input:hash(args),state:'complete',result});
  return result;
 }
 return {execute(args,exec){if(args?.action==='inspect')return execute(args,exec);const id=exec.agent?.session?.id;const job=(queues.get(id)??Promise.resolve()).then(()=>execute(args,exec));const done=job.catch(()=>{});queues.set(id,done);void done.then(()=>{if(queues.get(id)===done)queues.delete(id)});return job;}};
}
