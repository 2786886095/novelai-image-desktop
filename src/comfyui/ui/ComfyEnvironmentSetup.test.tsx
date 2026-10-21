import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {ReactElement} from 'react';
import type {ComfyLocalConfig,ComfyResponse} from '../contract';
import type {ComfySetupApi,ComfySetupState} from '../setup-contract';
// Real setup component handlers; main-process IO is a typed fixture, not native installation evidence.
const hooks=vi.hoisted(()=>{
  type Slot={value?:unknown;deps?:unknown[];cleanup?:()=>void};const slots:Slot[]=[],effects:Array<()=>void>=[];let cursor=0;
  const changed=(a?:unknown[],b?:unknown[])=>!a||!b||a.length!==b.length||a.some((v,i)=>!Object.is(v,b[i]));
  return {begin(){cursor=0;},state(initial:unknown){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,(next:unknown)=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}];},ref(initial:unknown){const i=cursor++;return (slots[i]??={value:{current:initial}}).value;},memo(fn:()=>unknown,deps?:unknown[]){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;},effect(fn:()=>void|(()=>void),deps?:unknown[]){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps)){const previous=slots[i]?.cleanup;slots[i]={deps};effects.push(()=>{previous?.();const cleanup=fn();slots[i].cleanup=typeof cleanup==='function'?cleanup:undefined;});}},flush(){while(effects.length)effects.shift()!();},reset(){for(const slot of slots)slot.cleanup?.();slots.length=0;effects.length=0;cursor=0;}};
});
vi.mock('react',async original=>({...await original<typeof import('react')>(),useState:(x:unknown)=>hooks.state(x),useRef:(x:unknown)=>hooks.ref(x),useCallback:(fn:unknown,deps?:unknown[])=>hooks.memo(()=>fn,deps),useEffect:(fn:()=>void|(()=>void),deps?:unknown[])=>hooks.effect(fn,deps)}));
vi.mock('../../store',()=>({useAppStore:(selector:(s:{settings:{language:string}})=>unknown)=>selector({settings:{language:'en-US'}})}));
vi.mock('../../components/ui',()=>({Button:'button'}));
import {ComfyEnvironmentSetup} from './ComfyEnvironmentSetup';
import {featureText} from '../../feature-text';
type Node=ReactElement<Record<string,any>>;let locked=false,refreshKey=0,onConnectExisting:(()=>void)|undefined,renderMode:'setup'|'drawer'='drawer';let tree:Node,api:ComfySetupApi|undefined,state:ComfySetupState,emit:(value:ComfySetupState)=>void;const onAdopt=vi.fn(),onManual=vi.fn(),onBusyChange=vi.fn(),unsubscribe=vi.fn();
function walk(value:unknown):Node[]{if(Array.isArray(value))return value.flatMap(walk);if(!value||typeof value!=='object'||!('props'in value))return [];const n=value as Node;return [n,...walk(n.props.children)];}
function text(value:unknown):string{if(typeof value==='string'||typeof value==='number')return String(value);if(Array.isArray(value))return value.map(text).join(' ');return value&&typeof value==='object'&&'props'in value?text((value as Node).props.children):'';}
function render(){hooks.begin();tree=ComfyEnvironmentSetup({api,onAdopt,onManual,onBusyChange,onConnectExisting,renderMode,locked,refreshKey}) as Node;hooks.flush();}
async function settle(){for(let i=0;i<4;i++){for(let j=0;j<12;j++)await Promise.resolve();render();}}
function button(label:string){return walk(tree).find(n=>n.type==='button'&&text(n.props.children).trim()===label)!;}
function input(label:string){return walk(tree).find(n=>n.type==='input'&&n.props['aria-label']===label)!;}
async function click(label:string){button(label).props.onClick();await settle();}
function check(label:string,value:boolean){input(label).props.onChange({target:{checked:value}});render();}
const ok=<T,>(data:T):ComfyResponse<T>=>({ok:true,data});
const config:ComfyLocalConfig={schema:1,install:{root:'fixture/ComfyUI',mainPy:'fixture/ComfyUI/main.py',python:'fixture/python.exe',cwd:'fixture/ComfyUI',layout:'custom',pythonVersion:'3.12',supportedFlags:[],helpProbe:'passed',helpProbeMessage:null,checkedAt:'2026-10-20'},launch:{port:8188,readyTimeoutSec:300,disableApiNodes:true,safeMode:true,extraArgs:[]},connection:{host:'127.0.0.1',port:8188},outputDirectory:null};
const consent="I agree to run this environment's Python to read launch arguments · Fixture environment";
const acknowledgement='I accept this selected package and the risk of no official checksum';
beforeEach(()=>{refreshKey=0;onConnectExisting=undefined;renderMode='drawer';});
beforeEach(async()=>{
  hooks.reset();vi.clearAllMocks();locked=false;state={supported:true,defaultRoot:'fixture/independent',selectedRoot:'fixture/independent',rootsChecked:['fixture/root'],discovery:{environments:[{id:'candidate1',label:'Fixture environment',root:'fixture/ComfyUI',python:'fixture/python.exe',layout:'aki',modelDirectory:'fixture/models',reason:'static-layout-detected',warnings:['raw fixture warning'],sourceRoot:'fixture/root'}],warnings:[],examinedEntries:2,truncated:false},package:null,phase:'idle',jobId:null,message:null,progress:null,environments:[],installed:null,shortcutPath:null};
  api={getState:vi.fn(async()=>ok(structuredClone(state))),discover:vi.fn(async()=>ok(structuredClone(state))),chooseDiscoveryRoot:vi.fn(async()=>ok(structuredClone(state))),adoptCandidate:vi.fn(async()=>ok(config)),openOfficialPage:vi.fn(async()=>ok(undefined)),chooseTargetDirectory:vi.fn(async()=>ok(structuredClone(state))),chooseArchive:vi.fn(async()=>ok(structuredClone(state))),install:vi.fn(async()=>ok<ComfySetupState>({...state,phase:'extracting'})),cancel:vi.fn(async()=>ok<ComfySetupState>({...state,phase:'cancelled',progress:null})),createShortcut:vi.fn(async()=>ok({...state,shortcutPath:'fixture/Desktop/ComfyUI.lnk'})),onEvent:vi.fn(listener=>{emit=listener;return unsubscribe;})};render();await settle();
});
afterEach(()=>hooks.reset());
describe('Comfy setup actual UI handlers (typed main fixtures, no native install)',()=>{
  it('drawer diagnostics correction counts actual attempted roots rather than zero examined entries',async()=>{state={...state,rootsChecked:Array.from({length:10},(_,i)=>'fixture/root'+i),discovery:{environments:[],warnings:Array.from({length:10},(_,i)=>'root-unavailable: fixture/root'+i),examinedEntries:0,truncated:false}};emit(state);await settle();expect(text(tree)).toContain('Attempted 10 locations');expect(text(tree)).not.toContain('Checked 0 locations');});
  it('drawer diagnostics correction folds routine unavailable-root diagnostics without discarding exact paths',async()=>{state={...state,discovery:{environments:[],warnings:['root-unavailable: fixture/missing'],examinedEntries:0,truncated:false}};emit(state);await settle();const details=walk(tree).find(n=>n.type==='details'&&n.props['data-comfy-discovery-diagnostics']);expect(details).toBeTruthy();expect(details!.props.open).not.toBe(true);expect(text(details)).toContain('root-unavailable: fixture/missing');expect(walk(tree).filter(n=>n.type==='p'&&text(n).startsWith('root-unavailable:'))).toHaveLength(0);});
  it.each([['NOT_EMPTY','The target is not empty and cannot be overwritten. Choose a new empty directory.'],['PATH_LENGTH','The path is too long. Choose a shorter installation location.'],['DISK_SPACE','There is not enough disk space. Free space and try again.'],['EXECUTOR_HASH','The extractor is unavailable or failed verification. Obtain the candidate again; do not disable safety checks.'],['EXECUTOR_UNAVAILABLE','The extractor is unavailable or failed verification. Obtain the candidate again; do not disable safety checks.']])('explains %s without discarding original diagnostics',async(code,hint)=>{vi.mocked(api!.openOfficialPage).mockResolvedValueOnce({ok:false,error:{code:'io',message:'COMFY_TEST_'+code}});await click('Open official download page');expect(text(tree)).toContain(hint);expect(text(tree)).toContain('COMFY_TEST_'+code);});
  it('automatically discovers statically but never adopts, installs or runs Python',()=>{expect(api!.getState).toHaveBeenCalledTimes(1);expect(api!.discover).toHaveBeenCalledTimes(1);expect(api!.adoptCandidate).not.toHaveBeenCalled();expect(api!.install).not.toHaveBeenCalled();expect(text(tree)).toContain('Static discovery does not run any programs.');expect(text(tree)).toContain('fixture/ComfyUI');});
  it('requires explicit candidate execution consent, including direct disabled handler calls',async()=>{expect(button('Adopt and inspect').props.disabled).toBe(true);await click('Adopt and inspect');expect(api!.adoptCandidate).not.toHaveBeenCalled();check(consent,true);await click('Adopt and inspect');expect(api!.adoptCandidate).toHaveBeenCalledExactlyOnceWith('candidate1',true);expect(onAdopt).toHaveBeenCalledWith(config);});
  it('shows absent Python without allowing candidate execution',async()=>{emit({...state,discovery:{...state.discovery!,environments:[{...state.discovery!.environments[0],python:'',reason:'python-not-found'}]}});await settle();expect(input(consent).props.disabled).toBe(true);expect(button('Adopt and inspect').props.disabled).toBe(true);expect(text(tree)).toContain('Python was not found. Choose it manually.');});
  it('invalidates execution consent when discovered Python changes',async()=>{check(consent,true);emit({...state,discovery:{...state.discovery!,environments:[{...state.discovery!.environments[0],python:'fixture/changed-python.exe'}]}});await settle();expect(input(consent).props.checked).toBe(false);await click('Adopt and inspect');expect(api!.adoptCandidate).not.toHaveBeenCalled();});
  it('uses only main-owned pickers and an explicit official-page action',async()=>{expect(api!.openOfficialPage).not.toHaveBeenCalled();await click('Open official download page');await click('Choose complete package');await click('Choose separate environment location');expect(api!.openOfficialPage).toHaveBeenCalledExactlyOnceWith();expect(api!.chooseArchive).toHaveBeenCalledExactlyOnceWith();expect(api!.chooseTargetDirectory).toHaveBeenCalledExactlyOnceWith();expect(walk(tree).filter(n=>n.type==='input'&&n.props.type!=='checkbox')).toEqual([]);});
  it('identifies local hash honestly and blocks installation until explicit unverified-source acknowledgement',async()=>{state={...state,package:{id:'package1',name:'fixture.7z',bytes:2048,sha256:'a'.repeat(64),officialHash:null,source:'user-import'}};emit(state);await settle();expect(text(tree)).toContain('Local SHA-256 (not an official checksum)');expect(text(tree)).toContain('a'.repeat(64));await click('Install package (models not configured)');expect(api!.install).not.toHaveBeenCalled();check(acknowledgement,true);await click('Install package (models not configured)');expect(api!.install).toHaveBeenCalledExactlyOnceWith({acknowledgeUnverifiedSource:true});});
  it('invalidates archive acknowledgement when the package changes',async()=>{state={...state,package:{id:'package1',name:'one.7z',bytes:2048,sha256:'a'.repeat(64),officialHash:null,source:'user-import'}};emit(state);await settle();check(acknowledgement,true);expect(input(acknowledgement).props.checked).toBe(true);emit({...state,package:{...state.package!,id:'package2',sha256:'b'.repeat(64)}});await settle();expect(input(acknowledgement).props.checked).toBe(false);});
  it('renders only real event progress and cancels through the bridge',async()=>{emit({...state,phase:'extracting',jobId:'fixture-job',progress:{completed:3,total:9,unit:'entries'}});await settle();const progress=walk(tree).find(n=>n.type==='progress')!;expect(progress.props.value).toBe(3);expect(progress.props.max).toBe(9);await click('Cancel current operation');expect(api!.cancel).toHaveBeenCalledExactlyOnceWith();expect(text(tree)).toContain('Cancelled');});
  it('does not claim installed means generation-ready or auto-adopt/create shortcuts',async()=>{const installed={id:'managed1',root:'fixture/env1',python:'fixture/env1/python.exe',launcherPath:'fixture/env1/launcher.exe',launcherSha256:'c'.repeat(64),modelDirectory:null,createdAt:'2026-10-20'};state={...state,phase:'completed',installed,environments:[installed]};emit(state);await settle();expect(text(tree)).toContain('Models are not configured');expect(api!.adoptCandidate).not.toHaveBeenCalled();expect(api!.createShortcut).not.toHaveBeenCalled();await click('Create desktop shortcut (no overwrite)');expect(api!.createShortcut).toHaveBeenCalledExactlyOnceWith('managed1');expect(text(tree)).toContain('fixture/Desktop/ComfyUI.lnk');});
  it('reports installation activity to lock conflicting workbench actions',async()=>{emit({...state,phase:'extracting'});await settle();expect(onBusyChange).toHaveBeenLastCalledWith(true);emit({...state,phase:'completed'});await settle();expect(onBusyChange).toHaveBeenLastCalledWith(false);});
  it('blocks environment execution and installation while the current service is active',async()=>{check(consent,true);locked=true;render();expect(button('Adopt and inspect').props.disabled).toBe(true);await click('Adopt and inspect');expect(api!.adoptCandidate).not.toHaveBeenCalled();expect(button('Choose complete package').props.disabled).toBe(true);expect(text(tree)).toContain('Stop or disconnect the running service before changing environments.');});
  it('preserves literal installation diagnostics without making up progress',async()=>{emit({...state,phase:'failed',message:'COMFY_FIXTURE_RAW_FAILURE',progress:null});await settle();expect(text(tree)).toContain('COMFY_FIXTURE_RAW_FAILURE');expect(walk(tree).some(n=>n.type==='progress')).toBe(false);});
  it('degrades safely when the optional setup bridge is missing',async()=>{hooks.reset();api=undefined;render();await settle();expect(text(tree)).toContain('The setup bridge is unavailable. Use manual configuration.');expect(onAdopt).not.toHaveBeenCalled();});
  it('does not offer managed installation on unsupported platforms and unsubscribes on unmount',async()=>{emit({...state,supported:false});await settle();expect(button('Choose complete package').props.disabled).toBe(true);expect(button('Install package (models not configured)').props.disabled).toBe(true);hooks.reset();expect(unsubscribe).toHaveBeenCalledTimes(1);});
  it('keeps new installation folded by default and separates it from existing-environment actions',()=>{
    const install=walk(tree).find(n=>n.type==='details'&&n.props.className==='comfy-setup-install')!;
    expect(install.props.open).toBe(false);expect(text(install)).toContain('For a new empty directory only');
    expect(button(featureText('en-US','手动选择已有环境'))).toBeTruthy();
  });
  it('shows interpreter conflicts and actual arguments without adopting a different interpreter',async()=>{
    const candidate={...state.discovery!.environments[0],isCurrent:true,source:'configured' as const,pythonArgs:[]};
    emit({...state,discovery:{...state.discovery!,environments:[candidate],current:candidate,conflict:true}});await settle();
    expect(text(tree)).toContain('Multiple Python interpreters were found');expect(text(tree)).toContain('Current configuration');expect(text(tree)).toContain('Interpreter arguments');expect(text(tree)).not.toContain('-s');expect(api!.adoptCandidate).not.toHaveBeenCalled();
    check(consent,true);emit({...state,discovery:{...state.discovery!,environments:[{...candidate,pythonArgs:['-s']}]}});await settle();expect(input(consent).props.checked).toBe(false);
  });
  it('offers an existing-environment route for a nonempty install target without bypassing the overwrite refusal',async()=>{
    vi.mocked(api!.chooseTargetDirectory).mockResolvedValueOnce({ok:false,error:{code:'internal',message:'COMFY_LOCATION_NOT_EMPTY'}});
    await click('Choose separate environment location');expect(text(tree)).toContain('COMFY_LOCATION_NOT_EMPTY');expect(text(tree)).toContain('cannot be overwritten');
    await click('Already installed here? Configure the existing environment');expect(onManual).toHaveBeenCalledTimes(1);expect(api!.install).not.toHaveBeenCalled();expect(api!.adoptCandidate).not.toHaveBeenCalled();
  });
  it('refreshes current candidates in the same mounted modal after an explicit parent configuration change',async()=>{
    const before=vi.mocked(api!.discover).mock.calls.length;
    state={...state,discovery:{...state.discovery!,environments:[{...state.discovery!.environments[0],python:'fixture/new-python.exe',isCurrent:true}]}};
    refreshKey++;render();await settle();
    expect(api!.discover).toHaveBeenCalledTimes(before+1);expect(text(tree)).toContain('fixture/new-python.exe');expect(text(tree)).toContain('Current configuration');
    expect(api!.adoptCandidate).not.toHaveBeenCalled();expect(api!.install).not.toHaveBeenCalled();
  });
  it('keeps official acquisition and package import visible outside collapsed install details',()=>{
    const install=walk(tree).find(n=>n.type==='details'&&n.props.className==='comfy-setup-install')!;
    expect(install.props.open).toBe(false);
    expect(text(install)).not.toContain('Open official download page');
    expect(text(install)).not.toContain('Choose complete package');
    expect(button('Open official download page')).toBeTruthy();expect(button('Choose complete package')).toBeTruthy();
  });
  it('offers one directory choice as the primary existing-environment action without invoking adoption',async()=>{
    const before=vi.mocked(api!.discover).mock.calls.length;
    await click(featureText('en-US','选择 ComfyUI 目录'));
    expect(onManual).toHaveBeenCalledTimes(1);expect(api!.discover).toHaveBeenCalledTimes(before);
    expect(api!.adoptCandidate).not.toHaveBeenCalled();expect(api!.install).not.toHaveBeenCalled();
    expect(text(tree)).toContain(featureText('en-US','选择 ComfyUI 目录后，自动只读检测兼容 Python 和可用端口；不会安装或升级依赖。'));
  });
  it('opens installation position and acknowledgement automatically after selecting an archive',async()=>{
    emit({...state,package:{id:'package1',name:'fixture.7z',bytes:2048,sha256:'a'.repeat(64),officialHash:null,source:'user-import'}});await settle();
    const install=walk(tree).find(n=>n.type==='details'&&n.props.className==='comfy-setup-install')!;
    expect(install.props.open).toBe(true);expect(api!.install).not.toHaveBeenCalled();
  });
  it('folds interpreter/model diagnostics but leaves each candidate root and consent visible',()=>{
    const candidate=walk(tree).find(n=>n.type==='article'&&n.props['data-environment-id']==='candidate1')!;
    const detail=walk(candidate).find(n=>n.type==='details'&&n.props.className==='comfy-environment-candidate-details')!;
    expect(detail.props.open).not.toBe(true);expect(text(detail)).toContain('fixture/python.exe');
    expect(text(candidate)).toContain('fixture/ComfyUI');expect(input(consent)).toBeTruthy();
  });
  it('provides optional existing-instance navigation without requiring the setup bridge or Python',async()=>{
    hooks.reset();const oldApi=api!;const before=vi.mocked(oldApi.discover).mock.calls.length;api=undefined;onConnectExisting=vi.fn();renderMode='setup';render();await settle();
    await click(featureText('en-US','连接已运行的实例'));
    expect(onConnectExisting).toHaveBeenCalledTimes(1);expect(oldApi.discover).toHaveBeenCalledTimes(before);
    expect(oldApi.adoptCandidate).not.toHaveBeenCalled();expect(oldApi.install).not.toHaveBeenCalled();
    expect(button(featureText('en-US','选择 ComfyUI 目录'))).toBeTruthy();expect(tree.props['data-render-mode']).toBe('setup');
  });
  it('does not offer optional instance navigation unless a parent owns that flow',()=>{
    expect(button(featureText('en-US','连接已运行的实例'))).toBeUndefined();
  });
  it('guards optional instance navigation while active environment changes are locked',async()=>{
    onConnectExisting=vi.fn();locked=true;render();
    expect(button(featureText('en-US','连接已运行的实例')).props.disabled).toBe(true);
    await click(featureText('en-US','连接已运行的实例'));expect(onConnectExisting).not.toHaveBeenCalled();
  });
});
