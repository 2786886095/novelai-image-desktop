import {expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({positivePromptPresets:[] as {id:string;name:string}[]}));
vi.mock('electron',()=>({app:{isPackaged:false,getPath:()=>'.'},safeStorage:{},dialog:{}}));
vi.mock('./store',()=>({getSettings:()=>db,setSetting:(k:'positivePromptPresets',v:typeof db.positivePromptPresets)=>{db[k]=v;}}));
vi.mock('./agent-tools',()=>({executeAgentTool:vi.fn(),agentGenerationInput:vi.fn(),agentInpaintInput:vi.fn()}));
vi.mock('./nai',()=>({quoteAnlasCost:vi.fn(),refreshStoredAccount:vi.fn()}));
import {startMcpServer} from './mcp-server';
it('serves real list and call requests: parse, save and read back a named role group without a provider',async()=>{
 const token='local-test',s=await startMcpServer({port:0,token,window:()=>null});
 const rpc=async(method:string,params:unknown)=>(await(await fetch('http://127.0.0.1:'+s.port+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})).json()).result;
 const call=(name:string,args:unknown)=>rpc('tools/call',{name,arguments:args});
 try{
 const names=(await rpc('tools/list',{})).tools.map((t:{name:string})=>t.name);expect(names).toEqual(expect.arrayContaining(['prepare_character_group','save_character_group']));
 const args={text:'角色1：red\n负面1：hat\n角色2：blue',model:'nai-diffusion-4-5-full'};
 const result=JSON.parse((await call('prepare_character_group',args)).content[0].text);expect(result.characterPrompts[0]).toEqual({prompt:'red',negativePrompt:'hat'});expect(db.positivePromptPresets).toHaveLength(0);
 const saved=JSON.parse((await call('save_character_group',{...args,name:'Cast'})).content[0].text);
 const loaded=JSON.parse((await call('prepare_character_group',{presetId:saved.id})).content[0].text);expect(loaded.characterPrompts).toEqual(result.characterPrompts);
 expect((await call('prepare_character_group',{text:'角色1：red\n角色1：blue'})).isError).toBe(true);
 }finally{await s.close();}
});
