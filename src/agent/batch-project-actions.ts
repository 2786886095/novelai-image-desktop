import type {BatchProjectStore} from '../batch/project-store';
import {validateBatchAction} from './batch-project-contract';
import {validateStudioPatch,projectStudioData} from '../studio-agent-contract';
import {selectBatchRedrawCandidate,batchRedrawCandidates} from '../batch-redraw-queue';
function text(value:unknown,max=30000){if(typeof value!=='string'||value.length>max)throw Error('文字字段无效或过长');return value;}
function params(value:unknown){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('params须为对象');validateStudioPatch({target:'params',patch:value});return value;}
function fraction(value:unknown){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)throw Error('强度须为0–1');return value;}
export function createBatchProjectActions(store:BatchProjectStore){return {
 snapshot(expectedRevision:unknown){const s=store.read();if(s.busy||s.revision!==expectedRevision)throw Error('批量工程已变化或正在运行');return {project:structuredClone(s.project),revision:s.revision};},
 execute(args:Record<string,unknown>){const spec=validateBatchAction(args),before=store.read();
 if(spec.action==='batch.project.read'){const {items,...project}=before.project,offset=Number(args.offset??0),limit=Number(args.limit??20);return {revision:before.revision,busy:before.busy,project:projectStudioData(project),items:projectStudioData(items.slice(offset,offset+limit)),total:items.length,nextOffset:offset+limit<items.length?offset+limit:null};}
 store.update(p=>{if(spec.action==='batch.project.update'){
  for(const [key,value] of Object.entries(args.patch as Record<string,unknown>)){
   if(['globalStyle','globalNegative','sizeBulk'].includes(key))(p as unknown as Record<string,unknown>)[key]=text(value);
   else if(key==='groupName')p.groupName=text(value,200);else if(key==='globalStrength')p.globalStrength=fraction(value);
   else if(key==='candidateCount'){if(!Number.isInteger(value)||(value as number)<1||(value as number)>8)throw Error('每图候选数须为1–8');p.candidateCount=value as number;}
   else if(key==='globalParams')p.globalParams={...p.globalParams,...params(value)};
   else if(key==='sizeMode'){if(!['custom','adaptive','perImage'].includes(String(value)))throw Error('尺寸模式无效');p.sizeMode=value as typeof p.sizeMode;}
   else throw Error('未开放的批量全局字段：'+key);
  }
 }else{const at=p.items.findIndex(i=>i.id===args.id);if(at<0)throw Error('图片ID不存在');let item=p.items[at];
  if(spec.action==='batch.candidates.select'){if(!batchRedrawCandidates(item).some(c=>c.id===args.candidateId))throw Error('候选ID不存在');item=selectBatchRedrawCandidate(item,String(args.candidateId));}
  else if(spec.action==='batch.items.update'){for(const [key,value] of Object.entries(args.patch as Record<string,unknown>)){
   if(key==='prompt')item.prompt=text(value);else if(key==='name')item.name=text(value,200);else if(key==='strength')item.strength=value===null?null:fraction(value);
   else if(key==='overrideParams'){if(typeof value!=='boolean')throw Error('overrideParams须为布尔值');item.overrideParams=value;}
   else if(key==='params')item.params={...item.params,...params(value)};else throw Error('未开放的批量图片字段：'+key);
  }}else throw Error('此动作不是批量工程修改');p.items[at]=item;
 }return p;},String(args.expectedRevision));return {revision:store.read().revision,saved:true};
 }};}
