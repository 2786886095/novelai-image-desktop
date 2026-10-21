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
vi.mock('./components/ui',()=>({Button:'button',AppPortal:'comfy-test-portal',SelectMenuCompat:'comfy-test-select'}));
vi.mock('./components/PreviewImageViewer',()=>({PreviewImageViewer:'comfy-test-preview'}));
vi.mock('./components/icons',()=>({Icon:'comfy-test-icon'}));
import ComfyLocalTool,{comfyElapsed,comfyStudioLayout} from './ComfyLocalTool';
import ToolsHub from './ToolsHub';
import {featureText} from './feature-text';
import type {ComfyLocalApi,ComfyAnalysis,ComfyLocalConfig,ComfySnapshot,ComfyWorkflowSummary,ComfyRunSnapshot,ComfyResultItem,ComfyResponse,ComfyEvent,ComfyStateBundle} from './comfyui/contract';
import {COMFY_WORKSPACE_DRAFTS_KEY,type ComfyWorkspaceDraft} from './comfyui/workspace-drafts';

type Node=ReactElement<Record<string,any>>;
let tree:Node;
function walk(v:unknown):Node[]{
  if(Array.isArray(v))return v.flatMap(walk);
  if(!v||typeof v!=='object'||!('props'in v))return [];
  const node=v as Node;
  // Only render explicitly pure children. ComfyTaskThumbnail owns hooks, so it
  // must remain opaque rather than consuming the parent hook cursor.
  if(typeof node.type==='function'&&['Field','SlotInput','ComfyTaskCard'].includes(node.type.name))return [node,...walk((node.type as (p:unknown)=>unknown)(node.props))];
  return [node,...walk(node.props.children)];
}
function visible(v:unknown):string{if(typeof v==='string'||typeof v==='number')return String(v);if(Array.isArray(v))return v.map(visible).join(' ');if(!v||typeof v!=='object'||!('props'in v))return '';const node=v as Node;return typeof node.type==='function'&&node.type.name==='ComfyTaskCard'?visible((node.type as (p:unknown)=>unknown)(node.props)):visible(node.props.children);}
function render(){if(typeof document!=='undefined'){document.addEventListener??=vi.fn();document.removeEventListener??=vi.fn();}harness.begin();tree=ComfyLocalTool({onBack:vi.fn()}) as Node;harness.flush();return tree;}
async function settle(){for(let i=0;i<20;i++)await Promise.resolve();render();for(let i=0;i<20;i++)await Promise.resolve();render();}
const nodes=()=>walk(tree);
// The selected split-studio design moves controls into real menus/tabs. This
// navigation helper invokes those actual handlers; it never calls bridge APIs,
// creates fake controls, mutates product state slots, or changes expected effects.
const translated=(key:string)=>featureText(harness.store.settings.language,key);
const oldActionKeys:Record<string,string>={
  'Queue generation':'生成','Analysis report':'分析报告与工作流管理',
  'Runtime logs':'查看运行日志','Connect to running instance':'连接',
  [featureText('en-US','刷新任务与结果')]:'刷新工作台',
  'Preview result 1':'全屏预览',
};
function rawButton(label:string){
  const resolved=oldActionKeys[label]?translated(oldActionKeys[label]):label;
  return nodes().find(n=>n.type==='button'&&(visible(n.props.children).trim()===resolved||n.props['aria-label']===resolved));
}
function nav(key:string){const n=rawButton(translated(key));if(n){n.props.onClick();render();}return Boolean(n);}
function showLibrary(){if(!nodes().some(n=>n.props['data-comfy-region']==='library'))nav('选择工作流');}
function showEnvironment(){
  if(!nodes().some(n=>n.props['data-comfy-drawer']==='environment')){if(!rawButton(translated('环境设置')))nav('服务菜单');nav('环境设置');}
}
function toggleDetails(attribute:string,open=true){const details=nodes().find(n=>n.type==='details'&&n.props[attribute]);if(details&&Boolean(details.props.open)!==open){details.props.onToggle?.({currentTarget:{open}});render();}return details;}
function showExpert(){showEnvironment();toggleDetails('data-comfy-advanced');}
function showConnection(){showEnvironment();toggleDetails('data-comfy-env-connection');}
const environmentPrimary=()=>nodes().find(n=>n.props['data-comfy-env-primary'])!;
function button(label:string):Node{
  // Reveal actual native disclosure handlers before invoking a control inside.
  // No obsolete tab or synthetic control is needed by the guided page.
  if(['Choose Python','Choose output directory','Save launch settings',featureText('en-US','重新检测')].includes(label))showExpert();
  if(label==='Connect to running instance')showConnection();
  let found=rawButton(label);if(found)return found;
  if(label==='Choose ComfyUI directory'||label==='Choose Python interpreter'){showEnvironment();}
  else if(['Import JSON or image metadata','Import pasted content'].includes(label)){showLibrary();}
  else if(label===featureText('en-US','刷新任务与结果')||label==='Analysis report'){nav('更多操作');}
  else if(['Environment settings','Runtime logs','Start local ComfyUI','Stop service started by this app','Disconnect',featureText('en-US','打开 ComfyUI 网页')].includes(label)){nav('服务菜单');}
  found=rawButton(label);return found!;
}
function field(label:string):Node{
  const plain=label.split(' · ')[0];
  const human=plain==='Model file'?translated('主模型'):plain;
  const existing=nodes().find(n=>n.props['aria-label']===label||n.props['aria-label']===human);if(existing)return existing;
  if(['Port','Readiness timeout (seconds)','Extra launch arguments (safe allowlist)','Automatically select an available port',featureText('en-US','安全模式（禁用第三方节点）')].includes(label))showExpert();
  if(['Search workflows','Workflow name','Paste JSON'].includes(label))showLibrary();
  return nodes().find(n=>n.props['aria-label']===label||n.props['aria-label']===human)!;
}
async function click(text:string){button(text).props.onClick();await settle();}
function change(label:string,value:string|boolean){if(label==='Filter workflows'){showLibrary();nav(value==='moss-image'?'MOSS-Image':value==='anima'?'Anima':value==='krea2'?'Krea2':'全部');return;}const node=field(label);node.props.onChange({target:typeof value==='boolean'?{checked:value}:{value}});render();}

function eventRegistry(){
  const callbacks=new Map<string,Set<(event:Record<string,unknown>)=>void>>();
  const listeners=new Map<string,(event:Record<string,unknown>)=>void>();
  return {listeners,addEventListener(type:string,callback:(event:Record<string,unknown>)=>void){const group=callbacks.get(type)??new Set();group.add(callback);callbacks.set(type,group);listeners.set(type,event=>{for(const fn of [...group])fn(event);});},removeEventListener(type:string,callback:(event:Record<string,unknown>)=>void){const group=callbacks.get(type);group?.delete(callback);if(!group?.size){callbacks.delete(type);listeners.delete(type);}}};
}
function seedPages(count=65){for(let i=0;i<count;i++)emit({type:'run',run:{...run,runId:`page-job-${i}`,phase:'completed'}});emit({type:'results',results:Array.from({length:count},(_,i)=>({...result,id:`page-result-${i}`}))});render();}

afterEach(()=>{harness.reset();vi.unstubAllGlobals();vi.useRealTimers();});

const ok=<T,>(data:T):ComfyResponse<T>=>({ok:true,data});
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};}
const parameterText=()=>visible(walk(nodes().find(node=>node.props['data-comfy-region']==='parameters')));
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
    saveWorkflowValues:vi.fn(async(id,values)=>{workflows=workflows.map(item=>item.id===id?{...item,savedValues:structuredClone(values),updatedAt:'2026-10-21T00:00:00Z'}:item);return ok(workflows.find(item=>item.id===id)!);}),
    saveWorkflowAs:vi.fn(async(id,name,values)=>{const copied={...workflows.find(item=>item.id===id)!,id:'wf-copy',name,savedValues:structuredClone(values),updatedAt:'2026-10-21T00:00:00Z'};workflows=[copied,...workflows];return ok(copied);}),
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
async function selectWorkflow(id='wf1'){showLibrary();nodes().find(n=>n.type==='button'&&n.props.className==='comfy-local-workflow'&&visible(n.props.children).includes(`Workflow ${id}`))!.props.onClick();await settle();}
function taskCard(runId:string){return nodes().find(n=>n.props['data-comfy-task-card']&&n.props['data-comfy-run-id']===runId)!;}
function expandTask(runId:string){nav('任务记录');const toggle=walk(taskCard(runId)).find(n=>n.props['data-comfy-task-toggle'])!;if(!toggle.props['aria-expanded']){toggle.props.onClick();render();}return taskCard(runId);}

