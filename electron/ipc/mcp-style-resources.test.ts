import {expect,it,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {EventEmitter} from 'node:events';import sharp from 'sharp';
import {applyWorkbenchReference,type WorkbenchCommand} from '../../src/mcp-workbench-references';
import type {StylePromptPreset,VibeTransferImage,PreciseReferenceImage} from '../../src/types';
const fx=vi.hoisted(()=>({dir:'',settings:{stylePromptPresetGroups:['Default'],stylePromptPresets:['p1','p2'].map(id=>({id,name:id,group:'Default',prompt:'unedited',createdAt:'2025'})) as StylePromptPreset[]}}));
vi.mock('electron',()=>({app:{getPath:()=>fx.dir},MessageChannelMain:class{
  port1=Object.assign(new EventEmitter(),{start(){},close(){}});port2={postMessage:(data:unknown)=>this.port1.emit('message',{data})};
}}));
vi.mock('./store',()=>({getSettings:()=>fx.settings,setSetting:(k:string,v:unknown)=>Object.assign(fx.settings,{[k]:v}),getHistory:()=>[],ensureHistoryGroup:vi.fn(),applyMcpHistoryMoves:vi.fn()}));
vi.mock('./agent-tools',()=>({executeAgentTool:vi.fn(),agentGenerationInput:vi.fn(),agentInpaintInput:vi.fn()}));
vi.mock('./nai',()=>({quoteAnlasCost:vi.fn(),refreshStoredAccount:vi.fn()}));
import {startMcpServer} from './mcp-server';
import {galleryMcpForWindow} from './mcp-history-gallery-runtime';
it('authenticated tools/list and tools/call keep gallery assets, base image and explicit live references independent',async()=>{
  fx.dir=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-styles-'));
  const state={bootDone:true,settings:{imageProvider:'novelai'},activeTab:'generate',isGenerating:false,inpaintModel:'',params:{model:'nai-diffusion-4-5-full',effort:'high' as 'medium'|'high',prompt:'unchanged',stylePrompt:'ink， '},setParam(k:string,v:string){Object.assign(this.params,{[k]:v});},baseImage:'unchanged',
    vibeImages:[] as VibeTransferImage[],preciseReferences:[] as PreciseReferenceImage[],
    addVibeImage(i:VibeTransferImage){this.vibeImages.push(i);return true;},addPreciseReference(i:PreciseReferenceImage){this.preciseReferences.push(i);},
    removeVibeImage(id:string){this.vibeImages=this.vibeImages.filter(i=>i.id!==id);},removePreciseReference(id:string){this.preciseReferences=this.preciseReferences.filter(i=>i.id!==id);}};
  let catalogEvents=0,mountEvents=0;
  const win={isDestroyed:()=>false,webContents:{isDestroyed:()=>false,send:(s:string)=>{expect(s).toBe('mcp:style-catalog-changed');catalogEvents++;},
    postMessage:(channel:string,c:WorkbenchCommand,[port]:[{postMessage:(v:unknown)=>void}])=>{
      expect(channel).toBe('mcp:workbench-reference');if(c.op==='mount')mountEvents++;
      try{port.postMessage({ok:true,result:applyWorkbenchReference(state,c)});}catch(e){port.postMessage({ok:false,error:String(e)});}
    }}};
  const h=await startMcpServer({token:'fixture',port:0,window:()=>win as never,galleryTools:galleryMcpForWindow(()=>win as never)});
  async function rpc(method:string,params:unknown){return (await(await fetch('http://127.0.0.1:'+h.port+'/mcp',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})).json()).result;}
  async function call(name:string,args:unknown={}){const r=await rpc('tools/call',{name,arguments:args});if(r.isError)throw Error(r.content[0].text);return JSON.parse(r.content[0].text);}
  try{
    const listed = (await rpc('tools/list',{})).tools;
    const names = listed.map((t:{name:string})=>t.name);
    const documented = [...fs.readFileSync('docs/MCP_GALLERY_AND_PROMPTS.md', 'utf8').matchAll(/^\| `([a-z0-9_]+)` \|/gm)].map(row => row[1]);
    expect([...names].sort()).toEqual(documented.sort());
    expect(listed.find((tool:{name:string}) => tool.name === 'generate_image').inputSchema.properties.preciseReferences.items.properties)
      .toMatchObject({type:{enum:expect.arrayContaining(['costume','character_mainoutfit','character&style_anyoutfit'])},strength:{maximum:5}});
    expect(names).toEqual(expect.arrayContaining(['list_style_assets','move_style_presets','attach_style_images','mount_workbench_reference','unmount_workbench_reference','list_workbench_references','create_style_group']));
    for(const prefix of ['ink','ink, unedited']){
      const args={kind:'style',id:'p2',mode:'append'};
      const p=await call('apply_prompt_library_entry',args);
      expect(p.after).toBe(prefix+', unedited');
      await call('apply_prompt_library_entry',{...args,revision:p.revision});
      expect(state.params.stylePrompt).toBe(p.after);
    }
    await call('create_style_group',{name:'水彩'});expect((await call('create_style_group',{name:'水彩'})).created).toBe(false);
    const move={presetIds:['p1','p2'],group:'水彩'},mv=await call('move_style_presets',move);
    expect(fx.settings.stylePromptPresets.map(p=>p.group)).toEqual(['Default','Default']);
    await expect(call('move_style_presets',{...move,presetIds:['p1','missing']})).rejects.toThrow();
    await call('move_style_presets',{...move,revision:mv.revision});expect((await call('list_style_assets',{group:'水彩'})).total).toBe(2);
    await expect(call('move_style_presets',{...move,revision:mv.revision})).rejects.toThrow();
    const file=path.join(fx.dir,'swatch.png');await sharp({create:{width:4,height:3,channels:3,background:'navy'}}).png().toFile(file);
    const {attachmentId:image}=await call('import_image',{path:file});
    const items=[{presetId:'p1',image,role:'cover'},{presetId:'p2',image,role:'example'}];
    const preview=await call('attach_style_images',{items});expect(fx.settings.stylePromptPresets.every(p=>!p.previewImages)).toBe(true);
    expect(fs.existsSync(path.join(fx.dir,'style-prompt-previews'))).toBe(false);
    await expect(call('attach_style_images',{items:[items[0],{...items[1],image:'missing'}],revision:preview.revision})).rejects.toThrow();
    const added=await call('attach_style_images',{items,revision:preview.revision});expect(added.items.map((r:{ok:boolean})=>r.ok)).toEqual([true,true]);
    const [p1,p2]=fx.settings.stylePromptPresets;expect(p1.coverImageId).toBe(p1.previewImages![0].id);expect(p2.coverImageId).toBeUndefined();expect(fs.readFileSync(p1.previewImages![0].filePath)).toEqual(fs.readFileSync(file));
    await expect(call('set_style_cover',{presetId:'p2',image:added.items[0].handle})).rejects.toThrow();
    await call('set_style_cover',{presetId:'p2',image:added.items[1].handle});expect(fx.settings.stylePromptPresets[1].previewImages).toHaveLength(1);
    await expect(call('attach_style_images',{items,revision:preview.revision})).rejects.toThrow();
    await expect(call('attach_style_images',{items:[items[0],items[0]]})).rejects.toThrow();
    await expect(call('attach_style_images',{items:[{presetId:'p1',image:file,role:'example'}]})).rejects.toThrow();
    expect(mountEvents).toBe(0);expect(await call('list_workbench_references')).toMatchObject({vibe:[],precise:[]});
    await expect(call('mount_workbench_reference',{image})).rejects.toThrow();
    const cover=added.items[0].handle;
    const mounted=await call('mount_workbench_reference',{image:cover,kind:'precise',type:'style',strength:0.7});expect(state.preciseReferences[0]).toMatchObject({id:mounted.id,type:'style',strength:0.7,srcWidth:4,srcHeight:3});
    await expect(call('mount_workbench_reference',{image,kind:'vibe'})).rejects.toThrow();
    await call('unmount_workbench_reference',{kind:'precise',id:mounted.id});expect(fs.existsSync(p1.previewImages![0].filePath)).toBe(true);
    state.params.model='nai-diffusion-5-full';await expect(call('mount_workbench_reference',{image,kind:'vibe'})).rejects.toThrow();
    const outfit = await call('mount_workbench_reference',{image,kind:'precise',type:'costume',strength:4.25});
    expect((await call('list_workbench_references')).precise).toMatchObject([{id:outfit.id,type:'costume',strength:4.25}]);
    state.params.effort = 'medium';
    await expect(call('mount_workbench_reference',{image, kind:'precise'})).rejects.toThrow(/High/);
    expect(await call('list_workbench_references')).toMatchObject({precise:[{id:outfit.id}]});
    state.params.effort = 'high';
    await call('unmount_workbench_reference',{kind:'precise',id:outfit.id});
    state.params.model='nai-diffusion-4-5-full';state.isGenerating=true;await expect(call('mount_workbench_reference',{image,kind:'vibe'})).rejects.toThrow();state.isGenerating=false;
    const vibe=await call('mount_workbench_reference',{image,kind:'vibe',information:0.6});expect((await call('list_workbench_references')).vibe).toEqual([{id:vibe.id,strength:1,infoExtracted:0.6}]);
    expect(state.baseImage).toBe('unchanged');expect(state.params.prompt).toBe('unchanged');expect(p1.prompt).toBe('unedited');expect(catalogEvents).toBe(4);
  }finally{await h.close();fs.rmSync(fx.dir,{recursive:true,force:true});}
});
