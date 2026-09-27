import {it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const mock=vi.hoisted(()=>({root:'',options:null as any,execute:vi.fn(),settings:{lastGenerationState:{params:{model:'test',steps:28}}}}));
vi.mock('./store',()=>({getSetting:(k:string)=>(mock.settings as any)[k],getSettings:()=>mock.settings,setSetting:vi.fn(),getHistoryReferenceItems:()=>[]}));
vi.mock('electron',()=>({app:{once:vi.fn(),getPath:()=>mock.root,getAppPath:()=>mock.root,isPackaged:false},dialog:{},shell:{},ipcMain:{handle:vi.fn()}}));
vi.mock('./harness-engine',()=>({HarnessEngine:class{constructor(o:any){mock.options=o;}checkUpdates=vi.fn();log=vi.fn();}}));
vi.mock('./agent-tools',()=>({AGENT_TOOL_NAMES:['langbai_generate_image','langbai_convert_prompt'],AGENT_MUTATING_TOOLS:['langbai_generate_image','langbai_convert_prompt'],executeAgentTool:mock.execute}));
it('real native bridge requests one confirmation for conversion + generation, replays without charge, and cancellation executes neither',async()=>{
 mock.root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-once-confirm-'));
 mock.execute.mockImplementation(async(r:any)=>r.tool==='langbai_convert_prompt'?{ok:true,title:'converted',output:'',data:{result:'validated prompt'}}:{ok:true,title:'generated',output:'',data:{count:1}});
 const {registerHarnessLauncher}=await import('./harness-launcher');registerHarnessLauncher(()=>null);
 const bridge=await mock.options.bridge();let seq=0;
 const call=async(tool:string,args:any,callId='ui-'+(++seq))=>{const r=await fetch(bridge.env.STUDIO_BRIDGE_URL+'/v1/tool',{method:'POST',headers:{Authorization:'Bearer '+bridge.env.STUDIO_BRIDGE_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sessionId:'session',callId,tool,args})});expect(r.status).toBe(200);return r.json();};
 try{
   expect((await call('studio_generate_from_description',{text:'自动模式测试',generate:{count:1}},'automatic')).ok).toBe(true);
   expect(mock.execute).toHaveBeenCalledTimes(2);
   expect((await call('studio_image_approval',{})).data).toBeNull();
   mock.execute.mockClear();
   await call('studio_generation_policy',{mode:'confirm'});
   const result=call('studio_generate_from_description',{text:'单人白发',generate:{count:1}},'once');
   let item:any;for(let i=0;i<60&&!item;i++){item=(await call('studio_image_approval',{})).data;if(!item)await new Promise(r=>setTimeout(r,10));}
   expect(item.parameters.templateWorkflow).toBe(true);expect(mock.execute).not.toHaveBeenCalled();
   await call('studio_resolve_image_approval',{id:item.id,approved:true});
   expect((await result).ok).toBe(true);expect(mock.execute).toHaveBeenCalledTimes(2);expect((await call('studio_image_approval',{})).data).toBeNull();
   await call('studio_generate_from_description',{text:'单人白发',generate:{count:1}},'once');expect(mock.execute).toHaveBeenCalledTimes(2);
   const cancel=call('studio_generate_from_description',{text:'别的场景',generate:{count:1}},'cancel');item=null;
   for(let i=0;i<60&&!item;i++){item=(await call('studio_image_approval',{})).data;if(!item)await new Promise(r=>setTimeout(r,10));}
   await call('studio_resolve_image_approval',{id:item.id,approved:false});expect((await cancel).ok).toBe(false);expect(mock.execute).toHaveBeenCalledTimes(2);
 }finally{await bridge.close();}
});
