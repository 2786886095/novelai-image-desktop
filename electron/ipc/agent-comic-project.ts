import type {TagComicProject,TagComicReferenceAsset} from '../../src/types';
import {buildComicSelectedZip,writeComicZip} from './comic-assets';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {comicProjectCatalog,validateComicAction} from '../../src/agent/comic-project-contract';
import type {AgentToolBridgeRequest,AgentToolBridgeResponse} from '../../src/agent/types';
export function createComicProjectHost(ask:(args:Record<string,unknown>)=>Promise<Record<string,unknown>>,approve:(r:AgentToolBridgeRequest)=>Promise<boolean>,exportRoot:()=>string,assets?:{outputRoot:()=>string;importReference:(projectId:string,source:string,sourceId:string,request:AgentToolBridgeRequest)=>Promise<TagComicReferenceAsset>}){
 let tail:Promise<unknown>=Promise.resolve();
 async function execute(request:AgentToolBridgeRequest):Promise<AgentToolBridgeResponse>{
  try{
   const spec=validateComicAction(request.args);request.signal?.throwIfAborted();
   if(spec.action==='comic.generation.status'||spec.action==='comic.generation.stop'){
    const data=await ask({action:spec.action.replace('comic.','_comic.'),...(spec.action==='comic.generation.stop'?{runId:request.args.runId}:{})});
    return {ok:true,title:spec.title,data,output:JSON.stringify(data)};
   }
   if(spec.effect==='confirm'){
    const current=await ask({action:'comic.project.read'});if(current.busy)throw Error('漫画任务进行中，请先停止');if(current.revision!==request.args.expectedRevision)throw Error('漫画工程已变化，请重新读取');
    if(!await approve({...request,args:{...request.args,title:spec.title,filesRetained:true}}))throw Error('已取消漫画工程修改');
   }
   request.signal?.throwIfAborted();
   if(spec.action==='comic.references.import'||spec.action==='comic.images.export'){
    if(!assets)throw Error('漫画资源适配器未就绪');
    const snapshot=await ask({action:'_comic.snapshot',expectedRevision:request.args.expectedRevision}),project=snapshot.project as TagComicProject;
    if(spec.action==='comic.references.import'){
     if(!['attachment','preset','history'].includes(String(request.args.source)))throw Error('source 须为 attachment/preset/history');
     if(project.preciseReferences.length>=5)throw Error('漫画工程最多5张参考图');
     const asset=await assets.importReference(project.id,String(request.args.source),String(request.args.sourceId),request);
     // If the reply/commit is uncertain, retain the imported file rather than
     // deleting a resource the renderer may already have durably referenced.
     try{
      request.signal?.throwIfAborted();
      const data=await ask({action:'_comic.attach-reference',expectedRevision:request.args.expectedRevision,asset});
      return {ok:true,title:spec.title,data,output:JSON.stringify(data)};
     }catch(e){throw Error(`参考文件已保存，工程关联未确认，请重新读取工程；保留缓存文件以免误删。${e instanceof Error?e.message:String(e)}`);}
    }
    const built=await buildComicSelectedZip(project,assets.outputRoot());
    await ask({action:'_comic.snapshot',expectedRevision:request.args.expectedRevision});request.signal?.throwIfAborted();
    const saved=await writeComicZip(path.join(path.resolve(exportRoot()),`comic-${randomUUID()}.zip`),built.bytes);
    const data={...saved,imageCount:built.imageCount,revision:snapshot.revision,format:'selected comic images ZIP',includesLocalPaths:false};
    return {ok:true,title:spec.title,data,output:JSON.stringify(data)};
   }
   let data=await ask(request.args);
   if(spec.action==='comic.project.export'){
    const json=String(data.json??'');if(!json||json.length>20*1024*1024)throw Error('导出项目大小无效');JSON.parse(json);
    const dir=path.resolve(exportRoot());await fs.mkdir(dir,{recursive:true});request.signal?.throwIfAborted();
    const filePath=path.join(dir,`comic-${randomUUID()}.json`),bytes=Buffer.from(json,'utf8');await fs.writeFile(filePath,bytes,{flag:'wx'});
    const saved=await fs.readFile(filePath);if(!saved.equals(bytes))throw Error('导出文件读回不一致');
    data={action:spec.action,revision:data.revision,filePath,bytes:saved.length,sha256:createHash('sha256').update(saved).digest('hex'),format:'portable comic project JSON',includesImages:false,includesLocalPaths:false};
   }
   return {ok:true,title:spec.title,data,output:JSON.stringify(data)};
  }catch(e){return {ok:false,title:'漫画工程操作未完成',output:e instanceof Error?e.message:String(e)};}
 }
 return {catalog:comicProjectCatalog,handles:(r:AgentToolBridgeRequest)=>r.tool==='langbai_software_action'&&Object.hasOwn(comicProjectCatalog,String(r.args.action)),execute:(r:AgentToolBridgeRequest)=>{
  if(!Object.hasOwn(comicProjectCatalog,String(r.args.action))||r.args.action==='comic.generation.stop'||comicProjectCatalog[String(r.args.action)]?.effect==='read')return execute(r);
  const task=tail.then(()=>execute(r));tail=task.catch(()=>{});return task;
 }};
}
