import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {ReactElement} from 'react';

// Runs real component handlers in a deterministic hook harness. This is not a
// native GUI acceptance run; the main-process bridge is a typed test fixture.
const harness=vi.hoisted(()=>{
  type Slot={value?:unknown;deps?:unknown[];cleanup?:()=>void};
  const slots:Slot[]=[],effects:Array<()=>void>=[];let cursor=0;
  const changed=(a?:unknown[],b?:unknown[])=>!a||!b||a.length!==b.length||a.some((x,i)=>!Object.is(x,b[i]));
  return {
    store:{settings:{language:'en-US'},setActiveTab:vi.fn()},
    begin(){cursor=0;},
    state(initial:unknown){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,(value:unknown)=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},
    ref(initial:unknown){const i=cursor++;return (slots[i]??={value:{current:initial}}).value;},
    memo(factory:()=>unknown,deps?:unknown[]){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps))slots[i]={value:factory(),deps};return slots[i].value;},
    effect(callback:()=>void|(()=>void),deps?:unknown[]){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps)){const previous=slots[i]?.cleanup;slots[i]={deps};effects.push(()=>{previous?.();const cleanup=callback();slots[i].cleanup=typeof cleanup==='function'?cleanup:undefined;});}},
    flush(){while(effects.length)effects.shift()!();},
    reset(){for(const slot of slots)slot.cleanup?.();slots.length=0;effects.length=0;cursor=0;},
  };
});
vi.mock('react',async original=>({...await original<typeof import('react')>(),
  useState:(x:unknown)=>harness.state(x),useRef:(x:unknown)=>harness.ref(x),
  useMemo:(fn:()=>unknown,deps?:unknown[])=>harness.memo(fn,deps),
  useCallback:(fn:unknown,deps?:unknown[])=>harness.memo(()=>fn,deps),
  useEffect:(fn:()=>void|(()=>void),deps?:unknown[])=>harness.effect(fn,deps),
}));
vi.mock('./store',()=>({useAppStore:(selector:(state:typeof harness.store)=>unknown)=>selector(harness.store)}));
vi.mock('./components/ui',()=>({Button:'button',AppPortal:'div'}));
vi.mock('./components/PreviewImageViewer',()=>({PreviewImageViewer:'comfy-test-preview'}));
vi.mock('./components/icons',()=>({Icon:'comfy-test-icon'}));
import ComfyLocalTool,{comfyElapsed} from './ComfyLocalTool';
import ToolsHub from './ToolsHub';
import {featureText} from './feature-text';
import type {ComfyLocalApi,ComfyAnalysis,ComfyLocalConfig,ComfySnapshot,ComfyWorkflowSummary,ComfyRunSnapshot,ComfyResultItem,ComfyResponse,ComfyEvent,ComfyStateBundle} from './comfyui/contract';

type Node=ReactElement<Record<string,any>>;
let tree:Node;
function walk(v:unknown):Node[]{
  if(Array.isArray(v))return v.flatMap(walk);
  if(!v||typeof v!=='object'||!('props'in v))return [];
  const node=v as Node;
  if(typeof node.type==='function'&&['Field','SlotInput'].includes(node.type.name))return [node,...walk((node.type as (p:unknown)=>unknown)(node.props))];
  return [node,...walk(node.props.children)];
}
function visible(v:unknown):string{if(typeof v==='string'||typeof v==='number')return String(v);if(Array.isArray(v))return v.map(visible).join(' ');return v&&typeof v==='object'&&'props'in v?visible((v as Node).props.children):'';}
function render(){harness.begin();tree=ComfyLocalTool({onBack:vi.fn()}) as Node;harness.flush();return tree;}
async function settle(){for(let i=0;i<20;i++)await Promise.resolve();render();}
const nodes=()=>walk(tree);
const button=(text:string)=>nodes().find(n=>n.type==='button'&&(visible(n.props.children).trim()===text||n.props['aria-label']===text))!;
const field=(label:string)=>nodes().find(n=>n.props['aria-label']===label)!;
async function click(text:string){button(text).props.onClick();await settle();}
function change(label:string,value:string|boolean){const node=field(label);node.props.onChange({target:typeof value==='boolean'?{checked:value}:{value}});render();}

