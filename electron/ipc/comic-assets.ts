import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import JSZip from 'jszip';
import {validateImage,MAX_IMAGE_BYTES} from './image-codec';
import type {TagComicProject,TagComicGenerateRequest,PreciseReferenceItem} from '../../src/types';

export async function readComicImage(file:string,root?:string){
 const real=await fs.realpath(file);
 if(root){const parent=await fs.realpath(root),rel=path.relative(parent,real);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('图片路径不属于当前漫画资源目录');}
 const handle=await fs.open(real,'r');
 try{const stat=await handle.stat();if(!stat.isFile()||stat.size>MAX_IMAGE_BYTES)throw Error('图片不存在或超过32 MiB');const bytes=await handle.readFile();const meta=await validateImage(bytes);return {bytes,extension:meta.extension};}
 finally{await handle.close();}
}
/** Validate every selected reference before any paid call. Never silently drop one. */
export async function readComicReferences(request:TagComicGenerateRequest,root:string):Promise<PreciseReferenceItem[]>{
 const refs=request.preciseReferences??[];if(!Array.isArray(refs)||refs.length>5)throw Error('漫画参考图数量无效');
 const output:PreciseReferenceItem[]=[];
 for(const ref of refs){
  if(!['character','style','character&style'].includes(ref.type)||![ref.strength,ref.fidelity,ref.informationExtracted].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1))throw Error('漫画参考图参数无效');
  try{const {bytes}=await readComicImage(ref.filePath,root);output.push({base64:bytes.toString('base64'),type:ref.type,strength:ref.strength,fidelity:ref.fidelity,informationExtracted:ref.informationExtracted});}
  catch{throw Error('所选漫画参考图不存在、损坏或目录不匹配；请重新导入或取消选用。尚未提交生图。');}
 }
 return output;
}
export async function buildComicSelectedZip(project:TagComicProject,outputRoot:string){
 if(!project||project.schemaVersion!==2||!Array.isArray(project.panels))throw Error('漫画项目格式无效');
 const selected=[...project.panels].sort((a,b)=>a.index-b.index).filter(p=>p.selectedCandidateId);
 if(!selected.length)throw Error('请先为至少一个分镜选择主图');
 const zip=new JSZip(),manifest:Record<string,unknown>[]=[],indexes=new Set<number>();let total=0;
 for(const panel of selected){
  if(!Number.isSafeInteger(panel.index)||panel.index<1||indexes.has(panel.index))throw Error('分镜序号无效或重复');indexes.add(panel.index);
  const candidates=panel.candidates.filter(c=>c.id===panel.selectedCandidateId);if(candidates.length!==1)throw Error(`第${panel.index}格的主图记录已失效`);
  let image;try{image=await readComicImage(candidates[0].outputPath,outputRoot);}catch{throw Error(`第${panel.index}格主图不存在、损坏或不属于输出目录；未导出残缺ZIP`);}
  total+=image.bytes.length;if(total>512*1024*1024)throw Error('选图合计超过512 MiB，请分组导出');
  const file=`images/${String(panel.index).padStart(3,'0')}.${image.extension}`;zip.file(file,image.bytes);
  manifest.push({index:panel.index,title:panel.title,prompt:panel.prompt,selectedCandidateId:candidates[0].id,file});
 }
 zip.file('project.json',JSON.stringify({schemaVersion:2,title:project.title,globalStylePrompt:project.globalStylePrompt,globalNegativePrompt:project.globalNegativePrompt,panels:manifest},null,2));
 zip.file('prompts.md',[`# ${project.title||'Comic Project'}`,'',...manifest.flatMap(p=>[`## ${String(p.index).padStart(3,'0')} · ${p.title||'Panel'}`,'',String(p.prompt||''),''])].join('\n'));
 const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});await JSZip.loadAsync(bytes,{checkCRC32:true});
 return {bytes,imageCount:manifest.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export async function writeComicZip(filePath:string,bytes:Buffer,overwrite=false){
 const target=path.resolve(filePath),temp=target+'.'+randomUUID()+'.tmp';
 await fs.mkdir(path.dirname(target),{recursive:true});
 try{await fs.writeFile(temp,bytes,{flag:'wx'});const read=await fs.readFile(temp);if(!read.equals(bytes))throw Error('ZIP文件读回不一致');
  // Hard-link commit is exclusive for Agent exports; the native save dialog can authorize replacement.
  if(overwrite)await fs.rename(temp,target);else{await fs.link(temp,target);await fs.unlink(temp);}
 }catch(e){await fs.unlink(temp).catch(()=>{});throw e;}
 return {filePath:target,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}

export function desktopComicAssets(){
 return {
  outputRoot:()=>{throw Error('Supply current output root from host');},
  async importReference(projectId:string,source:string,sourceId:string,request:import('../../src/agent/types').AgentToolBridgeRequest){
   let sourcePath:string|undefined,preset:import('../../src/types').ReferencePreset|undefined;
   if(source==='preset'){
    preset=(await(await import('./reference-presets.js')).listReferencePresets()).presets.find(p=>p.id===sourceId);sourcePath=preset?.filePath;
   }else if(source==='history'){
    sourcePath=(await import('./store.js')).getHistoryReferenceItems().find(i=>i.id===sourceId)?.filePath;
   }else if(source==='attachment'){
    const conversation=(await import('./agent-store.js')).conversationForRuntimeSession(request.sessionId??'');
    const attachments=[...(conversation?.draftAttachments??[]),...(conversation?.messages??[]).flatMap(m=>[...m.attachments,...m.tools.flatMap(t=>t.generatedImages??[])])];
    const item=attachments.find(a=>a.id===sourceId&&!a.unavailable&&a.kind==='image');sourcePath=item?.filePath;
   }
   if(!sourcePath)throw Error('找不到已登记的参考来源；请先上传附件、读取参考预设或历史图片ID');
   request.signal?.throwIfAborted();const result=await(await import('./nai.js')).importTagComicReference({projectId,sourcePath});
   if(!result.ok||!result.asset)throw Error(result.message);
   return preset?{...result.asset,name:preset.name,type:preset.preciseType,strength:preset.strength,fidelity:preset.fidelity}:result.asset;
  },
 };
}
