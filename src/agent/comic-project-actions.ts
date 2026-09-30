import type {ComicProjectStore} from '../comic/project-store';
import {createTagComicPanel,createTagComicProject,normalizeTagComicProject,parseTagComicImport,parseTagComicSizeImport,TAG_COMIC_SIZE_PRESETS} from '../comic/tag-comic';
import type {GenerateParams,TagComicPanel,TagComicProject,TagComicReferenceAsset,TagComicPanelReference} from '../types';
import {projectStudioData,STUDIO_WRITABLE,validateStudioPatch} from '../studio-agent-contract';
import {validateComicAction} from './comic-project-contract';
function object(v:unknown){if(!v||typeof v!=='object'||Array.isArray(v))throw Error('修改内容必须为对象');return v as Record<string,unknown>;}
function string(v:unknown,max=30000){if(typeof v!=='string'||v.length>max)throw Error('文字字段无效或过长');return v;}
function params(v:unknown){const result:Record<string,unknown>={};for(const [key,value] of Object.entries(object(v))){validateStudioPatch({target:'params',patch:{[key]:value}});result[key]=value;}return result as Partial<GenerateParams>;}
function safeParams(v:unknown){return params(Object.fromEntries(Object.entries(object(v)).filter(([key])=>Object.hasOwn(STUDIO_WRITABLE.params,key))));}
function projectPatch(raw:unknown):Partial<TagComicProject>{
 const patch:Partial<TagComicProject>={};for(const [key,value] of Object.entries(object(raw))){
  if(key==='title')patch.title=string(value,200);
  else if(key==='globalStylePrompt'||key==='globalNegativePrompt')patch[key]=string(value);
  else if(key==='globalParams')patch.globalParams=params(value) as GenerateParams;
  else if(key==='initialGenerationCount'){if(!Number.isInteger(value)||(value as number)<1||(value as number)>10)throw Error('每格初始候选数须为1–10，与漫画页面一致');patch.initialGenerationCount=value as number;}
  else if(key==='sizeMode'){if(value!=='uniform'&&value!=='perPanel')throw Error('sizeMode 应为 uniform/perPanel');patch.sizeMode=value;}
  else throw Error('未开放的漫画全局字段：'+key);
 }return patch;
}
function panelPatch(raw:unknown):Partial<TagComicPanel>{
 const patch:Partial<TagComicPanel>={};for(const [key,value] of Object.entries(object(raw))){
  if(key==='title')patch.title=string(value,200);else if(key==='prompt')patch.prompt=string(value);
  else if(key==='imageSize'){if(value===null)patch.imageSize=undefined;else{const v=object(value);if(Object.keys(v).some(k=>!['width','height'].includes(k))||!TAG_COMIC_SIZE_PRESETS.some(s=>s.width===v.width&&s.height===v.height))throw Error('分镜尺寸不在软件预设中');patch.imageSize={width:v.width as number,height:v.height as number};}}
  else if(key==='paramsOverride'){const v=object(value);if(typeof v.enabled!=='boolean'||Object.keys(v).some(k=>!['enabled','params'].includes(k)))throw Error('分镜参数覆盖无效');patch.paramsOverride={enabled:v.enabled,params:params(v.params)};}
  else throw Error('未开放的分镜字段：'+key);
 }return patch;
}
export function portableComicProject(project:TagComicProject){
 const clean=normalizeTagComicProject(project,project.globalParams,{trustOutputs:false});
 clean.globalParams={...safeParams(clean.globalParams),positivePrompt:''} as GenerateParams;
 clean.panels=clean.panels.map(p=>({...p,paramsOverride:{...p.paramsOverride,params:safeParams(p.paramsOverride.params)}}));
 return clean;
}
function referencePatch(raw:unknown,project:TagComicProject,panel=false){
 const patch:Record<string,unknown>={};for(const [key,value] of Object.entries(object(raw))){
  if(key==='type'){if(!['character','style','character&style'].includes(String(value)))throw Error('参考类型无效');}
  else if(['strength','fidelity','informationExtracted'].includes(key)){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)throw Error('参考强度须为0–1');}
  else if(panel&&key==='enabled'){if(typeof value!=='boolean')throw Error('enabled 须为布尔值');}
  else if(!panel&&key==='scope'){if(!['all','include','exclude'].includes(String(value)))throw Error('参考范围无效');}
  else if(!panel&&key==='scopePanelIds'){if(!Array.isArray(value)||new Set(value).size!==value.length||value.some(id=>!project.panels.some(p=>p.id===id)))throw Error('参考范围须使用当前工程的有效分镜ID');}
  else throw Error('未开放的参考字段：'+key);
  patch[key]=value;
 }return patch;
}
export function createComicProjectActions(store:ComicProjectStore,currentParams:()=>GenerateParams){
 function read(args:Record<string,unknown>={}){
  const state=store.read(),p=state.project,{panels,...project}=p,offset=Number(args.offset??0),limit=Number(args.limit??20);
  return {revision:state.revision,busy:state.busy,persistenceError:state.error,project:projectStudioData(project),panels:projectStudioData(panels.slice(offset,offset+limit)),total:panels.length,offset,nextOffset:offset+limit<panels.length?offset+limit:null};
 }
 function execute(args:Record<string,unknown>){
  const spec=validateComicAction(args);if(spec.action==='comic.project.export')return {json:JSON.stringify(portableComicProject(store.read().project),null,2),revision:store.read().revision};if(spec.effect==='read')return read(args);
  const before=store.read();if(before.busy)throw Error('漫画任务进行中，请先停止并等待读回');if(args.expectedRevision!==before.revision)throw Error('漫画工程已变化，请重新读取');
  const global=spec.action==='comic.project.update'?projectPatch(args.patch):null,panel=spec.action==='comic.panels.update'?panelPatch(args.patch):null;
  let imported:TagComicProject|undefined;
  if(spec.action==='comic.project.import'){
   imported=portableComicProject(normalizeTagComicProject(args.project,currentParams(),{trustOutputs:false}));
   imported.id=crypto.randomUUID();imported.panels=imported.panels.map(p=>({...p,id:crypto.randomUUID()}));
  }
  store.update(p=>{
   if(spec.action==='comic.project.new')return createTagComicProject(currentParams());
   if(spec.action==='comic.references.update'||spec.action==='comic.references.remove'){
    const at=p.preciseReferences.findIndex(r=>r.id===args.id);if(at<0)throw Error('漫画参考ID不存在');
    if(spec.action==='comic.references.remove'){p.preciseReferences.splice(at,1);p.panels=p.panels.map(x=>({...x,preciseReferences:x.preciseReferences.filter(r=>r.referenceId!==args.id)}));}
    else p.preciseReferences[at]={...p.preciseReferences[at],...referencePatch(args.patch,p)};
    return p;
   }
   if(spec.action==='comic.references.panel'||spec.action==='comic.references.panel.reset'){
    const panel=p.panels.find(x=>x.id===args.id),asset=p.preciseReferences.find(r=>r.id===args.referenceId);
    if(!panel||!asset)throw Error('分镜或漫画参考ID不存在');
    const previous=panel.preciseReferences.find(r=>r.referenceId===asset.id);
    panel.preciseReferences=panel.preciseReferences.filter(r=>r.referenceId!==asset.id);
    if(spec.action==='comic.references.panel')panel.preciseReferences.push({...{referenceId:asset.id,enabled:true,type:asset.type,strength:asset.strength,fidelity:asset.fidelity,informationExtracted:asset.informationExtracted},...previous,...referencePatch(args.patch,p,true)} as TagComicPanelReference);
    return p;
   }

   if(imported)return imported;
   if(global)return {...p,...global,globalParams:{...p.globalParams,...global.globalParams,positivePrompt:''}};
   if(spec.action==='comic.panels.append'||spec.action==='comic.panels.replace'){
    const items=parseTagComicImport(String(args.text));if(!items.length)throw Error('未读取到分镜提示词');
    const existing=spec.action==='comic.panels.replace'?[]:p.panels;
    p.panels=[...existing,...items.map((x,i)=>createTagComicPanel(x.prompt,existing.length+i+1,x.title))];
    if(spec.action==='comic.panels.replace')p.preciseReferences=p.preciseReferences.map(ref=>({...ref,scope:'all',scopePanelIds:[]}));
   }else if(spec.action==='comic.panels.reorder'){
    const order=args.order as string[];if(order.length!==p.panels.length||new Set(order).size!==p.panels.length||order.some(id=>!p.panels.some(x=>x.id===id)))throw Error('重排须包含全部分镜ID且每项一次');
    p.panels=order.map(id=>p.panels.find(x=>x.id===id)!);
   }else if(spec.action==='comic.panels.sizes'){
    const sizes=parseTagComicSizeImport(String(args.text),p.panels.length);p.panels=p.panels.map((x,i)=>({...x,imageSize:sizes[i]}));p.sizeMode='perPanel';
   }else{
    const index=p.panels.findIndex(x=>x.id===args.id);if(index<0)throw Error('分镜ID不存在');const selected=p.panels[index];
    if(panel)p.panels[index]={...selected,...panel};
    else if(spec.action==='comic.candidates.select'){
     if(!selected.candidates.some(x=>x.id===args.candidateId))throw Error('该分镜没有此候选图');selected.selectedCandidateId=String(args.candidateId);
    }else if(spec.action==='comic.panels.remove'){
     p.panels.splice(index,1);p.preciseReferences=p.preciseReferences.map(x=>({...x,scopePanelIds:x.scopePanelIds.filter(id=>id!==args.id)}));
    }else throw Error('未接通该漫画修改');
   }
   p.panels=p.panels.map((x,i)=>({...x,index:i+1}));return p;
  },{expectedRevision:String(args.expectedRevision),backup:spec.effect==='confirm'});
  return {...read(args),executed:true,filesRetained:true};
 }
 function internal(args:Record<string,unknown>){
  const state=store.read();if(state.busy)throw Error('漫画任务进行中，请先停止');
  if(args.expectedRevision!==state.revision)throw Error('漫画工程已变化，请重新读取');
  if(args.action==='_comic.snapshot')return {revision:state.revision,project:structuredClone(state.project)};
  if(args.action==='_comic.attach-reference'){
   const asset=object(args.asset) as unknown as TagComicReferenceAsset;
   if(!asset.id||!asset.filePath||!asset.fileUrl||state.project.preciseReferences.some(r=>r.id===asset.id))throw Error('导入参考资料无效或重复');
   if(state.project.preciseReferences.length>=5)throw Error('漫画工程最多5张参考图');
   store.update(p=>({...p,preciseReferences:[...p.preciseReferences,structuredClone(asset)]}),{expectedRevision:String(args.expectedRevision)});
   return {...read(),executed:true,referenceId:asset.id};
  }
  throw Error('未知内部漫画资料动作');
 }
 return {read,execute,internal};
}
