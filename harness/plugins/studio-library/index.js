import {jevStatus,saveJevConfig} from './jev-config.js';
import {Remote,TypertRemoteService} from '@deepseek-ai/dsh-typert-protocol';
import {descriptor,packageName,allowedTools} from './protocol.js';
const initializers=[];
export class StudioLibrary extends TypertRemoteService {
 static inject=['typert'];
 constructor(ctx){super(ctx,'studioLibrary');for(const init of initializers)init.call(this);ctx.typert.register({package:packageName,face:'host',schemas:[],invocations:[descriptor]});}
 async call(tool,payload,callId,signal){
  if(!allowedTools.has(tool)&&!['studio_jev_status','studio_jev_configure'].includes(tool))throw new Error('Unknown Studio library operation');
  if(!/^[a-zA-Z0-9-]{8,100}$/.test(callId))throw new Error('Invalid call identity');
  if(payload.length>100000)throw new Error('Studio request too large');
  const args=JSON.parse(payload);if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Invalid arguments');
  if(tool==='studio_jev_status'||tool==='studio_jev_configure')return JSON.stringify({ok:true,data:tool==='studio_jev_status'?await jevStatus():await saveJevConfig(args)});
  const endpoint=process.env.STUDIO_BRIDGE_URL,token=process.env.STUDIO_BRIDGE_TOKEN;
  if(!endpoint||!token)throw new Error('请从 NovelAI Studio 软件启动酒馆 Agent');
  const response=await fetch(endpoint+'/v1/tool',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({tool,args,callId,sessionId:'studio-library-ui'}),signal:signal??AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error(`Studio bridge HTTP ${response.status}`);
  return JSON.stringify(await response.json());
 }
}
Remote('call')(StudioLibrary.prototype.call,{kind:'method',name:'call',static:false,private:false,addInitializer(fn){initializers.push(fn);}});
export default StudioLibrary;
