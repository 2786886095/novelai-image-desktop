import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createMaterialWorkflow} from './session-materials.js';
import {kinds} from './material-converter.js';
const instances=new Map();
export async function createHostMaterials(ctx){
 const home=process.env.DSH_HOME;
 if(!home)throw Error('缺少当前酒馆资料目录');
 const endpoint=process.env.STUDIO_BRIDGE_URL,token=process.env.STUDIO_BRIDGE_TOKEN;
 if(!endpoint||!token)throw Error('请从软件内启动酒馆 Agent');
 const key=home+'\n'+endpoint;
 if(instances.has(key))return instances.get(key);
 const initializing=(async()=>{
        if(!process.env.DSH_HOME)throw Error('缺少当前酒馆资料目录');
        const homeRequire=createRequire(path.join(process.env.DSH_HOME,'profiles/package.json'));
        const {normalizeLoreBook}=await import(pathToFileURL(homeRequire.resolve('dsh-roleplay-rp-lore-book/activation')).href);
        const bridge=async(tool,args,exec)=>{
          const response=await fetch(endpoint+'/v1/tool',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({tool,args,sessionId:exec.agent.session.id,callId:'material-'+randomUUID()}),signal:exec.signal});
          const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error??result.output??'本机资料连接失败');
          return result.data??JSON.parse(result.output);
        };
        return createMaterialWorkflow({directory:path.join(process.env.DSH_HOME,'studio-material-journal'),normalizeLoreBook,
          source:(args,exec)=>bridge('studio_material_source',args,exec),
          confirm:async(args,exec)=>(await bridge('studio_material_confirm',args,exec)).approved===true,
          resolve:(agent,collection)=>{const presets=ctx.get?.('agentPresets')??ctx.agentPresets;const scoped=name=>presets?.serviceFor(agent,name)??ctx.get?.(name);return {sessions:presets?.serviceFor(agent,'rpSessions'),runtime:presets?.serviceFor(agent,'rpRuntime'),asset:scoped(kinds[collection]?.[1])};},
        });

 })();
 instances.set(key,initializing);
 try{return await initializing;}catch(e){instances.delete(key);throw e;}
}