describe('local ComfyUI actual frontend handlers (typed protocol fixtures, not native GUI)',()=>{
  it('does not start, connect or run on mount; missing bridge is safe and its card hidden',()=>{
    expect(api.getState).toHaveBeenCalledTimes(1);expect(api.start).not.toHaveBeenCalled();expect(api.connect).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
    harness.reset();(window as {naiComfy?:ComfyLocalApi}).naiComfy=undefined;render();expect(visible(tree)).toContain('bridge is unavailable');
    harness.reset();harness.begin();tree=ToolsHub() as Node;harness.flush();expect(visible(tree)).not.toContain('Local ComfyUI');
  });
  it('shows the native tool card when the dedicated bridge exists',()=>{
    harness.reset();harness.begin();tree=ToolsHub() as Node;harness.flush();expect(visible(tree)).toContain('Local ComfyUI');
  });
  it('parameter workbench has balanced create regions with explicit library and independent works/tasks views',()=>{
    for(const region of ['environment','parameters','canvas'])expect(nodes().some(n=>n.props['data-comfy-region']===region),region).toBe(true);expect(nodes().some(n=>n.props['data-comfy-region']==='library'||n.props['data-comfy-region']==='dock')).toBe(false);for(const key of ['创作','作品库','任务记录'])expect(rawButton(translated(key))).toBeTruthy();showLibrary();expect(nodes().some(n=>n.props['data-comfy-region']==='library')).toBe(true);
    expect(button('Environment settings')).toBeTruthy();expect(button('Runtime logs')).toBeTruthy();
    expect(api.run).not.toHaveBeenCalled();
  });
  it('parameter workbench keeps three builtin recipes selectable before service analysis and filters by stable builtin identity',async()=>{
    harness.reset();snapshot={...snapshot,phase:'idle',owner:null};workflows=[workflowFixture('builtin-local-1-v1'),workflowFixture('builtin-local-2-v1'),workflowFixture('builtin-local-3-v1')].map((w,i)=>({...w,name:['MOSS starter','Anima starter','Krea starter'][i],familyLabel:null}));render();await settle();showLibrary();
    expect(visible(tree)).toContain('Starter recipes');expect(visible(tree)).toContain('MOSS starter');expect(visible(tree)).toContain('Anima starter');expect(visible(tree)).toContain('Krea starter');
    change('Filter workflows','moss-image');expect(visible(tree)).toContain('MOSS starter');expect(visible(tree)).not.toContain('Anima starter');
    const item=nodes().find(n=>n.type==='button'&&n.props.className==='comfy-local-workflow'&&visible(n.props.children).includes('MOSS starter'))!;item.props.onClick();await settle();
    expect(api.analyzeWorkflow).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();expect(visible(tree)).toContain(translated('连接后读取真实模型清单和可调参数，不会按模型家族自动替换。'));
  });
  it('parameter workbench searches the workflow library without mutating stored workflow names',async()=>{
    workflows.push({...workflowFixture('wf2'),name:'Other landscape'});emit({type:'workflows',workflows});render();
    change('Search workflows','landscape');expect(visible(tree)).toContain('Other landscape');expect(visible(tree)).not.toContain('Workflow wf1');expect(api.renameWorkflow).not.toHaveBeenCalled();
  });
  it('parameter workbench opens environment and log drawers without starting external code',async()=>{
    const drawer=()=>nodes().find(n=>n.props['data-comfy-drawer']==='environment')!;
    expect(drawer()).toBeUndefined();await click('Environment settings');expect(drawer().props.hidden).toBe(false);
    await click('Close environment settings');expect(drawer()).toBeUndefined();await click('Runtime logs');expect(nodes().find(n=>n.props['data-comfy-drawer']==='logs')!.props.hidden).toBe(false);
    expect(api.start).not.toHaveBeenCalled();expect(api.connect).not.toHaveBeenCalled();expect(api.choosePython).not.toHaveBeenCalled();
  });
  it('drawer diagnostics correction places real drawers and backdrop inside the existing portal',async()=>{
    await click('Environment settings');const portal=nodes().find(n=>n.type==='comfy-test-portal'&&walk(n).some(child=>child.props['data-comfy-drawer']==='environment'));expect(portal).toBeTruthy();expect(walk(portal).filter(n=>n.props['data-comfy-drawer'])).toHaveLength(1);
  });
  it('python setup flow disables Python before directory selection and explains the required order',async()=>{
    harness.reset();config={...config,install:null};snapshot={...snapshot,phase:'idle',owner:null};render();await settle();
    expect(button('Choose Python').props.disabled).toBe(true);
    expect(visible(tree)).toContain('Choose the ComfyUI directory first, then choose Python.');
    expect(api.choosePython).not.toHaveBeenCalled();expect(api.chooseInstallDirectory).not.toHaveBeenCalled();
  });
  it('python setup flow keeps Python disabled when the directory picker is cancelled',async()=>{
    harness.reset();config={...config,install:null};snapshot={...snapshot,phase:'idle',owner:null};render();await settle();
    vi.mocked(api.chooseInstallDirectory).mockResolvedValueOnce(ok(null));await click('Choose ComfyUI directory');
    expect(button('Choose Python').props.disabled).toBe(true);
    expect(visible(tree)).toContain('Choose the ComfyUI directory first, then choose Python.');expect(api.choosePython).not.toHaveBeenCalled();
  });
  it('python setup flow enables Python with a failed probe and no interpreter after directory selection',async()=>{
    const configured=structuredClone(config);configured.install={...configured.install!,python:'',pythonVersion:null,helpProbe:'failed',helpProbeMessage:'fixture probe failed before interpreter selection'};harness.reset();config={...config,install:null};snapshot={...snapshot,phase:'idle',owner:null};render();await settle();
    vi.mocked(api.chooseInstallDirectory).mockResolvedValueOnce(ok(configured));await click('Choose ComfyUI directory');
    expect(button('Choose Python').props.disabled).toBe(false);expect(visible(tree)).toContain(configured.install!.root);expect(api.choosePython).not.toHaveBeenCalled();
    vi.mocked(api.choosePython).mockResolvedValueOnce(ok(null));await click('Choose Python');
    expect(api.choosePython).toHaveBeenCalledTimes(1);expect(button('Choose Python').props.disabled).toBe(false);expect(visible(tree)).toContain(configured.install!.root);
    expect(api.start).not.toHaveBeenCalled();expect(api.connect).not.toHaveBeenCalled();
  });
  it('python setup flow maps a backend not-configured response to a friendly order hint',async()=>{
    emit({type:'snapshot',snapshot:{...snapshot,phase:'idle',owner:null}});render();
    await click('Environment settings');
    vi.mocked(api.choosePython).mockResolvedValueOnce({ok:false,error:{code:'not-configured',message:'COMFY_NOT_CONFIGURED'}});await click('Choose Python');
    expect(api.choosePython).toHaveBeenCalledTimes(1);
    const alert=nodes().find(n=>n.props.role==='alert');expect(alert).toBeTruthy();
    expect(visible(alert!.props.children)).toContain('Choose the ComfyUI directory first, then choose Python.');
    expect(visible(alert!.props.children)).not.toMatch(/^\[not-configured\]/);
  });
  it('python setup flow blocks a stale Python handler before a directory is configured',async()=>{
    harness.reset();config={...config,install:null};snapshot={...snapshot,phase:'idle',owner:null};render();await settle();
    // Deliberately invoke the real handler directly, bypassing native disabled-button behavior.
    await click('Choose Python');expect(api.choosePython).not.toHaveBeenCalled();
    expect(visible(tree)).toContain('Choose the ComfyUI directory first, then choose Python.');
  });
  it('uses real state timestamps while starting and only says ready after a ready event',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));nav('服务菜单');
    emit({type:'snapshot',snapshot:{...snapshot,phase:'starting',owner:'app',stage:'waiting-http',startedAt:'2026-10-20T00:00:00Z'}});render();expect(visible(tree)).toContain('Starting');
    await vi.advanceTimersByTimeAsync(12000);render();expect(visible(tree)).toContain('00:12');expect(visible(tree)).not.toContain('Ready · external instance');
    emit({type:'snapshot',snapshot:{...snapshot,phase:'ready',owner:'app'}});render();expect(button('Stop service started by this app')).toBeTruthy();
    await click('Stop service started by this app');expect(api.stop).toHaveBeenCalledWith({interruptRunning:true});expect(visible(tree)).toContain('Stopped');
    expect(comfyElapsed(undefined,0)).toBe('00:00');expect(comfyElapsed(0,65000)).toBe('01:05');
  });
  it('disconnects an external service without invoking stop',async()=>{
    nav('服务菜单');expect(visible(tree)).toContain('Ready · external instance');await click('Disconnect');expect(api.disconnect).toHaveBeenCalledTimes(1);expect(api.stop).not.toHaveBeenCalled();
  });
  it('shows failure cause, literal diagnostics and bounded logs',async()=>{
    emit({type:'snapshot',snapshot:{...snapshot,phase:'failed',failure:{code:'exited-early',message:'fixture process exit',exitCode:3,signal:null,logTail:['last fixture line'],at:'2026-10-20T00:00:00Z'}}});render();
    await click('Runtime logs');
    expect(visible(tree)).toContain('exited before becoming ready');expect(visible(tree)).toContain('exit=3');expect(visible(tree)).toContain('last fixture line');
  });
  it('renders independent live loader/encoder/VAE fields and only available parameters',async()=>{
    await selectWorkflow();expect(walk(field('Model file · 1.unet_name')).filter(n=>n.type==='option').map(n=>n.props.value)).toEqual(['anima.safetensors','alternate.safetensors']);
    expect(field('Text encoder · 2.clip_name')).toBeTruthy();expect(field('VAE file · 3.vae_name')).toBeTruthy();
    expect(field('Positive prompt · 4.text').props.value).toBe('a tree');expect(field('Width · 5.width').props.step).toBe(64);
    expect(field('Negative prompt · 4.text')).toBeUndefined();expect(field('Seed · 6.seed')).toBeUndefined();expect(visible(tree)).toContain(translated('每次随机'));
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
  it('schema recovery keeps rejected analysis in a persistent error state without automatic retries',async()=>{
    vi.useFakeTimers();vi.mocked(api.analyzeWorkflow).mockRejectedValueOnce(new Error('fixture schema rejection'));
    await selectWorkflow();expect(parameterText()).toContain('fixture schema rejection');expect(parameterText()).toContain(translated('工作流分析失败'));
    expect(parameterText()).not.toContain(translated('正在分析工作流'));expect(parameterText()).not.toContain(translated('正在读取本机参数…'));
    expect(button('Queue generation').props.disabled).toBe(true);expect(button('Analyze again').props.disabled).toBe(false);
    await click(translated('关闭提示'));expect(parameterText()).toContain('fixture schema rejection');
    await vi.advanceTimersByTimeAsync(10000);await settle();expect(api.analyzeWorkflow).toHaveBeenCalledTimes(1);expect(api.run).not.toHaveBeenCalled();
  });
  it('schema recovery treats an error envelope as error rather than a loading or ready report',async()=>{
    vi.mocked(api.analyzeWorkflow).mockResolvedValueOnce({ok:false,error:{code:'invalid-request',message:'fixture catalog unavailable'}});
    await selectWorkflow();expect(parameterText()).toContain('fixture catalog unavailable');expect(nodes().find(n=>n.props['data-comfy-analysis-state']==='error')).toBeTruthy();expect(button('Queue generation').props.disabled).toBe(true);
  });
  it('schema recovery invalidates the old report on refresh failure and preserves inputs for explicit retry',async()=>{
    await selectWorkflow();change('Positive prompt · 4.text','retry preserves this prompt');change('Model file · 1.unet_name','alternate.safetensors');
    vi.mocked(api.refreshInventory).mockRejectedValueOnce(new Error('fixture refresh failure'));await click('Analyze again');
    expect(parameterText()).toContain('fixture refresh failure');expect(button('Queue generation').props.disabled).toBe(true);expect(api.analyzeWorkflow).toHaveBeenCalledTimes(1);
    await click('Analyze again');expect(api.refreshInventory).toHaveBeenCalledTimes(2);expect(api.analyzeWorkflow).toHaveBeenLastCalledWith('wf1',{'positive:4:text':'retry preserves this prompt','model:1:unet_name':'alternate.safetensors'});
    expect(field('Positive prompt · 4.text').props.value).toBe('retry preserves this prompt');expect(parameterText()).not.toContain('fixture refresh failure');expect(button('Queue generation').props.disabled).toBe(false);
  });
  it.each(['resolve','reject'] as const)('schema recovery discards stale analysis %s after switching workflows',async outcome=>{
    workflows.push(workflowFixture('wf2'));emit({type:'workflows',workflows});render();showLibrary();
    const choose=(id:string)=>nodes().find(n=>n.type==='button'&&n.props.className==='comfy-local-workflow'&&visible(n.props.children).includes(`Workflow ${id}`))!;
    const chooseA=choose('wf1'),chooseB=choose('wf2'),old=deferred<ComfyResponse<ComfyAnalysis>>();
    const next=structuredClone(report);next.slots.find(slot=>slot.kind==='positive')!.defaultValue='new workflow prompt';
    vi.mocked(api.analyzeWorkflow).mockImplementationOnce(()=>old.promise).mockResolvedValueOnce(ok(next));
    // Invoke captured real selection handlers to cover queued rapid selections;
    // no hook state or product internals are changed by the test.
    chooseA.props.onClick();render();chooseB.props.onClick();await settle();expect(field('Positive prompt · 4.text').props.value).toBe('new workflow prompt');
    if(outcome==='resolve')old.resolve(ok(report));else old.reject(new Error('stale workflow rejection'));
    await settle();expect(field('Positive prompt · 4.text').props.value).toBe('new workflow prompt');expect(visible(tree)).not.toContain('stale workflow rejection');expect(button('Queue generation').props.disabled).toBe(false);expect(api.analyzeWorkflow).toHaveBeenCalledTimes(2);
  });
  it('schema recovery clears a failed workflow when another workflow is selected',async()=>{
    workflows.push(workflowFixture('wf2'));emit({type:'workflows',workflows});render();vi.mocked(api.analyzeWorkflow).mockRejectedValueOnce(new Error('old selected workflow failure'));
    await selectWorkflow('wf1');expect(parameterText()).toContain('old selected workflow failure');await selectWorkflow('wf2');
    expect(parameterText()).not.toContain('old selected workflow failure');expect(visible(tree)).not.toContain('old selected workflow failure');expect(button('Queue generation').props.disabled).toBe(false);
  });
  it('schema recovery renders a blocking report as ready and keeps its issue navigation usable',async()=>{
    report.ok=false;report.issues=[{code:'missing-node-type',severity:'block',message:'fixture missing node',nodeId:'99',classType:'MissingFixture'}];
    await selectWorkflow();expect(parameterText()).toContain('fixture missing node');expect(parameterText()).not.toContain(translated('工作流分析失败'));expect(button('Queue generation').props.disabled).toBe(true);
    await click(translated('定位问题'));expect(nodes().find(n=>n.props['data-comfy-drawer']==='analysis')).toBeTruthy();expect(visible(tree)).toContain('missing-node');
  });
  it('schema recovery analyzes an offline selection exactly once per ready transition',async()=>{
    harness.reset();snapshot={...snapshot,phase:'idle',owner:null};render();await settle();await selectWorkflow();
    expect(api.analyzeWorkflow).not.toHaveBeenCalled();expect(parameterText()).not.toContain(translated('正在分析工作流'));expect(parameterText()).toContain(translated('先连接本地 ComfyUI'));
    emit({type:'snapshot',snapshot:{...snapshot,phase:'ready',owner:'external'}});await settle();expect(api.analyzeWorkflow).toHaveBeenCalledTimes(1);
    emit({type:'snapshot',snapshot:{...snapshot,phase:'ready',owner:'external'}});await settle();expect(api.analyzeWorkflow).toHaveBeenCalledTimes(1);
    emit({type:'snapshot',snapshot:{...snapshot,phase:'idle',owner:null}});await settle();expect(button('Queue generation').props.disabled).toBe(true);expect(parameterText()).toContain(translated('先连接本地 ComfyUI'));
    emit({type:'snapshot',snapshot:{...snapshot,phase:'ready',owner:'external'}});await settle();expect(api.analyzeWorkflow).toHaveBeenCalledTimes(2);expect(button('Queue generation').props.disabled).toBe(false);
  });
  it('schema recovery discards a disconnected in-flight failure and analyzes once after reconnect',async()=>{
    const old=deferred<ComfyResponse<ComfyAnalysis>>();vi.mocked(api.analyzeWorkflow).mockImplementationOnce(()=>old.promise);await selectWorkflow();
    emit({type:'snapshot',snapshot:{...snapshot,phase:'idle',owner:null}});await settle();old.reject(new Error('disconnected stale failure'));await settle();
    expect(visible(tree)).not.toContain('disconnected stale failure');expect(parameterText()).not.toContain(translated('正在分析工作流'));
    emit({type:'snapshot',snapshot:{...snapshot,phase:'ready',owner:'external'}});await settle();expect(api.analyzeWorkflow).toHaveBeenCalledTimes(2);expect(button('Queue generation').props.disabled).toBe(false);
  });
  it('schema recovery maps boolean and numeric combo tokens back to their original scalar values',async()=>{
    report.slots.push({id:'parameter:9:clamp',kind:'parameter',nodeId:'9',input:'clamp',classType:'Color Correct (mtb)',label:'clamp',valueType:'combo',defaultValue:true,options:[true,false]},
      {id:'parameter:10:choice',kind:'parameter',nodeId:'10',input:'choice',classType:'NumericFixture',label:'numeric choice',valueType:'combo',defaultValue:0,options:[0,1]});
    await selectWorkflow();change('clamp','combo:1');change('numeric choice','combo:1');await click('Queue generation');
    const request=vi.mocked(api.run).mock.calls[0][0];expect(request.slotValues['parameter:9:clamp']).toBe(false);expect(typeof request.slotValues['parameter:9:clamp']).toBe('boolean');expect(request.slotValues['parameter:10:choice']).toBe(1);expect(typeof request.slotValues['parameter:10:choice']).toBe('number');
  });
  it('schema recovery keeps mixed scalar combo choices distinct without string coercion',async()=>{
    report.slots.push({id:'parameter:9:choice',kind:'parameter',nodeId:'9',input:'choice',classType:'MixedFixture',label:'mixed choice',valueType:'combo',defaultValue:false,options:[false,'false',0,'0']});
    await selectWorkflow();for(const [index,expected]of [false,'false',0,'0'].entries()){
      change('mixed choice',`combo:${index}`);await click('Analyze again');expect(vi.mocked(api.analyzeWorkflow).mock.calls.at(-1)![1]!['parameter:9:choice']).toBe(expected);
    }
  });
  it('schema recovery blocks saved values with the wrong scalar type until explicitly restored to default',async()=>{
    const slotId='parameter:9:clamp';report.slots.push({id:slotId,kind:'parameter',nodeId:'9',input:'clamp',classType:'Color Correct (mtb)',label:'clamp',valueType:'combo',defaultValue:true,options:[true,false]});
    workflows[0].savedValues={[slotId]:'true'};await selectWorkflow();expect(api.analyzeWorkflow).toHaveBeenLastCalledWith('wf1',{[slotId]:'true'});expect(field('clamp').props.value).not.toBe('combo:0');
    expect(parameterText()).toContain('string: true');expect(button('Queue generation').props.disabled).toBe(true);expect(button(translated('恢复默认')).props.disabled).toBe(false);expect(api.analyzeWorkflow).toHaveBeenCalledTimes(1);
    await click('Queue generation');expect(api.run).not.toHaveBeenCalled();expect(api.analyzeWorkflow).toHaveBeenLastCalledWith('wf1',{[slotId]:'true'});
    await click(translated('恢复默认'));expect(api.analyzeWorkflow).toHaveBeenLastCalledWith('wf1',{});expect(field('clamp').props.value).toBe('combo:0');expect(button('Queue generation').props.disabled).toBe(false);expect(api.run).not.toHaveBeenCalled();
  });
  it('schema recovery displays unused schema diagnostics only as collapsible environment information',async()=>{
    report.schemaDiagnostics={total:2,items:[{classType:'UnusedFixture',displayName:'Unused fixture node',input:'complex',code:'combo-option-schema',detail:'fixture unsupported schema detail'}],truncated:true};
    await selectWorkflow();expect(visible(tree)).not.toContain('fixture unsupported schema detail');expect(button('Queue generation').props.disabled).toBe(false);await click('Environment settings');
    const diagnostic=nodes().find(n=>n.props['data-comfy-schema-diagnostics'])!;expect(diagnostic.type).toBe('details');expect(diagnostic.props.open).not.toBe(true);expect(visible(diagnostic)).toContain('Unused fixture node');expect(visible(diagnostic)).toContain('fixture unsupported schema detail');
    expect(walk(diagnostic).some(n=>n.props.role==='alert'||n.props['data-kind']==='error')).toBe(false);expect(parameterText()).not.toContain('fixture unsupported schema detail');expect(button('Queue generation').props.disabled).toBe(false);
  });
  it('shows exact stale keys and removes only those keys after explicit confirmation',async()=>{
    workflows[0].savedValues={'width:5:width':1024,'positive:4:text':'keep my prompt'};await selectWorkflow();
    report.slots=report.slots.filter(slot=>slot.kind!=='width');report.ok=false;report.issues=[{code:'stale-slot',severity:'block',message:'Old branch width no longer exists'}];await click('Analyze again');
    await click('Analysis report');
    expect(visible(tree)).toContain('width:5:width');expect(field('Positive prompt · 4.text').props.value).toBe('keep my prompt');expect(api.analyzeWorkflow).toHaveBeenLastCalledWith('wf1',{'width:5:width':1024,'positive:4:text':'keep my prompt'});
    report.ok=true;report.issues=[];await click('Clear obsolete parameters and analyze again');expect(api.analyzeWorkflow).toHaveBeenLastCalledWith('wf1',{'positive:4:text':'keep my prompt'});expect(field('Positive prompt · 4.text').props.value).toBe('keep my prompt');expect(button('Queue generation').props.disabled).toBe(false);
  });
  it('requires both custom-node fingerprint and unverified conversion consent, invalidated by fingerprint change',async()=>{
    report.thirdPartyFingerprint='fingerprint-A';report.thirdParty=[{classType:'CustomFixture',pythonModule:'custom_nodes.fixture',nodeIds:['9']}];report.unverifiedConversion=true;
    await selectWorkflow();await click('Analysis report');expect(button('Queue generation').props.disabled).toBe(true);change('I trust this node list',true);expect(button('Queue generation').props.disabled).toBe(true);
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
    await selectWorkflow();vi.mocked(api.importWorkflowFile).mockResolvedValueOnce(ok(null));await click('Import JSON or image metadata');expect(visible(rawButton(translated('选择工作流')))).toContain('Workflow wf1');
    vi.mocked(api.importWorkflowJson).mockResolvedValueOnce({ok:false,error:{code:'invalid-request',message:'fixture malformed JSON'}});change('Paste JSON','invalid fixture');await click('Import pasted content');
    expect(visible(tree)).toContain('fixture malformed JSON');expect(field('Paste JSON').props.value).toBe('invalid fixture');expect(visible(rawButton(translated('选择工作流')))).toContain('Workflow wf1');
  });
  it('renames and explicitly deletes workflow records without deleting images',async()=>{
    await selectWorkflow();await click('Analysis report');change('Rename workflow','Renamed fixture');await click('Rename workflow');expect(api.renameWorkflow).toHaveBeenCalledWith('wf1','Renamed fixture');
    await click('Delete workflow');expect(api.deleteWorkflow).not.toHaveBeenCalled();await click('Delete');expect(api.deleteWorkflow).toHaveBeenCalledWith('wf1');expect(workflows).toEqual([]);
  });
  it('supports the three family filters without claiming their compatibility',()=>{
    showLibrary();const group=nodes().find(n=>n.props.className==='comfy-studio-family-filter')!;expect(walk(group).filter(n=>n.type==='button').map(n=>visible(n.props.children))).toEqual([translated('全部'),'MOSS-Image','Anima','Krea2',translated('其他')]);expect(visible(tree)).toContain(translated('家族仅用于筛选，是否可运行以本机分析为准。'));
  });
  it('prevents a second active task by replacing submit with current-task controls',async()=>{
    await selectWorkflow();emit({type:'snapshot',snapshot:{...snapshot,activeRun:{...run,phase:'running'}}});render();expect(button('Queue generation')).toBeUndefined();expect(button('Cancel job')).toBeTruthy();const before=vi.mocked(api.analyzeWorkflow).mock.calls.length;nav('作品库');nav('创作');expect(button('Queue generation')).toBeUndefined();expect(api.run).not.toHaveBeenCalled();expect(api.analyzeWorkflow).toHaveBeenCalledTimes(before);
  });
  it('updates queue/progress, cancels only the selected run and renders node errors',async()=>{
    emit({type:'snapshot',snapshot:{...snapshot,activeRun:{...run,phase:'running',currentNode:{id:'6',classType:'KSampler'},progress:{value:2,max:10}}}});render();
    expect(nodes().find(n=>n.type==='progress')!.props.value).toBe(2);await click('Cancel job');expect(api.cancel).toHaveBeenCalledWith('run1');expect(visible(tree)).toContain(featureText('en-US','已取消'));
    emit({type:'run',run:{...run,phase:'failed',error:{code:'execution_error',message:'fixture execution failure',nodeErrors:[{nodeId:'6',classType:'KSampler',message:'fixture OOM',details:'fixture traceback'}]}}});render();expandTask('run1');expect(visible(tree)).toContain('Failed node #6 KSampler');expect(visible(tree)).toContain('fixture traceback');
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
    await click('Environment settings');
    expect(button('Choose output directory').props.disabled).toBe(true);
    emit({type:'snapshot',snapshot:{...snapshot,phase:'idle',owner:null}});render();change('Port','8199');change('Readiness timeout (seconds)','400');change('Extra launch arguments (safe allowlist)','--lowvram');await click('Save launch settings');
    expect(button('Choose output directory').props.disabled).toBe(false);
    expect(api.setLaunchOptions).toHaveBeenCalledWith({port:8199,portMode:'manual',readyTimeoutSec:400,disableApiNodes:true,safeMode:false,extraArgs:['--lowvram']});expect(api.setConnection).toHaveBeenCalledWith({host:'127.0.0.1',port:8199});
    await click('Connect to running instance');expect(api.connect).toHaveBeenCalledTimes(1);expect(api.start).not.toHaveBeenCalled();
  });
  it('rejects invalid launch fields before calling the main process',async()=>{
    emit({type:'snapshot',snapshot:{...snapshot,phase:'idle',owner:null}});render();await click('Environment settings');change('Port','70000');await click('Save launch settings');expect(api.setLaunchOptions).not.toHaveBeenCalled();expect(visible(tree)).toContain('Port must be an integer');
  });
  it('unsubscribes events and timers on unmount',()=>{harness.reset();expect(unsubscribe).toHaveBeenCalledTimes(1);});
  it('uses only themed selects and preserves library selection when its explicit navigation is collapsed',async()=>{
    await selectWorkflow();change('Positive prompt · 4.text','keep this local draft');
    const toggle=()=>rawButton(translated('选择工作流'))!;
    expect(toggle().props['aria-expanded']).toBe(false);expect(toggle().props['aria-controls']).toBe('comfy-library-content');
    await click(translated('选择工作流'));expect(toggle().props['aria-expanded']).toBe(true);expect(nodes().find(n=>n.props.id==='comfy-library-content')).toBeTruthy();
    await click(translated('选择工作流'));expect(toggle().props['aria-expanded']).toBe(false);expect(nodes().find(n=>n.props.id==='comfy-library-content')).toBeUndefined();expect(field('Positive prompt · 4.text').props.value).toBe('keep this local draft');
    expect(nodes().filter(n=>n.type==='select')).toHaveLength(0);
  });
  it('Escape in an open shared select does not dismiss its parent environment modal',async()=>{
    await click('Environment settings');
    const event={key:'Escape',preventDefault:vi.fn(),stopPropagation:vi.fn(),defaultPrevented:false};
    vi.stubGlobal('document',{querySelector:()=>({}),activeElement:null});
    nodes().find(n=>n.props['data-comfy-drawer']==='environment')!.props.onKeyDown(event);render();
    expect(event.preventDefault).not.toHaveBeenCalled();expect(nodes().some(n=>n.props['data-comfy-drawer']==='environment')).toBe(true);
    vi.stubGlobal('document',{querySelector:()=>null,activeElement:null});
    nodes().find(n=>n.props['data-comfy-drawer']==='environment')!.props.onKeyDown(event);render();
    expect(event.preventDefault).toHaveBeenCalled();expect(nodes().some(n=>n.props['data-comfy-drawer'])).toBe(false);
  });
  it('cycles Tab focus inside an active modal, and returns focus to its opener after closing',async()=>{
    const opener={isConnected:true,closest:()=>null,focus:vi.fn()};
    const first={tabIndex:0,getClientRects:()=>[{}],focus:vi.fn()},last={tabIndex:0,getClientRects:()=>[{}],focus:vi.fn()};
    const dom={activeElement:opener as unknown,querySelector:()=>null};vi.stubGlobal('document',dom);
    await click('Environment settings');dom.activeElement=last;
    const event={key:'Tab',shiftKey:false,preventDefault:vi.fn(),defaultPrevented:false,currentTarget:{querySelectorAll:()=>[first,last]}};
    nodes().find(n=>n.props['data-comfy-drawer']==='environment')!.props.onKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();expect(first.focus).toHaveBeenCalled();
    dom.activeElement=first;event.shiftKey=true;nodes().find(n=>n.props['data-comfy-drawer']==='environment')!.props.onKeyDown(event);expect(last.focus).toHaveBeenCalled();
    await click('Close environment settings');expect(opener.focus).toHaveBeenCalledWith({preventScroll:true});
  });
  it('keeps the environment modal mounted during setup execution until cancellation/completion is reported',async()=>{
    await selectWorkflow();change('Positive prompt · 4.text','draft survives setup modal');await click('Environment settings');
    const setup=nodes().find(n=>typeof n.type==='function'&&n.type.name==='ComfyEnvironmentSetup')!;
    setup.props.onBusyChange(true);render();expect(button('Close environment settings').props.disabled).toBe(true);
    await click('Close environment settings');expect(nodes().some(n=>n.props['data-comfy-drawer']==='environment')).toBe(true);
    setup.props.onBusyChange(false);render();await click('Close environment settings');expect(nodes().some(n=>n.props['data-comfy-drawer'])).toBe(false);
    expect(field('Positive prompt · 4.text').props.value).toBe('draft survives setup modal');expect(api.run).not.toHaveBeenCalled();
  });
  it('shows dependency versions, exit provenance and explicit Python switching without changing anything automatically',async()=>{
    emit({type:'snapshot',snapshot:{...snapshot,phase:'failed',owner:null,failure:{code:'exited-early',message:'fixture dependency import failure',exitCode:9,signal:null,logTail:['fixture original stderr'],at:'fixture-time',diagnosis:{kind:'dependency-mismatch',python:'fixture/old/python.exe',packages:[{name:'fixture-runtime',required:'>=2.1',installed:'1.2',status:'mismatch'}]}}}});render();
    expect(visible(tree)).toContain('incompatible with this ComfyUI');await click('Environment settings');
    expect(visible(tree)).toContain('fixture-runtime');expect(visible(tree)).toContain('>=2.1');expect(visible(tree)).toContain('1.2');expect(visible(tree)).toContain('fixture/old/python.exe');expect(visible(tree)).toContain('fixture original stderr');
    expect(api.choosePython).not.toHaveBeenCalled();expect(environmentPrimary().props['data-action']).toBe('resolve');environmentPrimary().props.onClick();await settle();expect(api.choosePython).not.toHaveBeenCalled();expect(nodes().find(n=>n.props['data-comfy-advanced'])!.props.open).toBe(true);await click('Choose Python');expect(api.choosePython).toHaveBeenCalledTimes(1);expect(api.start).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
  });
  it('displays actual inspection arguments and never derives -s merely from portable layout',async()=>{
    harness.reset();config={...config,install:{...config.install!,layout:'portable',pythonArgs:[]}};render();await settle();await click('Environment settings');
    expect(visible(tree)).toContain('Interpreter arguments');expect(visible(tree)).toContain('None');expect(visible(tree)).not.toContain('-s');
    expect(api.choosePython).not.toHaveBeenCalled();
  });
  it('copies only an explicitly selected path without changing Comfy configuration',async()=>{
    const writeText=vi.fn(async()=>{});vi.stubGlobal('navigator',{clipboard:{writeText}});
    await click('Environment settings');await click('Copy path: fixture/ComfyUI');
    expect(writeText).toHaveBeenCalledExactlyOnceWith('fixture/ComfyUI');expect(api.setLaunchOptions).not.toHaveBeenCalled();expect(api.chooseInstallDirectory).not.toHaveBeenCalled();expect(visible(tree)).toContain('Path copied');
  });
  it('folds a long dependency inventory and preserves unknown as unverified without blocking a configured launch',async()=>{
    harness.reset();config={...config,install:{...config.install!,dependencyChecks:Array.from({length:31},(_,i)=>({name:`fixture-package-${i}`,required:'>=1',installed:i>=27?null:'1.2',status:i>=27?'unknown' as const:i===0?'mismatch' as const:'satisfied' as const}))}};snapshot={...snapshot,phase:'idle',owner:null};render();await settle();
    expect(button('Start local ComfyUI').props.disabled).toBe(false);await click('Environment settings');
    const inventory=nodes().find(n=>n.type==='details'&&n.props.className==='comfy-local-dependency-checks')!;
    expect(inventory.props.open).not.toBe(true);expect(visible(inventory)).toContain('1 abnormal, 4 unknown, 31 total');expect(visible(inventory)).toContain('Unknown versions are not verified');expect(visible(inventory)).toContain('fixture-package-30');expect(api.start).not.toHaveBeenCalled();
  });
  it('keeps explicit Python recovery ahead of long failure diagnostics and only highlights linked abnormalities',async()=>{
    const packages=Array.from({length:31},(_,i)=>({name:`failure-package-${i}`,required:'>=2',installed:i===30?null:'1',status:i===30?'unknown' as const:i<4?'mismatch' as const:'satisfied' as const}));
    emit({type:'snapshot',snapshot:{...snapshot,phase:'failed',owner:null,failure:{code:'exited-early',message:'fixture package failure',exitCode:1,signal:null,logTail:['fixture stderr'],at:'fixture-time',diagnosis:{kind:'dependency-mismatch',python:'fixture/python.exe',packages}}}});render();await click('Environment settings');
    const all=nodes(),switchIndex=all.indexOf(environmentPrimary()),inventoryIndex=all.findIndex(n=>n.type==='details'&&n.props.className==='comfy-local-dependency-checks');
    expect(switchIndex).toBeGreaterThan(-1);expect(switchIndex).toBeLessThan(inventoryIndex);
    expect(environmentPrimary().props['data-action']).toBe('resolve');environmentPrimary().props.onClick();await settle();expect(nodes().find(n=>n.props['data-comfy-advanced'])!.props.open).toBe(true);expect(api.choosePython).not.toHaveBeenCalled();
    const related=all.find(n=>n.props.className==='comfy-local-dependency-related')!;expect(walk(related).filter(n=>n.type==='p')).toHaveLength(3);expect(visible(related)).not.toContain('failure-package-4');
    expect(visible(all[inventoryIndex])).toContain('4 abnormal, 1 unknown, 31 total');expect(all[inventoryIndex].props.open).not.toBe(true);
  });
  it('refreshes discovery revisions only after completed explicit directory, Python or inspection changes',async()=>{
    emit({type:'snapshot',snapshot:{...snapshot,phase:'idle',owner:null}});render();await click('Environment settings');
    const setup=()=>nodes().find(n=>typeof n.type==='function'&&n.type.name==='ComfyEnvironmentSetup')!;
    expect(setup().props.refreshKey).toBe(0);await click('Choose Python');expect(setup().props.refreshKey).toBe(1);
    await click('Choose ComfyUI directory');expect(setup().props.refreshKey).toBe(2);await click(featureText('en-US','重新检测'));expect(setup().props.refreshKey).toBe(3);
    await click('Choose output directory');expect(setup().props.refreshKey).toBe(3);expect(api.start).not.toHaveBeenCalled();
  });
  it('disables startup without a chosen Python and provides an explicit interpreter selection route',async()=>{
    harness.reset();config={...config,install:{...config.install!,python:''}};snapshot={...snapshot,phase:'idle',owner:null};render();await settle();
    expect(button('Start local ComfyUI').props.disabled).toBe(true);expect(button('Choose Python interpreter').props.disabled).toBe(false);
    await click('Start local ComfyUI');expect(api.start).not.toHaveBeenCalled();expect(api.setLaunchOptions).not.toHaveBeenCalled();
    expect(nodes().some(n=>n.props['data-comfy-drawer']==='environment')).toBe(true);expect(button('Choose Python').props.disabled).toBe(false);
  });
  it('handles Escape after a real probe handler becomes busy and Chromium focus is lost to body',async()=>{
    const {listeners,addEventListener,removeEventListener}=eventRegistry();
    const opener={isConnected:true,closest:()=>null,focus:vi.fn()},body={};
    const modal={getClientRects:()=>[{}],querySelector:()=>null,contains:()=>false,closest:()=>null};
    const doc={body,documentElement:{},activeElement:opener as unknown,querySelector:(selector:string)=>selector.startsWith('[data-comfy-drawer=')?modal:null,querySelectorAll:()=>[modal],addEventListener,removeEventListener};
    vi.stubGlobal('document',doc);emit({type:'snapshot',snapshot:{...snapshot,phase:'idle',owner:null}});render();await click('Environment settings');
    let finish!:()=>void;vi.mocked(api.detectInstall).mockImplementationOnce(()=>new Promise(resolve=>{finish=()=>resolve(ok(config));}));
    button(featureText('en-US','重新检测')).props.onClick();render();expect(button(featureText('en-US','重新检测')).props.disabled).toBe(true);
    doc.activeElement=body;finish();await settle();expect(button(featureText('en-US','重新检测')).props.disabled).toBe(false);
    const event={key:'Escape',defaultPrevented:false,preventDefault:vi.fn()};expect(listeners.has('keydown')).toBe(true);listeners.get('keydown')!(event);render();
    expect(event.preventDefault).toHaveBeenCalled();expect(nodes().some(n=>n.props['data-comfy-drawer'])).toBe(false);expect(listeners.has('keydown')).toBe(false);expect(opener.focus).toHaveBeenCalledWith({preventScroll:true});
  });
  it('body Escape respects a shared select, setup execution and any newer visible modal',async()=>{
    const {listeners,addEventListener,removeEventListener}=eventRegistry();let selectOpen=false,otherOpen=false;
    const body={},modal={getClientRects:()=>[{}],querySelector:()=>null,contains:()=>false,closest:()=>null},other={getClientRects:()=>otherOpen?[{}]:[],closest:()=>null};
    const doc={body,documentElement:{},activeElement:body as unknown,querySelector:(selector:string)=>selector.startsWith('[data-comfy-drawer=')?modal:selectOpen?{}:null,querySelectorAll:()=>[modal,other],addEventListener,removeEventListener};
    vi.stubGlobal('document',doc);await click('Environment settings');
    const dispatch=(prevented=false)=>{const event={key:'Escape',defaultPrevented:prevented,preventDefault:vi.fn()};listeners.get('keydown')!(event);render();return event;};
    selectOpen=true;expect(dispatch().preventDefault).not.toHaveBeenCalled();selectOpen=false;
    const setup=nodes().find(n=>typeof n.type==='function'&&n.type.name==='ComfyEnvironmentSetup')!;setup.props.onBusyChange(true);render();expect(dispatch().preventDefault).not.toHaveBeenCalled();
    setup.props.onBusyChange(false);render();otherOpen=true;expect(dispatch().preventDefault).not.toHaveBeenCalled();otherOpen=false;
    expect(dispatch(true).preventDefault).not.toHaveBeenCalled();expect(nodes().some(n=>n.props['data-comfy-drawer']==='environment')).toBe(true);
    expect(dispatch().preventDefault).toHaveBeenCalled();expect(nodes().some(n=>n.props['data-comfy-drawer'])).toBe(false);
  });
});

