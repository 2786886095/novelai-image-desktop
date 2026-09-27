import {createHash,randomUUID} from 'node:crypto';
import axios from 'axios';
import {API_PROFILES,apiUrl,validateApiRequest} from '../../src/agent/api-contract';
import type {AgentToolBridgeRequest,AgentToolBridgeResponse} from '../../src/agent/types';
export const API_TOOLS=['langbai_api','studio_api_input','studio_resolve_api_input'] as const;
export interface ApiSnapshot {config:Record<string,unknown>;secret:string;}
export interface ApiAdapter {profiles():string[];read(profile:string):Promise<ApiSnapshot>;write(profile:string,next:ApiSnapshot,before:ApiSnapshot):Promise<void>;test(profile:string,state:ApiSnapshot):Promise<{status:number;models?:string[]}>;}
const revision=(x:ApiSnapshot)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const same=(a:ApiSnapshot,b:ApiSnapshot)=>revision(a)===revision(b);
export function createApiTools(adapter:ApiAdapter,approve:(request:AgentToolBridgeRequest)=>Promise<boolean>,clock=()=>Date.now()){
 const pending=new Map<string,{id:string;profile:string;revision:string;expires:number}>();let tail:Promise<unknown>=Promise.resolve();
 const session=(id:unknown)=>{if(typeof id!=='string'||!/^[a-zA-Z0-9_.:-]{1,160}$/.test(id)||id==='studio-library-ui')throw Error('请先选择酒馆会话');return id;};
 const publicState=(profile:string,state:ApiSnapshot)=>({profile,title:API_PROFILES[profile].title,revision:revision(state),config:Object.fromEntries(Object.entries(state.config).map(([key,value])=>[key,API_PROFILES[profile].fields[key]?.type==='url'?(()=>{try{return apiUrl(value);}catch{return '地址格式需在软件中修正';}})():value])),credentialConfigured:!!state.secret,editableFields:API_PROFILES[profile].fields});
 async function run(request:AgentToolBridgeRequest):Promise<AgentToolBridgeResponse>{
  try{
   const {tool,args}=request;
   if(tool==='studio_api_input'||tool==='studio_resolve_api_input'){
    const sid=session(request.sessionId);let item=pending.get(sid);if(item&&item.expires<clock()){pending.delete(sid);item=undefined;}
    if(tool==='studio_api_input')return answer(item?{id:item.id,title:API_PROFILES[item.profile].title,profile:item.profile,expires:item.expires}:null);
    if(Object.keys(args).some(k=>!['sessionId','id','value','cancel'].includes(k)))throw Error('私密输入参数无效');
    if(!item||item.id!==args.id)throw Error('输入已过期或不属于当前会话');
    if(args.cancel===true){pending.delete(sid);return answer({cancelled:true});}
    if(typeof args.value!=='string'||!args.value.trim()||args.value.length>8192||/[\r\n\x00]/.test(args.value))throw Error('请输入有效密钥');
    const before=await adapter.read(item.profile);if(revision(before)!==item.revision){pending.delete(sid);throw Error('配置已变化，请重新发起私密输入');}
    pending.delete(sid); // Consume before persistence: unknown outcome must not replay a write.
    try{await adapter.write(item.profile,{...before,secret:args.value.trim()},before);}catch{throw Error('密钥保存未完成；请查看配置状态后再操作');}
    const after=await adapter.read(item.profile);if(after.secret!==args.value.trim())throw Error('密钥保存回读不符');
    return answer({saved:true,profile:item.profile,credentialConfigured:true,revision:revision(after)});
   }
   if(tool!=='langbai_api')throw Error('API 工具无效');
   const a=validateApiRequest(args);
   if(a.profile&&!adapter.profiles().includes(a.profile))throw Error('本平台没有这个独立 API 配置');
   if(a.action==='read'){const profiles=await Promise.all((a.profile?[a.profile]:adapter.profiles()).map(async p=>publicState(p,await adapter.read(p))));return answer({profiles,...(a.profile?profiles[0]:{}),instructions:'configure 修改接口/模型；credential 打开会话内私密输入；test 仅检查已保存地址的连接/模型列表，不创建收费对话。不要把密钥写进聊天。'});}
   const before=await adapter.read(a.profile);
   if(a.action==='test'){
    apiUrl(before.config.baseUrl);
    let result;try{result=await adapter.test(a.profile,before);}catch{throw Error('连接检查失败；请检查地址、凭据或网络，服务端原始内容未发送给模型');}
    if(result.status<200||result.status>=300)throw Error(`连接检查返回 HTTP ${result.status}，未跟随重定向或重试收费请求`);
    return answer({connected:true,status:result.status,profile:a.profile,models:(result.models??[]).filter(x=>typeof x==='string'&&x.length<200&&!/[\r\n]/.test(x)&&(!before.secret||!x.includes(before.secret))).slice(0,200),notice:'连接/模型列表可用不代表付费生成已验证；没有发起生成。'});
   }
   if(a.expectedRevision!==revision(before))throw Error('API 配置已变化，请重新读取');
   if(a.action==='credential'){
    const sid=session(request.sessionId);for(const [key,item] of pending)if(item.expires<clock())pending.delete(key);
    if(pending.has(sid))throw Error('当前会话已有私密输入请求');if(pending.size>=20)throw Error('待填写请求过多，请完成或取消已有请求');
    pending.set(sid,{id:randomUUID(),profile:a.profile,revision:revision(before),expires:clock()+300000});
    return answer({awaitingUserInput:true,profile:a.profile,instructions:'在当前 Agent 会话的私密输入框填写密钥；不要在聊天回复密钥。保存后调用 read 查看已配置状态。'});
   }
   const next={config:{...before.config,...(a.patch??{})},secret:a.action==='clearCredential'?'':before.secret};
   if(!await approve({...request,args:{profile:a.profile,名称:API_PROFILES[a.profile].title,action:a.action,修改:a.patch??{},说明:a.action==='clearCredential'?'清除本机代管凭据；后续相关服务需要重新填写。':'修改保存的 API 配置；现有凭据将用于所示新地址。只影响后续请求，不会生成图片。'}}))throw Error('已取消，API 配置未修改');
   if(!same(before,await adapter.read(a.profile)))throw Error('确认期间配置已变化，请重新读取');
   try{await adapter.write(a.profile,next,before);}catch{throw Error('配置保存未完成，请重新读取当前配置');}
   const after=await adapter.read(a.profile);if(!same(after,next))throw Error('保存后回读不符，请重新读取，不要重复执行');
   return answer({saved:true,...publicState(a.profile,after)});
  }catch(error){return {ok:false,title:'API 操作未完成',output:error instanceof Error?error.message:'API 操作失败'};}
 }
 function answer(data:unknown):AgentToolBridgeResponse{return {ok:true,title:'软件 API 配置',output:JSON.stringify(data),data};}
 return {handles:(tool:string)=>(API_TOOLS as readonly string[]).includes(tool),execute:(request:AgentToolBridgeRequest)=>{if(request.tool==='studio_api_input'||request.args.action==='read')return run(request);const task=tail.then(()=>run(request));tail=task.catch(()=>{});return task;},close:()=>pending.clear()};
}
export function desktopApiAdapter():ApiAdapter {
 return {
  profiles:()=>Object.keys(API_PROFILES),
  async read(p){const store=await import('./store.js'),s=store.getSettings() as unknown as Record<string,unknown>,spec=API_PROFILES[p];return {config:Object.fromEntries(Object.entries(spec.fields).map(([k,v])=>[k,s[v.key]])),secret:String(spec.secret==='token'?store.getToken()??'':s[spec.secret]??'')};},
  async write(p,next,before){const store=await import('./store.js');if(!same(await this.read(p),before))throw Error('配置已变化');const spec=API_PROFILES[p];
   if(next.secret!==before.secret){if(spec.secret==='token'){if(next.secret)store.setToken(next.secret);else store.clearToken();}else store.setSetting(spec.secret as never,next.secret as never);}
   else {const current=store.readStore();store.writeStore({...current,settings:{...current.settings,...Object.fromEntries(Object.entries(next.config).map(([k,v])=>[spec.fields[k].key,v]))}});}
  },
  async test(p,state){const base=apiUrl(state.config.baseUrl),protocol=state.config.protocol;const headers:Record<string,string>={Accept:'application/json'};
   if(state.secret){if(protocol==='anthropic-messages'){headers['x-api-key']=state.secret;headers['anthropic-version']='2023-06-01';}else if(protocol==='google-gemini')headers['x-goog-api-key']=state.secret;else headers.Authorization='Bearer '+state.secret;}
   if(p==='novelai'&&!state.config.allowCustomEndpoint){const host=new URL(base).hostname;if(host!=='novelai.net'&&!host.endsWith('.novelai.net'))throw Error('自定义地址未确认');}
   const endpoint=p==='novelai'?base+'/user/subscription':p==='tags'?base:base+(protocol==='anthropic-messages'&&!base.endsWith('/v1')?'/v1/models':'/models');
   const {proxyConfig}=await import('./proxy.js');const response=await axios.get(endpoint,{...proxyConfig(p==='novelai'?'nai':p==='tags'?'mcp':'ai'),headers,timeout:20000,maxRedirects:0,maxContentLength:1024*1024,validateStatus:()=>true});
   const rows=Array.isArray(response.data)?response.data:response.data?.data??response.data?.models??[];
   return {status:response.status,models:['novelai','tags'].includes(p)?[]:Array.isArray(rows)?rows.map((x:unknown)=>typeof x==='string'?x:typeof x==='object'&&x!==null?String((x as Record<string,unknown>).id??(x as Record<string,unknown>).name??''):'').filter(Boolean):[]};
  }
 };
}