afterEach(()=>{harness.reset();vi.unstubAllGlobals();vi.useRealTimers();});

const ok=<T,>(data:T):ComfyResponse<T>=>({ok:true,data});
let api:ComfyLocalApi,emit:(event:ComfyEvent)=>void,unsubscribe:()=>void;
let config:ComfyLocalConfig,snapshot:ComfySnapshot,workflows:ComfyWorkflowSummary[],report:ComfyAnalysis,run:ComfyRunSnapshot,result:ComfyResultItem;
function workflowFixture(id='wf1'):ComfyWorkflowSummary{return {id,name:`Workflow ${id}`,createdAt:'2026-10-20T00:00:00Z',updatedAt:'2026-10-20T00:00:00Z',sourceKind:'api-json',sourceFormat:'api',sourceSha256:'a'.repeat(64),fileName:'fixture.json',templateName:null,familyLabel:'anima',lastAnalysis:null,savedValues:{}};}
function buildFixtures(){
  config={schema:1,install:{root:'fixture/ComfyUI',mainPy:'fixture/ComfyUI/main.py',python:'fixture/python.exe',cwd:'fixture/ComfyUI',layout:'custom',pythonVersion:'3.12',supportedFlags:['--disable-api-nodes','--disable-all-custom-nodes'],helpProbe:'passed',helpProbeMessage:null,checkedAt:'2026-10-20T00:00:00Z'},launch:{port:8188,readyTimeoutSec:300,disableApiNodes:true,safeMode:false,extraArgs:[]},connection:{host:'127.0.0.1',port:8188},outputDirectory:'fixture/output'};
  snapshot={phase:'ready',owner:'external',stage:null,target:{host:'127.0.0.1',port:8188},baseUrl:'http://127.0.0.1:8188',pid:null,startedAt:null,readyAt:'2026-10-20T00:00:00Z',failure:null,identity:null,health:'ok',detectedExternal:null,previousSession:null,inventory:null,activeRun:null,logs:[]};
  workflows=[workflowFixture()];
  report={ok:true,revision:'revision1',sourceFormat:'api',issues:[],slots:[
    {id:'model:1:unet_name',kind:'model',nodeId:'1',input:'unet_name',classType:'UNETLoader',label:'UNET',valueType:'combo',defaultValue:'anima.safetensors',options:['anima.safetensors','alternate.safetensors'],role:'diffusion'},
    {id:'model:2:clip_name',kind:'model',nodeId:'2',input:'clip_name',classType:'CLIPLoader',label:'CLIP',valueType:'combo',defaultValue:'encoder.safetensors',options:['encoder.safetensors','second-encoder.safetensors'],role:'text-encoder'},
    {id:'model:3:vae_name',kind:'model',nodeId:'3',input:'vae_name',classType:'VAELoader',label:'VAE',valueType:'combo',defaultValue:'vae.safetensors',options:['vae.safetensors','other-vae.safetensors'],role:'vae'},
    {id:'positive:4:text',kind:'positive',nodeId:'4',input:'text',classType:'CLIPTextEncode',label:'text',valueType:'string',defaultValue:'a tree',multiline:true},
    {id:'width:5:width',kind:'width',nodeId:'5',input:'width',classType:'EmptyLatentImage',label:'width',valueType:'int',defaultValue:256,min:64,max:4096,step:64},
    {id:'seed:6:seed',kind:'seed',nodeId:'6',input:'seed',classType:'KSampler',label:'seed',valueType:'int',defaultValue:42,min:0,max:1000000},
  ],missingNodeTypes:[],missingModels:[],cloudNodes:[],thirdParty:[],thirdPartyFingerprint:null,unverifiedConversion:false,conversion:null,family:{family:'anima',variant:null,confidence:'model-file',evidence:[]},prunedNodes:[],nodeCount:8,outputNodes:['8']};
  run={runId:'run1',workflowId:'wf1',promptId:'prompt1',phase:'queued',queuePosition:1,currentNode:null,progress:null,nodesExecuted:0,nodesTotal:8,startedAt:'2026-10-20T00:00:00Z',finishedAt:null,seeds:{'seed:6:seed':42},error:null,results:[],nonImageOutputs:0};
  result={id:'result1',runId:'run1',workflowId:'wf1',promptId:'prompt1',filePath:'fixture/output/ComfyUI/result.png',fileUrl:'nai-local://fixture/result1',mime:'image/png',width:256,height:256,bytes:1000,sha256:'b'.repeat(64),sourceNodeId:'8',createdAt:'2026-10-20T00:00:00Z',slotValues:{'positive:4:text':'a saved tree','seed:6:seed':42}};
  unsubscribe=vi.fn();emit=()=>{};
  api={
    getState:vi.fn(async()=>ok<ComfyStateBundle>({config,snapshot,workflows,results:[],platform:{os:'win32',launchSupported:true,launchAcceptance:'unverified'}})),
    snapshot:vi.fn(async()=>ok(snapshot)),
    chooseInstallDirectory:vi.fn(async()=>ok(config)),choosePython:vi.fn(async()=>ok(config)),chooseOutputDirectory:vi.fn(async()=>ok(config)),detectInstall:vi.fn(async()=>ok(config)),
    setLaunchOptions:vi.fn(async patch=>{config={...config,launch:{...config.launch,...patch}};return ok(config);}),
    setConnection:vi.fn(async target=>{config={...config,connection:target};return ok(config);}),
    start:vi.fn(async()=>ok(snapshot)),connect:vi.fn(async()=>ok(snapshot)),stop:vi.fn(async()=>ok<ComfySnapshot>({...snapshot,phase:'stopped',owner:null})),disconnect:vi.fn(async()=>ok<ComfySnapshot>({...snapshot,phase:'idle',owner:null})),
    refreshInventory:vi.fn(async()=>ok({fetchedAt:'2026-10-20T00:00:00Z',nodeTypeCount:100,catalogRevision:'catalog1',modelFolders:null})),
    importWorkflowFile:vi.fn(async()=>ok(workflows[0])),importWorkflowJson:vi.fn(async()=>ok(workflows[0])),listWorkflows:vi.fn(async()=>ok([...workflows])),
    renameWorkflow:vi.fn(async(id,name)=>{workflows=workflows.map(item=>item.id===id?{...item,name}:item);return ok(workflows.find(item=>item.id===id)!);}),
    deleteWorkflow:vi.fn(async(id)=>{workflows=workflows.filter(item=>item.id!==id);return ok({deleted:true});}),
    analyzeWorkflow:vi.fn(async()=>ok(structuredClone(report))),run:vi.fn(async()=>ok(run)),cancel:vi.fn(async()=>ok<ComfyRunSnapshot>({...run,phase:'cancelled'})),listResults:vi.fn(async()=>ok([result])),
    openResult:vi.fn(async()=>ok(undefined)),openResultsFolder:vi.fn(async()=>ok(undefined)),reuseResult:vi.fn(async()=>ok({workflowId:result.workflowId,slotValues:result.slotValues})),
    onEvent:vi.fn((callback:(event:ComfyEvent)=>void)=>{emit=callback;return()=>{unsubscribe();};}),
  };
}
beforeEach(async()=>{
  harness.reset();vi.clearAllMocks();harness.store.settings.language='en-US';buildFixtures();
  vi.stubGlobal('window',{naiComfy:api,naiDesktop:{platform:'win32'},location:{search:''},setInterval:(...args:Parameters<typeof setInterval>)=>setInterval(...args),clearInterval:(id:ReturnType<typeof setInterval>)=>clearInterval(id)});
  vi.stubGlobal('localStorage',{getItem:()=>null,setItem:vi.fn()});render();await settle();
});
async function selectWorkflow(id='wf1'){nodes().find(n=>n.type==='button'&&n.props.className==='comfy-local-workflow'&&visible(n.props.children).includes(`Workflow ${id}`))!.props.onClick();await settle();}