// Same real component/hook bridge fixture for parent and modified source.
// This is not native GUI, Python execution, or port-binding acceptance.
describe('Simple ComfyUI directory-first setup contract',()=>{
  const advanced=()=>nodes().find(n=>n.props['data-comfy-advanced']);
  const basic=()=>nodes().find(n=>n.props['data-comfy-basic']);
  async function open(){emit({type:'snapshot',snapshot:{...snapshot,phase:'idle',owner:null}});render();await click('Environment settings');}
  it('S01 basic setup has one directory picker and no manual form inputs',async()=>{
    await open();expect(basic()).toBeTruthy();
    expect(walk(basic()).filter(n=>['input','textarea','select','comfy-test-select'].includes(String(n.type)))).toHaveLength(0);
    expect(walk(basic()).filter(n=>n.type==='button'&&n.props['data-comfy-env-directory'])).toHaveLength(1);expect(nodes().filter(n=>n.props.role==='tab')).toHaveLength(0);
    expect(advanced()!.type).toBe('details');expect(advanced()!.props.open).toBe(false);
  });
  it('S02 Python, port, output, timeout, flags, dependency table and setup discovery stay in closed advanced',async()=>{
    config.install!.dependencyChecks=[{name:'fixture-package',required:'>=1',installed:'1',status:'satisfied'}];
    await open();expect(advanced()).toBeTruthy();const inside=walk(advanced());
    for(const label of ['Choose Python','Choose output directory','Save launch settings'])expect(inside.some(n=>n.type==='button'&&visible(n.props.children)===label),label).toBe(true);
    for(const label of ['Port','Readiness timeout (seconds)','Extra launch arguments (safe allowlist)'])expect(inside.some(n=>n.props['aria-label']===label),label).toBe(true);
    expect(inside.some(n=>n.props.className==='comfy-local-dependency-checks')).toBe(true);
    expect(inside.some(n=>typeof n.type==='function'&&n.type.name==='ComfyEnvironmentSetup')).toBe(false);expect(nodes().some(n=>typeof n.type==='function'&&n.type.name==='ComfyEnvironmentSetup'&&n.props.renderMode==='guided')).toBe(true);
  });
  it('S03 selecting only the directory adopts actual auto inspection values without opening advanced',async()=>{
    await open();const next={...config,install:{...config.install!,python:'fixture/auto/python.exe',layout:'portable' as const,pythonSelection:{mode:'auto' as const,reason:'COMFY_PYTHON_AUTO_METADATA_MATCH'}},launch:{...config.launch,port:8197,portMode:'auto' as const},connection:{host:'127.0.0.1' as const,port:8197}};
    vi.mocked(api.chooseInstallDirectory).mockResolvedValueOnce(ok(next));await click('Choose ComfyUI directory');
    expect(api.choosePython).not.toHaveBeenCalled();expect(advanced()!.props.open).toBe(false);
    expect(visible(basic())).toContain('fixture/auto/python.exe');expect(visible(basic())).toContain(translated('启动时自动选择可用端口'));expect(visible(basic())).not.toContain('8197');expect(walk(advanced()).find(n=>n.props['aria-label']==='Port')!.props.value).toBe('8197');expect(visible(advanced())).toContain('portable');
    expect(button('Start local ComfyUI').props.disabled).toBe(false);
  });
  it('S04 starting with advanced closed preserves explicit old safety and argument settings',async()=>{
    harness.reset();config={...config,launch:{...config.launch,safeMode:true,extraArgs:['--lowvram'],portMode:'manual'}};snapshot={...snapshot,phase:'idle',owner:null};render();await settle();await click('Environment settings');
    expect(advanced()!.props.open).toBe(false);await click('Start local ComfyUI');
    expect(api.setLaunchOptions).toHaveBeenCalledWith(expect.objectContaining({safeMode:true,extraArgs:['--lowvram'],portMode:'manual'}));expect(api.start).toHaveBeenCalledTimes(1);
  });
  it('S05 editing the advanced port explicitly chooses manual mode',async()=>{
    harness.reset();config={...config,launch:{...config.launch,portMode:'auto'}};snapshot={...snapshot,phase:'idle',owner:null};render();await settle();await click('Environment settings');
    advanced()!.props.onToggle?.({currentTarget:{open:true}});render();change('Port','8201');await click('Save launch settings');
    expect(api.setLaunchOptions).toHaveBeenCalledWith(expect.objectContaining({port:8201,portMode:'manual'}));
  });
  it('S06 actual auto-selected bound port is reflected after starting rather than retaining a stale preferred port',async()=>{
    harness.reset();config={...config,launch:{...config.launch,portMode:'auto'}};snapshot={...snapshot,phase:'idle',owner:null};render();await settle();await click('Environment settings');
    vi.mocked(api.start).mockImplementationOnce(async()=>{config={...config,launch:{...config.launch,port:8199},connection:{host:'127.0.0.1',port:8199}};snapshot={...snapshot,phase:'ready',owner:'app',target:{host:'127.0.0.1',port:8199}};return ok(snapshot);});
    await click('Start local ComfyUI');expect(visible(basic())).toContain('8199');expect(advanced()!.props.open).toBe(false);
  });
});

