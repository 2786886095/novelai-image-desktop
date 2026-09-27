import {jevStatus,saveJevConfig} from './jev-config.js';
import {createPanelLayoutStore} from './panel-layout-store.js';
let layouts;
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
// Resolve protocol peers from the active verified Harness, even when this UI
// lives in app-owned storage rather than the user's editable node_modules.
const peerRequire=createRequire(process.env.STUDIO_DSH_TOOLS||import.meta.url);
const {Remote,TypertRemoteService}=await import(pathToFileURL(peerRequire.resolve('@deepseek-ai/dsh-typert-protocol')).href);
import {descriptor,packageName,allowedTools} from './protocol.js';
const initializers=[];
export class StudioLibrary extends TypertRemoteService {
 static inject=['typert','workspaceRegistry'];
 constructor(ctx){super(ctx,'studioLibrary');this.registry=ctx.workspaceRegistry;this.materialContext=ctx;for(const init of initializers)init.call(this);ctx.typert.register({package:packageName,face:'host',schemas:[],invocations:[descriptor]});}
 async call(tool,payload,callId,signal){
  if(!allowedTools.has(tool)&&!['studio_jev_status','studio_jev_configure'].includes(tool))throw new Error('Unknown Studio library operation');
  if(!/^[a-zA-Z0-9-]{8,100}$/.test(callId))throw new Error('Invalid call identity');
  if(payload.length>100000)throw new Error('Studio request too large');
  const args=JSON.parse(payload);if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Invalid arguments');
  if(tool==='studio_session_material'){
    if(typeof args.sessionId!=='string'||!/^[a-zA-Z0-9_.:-]{1,160}$/.test(args.sessionId))throw Error('请先选择酒馆会话');
    if(!process.env.DSH_HOME)throw Error('缺少酒馆资料目录');
    const resolver=this.materialContext.typert.lookups.get('agent');
    if(!resolver)throw Error('酒馆会话服务尚未准备好');
    const agent=await resolver.resolve(args.sessionId);
    const {createHostMaterials}=await import(pathToFileURL(createRequire(process.env.DSH_HOME+'/profiles/package.json').resolve('@langbai/dsh-studio-data/material-host')).href);
    const {sessionId,...input}=args;
    const data=await (await createHostMaterials(this.materialContext)).execute(input,{agent,callId,signal,fromUi:true});
    return JSON.stringify({ok:true,data});
  }
  if(tool==='studio_panel_layout'||tool==='studio_save_panel_layout'){
    if(!process.env.DSH_HOME)throw Error('缺少 DSH_HOME');
    layouts??=createPanelLayoutStore(process.env.DSH_HOME);
    return JSON.stringify({ok:true,data:await (tool==='studio_panel_layout'?layouts.get(args):layouts.set(args))});
  }
  if(tool==='studio_workspaces'||tool==='studio_cleanup_empty_workspaces'){
    const registry=this.registry;
    if(tool==='studio_cleanup_empty_workspaces')for(const item of registry.list()){
      if(item.title==='NovelAI Studio'&&item.sessionIds.length===0&&item.path!==process.env.STUDIO_WORKSPACE)await registry.delete(item.id);
    }
    return JSON.stringify({ok:true,data:registry.list().map(w=>({id:w.id,title:w.title,path:w.path,sessions:w.sessionIds.length}))});
  }
  if(tool==='studio_jev_status'||tool==='studio_jev_configure')return JSON.stringify({ok:true,data:tool==='studio_jev_status'?await jevStatus():await saveJevConfig(args)});
  const endpoint=process.env.STUDIO_BRIDGE_URL,token=process.env.STUDIO_BRIDGE_TOKEN;
  if(!endpoint||!token)throw new Error('请从 NovelAI Studio 软件启动酒馆 Agent');
  const scoped=['studio_api_input','studio_resolve_api_input','langbai_save_style_preset','studio_image_approval','studio_resolve_image_approval','studio_session_state','studio_set_session_style','studio_generation_policy','studio_stop_generation'].includes(tool);
  if(scoped&&(typeof args.sessionId!=='string'||!/^[a-zA-Z0-9_.:-]{1,160}$/.test(args.sessionId)))throw Error('请先创建并选择酒馆会话');
  const sessionId=scoped?args.sessionId:'studio-library-ui';
  const response=await fetch(endpoint+'/v1/tool',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({tool,args,callId,sessionId}),signal:signal??AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error(`Studio bridge HTTP ${response.status}`);
  return JSON.stringify(await response.json());
 }
}
Remote('call')(StudioLibrary.prototype.call,{kind:'method',name:'call',static:false,private:false,addInitializer(fn){initializers.push(fn);}});
export default StudioLibrary;
