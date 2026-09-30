import {it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const fixture=vi.hoisted(()=>({root:'',options:null as any}));
vi.mock('electron',()=>({app:{once:vi.fn(),getPath:()=>fixture.root,getAppPath:()=>fixture.root,isPackaged:false},dialog:{},shell:{},ipcMain:{handle:vi.fn()}}));
vi.mock('./store',()=>({getSetting:(key:string)=>key==='stylePromptPresets'?[{id:'selected',name:'Session style',prompt:'watercolor',group:'Default',rating:0,previewImages:[]}]:undefined,getSettings:()=>({}),setSetting:vi.fn(),getHistoryReferenceItems:()=>[]}));
vi.mock('./harness-engine',()=>({HarnessEngine:class{constructor(options:any){fixture.options=options;}checkUpdates=vi.fn();log=vi.fn();}}));
vi.mock('./agent-tools',()=>({AGENT_TOOL_NAMES:[],AGENT_MUTATING_TOOLS:[],executeAgentTool:vi.fn()}));
vi.mock('./studio-data-tools',()=>({STUDIO_DATA_TOOLS:['langbai_get_generation_state'],createStudioDataTools:()=>({handles:(tool:string)=>tool==='langbai_get_generation_state',execute:async()=>({ok:true,title:'state',data:{params:{stylePrompt:'old workbench',steps:28},lockedStylePrompt:'old workbench'}})})}));
it('actual bridge returns session style in both data and output instead of stale workbench style',async()=>{
 fixture.root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-style-readback-'));
 const {registerHarnessLauncher}=await import('./harness-launcher');registerHarnessLauncher(()=>null);
 const bridge=await fixture.options.bridge();let seq=0;
 const call=async(tool:string,args={},sessionId='session')=>{
  const r=await fetch(bridge.env.STUDIO_BRIDGE_URL+'/v1/tool',{method:'POST',headers:{Authorization:'Bearer '+bridge.env.STUDIO_BRIDGE_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({tool,args,sessionId,callId:'call-'+(++seq)})});expect(r.status).toBe(200);return r.json();
 };
 try{
  expect((await call('studio_set_session_style',{presetId:'selected'})).ok).toBe(true);
  const result=await call('langbai_get_generation_state');
  expect(result.data).toMatchObject({params:{stylePrompt:'watercolor',steps:28},lockedStylePrompt:'watercolor',sessionStyle:{id:'selected'}});
  expect(JSON.parse(result.output)).toEqual(result.data);
  const other=await call('langbai_get_generation_state',{},'other');expect(other.data.params.stylePrompt).toBe('old workbench');
 }finally{await bridge.close();await fs.rm(fixture.root,{recursive:true,force:true});}
});
