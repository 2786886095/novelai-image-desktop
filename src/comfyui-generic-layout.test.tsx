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
import ComfyLocalTool,{comfySlotSource,comfyNodeGroups,comfyDimensionRows} from './ComfyLocalTool';
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
function showExpert(){showEnvironment();nav('专家参数');const details=nodes().find(n=>n.props['data-comfy-advanced']);if(details&&!details.props.open){details.props.onToggle?.({currentTarget:{open:true}});render();}}
function button(label:string):Node{
  let found=rawButton(label);if(found)return found;
  if(['Choose Python','Choose output directory','Save launch settings',featureText('en-US','重新检测')].includes(label)){showExpert();}
  else if(label==='Choose ComfyUI directory'||label==='Choose Python interpreter'||label==='Choose another existing Python'){showEnvironment();nav('概览');}
  else if(label==='Connect to running instance'){showEnvironment();nav('环境来源');}
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

afterEach(()=>{harness.reset();vi.unstubAllGlobals();vi.useRealTimers();});

const ok=<T,>(data:T):ComfyResponse<T>=>({ok:true,data});
let api:ComfyLocalApi,unsubscribe:()=>void;
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
  unsubscribe=vi.fn();
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
    onEvent:vi.fn((_callback:(event:ComfyEvent)=>void)=>()=>{unsubscribe();}),
  };
}
beforeEach(async()=>{
  harness.reset();vi.clearAllMocks();harness.store.settings.language='en-US';buildFixtures();
  vi.stubGlobal('window',{naiComfy:api,naiDesktop:{platform:'win32'},location:{search:''},setInterval:(...args:Parameters<typeof setInterval>)=>setInterval(...args),clearInterval:(id:ReturnType<typeof setInterval>)=>clearInterval(id)});
  vi.stubGlobal('localStorage',{getItem:()=>null,setItem:vi.fn()});render();await settle();
});
async function selectWorkflow(id='wf1'){showLibrary();nodes().find(n=>n.type==='button'&&n.props.className==='comfy-local-workflow'&&visible(n.props.children).includes(`Workflow ${id}`))!.props.onClick();await settle();}

type ComfySlot=import('./comfyui/contract').ComfySlot;
function scalar(nodeId:string,input:string,kind:ComfySlot['kind']='parameter',extra:Partial<ComfySlot>={}):ComfySlot{return {id:`${kind}:${nodeId}:${input}`,kind,nodeId,input,classType:'GenericFixture',label:input,valueType:'int',defaultValue:1,...extra};}
function slotNode(id:string){return nodes().find(n=>n.props['data-comfy-slot']===id)!;}
function slotInput(id:string){return walk(slotNode(id)).find(n=>['input','textarea','comfy-test-select'].includes(String(n.type)))!;}
function inputChange(id:string,value:string|boolean){slotInput(id).props.onChange({target:typeof value==='boolean'?{checked:value}:{value}});render();}
function genericGroup(id:string){return nodes().find(n=>n.props['data-comfy-node-group']===id)!;}

