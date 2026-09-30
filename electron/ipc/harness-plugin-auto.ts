import type {HarnessPluginAutoState} from '../../src/harness-types';
import type {PluginChange} from './harness-plugin-update';
export function createPluginAutoUpdater(options:{enabled:()=>boolean;busy:()=>boolean;plan:(signal:AbortSignal)=>Promise<PluginChange[]>;apply:(changes:PluginChange[],signal:AbortSignal)=>Promise<void>}){
 let state:HarnessPluginAutoState={phase:'idle',message:'插件自动检查尚未开始',plugins:[]},flight:Promise<void>|null=null,controller:AbortController|null=null,waiting=false,manualPending=false,disposed=false;
 const publish=(phase:HarnessPluginAutoState['phase'],message:string)=>{state={...state,phase,message};};
 const cancel=()=>{waiting=false;manualPending=false;controller?.abort();publish('paused','插件自动更新已关闭');};
 function request(manual=false):Promise<void>{
  if(disposed)return Promise.resolve();if(flight)return flight;
  if(!manual&&!options.enabled()){publish('paused','插件自动更新已关闭');return Promise.resolve();}
  manualPending=manual;controller=new AbortController();const signal=controller.signal;
  flight=(async()=>{try{
   waiting=false;publish('checking','正在检查已启用插件的兼容更新…');
   const plan=await options.plan(signal);signal.throwIfAborted();
   state={...state,checkedAt:new Date().toISOString(),plugins:plan.map(({name,fromVersion,version,reason,incompatible,checkError})=>({name,fromVersion,version,reason,incompatible,checkError}))};
   if(plan.some(p=>p.checkError)){publish('error','插件更新检查未完成，请检查网络后重试；原插件保持不变。');return;}
   const unresolved=plan.filter(p=>p.incompatible&&!p.meta);
   if(unresolved.length){publish('blocked','部分插件尚无兼容新版，保留现状；没有自动禁用。');return;}
   const updates=plan.filter(p=>p.meta).map(p=>({...p,action:'upgrade' as const}));
   if(!updates.length){publish('current','插件检查完成，暂无可安装的兼容更新。');return;}
   if(options.busy()){waiting=true;publish('waiting','发现插件更新，等待 Agent 关闭后自动处理。');return;}
   publish('updating','正在备份、隔离检查并更新插件…');await options.apply(updates,signal);
   publish('updated','插件更新完成，原插件和配置已备份。');
  }catch(e){publish(signal.aborted?'paused':'error',signal.aborted?'插件自动更新已停止；未提交的更新已取消。':`插件更新未完成，保留原有环境：${e instanceof Error?e.message:String(e)}`);}
  finally{controller=null;}})().finally(()=>{flight=null;});return flight;
 }
 return {request,cancel,cancelAndWait:async()=>{cancel();await flight;},snapshot:()=>({...state,enabled:options.enabled()}),
  tick:()=>waiting&&!options.busy()?request(manualPending):Promise.resolve(),
  dispose:()=>{disposed=true;cancel();return flight??Promise.resolve();}};
}