describe('local ComfyUI actual frontend handlers (typed protocol fixtures, not native GUI)',()=>{
  it('does not start, connect or run on mount; missing bridge is safe and its card hidden',()=>{
    expect(api.getState).toHaveBeenCalledTimes(1);expect(api.start).not.toHaveBeenCalled();expect(api.connect).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
    harness.reset();(window as {naiComfy?:ComfyLocalApi}).naiComfy=undefined;render();expect(visible(tree)).toContain('bridge is unavailable');
    harness.reset();harness.begin();tree=ToolsHub() as Node;harness.flush();expect(visible(tree)).not.toContain('Local ComfyUI');
  });
  it('shows the native tool card when the dedicated bridge exists',()=>{
    harness.reset();harness.begin();tree=ToolsHub() as Node;harness.flush();expect(visible(tree)).toContain('Local ComfyUI');
  });
  it('uses real state timestamps while starting and only says ready after a ready event',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
    emit({type:'snapshot',snapshot:{...snapshot,phase:'starting',owner:'app',stage:'waiting-http',startedAt:'2026-10-20T00:00:00Z'}});render();expect(visible(tree)).toContain('Starting');
    await vi.advanceTimersByTimeAsync(12000);render();expect(visible(tree)).toContain('00:12');expect(visible(tree)).not.toContain('Ready · external instance');
    emit({type:'snapshot',snapshot:{...snapshot,phase:'ready',owner:'app'}});render();expect(button('Stop service started by this app')).toBeTruthy();
    await click('Stop service started by this app');expect(api.stop).toHaveBeenCalledWith({interruptRunning:true});expect(visible(tree)).toContain('Stopped');
    expect(comfyElapsed(undefined,0)).toBe('00:00');expect(comfyElapsed(0,65000)).toBe('01:05');
  });
  it('disconnects an external service without invoking stop',async()=>{
    expect(visible(tree)).toContain('Ready · external instance');await click('Disconnect');expect(api.disconnect).toHaveBeenCalledTimes(1);expect(api.stop).not.toHaveBeenCalled();
  });
  it('shows failure cause, literal diagnostics and bounded logs',()=>{
    emit({type:'snapshot',snapshot:{...snapshot,phase:'failed',failure:{code:'exited-early',message:'fixture process exit',exitCode:3,signal:null,logTail:['last fixture line'],at:'2026-10-20T00:00:00Z'}}});render();
    expect(visible(tree)).toContain('exited before becoming ready');expect(visible(tree)).toContain('exit=3');expect(visible(tree)).toContain('last fixture line');
  });
  it('renders independent live loader/encoder/VAE fields and only available parameters',async()=>{
    await selectWorkflow();expect(walk(field('Model file · 1.unet_name')).filter(n=>n.type==='option').map(n=>n.props.value)).toEqual(['anima.safetensors','alternate.safetensors']);
    expect(field('Text encoder · 2.clip_name')).toBeTruthy();expect(field('VAE file · 3.vae_name')).toBeTruthy();
    expect(field('Positive prompt · 4.text').props.value).toBe('a tree');expect(field('Width · 5.width').props.step).toBe(64);
    expect(field('Negative prompt · 4.text')).toBeUndefined();expect(field('Seed · 6.seed').props.disabled).toBe(true);
    change('Model file · 1.unet_name','alternate.safetensors');change('Text encoder · 2.clip_name','second-encoder.safetensors');change('VAE file · 3.vae_name','other-vae.safetensors');
    await click('Queue generation');const request=vi.mocked(api.run).mock.calls[0][0];
    expect(request.slotValues).toMatchObject({'model:1:unet_name':'alternate.safetensors','model:2:clip_name':'second-encoder.safetensors','model:3:vae_name':'other-vae.safetensors'});
    expect(request).not.toHaveProperty('prompt');expect(request).not.toHaveProperty('graph');expect(request.analysisRevision).toBe('revision1');
  });
  it('passes model corrections back through re-analysis rather than bypassing blocks',async()=>{
    report.ok=false;report.issues=[{code:'missing-model',severity:'block',message:'Missing fixture model',nodeId:'1'}];
    await selectWorkflow();expect(button('Queue generation').props.disabled).toBe(true);
    change('Model file · 1.unet_name','alternate.safetensors');report.ok=true;report.issues=[];report.revision='revision2';await click('Analyze again');
    expect(api.refreshInventory).toHaveBeenCalledTimes(1);expect(api.analyzeWorkflow).toHaveBeenLastCalledWith('wf1',{'model:1:unet_name':'alternate.safetensors'});expect(button('Queue generation').props.disabled).toBe(false);
  });
  it('shows exact stale keys and removes only those keys after explicit confirmation',async()=>{
    workflows[0].savedValues={'width:5:width':1024,'positive:4:text':'keep my prompt'};await selectWorkflow();
    report.slots=report.slots.filter(slot=>slot.kind!=='width');report.ok=false;report.issues=[{code:'stale-slot',severity:'block',message:'Old branch width no longer exists'}];await click('Analyze again');
    expect(visible(tree)).toContain('width:5:width');expect(field('Positive prompt · 4.text').props.value).toBe('keep my prompt');expect(api.analyzeWorkflow).toHaveBeenLastCalledWith('wf1',{'width:5:width':1024,'positive:4:text':'keep my prompt'});
    report.ok=true;report.issues=[];await click('Clear obsolete parameters and analyze again');expect(api.analyzeWorkflow).toHaveBeenLastCalledWith('wf1',{'positive:4:text':'keep my prompt'});expect(field('Positive prompt · 4.text').props.value).toBe('keep my prompt');expect(button('Queue generation').props.disabled).toBe(false);
  });
  it('requires both custom-node fingerprint and unverified conversion consent, invalidated by fingerprint change',async()=>{
    report.thirdPartyFingerprint='fingerprint-A';report.thirdParty=[{classType:'CustomFixture',pythonModule:'custom_nodes.fixture',nodeIds:['9']}];report.unverifiedConversion=true;
    await selectWorkflow();expect(button('Queue generation').props.disabled).toBe(true);change('I trust this node list',true);expect(button('Queue generation').props.disabled).toBe(true);
    change('I accept the unverified UI workflow conversion',true);expect(button('Queue generation').props.disabled).toBe(false);
    report.thirdPartyFingerprint='fingerprint-B';await click('Analyze again');expect(field('I trust this node list').props.checked).toBe(false);expect(button('Queue generation').props.disabled).toBe(true);
  });
  it('never allows a cloud workflow, even if a disabled handler is invoked directly',async()=>{
    report.cloudNodes=[{nodeId:'9',classType:'CloudFixture'}];report.issues=[{code:'cloud-node',severity:'block',message:'fixture cloud blocked'}];report.ok=false;
    await selectWorkflow();expect(button('Queue generation').props.disabled).toBe(true);await click('Queue generation');expect(api.run).not.toHaveBeenCalled();expect(visible(tree)).toContain('cloud API nodes');
  });
  it('imports through dialogs or raw pasted JSON without sending an executable graph to run',async()=>{
    await click('Import JSON or image metadata');expect(api.importWorkflowFile).toHaveBeenCalledTimes(1);
    change('Workflow name','My local workflow');change('Paste JSON','{"1":{"class_type":"Fixture","inputs":{}}}');await click('Import pasted content');
    expect(api.importWorkflowJson).toHaveBeenCalledWith('{"1":{"class_type":"Fixture","inputs":{}}}','My local workflow');expect(field('Paste JSON').props.value).toBe('');expect(api.run).not.toHaveBeenCalled();
  });
  it('preserves the selected workflow when an import fails or is canceled',async()=>{
    await selectWorkflow();vi.mocked(api.importWorkflowFile).mockResolvedValueOnce(ok(null));await click('Import JSON or image metadata');expect(field('Rename workflow').props.value).toBe('Workflow wf1');
    vi.mocked(api.importWorkflowJson).mockResolvedValueOnce({ok:false,error:{code:'invalid-request',message:'fixture malformed JSON'}});change('Paste JSON','invalid fixture');await click('Import pasted content');
    expect(visible(tree)).toContain('fixture malformed JSON');expect(field('Paste JSON').props.value).toBe('invalid fixture');expect(field('Rename workflow').props.value).toBe('Workflow wf1');
  });
  it('renames and explicitly deletes workflow records without deleting images',async()=>{
    await selectWorkflow();change('Rename workflow','Renamed fixture');await click('Rename workflow');expect(api.renameWorkflow).toHaveBeenCalledWith('wf1','Renamed fixture');
    await click('Delete workflow');expect(api.deleteWorkflow).not.toHaveBeenCalled();await click('Delete');expect(api.deleteWorkflow).toHaveBeenCalledWith('wf1');expect(workflows).toEqual([]);
  });
  it('supports the three family filters without claiming their compatibility',()=>{
    const options=walk(field('Filter workflows')).filter(n=>n.type==='option').map(n=>n.props.value);expect(options).toEqual(['','moss-image','anima','krea2']);expect(visible(tree)).toContain('not proof of compatibility');
  });
  it('updates queue/progress, cancels only the selected run and renders node errors',async()=>{
    emit({type:'run',run:{...run,phase:'running',currentNode:{id:'6',classType:'KSampler'},progress:{value:2,max:10}}});render();
    expect(visible(tree)).toContain('Current node #6 KSampler');expect(nodes().find(n=>n.type==='progress')!.props.value).toBe(2);await click('Cancel job');expect(api.cancel).toHaveBeenCalledWith('run1');expect(visible(tree)).toContain(featureText('en-US','已取消'));
    emit({type:'run',run:{...run,phase:'failed',error:{code:'execution_error',message:'fixture execution failure',nodeErrors:[{nodeId:'6',classType:'KSampler',message:'fixture OOM',details:'fixture traceback'}]}}});render();expect(visible(tree)).toContain('Failed node #6 KSampler');expect(visible(tree)).toContain('fixture traceback');
  });
  it('previews saved results in the existing viewer and reuses actual fixed parameters',async()=>{
    emit({type:'results',results:[result]});render();await click('Preview result 1');expect(nodes().some(n=>n.type==='comfy-test-preview')).toBe(true);expect(nodes().find(n=>n.type==='comfy-test-preview')!.props.favoriteAction).toBe(null);
    await click('Close preview');await click('Reuse parameters');expect(api.reuseResult).toHaveBeenCalledWith('result1');expect(field('Positive prompt · 4.text').props.value).toBe('a saved tree');expect(field('Randomize seed each run').props.checked).toBe(false);
    await click('Queue generation');expect(vi.mocked(api.run).mock.calls.at(-1)![0]).toMatchObject({seedMode:'fixed',slotValues:{'seed:6:seed':42}});
  });
  it('omits explicit seed slots in random mode and sends no workflow graph',async()=>{
    workflows[0].savedValues={'seed:6:seed':123};await selectWorkflow();await click('Queue generation');
    const request=vi.mocked(api.run).mock.calls[0][0];expect(request.seedMode).toBe('random');expect(request.slotValues).not.toHaveProperty('seed:6:seed');expect(Object.keys(request).sort()).toEqual(['analysisRevision','confirmations','seedMode','slotValues','workflowId']);
  });
  it('saves only typed launch settings and connects to a loopback target',async()=>{
    expect(button('Choose output directory').props.disabled).toBe(true);
    emit({type:'snapshot',snapshot:{...snapshot,phase:'idle',owner:null}});render();change('Port','8199');change('Readiness timeout (seconds)','400');change('Extra launch arguments (safe allowlist)','--lowvram');await click('Save launch settings');
    expect(button('Choose output directory').props.disabled).toBe(false);
    expect(api.setLaunchOptions).toHaveBeenCalledWith({port:8199,readyTimeoutSec:400,disableApiNodes:true,safeMode:false,extraArgs:['--lowvram']});expect(api.setConnection).toHaveBeenCalledWith({host:'127.0.0.1',port:8199});
    await click('Connect to running instance');expect(api.connect).toHaveBeenCalledTimes(1);expect(api.start).not.toHaveBeenCalled();
  });
  it('rejects invalid launch fields before calling the main process',async()=>{
    emit({type:'snapshot',snapshot:{...snapshot,phase:'idle',owner:null}});render();change('Port','70000');await click('Save launch settings');expect(api.setLaunchOptions).not.toHaveBeenCalled();expect(visible(tree)).toContain('Port must be an integer');
  });
  it('unsubscribes events and timers on unmount',()=>{harness.reset();expect(unsubscribe).toHaveBeenCalledTimes(1);});
});
