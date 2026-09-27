import {describe,it,expect,vi} from 'vitest';
vi.mock('./store',()=>({useAppStore:{}}));
import {createStudioAgentService,type StudioAgentDependencies} from './studio-agent';
import {projectStudioData,validateStudioPatch,validateStyleInput} from './studio-agent-contract';
import {DEFAULT_PARAMS,DEFAULT_AUGMENT_OPTIONS,type AppSettings} from './types';

function fixture() {
  let settings={stylePromptPresets:[],positivePromptPresets:[],promptChunks:[],stylePromptPresetGroups:['Test'],visionApiKey:'fixture-secret',agentMaxOutputTokens:8192,theme:'system',lockStylePrompt:false,lockNegativePrompt:false,lastGenerationState:null} as unknown as AppSettings;
  let state={bootDone:true,settings,params:{...DEFAULT_PARAMS},charCaptions:[],batchCount:1,batchIntervalSeconds:0,i2iParams:{strength:0.7,noise:0,extraNoiseSeed:0},inpaintModel:'nai-diffusion-4-5-full-inpainting',inpaintStrength:0.7,inpaintNoise:0,inpaintPositivePrompt:'',brushSize:32,brushOpacity:1,brushColor:'#ffffff',brushShape:'round',upscaleScale:2,directorTool:'colorize',augmentOptions:{...DEFAULT_AUGMENT_OPTIONS},vibeImages:[],preciseReferences:[],account:{hasToken:false},showSettings:false,isGenerating:false} as unknown as ReturnType<StudioAgentDependencies['getState']>;
  let id=0;
  const commit=vi.fn(async(_id:string,key:string,expected:unknown,value:unknown)=>{
    if(JSON.stringify(settings[key as keyof AppSettings])!==JSON.stringify(expected))throw new Error('CAS conflict');
    settings={...settings,[key]:structuredClone(value)};
  });
  const api={getSettings:async()=>structuredClone(settings),commitStudioSetting:commit,getHistory:vi.fn(async()=>[]),getHistoryGroups:vi.fn(async()=>[]),listReferencePresets:vi.fn(async()=>({presets:[]})),getAgentWorkspace:vi.fn(async()=>({characters:[{id:'role',name:'fixture character'}],memories:[{id:'memory',content:'remember'}],lorebooks:[],personas:[],conversations:[]}))} as unknown as StudioAgentDependencies['api'];
  const service=createStudioAgentService({getState:()=>state,setState:patch=>{state={...state,...patch};},api,uuid:()=>`id-${++id}`});
  const call=(action:'read'|'list'|'prepare'|'apply',args:Record<string,unknown>={})=>service.handle({id:'request',action,args});
  const revision=async()=>((await call('read')).data as {revision:string}).revision;
  return {call,revision,commit,api,get settings(){return settings;},get state(){return state;},change:(patch:Partial<typeof state>)=>{state={...state,...patch};},configure:(patch:Partial<AppSettings>)=>{settings={...settings,...patch};}};
}
describe('Studio live data',()=>{
  it('reads unsaved live parameters instead of persisted lastGenerationState',async()=>{
    const f=fixture();f.change({params:{...f.state.params,positivePrompt:'live edit'}});
    const r=await f.call('read',{section:'generation'});expect(r.ok).toBe(true);expect(JSON.stringify(r)).toContain('live edit');expect(f.settings.lastGenerationState).toBeNull();
  });
  it('changes revisions after user edits but not between unchanged reads',async()=>{
    const f=fixture(),a=await f.revision();expect(await f.revision()).toBe(a);
    f.change({params:{...f.state.params,steps:31}});expect(await f.revision()).not.toBe(a);
  });
  it('redacts keys, authenticated URLs and binary fields but retains numeric token budgets',()=>{
    const result=projectStudioData({visionApiKey:'secret',agentMaxOutputTokens:8192,hasToken:false,proxyUrl:'http://user:pass@host:80/?token=x#x',base64:'xxx',nested:{password:'secret'},previewUrl:'data:image/png;base64,xxx'});
    expect(JSON.stringify(result)).not.toContain('secret');expect(JSON.stringify(result)).not.toContain('pass@');expect(JSON.stringify(result)).not.toContain('xxx');expect(result).toMatchObject({agentMaxOutputTokens:8192,hasToken:false});
  });
  it('paginates style libraries without skipping records',async()=>{
    const f=fixture();f.configure({stylePromptPresets:Array.from({length:55},(_,n)=>({id:`s${n}`,name:`Style${n}`,prompt:'p',group:'Default',createdAt:''}))});
    const first=await f.call('list',{collection:'styles',limit:50});expect(first.data).toMatchObject({total:55,nextOffset:50});
    const second=await f.call('list',{collection:'styles',offset:50});expect(second.data).toMatchObject({nextOffset:null});expect((second.data as {items:unknown[]}).items).toHaveLength(5);
  });
  it('reads legacy roles and history through software APIs',async()=>{
    const f=fixture();expect(JSON.stringify(await f.call('list',{collection:'characters'}))).toContain('fixture character');
    await f.call('list',{collection:'history',date:'2026-09-25',groupId:'group'});expect(f.api.getHistory).toHaveBeenCalledWith('2026-09-25','group');
  });
});
describe('Studio confirmed mutation service',()=>{
  it('prepare is read-only; apply persists and returns a new revision',async()=>{
    const f=fixture(),expectedRevision=await f.revision(),args={expectedRevision,target:'params',patch:{steps:30}};
    expect((await f.call('prepare',args)).ok).toBe(true);expect(f.commit).not.toHaveBeenCalled();
    const r=await f.call('apply',args);expect(r.ok).toBe(true);expect(f.state.params.steps).toBe(30);expect(f.settings.lastGenerationState?.params.steps).toBe(30);expect(r.data).toMatchObject({persisted:true});
  });
  it('rejects stale changes made while confirmation was open',async()=>{
    const f=fixture(),expectedRevision=await f.revision();f.change({params:{...f.state.params,steps:33}});
    expect((await f.call('apply',{expectedRevision,target:'params',patch:{steps:30}})).ok).toBe(false);expect(f.commit).not.toHaveBeenCalled();expect(f.state.params.steps).toBe(33);
  });
  it('saves and edits a style preserving previews, other presets and fractional ratings',async()=>{
    const f=fixture();let r=await f.call('apply',{expectedRevision:await f.revision(),operation:'style',name:'My Style',prompt:'watercolor',group:'Test',rating:4.3});
    expect(r.ok).toBe(true);expect(f.settings.stylePromptPresets).toHaveLength(1);const preset=f.settings.stylePromptPresets[0];
    f.configure({stylePromptPresets:[{...preset,previewImages:[{id:'img',name:'a',filePath:'a',fileUrl:'a',createdAt:''}]},{...preset,id:'other',name:'other'}]});
    r=await f.call('apply',{expectedRevision:await f.revision(),operation:'style',id:preset.id,name:'Edited',prompt:'ink',group:'Test',rating:5});
    expect(r.ok).toBe(true);expect(f.settings.stylePromptPresets).toHaveLength(2);expect(f.settings.stylePromptPresets[0].previewImages).toHaveLength(1);expect(f.settings.stylePromptPresets[1].name).toBe('other');
  });
  it('honors prompt locks and active generation',async()=>{
    const f=fixture();f.configure({lockStylePrompt:true});expect((await f.call('apply',{expectedRevision:await f.revision(),target:'params',patch:{stylePrompt:'new'}})).ok).toBe(false);
    f.change({isGenerating:true});expect((await f.call('apply',{expectedRevision:await f.revision(),target:'params',patch:{steps:31}})).ok).toBe(false);expect(f.commit).not.toHaveBeenCalled();
  });
  it('restores live state after disk failure',async()=>{
    const f=fixture();f.commit.mockRejectedValueOnce(new Error('disk full'));
    const r=await f.call('apply',{expectedRevision:await f.revision(),target:'params',patch:{steps:31}});expect(r.ok).toBe(false);expect(f.state.params.steps).toBe(DEFAULT_PARAMS.steps);
  });
  it('does not overwrite a newer UI edit while persistence is pending',async()=>{
    const f=fixture();f.commit.mockImplementationOnce(async()=>{f.change({params:{...f.state.params,steps:41}});throw new Error('disk failure');});
    expect((await f.call('apply',{expectedRevision:await f.revision(),target:'params',patch:{steps:31}})).ok).toBe(false);expect(f.state.params.steps).toBe(41);
  });
  it('reads back persisted global settings and updates the UI store',async()=>{
    const f=fixture();expect((await f.call('apply',{expectedRevision:await f.revision(),target:'settings',patch:{theme:'dark'}})).ok).toBe(true);expect(f.state.settings?.theme).toBe('dark');expect(f.settings.theme).toBe('dark');
  });
  it('rejects destructive and credential fields, invalid ranges and prototype keys',()=>{
    for(const args of [{target:'settings',patch:{visionApiKey:'key'}},{target:'settings',patch:{outputDir:'path'}},{target:'params',patch:{steps:100}},{target:'params',patch:{width:100}},{target:'params',patch:{seed:NaN}},{target:'__proto__',patch:{x:1}},{target:'params',patch:{steps:20,height:1024}}])expect(()=>validateStudioPatch(args)).toThrow();
    expect(()=>validateStyleInput({name:'X',prompt:'Y',rating:6})).toThrow();
  });
  it('does not mutate while settings dialog has unsaved drafts or renderer has not booted',async()=>{
    const f=fixture();f.change({showSettings:true});expect((await f.call('apply',{expectedRevision:await f.revision(),target:'settings',patch:{theme:'dark'}})).ok).toBe(false);
    f.change({bootDone:false});expect((await f.call('read')).ok).toBe(false);expect(f.commit).not.toHaveBeenCalled();
  });
});