describe('generic ComfyUI field presentation (actual handlers, typed in-memory bridge; not browser/native)',()=>{
  it('groups by literal node ID in first-appearance order, not shared class type or title',()=>{
    const items=[scalar('9','gain','parameter',{nodeTitle:'Same title'}),scalar('2','gain','parameter',{nodeTitle:'Same title'}),scalar('9','enabled','parameter',{valueType:'boolean'})];
    const groups=comfyNodeGroups(items);expect(groups.map(g=>g.nodeId)).toEqual(['9','2']);expect(groups[0].slots.map(s=>s.input)).toEqual(['gain','enabled']);expect(groups[0].source).toBe('Same title #9');expect(groups[1].source).toBe('Same title #2');expect(comfySlotSource(scalar('4','gain'))).toBe('GenericFixture #4');
  });
  it('pairs dimensions only inside the actual node and always orders width before height',()=>{
    const slots=[scalar('10','height','height'),scalar('11','width','width'),scalar('10','width','width'),scalar('11','height','height'),scalar('12','width','width')];
    const rows=comfyDimensionRows(slots);expect(rows).toHaveLength(3);expect(rows.map(row=>[row.width?.nodeId,row.height?.nodeId])).toEqual([['10','10'],['11','11'],['12',undefined]]);expect(rows[0].width?.input).toBe('width');expect(rows[0].height?.input).toBe('height');
  });
  it('retains multiple dimensions from one node instead of silently dropping extra fields',()=>{
    const rows=comfyDimensionRows([scalar('1','width','width'),scalar('1','height','height'),scalar('1','target_width','width')]);expect(rows).toHaveLength(2);expect(rows.flatMap(row=>[row.width?.id,row.height?.id].filter(Boolean))).toHaveLength(3);
  });
  it('renders group titles with source IDs and shortens only the exact redundant title prefix',async()=>{
    report.slots.push(scalar('20','type','parameter',{nodeTitle:'Loader A',label:'Loader A · type',valueType:'combo',defaultValue:'first',options:['first','second']}),scalar('21','type','parameter',{nodeTitle:'Loader B',label:'A hint overrides this label',valueType:'combo',defaultValue:'first',options:['first','second']}),scalar('22','gain'));
    await selectWorkflow();expect(visible(genericGroup('20'))).toContain('Loader A #20');expect(genericGroup('20').props['aria-labelledby']).toBe('comfy-advanced-node-20');expect(walk(genericGroup('20')).some(n=>n.type==='span'&&visible(n)===translated('类型'))).toBe(true);expect(visible(walk(genericGroup('21')))).toContain('A hint overrides this label');expect(visible(genericGroup('22'))).toContain('GenericFixture #22');
  });
  it('keeps same-name controls from different node groups independently editable using stable IDs',async()=>{
    report.slots.push(scalar('20','gain'),scalar('21','gain'));await selectWorkflow();inputChange('parameter:20:gain','4');inputChange('parameter:21:gain','7');await click('Analyze again');expect(vi.mocked(api.analyzeWorkflow).mock.calls.at(-1)![1]).toMatchObject({'parameter:20:gain':4,'parameter:21:gain':7});expect(slotInput('parameter:20:gain').props.value).toBe(4);expect(slotInput('parameter:21:gain').props.value).toBe(7);expect(api.run).not.toHaveBeenCalled();
  });
  it('adds source labels to repeated common steps, CFG and seed without changing unique prompt labels',async()=>{
    for(const nodeId of ['40','41'])for(const kind of ['steps','cfg','seed'] as const)report.slots.push(scalar(nodeId,kind,kind,{nodeTitle:`Sampler ${nodeId}`}));await selectWorkflow();
    for(const nodeId of ['40','41'])for(const kind of ['steps','cfg'] as const){const n=slotInput(`${kind}:${nodeId}:${kind}`);expect(n.props['aria-label']).toContain(`Sampler ${nodeId} #${nodeId}`);}
    const seeds=nodes().filter(n=>n.props['data-comfy-seed-slot']);expect(seeds).toHaveLength(3);expect(visible(seeds.find(n=>n.props['data-comfy-seed-slot']==='seed:40:seed'))).toContain('Sampler 40 #40');expect(field('Positive prompt · 4.text').props.value).toBe('a tree');
  });
  it('renders two native dimension pairs and a lone width with no cross-node multiplication chain',async()=>{
    report.slots=report.slots.filter(slot=>slot.kind!=='width');report.slots.push(scalar('10','height','height'),scalar('10','width','width'),scalar('11','width','width'),scalar('11','height','height'),scalar('12','width','width'));await selectWorkflow();
    const pairs=nodes().filter(n=>n.props['data-comfy-dimension-node']);expect(pairs.map(n=>n.props['data-comfy-dimension-node'])).toEqual(['10','11']);for(const pair of pairs){expect(walk(pair).filter(n=>n.props['data-comfy-slot']).map(n=>n.props['data-comfy-slot'])).toEqual([`width:${pair.props['data-comfy-dimension-node']}:width`,`height:${pair.props['data-comfy-dimension-node']}:height`]);expect(walk(pair).filter(n=>n.props.className==='comfy-studio-dimension-times')).toHaveLength(1);}expect(slotNode('width:12:width')).toBeTruthy();expect(visible(walk(slotNode('width:12:width')))).toContain('GenericFixture #12');
  });
  it('retains one global random-seed mode while naming every seed source',async()=>{
    report.slots.push(scalar('40','seed','seed',{nodeTitle:'Second sampler'}));await selectWorkflow();const randoms=()=>nodes().filter(n=>n.type==='input'&&String(n.props['aria-label']).startsWith('Randomize seed'));
    expect(randoms()).toHaveLength(2);expect(randoms().every(n=>n.props.checked===true)).toBe(true);expect(randoms().some(n=>n.props['aria-label'].includes('Second sampler #40'))).toBe(true);randoms()[0].props.onChange({target:{checked:false}});render();expect(randoms().every(n=>n.props.checked===false)).toBe(true);expect(slotInput('seed:6:seed').props.disabled).toBe(false);expect(slotInput('seed:40:seed').props.disabled).toBe(false);expect(api.run).not.toHaveBeenCalled();
  });
  it('keeps boolean values typed and aligns a grid Field without applying alignment to connection Fields',async()=>{
    report.slots.push(scalar('20','enabled','parameter',{valueType:'boolean',defaultValue:true}));await selectWorkflow();expect(slotInput('parameter:20:enabled').props.checked).toBe(true);inputChange('parameter:20:enabled',false);await click('Analyze again');expect(vi.mocked(api.analyzeWorkflow).mock.calls.at(-1)![1]!['parameter:20:enabled']).toBe(false);expect(walk(slotNode('parameter:20:enabled')).some(n=>String(n.props.className).includes('comfy-studio-field-aligned'))).toBe(true);expect(nodes().filter(n=>n.props.className==='comfy-studio-connect-row').flatMap(walk).some(n=>String(n.props.className).includes('comfy-studio-field-aligned'))).toBe(false);
  });
  it('keeps multiline controls wide and preserves mapping, missing choices and validation messages',async()=>{
    report.slots.push(scalar('20','text','parameter',{valueType:'string',multiline:true,defaultValue:'one\ntwo'}),scalar('20','choice','parameter',{valueType:'combo',defaultValue:'missing',options:['available']}));report.issues=[{severity:'block',code:'value-type',nodeId:'20',input:'text',message:'Synthetic validation text'}];report.ok=false;await selectWorkflow();change(translated('显示节点映射'),true);expect(slotNode('parameter:20:text').props.className).toContain('wide');expect(slotInput('parameter:20:text').type).toBe('textarea');expect(visible(walk(slotNode('parameter:20:text')))).toContain('Synthetic validation text');expect(visible(walk(slotNode('parameter:20:text')))).toContain('GenericFixture #20 → text');expect(visible(walk(slotNode('parameter:20:choice')))).toContain('missing');expect(api.run).not.toHaveBeenCalled();
  });
  it('retains a now-linked COMBO draft through refresh and exposes explicit cleanup without dropping other edits',async()=>{
    const stale='parameter:9:clamp';workflows[0].savedValues={[stale]:false,'positive:4:text':'preserve my draft','width:5:width':1024};report.ok=false;report.issues=[{severity:'block',code:'stale-slot',nodeId:'9',input:'clamp',message:'Site is now linked; stale scalar draft rejected'}];await selectWorkflow();await click('Analysis report');expect(visible(tree)).toContain(stale);expect(field('Positive prompt · 4.text').props.value).toBe('preserve my draft');await click(translated('刷新工作台'));expect(vi.mocked(api.analyzeWorkflow).mock.calls.at(-1)![1]).toMatchObject({[stale]:false,'positive:4:text':'preserve my draft'});expect(visible(tree)).toContain(stale);expect(api.run).not.toHaveBeenCalled();await click(translated('清除失效参数并重新分析'));const kept=vi.mocked(api.analyzeWorkflow).mock.calls.at(-1)![1]!;expect(kept).not.toHaveProperty(stale);expect(kept).toMatchObject({'positive:4:text':'preserve my draft','width:5:width':1024});expect(field('Positive prompt · 4.text').props.value).toBe('preserve my draft');expect(api.run).not.toHaveBeenCalled();
  });
  it('shows a visible budget-limit notice without inventing an omitted count or blocking an otherwise valid graph',async()=>{
    report.issues=[{severity:'warn',code:'generic-slots-limited',message:'12 additional scalar widgets omitted under slot budget'}];await selectWorkflow();const notice=nodes().find(n=>n.props['data-comfy-generic-limited']!==undefined)!;expect(notice.props.role).toBe('status');expect(visible(notice)).toBe(translated('部分附加参数未在面板展开；原工作流值保留，可在分析报告查看详情。'));expect(button('Queue generation').props.disabled).toBe(false);expect(api.run).not.toHaveBeenCalled();
  });
  it('opts only workflow slot combo popovers into scoped long-option wrapping',async()=>{
    report.slots.push(scalar('20','choice','parameter',{valueType:'combo',defaultValue:'long',options:['long','short']}));await selectWorkflow();expect(slotInput('parameter:20:choice').props.popoverClassName).toBe('comfy-studio-slot-options');expect(slotInput('model:1:unet_name').props.popoverClassName).toBe('comfy-studio-slot-options');showExpert();expect(nodes().find(n=>n.type==='comfy-test-select'&&n.props['aria-label']===translated('本机地址'))!.props.popoverClassName).toBeUndefined();
  });
});
