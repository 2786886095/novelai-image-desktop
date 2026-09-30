import {projectStudioData} from '../../src/studio-agent-contract';
import {randomUUID} from 'node:crypto';
import type {AgentToolBridgeRequest} from '../../src/agent/types';
export const IMAGE_APPROVAL_TOOLS=['studio_image_approval','studio_resolve_image_approval'] as const;
export function createImageApprovals(timeoutMs=300000) {
  type Pending={id:string;sessionId:string;tool:string;count:number;createdAt:number;parameters:Record<string,unknown>;kind:string;title:string;finish:(approved:boolean)=>void};
  const pending=new Map<string,Pending>();
  const session=(value:unknown)=>{
    if(typeof value!=='string'||!/^[a-zA-Z0-9_.:-]{1,160}$/.test(value)||value==='studio-library-ui')throw Error('请先选择酒馆会话');
    return value;
  };
  return {
    cancelGeneration(sessionId:string){const item=pending.get(sessionId);if(item&&(item.kind==='image'||item.tool==='langbai_tasks'))item.finish(false);},
    close(){for(const item of [...pending.values()])item.finish(false);},
    handles:(tool:string)=>(IMAGE_APPROVAL_TOOLS as readonly string[]).includes(tool),
    wait(request:AgentToolBridgeRequest):Promise<boolean> {
      const id=session(request.sessionId);
      request.signal?.throwIfAborted();
      if(pending.has(id))throw Error('当前会话已有待确认操作');
      const comic=request.tool==='langbai_software_action'&&['comic.generation.start','batch.generation.start'].includes(String(request.args.action));
      const image=comic||['langbai_generate_image','langbai_redraw_image','langbai_inpaint_image','langbai_upscale_image','langbai_director'].includes(request.tool);
      const count=comic?request.args.plannedImages:request.tool==='langbai_generate_image'?(request.args.count??1):1;
      if(typeof count!=='number'||!Number.isSafeInteger(count)||count<1||(!comic&&count>8))throw Error('生成张数必须为 1–8');
      return new Promise(resolve=>{
        let timer:ReturnType<typeof setTimeout>;
        const abort=()=>finish(false);
        const finish=(approved:boolean)=>{clearTimeout(timer);request.signal?.removeEventListener('abort',abort);pending.delete(id);resolve(approved);};
        const parameters=projectStudioData(request.args) as Record<string,unknown>;
        pending.set(id,{id:randomUUID(),sessionId:id,tool:request.tool,count,parameters,kind:image?'image':'operation',title:image?'确认生图':(['langbai_convert_prompt','langbai_reverse_prompt'].includes(request.tool)?'确认调用模型（可能收费）':'确认软件操作'),createdAt:Date.now(),finish});
        timer=setTimeout(abort,timeoutMs);request.signal?.addEventListener('abort',abort,{once:true});
        if(request.signal?.aborted)abort();
      });
    },
    execute(request:AgentToolBridgeRequest) {
      try {
        const id=session(request.sessionId),item=pending.get(id);
        if(request.tool==='studio_resolve_image_approval') {
          if(!item||request.args.id!==item.id)throw Error('确认已过期或不属于当前会话，请重新读取');
          if(typeof request.args.approved!=='boolean')throw Error('请选择确认或取消');
          item.finish(request.args.approved);
          return {ok:true,title:'操作确认',output:'已处理',data:null};
        }
        const data=item?{id:item.id,tool:item.tool,count:item.count,kind:item.kind,title:item.title,parameters:item.parameters,createdAt:item.createdAt}:null;
        return {ok:true,title:'待确认操作',output:JSON.stringify(data),data};
      }catch(error){return {ok:false,title:'确认未完成',output:error instanceof Error?error.message:String(error)};}
    }
  };
}
