import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import type {StylePromptPreset} from '../../src/types';
import type {AgentToolBridgeRequest,AgentToolBridgeResponse} from '../../src/agent/types';

export const SESSION_CONTROL_TOOLS=['studio_session_state','studio_set_session_style','studio_generation_policy','studio_style_preview','studio_stop_generation'] as const;
export const scopedImageTools=new Set(['langbai_generate_image','langbai_redraw_image','langbai_inpaint_image']);
type Selection={id:string;name:string;prompt:string};
type State={style:Selection|null;mode:'confirm'|'auto';remaining:number;limit:number};
const empty=():State=>({style:null,mode:'auto',remaining:0,limit:0});
export function createSessionControls(directory:string,presets:()=>StylePromptPreset[],stop:()=>void=()=>{},imagesFor:(preset:StylePromptPreset)=>NonNullable<StylePromptPreset['previewImages']>=p=>p.previewImages??[]) {
  let tail:Promise<unknown>=Promise.resolve();
  let activeSession:string|null=null;
  let controller:AbortController|null=null;
  const valid=(id:string)=>{if(!/^[a-zA-Z0-9_.:-]{1,160}$/.test(id)||id==='studio-library-ui')throw Error('请先选择一个已创建的酒馆会话');return id;};
  const file=(id:string)=>path.join(directory,createHash('sha256').update(valid(id)).digest('hex')+'.json');
  async function read(id:string):Promise<State>{
    try {const value=JSON.parse(await fs.readFile(file(id),'utf8'));
      const style=value?.style;
      if(style!==null&&style!==undefined&&!(typeof style.id==='string'&&typeof style.name==='string'&&typeof style.prompt==='string'))throw Error('会话风格数据无效');
      const mode=value.mode==='confirm'?'confirm':'auto';
      const limit=Number.isSafeInteger(value.limit)&&value.limit>=0&&value.limit<=100?value.limit:0;
      const remaining=Number.isSafeInteger(value.remaining)&&value.remaining>=0?Math.min(value.remaining,limit):limit;
      return {style:style??null,mode,limit,remaining};}
    catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return empty();throw e;}
  }
  async function write(id:string,state:State){await fs.mkdir(directory,{recursive:true});const dest=file(id),tmp=dest+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(state));await fs.rename(tmp,dest);return state;}
  const serial=<T>(fn:()=>Promise<T>):Promise<T>=>{const task=tail.then(fn);tail=task.catch(()=>{});return task;};
  async function preview(args:Record<string,unknown>){
    const preset=presets().find(p=>p.id===args.presetId);if(!preset)throw Error('风格不存在，请刷新列表');
    const images=imagesFor(preset);
    const selected=typeof args.imageId==='string'?images.find(p=>p.id===args.imageId):images.find(p=>p.id===preset.coverImageId)??images[0];
    if(!selected)return {dataUrl:null,images:[]};
    // Only registered images, never a caller-supplied URL/path. Re-encode to
    // discard image metadata and keep each RPC response bounded.
    const stat=await fs.stat(selected.filePath);if(!stat.isFile()||stat.size>32*1024*1024)throw Error('预览图文件过大或已失效');
    const bytes=await sharp(selected.filePath,{limitInputPixels:40_000_000}).rotate().resize(args.large===true?1280:320,args.large===true?1280:320,{fit:'inside',withoutEnlargement:true}).jpeg({quality:args.large===true?78:65}).toBuffer();
    if(bytes.length>900_000)throw Error('预览图超出传输限制');
    return {dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64'),imageId:selected.id,images:images.map(p=>({id:p.id,name:p.name}))};
  }
  return {
    handles:(tool:string)=>(SESSION_CONTROL_TOOLS as readonly string[]).includes(tool),read,
    async execute(req:AgentToolBridgeRequest):Promise<AgentToolBridgeResponse>{
      try{
        const data=req.tool==='studio_style_preview'?await preview(req.args):await serial(async()=>{
          const id=valid(req.sessionId??''),state=await read(id);
          if(req.tool==='studio_set_session_style'){
            const preset=req.args.presetId===null?null:presets().find(p=>p.id===req.args.presetId);
            if(preset===undefined)throw Error('风格不存在，请刷新列表');
            state.style=preset?{id:preset.id,name:preset.name,prompt:preset.prompt}:null;
            return write(id,state);
          }
          if(req.tool==='studio_generation_policy'){
            if(req.args.mode==='confirm'){state.mode='confirm';state.remaining=0;}
            else if(req.args.mode==='auto'){
              const n=req.args.limit;if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>100)throw Error('自动生成上限必须为0–100张，0表示不限');
              state.mode='auto';state.limit=n;state.remaining=n;
            }else throw Error('请选择确认生成或全自动');
            return write(id,state);
          }
          if(req.tool==='studio_stop_generation'){state.mode='confirm';state.remaining=0;await write(id,state);if(activeSession===id){controller?.abort();stop();}return state;}
          return state;
        });
        return {ok:true,title:'当前会话生图设置',output:JSON.stringify(data),data};
      }catch(e){return {ok:false,title:'设置未应用',output:e instanceof Error?e.message:String(e)};}
    },
    async authorize(req:AgentToolBridgeRequest):Promise<boolean>{return serial(async()=>{
      const state=await read(req.sessionId??'');if(state.mode!=='auto')return false;
      const count=req.tool==='langbai_generate_image'?(req.args.count??1):1;
      if(typeof count!=='number'||!Number.isSafeInteger(count)||count<1||count>8)throw Error('生成张数必须为1–8');
      if(state.limit===0)return true;
      if(count>state.remaining)throw Error('本次自动生成额度不足；请在侧栏重新授权或改为确认生成');
      state.remaining-=count;await write(req.sessionId??'',state);return true;
    });},
    begin(id:string){if(activeSession!==null)throw Error('另一个会话正在生成，请等待完成');activeSession=valid(id);controller=new AbortController();return controller.signal;},
    end(id:string){if(activeSession===id){activeSession=null;controller=null;}},
  };
}
