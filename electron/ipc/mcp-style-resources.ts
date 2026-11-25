import {PRECISE_REFERENCE_TYPES} from '../../src/types';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type {BrowserWindow} from 'electron';
import type {StylePromptPreset} from '../../src/types';
import type {WorkbenchCommand} from '../../src/mcp-workbench-references';
import {getSettings,setSetting} from './store';
import {styleCoverIndex} from '../../src/style-library';
import {deleteStylePromptPresetImage,copyStylePromptPreviewImages,reconcileStylePromptPreviewImages,stylePromptPreviewDirectory} from './style-preset-images';
import {looksLikeLocalPath,MAX_MCP_IMAGE_PIXELS} from './mcp-attachments';

type J=Record<string,unknown>;
const word={type:'string',minLength:1,maxLength:160},image={...word,maxLength:512},unit={type:'number',minimum:0,maximum:1};
const shape=(properties:J,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
const list=(items:J,maxItems:number)=>({type:'array',items,minItems:1,maxItems});
const revision={type:'string',minLength:64,maxLength:64,description:'Omit for preview; repeat identical inputs with the returned revision to commit.'};
const kind={type:'string',enum:['vibe','precise']};
const handle=(p:string,i:string)=>'style-preview:'+encodeURIComponent(p)+':'+encodeURIComponent(i);
function groups(){const s=getSettings();return [...new Set(['Default',...(s.stylePromptPresetGroups??[]),...(s.stylePromptPresets??[]).map(p=>p.group||'Default')])];}
const presets=()=>getSettings().stylePromptPresets??[];
function preset(id:string){const p=presets().find(p=>p.id===id);if(!p)throw Error('未知画风预设：'+id);return p;}
function refresh(window:()=>BrowserWindow|null|undefined){const w=window();if(w&&!w.isDestroyed())w.webContents.send('mcp:style-catalog-changed');}
function revisionOf(...data:unknown[]){return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');}
function reviewing(expected:unknown,rev:string){if(expected===undefined)return true;if(expected!==rev)throw Error('预览已失效，请重新预览。');return false;}

async function requestWorkbench(window:()=>BrowserWindow|null|undefined,command:Omit<WorkbenchCommand,'expires'>){
  const w=window();if(!w||w.isDestroyed()||w.webContents.isDestroyed())throw Error('工作台窗口未打开。');
  const {MessageChannelMain}=await import('electron'),{port1,port2}=new MessageChannelMain(),expires=Date.now()+12000;
  return new Promise<unknown>((resolve,reject)=>{
    const finish=()=>{clearTimeout(timer);port1.close();};
    const timer=setTimeout(()=>{finish();reject(Error('未收到工作台确认，请先读取挂载列表，不要自动重试。'));},12000);
    port1.once('message',({data})=>{finish();if(data?.ok)resolve(data.result);else reject(Error(data?.error||'工作台拒绝操作'));});
    port1.start();try{w.webContents.postMessage('mcp:workbench-reference',{...command,expires},[port2]);}catch(e){finish();reject(e);}
  });
}
export function styleResourceTools(window:()=>BrowserWindow|null|undefined,resolveImage:(id:string,label:string)=>Promise<{filePath:string}>){
  type Item={presetId:string;image:string;role:'cover'|'example'};
  async function source(id:string){
    if(looksLikeLocalPath(id))throw Error('请先使用 import_image，再传入图片句柄。');
    let file:string;
    if(id.startsWith('style-preview:')){
      const parts=id.split(':');if(parts.length!==3)throw Error('无效的示例图句柄。');
      const p=preset(decodeURIComponent(parts[1])),imageId=decodeURIComponent(parts[2]);
      const entry=p.previewImages?.find(i=>i.id===imageId);if(!entry)throw Error('该预设没有这张图片。');
      const dir=stylePromptPreviewDirectory(p.id);
      if(path.dirname(path.resolve(entry.filePath))!==path.resolve(dir)||path.parse(entry.filePath).name!==imageId)throw Error('无效的预设图片路径。');
      file=entry.filePath;
    }else file=(await resolveImage(id,'image')).filePath;
    const stat=fs.lstatSync(file);if(!stat.isFile()||stat.size>24*1024*1024||!['.png','.jpg','.jpeg','.webp'].includes(path.extname(file).toLowerCase()))throw Error('仅支持 24 MiB 以内的 PNG/JPEG/WebP。');
    const bytes=fs.readFileSync(file),info=await sharp(bytes,{limitInputPixels:MAX_MCP_IMAGE_PIXELS}).metadata();
    if(!info.format||!['png','jpeg','webp'].includes(info.format)||!info.width||!info.height||info.width*info.height>MAX_MCP_IMAGE_PIXELS)throw Error('无法读取图片。');
    return {file,bytes,mime:'image/'+info.format,width:info.width,height:info.height};
  }
  const tool=(name:string,description:string,inputSchema:J,readOnlyHint:boolean,run:(a:J)=>Promise<unknown>)=>({name,title:name,description,inputSchema,annotations:{readOnlyHint,openWorldHint:false},run});
  return [
    tool('apply_prompt_library_entry','Preview then apply one saved text entry to the current generation workbench. Only affects the designated text field, never mounts images or generates.',shape({kind:{type:'string',enum:['positive','negative','style','chunk']},id:word,mode:{type:'string',enum:['append','replace']},revision},['kind','id','mode']),false,async a=>{
      const read=()=>{const s=getSettings();const rows=a.kind==='chunk'?s.promptChunks:a.kind==='positive'?s.positivePromptPresets:a.kind==='negative'?s.negativePromptPresets:s.stylePromptPresets;const r=rows.find(x=>x.id===a.id);if(!r)throw Error('预设不存在');if('captions' in r&&Array.isArray(r.captions)&&r.captions.length)throw Error('这是角色组合，请使用 prepare_character_group。');return 'content' in r?r.content:r.prompt;};
      const slot=a.kind==='style'?'stylePrompt':a.kind==='negative'?'negativePrompt':'positivePrompt',current=await requestWorkbench(window,{op:'prompt',slot}) as {text:string},text=read();
      const next=a.mode==='replace'||!current.text.trim()?text:current.text+(current.text.trimEnd().endsWith(',')?' ':', ')+text;
      const rev=revisionOf('applyPrompt',a.id,a.kind,a.mode,current.text,next);if(reviewing(a.revision,rev))return {preview:true,revision:rev,slot,before:current.text,after:next};
      return requestWorkbench(window,{op:'prompt',slot,expected:current.text,value:next});
    }),
    tool('list_style_assets','Browse style groups, preset IDs, cover and example handles. Does not mount anything.',shape({group:word,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}}),true,async a=>{
      const rows=presets().filter(p=>!a.group||(p.group||'Default')===a.group),i=Number(a.offset??0);
      return {groups:groups(),total:rows.length,items:rows.slice(i,i+Number(a.limit??50)).map(p=>({id:p.id,name:p.name,group:p.group||'Default',images:(p.previewImages??[]).map((x,idx)=>({image:handle(p.id,x.id),name:x.name,cover:idx===styleCoverIndex(p)}))}))};
    }),
    tool('create_style_group','Create or reuse a style preset group, not a history group.',shape({name:word},['name']),false,async a=>{
      const name=String(a.name).trim();if(!name||name.length>80||name.toLowerCase()==='all')throw Error('无效分组名。');
      const existing=groups().find(x=>x.toLowerCase()===name.toLowerCase());if(existing)return {group:existing,created:false};
      setSetting('stylePromptPresetGroups',[...groups(),name]);refresh(window);return {group:name,created:true};
    }),
    tool('move_style_presets','Preview a batch move of style presets. Commit with returned revision; does not move history files.',shape({presetIds:list(word,100),group:word,revision},['presetIds','group']),false,async a=>{
      const ids=a.presetIds as string[],group=String(a.group);if(!groups().includes(group)||new Set(ids).size!==ids.length)throw Error('分组不存在或预设重复。');
      const items=ids.map(id=>({id,from:preset(id).group||'Default',to:group})),rev=revisionOf('move',items);
      if(reviewing(a.revision,rev))return {preview:true,revision:rev,items};
      setSetting('stylePromptPresets',presets().map(p=>ids.includes(p.id)?{...p,group}:p));refresh(window);return {applied:true,items};
    }),
    tool('attach_style_images','Batch attach visual-only cover/example images by preset. One cover per preset, nine images total per preset. Preview then commit; never affects generation.',shape({items:list(shape({presetId:word,image,role:{type:'string',enum:['cover','example']}},['presetId','image','role']),32),revision},['items']),false,async a=>{
      const items=a.items as Item[],files=new Map<string,{file:string;hash:string;size:number;bytes:Buffer}>();
      const unique=new Set(items.map(i=>JSON.stringify([i.presetId,i.image])));if(unique.size!==items.length)throw Error('同一预设重复挂图。');
      let volume=0;
      for(const i of items){preset(i.presetId);if(!files.has(i.image)){const {file,bytes}=await source(i.image);files.set(i.image,{file,hash:crypto.createHash('sha256').update(bytes).digest('hex'),size:bytes.length,bytes});}volume+=files.get(i.image)!.size;if(volume>96*1024*1024)throw Error('每批最多 96 MiB。');}
      // All async reads finish before comparing against current metadata or committing any writes.
      const by=new Map<string,Item[]>();for(const i of items)by.set(i.presetId,[...(by.get(i.presetId)??[]),i]);
      const old=new Map<string,NonNullable<StylePromptPreset['previewImages']>>();
      for(const [id,rows] of by){const p=preset(id);if(!/^[\w-]{1,96}$/.test(id))throw Error('预设 ID 不适用于图片目录。');
        const existing=reconcileStylePromptPreviewImages(id,p.previewImages??[],undefined,false);old.set(id,existing);
        if(existing.length+rows.length>9||rows.filter(i=>i.role==='cover').length>1)throw Error(p.name+'：每个预设最多 9 张，每批只能指定一个封面。');}
      const rev=revisionOf('attach',items,[...files].map(([id,v])=>[id,v.hash]),[...old].map(([id,x])=>[id,preset(id).coverImageId,x.map(i=>i.id)]));
      if(reviewing(a.revision,rev))return {preview:true,revision:rev,items,affectsGeneration:false};
      const outcomes=[];for(const [id,rows] of by){
        const p=preset(id),existing=old.get(id)!;
        let added:typeof existing=[];
        try{
          added=copyStylePromptPreviewImages(rows.map(i=>files.get(i.image)!.file),id,rows.length,undefined,new Map([...files.values()].map(f=>[f.file,f.bytes])));
          if(added.length!==rows.length)throw Error('实际新增数不符，请回读预设。');
          const coverAt=rows.findIndex(i=>i.role==='cover');
          const next={...p,previewImages:[...existing,...added],...(coverAt>=0?{coverImageId:added[coverAt].id}:{})};
          setSetting('stylePromptPresets',presets().map(x=>x.id===id?next:x));
          outcomes.push(...rows.map((row,n)=>({...row,ok:true,handle:handle(id,added[n].id)})));
        }catch(e){
          const cleanupErrors:string[]=[];for(const x of added){try{deleteStylePromptPresetImage(id,x.id);}catch(err){cleanupErrors.push(String(err));}}
          outcomes.push(...rows.map(row=>({...row,ok:false,error:String(e),...(cleanupErrors.length?{cleanupErrors}: {})})));
        }
      }refresh(window);return {applied:outcomes.every(x=>x.ok),items:outcomes,affectsGeneration:false};
    }),
    tool('set_style_cover','Set an existing example image as this preset’s display cover, without copying or mounting it.',shape({presetId:word,image},['presetId','image']),false,async a=>{
      const p=preset(String(a.presetId)),target=p.previewImages?.find(x=>handle(p.id,x.id)===a.image);
      if(!target)throw Error('封面必须是该预设已有的示例图。');
      setSetting('stylePromptPresets',presets().map(x=>x.id===p.id?{...x,coverImageId:target.id}:x));refresh(window);
      return {presetId:p.id,cover:a.image,affectsGeneration:false};
    }),
    tool('save_reference_preset','Save a handled image in the reference library without mounting it. Explicit kind required.',shape({name:word,group:word,image,kind,strength:{...unit,maximum:5},information:unit,fidelity:unit,type:{type:'string',enum:[...PRECISE_REFERENCE_TYPES]}},['name','image','kind']),false,async a=>{
      if(a.kind==='vibe' && Number(a.strength)>1)throw Error('Vibe strength exceeds 1');
      if(!String(a.name).trim()||String(a.name).length>120||String(a.group??'').length>120||a.kind==='vibe'&&(a.fidelity!==undefined||a.type!==undefined)||a.kind==='precise'&&a.information!==undefined)throw Error('无效名称或用途参数。');
      const im=await source(String(a.image)),{saveReferencePreset}=await import('./reference-presets.js');
      const r=await saveReferencePreset({name:String(a.name),group:a.group as string|undefined,kind:a.kind as 'precise'|'vibe',base64:im.bytes.toString('base64'),extension:im.mime.split('/')[1],width:im.width,height:im.height,strength:a.strength as number|undefined,infoExtracted:a.information as number|undefined,fidelity:a.fidelity as number|undefined,preciseType:a.type as 'style'|undefined});
      if(!r.ok||!r.preset)throw Error(r.message??'保存失败');refresh(window);return {id:r.preset.id,image:'reference-preset:'+r.preset.id,group:r.preset.group,mounted:false};
    }),
    tool('organize_reference_presets','Batch rename or move reference library entries. Existing images and workbench remain unchanged. Preview, then repeat with revision.',shape({items:list(shape({id:word,name:word,group:{type:'string',maxLength:120}},['id']),64),revision},['items']),false,async a=>{
      const api=await import('./reference-presets.js');const r=await api.organizeReferencePresets(a.items as {id:string;name?:string;group?:string}[],a.revision as string|undefined);if(r.applied)refresh(window);return r;
    }),
    tool('mount_workbench_references','Explicitly mount up to eight image handles as one kind. Validates every image and the combined size before contacting the workbench.',shape({kind,images:list(image,8),strength:{...unit,maximum:5},information:unit,fidelity:unit,type:{type:'string',enum:[...PRECISE_REFERENCE_TYPES]}},['kind','images']),false,async a=>{
      const ids=a.images as string[];if(new Set(ids).size!==ids.length||a.kind==='vibe'&&(a.type!==undefined||a.fidelity!==undefined)||a.kind==='precise'&&a.information!==undefined)throw Error('重复图片或参数与用途不符。');
      const images=[];let bytes=0;for(const id of ids){const im=await source(id);bytes+=im.bytes.length;if(bytes>24*1024*1024)throw Error('单批最多 24 MiB');images.push({base64:im.bytes.toString('base64'),mime:im.mime,width:im.width,height:im.height});}
      return requestWorkbench(window,{op:'mountMany',images,kind:a.kind as 'vibe'|'precise',strength:a.strength as number|undefined,information:a.information as number|undefined,fidelity:a.fidelity as number|undefined,type:a.type as WorkbenchCommand['type']});
    }),
    tool('update_workbench_references','Edit strengths and kind-specific options for up to 16 existing live references. Validates the whole selection first.',shape({kind,items:list(shape({id:word,type:{type:'string',enum:[...PRECISE_REFERENCE_TYPES]},strength:{...unit,maximum:5},fidelity:unit,information:unit},['id']),16)},['kind','items']),false,async a=>requestWorkbench(window,{op:'updateMany',kind:a.kind as 'vibe'|'precise',updates:a.items as WorkbenchCommand['updates']})),
    tool('unmount_workbench_references','Explicitly unmount a batch by kind and live IDs. Does not delete original images.',shape({kind,ids:list(word,16)},['kind','ids']),false,async a=>requestWorkbench(window,{op:'unmountMany',kind:a.kind as 'vibe'|'precise',updates:(a.ids as string[]).map(id=>({id}))})),
    tool('list_workbench_references','Read actual live workbench reference IDs, kinds and settings, without image bytes.',shape({}),true,async()=>requestWorkbench(window,{op:'list'})),
    tool('mount_workbench_reference','Explicitly attach one image to the live workbench. Never generate, replace a base image, switch models or change presets.',shape({image,kind,type:{type:'string',enum:[...PRECISE_REFERENCE_TYPES]},strength:{...unit,maximum:5},information:unit,fidelity:unit},['image','kind']),false,async a=>{
      if(a.kind==='vibe'&&(a.type!==undefined||a.fidelity!==undefined)||a.kind==='precise'&&a.information!==undefined)throw Error('参考参数与用途不符。');
      const im=await source(String(a.image));return requestWorkbench(window,{op:'mount',kind:a.kind as WorkbenchCommand['kind'],type:a.type as WorkbenchCommand['type'],strength:a.strength as number|undefined,information:a.information as number|undefined,fidelity:a.fidelity as number|undefined,base64:im.bytes.toString('base64'),mime:im.mime,width:im.width,height:im.height});
    }),
    tool('unmount_workbench_reference','Remove one existing workbench reference by kind and ID. Does not delete its source image.',shape({kind,id:word},['kind','id']),false,async a=>requestWorkbench(window,{op:'unmount',kind:a.kind as WorkbenchCommand['kind'],id:String(a.id)})),
  ];
}