describe('Simple setup read-only summaries and manual recovery',()=>{
  const advanced=()=>nodes().find(n=>n.props['data-comfy-advanced'])!;
  const basic=()=>nodes().find(n=>n.props['data-comfy-basic'])!;
  it('keeps unknown automatic Python unconfirmed and opens/focuses the explicit manual fallback without choosing for the user',async()=>{
    harness.reset();config={...config,install:{...config.install!,python:'',pythonSelection:{mode:'auto',reason:'COMFY_PYTHON_AUTO_UNCONFIRMED'}}};snapshot={...snapshot,phase:'idle',owner:null};render();await settle();await click('Environment settings');
    expect(visible(basic())).toContain('Automatic inspection could not confirm a usable Python');expect(button('Start local ComfyUI').props.disabled).toBe(true);expect(advanced().props.open).toBe(false);
    const focus=vi.fn(),scrollIntoView=vi.fn(),querySelector=vi.fn(()=>({focus}));advanced().props.ref.current={open:false,querySelector,scrollIntoView};
    await click('Choose Python interpreter');expect(advanced().props.open).toBe(true);expect(querySelector).toHaveBeenCalledWith('[data-comfy-python-picker]');expect(focus).toHaveBeenCalled();expect(scrollIntoView).toHaveBeenCalled();
    expect(api.choosePython).not.toHaveBeenCalled();expect(api.start).not.toHaveBeenCalled();
  });
  it('opening or closing advanced preserves manual drafts and explicit saved safety instead of applying new defaults',async()=>{
    harness.reset();config={...config,launch:{...config.launch,safeMode:true,portMode:'manual',extraArgs:['--lowvram']}};snapshot={...snapshot,phase:'idle',owner:null};render();await settle();await click('Environment settings');
    expect(walk(advanced()).find(n=>n.props['aria-label']===featureText('en-US','安全模式（禁用第三方节点）'))!.props.checked).toBe(true);advanced().props.onToggle({currentTarget:{open:true}});render();
    change('Readiness timeout (seconds)','420');change('Extra launch arguments (safe allowlist)','--lowvram\n--preview-method\nnone');
    advanced().props.onToggle({currentTarget:{open:false}});render();expect(advanced().props.open).toBe(false);
    expect(field('Readiness timeout (seconds)').props.value).toBe('420');expect(field('Extra launch arguments (safe allowlist)').props.value).toBe('--lowvram\n--preview-method\nnone');expect(field(featureText('en-US','安全模式（禁用第三方节点）')).props.checked).toBe(true);
    expect(api.setLaunchOptions).not.toHaveBeenCalled();await click('Start local ComfyUI');expect(api.setLaunchOptions).toHaveBeenCalledWith(expect.objectContaining({safeMode:true,readyTimeoutSec:420,portMode:'manual',extraArgs:['--lowvram','--preview-method','none']}));
  });
  it('shows actual service port from snapshot even if a saved preferred port is stale',async()=>{
    harness.reset();config={...config,launch:{...config.launch,portMode:'auto',port:8188}};snapshot={...snapshot,target:{host:'127.0.0.1',port:8191}};render();await settle();await click('Environment settings');
    expect(visible(basic())).toContain('Actual port');expect(visible(basic())).toContain('8191');expect(visible(basic())).not.toContain('Availability confirmed at startup');
  });
  it('offers automatic port mode only as an explicit advanced override and preserves all unrelated fields',async()=>{
    emit({type:'snapshot',snapshot:{...snapshot,phase:'idle',owner:null}});render();await click('Environment settings');advanced().props.onToggle({currentTarget:{open:true}});render();
    expect(field('Automatically select an available port').props.checked).toBe(false);change('Automatically select an available port',true);await click('Save launch settings');
    expect(api.setLaunchOptions).toHaveBeenCalledWith(expect.objectContaining({portMode:'auto',disableApiNodes:true,safeMode:false,extraArgs:[]}));expect(api.choosePython).not.toHaveBeenCalled();
  });
  it('localizes the simple workflow in all five languages without falling back to a Chinese-only settings panel',async()=>{
    harness.reset();config={...config,install:{...config.install!,pythonSelection:{mode:'auto',reason:'COMFY_PYTHON_AUTO_METADATA_MATCH'}},launch:{...config.launch,portMode:'auto'}};snapshot={...snapshot,phase:'idle',owner:null};render();await settle();await click('Environment settings');
    for(const language of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR'] as const){harness.store.settings.language=language;render();for(const key of ['高级设置','自动识别','使用的 ComfyUI','正常使用无需修改','启动时自动选择可用端口','只使用已有环境，不安装或升级依赖；启动成功后才确认可用。','故障排查','连接已运行的 ComfyUI']){expect(visible(tree)).toContain(featureText(language,key));if(['en-US','ja-JP','ko-KR'].includes(language))expect(featureText(language,key),`${language}:${key}`).not.toBe(key);}}
  });
});

describe('Guided single-page environment handlers (typed bridge fixtures)',()=>{
  const guide=()=>nodes().find(n=>n.props['data-comfy-environment-guide'])!;
  const status=()=>nodes().find(n=>n.props['data-comfy-env-status'])!;
  const directory=()=>nodes().find(n=>n.props['data-comfy-env-directory'])!;
  const advanced=()=>nodes().find(n=>n.props['data-comfy-advanced'])!;
  const stop=()=>nodes().find(n=>n.props['data-comfy-env-stop'])!;
  async function offline(){emit({type:'snapshot',snapshot:{...snapshot,phase:'idle',owner:null}});render();await click('Environment settings');}
  it('G01 unconfigured mode offers one main-directory primary with no automatic start, Python picker or manual fields in the normal path',async()=>{
    harness.reset();config={...config,install:null};snapshot={...snapshot,phase:'idle',owner:null};render();await settle();await click('Environment settings');expect(environmentPrimary().props['data-action']).toBe('choose');expect(environmentPrimary().props.disabled).toBe(false);expect(nodes().filter(n=>n.type==='button'&&n.props['aria-label']===translated('选择 ComfyUI 目录'))).toHaveLength(1);expect(walk(nodes().find(n=>n.props['data-comfy-basic'])).filter(n=>['input','textarea','comfy-test-select'].includes(String(n.type)))).toHaveLength(0);expect(advanced().props.open).toBe(false);expect(nodes().some(n=>n.props.role==='tab')).toBe(false);expect(api.chooseInstallDirectory).not.toHaveBeenCalled();expect(api.choosePython).not.toHaveBeenCalled();expect(api.start).not.toHaveBeenCalled();expect(api.connect).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
  });
  it('G02 directory selection latches same-tick clicks and cancellation preserves the existing environment and unsaved launch settings',async()=>{
    await offline();showExpert();change('Port','8234');change('Readiness timeout (seconds)','420');const pending=deferred<ComfyResponse<ComfyLocalConfig|null>>();vi.mocked(api.chooseInstallDirectory).mockImplementationOnce(()=>pending.promise);const choose=directory();choose.props.onClick();choose.props.onClick();render();expect(api.chooseInstallDirectory).toHaveBeenCalledTimes(1);expect(directory().props.disabled).toBe(true);pending.resolve(ok(null));await settle();expect(visible(guide())).toContain('fixture/ComfyUI');expect(field('Port').props.value).toBe('8234');expect(field('Readiness timeout (seconds)').props.value).toBe('420');expect(api.choosePython).not.toHaveBeenCalled();expect(api.setLaunchOptions).not.toHaveBeenCalled();expect(api.start).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
  });
  it('G03 ready primary returns to creation without changing the selected workflow, edited values or fixed seed',async()=>{
    await selectWorkflow();change('Positive prompt · 4.text','draft remains after guided settings');change('Randomize seed each run',false);change('Seed · 6.seed','777');await click('Environment settings');expect(environmentPrimary().props['data-action']).toBe('create');environmentPrimary().props.onClick();await settle();expect(guide()).toBeUndefined();expect(rawButton(translated('选择工作流'))!.props.title).toBe('Workflow wf1');expect(field('Positive prompt · 4.text').props.value).toBe('draft remains after guided settings');expect(field('Seed · 6.seed').props.value).toBe(777);expect(field('Randomize seed each run').props.checked).toBe(false);expect(api.start).not.toHaveBeenCalled();expect(api.stop).not.toHaveBeenCalled();expect(api.chooseInstallDirectory).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
  });
  it('G04 native Advanced, Connection and Troubleshooting disclosures are presentation-only and retain uncommitted settings',async()=>{
    await offline();showExpert();change('Port','8231');change('Readiness timeout (seconds)','450');change(featureText('en-US','安全模式（禁用第三方节点）'),true);toggleDetails('data-comfy-env-connection');toggleDetails('data-comfy-env-troubleshooting');toggleDetails('data-comfy-env-connection',false);toggleDetails('data-comfy-env-troubleshooting',false);toggleDetails('data-comfy-advanced',false);expect(advanced().props.open).toBe(false);showExpert();expect(field('Port').props.value).toBe('8231');expect(field('Readiness timeout (seconds)').props.value).toBe('450');expect(field(featureText('en-US','安全模式（禁用第三方节点）')).props.checked).toBe(true);expect(api.stop).not.toHaveBeenCalled();expect(api.disconnect).not.toHaveBeenCalled();expect(api.chooseInstallDirectory).not.toHaveBeenCalled();expect(api.choosePython).not.toHaveBeenCalled();expect(api.connect).not.toHaveBeenCalled();expect(api.setLaunchOptions).not.toHaveBeenCalled();
  });
  it('G05 an active job disables guided Stop and a captured pre-job handler cannot stop or disconnect it',async()=>{
    emit({type:'snapshot',snapshot:{...snapshot,owner:'app',pid:77}});render();await click('Environment settings');const staleStop=stop();expect(staleStop.props.disabled).toBe(false);emit({type:'snapshot',snapshot:{...snapshot,owner:'app',pid:77,activeRun:{...run,phase:'running'}}});await settle();expect(stop().props.disabled).toBe(true);expect(environmentPrimary().props['data-action']).toBe('view-task');staleStop.props.onClick();await settle();expect(api.stop).not.toHaveBeenCalled();expect(api.disconnect).not.toHaveBeenCalled();expect(api.cancel).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
  });
  it('G06 disconnecting an external service does not kill it or start a replacement process',async()=>{
    await click('Environment settings');expect(stop().props.disabled).toBe(false);stop().props.onClick();await settle();expect(api.disconnect).toHaveBeenCalledExactlyOnceWith();expect(api.stop).not.toHaveBeenCalled();expect(api.start).not.toHaveBeenCalled();expect(api.choosePython).not.toHaveBeenCalled();expect(api.chooseInstallDirectory).not.toHaveBeenCalled();
  });
  it('G07 local start latches repeated same-tick primary clicks before saving launch settings',async()=>{
    await offline();const pending=deferred<ComfyResponse<ComfySnapshot>>();vi.mocked(api.start).mockImplementationOnce(()=>pending.promise);const start=environmentPrimary();expect(start.props['data-action']).toBe('start');start.props.onClick();start.props.onClick();await settle();expect(api.setLaunchOptions).toHaveBeenCalledTimes(1);expect(api.setConnection).toHaveBeenCalledTimes(1);expect(api.start).toHaveBeenCalledTimes(1);snapshot={...snapshot,phase:'ready',owner:'app'};pending.resolve(ok(snapshot));await settle();expect(status().props['data-comfy-env-status']).toBe('ready');expect(api.stop).not.toHaveBeenCalled();expect(api.connect).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
  });
  it('G08 an unresolved initial snapshot offers only read-only refresh, not installation or startup',async()=>{
    harness.reset();vi.mocked(api.getState).mockRejectedValueOnce(new Error('fixture initial read unavailable'));render();await settle();await click('Environment settings');expect(environmentPrimary().props['data-action']).toBe('refresh');vi.mocked(api.getState).mockClear();environmentPrimary().props.onClick();await settle();expect(api.getState).toHaveBeenCalledTimes(1);expect(api.start).not.toHaveBeenCalled();expect(api.chooseInstallDirectory).not.toHaveBeenCalled();expect(api.choosePython).not.toHaveBeenCalled();expect(api.connect).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
  });
  it('G09 matching dependency metadata is not advertised as a running service or proof that a model can generate',async()=>{
    harness.reset();config={...config,install:{...config.install!,dependencyChecks:[{name:'fixture-library',required:'>=1',installed:'1',status:'satisfied'}]}};snapshot={...snapshot,phase:'idle',owner:null};render();await settle();await click('Environment settings');expect(status().props['data-comfy-env-status']).toBe('configured');expect(visible(status())).toContain(translated('环境已识别，尚未启动'));expect(visible(status())).toContain(translated('点击启动后核验实际服务；不会安装或升级依赖。'));expect(visible(status())).not.toContain(translated('ComfyUI 已就绪'));expect(environmentPrimary().props['data-action']).toBe('start');expect(api.analyzeWorkflow).not.toHaveBeenCalled();expect(api.start).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
  });
  it('G10 opening and closing guided disclosures preserves Save-as name, parameter draft and seed for an explicit later library save',async()=>{
    await selectWorkflow();change('Positive prompt · 4.text','guided dialog keeps draft');change('Randomize seed each run',false);change('Seed · 6.seed','1001');nodes().find(n=>n.props['data-comfy-workflow-save-as'])!.props.onClick();render();change(translated('副本名称'),'Guided copy');await click('Environment settings');toggleDetails('data-comfy-advanced');toggleDetails('data-comfy-env-troubleshooting');toggleDetails('data-comfy-advanced',false);toggleDetails('data-comfy-env-troubleshooting',false);await click('Close environment settings');expect(field('Positive prompt · 4.text').props.value).toBe('guided dialog keeps draft');expect(field(translated('副本名称')).props.value).toBe('Guided copy');expect(field('Seed · 6.seed').props.value).toBe(1001);expect(api.saveWorkflowAs).not.toHaveBeenCalled();nodes().find(n=>n.props['data-comfy-workflow-save-confirm'])!.props.onClick();await settle();expect(api.saveWorkflowAs).toHaveBeenCalledExactlyOnceWith('wf1','Guided copy',{'positive:4:text':'guided dialog keeps draft','seed:6:seed':1001});expect(api.run).not.toHaveBeenCalled();expect(api.start).not.toHaveBeenCalled();
  });
  it('G11 an old app-owner Stop handler reads the latest external ownership and latches duplicate disconnects',async()=>{
    emit({type:'snapshot',snapshot:{...snapshot,owner:'app',pid:77}});render();await click('Environment settings');const oldAppStop=stop();emit({type:'snapshot',snapshot:{...snapshot,owner:'external',pid:null}});render();const pending=deferred<ComfyResponse<ComfySnapshot>>();vi.mocked(api.disconnect).mockImplementationOnce(()=>pending.promise);oldAppStop.props.onClick();oldAppStop.props.onClick();render();expect(api.disconnect).toHaveBeenCalledExactlyOnceWith();expect(api.stop).not.toHaveBeenCalled();pending.resolve(ok({...snapshot,phase:'idle',owner:null}));await settle();expect(api.start).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
  });
  it('G12 captured directory and start handlers cannot bypass a newer running-job service lock',async()=>{
    await offline();const oldDirectory=directory(),oldStart=environmentPrimary();emit({type:'snapshot',snapshot:{...snapshot,owner:'app',pid:77,activeRun:{...run,phase:'running'}}});await settle();expect(directory().props.disabled).toBe(true);oldDirectory.props.onClick();oldStart.props.onClick();await settle();expect(api.chooseInstallDirectory).not.toHaveBeenCalled();expect(api.setLaunchOptions).not.toHaveBeenCalled();expect(api.start).not.toHaveBeenCalled();expect(api.stop).not.toHaveBeenCalled();expect(api.cancel).not.toHaveBeenCalled();
  });
  it('G13 explicit cancel stops a pending app startup exactly once and ignores its late ready reply',async()=>{
    await offline();const starting=deferred<ComfyResponse<ComfySnapshot>>();vi.mocked(api.start).mockImplementationOnce(()=>starting.promise);
    environmentPrimary().props.onClick();await settle();expect(api.start).toHaveBeenCalledTimes(1);
    emit({type:'snapshot',snapshot:{...snapshot,phase:'starting',owner:'app',pid:77,health:'unknown',activeRun:null}});render();
    const cancel=rawButton(translated('取消启动'))!;expect(cancel.props.disabled).toBe(false);cancel.props.onClick();cancel.props.onClick();await settle();
    expect(api.stop).toHaveBeenCalledExactlyOnceWith({interruptRunning:false});expect(api.disconnect).not.toHaveBeenCalled();
    vi.mocked(api.getState).mockClear();starting.resolve(ok({...snapshot,phase:'ready',owner:'app',pid:77,health:'ok'}));await settle();
    expect(status().props['data-comfy-env-status']).not.toBe('ready');expect(environmentPrimary().props['data-action']).toBe('start');expect(api.getState).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
  });
  it('G14 a captured Stop cannot cancel the save-config stage and then allow a stray late launch',async()=>{
    emit({type:'snapshot',snapshot:{...snapshot,owner:'app',pid:77}});render();await click('Environment settings');const oldStop=stop();
    emit({type:'snapshot',snapshot:{...snapshot,phase:'idle',owner:null,pid:null}});render();
    const settings=deferred<ComfyResponse<ComfyLocalConfig>>();vi.mocked(api.setLaunchOptions).mockImplementationOnce(()=>settings.promise);
    environmentPrimary().props.onClick();await settle();expect(api.start).not.toHaveBeenCalled();oldStop.props.onClick();await settle();
    expect(api.stop).not.toHaveBeenCalled();expect(api.disconnect).not.toHaveBeenCalled();expect(api.start).not.toHaveBeenCalled();
    settings.resolve(ok(config));await settle();expect(api.start).toHaveBeenCalledTimes(1);expect(api.stop).not.toHaveBeenCalled();
  });
  it('G15 a captured startup Cancel cannot interrupt a newer active task',async()=>{
    await offline();const starting=deferred<ComfyResponse<ComfySnapshot>>();vi.mocked(api.start).mockImplementationOnce(()=>starting.promise);
    environmentPrimary().props.onClick();await settle();const pendingSnapshot={...snapshot,phase:'starting' as const,owner:'app' as const,pid:77,health:'unknown' as const};
    emit({type:'snapshot',snapshot:pendingSnapshot});render();const cancel=rawButton(translated('取消启动'))!;
    emit({type:'snapshot',snapshot:{...pendingSnapshot,activeRun:{...run,phase:'running'}}});render();cancel.props.onClick();await settle();
    expect(api.stop).not.toHaveBeenCalled();expect(api.disconnect).not.toHaveBeenCalled();expect(api.cancel).not.toHaveBeenCalled();
    starting.resolve(ok({...snapshot,phase:'ready',owner:'app',pid:77}));await settle();
  });
  it('G16 startup cancellation remains blocked while another configuration operation is pending',async()=>{
    await offline();showExpert();const oldOutput=button('Choose output directory'),starting=deferred<ComfyResponse<ComfySnapshot>>(),output=deferred<ComfyResponse<ComfyLocalConfig|null>>();
    vi.mocked(api.start).mockImplementationOnce(()=>starting.promise);vi.mocked(api.chooseOutputDirectory).mockImplementationOnce(()=>output.promise);
    environmentPrimary().props.onClick();await settle();emit({type:'snapshot',snapshot:{...snapshot,phase:'starting',owner:'app',pid:77,health:'unknown'}});render();const cancel=rawButton(translated('取消启动'))!;
    oldOutput.props.onClick();render();expect(api.chooseOutputDirectory).toHaveBeenCalledTimes(1);cancel.props.onClick();await settle();expect(api.stop).not.toHaveBeenCalled();
    output.resolve(ok(null));starting.resolve(ok({...snapshot,phase:'ready',owner:'app',pid:77}));await settle();expect(api.disconnect).not.toHaveBeenCalled();
  });
  it('G17 startup cancellation remains blocked while the setup surface owns a pending operation',async()=>{
    await offline();const starting=deferred<ComfyResponse<ComfySnapshot>>();vi.mocked(api.start).mockImplementationOnce(()=>starting.promise);
    environmentPrimary().props.onClick();await settle();emit({type:'snapshot',snapshot:{...snapshot,phase:'starting',owner:'app',pid:77,health:'unknown'}});render();const cancel=rawButton(translated('取消启动'))!;
    const setup=nodes().find(node=>typeof node.type==='function'&&node.type.name==='ComfyEnvironmentSetup')!;setup.props.onBusyChange(true);render();cancel.props.onClick();await settle();expect(api.stop).not.toHaveBeenCalled();
    setup.props.onBusyChange(false);starting.resolve(ok({...snapshot,phase:'ready',owner:'app',pid:77}));await settle();
  });
});

describe('Explicit gallery-like Comfy pagination and known-file actions',()=>{
 const ft=(key:string)=>featureText('en-US',key);
 const area=(kind:string)=>nodes().find(n=>n.props['data-comfy-pagination']===kind)!;
 const records=()=>nodes().filter(n=>n.props.className==='comfy-local-run');
 it('P01 task/result selectors use the gallery options and default12 with independent controlled pages',()=>{
   expect(area('runs')).toBeUndefined();expect(area('results')).toBeUndefined();seedPages();
   for(const [key,label] of [['任务记录','任务每页数量'],['作品库','图片每页数量']]){nav(key);const input=field(ft(label));expect(input.props.value).toBe('12');expect(walk(input).filter(n=>n.type==='option').map(n=>n.props.value)).toEqual(['12','24','48','60']);}
 });
 it('P02 tasks retain100, page12 then page9of9, resize24 resets page1 and persists the preference',async()=>{
   for(let i=0;i<105;i++)emit({type:'run',run:{...run,runId:`history-${i}`,phase:'completed'}});render();nav('任务记录');expect(records()).toHaveLength(12);expect(visible(area('runs'))).toContain('100');expect(records()[0].props['data-comfy-run-id']).toBe('history-104');
   await click(ft('任务下一页'));expect(records()[0].props['data-comfy-run-id']).toBe('history-92');change(ft('任务页码'),'9');expect(records()).toHaveLength(4);
   change(ft('任务每页数量'),'24');expect(field(ft('任务页码')).props.value).toBe(1);expect(records()).toHaveLength(24);expect(localStorage.setItem).toHaveBeenCalledWith('langbai.comfy-local.runs-page-size.v1','24');
 });
 it('P03 explicit works filtering precedes pagination and filter changes reset its page while the task ledger stays global',async()=>{
   workflows.push(workflowFixture('wf2'));emit({type:'workflows',workflows});for(let i=0;i<40;i++)emit({type:'run',run:{...run,runId:`filtered-${i}`,workflowId:i%2?'wf1':'wf2',phase:'completed'}});emit({type:'results',results:Array.from({length:40},(_,i)=>({...result,id:`filtered-result-${i}`,workflowId:i%2?'wf1':'wf2'}))});render();nav('作品库');change(ft('作品工作流筛选'),'wf1');await click(ft('图片下一页'));expect(nodes().filter(n=>n.props['data-comfy-result-id'])).toHaveLength(8);change(ft('作品工作流筛选'),'wf2');expect(field(ft('图片页码')).props.value).toBe(1);expect(nodes().filter(n=>n.props['data-comfy-result-id'])).toHaveLength(12);expect(visible(area('results'))).toContain('20');nav('任务记录');expect(visible(area('runs'))).toContain('40');
 });
 it('P04 result thumbnails are paginated before rendering and actual path actions send only saved result IDs',async()=>{
   const items=Array.from({length:51},(_,i)=>({...result,id:`result-${i}`,filePath:`fixture/output/result-${i}.png`,runId:`saved-${i}`}));emit({type:'results',results:items});render();
   nav('作品库');const cards=()=>nodes().filter(n=>n.props['data-comfy-result-id']);expect(cards()).toHaveLength(12);await click(ft('图片下一页'));expect(cards()).toHaveLength(12);
   const details=nodes().find(n=>n.props.className==='comfy-studio-work-details')!;const location=walk(details).find(n=>n.type==='button'&&n.props.className==='comfy-local-file-path')!;expect(location.props.title).toBe(items[12].filePath);expect(location).toBeTruthy();location.props.onClick();await settle();expect(api.openResult).toHaveBeenCalledWith('result-12');expect(api.openResultsFolder).not.toHaveBeenCalled();
   change(ft('图片每页数量'),'60');expect(cards()).toHaveLength(51);expect(area('results')).toBeTruthy();expect(field(ft('图片每页数量')).props.value).toBe('60');expect(field(ft('图片页码'))).toBeUndefined();expect(button(ft('图片上一页'))).toBeUndefined();expect(button(ft('图片下一页'))).toBeUndefined();change(ft('图片每页数量'),'12');expect(cards()).toHaveLength(12);expect(field(ft('图片页码')).props.value).toBe(1);change(ft('图片每页数量'),'60');emit({type:'results',results:[...items,...Array.from({length:14},(_,i)=>({...result,id:`extra-${i}`}))]});render();expect(field(ft('图片页码')).props.value).toBe(1);expect(cards()).toHaveLength(60);
 });
 it('P05 task file actions exist only for matching saved results, not failed or unsaved jobs',async()=>{
   emit({type:'run',run:{...run,runId:'unsaved-failure',phase:'failed'}});emit({type:'run',run:{...run,runId:'run1',phase:'completed'}});emit({type:'results',results:[result]});render();nav('任务记录');const saved=taskCard('run1'),unsaved=taskCard('unsaved-failure');
   expect(walk(unsaved).find(n=>n.type==='button'&&visible(n.props.children)===ft('查看图片'))!.props.disabled).toBe(true);expandTask('unsaved-failure');expect(walk(taskCard('unsaved-failure')).some(n=>n.type==='button'&&visible(n.props.children).trim()===ft('打开文件位置'))).toBe(false);expect(walk(saved).find(n=>n.type==='button'&&visible(n.props.children)===ft('查看图片'))!.props.disabled).toBe(false);expandTask('run1');const location=walk(taskCard('run1')).find(n=>n.type==='button'&&visible(n.props.children).trim()===ft('打开文件位置'))!;expect(location).toBeTruthy();location.props.onClick();await settle();expect(api.openResult).toHaveBeenCalledWith('result1');expect(api.openResultsFolder).not.toHaveBeenCalled();
 });
});

describe('Explicit main-owned Comfy webpage action',()=>{
 const label=()=>featureText('en-US','打开 ComfyUI 网页');
 it('W01 ready healthy service opens the main-owned current endpoint once with no renderer argument',async()=>{
   api.openWeb=vi.fn(async()=>ok(undefined));render();expect(button(label())).toBeTruthy();expect(button(label()).props.disabled).toBe(false);expect(api.openWeb).not.toHaveBeenCalled();await click(label());expect(api.openWeb).toHaveBeenCalledExactlyOnceWith();expect(api.start).not.toHaveBeenCalled();expect(api.connect).not.toHaveBeenCalled();
 });
 it('W02 absent bridge, non-ready and unhealthy states never open even when the disabled real handler is called',async()=>{
   expect(button(label())).toBeTruthy();expect(button(label()).props.disabled).toBe(true);await click(label());api.openWeb=vi.fn(async()=>ok(undefined));
   emit({type:'snapshot',snapshot:{...snapshot,phase:'idle',owner:null}});render();expect(button(label())).toBeUndefined();expect(api.openWeb).not.toHaveBeenCalled();emit({type:'snapshot',snapshot:{...snapshot,health:'unresponsive'}});render();expect(button(label()).props.disabled).toBe(true);await click(label());expect(api.openWeb).not.toHaveBeenCalled();
 });
 it('W03 browser failure is a notice only and does not stop or restart the healthy service',async()=>{
   api.openWeb=vi.fn(async():Promise<ComfyResponse<void>>=>({ok:false,error:{code:'internal',message:'fixture browser unavailable'}}));render();await click(label());expect(visible(tree)).toContain('fixture browser unavailable');expect(visible(tree)).toContain('Ready');expect(api.stop).not.toHaveBeenCalled();expect(api.start).not.toHaveBeenCalled();
 });
});

describe('Parameter-primary responsive layout and truthful history',()=>{
  it('allocates balanced editing width with the exact pinned threshold and compact tabs',()=>{
    for(const width of [1055,1280,1281,1282,1385,1920])for(const pinned of [false,true]){const value=comfyStudioLayout(width,pinned);expect(value.width).toBeGreaterThanOrEqual(520);expect(value.width).toBeLessThanOrEqual(760);expect(value.libraryDocked).toBe(pinned&&width>=1282);if(value.libraryDocked)expect(value.stageWidth).toBeGreaterThanOrEqual(480);}
    expect(comfyStudioLayout(1280,false)).toMatchObject({width:640,stageWidth:639});expect(comfyStudioLayout(1282,true)).toMatchObject({width:520,stageWidth:480});expect(comfyStudioLayout(959,true)).toMatchObject({mode:'tabs',libraryDocked:false});
  });
  it('resizes with pointer capture, cancels cleanly, keeps model drafts and resets to the balanced default on double click',async()=>{
    await selectWorkflow();change('Positive prompt · 4.text','preserve pointer draft');const splitter=()=>nodes().find(n=>n.props['data-comfy-splitter'])!,workbench=()=>nodes().find(n=>n.props['data-comfy-width-mode'])!;
    const start=splitter().props['aria-valuenow'],target={setPointerCapture:vi.fn(),hasPointerCapture:()=>true,releasePointerCapture:vi.fn()};
    splitter().props.onPointerDown({button:0,pointerId:7,clientX:100,preventDefault:vi.fn(),currentTarget:target});splitter().props.onPointerMove({pointerId:7,clientX:132});render();expect(splitter().props['aria-valuenow']).toBe(start+32);expect(workbench().props['data-comfy-width-mode']).toBe('manual');
    splitter().props.onPointerCancel({pointerId:7,currentTarget:target});expect(target.releasePointerCapture).toHaveBeenCalledWith(7);splitter().props.onPointerMove({pointerId:7,clientX:240});render();expect(splitter().props['aria-valuenow']).toBe(start+32);
    splitter().props.onKeyDown({key:'End',preventDefault:vi.fn()});render();expect(splitter().props['aria-valuenow']).toBe(splitter().props['aria-valuemax']);splitter().props.onKeyDown({key:'Home',preventDefault:vi.fn()});render();expect(splitter().props['aria-valuenow']).toBe(splitter().props['aria-valuemin']);
    splitter().props.onDoubleClick();render();expect(workbench().props['data-comfy-width-mode']).toBe('auto');expect(splitter().props['aria-valuenow']).toBe(start);expect(field('Positive prompt · 4.text').props.value).toBe('preserve pointer draft');expect(api.run).not.toHaveBeenCalled();
  });
  it('shows partial history honestly and never treats restored unknown receipts as active jobs',async()=>{
    harness.reset();vi.mocked(api.getState).mockImplementation(async()=>ok({config,snapshot,workflows,results:[],platform:{os:'win32',launchSupported:true,launchAcceptance:'unverified'},runHistoryIncomplete:true,runs:[{...run,history:{restored:true,status:'unknown'},phase:'running'}]}));render();await settle();await selectWorkflow();nav('任务记录');expect(visible(tree)).toContain(featureText('en-US','部分历史未加载，仅显示最近可读记录。'));expect(visible(tree)).toContain(featureText('en-US','历史状态未知'));expect(button('Cancel job')).toBeUndefined();nav('创作');expect(button('Queue generation').props.disabled).toBe(true);change(translated('我已核对，仍要再次提交'),true);expect(button('Queue generation').props.disabled).toBe(false);expect(api.run).not.toHaveBeenCalled();
  });
  it('keeps task page state independent from result page state, bounds invalid sizes and clamps shrinking results',async()=>{
    const ft=(key:string)=>featureText('en-US',key);emit({type:'results',results:Array.from({length:30},(_,i)=>({...result,id:`r-${i}`}))});for(let i=0;i<30;i++)emit({type:'run',run:{...run,runId:`job-${i}`,phase:'completed'}});render();nav('任务记录');await click(ft('任务下一页'));expect(field(ft('任务页码')).props.value).toBe(2);nav('作品库');expect(field(ft('图片页码')).props.value).toBe(1);
    change(ft('图片每页数量'),'999');expect(field(ft('图片每页数量')).props.value).toBe('12');await click(ft('图片下一页'));emit({type:'results',results:[result]});render();expect(field(ft('图片页码'))).toBeUndefined();nav('任务记录');expect(field(ft('任务页码')).props.value).toBe(2);
  });
  it('retains only the original twenty live preview buffers, not a hundred large history images',()=>{
    for(let i=0;i<25;i++)emit({type:'preview',runId:`preview-${i}`,dataUrl:`data:image/png;base64,FIXTURE${i}`});
    emit({type:'snapshot',snapshot:{...snapshot,activeRun:{...run,runId:'preview-0',phase:'running'}}});render();expect(nodes().some(n=>n.type==='img'&&n.props.src==='data:image/png;base64,FIXTURE0')).toBe(false);
    emit({type:'snapshot',snapshot:{...snapshot,activeRun:{...run,runId:'preview-24',phase:'running'}}});render();expect(nodes().some(n=>n.type==='img'&&n.props.src==='data:image/png;base64,FIXTURE24')).toBe(true);
  });
});

describe('Comfy pagination preferences, path copy and language continuity',()=>{
  it('restores valid independent per-page preferences and never accepts an arbitrary stored page size',async()=>{
    harness.reset();vi.stubGlobal('localStorage',{getItem:(key:string)=>key.includes('runs-page-size')?'24':'48',setItem:vi.fn()});render();await settle();seedPages();nav('任务记录');expect(field(featureText('en-US','任务每页数量')).props.value).toBe('24');nav('作品库');expect(field(featureText('en-US','图片每页数量')).props.value).toBe('48');
    harness.reset();vi.stubGlobal('localStorage',{getItem:()=> '10000',setItem:vi.fn()});render();await settle();seedPages();nav('任务记录');expect(field(featureText('en-US','任务每页数量')).props.value).toBe('12');nav('作品库');expect(field(featureText('en-US','图片每页数量')).props.value).toBe('12');
  });
  it('copies the complete saved path without treating it as a renderer-selected executable or arbitrary opener argument',async()=>{
    const writeText=vi.fn(async()=>{});vi.stubGlobal('navigator',{clipboard:{writeText}});const filePath='fixture/long folder/完整结果文件名.png';emit({type:'results',results:[{...result,filePath}]});render();nav('作品库');const card=nodes().find(n=>n.props.className==='comfy-studio-work-details')!;const copy=walk(card).find(n=>n.type==='button'&&n.props['aria-label']===`${featureText('en-US','复制路径')}: ${filePath}`)!;copy.props.onClick();await settle();expect(writeText).toHaveBeenCalledExactlyOnceWith(filePath);expect(api.openResult).not.toHaveBeenCalled();expect(api.start).not.toHaveBeenCalled();
  });
  it('localizes new pagination, layout and webpage controls in all five supported languages',()=>{
    const keys=['展开工作流库','收起工作流库','调整参数列宽度','历史状态未知','任务每页数量','图片每页数量','任务上一页','任务下一页','图片上一页','图片下一页','任务页码','图片页码','打开文件位置','打开 ComfyUI 网页'];
    for(const key of keys)for(const language of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR'] as const){const value=featureText(language,key);expect(value.trim()).not.toBe('');if(language!=='zh-CN')expect(value).not.toBe(key);}
  });
});

describe('Opening the local webpage does not require stopping a generation',()=>{
  it('permits one explicit webpage action while the real generation handler is pending and deduplicates simultaneous opens',async()=>{
    await selectWorkflow();let finishRun!:(value:ComfyResponse<ComfyRunSnapshot>)=>void,finishWeb!:(value:ComfyResponse<void>)=>void;
    vi.mocked(api.run).mockImplementationOnce(()=>new Promise(resolve=>{finishRun=resolve;}));api.openWeb=vi.fn(()=>new Promise<ComfyResponse<void>>(resolve=>{finishWeb=resolve;}));button('Queue generation').props.onClick();await settle();expect(button('Queue generation').props.disabled).toBe(true);
    const label=featureText('en-US','打开 ComfyUI 网页');expect(button(label).props.disabled).toBe(false);const handler=button(label).props.onClick;handler();handler();render();expect(api.openWeb).toHaveBeenCalledExactlyOnceWith();expect(button(label).props.disabled).toBe(true);
    finishWeb(ok(undefined));await settle();expect(button(label).props.disabled).toBe(false);expect(api.stop).not.toHaveBeenCalled();finishRun(ok(run));await settle();
  });
});


describe('late bundle replies never roll back newer snapshot events',()=>{
  const bundle=(state:ComfySnapshot):ComfyStateBundle=>({config,snapshot:state,workflows,results:[result],runs:[{...run,phase:'running',history:{restored:true,status:'unknown'}}],platform:{os:'win32',launchSupported:true,launchAcceptance:'unverified'}});
  const completed=():ComfySnapshot=>({...snapshot,activeRun:{...run,phase:'completed',finishedAt:'2026-10-20T00:01:00Z'}});
  function expectCompletedAndUsable(){
    expect(button('Cancel job')).toBeUndefined();expect(button('Queue generation').props.disabled).toBe(false);
    nav('任务记录');const history=nodes().find(n=>n.props['data-comfy-view']==='tasks')!;expect(visible(history)).toContain(featureText('en-US','已完成'));expect(visible(history)).not.toContain(featureText('en-US','历史状态未知'));nav('创作');
  }
  it('LATE01 initial load keeps a terminal snapshot event over its delayed running bundle and still loads other fields',async()=>{
    harness.reset();let resolve!:(value:ComfyResponse<ComfyStateBundle>)=>void;
    vi.mocked(api.getState).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));render();
    emit({type:'snapshot',snapshot:completed()});render();resolve(ok(bundle({...snapshot,activeRun:{...run,phase:'running'}})));await settle();await selectWorkflow();
    expectCompletedAndUsable();expect(button('Preview result 1')).toBeTruthy();expect(api.choosePython).not.toHaveBeenCalled();
  });
  it('LATE02 refresh merges history against the terminal event instead of a delayed old active run',async()=>{
    await selectWorkflow();emit({type:'snapshot',snapshot:{...snapshot,activeRun:{...run,phase:'running'}}});render();
    let resolve!:(value:ComfyResponse<ComfyStateBundle>)=>void;vi.mocked(api.getState).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
    button(featureText('en-US','刷新任务与结果')).props.onClick();await settle();emit({type:'snapshot',snapshot:completed()});render();
    resolve(ok(bundle({...snapshot,activeRun:{...run,phase:'running'}})));await settle();expectCompletedAndUsable();expect(button('Preview result 1')).toBeTruthy();
  });
  it('LATE03 an ordinary bundle without an intervening snapshot still supplies its active run normally',async()=>{
    await selectWorkflow();vi.mocked(api.getState).mockResolvedValueOnce(ok(bundle({...snapshot,activeRun:{...run,phase:'running'}})));
    await click(featureText('en-US','刷新任务与结果'));expect(button('Cancel job')).toBeTruthy();expect(button('Queue generation')).toBeUndefined();expect(api.run).not.toHaveBeenCalled();
  });
  it('LATE04 startup state reading uses the same event precedence while retaining persisted automatic port config',async()=>{
    emit({type:'snapshot',snapshot:{...snapshot,phase:'idle',owner:null}});render();
    let resolve!:(value:ComfyResponse<ComfyStateBundle>)=>void;vi.mocked(api.getState).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
    button('Start local ComfyUI').props.onClick();await settle();expect(api.start).toHaveBeenCalledTimes(1);expect(api.getState).toHaveBeenCalledTimes(2);
    emit({type:'snapshot',snapshot:completed()});render();const stale=bundle({...snapshot,activeRun:{...run,phase:'running'}});stale.config={...config,launch:{...config.launch,port:8189,portMode:'auto'},connection:{...config.connection,port:8189}};
    resolve(ok(stale));await settle();await selectWorkflow();expectCompletedAndUsable();await click('Environment settings');expect(field('Port').props.value).toBe('8189');
  });
});

