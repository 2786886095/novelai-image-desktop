import type {AgentToolBridgeRequest,AgentToolBridgeResponse} from '../../src/agent/types';
import {validateTemplateRequest} from '../../src/agent/template-contract';

export function createTemplateWorkflow(
 templates:{execute(request:{tool:string;args:Record<string,unknown>}):AgentToolBridgeResponse},
 approve:(request:AgentToolBridgeRequest)=>Promise<boolean>,backup:()=>Promise<string>) {
 let tail:Promise<unknown>=Promise.resolve();
 async function run(request:AgentToolBridgeRequest):Promise<AgentToolBridgeResponse> {
  try {
   const {action,...args}=validateTemplateRequest(request.args);
   const read=()=>templates.execute({tool:'studio_prompt_template',args:{...('kind'in args?{kind:args.kind}:{}),...('mode'in args?{mode:args.mode}:{}),...('templateVersion'in args?{templateVersion:args.templateVersion}:{})}});
   const before=read();if(!before.ok)return before;
   if(action==='read')return before;
   if((before.data as Record<string,unknown>).revision!==args.expectedRevision)throw Error('软件模板已变化，请重新读取');
   let backupPath:string|undefined;
   if(action==='save'||action==='restore') {
    if(!await approve({...request,args:{action,kind:args.kind??'convert',mode:(before.data as Record<string,unknown>).mode,templateVersion:(before.data as Record<string,unknown>).templateVersion,...(action==='save'?{body:args.body}:{})}}))throw Error('已取消，模板保持原样');
    const checked=read();if(!checked.ok||(checked.data as Record<string,unknown>).revision!==args.expectedRevision)throw Error('确认期间模板变化，请重新读取');
    backupPath=await backup();if(!backupPath)throw Error('修改前备份未完成');
   }
   // The shared editor rechecks the revision after approval and asynchronous backup.
   const result=templates.execute({tool:'studio_save_prompt_template',args:{...args,...(action==='restore'?{body:'',restoreDefault:true}:{})}});
   if(!result.ok)return {...result,...(backupPath?{data:{backupPath}}:{})};
   const data={...(result.data as object),saved:true,...(backupPath?{backupPath,restoreInstructions:'在 Agent 备份列表检查此文件，仅选择配置分类，再确认恢复。也可重新读取模板后保存旧内容。'}:{})};
   return {...result,data,output:JSON.stringify(data)};
  }catch(e){return {ok:false,title:'模板未修改',output:e instanceof Error?e.message:String(e)};}
 }
 return {handles:(tool:string)=>tool==='langbai_templates',execute(request:AgentToolBridgeRequest){const work=tail.then(()=>run(request));tail=work.catch(()=>{});return work;}};
}