describe('native submission recovery',()=>{
  const banner=()=>nodes().find(node=>node.props['data-comfy-submission-failure']);
  const reason=()=>nodes().find(node=>node.props.className==='comfy-studio-generate-reason');
  const failed=(code='execution_error',runId='run1'):ComfyRunSnapshot=>({...run,runId,phase:'failed',promptId:null,finishedAt:'2026-10-20T00:00:10Z',error:{code,message:'fixture native submission failure',nodeErrors:[]}});
  it('shows an immediate terminal failure and requires explicit stale-catalog re-analysis without resubmitting',async()=>{
    vi.useFakeTimers();await selectWorkflow();vi.mocked(api.run).mockResolvedValueOnce(ok(failed('COMFY_STALE_CATALOG_REANALYZE')));await click('Queue generation');
    expect(banner()!.props.role).toBe('alert');expect(visible(banner())).toContain('COMFY_STALE_CATALOG_REANALYZE');expect(visible(banner())).toContain('fixture native submission failure');
    expect(visible(reason())).not.toContain(translated('可以生成 · 参数已对应本机加载节点'));expect(reason()!.props['data-ready']).toBe(false);expect(button('Queue generation')).toBeUndefined();expect(button(translated('重新读取本机参数')).props.disabled).toBe(false);expect(button('Cancel job')).toBeUndefined();
    const analyses=vi.mocked(api.analyzeWorkflow).mock.calls.length;await vi.advanceTimersByTimeAsync(10000);await settle();expect(api.analyzeWorkflow).toHaveBeenCalledTimes(analyses);expect(api.run).toHaveBeenCalledTimes(1);
    await click(translated('重新读取本机参数'));expect(api.refreshInventory).toHaveBeenCalledTimes(1);expect(api.run).toHaveBeenCalledTimes(1);expect(button('Queue generation').props.disabled).toBe(false);expect(banner()).toBeTruthy();expect(reason()!.props['data-ready']).toBe(false);
    vi.mocked(api.run).mockResolvedValueOnce(ok({...run,runId:'after-explicit-reload',phase:'completed',startedAt:'2026-10-20T00:01:00Z'}));await click('Queue generation');expect(api.run).toHaveBeenCalledTimes(2);expect(banner()).toBeUndefined();
  });
  it('shows asynchronous run failures in create and clears them only for a newer successful submission',async()=>{
    await selectWorkflow();await click('Queue generation');expect(button('Cancel job')).toBeTruthy();
    const failure={...failed(),error:{code:'execution_error',message:'fixture GPU failure',nodeErrors:[{nodeId:'6',classType:'KSampler',message:'fixture OOM',details:'fixture node trace'}]}};
    emit({type:'run',run:failure});await settle();expect(visible(banner())).toContain('fixture GPU failure');expect(button('Cancel job')).toBeUndefined();expect(button('Queue generation').props.disabled).toBe(false);expect(reason()!.props['data-ready']).toBe(false);
    await click(translated('查看任务记录'));expect(nodes().find(n=>n.props['data-comfy-view']==='tasks')).toBeTruthy();expandTask('run1');expect(visible(tree)).toContain('fixture OOM');expect(visible(tree)).toContain('fixture node trace');nav('创作');expect(banner()).toBeTruthy();
    const completed:ComfyRunSnapshot={...run,runId:'successful-retry',phase:'completed',startedAt:'2026-10-20T00:01:00Z',finishedAt:'2026-10-20T00:01:10Z'};
    vi.mocked(api.run).mockResolvedValueOnce(ok(completed));await click('Queue generation');expect(api.run).toHaveBeenCalledTimes(2);expect(banner()).toBeUndefined();expect(reason()!.props['data-ready']).toBe(true);
    emit({type:'run',run:failure});emit({type:'run',run:{...run,phase:'running'}});emit({type:'run',run:{...failed('late-terminal-error',completed.runId),startedAt:completed.startedAt}});await settle();
    const unseenOld:ComfyRunSnapshot={...run,runId:'never-observed-older',phase:'running',startedAt:'2026-10-19T00:00:00Z'};emit({type:'run',run:unseenOld});emit({type:'snapshot',snapshot:{...snapshot,activeRun:unseenOld}});await settle();
    expect(banner()).toBeUndefined();expect(button('Cancel job')).toBeUndefined();expect(button('Queue generation').props.disabled).toBe(false);
  });
  it('shows terminal failures delivered only through the snapshot channel',async()=>{
    await selectWorkflow();await click('Queue generation');emit({type:'snapshot',snapshot:{...snapshot,activeRun:failed('snapshot_failure')}});await settle();
    expect(visible(banner())).toContain('[snapshot_failure]');expect(button('Cancel job')).toBeUndefined();expect(button('Queue generation').props.disabled).toBe(false);expect(reason()!.props['data-ready']).toBe(false);
  });
  it('keeps the persistent error outside compact panes and provides a fallback when no error object exists',async()=>{
    await selectWorkflow();emit({type:'run',run:{...failed(),error:null}});await settle();
    expect(visible(banner())).toContain(translated('生成失败，请查看任务记录。'));expect(comfyStudioLayout(640,false).mode).toBe('tabs');
    for(const pane of nodes().filter(node=>['parameters','canvas'].includes(node.props['data-comfy-region'])))expect(walk(pane)).not.toContain(banner());
    expect(nodes().filter(node=>node.props.hidden&&walk(node).includes(banner()!))).toHaveLength(0);expect(button('Queue generation').props.disabled).toBe(false);expect(reason()!.props['data-ready']).toBe(false);
  });
  it('does not let another workflow failure or a late older receipt poison the current workflow',async()=>{
    workflows.push(workflowFixture('wf2'));emit({type:'workflows',workflows});await selectWorkflow();emit({type:'run',run:failed('COMFY_STALE_VALUES_REANALYZE')});await settle();expect(button('Queue generation')).toBeUndefined();expect(button(translated('重新读取本机参数'))).toBeTruthy();
    await selectWorkflow('wf2');expect(banner()).toBeUndefined();expect(button('Queue generation').props.disabled).toBe(false);
    emit({type:'run',run:{...failed('late_other_workflow','older-other'),startedAt:'2026-10-19T00:00:00Z'}});await settle();expect(banner()).toBeUndefined();expect(button('Queue generation').props.disabled).toBe(false);
    await selectWorkflow('wf1');expect(visible(banner())).toContain('COMFY_STALE_VALUES_REANALYZE');expect(button('Queue generation').props.disabled).toBe(false);expect(api.run).not.toHaveBeenCalled();
  });
  it('does not convert restored failed receipts into live failures or overwrite a live completed outcome',async()=>{
    await selectWorkflow();emit({type:'run',run:{...failed('COMFY_STALE_ANALYSIS'),history:{restored:true,status:'recorded',resultCount:0}}});await settle();expect(banner()).toBeUndefined();expect(button('Queue generation').props.disabled).toBe(false);nav('任务记录');expect(visible(tree)).toContain('COMFY_STALE_ANALYSIS');expect(visible(tree)).toContain('fixture native submission failure');nav('创作');
    emit({type:'run',run:{...run,phase:'completed'}});await settle();emit({type:'run',run:{...failed(),history:{restored:true,status:'recorded',resultCount:0}}});await settle();expect(banner()).toBeUndefined();expect(button('Queue generation').props.disabled).toBe(false);expect(api.run).not.toHaveBeenCalled();
  });
  it('does not let an analysis started before a terminal stale error silently acknowledge that failure',async()=>{
    await selectWorkflow();emit({type:'run',run});await settle();const earlier=deferred<ComfyResponse<ComfyAnalysis>>();vi.mocked(api.analyzeWorkflow).mockImplementationOnce(()=>earlier.promise);button('Analyze again').props.onClick();await settle();
    emit({type:'run',run:failed('COMFY_STALE_ANALYSIS')});await settle();earlier.resolve(ok(report));await settle();expect(button('Queue generation')).toBeUndefined();expect(button(translated('重新读取本机参数'))).toBeTruthy();expect(visible(banner())).toContain('COMFY_STALE_ANALYSIS');
    const count=vi.mocked(api.analyzeWorkflow).mock.calls.length;await settle();expect(api.analyzeWorkflow).toHaveBeenCalledTimes(count);await click('Analyze again');expect(button('Queue generation').props.disabled).toBe(false);expect(api.run).not.toHaveBeenCalled();
  });
  it('retains envelope rejection feedback without creating or submitting a fake receipt',async()=>{
    await selectWorkflow();vi.mocked(api.run).mockResolvedValueOnce({ok:false,error:{code:'invalid-request',message:'fixture rejected envelope'}});await click('Queue generation');
    expect(visible(tree)).toContain('fixture rejected envelope');expect(banner()).toBeUndefined();expect(api.run).toHaveBeenCalledTimes(1);expect(button('Queue generation').props.disabled).toBe(false);
  });
  it('treats the fresh schema compatibility error as an explicit reload action rather than a generation',async()=>{
    await selectWorkflow();emit({type:'run',run:failed('COMFY_STALE_SCHEMA_REANALYZE')});await settle();expect(button('Queue generation')).toBeUndefined();expect(visible(banner())).toContain('COMFY_STALE_SCHEMA_REANALYZE');
    await click(translated('重新读取本机参数'));expect(api.refreshInventory).toHaveBeenCalledTimes(1);expect(api.run).not.toHaveBeenCalled();expect(button('Queue generation').props.disabled).toBe(false);
  });
  it.each(['submission-uncertain','monitoring-lost','monitoring-timeout'])('requires explicit verification for the real %s error without inventing an uncertain phase',async code=>{
    await selectWorkflow();vi.mocked(api.run).mockResolvedValueOnce(ok({...failed(code),promptId:code==='submission-uncertain'?null:'known-prompt'}));await click('Queue generation');
    expect(banner()!.props['data-comfy-submission-uncertain']).toBe(true);expect(visible(banner())).toContain(translated('可能已经提交；请先核对 ComfyUI 队列或历史。'));expect(field(translated('我已核对，仍要再次提交')).props.checked).toBe(false);expect(button('Queue generation').props.disabled).toBe(true);
    const analyses=vi.mocked(api.analyzeWorkflow).mock.calls.length;await click('Queue generation');expect(api.run).toHaveBeenCalledTimes(1);expect(api.analyzeWorkflow).toHaveBeenCalledTimes(analyses);
    change(translated('我已核对，仍要再次提交'),true);expect(api.run).toHaveBeenCalledTimes(1);expect(api.analyzeWorkflow).toHaveBeenCalledTimes(analyses);expect(button('Queue generation').props.disabled).toBe(false);expect(reason()!.props['data-ready']).toBe(false);
    change(translated('我已核对，仍要再次提交'),false);expect(button('Queue generation').props.disabled).toBe(true);change(translated('我已核对，仍要再次提交'),true);
    vi.mocked(api.run).mockResolvedValueOnce(ok({...run,runId:'checked-explicit-retry',phase:'completed',startedAt:'2026-10-20T00:01:00Z'}));await click('Queue generation');expect(api.run).toHaveBeenCalledTimes(2);expect(banner()).toBeUndefined();
  });
  it('restores unknown history conservatively and never persists or automatically selects its verification checkbox',async()=>{
    const restored:ComfyRunSnapshot={...run,phase:'running',history:{restored:true,status:'unknown',resultCount:0}};
    vi.mocked(api.getState).mockImplementation(async()=>ok({config,snapshot,workflows,results:[],runs:[restored],platform:{os:'win32',launchSupported:true,launchAcceptance:'unverified'}}));
    harness.reset();render();await settle();await selectWorkflow();expect(banner()!.props['data-comfy-submission-uncertain']).toBe(true);expect(button('Cancel job')).toBeUndefined();expect(button('Queue generation').props.disabled).toBe(true);expect(field(translated('我已核对，仍要再次提交')).props.checked).toBe(false);
    change(translated('我已核对，仍要再次提交'),true);expect(button('Queue generation').props.disabled).toBe(false);expect(api.run).not.toHaveBeenCalled();
    harness.reset();render();await settle();await selectWorkflow();expect(field(translated('我已核对，仍要再次提交')).props.checked).toBe(false);expect(button('Queue generation').props.disabled).toBe(true);expect(api.run).not.toHaveBeenCalled();
  });
  it('isolates late results and failures from workflow A while workflow B retains its selected canvas and draft',async()=>{
    workflows.push(workflowFixture('wf2'));emit({type:'workflows',workflows});const imageA={...result,id:'image-a',workflowId:'wf1',fileUrl:'nai-local://fixture/a'},imageB={...result,id:'image-b',workflowId:'wf2',fileUrl:'nai-local://fixture/b'},newB={...result,id:'new-b',workflowId:'wf2',fileUrl:'nai-local://fixture/new-b'};
    const canvasImage=()=>walk(nodes().find(n=>n.props['data-comfy-region']==='canvas')).find(n=>n.type==='img'&&n.props.className==='comfy-local-canvas-image');
    emit({type:'results',results:[imageA,imageB]});await selectWorkflow('wf1');expect(canvasImage()!.props.src).toBe(imageA.fileUrl);await selectWorkflow('wf2');expect(canvasImage()!.props.src).toBe(imageB.fileUrl);
    emit({type:'results',results:[newB,imageA,imageB]});await settle();expect(canvasImage()!.props.src).toBe(newB.fileUrl);change('Positive prompt · 4.text','workflow B draft');const analyses=vi.mocked(api.analyzeWorkflow).mock.calls.length;
    emit({type:'results',results:[{...imageA,id:'late-new-a',fileUrl:'nai-local://fixture/late-a'},newB,imageA,imageB]});emit({type:'run',run:failed('late A failure')});await settle();
    expect(canvasImage()!.props.src).toBe(newB.fileUrl);expect(field('Positive prompt · 4.text').props.value).toBe('workflow B draft');expect(banner()).toBeUndefined();expect(button('Queue generation').props.disabled).toBe(false);expect(api.analyzeWorkflow).toHaveBeenCalledTimes(analyses);expect(api.run).not.toHaveBeenCalled();
  });
  it('keeps workflow B canvas unchanged through gallery pagination when late A results push B off the page',async()=>{
    workflows.push(workflowFixture('wf2'));emit({type:'workflows',workflows});const imageB={...result,id:'gallery-b',workflowId:'wf2',fileUrl:'nai-local://fixture/gallery-b'};
    const canvasImage=()=>walk(nodes().find(n=>n.props['data-comfy-region']==='canvas')).find(n=>n.type==='img'&&n.props.className==='comfy-local-canvas-image');
    emit({type:'results',results:[imageB]});await selectWorkflow('wf2');change('Positive prompt · 4.text','gallery must not overwrite B');expect(canvasImage()!.props.src).toBe(imageB.fileUrl);nav('作品库');await settle();
    const lateA=Array.from({length:12},(_,index)=>({...result,id:`late-gallery-a-${index}`,workflowId:'wf1',fileUrl:`nai-local://fixture/gallery-a-${index}`}));emit({type:'results',results:[...lateA,imageB]});await settle();nav('创作');
    expect(canvasImage()!.props.src).toBe(imageB.fileUrl);expect(field('Positive prompt · 4.text').props.value).toBe('gallery must not overwrite B');expect(button('Queue generation').props.disabled).toBe(false);expect(api.run).not.toHaveBeenCalled();
  });
  it('views the image workflow without reusing image parameters and restores the previous workflow draft',async()=>{
    workflows[0].savedValues={'positive:4:text':'saved workflow A prompt'};workflows.push(workflowFixture('wf2'));emit({type:'workflows',workflows});
    const imageA={...result,id:'view-a',workflowId:'wf1',fileUrl:'nai-local://fixture/view-a',slotValues:{'positive:4:text':'old image A prompt'}},imageB={...result,id:'view-b',workflowId:'wf2',fileUrl:'nai-local://fixture/view-b'};
    emit({type:'results',results:[imageB,imageA]});await selectWorkflow('wf2');change('Positive prompt · 4.text','unsaved workflow B draft');change('Model file · 1.unet_name','alternate.safetensors');nav('作品库');
    nodes().find(n=>n.props['data-comfy-result-id']===imageA.id)!.props.onClick();await settle();await click(translated('在创作台查看'));
    expect(visible(rawButton(translated('选择工作流')))).toContain('Workflow wf1');expect(field('Positive prompt · 4.text').props.value).toBe('saved workflow A prompt');expect(api.reuseResult).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
    expect(walk(nodes().find(n=>n.props['data-comfy-region']==='canvas')).some(n=>n.type==='img'&&n.props.src===imageA.fileUrl)).toBe(true);
    await selectWorkflow('wf2');expect(field('Positive prompt · 4.text').props.value).toBe('unsaved workflow B draft');expect(field('Model file · 1.unet_name').props.value).toBe('alternate.safetensors');expect(workflows.find(item=>item.id==='wf2')!.savedValues).toEqual({});expect(api.run).not.toHaveBeenCalled();
  });
  it('viewing a result from the already selected workflow leaves its current draft and analysis untouched',async()=>{
    await selectWorkflow();change('Positive prompt · 4.text','same workflow unsaved draft');emit({type:'results',results:[{...result,slotValues:{'positive:4:text':'old result prompt'}}]});await settle();const analyses=vi.mocked(api.analyzeWorkflow).mock.calls.length;
    nav('作品库');await click(translated('在创作台查看'));expect(field('Positive prompt · 4.text').props.value).toBe('same workflow unsaved draft');expect(api.analyzeWorkflow).toHaveBeenCalledTimes(analyses);expect(api.reuseResult).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
  });
  it('does not display a deleted workflow image as the currently edited workflow',async()=>{
    workflows.push(workflowFixture('wf2'));emit({type:'workflows',workflows});const removedImage={...result,id:'deleted-workflow-image',workflowId:'wf1',fileUrl:'nai-local://fixture/deleted-image'},imageB={...result,id:'current-b',workflowId:'wf2',fileUrl:'nai-local://fixture/current-b'};
    emit({type:'results',results:[imageB,removedImage]});await selectWorkflow('wf2');change('Positive prompt · 4.text','B draft survives unavailable workflow');workflows=workflows.filter(item=>item.id!=='wf1');emit({type:'workflows',workflows});nav('作品库');
    nodes().find(n=>n.props['data-comfy-result-id']===removedImage.id)!.props.onClick();await settle();const analyses=vi.mocked(api.analyzeWorkflow).mock.calls.length;await click(translated('在创作台查看'));
    expect(nodes().find(n=>n.props['data-comfy-view']==='works')).toBeTruthy();expect(visible(tree)).toContain(translated('原工作流不可用'));expect(api.analyzeWorkflow).toHaveBeenCalledTimes(analyses);nav('创作');
    expect(visible(rawButton(translated('选择工作流')))).toContain('Workflow wf2');expect(field('Positive prompt · 4.text').props.value).toBe('B draft survives unavailable workflow');expect(walk(nodes().find(n=>n.props['data-comfy-region']==='canvas')).some(n=>n.type==='img'&&n.props.src===imageB.fileUrl)).toBe(true);expect(api.run).not.toHaveBeenCalled();
  });
  it('keeps the existing cancellation summaries persistent in both parameter and image views without green success',async()=>{
    await selectWorkflow();emit({type:'run',run:{...run,phase:'cancelled'}});await settle();expect(visible(reason())).toContain(translated('已取消'));expect(visible(reason())).not.toContain(translated('可以生成 · 参数已对应本机加载节点'));expect(reason()!.props['data-ready']).toBe(false);
    expect(nodes().some(n=>n.props.className==='comfy-studio-cancelled-note')).toBe(true);expect(banner()).toBeUndefined();expect(button('Cancel job')).toBeUndefined();expect(button('Queue generation').props.disabled).toBe(false);expect(api.run).not.toHaveBeenCalled();
  });
  it('localizes persistent submission failures and task navigation in all five languages',()=>{
    for(const key of ['生成失败','生成失败，请查看任务记录。','生成失败；请重新分析后再生成。','上次生成失败；检查错误后可手动重试。','查看任务记录','重新读取本机参数','提交结果未确认','可能已经提交；请先核对 ComfyUI 队列或历史。','我已核对，仍要再次提交'])for(const language of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR'] as const){const value=featureText(language,key);expect(value.trim()).not.toBe('');if(language!=='zh-CN')expect(value).not.toBe(key);}
  });
});


describe('workbench refresh contract (R01-R15): read-only whole-workbench refresh preserves editing',()=>{
  const refreshLabel=()=>translated('刷新工作台');
  const refresh=async()=>{button(refreshLabel()).props.onClick();await settle();};
  const bundle=(patch:Partial<ComfyStateBundle>={}):ComfyStateBundle=>({config,snapshot,workflows,results:[],runs:[],platform:{os:'win32',launchSupported:true,launchAcceptance:'unverified'},...patch});
  const section=(key:string)=>{if(!nodes().some(n=>n.props['data-comfy-refresh-section']===key))nav('服务菜单');return nodes().find(n=>n.props['data-comfy-refresh-section']===key)!;};
  const forbidden=()=>{for(const key of ['run','start','connect','disconnect','stop','cancel','reuseResult','setConnection','setLaunchOptions','detectInstall','choosePython','chooseInstallDirectory'] as const)expect(api[key],key).not.toHaveBeenCalled();};
  const clearReads=()=>{vi.mocked(api.getState).mockClear();vi.mocked(api.refreshInventory).mockClear();vi.mocked(api.analyzeWorkflow).mockClear();};
  it('R01 reads state, inventory and selected values exactly once without starting, generating or configuring',async()=>{
    await selectWorkflow();change('Positive prompt · 4.text','edited draft remains');clearReads();await refresh();
    expect(api.getState).toHaveBeenCalledTimes(1);expect(api.refreshInventory).toHaveBeenCalledTimes(1);expect(api.analyzeWorkflow).toHaveBeenCalledExactlyOnceWith('wf1',{'positive:4:text':'edited draft remains'});
    expect(field('Positive prompt · 4.text').props.value).toBe('edited draft remains');expect(section('analysis').props['data-status']).toBe('ok');expect(visible(tree)).toContain(translated('健康状态由后台定期检查；本次清单读取结果如下。'));forbidden();
  });
  it('R02 shares one flight across toolbar, more menu, works and task entry handlers without disabling edits',async()=>{
    await selectWorkflow();clearReads();const pending=deferred<ComfyResponse<ComfyStateBundle>>();vi.mocked(api.getState).mockImplementationOnce(()=>pending.promise);
    const handlers=[button(refreshLabel()).props.onClick];nav('更多操作');handlers.push(nodes().filter(n=>n.props['data-comfy-refresh']).at(-1)!.props.onClick);nav('作品库');handlers.push(nodes().filter(n=>n.props['data-comfy-refresh']).at(-1)!.props.onClick);nav('任务记录');handlers.push(nodes().filter(n=>n.props['data-comfy-refresh']).at(-1)!.props.onClick);nav('创作');
    handlers.forEach(fn=>fn());await settle();expect(api.getState).toHaveBeenCalledTimes(1);expect(button(refreshLabel()).props.disabled).toBe(true);expect(button(refreshLabel()).props['aria-busy']).toBe(true);
    expect(field('Positive prompt · 4.text').props.disabled).toBe(false);expect(field(translated('每次随机种子')).props.disabled).toBe(false);expect(button('Queue generation').props.disabled).toBe(true);
    const count=vi.mocked(api.analyzeWorkflow).mock.calls.length;button('Queue generation').props.onClick();await settle();expect(api.analyzeWorkflow).toHaveBeenCalledTimes(count);expect(api.run).not.toHaveBeenCalled();
    pending.resolve(ok(bundle()));await settle();expect(api.refreshInventory).toHaveBeenCalledTimes(1);expect(api.analyzeWorkflow).toHaveBeenCalledTimes(1);expect(button(refreshLabel()).props.disabled).toBe(false);forbidden();
  });
  it.each(['initial','refresh'] as const)('R03 keeps newer workflow/result pushes over a delayed %s bundle',async mode=>{
    const pending=deferred<ComfyResponse<ComfyStateBundle>>(),old=bundle({workflows:[{...workflowFixture(),name:'old bundle workflow'}],results:[{...result,id:'old-bundle'}]});
    vi.mocked(api.getState).mockImplementationOnce(()=>pending.promise);
    if(mode==='initial'){harness.reset();render();}else{button(refreshLabel()).props.onClick();await settle();}
    emit({type:'workflows',workflows:[{...workflowFixture('wf-new'),name:'new pushed workflow'}]});emit({type:'results',results:[{...result,id:'new-push',fileUrl:'nai-local://new-push'}]});render();pending.resolve(ok(old));await settle();showLibrary();expect(visible(tree)).toContain('new pushed workflow');expect(visible(tree)).not.toContain('old bundle workflow');
    nav('作品库');expect(nodes().some(n=>n.type==='img'&&n.props.src==='nai-local://new-push')).toBe(true);expect(nodes().some(n=>n.type==='img'&&n.props.src===result.fileUrl)).toBe(false);
    if(mode==='refresh'){expect(section('state').props['data-status']).toBe('ok');expect(visible(tree)).toContain(translated('已保留较新的推送'));}forbidden();
  });
  it('R04 keeps the form mounted and drops analysis after an edit without automatically retrying',async()=>{
    await selectWorkflow();clearReads();const pending=deferred<ComfyResponse<ComfyAnalysis>>();vi.mocked(api.analyzeWorkflow).mockImplementationOnce(()=>pending.promise);button(refreshLabel()).props.onClick();await settle();
    expect(parameterText()).not.toContain(translated('正在分析工作流'));expect(field('Positive prompt · 4.text')).toBeTruthy();change('Positive prompt · 4.text','new text during background read');
    const late=structuredClone(report);late.slots.find(slot=>slot.kind==='positive')!.defaultValue='must not replace draft';pending.resolve(ok(late));await settle();
    expect(field('Positive prompt · 4.text').props.value).toBe('new text during background read');expect(api.analyzeWorkflow).toHaveBeenCalledTimes(1);expect(section('analysis').props['data-status']).toBe('superseded');expect(visible(tree)).toContain(translated('参数在刷新期间有改动，模型选项未更新，可点击重新分析'));forbidden();
  });
  it.each(['resolve','reject'] as const)('R05 ignores old background %s after switching and retains both workflow drafts',async outcome=>{
    workflows.push(workflowFixture('wf2'));emit({type:'workflows',workflows});render();await selectWorkflow();change('Positive prompt · 4.text','workflow one draft');clearReads();
    const pending=deferred<ComfyResponse<ComfyAnalysis>>();vi.mocked(api.analyzeWorkflow).mockImplementationOnce(()=>pending.promise);button(refreshLabel()).props.onClick();await settle();await selectWorkflow('wf2');change('Positive prompt · 4.text','workflow two draft');
    if(outcome==='resolve')pending.resolve(ok(report));else pending.reject(new Error('old background failure must stay hidden'));await settle();expect(field('Positive prompt · 4.text').props.value).toBe('workflow two draft');expect(visible(tree)).not.toContain('old background failure must stay hidden');expect(button('Queue generation').props.disabled).toBe(false);
    await selectWorkflow('wf1');expect(field('Positive prompt · 4.text').props.value).toBe('workflow one draft');await selectWorkflow('wf2');expect(field('Positive prompt · 4.text').props.value).toBe('workflow two draft');forbidden();
  });
  it('R06 keeps old analysis and generate availability when inventory fails, while records still update',async()=>{
    await selectWorkflow();clearReads();vi.mocked(api.refreshInventory).mockRejectedValueOnce(new Error('[inventory-fixture] read failed'));vi.mocked(api.getState).mockResolvedValueOnce(ok(bundle({results:[result],runs:[{...run,phase:'completed'}],runHistoryIncomplete:true})));await refresh();
    expect(field('Positive prompt · 4.text').props.value).toBe('a tree');expect(button('Queue generation').props.disabled).toBe(false);expect(api.analyzeWorkflow).not.toHaveBeenCalled();expect(section('inventory').props['data-status']).toBe('failed');expect(visible(tree)).toContain('[inventory-fixture] read failed');nav('服务菜单');expect(visible(tree)).toContain(translated('尚未完成完整刷新'));nav('任务记录');expect(visible(tree)).toContain(translated('部分历史未加载，仅显示最近可读记录。'));expect(visible(tree)).toContain(translated('已完成'));forbidden();
  });
  it('R07 keeps edited form but fails Generate closed until an explicit analysis succeeds',async()=>{
    await selectWorkflow();change('Positive prompt · 4.text','preserved through failed analysis');clearReads();vi.mocked(api.analyzeWorkflow).mockRejectedValueOnce(new Error('[analysis-fixture] failed'));await refresh();
    expect(field('Positive prompt · 4.text').props.value).toBe('preserved through failed analysis');expect(parameterText()).not.toContain(translated('工作流分析失败'));expect(parameterText()).not.toContain(translated('正在分析工作流'));expect(button('Queue generation').props.disabled).toBe(true);expect(parameterText()).toContain(translated('模型清单已更新但参数分析失败，请重新分析'));expect(section('analysis').props['data-status']).toBe('failed');
    button('Queue generation').props.onClick();await settle();expect(api.analyzeWorkflow).toHaveBeenCalledTimes(1);expect(api.run).not.toHaveBeenCalled();await click('Analyze again');expect(button('Queue generation').props.disabled).toBe(false);expect(field('Positive prompt · 4.text').props.value).toBe('preserved through failed analysis');forbidden();
  });
  it.each([[false,false],[true,false],[false,true],[true,true]] as const)('R08 binds trust and conversion acknowledgements (fingerprint changed=%s, conversion changed=%s)',async(fingerprintChanged,conversionChanged)=>{
    report.thirdPartyFingerprint='fingerprint-A';report.thirdParty=[{classType:'CustomFixture',pythonModule:'custom_nodes.fixture',nodeIds:['9']}];report.unverifiedConversion=true;report.conversion={verified:false,totals:{input:1,accounted:1},fates:{converted:1},nodes:[]};await selectWorkflow();await click('Analysis report');change('I trust this node list',true);change('I accept the unverified UI workflow conversion',true);expect(button('Queue generation').props.disabled).toBe(false);clearReads();
    if(fingerprintChanged)report.thirdPartyFingerprint='fingerprint-B';if(conversionChanged)report.conversion.totals.input=2;else report.conversion={nodes:[],fates:{converted:1},totals:{accounted:1,input:1},verified:false};await refresh();
    expect(field('I trust this node list').props.checked).toBe(!fingerprintChanged);expect(field('I accept the unverified UI workflow conversion').props.checked).toBe(!conversionChanged);expect(button('Queue generation').props.disabled).toBe(fingerprintChanged||conversionChanged);forbidden();
  });
  it.each(['idle','probing'] as const)('R09 does not start or connect an offline %s service',async phase=>{
    snapshot={...snapshot,phase,owner:null};emit({type:'snapshot',snapshot});render();clearReads();await refresh();expect(api.refreshInventory).not.toHaveBeenCalled();expect(api.analyzeWorkflow).not.toHaveBeenCalled();expect(section('inventory').props['data-status']).toBe('skipped');expect(visible(tree)).toContain(translated('服务未连接，未读取模型清单；刷新不会连接或启动。'));expect(visible(tree)).toContain(translated('工作台刷新完成'));expect(visible(tree)).toContain(translated('尚未完成完整刷新'));forbidden();
  });
  it('R10 keeps active run and newer progress without canceling or submitting',async()=>{
    await selectWorkflow();emit({type:'run',run:{...run,phase:'running',nodesExecuted:1}});render();clearReads();const pending=deferred<ComfyResponse<ComfyStateBundle>>();vi.mocked(api.getState).mockImplementationOnce(()=>pending.promise);button(refreshLabel()).props.onClick();await settle();emit({type:'run',run:{...run,phase:'running',nodesExecuted:5,progress:{value:5,max:8}}});render();pending.resolve(ok(bundle()));await settle();expect(button('Cancel job')).toBeTruthy();expect(button('Queue generation')).toBeUndefined();expect(nodes().some(n=>n.type==='progress'&&n.props.value===5)).toBe(true);forbidden();
  });
  it.each(['resolve','reject'] as const)('R11 ignores a %s after unmount without setState or extra reads',async outcome=>{
    await selectWorkflow();clearReads();const pending=deferred<ComfyResponse<ComfyStateBundle>>();vi.mocked(api.getState).mockImplementationOnce(()=>pending.promise);button(refreshLabel()).props.onClick();await settle();harness.reset();if(outcome==='resolve')pending.resolve(ok(bundle()));else pending.reject(new Error('unmounted read failed'));for(let i=0;i<100;i++)await Promise.resolve();expect(api.getState).toHaveBeenCalledTimes(1);expect(api.refreshInventory).not.toHaveBeenCalled();expect(api.analyzeWorkflow).not.toHaveBeenCalled();forbidden();
  });
  it('R12 keeps existing error notices while reporting a separate refresh failure',async()=>{
    await selectWorkflow();nav('作品库');vi.mocked(api.openResultsFolder).mockRejectedValueOnce(new Error('existing folder notice'));await click(translated('打开结果目录'));expect(visible(tree)).toContain('existing folder notice');clearReads();vi.mocked(api.refreshInventory).mockRejectedValueOnce(new Error('separate inventory failure'));await refresh();expect(visible(tree)).toContain('existing folder notice');expect(visible(tree)).toContain('separate inventory failure');await click(translated('关闭刷新提示'));expect(visible(tree)).toContain('existing folder notice');expect(nodes().find(n=>n.props['data-comfy-refresh-outcome'])).toBeUndefined();forbidden();
  });
  it('R12b preserves the same-parameters notice without automatically submitting again',async()=>{
    await selectWorkflow();emit({type:'results',results:[result]});render();await click(translated('同参数再生成'));expect(visible(tree)).toContain(translated('已回填相同参数；检查后点击生成，不会自动提交。'));vi.mocked(api.reuseResult).mockClear();clearReads();vi.mocked(api.getState).mockResolvedValueOnce(ok(bundle({results:[result]})));await refresh();expect(visible(tree)).toContain(translated('已回填相同参数；检查后点击生成，不会自动提交。'));forbidden();
  });
  it('R13 preserves the selected gallery and canvas result when a refreshed index adds a newer image',async()=>{
    await selectWorkflow();const items=Array.from({length:25},(_,i)=>({...result,id:`image-${i}`,fileUrl:`nai-local://image-${i}`}));emit({type:'results',results:items});render();nav('作品库');nodes().find(n=>n.type==='button'&&n.props.className==='comfy-studio-gallery-image'&&walk(n).some(child=>child.type==='img'&&child.props.src==='nai-local://image-2'))!.props.onClick();render();await click(translated('在创作台查看'));expect(nodes().find(n=>n.props.className==='comfy-local-canvas-image')!.props.src).toBe('nai-local://image-2');nav('作品库');clearReads();vi.mocked(api.getState).mockResolvedValueOnce(ok(bundle({results:[{...result,id:'newest',fileUrl:'nai-local://newest'},...items]})));await refresh();
    expect(nodes().find(n=>n.type==='button'&&n.props.className==='comfy-studio-gallery-image'&&n.props['aria-pressed'])!.props.children[0].props.src).toBe('nai-local://image-2');nav('创作');expect(nodes().find(n=>n.props.className==='comfy-local-canvas-image')!.props.src).toBe('nai-local://image-2');forbidden();
  });
  it('R13b clamps pagination after removal without modifying the retained selected image',async()=>{
    await selectWorkflow();seedPages(25);nav('作品库');change(translated('图片页码'),'3');expect(field(translated('图片页码')).props.value).toBe(3);clearReads();vi.mocked(api.getState).mockResolvedValueOnce(ok(bundle({results:Array.from({length:14},(_,i)=>({...result,id:`page-result-${i}`}))})));await refresh();expect(field(translated('图片页码')).props.value).toBe(2);forbidden();
  });
  it('R14 preserves explicit uncertainty acknowledgement and never resends',async()=>{
    await selectWorkflow();const failed:ComfyRunSnapshot={...run,phase:'failed',promptId:null,error:{code:'submission-uncertain',message:'uncertain fixture',nodeErrors:[]}};emit({type:'run',run:failed});render();change(translated('我已核对，仍要再次提交'),true);clearReads();vi.mocked(api.getState).mockResolvedValueOnce(ok(bundle({runs:[failed]})));await refresh();expect(field(translated('我已核对，仍要再次提交')).props.checked).toBe(true);expect(button('Queue generation').props.disabled).toBe(false);forbidden();
  });
  it.each(['success','inventory-failed','analysis-failed'] as const)('R15 satisfies a stale-catalog gate only after fresh inventory and analysis: %s',async outcome=>{
    await selectWorkflow();emit({type:'run',run:{...run,phase:'failed',promptId:null,error:{code:'COMFY_STALE_CATALOG_REANALYZE',message:'stale fixture',nodeErrors:[]}}});render();expect(button(translated('重新读取本机参数'))).toBeTruthy();clearReads();if(outcome==='inventory-failed')vi.mocked(api.refreshInventory).mockRejectedValueOnce(new Error('fresh inventory failed'));if(outcome==='analysis-failed')vi.mocked(api.analyzeWorkflow).mockRejectedValueOnce(new Error('fresh analysis failed'));await refresh();if(outcome==='success'){expect(button('Queue generation').props.disabled).toBe(false);expect(button(translated('重新读取本机参数'))).toBeUndefined();}else{expect(button(translated('重新读取本机参数'))).toBeTruthy();expect(button('Queue generation')).toBeUndefined();}forbidden();
  });
  it('R19 ignores inventory results after a service lifecycle change and keeps a partial status',async()=>{
    await selectWorkflow();clearReads();const pending=deferred<ReturnType<typeof ok<import('./comfyui/contract').ComfyInventorySummary>>>();vi.mocked(api.refreshInventory).mockImplementationOnce(()=>pending.promise);button(refreshLabel()).props.onClick();await settle();snapshot={...snapshot,phase:'idle',owner:null};emit({type:'snapshot',snapshot});render();pending.resolve(ok({fetchedAt:'2026-10-20T00:00:00Z',nodeTypeCount:100,catalogRevision:'catalog-new',modelFolders:null}));await settle();expect(section('inventory').props['data-status']).toBe('superseded');expect(api.analyzeWorkflow).not.toHaveBeenCalled();expect(visible(tree)).toContain(translated('工作台部分刷新'));forbidden();
  });
  it('R20 keeps records and the last successful timestamp after a state-read failure without re-reading inventory',async()=>{
    await selectWorkflow();await refresh();nav('服务菜单');const successText=visible(nodes().find(n=>n.props.className==='comfy-workbench-refresh-status'));expect(successText).toContain('Last full refresh:');clearReads();vi.mocked(api.getState).mockRejectedValueOnce(new Error('state read fixture failed'));await refresh();expect(section('state').props['data-status']).toBe('failed');expect(api.refreshInventory).not.toHaveBeenCalled();expect(api.analyzeWorkflow).not.toHaveBeenCalled();expect(field('Positive prompt · 4.text').props.value).toBe('a tree');expect(button('Queue generation').props.disabled).toBe(false);expect(visible(nodes().find(n=>n.props.className==='comfy-workbench-refresh-status'))).toContain(successText.match(/Last full refresh: [^L]+/)![0].trim());forbidden();
  });
  it('R21 does not analyze a loading foreground form or retry an existing analysis error',async()=>{
    await selectWorkflow();vi.mocked(api.analyzeWorkflow).mockRejectedValueOnce(new Error('foreground failed'));await click('Analyze again');clearReads();await refresh();expect(api.analyzeWorkflow).not.toHaveBeenCalled();expect(section('analysis').props['data-status']).toBe('skipped');expect(parameterText()).toContain('foreground failed');forbidden();
  });
  it('R22 does not submit a conversion acknowledgement captured before a changed foreground report',async()=>{
    report.unverifiedConversion=true;report.conversion={verified:false,totals:{input:1,accounted:1},fates:{converted:1},nodes:[]};await selectWorkflow();await click('Analysis report');change('I accept the unverified UI workflow conversion',true);report.conversion.totals.input=2;await click('Queue generation');expect(api.run).not.toHaveBeenCalled();expect(field('I accept the unverified UI workflow conversion').props.checked).toBe(false);expect(button('Queue generation').props.disabled).toBe(true);
  });
});


describe('workbench refresh conversion acknowledgement continuity',()=>{
  it('R23 preserves consent across explicit foreground reanalysis with an identical descriptor',async()=>{
    report.unverifiedConversion=true;report.conversion={verified:false,totals:{input:1,accounted:1},fates:{converted:1},nodes:[]};await selectWorkflow();await click('Analysis report');change('I accept the unverified UI workflow conversion',true);await click('Analyze again');expect(field('I accept the unverified UI workflow conversion').props.checked).toBe(true);expect(button('Queue generation').props.disabled).toBe(false);expect(api.run).not.toHaveBeenCalled();
  });
});


describe('workbench refresh foreground/background analysis arbitration',()=>{
  it('R24 skips background analysis while a foreground analysis is already loading',async()=>{
    await selectWorkflow();const pending=deferred<ComfyResponse<ComfyAnalysis>>();vi.mocked(api.analyzeWorkflow).mockImplementationOnce(()=>pending.promise);button('Analyze again').props.onClick();await settle();expect(parameterText()).toContain(translated('正在分析工作流'));const count=vi.mocked(api.analyzeWorkflow).mock.calls.length;button(translated('刷新工作台')).props.onClick();await settle();expect(api.analyzeWorkflow).toHaveBeenCalledTimes(count);nav('服务菜单');expect(nodes().find(n=>n.props['data-comfy-refresh-section']==='analysis')!.props['data-status']).toBe('skipped');pending.resolve(ok(report));await settle();expect(field('Positive prompt · 4.text').props.value).toBe('a tree');expect(button('Queue generation').props.disabled).toBe(false);expect(api.run).not.toHaveBeenCalled();
  });
  it('R25 lets a newer foreground analysis win over an older background refresh report',async()=>{
    await selectWorkflow();const pending=deferred<ComfyResponse<ComfyAnalysis>>();vi.mocked(api.analyzeWorkflow).mockImplementationOnce(()=>pending.promise);button(translated('刷新工作台')).props.onClick();await settle();const newer=structuredClone(report);newer.slots.find(slot=>slot.kind==='positive')!.defaultValue='new foreground report';vi.mocked(api.analyzeWorkflow).mockResolvedValueOnce(ok(newer));await click('Analyze again');expect(field('Positive prompt · 4.text').props.value).toBe('new foreground report');pending.resolve(ok(report));await settle();expect(field('Positive prompt · 4.text').props.value).toBe('new foreground report');expect(visible(tree)).toContain(translated('已采用较新的参数分析，已忽略旧刷新结果。'));expect(button('Queue generation').props.disabled).toBe(false);expect(api.run).not.toHaveBeenCalled();
  });
});

describe('image actions contract',()=>{
  async function withImage(){await selectWorkflow();emit({type:'results',results:[result]});render();}
  it('opens a controlled nonmodal panel instead of an animated inline details element',async()=>{
    await withImage();const trigger=rawButton(translated('图片操作'));expect(trigger).toBeTruthy();expect(trigger!.props['aria-expanded']).toBe(false);expect(nodes().some(n=>n.type==='details'&&n.props.className==='comfy-studio-image-more')).toBe(false);
    trigger!.props.onClick({detail:0});render();expect(rawButton(translated('图片操作'))!.props['aria-expanded']).toBe(true);const panel=nodes().find(n=>typeof n.type==='function'&&n.type.name==='ComfyResultActionsMenu');expect(panel).toBeTruthy();expect(panel!.props.focusFirst).toBe(true);expect(panel!.props.label).toBe(translated('图片操作'));panel!.props.onClose();render();expect(rawButton(translated('图片操作'))!.props['aria-expanded']).toBe(false);expect(api.run).not.toHaveBeenCalled();
  });
  it('closes the source-bound panel when the image or owning view changes',async()=>{
    await withImage();const trigger=rawButton(translated('图片操作'));expect(trigger).toBeTruthy();trigger!.props.onClick({detail:1});render();expect(rawButton(translated('图片操作'))!.props['aria-expanded']).toBe(true);emit({type:'results',results:[{...result,id:'other-image'}]});await settle();expect(rawButton(translated('图片操作'))!.props['aria-expanded']).toBe(false);rawButton(translated('图片操作'))!.props.onClick({detail:1});render();nav('作品库');await settle();nav('创作');await settle();expect(rawButton(translated('图片操作'))!.props['aria-expanded']).toBe(false);
  });
  it('reserves intrinsic detail image size and puts reuse actions before the shared file block',async()=>{
    await withImage();nav('作品库');const details=nodes().find(n=>n.props.className==='comfy-studio-work-details')!;const img=walk(details).find(n=>n.type==='img')!;expect(img.props.width).toBe(result.width);expect(img.props.height).toBe(result.height);const actions=walk(details).find(n=>n.props.className==='comfy-studio-work-actions');expect(actions).toBeTruthy();expect(walk(actions).filter(n=>n.type==='button').map(n=>visible(n.props.children))).toEqual([translated('复用参数'),translated('在创作台查看')]);
  });
});

describe('result file actions contract',()=>{
  it('keeps path separate from action buttons and reveals only the selected saved result ID',async()=>{
    await selectWorkflow();emit({type:'results',results:[result]});render();nav('作品库');const details=nodes().find(n=>n.props.className==='comfy-studio-work-details')!;const location=walk(details).find(n=>n.props.className==='comfy-local-file-location')!;const actions=walk(location).find(n=>n.props.className==='comfy-local-file-actions');expect(actions).toBeTruthy();expect(walk(actions).filter(n=>n.type==='button')).toHaveLength(2);expect(walk(actions).some(n=>n.type==='code')).toBe(false);const path=walk(location).find(n=>n.props.className==='comfy-local-file-path')!;path.props.onClick();await settle();expect(api.openResult).toHaveBeenCalledWith(result.id);expect(api.openResultsFolder).not.toHaveBeenCalled();
  });
  it('announces a temporary local copied status without clearing an existing notice or blocking edits',async()=>{
    await selectWorkflow();emit({type:'results',results:[result]});render();nav('作品库');vi.mocked(api.openResultsFolder).mockRejectedValueOnce(new Error('existing notice survives copy'));await click(translated('打开结果目录'));expect(visible(tree)).toContain('existing notice survives copy');const writeText=vi.fn(async()=>{});vi.stubGlobal('navigator',{clipboard:{writeText}});vi.useFakeTimers();await click(`${translated('复制路径')}: ${result.filePath}`);expect(writeText).toHaveBeenCalledWith(result.filePath);expect(visible(tree)).toContain(translated('路径已复制'));expect(visible(tree)).toContain('existing notice survives copy');vi.advanceTimersByTime(1600);render();expect(visible(tree)).not.toContain(translated('路径已复制'));nav('创作');expect(field('Positive prompt · 4.text').props.disabled).not.toBe(true);expect(api.run).not.toHaveBeenCalled();
  });
});

describe('workspace boot drafts and explicit workflow library saves (typed bridge only)',()=>{
  function storageFixture(drafts:ComfyWorkspaceDraft[]=[],selectedId=''){
    const values=new Map<string,string>([[COMFY_WORKSPACE_DRAFTS_KEY,JSON.stringify({version:1,selectedId,drafts})]]);
    return {getItem:vi.fn((key:string)=>values.get(key)??null),setItem:vi.fn((key:string,value:string)=>{values.set(key,value);}),workspace:()=>JSON.parse(values.get(COMFY_WORKSPACE_DRAFTS_KEY)!)};
  }
  const savedDraft=(workflowId='wf1',values:ComfyWorkspaceDraft['values']={'positive:4:text':'restart draft','seed:6:seed':777},seedMode:ComfyWorkspaceDraft['seedMode']='fixed',sourceSha256='a'.repeat(64)):ComfyWorkspaceDraft=>({workflowId,sourceSha256,values,seedMode});
  const currentTitle=()=>rawButton(translated('选择工作流'))?.props.title;
  const warning=()=>nodes().find(n=>n.props['data-comfy-workspace-warning']);
  const saveButton=()=>nodes().find(n=>n.props['data-comfy-workflow-save-current'])!;
  const copyButton=()=>nodes().find(n=>n.props['data-comfy-workflow-save-as'])!;
  const confirmCopy=()=>nodes().find(n=>n.props['data-comfy-workflow-save-confirm'])!;
  async function remount(storage:ReturnType<typeof storageFixture>){harness.reset();vi.stubGlobal('localStorage',storage);render();await settle();}
  async function openCopy(){copyButton().props.onClick();render();}

  it('D01 restores a valid v1 selected workflow, draft and seed mode exactly once after the first list',async()=>{
    const storage=storageFixture([savedDraft()],'wf1');vi.mocked(api.analyzeWorkflow).mockClear();await remount(storage);
    expect(currentTitle()).toBe('Workflow wf1');expect(field('Positive prompt · 4.text').props.value).toBe('restart draft');expect(field('Randomize seed each run').props.checked).toBe(false);expect(field('Seed · 6.seed').props.value).toBe(777);expect(api.analyzeWorkflow).toHaveBeenCalledTimes(1);expect(api.analyzeWorkflow).toHaveBeenLastCalledWith('wf1',{'positive:4:text':'restart draft','seed:6:seed':777});
    emit({type:'workflows',workflows:[...workflows]});await settle();expect(api.analyzeWorkflow).toHaveBeenCalledTimes(1);expect(storage.setItem).not.toHaveBeenCalledWith(COMFY_WORKSPACE_DRAFTS_KEY,expect.any(String));expect(api.start).not.toHaveBeenCalled();expect(api.connect).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
  });
  it('D02 a delayed initial getState never overwrites a user-selected workflow',async()=>{
    workflows.push(workflowFixture('wf2'));const storage=storageFixture([savedDraft()],'wf1'),late=deferred<ComfyResponse<ComfyStateBundle>>();
    harness.reset();vi.stubGlobal('localStorage',storage);vi.mocked(api.getState).mockImplementationOnce(()=>late.promise);render();emit({type:'workflows',workflows:[...workflows]});render();await selectWorkflow('wf2');expect(currentTitle()).toBe('Workflow wf2');
    late.resolve(ok({config,snapshot,workflows:[...workflows],results:[],platform:{os:'win32',launchSupported:true,launchAcceptance:'unverified'}}));await settle();expect(currentTitle()).toBe('Workflow wf2');expect(field('Positive prompt · 4.text').props.value).not.toBe('restart draft');expect(api.run).not.toHaveBeenCalled();
  });
  it('D03 persists edits and seed mode immediately and restores the current draft after remount',async()=>{
    const storage=storageFixture();await remount(storage);await selectWorkflow();change('Positive prompt · 4.text','typed before restart');change('Randomize seed each run',false);change('Seed · 6.seed','1234');await settle();
    expect(storage.workspace()).toMatchObject({version:1,selectedId:'wf1',drafts:[{workflowId:'wf1',sourceSha256:'a'.repeat(64),values:{'positive:4:text':'typed before restart','seed:6:seed':1234},seedMode:'fixed'}]});await remount(storage);expect(field('Positive prompt · 4.text').props.value).toBe('typed before restart');expect(field('Seed · 6.seed').props.value).toBe(1234);expect(field('Randomize seed each run').props.checked).toBe(false);expect(api.run).not.toHaveBeenCalled();
  });
  it('D04 switches per-workflow drafts and seed modes without cross-contamination',async()=>{
    workflows.push(workflowFixture('wf2'));const storage=storageFixture();await remount(storage);await selectWorkflow('wf1');change('Positive prompt · 4.text','first draft');change('Randomize seed each run',false);change('Seed · 6.seed','111');await selectWorkflow('wf2');expect(field('Randomize seed each run').props.checked).toBe(true);change('Positive prompt · 4.text','second draft');await selectWorkflow('wf1');expect(field('Positive prompt · 4.text').props.value).toBe('first draft');expect(field('Seed · 6.seed').props.value).toBe(111);await selectWorkflow('wf2');expect(field('Positive prompt · 4.text').props.value).toBe('second draft');expect(field('Randomize seed each run').props.checked).toBe(true);
    expect(storage.workspace().drafts).toEqual(expect.arrayContaining([expect.objectContaining({workflowId:'wf1',seedMode:'fixed',values:{'positive:4:text':'first draft','seed:6:seed':111}}),expect.objectContaining({workflowId:'wf2',seedMode:'random',values:{'positive:4:text':'second draft'}})]));expect(api.run).not.toHaveBeenCalled();
  });
  it('D05 does not apply a draft whose source hash differs from the authoritative workflow',async()=>{
    workflows[0].savedValues={'positive:4:text':'library truth'};const storage=storageFixture([savedDraft('wf1',{'positive:4:text':'stale graph'},'fixed','b'.repeat(64))],'wf1');await remount(storage);expect(currentTitle()).toBe('Workflow wf1');expect(field('Positive prompt · 4.text').props.value).toBe('library truth');expect(field('Randomize seed each run').props.checked).toBe(true);expect(visible(warning())).toContain(translated('工作流来源已变化，未套用旧草稿；已恢复库内参数。'));expect(storage.setItem).not.toHaveBeenCalledWith(COMFY_WORKSPACE_DRAFTS_KEY,expect.any(String));expect(api.run).not.toHaveBeenCalled();
  });
  it('D06 quota failure keeps editing possible, preserves the last durable snapshot and shows a failure warning',async()=>{
    const storage=storageFixture();await remount(storage);await selectWorkflow();const durable=storage.workspace();storage.setItem.mockImplementation(()=>{throw new Error('QuotaExceededError');});change('Positive prompt · 4.text','unsaved but editable');await settle();expect(field('Positive prompt · 4.text').props.value).toBe('unsaved but editable');expect(field('Positive prompt · 4.text').props.disabled).not.toBe(true);expect(storage.workspace()).toEqual(durable);expect(visible(warning())).toContain(translated('编辑草稿未能保存到本机；关闭软件前请重试，或显式保存工作流。'));expect(api.saveWorkflowValues).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
  });
  it('D07 built-in recipes expose Save as only, block rename and never send an overwrite request',async()=>{
    const builtin=workflowFixture('builtin-local-1-v1');workflows=[builtin];emit({type:'workflows',workflows});await selectWorkflow(builtin.id);expect(saveButton()).toBeUndefined();expect(copyButton()).toBeTruthy();await click('Analysis report');expect(field('Rename workflow').props.disabled).toBe(true);expect(button('Rename workflow').props.disabled).toBe(true);button('Rename workflow').props.onClick();await settle();expect(api.renameWorkflow).not.toHaveBeenCalled();expect(api.saveWorkflowValues).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
  });
  it('D08 own Save sends the exact selected id and typed values through the library API, never a source JSON graph',async()=>{
    const source={fileName:workflows[0].fileName,sourceSha256:workflows[0].sourceSha256};await selectWorkflow();change('Positive prompt · 4.text','save to library');change('Randomize seed each run',false);change('Seed · 6.seed','123');saveButton().props.onClick();await settle();expect(api.saveWorkflowValues).toHaveBeenCalledExactlyOnceWith('wf1',{'positive:4:text':'save to library','seed:6:seed':123});expect(api.saveWorkflowAs).not.toHaveBeenCalled();expect(api.importWorkflowJson).not.toHaveBeenCalled();expect(workflows[0]).toMatchObject(source);expect(workflows[0].savedValues).toEqual({'positive:4:text':'save to library','seed:6:seed':123});expect(visible(tree)).toContain(translated('工作流已保存到软件库；源文件未修改。'));expect(api.run).not.toHaveBeenCalled();
  });
  it('D09 Save as rejects empty names and selects the returned library copy while preserving fixed seed mode',async()=>{
    await selectWorkflow();change('Positive prompt · 4.text','copy these parameters');change('Randomize seed each run',false);change('Seed · 6.seed','555');await openCopy();expect(confirmCopy().props.disabled).toBe(true);confirmCopy().props.onClick();await settle();expect(api.saveWorkflowAs).not.toHaveBeenCalled();change(translated('副本名称'),'  My copied workflow  ');expect(confirmCopy().props.disabled).toBe(false);confirmCopy().props.onClick();await settle();expect(api.saveWorkflowAs).toHaveBeenCalledExactlyOnceWith('wf1','My copied workflow',{'positive:4:text':'copy these parameters','seed:6:seed':555});expect(currentTitle()).toBe('My copied workflow');expect(api.run).not.toHaveBeenCalled();await click('Analyze again');expect(field('Positive prompt · 4.text').props.value).toBe('copy these parameters');expect(field('Seed · 6.seed').props.value).toBe(555);expect(field('Randomize seed each run').props.checked).toBe(false);expect(api.run).not.toHaveBeenCalled();
  });
  it('D10 pending own Save captures its request but a late reply cannot replace a newer local edit',async()=>{
    await selectWorkflow();change('Positive prompt · 4.text','captured save');const pending=deferred<ComfyResponse<ComfyWorkflowSummary>>();vi.mocked(api.saveWorkflowValues!).mockImplementationOnce(()=>pending.promise);const staleInput=field('Positive prompt · 4.text');saveButton().props.onClick();render();expect(saveButton().props.disabled).toBe(true);staleInput.props.onChange({target:{value:'newer unsaved draft'}});render();pending.resolve(ok({...workflows[0],savedValues:{'positive:4:text':'captured save'},updatedAt:'2026-10-21T00:00:00Z'}));await settle();expect(api.saveWorkflowValues).toHaveBeenCalledExactlyOnceWith('wf1',{'positive:4:text':'captured save'});expect(field('Positive prompt · 4.text').props.value).toBe('newer unsaved draft');expect(api.run).not.toHaveBeenCalled();
  });
  it('D11 pending Save as never selects its copy over a newer user-selected workflow',async()=>{
    workflows.push(workflowFixture('wf2'));emit({type:'workflows',workflows});await selectWorkflow();change('Positive prompt · 4.text','copy captured');await openCopy();change(translated('副本名称'),'Late copy');const pending=deferred<ComfyResponse<ComfyWorkflowSummary>>();vi.mocked(api.saveWorkflowAs!).mockImplementationOnce(()=>pending.promise);confirmCopy().props.onClick();render();await selectWorkflow('wf2');pending.resolve(ok({...workflowFixture('wf-copy'),name:'Late copy',savedValues:{'positive:4:text':'copy captured'}}));await settle();expect(currentTitle()).toBe('Workflow wf2');expect(field('Positive prompt · 4.text').props.value).toBe('a tree');expect(api.run).not.toHaveBeenCalled();
  });
  it('D12 offline task reuse fills actual stored parameters without analyze or run and latches repeated clicks',async()=>{
    emit({type:'snapshot',snapshot:{...snapshot,phase:'idle',owner:null}});emit({type:'run',run:{...run,phase:'completed'}});emit({type:'results',results:[result]});render();nav('任务记录');const reuse=walk(taskCard('run1')).find(n=>n.type==='button'&&visible(n.props.children)===translated('复用参数'))!;expect(reuse.props.disabled).toBe(false);const pending=deferred<ComfyResponse<{workflowId:string;slotValues:ComfyResultItem['slotValues']}>>();vi.mocked(api.reuseResult).mockImplementationOnce(()=>pending.promise);vi.mocked(api.analyzeWorkflow).mockClear();reuse.props.onClick();reuse.props.onClick();render();expect(api.reuseResult).toHaveBeenCalledExactlyOnceWith('result1');pending.resolve(ok({workflowId:'wf1',slotValues:result.slotValues}));await settle();expect(currentTitle()).toBe('Workflow wf1');expect(visible(tree)).toContain(translated('已回填参数，连接后将重新校验；不会自动生成。'));expect(api.analyzeWorkflow).not.toHaveBeenCalled();expect(api.run).not.toHaveBeenCalled();
    emit({type:'snapshot',snapshot});await settle();expect(field('Positive prompt · 4.text').props.value).toBe('a saved tree');expect(field('Randomize seed each run').props.checked).toBe(false);expect(api.analyzeWorkflow).toHaveBeenCalledExactlyOnceWith('wf1',result.slotValues);expect(api.run).not.toHaveBeenCalled();
  });
  it('D13 a pending own Save cannot store another workflow current draft under the saved workflow id',async()=>{
    workflows.push(workflowFixture('wf2'));emit({type:'workflows',workflows});const storage=storageFixture();await remount(storage);await selectWorkflow();change('Positive prompt · 4.text','first captured draft');const pending=deferred<ComfyResponse<ComfyWorkflowSummary>>();vi.mocked(api.saveWorkflowValues!).mockImplementationOnce(()=>pending.promise);saveButton().props.onClick();render();await selectWorkflow('wf2');change('Positive prompt · 4.text','second workflow only');pending.resolve(ok({...workflowFixture('wf1'),savedValues:{'positive:4:text':'first captured draft'},updatedAt:'2026-10-21T00:00:00Z'}));await settle();expect(currentTitle()).toBe('Workflow wf2');expect(field('Positive prompt · 4.text').props.value).toBe('second workflow only');await selectWorkflow('wf1');expect(field('Positive prompt · 4.text').props.value).toBe('first captured draft');expect(storage.workspace().drafts).toEqual(expect.arrayContaining([expect.objectContaining({workflowId:'wf1',values:{'positive:4:text':'first captured draft'}}),expect.objectContaining({workflowId:'wf2',values:{'positive:4:text':'second workflow only'}})]));expect(api.run).not.toHaveBeenCalled();
  });
  it('D14 a delayed delete-list reply cannot clear a newer selected workflow or its draft',async()=>{
    workflows.push(workflowFixture('wf2'));emit({type:'workflows',workflows});const storage=storageFixture();await remount(storage);await selectWorkflow();await click('Analysis report');await click('Delete workflow');const lateList=deferred<ComfyResponse<ComfyWorkflowSummary[]>>();vi.mocked(api.listWorkflows).mockImplementationOnce(()=>lateList.promise);button('Delete').props.onClick();await settle();expect(api.deleteWorkflow).toHaveBeenCalledExactlyOnceWith('wf1');await click(translated('关闭分析报告'));await selectWorkflow('wf2');change('Positive prompt · 4.text','new workflow remains selected');expect(currentTitle()).toBe('Workflow wf2');lateList.resolve(ok([...workflows]));await settle();expect(currentTitle()).toBe('Workflow wf2');expect(field('Positive prompt · 4.text').props.value).toBe('new workflow remains selected');expect(storage.workspace().selectedId).toBe('wf2');expect(storage.workspace().drafts).not.toEqual(expect.arrayContaining([expect.objectContaining({workflowId:'wf1'})]));expect(api.run).not.toHaveBeenCalled();
  });
  it('D15 confirmed delete handlers reject a stale selection and latch repeated same-tick clicks',async()=>{
    workflows.push(workflowFixture('wf2'));emit({type:'workflows',workflows});await selectWorkflow();await click('Analysis report');await click('Delete workflow');const staleConfirm=button('Delete');await click(translated('关闭分析报告'));await selectWorkflow('wf2');staleConfirm.props.onClick();await settle();expect(api.deleteWorkflow).not.toHaveBeenCalled();expect(currentTitle()).toBe('Workflow wf2');await click('Analysis report');await click('Delete workflow');const pending=deferred<ComfyResponse<{deleted:boolean}>>();vi.mocked(api.deleteWorkflow).mockImplementationOnce(()=>pending.promise);const confirm=button('Delete');confirm.props.onClick();confirm.props.onClick();render();expect(api.deleteWorkflow).toHaveBeenCalledExactlyOnceWith('wf2');workflows=workflows.filter(item=>item.id!=='wf2');pending.resolve(ok({deleted:true}));await settle();expect(currentTitle()).toBeUndefined();expect(api.run).not.toHaveBeenCalled();
  });
  it('D16 a delayed delete-list snapshot cannot overwrite a newer authoritative workflow push',async()=>{
    workflows.push(workflowFixture('wf2'));emit({type:'workflows',workflows});await selectWorkflow();await click('Analysis report');await click('Delete workflow');const lateList=deferred<ComfyResponse<ComfyWorkflowSummary[]>>();vi.mocked(api.listWorkflows).mockImplementationOnce(()=>lateList.promise);button('Delete').props.onClick();await settle();await click(translated('关闭分析报告'));await selectWorkflow('wf2');change('Positive prompt · 4.text','keep edited values');const newer={...workflowFixture('wf2'),name:'Workflow wf2 newer',updatedAt:'2026-10-21T10:00:00Z'};workflows=[newer,workflowFixture('wf3')];emit({type:'workflows',workflows:[...workflows]});render();lateList.resolve(ok([workflowFixture('wf2')]));await settle();expect(currentTitle()).toBe('Workflow wf2 newer');expect(field('Positive prompt · 4.text').props.value).toBe('keep edited values');showLibrary();expect(visible(tree)).toContain('Workflow wf3');expect(api.run).not.toHaveBeenCalled();
  });
});
