import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Button,AppPortal,SelectMenuCompat} from './components/ui';
import {Icon} from './components/icons';
import {MdOpenInFull} from 'react-icons/md';
import {PreviewImageViewer} from './components/PreviewImageViewer';
import {useFeatureText} from './feature-i18n';
import {useAppStore} from './store';
import {COMFY_LIMITS,type ComfyAnalysis,type ComfyLocalConfig,type ComfyPlatformInfo,type ComfySnapshot,type ComfyWorkflowSummary,type ComfyResultItem,type ComfyRunSnapshot,type ComfySlot,type ComfySlotValue,type ComfyResponse,type ComfyRunRequest} from './comfyui/contract';
import './comfyui-local.css';
import {COMFY_BUILTIN_SIZES,COMFY_CUSTOM_SIZE_LIMIT,comfySizeId,comfyDimensionPixels,comfySizePresetValues,loadComfySizePresets,saveComfySizePresets,type ComfySizePreset} from './comfyui/size-presets';
import {ComfyEnvironmentSetup} from './comfyui/ui/ComfyEnvironmentSetup';
import {ComfyResultActionsMenu} from './comfyui/ui/ComfyResultActionsMenu';
import {ComfyTaskCard} from './comfyui/ui/ComfyTaskCard';
import {comfyTaskFacts} from './comfyui/task-records';
import {comfyDisplayAdvancedLabel,comfyDisplayNodeTitle} from './comfyui/display-labels';
import {deriveComfyEnvironmentGuide} from './comfyui/environment-guide';
import './comfyui/ui/comfy-environment-guide.css';
import {loadComfyWorkspaceDrafts,saveComfyWorkspaceDrafts,type ComfyWorkspaceDraft} from './comfyui/workspace-drafts';

type Text=(key:string,values?:Record<string,string|number>)=>string;
type RefreshSection={status:'pending'|'ok'|'skipped'|'failed'|'superseded';detail?:string;at?:number};
type RefreshSections=Record<'state'|'inventory'|'analysis',RefreshSection>;
type RefreshState={status:'idle'}|{status:'running'|'settled';generation:number;startedAt:number;finishedAt?:number;outcome?:'ok'|'partial'|'failed';sections:RefreshSections};
function lifecycleKey(snapshot:ComfySnapshot|null){return snapshot?JSON.stringify([snapshot.phase,snapshot.owner,snapshot.baseUrl,snapshot.target.host,snapshot.target.port,snapshot.readyAt]):'';}
function conversionKey(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(conversionKey).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${conversionKey(item)}`).join(',')}}`;
  return JSON.stringify(value)??'undefined';
}

type AnalysisState={status:'idle'}|{status:'loading';workflowId:string;ticket:number}|{status:'ready';workflowId:string;report:ComfyAnalysis;afterRunId?:string}|{status:'error';workflowId:string;ticket:number;message:string;retryable:boolean};

export function comfyElapsed(startedAt:number|undefined,now:number):string {
  const seconds=Math.max(0,Math.floor((now-(startedAt!==undefined&&Number.isFinite(startedAt)?startedAt:now))/1000));
  return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
}

const PYTHON_SETUP_HINT='请先选择 ComfyUI 目录，再选择 Python。';

const FAILURE_TEXT:Record<string,string>={
  'not-configured':'ComfyUI 尚未配置，请选择本地目录和 Python。',
  'install-invalid':'ComfyUI 安装目录无效。',
  'python-invalid':'Python 不可用，请重新选择解释器。',
  'help-probe-failed':'无法读取此 ComfyUI 的启动参数帮助。',
  'port-foreign':'端口已被其他程序占用，请更换端口；不会结束其他程序。',
  'port-reserved':'系统保留或禁止使用此端口，请更换端口。',
  'spawn-error':'无法创建 ComfyUI 进程。',
  'exited-early':'ComfyUI 在就绪前退出，请查看退出码和日志。',
  'ready-timeout':'等待 ComfyUI 就绪超时，已清理本软件创建的进程。',
  'attribution-mismatch':'服务归属校验失败，不会接管其他进程。',
  crashed:'ComfyUI 意外退出，请查看日志。',
  unreachable:'连接已有实例失败；请检查地址与端口，或使用“启动本地 ComfyUI”。',
  'not-comfyui':'该端口返回的不是可识别的 ComfyUI 服务。',
  'stop-failed':'尚未确认服务已停止，请查看诊断信息。',
};
const PHASE_TEXT:Record<string,string>={idle:'未启动',probing:'检测端口',starting:'启动中',ready:'启动完成',stopping:'停止中',stopped:'已停止',failed:'启动失败'};
const RUN_TEXT:Record<string,string>={validating:'正在校验',saving:'保存结果中',submitting:'正在提交',queued:'排队中',running:'运行中',completed:'已完成',failed:'已失败',canceled:'已取消',cancelled:'已取消',canceling:'取消中',cancelling:'取消中'};
const KIND_TEXT:Record<string,string>={
  positive:'正面提示词',negative:'负面提示词',prompt:'正面提示词',positive_prompt:'正面提示词',negative_prompt:'负面提示词',
  width:'宽度',height:'高度',seed:'种子',steps:'步数',cfg:'CFG',batch:'批量数',batch_size:'批量数',
  model:'模型文件',checkpoint:'模型文件',unet:'模型文件',clip:'文本编码器',text_encoder:'文本编码器',vae:'VAE 文件',
  sampler:'采样器',scheduler:'调度器',denoise:'重绘强度',
};

function Field({label,children,wide=false,meta,aligned=false}:{label:string;children:ReactNode;wide?:boolean;meta?:string;aligned?:boolean}) {
  const metadata=meta?<small className="comfy-local-slot-meta">{meta}</small>:null;
  return <label className={`comfy-local-field${wide?' wide':''}${aligned?' comfy-studio-field-aligned':''}`}><span>{label}</span>{aligned?<div className="comfy-studio-field-body">{children}{metadata}</div>:<>{children}{metadata}</>}</label>;
}

function formatError(error:unknown):string {return error instanceof Error?error.message:String(error);}

async function unwrap<T>(promise:Promise<ComfyResponse<T>>):Promise<T> {
  const response=await promise;
  if(!response.ok){
    if(response.error.code==='not-configured')throw new Error(PYTHON_SETUP_HINT);
    throw new Error(`[${response.error.code}] ${response.error.message}${response.error.detail?`\n${response.error.detail}`:''}`);
  }
  return response.data;
}

function slotLabel(slot:ComfySlot,ft:Text):string {
  if(slot.kind==='model'&&(slot.role==='diffusion'||slot.role==='checkpoint'))return ft('主模型');
  if(slot.kind==='model'&&slot.role==='text-encoder')return ft('文本编码器');
  if(slot.kind==='model'&&slot.role==='vae')return ft('VAE 文件');
  return KIND_TEXT[slot.kind]?ft(KIND_TEXT[slot.kind]):slot.label;
}

function SlotInput({slot,value,disabled,onChange,onReset,ft,showMapping=false,issue,displayLabel,accessibleLabel,aligned=false}:{slot:ComfySlot;value:ComfySlotValue|null;disabled:boolean;onChange:(value:ComfySlotValue|null)=>void;onReset?:()=>void;ft:Text;showMapping?:boolean;issue?:string;displayLabel?:string;accessibleLabel?:string;aligned?:boolean}) {
  const base=displayLabel??slotLabel(slot,ft),label=showMapping?`${base} · ${slot.nodeId}.${slot.input}`:base;
  const ariaLabel=accessibleLabel??label;
  const meta=`${slot.classType} #${slot.nodeId} → ${slot.input}${slot.linkedFrom?` ← #${slot.linkedFrom.nodeId}`:''}`;
  const wide=slot.multiline||slot.kind==='positive'||slot.kind==='negative';
  let input:ReactNode;
  if(slot.valueType==='combo'&&slot.options){
    const options=slot.options,selectedIndex=options.findIndex(option=>option===value),missing=value!==null&&selectedIndex<0;
    // Only filename-only model controls retain their existing DOM values. All
    // other combos use an index token, never a stringified scalar round-trip.
    const filenames=slot.kind==='model'&&options.every(option=>typeof option==='string');
    const tokens=options.map((option,index)=>filenames?option as string:`combo:${index}`);
    let emptyToken='comfy:unselected';while(tokens.includes(emptyToken))emptyToken+=':';
    const selected=selectedIndex<0?emptyToken:tokens[selectedIndex],display=String(value??'');
    input=<><SelectMenuCompat aria-label={ariaLabel} title={display} value={selected} popoverClassName="comfy-studio-slot-options" disabled={disabled} onChange={event=>{const index=tokens.indexOf(event.target.value);onChange(index<0?null:options[index]);}}>
      {value===null?<option value={emptyToken}>{ft('未选择')}</option>:null}
      {missing?<option value={emptyToken} disabled>{display}</option>:null}
      {options.map((option,index)=><option value={tokens[index]} key={index}>{String(option)}</option>)}
    </SelectMenuCompat>{missing?<><small className="comfy-local-slot-meta">{ft('当前值不在本机可选项中：{value}',{value:`${typeof value}: ${display}`})}</small>{onReset?<Button variant="ghost" disabled={disabled} onClick={onReset}>{ft('恢复默认')}</Button>:null}</>:null}</>;
  }else if(slot.valueType==='boolean'){
    input=<input type="checkbox" aria-label={ariaLabel} checked={value===true} disabled={disabled} onChange={event=>onChange(event.target.checked)}/>;
  }else if(slot.valueType==='int'||slot.valueType==='float'){
    input=<input type="number" aria-label={ariaLabel} value={typeof value==='number'?value:''} min={slot.min} max={slot.max} step={slot.step??(slot.valueType==='int'?1:'any')} disabled={disabled} onChange={event=>onChange(event.target.value===''?null:Number(event.target.value))}/>;
  }else if(wide){
    input=<textarea aria-label={ariaLabel} value={String(value??'')} maxLength={COMFY_LIMITS.slotTextChars} disabled={disabled} onChange={event=>onChange(event.target.value)}/>;
  }else{
    input=<input aria-label={ariaLabel} value={String(value??'')} maxLength={COMFY_LIMITS.slotTextChars} disabled={disabled} onChange={event=>onChange(event.target.value)}/>;
  }
  return <div className={`comfy-studio-slot${wide?' wide':''}${slot.kind==='model'?' model-slot':''}`} title={slot.kind==='model'?String(value??''):undefined} data-comfy-slot={slot.id} data-comfy-invalid={Boolean(issue)}><Field label={label} wide={Boolean(wide)} aligned={aligned} meta={showMapping?meta:undefined}>{input}{issue?<small className="comfy-studio-field-error" role="status">{issue}</small>:null}</Field></div>;
}

export function comfySlotSource(slot:ComfySlot):string {return `${slot.nodeTitle?.trim()||slot.classType} #${slot.nodeId}`;}
export function comfyNodeGroups(slots:ComfySlot[]):Array<{nodeId:string;source:string;slots:ComfySlot[]}> {
  const groups=new Map<string,{nodeId:string;source:string;slots:ComfySlot[]}>();
  for(const slot of slots){let group=groups.get(slot.nodeId);if(!group){group={nodeId:slot.nodeId,source:comfySlotSource(slot),slots:[]};groups.set(slot.nodeId,group);}group.slots.push(slot);}
  return [...groups.values()];
}
export function comfyDimensionRows(slots:ComfySlot[]):Array<{key:string;source:string;width?:ComfySlot;height?:ComfySlot}> {
  return comfyNodeGroups(slots).flatMap(group=>{const widths=group.slots.filter(slot=>slot.kind==='width'),heights=group.slots.filter(slot=>slot.kind==='height');return Array.from({length:Math.max(widths.length,heights.length)},(_,index)=>({key:`${group.nodeId}:${index}`,source:group.source,width:widths[index],height:heights[index]}));});
}

function workflowFamily(item:ComfyWorkflowSummary):string|null {
  if(item.familyLabel)return item.familyLabel;
  return ({'builtin-local-1-v1':'moss-image','builtin-local-2-v1':'anima','builtin-local-3-v1':'krea2'} as Record<string,string>)[item.id]??null;
}
function builtinWorkflow(item:ComfyWorkflowSummary):boolean{return /^builtin-local-\d+-v\d+$/.test(item.id);}

export const COMFY_PAGE_SIZES=[12,24,48,60] as const;
function pageSizeKey(kind:'runs'|'results'){return `langbai.comfy-local.${kind}-page-size.v1`;}
function loadPageSize(kind:'runs'|'results'):number{try{const value=Number(globalThis.localStorage?.getItem(pageSizeKey(kind)));return (COMFY_PAGE_SIZES as readonly number[]).includes(value)?value:12;}catch{return 12;}}
const ACTIVE_RUN_PHASES=new Set(['validating','submitting','queued','running','saving','cancelling']);
const REANALYZE_RUN_ERRORS=new Set(['COMFY_STALE_ANALYSIS','COMFY_STALE_CATALOG_REANALYZE','COMFY_STALE_SCHEMA_REANALYZE','COMFY_STALE_VALUES_REANALYZE']);
const UNCERTAIN_RUN_ERRORS=new Set(['submission-uncertain','monitoring-lost','monitoring-timeout']);
function latestWorkflowRun(runs:ComfyRunSnapshot[],workflowId:string):ComfyRunSnapshot|undefined{
  return runs.filter(run=>!workflowId||run.workflowId===workflowId).reduce<ComfyRunSnapshot|undefined>((latest,run)=>!latest||(Date.parse(run.startedAt)||0)>(Date.parse(latest.startedAt)||0)?run:latest,undefined);
}
export function comfyColumnLayout(width:number,collapsed:boolean,wide:boolean,preferred:number|null=null){
  const container=Number.isFinite(width)&&width>0?width:1280;
  const available=Math.max(0,container-(!collapsed&&wide?220:0)-(collapsed||!wide?28:38));
  const minimum=Math.min(460,Math.max(280,available-320)),maximum=Math.max(minimum,available-320);
  const wanted=preferred!==null&&Number.isFinite(preferred)?preferred:Math.round(available*0.6);
  return {minimum,maximum,width:Math.max(minimum,Math.min(maximum,wanted)),available};
}
/** Width is the outer content container in CSS pixels, never device pixels. */
export function comfyStudioLayout(width:number,libraryPinned:boolean,preferred:number|null=null){
  const container=Number.isFinite(width)&&width>0?width:1280;
  const mode=container<960?'tabs':'split';
  const libraryDocked=libraryPinned&&container>=1282;
  const minimum=mode==='tabs'?Math.min(520,container):520;
  const maximum=mode==='tabs'?container:Math.max(minimum,Math.min(760,container-(libraryDocked?762:481)));
  const wanted=preferred!==null&&Number.isFinite(preferred)?preferred:container<1120?520:640;
  const parameterWidth=mode==='tabs'?container:Math.max(minimum,Math.min(maximum,wanted));
  return {mode,libraryDocked,minimum,maximum,width:parameterWidth,stageWidth:mode==='tabs'?container:container-(libraryDocked?282:1)-parameterWidth};
}
export function comfyCancelledSummary(savedCount:number|null,saveFailed=false):string{
  if(saveFailed)return '已取消 · 保存已完成的图片时出错';
  if(savedCount===null)return '已取消。取消前完成的图片（如有）会出现在作品库';
  return savedCount>0?`已取消 · 取消前完成的 ${savedCount} 张图片已保存`:'已取消 · 本软件未为此任务保存图片';
}
function loadStudioPreference<T>(key:string,fallback:T):T{try{const raw=globalThis.localStorage?.getItem(`langbai.comfy-studio.${key}.v1`);return raw===null||raw===undefined?fallback:JSON.parse(raw) as T;}catch{return fallback;}}
function mergeRunHistory(incoming:ComfyRunSnapshot[],previous:ComfyRunSnapshot[],active?:ComfyRunSnapshot|null):ComfyRunSnapshot[]{
  const seen=new Set<string>(),merged:ComfyRunSnapshot[]=[];
  for(const run of [...(active?[active]:[]),...previous.filter(item=>!item.history),...incoming,...previous]){
    if(seen.has(run.runId))continue;seen.add(run.runId);merged.push(run);if(merged.length>=COMFY_LIMITS.runHistoryEntries)break;
  }
  return merged;
}

export default function ComfyLocalTool({onBack}:{onBack:()=>void}) {
  const ft=useFeatureText();
  const api=window.naiComfy;
  const language=useAppStore(state=>state.settings?.language);
  const [config,setConfig]=useState<ComfyLocalConfig|null>(null);
  const [snapshot,setSnapshot]=useState<ComfySnapshot|null>(null);
  const [platform,setPlatform]=useState<ComfyPlatformInfo|null>(null);
  const [workflows,setWorkflows]=useState<ComfyWorkflowSummary[]>([]);
  const workflowsRef=useRef(workflows);workflowsRef.current=workflows;
  const [workflowListLoaded,setWorkflowListLoaded]=useState(false);
  const [workspaceInitial]=useState(loadComfyWorkspaceDrafts);
  const workspaceDrafts=useRef(new Map<string,ComfyWorkspaceDraft>(workspaceInitial.drafts.map(item=>[item.workflowId,item])));
  const workspaceBootstrapped=useRef(false);
  const workspaceFingerprint=useRef('');
  const workspaceWasEdited=useRef(false);
  const [workspaceWarning,setWorkspaceWarning]=useState<string|null>(workspaceInitial.warning?'部分编辑草稿无法读取，原存储未自动覆盖。':null);
  const [saveAsOpen,setSaveAsOpen]=useState(false);
  const [saveAsName,setSaveAsName]=useState('');
  const saveFlight=useRef(false);
  const deleteFlight=useRef(false);
  const reuseFlight=useRef(false);
  const [expandedRunId,setExpandedRunId]=useState<string|null>(null);
  const [results,setResults]=useState<ComfyResultItem[]>([]);
  const [runs,setRuns]=useState<ComfyRunSnapshot[]>([]);
  const [checkedUncertainRuns,setCheckedUncertainRuns]=useState<Record<string,boolean>>({});
  const [selected,setSelected]=useState('');
  const selectedRef=useRef(selected);selectedRef.current=selected;
  const [analysisState,setAnalysisState]=useState<AnalysisState>({status:'idle'});
  const analysisStateRef=useRef(analysisState);analysisStateRef.current=analysisState;
  const [refreshState,setRefreshState]=useState<RefreshState>({status:'idle'});
  const [lastFullSuccessAt,setLastFullSuccessAt]=useState<number|null>(null);
  const [refreshStatusVisible,setRefreshStatusVisible]=useState(true);
  const [refreshAnalysisStale,setRefreshAnalysisStale]=useState(false);
  const refreshFlight=useRef<Promise<void>|null>(null);
  const refreshGeneration=useRef(0);
  const [values,setValues]=useState<Record<string,ComfySlotValue>>({});
  const [sizePresets,setSizePresets]=useState(loadComfySizePresets);
  const [sizeFeedback,setSizeFeedback]=useState<{kind:'error'|'success';text:string}|null>(null);
  const valuesRef=useRef(values);valuesRef.current=values;
  const [seedMode,setSeedMode]=useState<'fixed'|'random'>('random');
  const seedModeRef=useRef(seedMode);seedModeRef.current=seedMode;
  const [acceptedFingerprint,setAcceptedFingerprint]=useState<string|null>(null);
  const [acceptedConversion,setAcceptedConversion]=useState(false);
  const [pending,setPending]=useState<string[]>([]);
  const [setupBusy,setSetupBusy]=useState(false);
  const [setupRevision,setSetupRevision]=useState(0);
  const [notice,setNotice]=useState<{kind:'error'|'success';text:string}|null>(null);
  const [family,setFamily]=useState('');
  const [search,setSearch]=useState('');
  const [drawer,setDrawer]=useState<'environment'|'logs'|'analysis'|null>(null);
  const [libraryPinned,setLibraryPinned]=useState(()=>loadStudioPreference<boolean>('library-pinned',false)===true);
  const [libraryOpen,setLibraryOpen]=useState(false);
  const [view,setView]=useState<'create'|'works'|'tasks'>('create');
  const [compactTab,setCompactTab]=useState<'parameters'|'image'>('parameters');
  const [showMapping,setShowMapping]=useState(false);
  const [serviceMenu,setServiceMenu]=useState(false);
  const [connectionCancelling,setConnectionCancelling]=useState(false);
  const connectionTicket=useRef(0);
  const [moreMenu,setMoreMenu]=useState(false);
  const [connectionOpen,setConnectionOpen]=useState(false);
  const connectionDetailsRef=useRef<HTMLDetailsElement>(null);
  const directoryFlight=useRef(false);
  const startFlight=useRef(false);
  const startGeneration=useRef(0);
  const startInvoked=useRef(false);
  const stopFlight=useRef(false);
  const [troubleshootingOpen,setTroubleshootingOpen]=useState(false);
  const [parameterWidth,setParameterWidth]=useState<number|null>(()=>{const saved=loadStudioPreference<number|null>('parameter-width',null);return typeof saved==='number'&&Number.isFinite(saved)?saved:null;});
  const [pinNotice,setPinNotice]=useState(false);
  const pinNoticeShown=useRef(false);
  const [workFilter,setWorkFilter]=useState('');
  const [sessionRunIds,setSessionRunIds]=useState<string[]>([]);
  const libraryRef=useRef<HTMLDivElement>(null);
  const parameterScrollRef=useRef<HTMLDivElement>(null);
  const connectRef=useRef<HTMLDivElement>(null);
  const [workbenchWidth,setWorkbenchWidth]=useState(1280);
  const [runPageSize,setRunPageSize]=useState(()=>loadPageSize('runs'));
  const [resultPageSize,setResultPageSize]=useState(()=>loadPageSize('results'));
  const [runPage,setRunPage]=useState(1);
  const [resultPage,setResultPage]=useState(1);
  const [historyIncomplete,setHistoryIncomplete]=useState(false);
  const [manualMode,setManualMode]=useState(false);
  const [canvasResultId,setCanvasResultId]=useState<string|null>(null);
  const imageMenuTriggerRef=useRef<HTMLButtonElement>(null);
  const [imageMenu,setImageMenu]=useState<{focusFirst:boolean}|null>(null);
  const [copiedResult,setCopiedResult]=useState<{id:string;at:number}|null>(null);
  const [galleryResultId,setGalleryResultId]=useState<string|null>(null);
  const [paste,setPaste]=useState('');
  const [importName,setImportName]=useState('');
  const [rename,setRename]=useState('');
  const [deleteConfirm,setDeleteConfirm]=useState(false);
  const [port,setPort]=useState('8188');
  const [connectionPort,setConnectionPort]=useState('8188');
  const [portMode,setPortMode]=useState<'auto'|'manual'>('manual');
  const [timeout,setTimeoutValue]=useState('300');
  const [host,setHost]=useState<'127.0.0.1'|'localhost'|'::1'>('127.0.0.1');
  const [disableApiNodes,setDisableApiNodes]=useState(true);
  const [safeMode,setSafeMode]=useState(false);
  const [extraArgs,setExtraArgs]=useState('');
  const [now,setNow]=useState(Date.now());
  const [previewIndex,setPreviewIndex]=useState<number|null>(null);
  const [livePreviews,setLivePreviews]=useState<Record<string,string>>({});
  const mounted=useRef(true);
  const snapshotRef=useRef(snapshot);snapshotRef.current=snapshot;
  const collectionEvents=useRef({workflows:0,results:0});
  const snapshotEvents=useRef<{sequence:number;snapshot:ComfySnapshot|null}>({sequence:0,snapshot:null});
  const manualConfigRef=useRef<HTMLDetailsElement>(null);
  const directoryPickerRef=useRef<HTMLDivElement>(null);
  const advancedFocusRef=useRef<'python'|'summary'|null>(null);
  const [advancedFocusTicket,setAdvancedFocusTicket]=useState(0);
  const analysisTicket=useRef(0);
  const workbenchRef=useRef<HTMLDivElement>(null);
  const preparationGate=useRef(true);
  const webOpening=useRef(false);
  const columnDrag=useRef<{pointerId:number;x:number;width:number}|null>(null);
  // An in-flight setup owns its mounted surface until main confirms completion
  // or cancellation, even if an unrelated ready event arrives meanwhile.
  if(!setupBusy)preparationGate.current=!config?.install&&snapshot?.phase!=='ready';
  const preparing=preparationGate.current;
  const columnLayout=comfyStudioLayout(workbenchWidth,libraryPinned,parameterWidth);
  const libraryDocked=columnLayout.libraryDocked&&view==='create'&&!preparing,compact=columnLayout.mode==='tabs';
  const parameterMinimum=columnLayout.minimum,parameterMaximum=columnLayout.maximum,actualParameterWidth=columnLayout.width;
  const busy=pending.length>0||setupBusy;
  const refreshing=refreshState.status==='running';
  const ready=snapshot?.phase==='ready';
  const readyRef=useRef(ready);readyRef.current=ready;
  const analysis=ready&&analysisState.status==='ready'&&analysisState.workflowId===selected?analysisState.report:null;
  const analysisLoading=ready&&analysisState.status==='loading'&&analysisState.workflowId===selected;
  const analysisError=analysisState.status==='error'&&analysisState.workflowId===selected?analysisState:null;
  const serviceBusy=['probing','starting','stopping'].includes(snapshot?.phase??'');
  const configLocked=serviceBusy||ready;
  const hasPython=Boolean(config?.install?.python?.trim());
  const workflow=workflows.find(item=>item.id===selected);
  const shownWorkflows=workflows.filter(item=>(!family||(family==='other'?!['moss-image','anima','krea2'].includes(workflowFamily(item)??''):workflowFamily(item)===family))&&(!search.trim()||item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const starterWorkflows=shownWorkflows.filter(builtinWorkflow);
  const importedWorkflows=shownWorkflows.filter(item=>!builtinWorkflow(item));
  const recentIds=new Set(runs.map(run=>run.workflowId));
  const recentWorkflows=shownWorkflows.filter(item=>recentIds.has(item.id));
  const shownResults=results.filter(item=>!workFilter||item.workflowId===workFilter);
  const workflowResults=results.filter(item=>!selected||item.workflowId===selected);
  const sessionResults=results.filter(item=>sessionRunIds.includes(item.runId)).slice(0,12);
  const blocking=analysis?.issues.filter(issue=>issue.severity==='block')??[];
  const invalidComboSlots=analysis?.slots.filter(slot=>slot.valueType==='combo'&&slot.options&&Object.prototype.hasOwnProperty.call(values,slot.id)&&!slot.options.includes(values[slot.id]))??[];
  const staleValueKeys=analysis?.issues.some(issue=>issue.code==='stale-slot')?Object.keys(values).filter(key=>!analysis.slots.some(slot=>slot.id===key)):[];
  const confirmationMissing=Boolean(analysis&&(analysis.thirdPartyFingerprint&&acceptedFingerprint!==analysis.thirdPartyFingerprint||analysis.unverifiedConversion&&!acceptedConversion));
  // A run reply is already authoritative admission evidence; do not wait for
  // a later snapshot push before disabling Generate. History is never active.
  const newestLiveRun=latestWorkflowRun(runs.filter(run=>!run.history),'');
  const ledgerActive=newestLiveRun&&ACTIVE_RUN_PHASES.has(newestLiveRun.phase)?newestLiveRun:null;
  const snapshotCandidate=snapshot?.activeRun&&!snapshot.activeRun.history&&ACTIVE_RUN_PHASES.has(snapshot.activeRun.phase)?snapshot.activeRun:null;
  const snapshotRun=snapshotCandidate&&!(newestLiveRun&&newestLiveRun.runId!==snapshotCandidate.runId&&(Date.parse(newestLiveRun.startedAt)||0)>(Date.parse(snapshotCandidate.startedAt)||0))?snapshotCandidate:null;
  const recordedSnapshotRun=snapshotRun?runs.find(run=>run.runId===snapshotRun.runId):null;
  const currentRun=snapshotRun?(recordedSnapshotRun?ACTIVE_RUN_PHASES.has(recordedSnapshotRun.phase)?recordedSnapshotRun:ledgerActive:snapshotRun):ledgerActive;
  // Updates to an older receipt must not replace a newer submission's outcome.
  // Equal/unknown timestamps retain the ledger's insertion order.
  const latestRun=latestWorkflowRun(runs,selected);
  const runsRef=useRef(runs);runsRef.current=runs;
  const failedRun=latestRun&&!latestRun.history&&latestRun.phase==='failed'?latestRun:null;
  const uncertainRun=latestRun&&(latestRun.history?.status==='unknown'||latestRun.phase==='failed'&&latestRun.error&&UNCERTAIN_RUN_ERRORS.has(latestRun.error.code))?latestRun:null;
  const uncertaintyPending=Boolean(uncertainRun&&!checkedUncertainRuns[uncertainRun.runId]);
  const terminalRun=uncertainRun??failedRun;
  const reanalysisRequired=Boolean(failedRun?.error&&REANALYZE_RUN_ERRORS.has(failedRun.error.code)&&!(analysisState.status==='ready'&&analysisState.workflowId===selected&&analysisState.afterRunId===failedRun.runId));
  const canRun=Boolean(ready&&selected&&analysis?.ok&&!refreshing&&!refreshAnalysisStale&&!reanalysisRequired&&!uncertaintyPending&&!blocking.length&&!invalidComboSlots.length&&!analysis.cloudNodes.length&&!confirmationMissing&&!busy&&!currentRun);
  const shownRuns=runs;
  const runPages=Math.max(1,Math.ceil(shownRuns.length/runPageSize));
  const resultPages=Math.max(1,Math.ceil(shownResults.length/resultPageSize));
  const actualRunPage=Math.min(runPages,Math.max(1,runPage));
  const actualResultPage=Math.min(resultPages,Math.max(1,resultPage));
  const visibleRuns=shownRuns.slice((actualRunPage-1)*runPageSize,actualRunPage*runPageSize);
  const visibleResults=shownResults.slice((actualResultPage-1)*resultPageSize,actualResultPage*resultPageSize);
  const canvasResult=results.find(item=>item.id===canvasResultId&&(!selected||item.workflowId===selected))??workflowResults[0];
  const galleryResult=shownResults.find(item=>item.id===galleryResultId)??shownResults.find(item=>item.id===canvasResult?.id)??shownResults[0];
  // Close the portalled image panel when its source or owning view disappears.
  useEffect(()=>{setImageMenu(null);},[canvasResult?.id,view,compactTab,previewIndex,drawer]);
  useEffect(()=>{if(!copiedResult)return;const timer=globalThis.setTimeout(()=>setCopiedResult(null),1500);return()=>globalThis.clearTimeout(timer);},[copiedResult]);
  const cancelling=currentRun?.phase==='cancelling';
  const activityRef=useRef({busy,active:Boolean(currentRun)});activityRef.current={busy,active:Boolean(currentRun)};
  const environmentActivityRef=useRef({pending,setupBusy});environmentActivityRef.current={pending,setupBusy};
  const savedCount=(run:ComfyRunSnapshot)=>run.history?run.history.resultCount??null:run.results.length;
  const cancelledText=latestRun&&['cancelled','canceled'].includes(latestRun.phase)?comfyCancelledSummary(savedCount(latestRun),Boolean(latestRun.error&&/sav/i.test(latestRun.error.code))):null;
  const livePreview=currentRun?livePreviews[currentRun.runId]:undefined;

  const adoptSnapshot=useCallback((next:ComfySnapshot)=>{snapshotRef.current=next;setSnapshot(next);},[]);
  const adoptConfig=useCallback((next:ComfyLocalConfig)=>{
    setConfig(next);setPort(String(next.launch.port));setConnectionPort(String(next.connection.port));setPortMode(next.launch.portMode??'manual');setTimeoutValue(String(next.launch.readyTimeoutSec));
    setHost(next.connection.host);setDisableApiNodes(next.launch.disableApiNodes);setSafeMode(next.launch.safeMode);
    setExtraArgs(next.launch.extraArgs.join('\n'));
  },[]);
  const adoptRun=useCallback((run:ComfyRunSnapshot)=>{
    if(run.history){setRuns(previous=>previous.some(item=>item.runId===run.runId&&!item.history)?previous:[run,...previous.filter(item=>item.runId!==run.runId)].slice(0,COMFY_LIMITS.runHistoryEntries));return;}
    const {history:_history,...liveRun}=run;setSessionRunIds(previous=>previous.includes(run.runId)?previous:[run.runId,...previous].slice(0,100));setRuns(previous=>{
      const recorded=previous.find(item=>item.runId===run.runId);
      if(recorded&&!recorded.history&&!ACTIVE_RUN_PHASES.has(recorded.phase)&&(ACTIVE_RUN_PHASES.has(run.phase)||recorded.phase==='completed'&&run.phase!=='completed'))return previous;
      if(recorded)return previous.map(item=>item.runId===run.runId?liveRun:item);
      return [liveRun,...previous].slice(0,COMFY_LIMITS.runHistoryEntries);
    });
  },[]);
  const act=useCallback(async <T,>(name:string,work:()=>Promise<T>):Promise<T|undefined>=>{
    setPending(previous=>[...previous,name]);setNotice(null);
    try{return await work();}
    catch(error){if(mounted.current)setNotice({kind:'error',text:formatError(error)});return undefined;}
    finally{if(mounted.current)setPending(previous=>{const i=previous.indexOf(name);return i<0?previous:previous.filter((_,index)=>index!==i);});}
  },[]);
  const readState=useCallback(async(isCurrent?:()=>boolean)=>{
    if(!api)return null;
    const sequence=snapshotEvents.current.sequence,collections={...collectionEvents.current};
    const bundle=await unwrap(api.getState());if(!mounted.current||isCurrent&&!isCurrent())return null;
    // Each collection has its own push sequence. A late disk-index reply must
    // not overwrite a newer IPC collection, including during initial loading.
    const effective=snapshotEvents.current.sequence===sequence?bundle.snapshot:snapshotEvents.current.snapshot??bundle.snapshot;
    const newerPushKept=collections.workflows!==collectionEvents.current.workflows||collections.results!==collectionEvents.current.results;
    adoptSnapshot(effective);setRuns(previous=>mergeRunHistory(bundle.runs??[],previous,effective.activeRun));
    if(collections.workflows===collectionEvents.current.workflows){workflowsRef.current=bundle.workflows;setWorkflows(bundle.workflows);}setWorkflowListLoaded(true);
    if(collections.results===collectionEvents.current.results)setResults(bundle.results);
    setHistoryIncomplete(Boolean(bundle.runHistoryIncomplete));
    return {...bundle,snapshot:effective,newerPushKept};
  },[api,adoptSnapshot]);

  useEffect(()=>{
    mounted.current=true;
    if(!api)return()=>{mounted.current=false;};
    const unsubscribe=api.onEvent(event=>{
      if(!mounted.current)return;
      if(event.type==='snapshot'){snapshotEvents.current={sequence:snapshotEvents.current.sequence+1,snapshot:event.snapshot};adoptSnapshot(event.snapshot);if(event.snapshot.activeRun)adoptRun(event.snapshot.activeRun);}
      else if(event.type==='run')adoptRun(event.run);
      else if(event.type==='workflows'){collectionEvents.current.workflows++;workflowsRef.current=event.workflows;setWorkflows(event.workflows);setWorkflowListLoaded(true);}
      else if(event.type==='results'){collectionEvents.current.results++;setResults(event.results);const newest=event.results[0];if(newest&&newest.workflowId===selectedRef.current)setCanvasResultId(newest.id);}
      else if(event.type==='preview')setLivePreviews(previous=>Object.fromEntries([...Object.entries(previous).filter(([id])=>id!==event.runId),[event.runId,event.dataUrl]].slice(-20)));
    });
    void act('load',async()=>{
      const bundle=await readState();if(!bundle)return;
      adoptConfig(bundle.config);setPlatform(bundle.platform);
    });
    return()=>{mounted.current=false;analysisTicket.current++;unsubscribe();};
  },[api,act,adoptConfig,adoptRun,adoptSnapshot,readState]);

  useEffect(()=>{
    if(!drawer||typeof document==='undefined')return;
    const previous=document.activeElement as HTMLElement|null;
    const element=document.querySelector<HTMLElement>(`[data-comfy-drawer="${drawer}"]`);
    element?.querySelector<HTMLElement>('.comfy-local-drawer-panel button:not(:disabled),.comfy-local-drawer-panel input:not(:disabled),.comfy-local-drawer-panel summary')?.focus();
    return()=>{if(previous?.isConnected&&!previous.closest('[inert]'))previous.focus({preventScroll:true});};
  },[drawer]);

  useEffect(()=>{
    if(!drawer||typeof document==='undefined'||typeof document.addEventListener!=='function')return;
    // Chromium can move focus to body when a clicked action becomes disabled.
    // A bubble listener covers that gap without intercepting a SelectMenu's own
    // Escape handler or closing a newer modal that owns the keyboard instead.
    const escape=(event:KeyboardEvent)=>{
      if(event.key!=='Escape'||event.defaultPrevented||drawer==='environment'&&setupBusy)return;
      if(document.querySelector('.select-menu-popover[data-disclosure-open="true"]'))return;
      const element=document.querySelector<HTMLElement>(`[data-comfy-drawer="${drawer}"]`);
      if(!element?.getClientRects().length)return;
      const otherModal=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"],[role="alertdialog"],dialog[open]')).some(other=>other!==element&&other.getClientRects().length>0&&!other.closest('[hidden],[aria-hidden="true"],[inert]'));
      if(otherModal)return;
      const active=document.activeElement;
      if(active&&active!==document.body&&active!==document.documentElement&&!element.contains(active)&&!active.closest('[inert]'))return;
      event.preventDefault();setDrawer(null);
    };
    document.addEventListener('keydown',escape);
    return()=>document.removeEventListener('keydown',escape);
  },[drawer,setupBusy]);

  useEffect(()=>{
    if(drawer!=='environment'||!manualMode||!advancedFocusRef.current)return;
    const panel=manualConfigRef.current;if(!panel)return;
    panel.open=true;
    panel.querySelector<HTMLElement>(advancedFocusRef.current==='python'?'[data-comfy-python-picker]':'summary')?.focus();
    panel.scrollIntoView({block:'nearest'});advancedFocusRef.current=null;
  },[drawer,manualMode,advancedFocusTicket]);

  function openAdvanced(target:'python'|'summary'='summary'){
    advancedFocusRef.current=target;setManualMode(true);setDrawer('environment');setAdvancedFocusTicket(value=>value+1);
  }


  useEffect(()=>{
    if(snapshot?.phase!=='starting'&&snapshot?.phase!=='probing'&&!currentRun)return;
    setNow(Date.now());const timer=window.setInterval(()=>setNow(Date.now()),1000);
    return()=>window.clearInterval(timer);
  },[snapshot?.phase,snapshot?.startedAt,currentRun?.runId]);

  useEffect(()=>{
    const element=workbenchRef.current;if(!element)return;
    let frame=0;
    const measure=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const width=element.clientWidth;if(width>0)setWorkbenchWidth(width);});};measure();
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;observer?.observe(element);
    window.addEventListener?.('resize',measure);return()=>{cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener?.('resize',measure);};
  },[]);
  useEffect(()=>{try{globalThis.localStorage?.setItem('langbai.comfy-studio.library-pinned.v1',JSON.stringify(libraryPinned));}catch{/* Session layout remains usable. */}},[libraryPinned]);
  useEffect(()=>{try{globalThis.localStorage?.setItem('langbai.comfy-studio.parameter-width.v1',JSON.stringify(parameterWidth));}catch{/* Session layout remains usable. */}},[parameterWidth]);
  useEffect(()=>{if(libraryPinned&&!columnLayout.libraryDocked&&!pinNoticeShown.current){pinNoticeShown.current=true;setPinNotice(true);}},[libraryPinned,columnLayout.libraryDocked]);
  useEffect(()=>{if(!pinNotice)return;const timer=globalThis.setTimeout(()=>setPinNotice(false),3000);return()=>globalThis.clearTimeout(timer);},[pinNotice]);
  useEffect(()=>{
    if(typeof document==='undefined'||!libraryOpen&&!serviceMenu&&!moreMenu)return;
    const close=(event:KeyboardEvent)=>{if(event.key!=='Escape'||event.defaultPrevented)return;if(document.querySelector('.select-menu-popover[data-disclosure-open="true"]'))return;setLibraryOpen(false);setServiceMenu(false);setMoreMenu(false);event.preventDefault();};
    document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);
  },[libraryOpen,serviceMenu,moreMenu]);
  useEffect(()=>{
    if(!libraryOpen||libraryDocked||typeof document==='undefined')return;
    const previous=document.activeElement as HTMLElement|null;libraryRef.current?.querySelector<HTMLElement>('input,button:not(:disabled)')?.focus();
    return()=>{if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[libraryOpen,libraryDocked]);
  useEffect(()=>{setRunPage(1);setResultPage(1);setExpandedRunId(null);setSaveAsOpen(false);},[selected]);
  useEffect(()=>{setExpandedRunId(null);},[actualRunPage,runPageSize,view]);
  useEffect(()=>{if(expandedRunId&&!visibleRuns.some(item=>item.runId===expandedRunId))setExpandedRunId(null);},[expandedRunId,visibleRuns]);
  useEffect(()=>{setRunPage(value=>Math.min(runPages,Math.max(1,value)));},[runPages]);
  useEffect(()=>{setResultPage(value=>Math.min(resultPages,Math.max(1,value)));},[resultPages]);
  useEffect(()=>{if(view==='works'&&visibleResults.length&&!visibleResults.some(item=>item.id===galleryResultId))setGalleryResultId(visibleResults[0].id);},[view,actualResultPage,resultPageSize,workFilter,results]);
  useEffect(()=>{try{globalThis.localStorage?.setItem(pageSizeKey('runs'),String(runPageSize));}catch{/* Page size is a local preference, not a requirement to run. */}},[runPageSize]);
  useEffect(()=>{try{globalThis.localStorage?.setItem(pageSizeKey('results'),String(resultPageSize));}catch{/* Keep the session usable when storage is unavailable. */}},[resultPageSize]);
  function resizeParameterColumn(next:number){setParameterWidth(Math.min(parameterMaximum,Math.max(parameterMinimum,next)));}
  function splitterKey(event:React.KeyboardEvent){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
    resizeParameterColumn(event.key==='Home'?parameterMinimum:event.key==='End'?parameterMaximum:actualParameterWidth+(event.key==='ArrowRight'?16:-16));
  }
  function finishColumnDrag(event:React.PointerEvent<HTMLElement>){
    if(columnDrag.current?.pointerId!==event.pointerId)return;columnDrag.current=null;
    if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const adoptAnalysisReport=useCallback((id:string,report:ComfyAnalysis,previousReport:ComfyAnalysis|null,afterRunId?:string)=>{
    if(report.unverifiedConversion&&(!previousReport||conversionKey(previousReport.conversion)!==conversionKey(report.conversion)))setAcceptedConversion(false);
    const next:AnalysisState={status:'ready',workflowId:id,report,afterRunId};
    analysisStateRef.current=next;setAnalysisState(next);setRefreshAnalysisStale(false);
  },[]);
  const analyze=useCallback(async (id:string,nextValues:Record<string,ComfySlotValue>,refresh=false,mode:'foreground'|'background'='foreground')=>{
    if(!api||!id||snapshotRef.current?.phase!=='ready')return;
    const ticket=++analysisTicket.current,lifecycle=lifecycleKey(snapshotRef.current);
    const previous=analysisStateRef.current,previousReport=previous.status==='ready'&&previous.workflowId===id?previous.report:null;
    // Only an analysis explicitly started after this failure can acknowledge it.
    const precedingRun=latestWorkflowRun(runsRef.current,id);
    const afterRunId=precedingRun?.phase==='failed'&&!precedingRun.history?precedingRun.runId:undefined;
    const current=()=>mounted.current&&snapshotRef.current?.phase==='ready'&&ticket===analysisTicket.current&&selectedRef.current===id&&lifecycleKey(snapshotRef.current)===lifecycle&&(mode!=='background'||valuesRef.current===nextValues);
    if(mode==='foreground'&&current()){const next:AnalysisState={status:'loading',workflowId:id,ticket};analysisStateRef.current=next;setAnalysisState(next);}
    try{
      if(refresh)await unwrap(api.refreshInventory());
      if(!current())return;
      const report=await unwrap(api.analyzeWorkflow(id,nextValues));
      if(!current())return;
      adoptAnalysisReport(id,report,previousReport,afterRunId);
      return report;
    }catch(error){
      if(!current())return;
      // Background refresh never unmounts a form or replaces its edited values.
      // An updated inventory with failed analysis is fail-closed for Generate.
      if(mode==='background')setRefreshAnalysisStale(true);
      else{const next:AnalysisState={status:'error',workflowId:id,ticket,message:formatError(error),retryable:true};analysisStateRef.current=next;setAnalysisState(next);}
      throw error;
    }
  },[api,adoptAnalysisReport]);

  const persistWorkspace=useCallback((selectedId:string)=>{
    const available=workflowsRef.current;
    const drafts=[...workspaceDrafts.current.values()].filter(draft=>available.some(item=>item.id===draft.workflowId&&item.sourceSha256===draft.sourceSha256));
    try{saveComfyWorkspaceDrafts({selectedId,drafts});setWorkspaceWarning(null);}
    catch{setWorkspaceWarning('编辑草稿未能保存到本机；关闭软件前请重试，或显式保存工作流。');}
  },[]);
  const rememberDraft=useCallback((item:ComfyWorkflowSummary,nextValues:Record<string,ComfySlotValue>,mode:'fixed'|'random')=>{
    workspaceDrafts.current.set(item.id,{workflowId:item.id,sourceSha256:item.sourceSha256,values:{...nextValues},seedMode:mode});
  },[]);
  const chooseWorkflow=useCallback((item:ComfyWorkflowSummary,nextValues?:Record<string,ComfySlotValue>,restoring=false,shouldAnalyze=true)=>{
    const previousId=selectedRef.current,previous=workflowsRef.current.find(candidate=>candidate.id===previousId);
    if(previous)rememberDraft(previous,valuesRef.current,seedModeRef.current);
    const draft=workspaceDrafts.current.get(item.id),matched=draft?.sourceSha256===item.sourceSha256?draft:null;
    const chosenValues=nextValues??(previousId===item.id?valuesRef.current:matched?.values)??item.savedValues;
    const mode=previousId===item.id?seedModeRef.current:matched?.seedMode??'random';
    workspaceFingerprint.current=JSON.stringify([item.id,chosenValues,mode]);
    rememberDraft(item,chosenValues,mode);
    analysisTicket.current++;selectedRef.current=item.id;valuesRef.current={...chosenValues};seedModeRef.current=mode;
    setSelected(item.id);setSeedMode(mode);setRunPage(1);setResultPage(1);setRename(item.name);setDeleteConfirm(false);
    analysisStateRef.current={status:'idle'};setAnalysisState({status:'idle'});setRefreshAnalysisStale(false);setValues({...chosenValues});setCanvasResultId(null);setAcceptedFingerprint(null);setAcceptedConversion(false);setNotice(null);
    if(!restoring){workspaceBootstrapped.current=true;workspaceWasEdited.current=true;persistWorkspace(item.id);}
    if(ready&&shouldAnalyze)void act('analyze',()=>analyze(item.id,chosenValues));
  },[ready,act,analyze,persistWorkspace,rememberDraft]);
  useEffect(()=>{
    if(workspaceBootstrapped.current||!workflowListLoaded)return;
    workspaceBootstrapped.current=true;
    if(selectedRef.current)return;
    const item=workflows.find(candidate=>candidate.id===workspaceInitial.selectedId);
    if(!item){if(workspaceInitial.selectedId)setWorkspaceWarning('上次选择的工作流已不在库中，请重新选择。');return;}
    const draft=workspaceDrafts.current.get(item.id);
    if(draft&&draft.sourceSha256!==item.sourceSha256){setWorkspaceWarning('工作流来源已变化，未套用旧草稿；已恢复库内参数。');workspaceDrafts.current.delete(item.id);}
    chooseWorkflow(item,undefined,true);
  },[workflowListLoaded,workflows,workspaceInitial,chooseWorkflow]);
  useEffect(()=>{
    if(!workspaceBootstrapped.current||!selected)return;
    const item=workflows.find(candidate=>candidate.id===selected);if(!item)return;
    const fingerprint=JSON.stringify([selected,values,seedMode]);if(fingerprint===workspaceFingerprint.current)return;
    workspaceFingerprint.current=fingerprint;workspaceWasEdited.current=true;rememberDraft(item,values,seedMode);persistWorkspace(selected);
  },[selected,values,seedMode,workflows,rememberDraft,persistWorkspace]);
  useEffect(()=>{
    const flush=()=>{if(!workspaceBootstrapped.current||!workspaceWasEdited.current)return;const item=workflowsRef.current.find(candidate=>candidate.id===selectedRef.current);if(item){rememberDraft(item,valuesRef.current,seedModeRef.current);persistWorkspace(item.id);}};
    window.addEventListener?.('beforeunload',flush);return()=>{window.removeEventListener?.('beforeunload',flush);};
  },[rememberDraft,persistWorkspace]);

  useEffect(()=>{
    // Selection owns its one analysis. Only an offline -> ready transition may
    // start another automatically; error and pending changes never retry.
    if(!ready){analysisTicket.current++;setAnalysisState({status:'idle'});return;}
    if(selected&&analysisState.status==='idle')void act('analyze',()=>analyze(selected,values));
  },[ready]);

  async function saveConfig(){
    if(!api)return;
    const numericPort=Number(port),numericTimeout=Number(timeout);
    if(!Number.isInteger(numericPort)||numericPort<1||numericPort>65535||!Number.isInteger(numericTimeout)||numericTimeout<COMFY_LIMITS.readyTimeoutSecMin||numericTimeout>COMFY_LIMITS.readyTimeoutSecMax)throw new Error(ft('端口需要是 1–65535 的整数，超时需要是正整数。'));
    const next=await unwrap(api.setLaunchOptions({port:numericPort,portMode,readyTimeoutSec:numericTimeout,disableApiNodes,safeMode,extraArgs:extraArgs.split(/\r?\n/).map(arg=>arg.trim()).filter(Boolean)}));
    const connected=await unwrap(api.setConnection({host,port:numericPort}));
    adoptConfig({...next,connection:connected.connection});
  }

  async function openWeb(){
    if(!ready||snapshot?.health!=='ok'||!api?.openWeb||webOpening.current)return;
    webOpening.current=true;
    try{await act('open-web',()=>unwrap(api.openWeb!()));}finally{webOpening.current=false;}
  }

  async function startLocal(){
    if(!api||startFlight.current||activityRef.current.busy||activityRef.current.active||ready||serviceBusy||setupBusy||currentRun||['ready','starting','probing','stopping'].includes(snapshotRef.current?.phase??''))return;
    if(!hasPython){openAdvanced('python');return;}
    const generation=++startGeneration.current,current=()=>mounted.current&&generation===startGeneration.current;
    startFlight.current=true;startInvoked.current=false;
    try{
      await saveConfig();if(!current())return;
      startInvoked.current=true;const started=await unwrap(api.start());if(!current())return;
      adoptSnapshot(started);const latest=await readState(current);if(current()&&latest)adoptConfig(latest.config);
    }catch(error){if(current())throw error;}
    finally{startFlight.current=false;startInvoked.current=false;}
  }

  async function chooseMainDirectory(){
    if(!api||directoryFlight.current||activityRef.current.busy||activityRef.current.active||busy||configLocked||setupBusy||currentRun||['ready','starting','probing','stopping'].includes(snapshotRef.current?.phase??''))return;
    directoryFlight.current=true;try{await act('install',()=>choosePath('install'));}finally{directoryFlight.current=false;}
  }
  async function stopEnvironment(){
    const latest=snapshotRef.current,activity=environmentActivityRef.current;
    const active=activityRef.current.active||Boolean(latest?.activeRun&&!latest.activeRun.history&&ACTIVE_RUN_PHASES.has(latest.activeRun.phase));
    const cancellingStart=startFlight.current&&startInvoked.current&&latest?.owner==='app'&&['starting','probing'].includes(latest.phase)
      &&activity.pending.length===1&&activity.pending[0]==='start'&&!activity.setupBusy&&!active;
    if(!api||stopFlight.current||active||activity.setupBusy||activity.pending.includes('stop')||latest?.phase==='stopping')return;
    if((activityRef.current.busy||activity.pending.length>0||['starting','probing'].includes(latest?.phase??''))&&!cancellingStart)return;
    // Invalidate an accepted start reply before requesting its explicit stop.
    // The saveConfig stage is never cancellable here: startInvoked is still false.
    startGeneration.current++;
    stopFlight.current=true;try{await act('stop',async()=>adoptSnapshot(await unwrap(snapshotRef.current?.owner==='external'?api.disconnect():api.stop({interruptRunning:false}))));}finally{stopFlight.current=false;}
  }
  const environmentGuide=deriveComfyEnvironmentGuide({config,snapshot,platform,busy,setupBusy,hasActiveJob:Boolean(currentRun)});
  function environmentPrimary(){
    const action=environmentGuide.primaryAction;if(action.disabled)return;
    if(action.kind==='choose'){void chooseMainDirectory();return;}
    if(action.kind==='start'){void act('start',startLocal);return;}
    if(action.kind==='connect'){openConnection();return;}
    if(action.kind==='create'||action.kind==='view-task'){setDrawer(null);selectView(action.kind==='create'?'create':'tasks');return;}
    if(action.kind==='open'){void openWeb();return;}
    if(action.kind==='refresh'){void refreshWorkbench();return;}
    if(action.kind==='resolve'){if(snapshot?.failure?.code==='unreachable'||snapshot?.failure?.code==='not-comfyui')openConnection();else{setTroubleshootingOpen(true);openAdvanced(action.focus??'summary');}}
  }

  async function choosePath(kind:'install'|'python'|'output'){
    if(!api)return;
    if(kind==='python'&&!config?.install){setNotice({kind:'error',text:PYTHON_SETUP_HINT});return;}
    const next=await unwrap(kind==='install'?api.chooseInstallDirectory():kind==='python'?api.choosePython():api.chooseOutputDirectory());
    if(next){adoptConfig(next);if(kind!=='output')setSetupRevision(value=>value+1);}
  }

  async function importOne(fromFile:boolean){
    if(!api)return;
    const item=await unwrap(fromFile?api.importWorkflowFile():api.importWorkflowJson(paste,importName.trim()||undefined));
    if(!item)return;
    setWorkflows(await unwrap(api.listWorkflows()));setFamily('');chooseWorkflow(item);
    if(!fromFile){setPaste('');setImportName('');}
  }

  function editedValues(source:Record<string,ComfySlotValue>,slots:ComfySlot[],mode:'fixed'|'random'){
    const next={...source};if(mode==='random')for(const slot of slots)if(slot.kind==='seed')delete next[slot.id];return next;
  }

  async function runWorkflow(id=selected,source=values,mode=seedMode,trust=acceptedFingerprint,conversion=acceptedConversion){
    if(!api||!id||currentRun||reanalysisRequired||uncertaintyPending||refreshFlight.current||refreshAnalysisStale)return;
    const conversionBaseline=analysisStateRef.current.status==='ready'&&analysisStateRef.current.workflowId===id?analysisStateRef.current.report:null;
    const sourceSlots=id===selected?analysis?.slots??[]:[];
    const initial=await analyze(id,editedValues(source,sourceSlots,mode));if(!initial)return;
    const slotValues=editedValues(source,initial.slots,mode);
    const report=mode==='random'&&initial.slots.some(slot=>slot.kind==='seed'&&slot.id in source)?await analyze(id,slotValues):initial;if(!report)return;
    const invalidCombo=report.slots.find(slot=>slot.valueType==='combo'&&slot.options&&Object.prototype.hasOwnProperty.call(slotValues,slot.id)&&!slot.options.includes(slotValues[slot.id]));
    if(invalidCombo)throw new Error(ft('已保存的参数类型或值不匹配：{value}',{value:`${invalidCombo.nodeId}.${invalidCombo.input}`}));
    if(report.unverifiedConversion&&(!conversionBaseline||conversionKey(conversionBaseline.conversion)!==conversionKey(report.conversion)))conversion=false;
    if(!report.ok||report.issues.some(issue=>issue.severity==='block')||report.cloudNodes.length||report.thirdPartyFingerprint&&report.thirdPartyFingerprint!==trust||report.unverifiedConversion&&!conversion)throw new Error(ft('请先修复阻断项并完成风险确认。'));
    const request:ComfyRunRequest={workflowId:id,analysisRevision:report.revision,slotValues,seedMode:mode,confirmations:{thirdPartyFingerprint:trust,unverifiedConversion:conversion}};
    adoptRun(await unwrap(api.run(request)));
  }

  async function reuse(item:ComfyResultItem,rerun:boolean){
    if(!api||reuseFlight.current||activityRef.current.active)return;
    const origin=JSON.stringify([selectedRef.current,valuesRef.current,seedModeRef.current]);reuseFlight.current=true;
    try{
      const restored=await unwrap(api.reuseResult(item.id));
      if(!mounted.current||origin!==JSON.stringify([selectedRef.current,valuesRef.current,seedModeRef.current]))return;
      const itemWorkflow=workflowsRef.current.find(candidate=>candidate.id===restored.workflowId);
      if(!itemWorkflow)throw new Error(ft('原工作流不可用'));
      setFamily('');chooseWorkflow(itemWorkflow,restored.slotValues,false,false);seedModeRef.current='fixed';setSeedMode('fixed');
      const report=ready?await analyze(itemWorkflow.id,restored.slotValues):null;
      if(selectedRef.current!==itemWorkflow.id)return;setView('create');setCompactTab('parameters');
      if(!ready)setNotice({kind:'success',text:ft('已回填参数，连接后将重新校验；不会自动生成。')});
      else if(rerun&&report)setNotice({kind:'success',text:ft('已回填相同参数；检查后点击生成，不会自动提交。')});
    }finally{reuseFlight.current=false;}
  }
  async function saveWorkflow(asCopy:boolean){
    if(!api||saveFlight.current||activityRef.current.busy||activityRef.current.active)return;
    const item=workflowsRef.current.find(candidate=>candidate.id===selectedRef.current);if(!item)return;
    const name=saveAsName.trim();if(asCopy&&!name){setNotice({kind:'error',text:ft('请填写另存工作流的名称。')});return;}
    if(!asCopy&&builtinWorkflow(item)){setNotice({kind:'error',text:ft('内置工作流不可覆盖，请另存为副本。')});return;}
    const save=asCopy?api.saveWorkflowAs:api.saveWorkflowValues;
    if(!save){setNotice({kind:'error',text:ft('当前桌面桥不支持保存工作流，请使用新候选版。')});return;}
    const captured={...valuesRef.current},mode=seedModeRef.current,identity=JSON.stringify([item.id,captured,mode]);saveFlight.current=true;
    try{await act('save-workflow',async()=>{
      const saved=await unwrap(asCopy?api.saveWorkflowAs!(item.id,name,captured):api.saveWorkflowValues!(item.id,captured));if(!mounted.current)return;
      const adoptSaved=(previous:ComfyWorkflowSummary[])=>{const current=previous.find(candidate=>candidate.id===saved.id);if(current&&current.updatedAt>saved.updatedAt)return previous;return current?previous.map(candidate=>candidate.id===saved.id?saved:candidate):[saved,...previous];};
      collectionEvents.current.workflows++;workflowsRef.current=adoptSaved(workflowsRef.current);setWorkflows(adoptSaved);workspaceWasEdited.current=true;
      if(asCopy){
        workspaceDrafts.current.set(saved.id,{workflowId:saved.id,sourceSha256:saved.sourceSha256,values:captured,seedMode:mode});
        if(identity===JSON.stringify([selectedRef.current,valuesRef.current,seedModeRef.current])){chooseWorkflow(saved,captured,false,false);setSaveAsOpen(false);}else persistWorkspace(selectedRef.current);
      }else{if(selectedRef.current===saved.id)rememberDraft(saved,valuesRef.current,seedModeRef.current);else{const prior=workspaceDrafts.current.get(saved.id);if(!prior||prior.sourceSha256!==saved.sourceSha256)rememberDraft(saved,captured,mode);}persistWorkspace(selectedRef.current);}
      if(selectedRef.current===item.id||selectedRef.current===saved.id)setNotice({kind:'success',text:ft(asCopy?'工作流副本已保存到软件库；源文件未修改。':'工作流已保存到软件库；源文件未修改。')});
    });}finally{saveFlight.current=false;}
  }

  async function deleteSelectedWorkflow(){
    if(!api||deleteFlight.current||activityRef.current.busy||activityRef.current.active)return;
    const id=selectedRef.current;if(!id)return;deleteFlight.current=true;
    try{await act('delete',async()=>{
      await unwrap(api.deleteWorkflow(id));if(!mounted.current)return;
      const sequence=collectionEvents.current.workflows,latest=await unwrap(api.listWorkflows());if(!mounted.current)return;
      const next=(sequence===collectionEvents.current.workflows?latest:workflowsRef.current).filter(item=>item.id!==id);
      collectionEvents.current.workflows++;workflowsRef.current=next;setWorkflows(next);workspaceDrafts.current.delete(id);workspaceWasEdited.current=true;
      if(selectedRef.current===id){analysisTicket.current++;selectedRef.current='';valuesRef.current={};workspaceFingerprint.current='';analysisStateRef.current={status:'idle'};setSelected('');setAnalysisState({status:'idle'});setValues({});setDeleteConfirm(false);}
      persistWorkspace(selectedRef.current);
    });}finally{deleteFlight.current=false;}
  }

  function refreshWorkbench():Promise<void>{
    if(refreshFlight.current)return refreshFlight.current;
    if(!api||!mounted.current)return Promise.resolve();
    const generation=++refreshGeneration.current,startedAt=Date.now();
    const sections:RefreshSections={state:{status:'pending'},inventory:{status:'pending'},analysis:{status:'pending'}};
    const current=()=>mounted.current&&refreshGeneration.current===generation;
    const update=(key:keyof RefreshSections,section:RefreshSection)=>{sections[key]={...section,at:Date.now()};if(current())setRefreshState({status:'running',generation,startedAt,sections:{...sections}});};
    setRefreshStatusVisible(true);setRefreshState({status:'running',generation,startedAt,sections:{...sections}});
    // Schedule after assigning the flight latch, so concurrent entry points and
    // captured handlers share one promise, even before the next React render.
    const flight=Promise.resolve().then(async()=>{
      try{
        try{
          const latest=await readState();if(!current()||!latest)return;
          update('state',{status:'ok',detail:latest.newerPushKept?'已保留较新的推送':undefined});
        }catch(error){
          if(!current())return;
          update('state',{status:'failed',detail:formatError(error)});
          update('inventory',{status:'skipped'});update('analysis',{status:'skipped'});return;
        }
        if(!current())return;
        const lifecycle=lifecycleKey(snapshotRef.current);
        if(snapshotRef.current?.phase!=='ready'){
          update('inventory',{status:'skipped',detail:'服务未连接，未读取模型清单；刷新不会连接或启动。'});update('analysis',{status:'skipped'});return;
        }
        try{
          await unwrap(api.refreshInventory());if(!current())return;
          if(lifecycleKey(snapshotRef.current)!==lifecycle){update('inventory',{status:'superseded',detail:'工作流或服务已变更，已忽略迟到的刷新结果。'});update('analysis',{status:'skipped'});return;}
          update('inventory',{status:'ok'});
        }catch(error){
          if(!current())return;
          update('inventory',{status:lifecycleKey(snapshotRef.current)!==lifecycle?'superseded':'failed',detail:formatError(error)});update('analysis',{status:'skipped'});return;
        }
        const id=selectedRef.current,previous=analysisStateRef.current,nextValues=valuesRef.current;
        if(!id||previous.status!=='ready'||previous.workflowId!==id){update('analysis',{status:'skipped',detail:'分析进行中或需显式重试'});return;}
        try{
          const report=await analyze(id,nextValues,false,'background');if(!current())return;
          if(!report){update('analysis',{status:'superseded',detail:selectedRef.current===id&&valuesRef.current!==nextValues?'参数在刷新期间有改动，模型选项未更新，可点击重新分析':selectedRef.current===id&&lifecycleKey(snapshotRef.current)===lifecycle?'已采用较新的参数分析，已忽略旧刷新结果。':'工作流或服务已变更，已忽略迟到的刷新结果。'});return;}
          update('analysis',{status:'ok'});
        }catch(error){if(current())update('analysis',{status:'failed',detail:formatError(error)});}
      }finally{
        if(current()){
          const outcome=sections.state.status==='failed'?'failed':Object.values(sections).some(section=>section.status==='failed'||section.status==='superseded')?'partial':'ok';
          const finishedAt=Date.now();setRefreshState({status:'settled',generation,startedAt,finishedAt,outcome,sections:{...sections}});
          if(outcome==='ok'&&sections.inventory.status==='ok')setLastFullSuccessAt(finishedAt);
        }
      }
    }).finally(()=>{if(refreshFlight.current===flight)refreshFlight.current=null;});
    refreshFlight.current=flight;return flight;
  }
  const refreshSummary=ft(refreshState.status==='idle'?'尚未刷新工作台':refreshState.status==='running'?'正在刷新工作台':refreshState.outcome==='ok'?'工作台刷新完成':refreshState.outcome==='partial'?'工作台部分刷新':'工作台刷新失败');
  function refreshSections(){return refreshState.status==='idle'?null:<ul>{(['state','inventory','analysis'] as const).map((key,index)=>{const section=refreshState.sections[key];return <li key={key} data-comfy-refresh-section={key} data-status={section.status}>{ft(['服务状态与记录','模型与节点','参数分析'][index])}：{ft(({pending:'正在读取…',ok:'已更新',skipped:'未读取',failed:'读取失败，已保留旧数据',superseded:'已忽略迟到结果'} as const)[section.status])}{section.detail?` · ${ft(section.detail)}`:''}</li>;})}</ul>;}
  function refreshButton(iconOnly=false){return <Button variant="ghost" aria-label={ft('刷新工作台')} title={refreshSummary} aria-busy={refreshing} disabled={!api||setupBusy||refreshing} data-comfy-refresh onClick={()=>void refreshWorkbench()}><Icon name={refreshing?'loader':'refresh'}/>{iconOnly?null:ft('刷新工作台')}</Button>;}

  const phaseLabel=snapshot?.phase==='ready'&&snapshot.owner==='external'?ft('启动完成 · 外部实例'):ft(PHASE_TEXT[snapshot?.phase??'idle']);
  const elapsed=comfyElapsed(snapshot?.startedAt?Date.parse(snapshot.startedAt):undefined,now);
  const previewImages=useMemo(()=>results.map(item=>({src:item.fileUrl,alt:`${ft('输出文件')} ${item.filePath}`})),[results,language]);

  function workflowCard(item:ComfyWorkflowSummary){
    return <button type="button" className="comfy-local-workflow" key={item.id} aria-pressed={selected===item.id} disabled={busy} onClick={()=>{chooseWorkflow(item);setLibraryOpen(false);setView('create');setCompactTab('parameters');}}><strong>{item.name}</strong><small><span title={ft('家族仅用于筛选和提示，不代表已验证兼容。')}>{workflowFamily(item)??item.sourceFormat.toUpperCase()}</span> · {item.lastAnalysis?ft('阻断项 {count}',{count:item.lastAnalysis.blocking}):ft('尚未分析')}</small><span className="comfy-local-badge">{builtinWorkflow(item)?ft('基础配方'):ft('我的导入')}</span></button>;
  }
  function closeDrawer(){if(drawer==='environment'&&setupBusy)return;setDrawer(null);}
  async function copyPath(value:string){
    if(!navigator.clipboard?.writeText)throw new Error(ft('剪贴板不可用，请手动选择并复制路径。'));
    await navigator.clipboard.writeText(value);setNotice({kind:'success',text:ft('路径已复制')});
  }
  function pathValue(value:string|undefined|null){return <div className="comfy-local-path-value"><code>{value||ft('尚未配置')}</code>{value?<Button variant="ghost" aria-label={`${ft('复制路径')}: ${value}`} onClick={()=>void act('copy-path',()=>copyPath(value))}>{ft('复制路径')}</Button>:null}</div>;}
  function failureSummary(){
    if(snapshot?.failure?.diagnosis?.kind==='dependency-mismatch')return ft('当前 Python 的依赖与此 ComfyUI 不兼容，请选择其他已有 Python。');
    return ft(FAILURE_TEXT[snapshot?.failure?.code??'']??'启动失败');
  }
  function pagination(kind:'runs'|'results',total:number){
    const isRun=kind==='runs',page=isRun?actualRunPage:actualResultPage,pages=isRun?runPages:resultPages,size=isRun?runPageSize:resultPageSize;
    const setPage=isRun?setRunPage:setResultPage;
    const selectSize=(raw:string)=>{const value=Number(raw);if(!(COMFY_PAGE_SIZES as readonly number[]).includes(value))return;(isRun?setRunPageSize:setResultPageSize)(value);setPage(1);};
    if(!total)return null;
    return <nav className="comfy-local-pagination" data-comfy-pagination={kind} aria-label={ft(isRun?'任务分页':'图片分页')}>
      <SelectMenuCompat aria-label={ft(isRun?'任务每页数量':'图片每页数量')} value={String(size)} onChange={event=>selectSize(event.target.value)}>{COMFY_PAGE_SIZES.map(value=><option key={value} value={String(value)}>{ft('每页 {count} 项',{count:value})}</option>)}</SelectMenuCompat>
      {pages>1?<>
      <Button aria-label={ft(isRun?'任务上一页':'图片上一页')} disabled={page<=1} onClick={()=>setPage(Math.max(1,page-1))}>{ft('上一页')}</Button>
      <input className="comfy-local-page-number" aria-label={ft(isRun?'任务页码':'图片页码')} type="number" min={1} max={pages} step={1} value={page} onChange={event=>{const value=Number(event.target.value);if(Number.isInteger(value)&&value>=1)setPage(Math.min(pages,value));}}/>
      <Button aria-label={ft(isRun?'任务下一页':'图片下一页')} disabled={page>=pages} onClick={()=>setPage(Math.min(pages,page+1))}>{ft('下一页')}</Button>
      </>:null}
      <span role="status">{ft('第 {page} / {pages} 页，共 {count} 项',{page,pages,count:total})}</span>
    </nav>;
  }
  async function copyResultPath(item:ComfyResultItem){
    try{
      if(!navigator.clipboard?.writeText)throw new Error(ft('剪贴板不可用，请手动选择并复制路径。'));
      await navigator.clipboard.writeText(item.filePath);if(mounted.current)setCopiedResult({id:item.id,at:Date.now()});
    }catch(error){if(mounted.current)setNotice({kind:'error',text:formatError(error)});}
  }
  function resultLocation(item:ComfyResultItem){return <div className="comfy-local-file-location"><Button variant="ghost" className="comfy-local-file-path" title={item.filePath} aria-label={ft('在文件夹中显示')} onClick={()=>void act('reveal',()=>unwrap(api!.openResult(item.id)))}><code title={item.filePath}>{item.filePath}</code></Button><div className="comfy-local-file-actions"><Button variant="ghost" onClick={()=>void act('reveal',()=>unwrap(api!.openResult(item.id)))}>{ft('在文件夹中显示')}</Button><Button variant="ghost" aria-label={`${ft('复制路径')}: ${item.filePath}`} onClick={()=>void copyResultPath(item)}><span role="status">{ft(copiedResult?.id===item.id?'路径已复制':'复制路径')}</span></Button></div></div>;}

  function dependencyRelated(){
    const diagnosis=snapshot?.failure?.diagnosis;
    const related=diagnosis?.kind==='dependency-mismatch'?(diagnosis.packages??[]).filter(item=>item.status==='mismatch'||item.status==='missing'):[];
    return related.length?<div className="comfy-local-dependency-related">{related.slice(0,3).map((item,index)=><p key={`${item.name}:${index}`}><strong>{item.name}</strong> · {ft('要求版本')}: <code>{item.required}</code> · {ft('已安装版本')}: <code>{item.installed??ft('未找到')}</code></p>)}</div>:null;
  }
  function dependencyReport(){
    const diagnosis=snapshot?.failure?.diagnosis;
    const checks=diagnosis?.packages??config?.install?.dependencyChecks??[];
    const abnormal=checks.filter(item=>item.status==='mismatch'||item.status==='missing');
    const unknown=checks.filter(item=>item.status==='unknown').length;
    return <>{diagnosis?.python?<div className="comfy-local-path"><span>{ft('失败的 Python')}</span>{pathValue(diagnosis.python)}</div>:null}{checks.length?<details className="comfy-local-dependency-checks"><summary>{ft('依赖检查：异常 {count}，未知 {unknown}，共 {total} 项',{count:abnormal.length,unknown,total:checks.length})}</summary><p className="comfy-local-note">{ft('只读元数据仅供诊断；未知项未完成版本确认，不会据此阻止启动。')}</p>{checks.map((item,index)=><div className="comfy-local-dependency" key={`${item.name}:${index}`} data-missing={item.status==='missing'||item.status==='mismatch'}><strong>{item.name}</strong><span>{ft('要求版本')}: <code>{item.required}</code></span><span>{ft('已安装版本')}: <code>{item.installed??ft(item.status==='unknown'?'无法确认':'未找到')}</code></span><span>{ft(({satisfied:'符合要求',mismatch:'版本不匹配',missing:'缺少依赖',unknown:'无法确认'} as const)[item.status])}</span></div>)}</details>:null}{config?.install?.dependencyProbeMessage?<details className="comfy-local-details"><summary>{ft('依赖检查诊断')}</summary><p className="comfy-local-note">{config.install.dependencyProbeMessage}</p></details>:null}</>;
  }
  function drawerKeys(event:React.KeyboardEvent){
    if(event.defaultPrevented)return;
    if(typeof document!=='undefined'&&document.querySelector('.select-menu-popover[data-disclosure-open="true"]'))return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeDrawer();return;}
    if(event.key!=='Tab')return;const elements=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')).filter(element=>element.tabIndex>=0&&element.getClientRects().length);
    const first=elements[0],last=elements[elements.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
  async function connectExisting(){
    if(!api||connectionCancelling)return;
    if(snapshot?.owner==='app'&&snapshot.pid)throw new Error(ft('请先停止本软件启动的服务，再连接已有实例。'));
    const value=Number(connectionPort);if(!Number.isInteger(value)||value<1||value>65535)throw new Error(ft('请输入 1–65535 之间的端口'));
    const ticket=++connectionTicket.current;
    try{
      const next=await unwrap(api.setConnection({host:'127.0.0.1',port:value}));if(ticket!==connectionTicket.current||!mounted.current)return;adoptConfig(next);
      const connected=await unwrap(api.connect());if(ticket!==connectionTicket.current||!mounted.current)return;adoptSnapshot(connected);
      const latest=await readState();if(ticket!==connectionTicket.current||!mounted.current)return;if(latest)adoptConfig(latest.config);setServiceMenu(false);
    }catch(error){if(ticket===connectionTicket.current&&mounted.current)throw error;}
  }
  async function cancelConnection(){
    if(!api||connectionCancelling)return;
    const ticket=++connectionTicket.current;setConnectionCancelling(true);
    try{
      // Main serializes disconnect behind an in-flight probe. Do not announce a
      // cancellation until it confirms idle; never kill an external process.
      const disconnected=await unwrap(api.disconnect());
      if(ticket!==connectionTicket.current||!mounted.current)return;
      adoptSnapshot(disconnected);
      if(disconnected.phase==='ready'||disconnected.owner==='external')throw new Error(ft('尚未确认连接已取消，请重试断开连接。'));
      setNotice({kind:'success',text:ft('已取消连接；没有结束外部 ComfyUI 进程。')});
    }finally{if(mounted.current)setConnectionCancelling(false);}
  }
  function connectionForm(){return <div className="comfy-studio-connect" ref={connectRef}>
    <strong>{ft('已经在本机运行了 ComfyUI？')}</strong><p>{ft('直接连接，不需要选择目录或 Python')}</p>
    <div className="comfy-studio-connect-row"><Field label={ft('本机地址')}><input aria-label={ft('连接地址')} value="127.0.0.1" readOnly/></Field><Field label={ft('端口')}><input aria-label={ft('连接端口')} type="number" min={1} max={65535} step={1} value={connectionPort} disabled={busy||ready||serviceBusy||connectionCancelling} onChange={event=>setConnectionPort(event.target.value)}/></Field><Button disabled={busy||ready||serviceBusy||connectionCancelling} onClick={()=>void act('connect',connectExisting)}>{ft(pending.includes('connect')?'正在连接…':'连接')}</Button></div>
    {pending.includes('connect')||connectionCancelling?<Button disabled={connectionCancelling||pending.includes('cancel-connect')} onClick={()=>void act('cancel-connect',cancelConnection)}>{ft(connectionCancelling?'正在取消连接…':'取消连接')}</Button>:null}
    {notice?.kind==='error'?<p role="alert" className="comfy-studio-field-error">{notice.text}</p>:null}
  </div>;}
  function openConnection(){setConnectionOpen(true);setDrawer('environment');setServiceMenu(false);globalThis.setTimeout(()=>{if(connectionDetailsRef.current)connectionDetailsRef.current.open=true;connectRef.current?.querySelector<HTMLInputElement>('input[type="number"]')?.focus();},0);}
  function libraryContent(){return <>
    <div className="comfy-studio-library-heading"><h3>{ft('工作流库')}</h3><Button variant="ghost" aria-label={ft(libraryPinned?'取消固定':'固定为侧栏')} disabled={!libraryPinned&&workbenchWidth<1282} title={!libraryPinned&&workbenchWidth<1282?ft('固定侧栏至少需要 1282px 内容宽度（当前 {width}px）',{width:Math.round(workbenchWidth)}):undefined} onClick={()=>{setLibraryPinned(value=>!value);setLibraryOpen(false);}}><Icon name="pin"/>{ft(libraryPinned?'取消固定':'固定为侧栏')}</Button>{!libraryDocked?<Button variant="ghost" aria-label={ft('关闭工作流库')} onClick={()=>setLibraryOpen(false)}><Icon name="close"/></Button>:null}</div>
    {libraryPinned&&!libraryDocked?<small>{ft('窗口变宽后显示为侧栏')}</small>:null}
    <div className="comfy-local-library-body" id="comfy-library-content">
      <input className="comfy-local-inline-input" aria-label={ft('搜索工作流')} placeholder={ft('搜索工作流')} value={search} onChange={event=>setSearch(event.target.value)}/>
      <div className="comfy-studio-family-filter" role="group" aria-label={ft('筛选工作流')}>{[['','全部'],['moss-image','MOSS-Image'],['anima','Anima'],['krea2','Krea2'],['other','其他']].map(([value,label])=><button type="button" key={value} aria-pressed={family===value} onClick={()=>setFamily(value)}>{ft(label)}</button>)}</div>
      <small className="comfy-studio-library-note">{ft('家族仅用于筛选，是否可运行以本机分析为准。')}</small>
      <section className="comfy-local-library-section"><h4>{ft('基础配方')} <span>{starterWorkflows.length}</span></h4><div className="comfy-local-workflows">{starterWorkflows.map(workflowCard)}</div></section>
      <section className="comfy-local-library-section"><h4>{ft('我的导入')} <span>{importedWorkflows.length}</span></h4><div className="comfy-local-workflows">{importedWorkflows.map(workflowCard)}</div></section>
      {recentWorkflows.length?<section className="comfy-local-library-section"><h4>{ft('最近使用')}</h4><div className="comfy-local-workflows">{recentWorkflows.map(item=><div key={item.id}>{workflowCard(item)}</div>)}</div></section>:null}
      {!shownWorkflows.length?<p className="comfy-local-empty">{ft('没有匹配的工作流。')}</p>:null}
      <details className="comfy-local-details"><summary>{ft('粘贴 JSON')}</summary><div className="comfy-local-paste"><Field label={ft('工作流名称')}><input aria-label={ft('工作流名称')} maxLength={COMFY_LIMITS.workflowNameChars} value={importName} onChange={event=>setImportName(event.target.value)}/></Field><textarea aria-label={ft('粘贴 JSON')} value={paste} maxLength={COMFY_LIMITS.workflowJsonChars} spellCheck={false} onChange={event=>setPaste(event.target.value)}/><Button disabled={busy||!paste.trim()} onClick={()=>void act('import',()=>importOne(false))}>{ft('导入粘贴内容')}</Button></div></details>
    </div><div className="comfy-local-library-footer"><Button disabled={busy} onClick={()=>void act('import',()=>importOne(true))}><Icon name="folder"/>{ft('导入 JSON 或图片元数据')}</Button><p className="comfy-local-note">{ft('复杂节点图仅导入运行，不提供节点编辑。')}</p></div>
  </>;}
  function libraryKeys(event:React.KeyboardEvent){if(event.key==='Escape'){event.preventDefault();setLibraryOpen(false);return;}if(event.key!=='Tab')return;const elements=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')).filter(element=>element.getClientRects().length);const first=elements[0],last=elements[elements.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  function renderSlot(slot:ComfySlot,options:{aligned?:boolean;displayLabel?:string;accessibleLabel?:string}={}){
    const overridden=Object.prototype.hasOwnProperty.call(values,slot.id),value=overridden?values[slot.id]:slot.defaultValue;
    const issue=analysis?.issues.find(item=>item.severity==='block'&&item.nodeId===slot.nodeId&&(!item.input||item.input===slot.input));
    const invalid=invalidComboSlots.includes(slot)?ft('已保存的参数类型或值不匹配：{value}',{value:`${typeof value}: ${String(value)}`}):undefined;
    return <SlotInput key={slot.id} slot={slot} value={value} aligned={options.aligned} displayLabel={options.displayLabel??commonLabels.get(slot.id)} accessibleLabel={options.accessibleLabel} showMapping={showMapping} issue={issue?.message??invalid} disabled={busy||Boolean(currentRun)||slot.kind==='seed'&&seedMode==='random'} ft={ft}
      onReset={overridden?()=>void act('analyze',async()=>{const next={...values};delete next[slot.id];setValues(next);await analyze(selected,next);}):undefined}
      onChange={nextValue=>setValues(previous=>{const next={...previous};if(nextValue===null)delete next[slot.id];else next[slot.id]=nextValue;return next;})}/>;
  }
  const promptSlots=analysis?.slots.filter(slot=>['positive','prompt','positive_prompt'].includes(slot.kind))??[];
  const negativeSlots=analysis?.slots.filter(slot=>['negative','negative_prompt'].includes(slot.kind))??[];
  const modelSlots=analysis?.slots.filter(slot=>['model','checkpoint','unet','clip','text_encoder','vae'].includes(slot.kind)&&(!slot.role||['diffusion','checkpoint','text-encoder','vae'].includes(slot.role)))??[];
  const samplingSlots=analysis?.slots.filter(slot=>['width','height','batch','batch_size','steps','cfg','sampler','seed'].includes(slot.kind))??[];
  const dimensionSlots=samplingSlots.filter(slot=>slot.kind==='width'||slot.kind==='height');
  const samplingOrder=['batch','batch_size','steps','sampler','cfg','seed'];
  const otherSamplingSlots=samplingSlots.filter(slot=>slot.kind!=='width'&&slot.kind!=='height').sort((a,b)=>samplingOrder.indexOf(a.kind)-samplingOrder.indexOf(b.kind));
  const commonIds=new Set([...promptSlots,...negativeSlots,...modelSlots,...samplingSlots].map(slot=>slot.id));
  const advancedSlots=analysis?.slots.filter(slot=>!commonIds.has(slot.id))??[];
  const commonLabelCounts=new Map<string,number>();
  for(const slot of [...promptSlots,...negativeSlots,...modelSlots,...samplingSlots]){const label=slotLabel(slot,ft);commonLabelCounts.set(label,(commonLabelCounts.get(label)??0)+1);}
  const commonLabels=new Map([...promptSlots,...negativeSlots,...modelSlots,...samplingSlots].map(slot=>{const label=slotLabel(slot,ft);return [slot.id,(commonLabelCounts.get(label)??0)>1?`${label} · ${comfySlotSource(slot)}`:label];}));
  const dimensionRows=comfyDimensionRows(dimensionSlots),advancedGroups=comfyNodeGroups(advancedSlots);
  function sizeSlotValue(slot:ComfySlot):ComfySlotValue|null{return Object.prototype.hasOwnProperty.call(values,slot.id)?values[slot.id]:slot.defaultValue;}
  function persistSizes(custom:ComfySizePreset[],text:string){
    try{saveComfySizePresets(custom);setSizePresets({custom,warning:false});setSizeFeedback({kind:'success',text});}
    catch{setSizeFeedback({kind:'error',text:ft('常用尺寸保存失败；未更改已保存列表，请检查本机存储后重试。')});}
  }
  function renderDimensionRow(row:ReturnType<typeof comfyDimensionRows>[number]){
    const width=row.width,height=row.height;
    if(!width||!height)return renderSlot((width??height)!,{aligned:true,displayLabel:`${slotLabel((width??height)!,ft)} · ${row.source}`,accessibleLabel:commonSlotAria((width??height)!)});
    const w=sizeSlotValue(width),h=sizeSlotValue(height),wp=comfyDimensionPixels(w),hp=comfyDimensionPixels(h);
    const current=wp!==null&&hp!==null?{width:wp,height:hp}:null;
    const choices=[...COMFY_BUILTIN_SIZES,...sizePresets.custom],currentId=current&&choices.some(item=>comfySizeId(item)===comfySizeId(current))?comfySizeId(current):'';
    const locked=busy||Boolean(currentRun),validCurrent=current&&comfySizePresetValues(current,width,height,w,h);
    const save=()=>{
      if(locked)return;
      if(!current||!validCurrent){setSizeFeedback({kind:'error',text:ft('请先输入此节点允许的有效宽高。')});return;}
      if(choices.some(item=>comfySizeId(item)===comfySizeId(current))){setSizeFeedback({kind:'success',text:ft('此尺寸已在常用列表中。')});return;}
      if(sizePresets.custom.length>=COMFY_CUSTOM_SIZE_LIMIT){setSizeFeedback({kind:'error',text:ft('最多保存 {count} 个自定义尺寸，请先删除不再使用的尺寸。',{count:COMFY_CUSTOM_SIZE_LIMIT})});return;}
      persistSizes([...sizePresets.custom,current],ft('常用尺寸已保存，切换工作流或重启后仍可使用。'));
    };
    return <div className="comfy-studio-dimension-group" data-comfy-size-group={width.nodeId} data-comfy-size-group-key={row.key} key={row.key}>
      <div className="comfy-studio-dimension-grid">
        <div className="comfy-studio-dimensions" data-comfy-dimension-node={width.nodeId}><span>{ft('尺寸')}{dimensionRows.length>1?` · ${row.source}`:''}</span><div>{renderSlot(width)}<span className="comfy-studio-dimension-times" aria-hidden="true">×</span>{renderSlot(height)}</div></div>
        <div className="comfy-studio-size-picker-field"><span>{ft('常用尺寸')}</span><div className="comfy-studio-size-picker-row"><div data-comfy-size-preset><SelectMenuCompat aria-label={`${ft('常用尺寸')} · ${row.source}`} value={currentId} popoverClassName="comfy-studio-slot-options" disabled={locked} onChange={event=>{
          if(locked)return;const chosen=choices.find(item=>comfySizeId(item)===event.target.value);if(!chosen)return;
          const next=comfySizePresetValues(chosen,width,height,w,h);
          if(!next){setSizeFeedback({kind:'error',text:ft('该常用尺寸不符合此节点的范围或类型，未应用。')});return;}
          setValues(previous=>({...previous,[width.id]:next.width,[height.id]:next.height}));
          setSizeFeedback({kind:'success',text:ft('已应用常用尺寸：{size}（仅当前节点）',{size:`${chosen.width}×${chosen.height}`})});
        }}><option value="">{ft('自定义尺寸')}</option>{choices.map(item=>{const allowed=comfySizePresetValues(item,width,height,w,h);return <option key={comfySizeId(item)} value={comfySizeId(item)} disabled={!allowed}>{item.width}×{item.height}{allowed?'':` · ${ft('不适用于此节点')}`}</option>;})}</SelectMenuCompat></div><Button variant="ghost" data-comfy-size-save aria-label={`${ft('保存当前尺寸')} · ${row.source}`} title={ft('保存当前尺寸')} disabled={locked||!validCurrent} onClick={save}>{ft('保存')}</Button></div></div>
        {sizePresets.custom.length?<details className="comfy-studio-size-manager"><summary>{ft('管理自定义尺寸')} ({sizePresets.custom.length}/{COMFY_CUSTOM_SIZE_LIMIT})</summary><ul>{sizePresets.custom.map(item=><li key={comfySizeId(item)}><span>{item.width}×{item.height}</span><Button variant="ghost" data-comfy-size-delete={comfySizeId(item)} aria-label={`${ft('删除常用尺寸')} ${item.width}×${item.height} · ${row.source}`} disabled={locked} onClick={()=>{if(!locked)persistSizes(sizePresets.custom.filter(value=>comfySizeId(value)!==comfySizeId(item)),ft('已删除常用尺寸；当前工作流宽高保持不变。'));}}>{ft('删除')}</Button></li>)}</ul></details>:null}
      </div>
    </div>;
  }
  function advancedLabel(slot:ComfySlot){return comfyDisplayAdvancedLabel(slot,ft,language);}
  function commonSlotAria(slot:ComfySlot){const label=commonLabels.get(slot.id)??slotLabel(slot,ft);return showMapping?`${label} · ${slot.nodeId}.${slot.input}`:label;}
  function legacySlotAria(slot:ComfySlot){const label=slotLabel(slot,ft);return showMapping?`${label} · ${slot.nodeId}.${slot.input}`:label;}
  const reason=refreshing?ft('正在刷新工作台'):refreshAnalysisStale?ft('模型清单已更新但参数分析失败，请重新分析'):!config?.install&&!ready?ft('还没有可用的 ComfyUI 环境'):!ready?(serviceBusy?ft('正在准备 ComfyUI 服务…'):snapshot?.phase==='failed'?failureSummary():ft('请先启动或连接 ComfyUI')):!selected?ft('先选择一份工作流'):analysisLoading?ft('正在读取本机参数…'):analysisError?ft('工作流分析失败：{message}',{message:analysisError.message}):analysis?.cloudNodes.length?ft('此工作流含云端 API 节点，本地模式禁止运行。'):!analysis?ft('尚未分析'):analysis.ok===false&&!blocking.length?ft('分析未通过，请查看报告'):blocking[0]?.message??(invalidComboSlots.length?ft('已保存的参数类型或值不匹配：{value}',{value:invalidComboSlots[0].label}):confirmationMissing?ft('请先确认第三方节点或转换风险'):cancelling?ft('正在取消，并整理已完成的结果…'):currentRun?ft(RUN_TEXT[currentRun.phase]??currentRun.phase):busy?ft('正在处理…'):uncertainRun?ft('可能已经提交；请先核对 ComfyUI 队列或历史。'):failedRun?reanalysisRequired?ft('生成失败；请重新分析后再生成。'):ft('上次生成失败；检查错误后可手动重试。'):cancelledText?ft(cancelledText):ft('可以生成 · 参数已对应本机加载节点'));
  function fixReason(){
    if(!ready){setDrawer('environment');return;}
    if(!selected){setLibraryOpen(true);return;}
    if(!analysis||reanalysisRequired||refreshAnalysisStale){void act('analyze',()=>analyze(selected,values,true));return;}
    const first=blocking[0],slot=first?analysis.slots.find(item=>item.nodeId===first.nodeId&&(!first.input||item.input===first.input)):invalidComboSlots[0];
    const target=slot&&typeof document!=='undefined'?Array.from(document.querySelectorAll<HTMLElement>('[data-comfy-slot]')).find(element=>element.dataset.comfySlot===slot.id):null;
    if(target){for(let parent=target.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;target.scrollIntoView({block:'center',behavior:'smooth'});target.querySelector<HTMLElement>('input:not(:disabled),textarea:not(:disabled),button:not(:disabled)')?.focus({preventScroll:true});return;}
    setDrawer('analysis');
  }
  const actionLabel=refreshAnalysisStale?ft('重新分析'):!ready?ft('准备环境'):!selected?ft('选择工作流'):reanalysisRequired?ft('重新分析'):blocking.length||invalidComboSlots.length?ft('定位问题'):confirmationMissing?ft('确认风险'):!analysis?ft('重新分析'):ft('查看报告');
  function selectView(next:'create'|'works'|'tasks'){if(setupBusy)return;setView(next);setLibraryOpen(false);setMoreMenu(false);setServiceMenu(false);}
  function resetLayout(){if(setupBusy)return;setLibraryPinned(false);setParameterWidth(null);setLibraryOpen(false);setDrawer(null);setMoreMenu(false);setServiceMenu(false);setShowMapping(false);setCompactTab('parameters');}
  function cancelRun(){if(!api||!currentRun)return;void act(`cancel:${currentRun.runId}`,async()=>adoptRun(await unwrap(api.cancel(currentRun.runId))));}
  function selectedImage(item:ComfyResultItem){
    const target=workflows.find(workflow=>workflow.id===item.workflowId);
    if(!target){setNotice({kind:'error',text:ft('原工作流不可用')});return;}
    if(selectedRef.current!==target.id)chooseWorkflow(target);
    setCanvasResultId(item.id);setCompactTab('image');setView('create');
  }
  function runSummary(run:ComfyRunSnapshot){
    const facts=comfyTaskFacts(run,results,now),image=facts.firstImage,item=workflows.find(candidate=>candidate.id===run.workflowId);
    const reuseReason=!image?ft('无法复用：未找到该任务的已保存图片参数。'):!facts.recordedValues||!Object.keys(facts.recordedValues).length?ft('无法复用：该图片没有记录参数。'):!item?ft('无法复用：原工作流已不在库中。'):currentRun?ft('任务正在进行，请结束后再复用参数。'):busy?ft('正在处理其他操作，请稍后复用参数。'):null;
    return <ComfyTaskCard key={run.runId} run={run} results={results} workflowName={item?.name??null} ft={ft} language={language} now={now} expanded={expandedRunId===run.runId} onToggle={()=>setExpandedRunId(previous=>previous===run.runId?null:run.runId)} reuseReason={reuseReason} cancelling={Boolean(cancelling||pending.includes(`cancel:${run.runId}`))} onCancel={currentRun?.runId===run.runId?cancelRun:undefined} cancelSummary={['cancelled','canceled'].includes(run.phase)?ft(comfyCancelledSummary(savedCount(run),Boolean(run.error&&/sav/i.test(run.error.code)))):null} onViewImage={image=>{const index=results.findIndex(candidate=>candidate.id===image.id);if(index>=0)setPreviewIndex(index);}} onReuse={image=>{if(!reuseFlight.current&&!activityRef.current.busy&&!activityRef.current.active&&!reuseReason)void act('reuse',()=>reuse(image,false));}} onReveal={image=>void act('reveal',()=>unwrap(api!.openResult(image.id)))} onLogs={()=>setDrawer('logs')}/>;
  }
  function workflowSaveControls(){
    if(!workflow)return null;const builtin=builtinWorkflow(workflow),dirty=JSON.stringify(values)!==JSON.stringify(workflow.savedValues);
    return <section className="comfy-workflow-save" data-comfy-workflow-save>
      <div className="comfy-workflow-save-heading"><small role="status">{ft(builtin?'内置工作流 · 修改请另存':dirty?'参数已修改 · 草稿在本机保留':'草稿在本机保留；保存可写入工作流库。')}</small><div className="comfy-local-actions">{!builtin?<Button variant="ghost" data-comfy-workflow-save-current disabled={busy||Boolean(currentRun)} onClick={()=>void saveWorkflow(false)}>{ft('保存工作流')}</Button>:null}<Button variant="ghost" data-comfy-workflow-save-as disabled={busy||Boolean(currentRun)} aria-expanded={saveAsOpen} onClick={()=>{setSaveAsOpen(previous=>!previous);setSaveAsName('');}}>{ft('另存为')}</Button></div></div>
      {saveAsOpen?<div className="comfy-workflow-save-as"><Field label={ft('副本名称')}><input aria-label={ft('副本名称')} maxLength={COMFY_LIMITS.workflowNameChars} value={saveAsName} disabled={busy} onChange={event=>setSaveAsName(event.target.value)}/></Field><Button data-comfy-workflow-save-confirm disabled={busy||Boolean(currentRun)||!saveAsName.trim()} onClick={()=>void saveWorkflow(true)}>{ft('保存副本')}</Button><Button variant="ghost" disabled={busy} onClick={()=>setSaveAsOpen(false)}>{ft('取消')}</Button></div>:null}
    </section>;
  }

  return <main className="comfy-local comfy-split-shell" data-comfy-local ref={workbenchRef} data-comfy-layout={columnLayout.mode}>
    <header className="comfy-studio-toolbar" data-comfy-region="environment">
      <Button variant="ghost" className="comfy-studio-back" disabled={setupBusy} onClick={()=>{if(!setupBusy)onBack();}}><Icon name="chevronRight"/>{ft('返回')}</Button>
      <Button variant="ghost" className="comfy-studio-workflow-switch" aria-label={ft('选择工作流')} aria-expanded={libraryOpen||libraryDocked} aria-controls="comfy-library-content" title={workflow?.name} onClick={()=>{setLibraryOpen(value=>!value);setServiceMenu(false);setMoreMenu(false);}}><span>{workflow?.name??ft('选择工作流')}</span><Icon name="chevronDown"/>{workflow?<small>{ft(builtinWorkflow(workflow)?'基础配方':'我的导入')}</small>:null}</Button>
      <nav className="comfy-studio-view-tabs" aria-label={ft('工作台视图')}>{([['create','创作'],['works','作品库'],['tasks','任务记录']] as const).map(([key,label])=><button type="button" key={key} disabled={setupBusy} aria-current={view===key?'page':undefined} onClick={()=>selectView(key)}>{ft(label)}</button>)}</nav>
      <div className="comfy-studio-services">{refreshButton(true)}<Button variant="ghost" aria-label={ft('服务菜单')} aria-expanded={serviceMenu} className="comfy-local-status" data-phase={snapshot?.phase??'idle'} onClick={()=>{setServiceMenu(value=>!value);setMoreMenu(false);setLibraryOpen(false);}}><span>{ft(ready?snapshot?.owner==='external'?'已连接 · 外部实例':'本地 ComfyUI 已就绪':pending.includes('connect')?'正在连接…':config?.install?PHASE_TEXT[snapshot?.phase??'idle']:'未配置环境')}</span><Icon name="chevronDown"/></Button><Button variant="ghost" aria-label={ft('更多操作')} aria-expanded={moreMenu} onClick={()=>{setMoreMenu(value=>!value);setServiceMenu(false);setLibraryOpen(false);}}><Icon name="moreHorizontal"/></Button></div>
    </header>
    {serviceMenu?<><button type="button" className="comfy-studio-menu-shade" aria-label={ft('关闭服务菜单')} onClick={()=>setServiceMenu(false)}/><div className="comfy-studio-service-menu" role="region" aria-label={ft('服务操作')}>
      <section className="comfy-workbench-refresh-status" aria-label={ft('工作台刷新状态')}><strong>{refreshSummary}</strong><p>{ft('健康状态由后台定期检查；本次清单读取结果如下。')}</p>{refreshSections()}<small>{lastFullSuccessAt!==null?ft('上次完整刷新：{time}',{time:new Date(lastFullSuccessAt).toLocaleTimeString(language)}):ft('尚未完成完整刷新')}</small>{refreshState.status!=='idle'?<small>{ft('最近尝试：{time}',{time:new Date(refreshState.startedAt).toLocaleTimeString(language)})}</small>:null}</section>
      <strong>{phaseLabel}</strong>{snapshot?.owner==='external'?<p>{ft('这是外部启动的 ComfyUI，断开只断开本软件连接，不会结束它。')}</p>:null}
      {pending.includes('connect')||connectionCancelling?<><p>{ft(connectionCancelling?'正在取消连接，等待本机探测结束…':'正在连接 127.0.0.1:{port}…',{port:connectionPort})}</p><Button disabled={connectionCancelling||pending.includes('cancel-connect')} onClick={()=>void act('cancel-connect',cancelConnection)}>{ft(connectionCancelling?'正在取消连接…':'取消连接')}</Button></>:ready?<><code>{snapshot?.target?.host??'127.0.0.1'}:{snapshot?.target?.port??config?.connection.port}</code><Button disabled={pending.includes('open-web')||snapshot?.health!=='ok'||!api?.openWeb} onClick={()=>void openWeb()}><Icon name="externalLink"/>{ft('打开 ComfyUI 网页')}</Button>{snapshot?.owner==='external'?<Button disabled={pending.includes('stop')} onClick={()=>void act('stop',async()=>{adoptSnapshot(await unwrap(api!.disconnect()));setServiceMenu(false);})}>{ft('断开连接')}</Button>:<Button disabled={pending.includes('stop')||snapshot?.phase==='stopping'} onClick={()=>void act('stop',async()=>{adoptSnapshot(await unwrap(api!.stop({interruptRunning:true})));setServiceMenu(false);})}>{ft('停止本软件启动的服务')}</Button>}</>:<>{snapshot?.failure?<p role="alert">{failureSummary()}</p>:null}{serviceBusy?<><p>{ft('等待 HTTP 就绪 {elapsed}',{elapsed})}</p>{snapshot?.owner==='app'?<Button disabled={pending.includes('stop')||snapshot?.phase==='stopping'} onClick={()=>void act('stop',async()=>adoptSnapshot(await unwrap(api!.stop({interruptRunning:true}))))}>{ft('取消启动')}</Button>:null}</>:<><Button disabled={busy||!hasPython||platform?.launchSupported===false} onClick={()=>void act('start',startLocal)}><Icon name="play"/>{ft('启动本地 ComfyUI')}</Button><Button disabled={busy} onClick={openConnection}>{ft('连接已有实例…')}</Button></>}</>}
      <Button variant="ghost" onClick={()=>{setDrawer('environment');setServiceMenu(false);}}><Icon name="settings"/>{ft('环境设置')}</Button><Button variant="ghost" onClick={()=>{setDrawer('logs');setServiceMenu(false);}}><Icon name="code"/>{ft('查看运行日志')}</Button>
    </div></>:null}
    {moreMenu?<><button type="button" className="comfy-studio-menu-shade" aria-label={ft('关闭更多操作')} onClick={()=>setMoreMenu(false)}/><div className="comfy-studio-more-menu"><Button variant="ghost" disabled={!selected} onClick={()=>{setDrawer('analysis');setMoreMenu(false);}}>{ft('分析报告与工作流管理')}</Button><Button variant="ghost" onClick={()=>{setDrawer('logs');setMoreMenu(false);}}>{ft('运行日志')}</Button><Button variant="ghost" onClick={resetLayout}><Icon name="restore"/>{ft('恢复默认布局')}</Button>{refreshButton()}</div></>:null}
    {refreshStatusVisible&&refreshState.status==='settled'&&refreshState.outcome!=='ok'?<div className="comfy-local-failure-strip" role="status" data-comfy-refresh-outcome={refreshState.outcome}><strong>{refreshSummary}</strong>{refreshSections()}<Button variant="ghost" aria-label={ft('关闭刷新提示')} onClick={()=>setRefreshStatusVisible(false)}><Icon name="close"/></Button></div>:null}
    {workspaceWarning?<p role="alert" className="comfy-local-alert" data-comfy-workspace-warning>{ft(workspaceWarning)}</p>:null}
    {pinNotice?<div role="status" className="comfy-studio-pin-notice">{ft('窗口宽度不足，工作流库已改为浮层；加宽窗口后自动恢复侧栏')}</div>:null}
    {!api?<section className="comfy-local-panel"><p className="comfy-local-empty">{ft('当前环境没有本地 ComfyUI 桌面桥，请使用桌面版。')}</p></section>:<>
    {notice?<div role={notice.kind==='error'?'alert':'status'} className="comfy-local-alert comfy-studio-notice" data-kind={notice.kind}>{notice.text===PYTHON_SETUP_HINT?ft(PYTHON_SETUP_HINT):notice.text}<button type="button" aria-label={ft('关闭提示')} onClick={()=>setNotice(null)}><Icon name="close"/></button></div>:null}
    {preparing&&view==='create'?<section className="comfy-studio-prepare" data-comfy-view="create"><ComfyEnvironmentSetup api={api.setup} renderMode="setup" refreshKey={setupRevision} locked={configLocked||Boolean(currentRun)} onBusyChange={setSetupBusy} onAdopt={next=>{adoptConfig(next);void refreshWorkbench();}} onManual={()=>void act('install',()=>choosePath('install'))}/>{connectionForm()}</section>:view==='create'?<>
    {compact?<div className="comfy-studio-compact-tabs" role="group" aria-label={ft('创作面板')}><Button variant="ghost" aria-pressed={compactTab==='parameters'} onClick={()=>setCompactTab('parameters')}>{ft('参数')}</Button><Button variant="ghost" aria-pressed={compactTab==='image'} onClick={()=>setCompactTab('image')}>{ft('当前图')}</Button></div>:null}
    {terminalRun?<div className="comfy-local-alert" data-kind="error" role="alert" data-comfy-submission-failure={terminalRun.runId} data-comfy-submission-uncertain={Boolean(uncertainRun)}><strong>{ft(uncertainRun?'提交结果未确认':'生成失败')}</strong><p>{terminalRun.error?`[${terminalRun.error.code}] ${terminalRun.error.message}`:ft(uncertainRun?'提交结果未确认':'生成失败，请查看任务记录。')}</p>{uncertainRun?<><p>{ft('可能已经提交；请先核对 ComfyUI 队列或历史。')}</p><label className="comfy-local-check"><input type="checkbox" aria-label={ft('我已核对，仍要再次提交')} checked={Boolean(checkedUncertainRuns[uncertainRun.runId])} disabled={busy||Boolean(currentRun)} onChange={event=>setCheckedUncertainRuns(previous=>({...previous,[uncertainRun.runId]:event.target.checked}))}/>{ft('我已核对，仍要再次提交')}</label></>:null}<div className="comfy-local-actions">{reanalysisRequired?<Button disabled={!ready||busy} onClick={()=>void act('analyze',()=>analyze(selected,values,true))}>{ft('重新分析')}</Button>:null}<Button variant="ghost" onClick={()=>{setRunPage(Math.max(1,Math.floor(runs.findIndex(run=>run.runId===terminalRun.runId)/runPageSize)+1));selectView('tasks');}}>{ft('查看任务记录')}</Button></div></div>:null}
    <div data-comfy-view="create" data-comfy-width-mode={parameterWidth===null?'auto':'manual'} className={`comfy-workbench comfy-studio-create${libraryDocked?' library-docked':''}${compact?' compact-layout':''}`} style={{'--comfy-parameter-width':`${actualParameterWidth}px`} as React.CSSProperties}>
      {libraryDocked?<aside className="comfy-local-library comfy-studio-pinned-library" data-comfy-region="library">{libraryContent()}</aside>:null}
      <section className="comfy-local-parameter-column comfy-studio-parameters" data-comfy-region="parameters" aria-labelledby="comfy-parameters-title" hidden={compact&&compactTab!=='parameters'}>
        <h2 className="comfy-studio-sr-only" id="comfy-parameters-title">{ft('参数与模型')}</h2>
        <div className="comfy-local-parameter-scroll" ref={parameterScrollRef}>{workflowSaveControls()}
          {!workflow?<div className="comfy-studio-parameter-empty"><Icon name="sliders"/><h3>{ft('选择工作流，开始本地创作')}</h3><p>{ft('基础配方或已导入的工作流都在工作流库中。')}</p><Button onClick={()=>setLibraryOpen(true)}>{ft('浏览工作流库')}</Button></div>:!analysis?<div className="comfy-studio-parameter-empty" data-comfy-analysis-state={!ready?'idle':analysisState.status}><h3>{ft(!ready?'先连接本地 ComfyUI':analysisLoading?'正在分析工作流':analysisError?'工作流分析失败':'尚未分析')}</h3><p role={analysisError?'alert':undefined}>{analysisError?.message??ft('连接后读取真实模型清单和可调参数，不会按模型家族自动替换。')}</p>{ready?<Button disabled={busy||Boolean(analysisError&&!analysisError.retryable)} onClick={()=>void act('analyze',()=>analyze(selected,values,true))}>{ft('重新分析')}</Button>:<Button disabled={busy||serviceBusy} onClick={()=>{setDrawer('environment');}}>{ft('准备环境')}</Button>}</div>:<>
            <section className="comfy-studio-parameter-section" id="comfy-section-prompt"><h3>{ft('提示词')}</h3><div className="comfy-studio-prompts">{promptSlots.map(slot=>renderSlot(slot))}</div>{negativeSlots.length?<details className="comfy-studio-negative"><summary>{ft('反向提示词')}<small>{negativeSlots.length===1?String(Object.prototype.hasOwnProperty.call(values,negativeSlots[0].id)?values[negativeSlots[0].id]:negativeSlots[0].defaultValue??'').slice(0,64):ft('{count} 个字段',{count:negativeSlots.length})}</small></summary><div>{negativeSlots.map(slot=>renderSlot(slot))}</div></details>:null}</section>
            {modelSlots.length?<section className="comfy-studio-parameter-section" id="comfy-section-model"><div className="comfy-studio-section-heading"><h3>{ft('模型')}</h3><label className="comfy-studio-mapping-toggle"><input aria-label={ft('显示节点映射')} type="checkbox" checked={showMapping} onChange={event=>setShowMapping(event.target.checked)}/>{ft('显示节点映射')}</label></div><div className="comfy-studio-models">{modelSlots.map(slot=>renderSlot(slot))}</div></section>:null}
            {samplingSlots.length?<section className="comfy-studio-parameter-section" id="comfy-section-sampling"><h3>{ft('尺寸与采样')}</h3>{sizePresets.warning?<p role="status" className="comfy-local-note" data-comfy-size-warning>{ft('部分常用尺寸无法读取，已保留可用项；可重新保存，原存储不会自动覆盖。')}</p>:null}{sizeFeedback?<p role={sizeFeedback.kind==='error'?'alert':'status'} className={sizeFeedback.kind==='error'?'comfy-studio-field-error':'comfy-local-note'} data-comfy-size-feedback>{sizeFeedback.text}</p>:null}<div className="comfy-studio-sampling-grid comfy-studio-field-grid">{dimensionRows.map(renderDimensionRow)}{otherSamplingSlots.map(slot=>slot.kind==='seed'?<div className="comfy-studio-seed" data-comfy-seed-slot={slot.id} key={slot.id}><div><span>{commonLabels.get(slot.id)??ft('种子')}</span><label><input type="checkbox" aria-label={`${ft('每次随机种子')}${(commonLabelCounts.get(ft('种子'))??0)>1?` · ${comfySlotSource(slot)}`:''}`} checked={seedMode==='random'} disabled={busy||Boolean(currentRun)} onChange={event=>setSeedMode(event.target.checked?'random':'fixed')}/>{ft('随机')}</label></div>{seedMode==='random'?<div className="comfy-studio-random-seed" role="status">{ft('每次随机')}</div>:renderSlot(slot)}</div>:renderSlot(slot,{aligned:true}))}</div></section>:null}
            {analysis.issues.some(issue=>issue.code==='generic-slots-limited')?<p className="comfy-local-note" role="status" data-comfy-generic-limited>{ft('部分附加参数未在面板展开；原工作流值保留，可在分析报告查看详情。')}</p>:null}
            {advancedSlots.length?<details className="comfy-studio-advanced-parameters"><summary>{ft('高级参数')} ({advancedSlots.length})</summary>{advancedGroups.map(group=><section className="comfy-studio-node-group" data-comfy-node-group={group.nodeId} aria-labelledby={`comfy-advanced-node-${encodeURIComponent(group.nodeId)}`} key={group.nodeId}><h4 id={`comfy-advanced-node-${encodeURIComponent(group.nodeId)}`}>{`${comfyDisplayNodeTitle(group.slots[0],ft,language)} #${group.nodeId}`}</h4><div className="comfy-studio-sampling-grid comfy-studio-field-grid comfy-studio-advanced-grid">{group.slots.map(slot=>renderSlot(slot,{aligned:true,displayLabel:advancedLabel(slot),accessibleLabel:legacySlotAria(slot)}))}</div></section>)}</details>:null}
            {!analysis.slots.length?<p className="comfy-local-note">{ft('没有识别到可调参数，请检查工作流和分析报告。')}</p>:null}
            <div className="comfy-studio-technical-actions"><Button variant="ghost" disabled={!ready||busy} onClick={()=>void act('analyze',()=>analyze(selected,values,true))}><Icon name="refresh"/>{ft('重新分析')}</Button><Button variant="ghost" onClick={()=>setDrawer('analysis')}>{ft('分析报告与工作流管理')}</Button></div>
          </>}
        </div>
        <footer className="comfy-local-submit comfy-studio-generate-bar"><div className="comfy-studio-generate-reason" role="status" data-ready={canRun&&!terminalRun&&!cancelledText}><span>{canRun&&!terminalRun&&!cancelledText?<Icon name="successCircle"/>:currentRun?<Icon name="loader"/>:<Icon name="info"/>}{reason}</span>{!canRun&&!currentRun&&!busy&&!refreshing?<Button variant="ghost" onClick={fixReason}>{actionLabel}</Button>:null}{blocking.length>1?<Button variant="ghost" onClick={()=>setDrawer('analysis')}>{ft('还有 {count} 个问题 · 查看全部',{count:blocking.length-1})}</Button>:null}</div>{currentRun?<Button disabled={cancelling||pending.includes(`cancel:${currentRun.runId}`)} onClick={cancelRun}>{ft(cancelling?'正在整理结果…':'取消任务')}</Button>:reanalysisRequired?<Button variant="primary" disabled={!ready||busy||refreshing} onClick={()=>void act('analyze',()=>analyze(selected,values,true))}>{ft('重新读取本机参数')}</Button>:<Button variant="primary" disabled={!canRun} onClick={()=>void act('run',()=>runWorkflow())}><Icon name="play"/>{ft('生成')}</Button>}</footer>
      </section>
      {!compact?<div className="comfy-local-column-splitter comfy-studio-splitter" data-comfy-splitter role="separator" aria-orientation="vertical" aria-label={ft('调整参数列宽度')} aria-valuenow={actualParameterWidth} aria-valuemin={parameterMinimum} aria-valuemax={parameterMaximum} aria-disabled={parameterMaximum===parameterMinimum} tabIndex={parameterMaximum===parameterMinimum?-1:0} onKeyDown={splitterKey} onDoubleClick={()=>setParameterWidth(null)} onPointerDown={event=>{if(event.button!==0||parameterMaximum===parameterMinimum)return;event.preventDefault();columnDrag.current={pointerId:event.pointerId,x:event.clientX,width:actualParameterWidth};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event=>{const drag=columnDrag.current;if(drag&&drag.pointerId===event.pointerId)resizeParameterColumn(drag.width+event.clientX-drag.x);}} onPointerUp={finishColumnDrag} onPointerCancel={finishColumnDrag} onLostPointerCapture={()=>{columnDrag.current=null;}}/>:null}
      <section className="comfy-local-canvas comfy-studio-stage" data-comfy-region="canvas" aria-labelledby="comfy-results-title" hidden={compact&&compactTab!=='image'}>
        <div className="comfy-studio-stage-heading"><div><h3 id="comfy-results-title">{ft('当前图')}</h3>{latestRun?<small>{ft(latestRun.history?.status==='unknown'?'历史状态未知':RUN_TEXT[latestRun.phase]??latestRun.phase)}</small>:null}</div><div className="comfy-local-actions">{canvasResult?<><Button variant="ghost" disabled={busy} onClick={()=>void act('reuse',()=>reuse(canvasResult,false))}>{ft('复用参数')}</Button><Button variant="ghost" disabled={busy||Boolean(currentRun)} onClick={()=>void act('rerun',()=>reuse(canvasResult,true))}>{ft('同参数再生成')}</Button><Button variant="ghost" aria-label={ft('全屏预览')} title={ft('全屏预览')} onClick={()=>setPreviewIndex(results.indexOf(canvasResult))}><MdOpenInFull size={18} aria-hidden="true"/></Button><button ref={imageMenuTriggerRef} type="button" className="btn btn-ghost" aria-label={ft('图片操作')} aria-expanded={Boolean(imageMenu)} aria-controls={imageMenu?'comfy-image-actions':undefined} onClick={event=>setImageMenu(previous=>previous?null:{focusFirst:event?.detail===0})}><Icon name="moreHorizontal"/></button>{imageMenu?<ComfyResultActionsMenu anchor={imageMenuTriggerRef} id="comfy-image-actions" label={ft('图片操作')} focusFirst={imageMenu.focusFirst} onClose={()=>setImageMenu(null)}>{resultLocation(canvasResult)}</ComfyResultActionsMenu>:null}</>:null}</div></div>
        <div className="comfy-local-canvas-stage">{livePreview?<img src={livePreview} alt={ft('预览结果')} className="comfy-local-canvas-image"/>:canvasResult?<button className="comfy-local-canvas-open" type="button" aria-label={ft('预览结果')} onClick={()=>setPreviewIndex(results.indexOf(canvasResult))}><img className="comfy-local-canvas-image" src={canvasResult.fileUrl} width={canvasResult.width} height={canvasResult.height} alt={`${canvasResult.width} × ${canvasResult.height}`}/></button>:<div className="comfy-local-canvas-empty"><Icon name="image"/><strong>{ft('生成后图片会显示在这里')}</strong><p>{ft('检查参数后点击生成；结果保存在本机。')}</p></div>}{currentRun?<div className="comfy-local-canvas-progress" role="status"><strong>{ft(cancelling?'正在取消，并整理已完成的结果…':RUN_TEXT[currentRun.phase]??currentRun.phase)}</strong><span>{currentRun.nodesExecuted}/{currentRun.nodesTotal}</span>{currentRun.progress?<progress value={currentRun.progress.value} max={currentRun.progress.max||1}/>:null}</div>:null}</div>
        {canvasResult?<div className="comfy-studio-image-meta"><span>{canvasResult.width} × {canvasResult.height}</span>{Object.entries(canvasResult.slotValues).filter(([key])=>key.startsWith('seed:')).map(([key,value])=><span key={key}>{ft('种子')}: {String(value)}</span>)}{Object.entries(canvasResult.slotValues).filter(([key])=>key.startsWith('steps:')).map(([key,value])=><span key={key}>{String(value)} {ft('步')}</span>)}</div>:null}
        {cancelledText?<p className="comfy-studio-cancelled-note" role="status">{ft(cancelledText)}</p>:null}
        <div className="comfy-studio-filmstrip-heading"><strong>{ft('本次会话')}</strong><Button variant="ghost" onClick={()=>selectView('works')}>{ft('全部作品')}<Icon name="chevronRight"/></Button></div><div className="comfy-local-thumbnails comfy-studio-filmstrip">{sessionResults.length?sessionResults.map(item=><button type="button" className="comfy-local-result-preview" key={item.id} aria-label={`${ft('查看本次会话图片')} ${item.width} × ${item.height}`} aria-pressed={canvasResult?.id===item.id} onClick={()=>setCanvasResultId(item.id)}><img src={item.fileUrl} width={item.width} height={item.height} loading="lazy" alt={`${item.width} × ${item.height}`}/></button>):<p>{ft('本次会话的新结果会保留在这里（最多 12 张预览）')}</p>}</div>
      </section>
    </div></>:view==='works'?<section className="comfy-studio-collection" data-comfy-view="works"><header><div><h2>{ft('作品库')}</h2><p>{ft('磁盘中的已保存图片，与本次会话预览分开。')}</p></div><SelectMenuCompat aria-label={ft('作品工作流筛选')} value={workFilter} onChange={event=>{setWorkFilter(event.target.value);setResultPage(1);}}><option value="">{ft('全部工作流')}</option>{workflows.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</SelectMenuCompat>{refreshButton()}<Button onClick={()=>void act('folder',()=>unwrap(api.openResultsFolder()))}><Icon name="folderOpen"/>{ft('打开结果目录')}</Button></header>
      {!shownResults.length?<div className="comfy-studio-empty-view"><Icon name="collections"/><h3>{ft('还没有已保存的作品')}</h3><p>{ft('完成生成后，图片会出现在这里。旧图片和回执不会因分页被删除。')}</p><Button onClick={()=>selectView('create')}>{ft('返回创作')}</Button></div>:<><div className="comfy-studio-collection-body"><div className="comfy-studio-gallery-grid">{visibleResults.map(item=><button type="button" key={item.id} className="comfy-studio-gallery-image" data-comfy-result-id={item.id} aria-pressed={galleryResult?.id===item.id} onClick={()=>setGalleryResultId(item.id)} onDoubleClick={()=>setPreviewIndex(results.indexOf(item))}><img src={item.fileUrl} width={item.width} height={item.height} loading="lazy" alt={`${item.width} × ${item.height}`}/><span>{item.width} × {item.height}</span></button>)}</div>{galleryResult?<aside className="comfy-studio-work-details"><h3>{ft('作品详情')}</h3><button type="button" className="comfy-local-result-preview" aria-label={ft('全屏预览')} onClick={()=>setPreviewIndex(results.indexOf(galleryResult))}><img src={galleryResult.fileUrl} width={galleryResult.width} height={galleryResult.height} alt={`${galleryResult.width} × ${galleryResult.height}`}/></button><p>{galleryResult.width} × {galleryResult.height} · {(galleryResult.bytes/1048576).toFixed(2)} MiB</p><div className="comfy-studio-work-actions"><Button disabled={busy} onClick={()=>void act('reuse',()=>reuse(galleryResult,false))}>{ft('复用参数')}</Button><Button onClick={()=>selectedImage(galleryResult)}>{ft('在创作台查看')}</Button></div>{resultLocation(galleryResult)}</aside>:null}</div>{pagination('results',shownResults.length)}</>}
    </section>:<section className="comfy-studio-task-view" data-comfy-view="tasks"><header><div><h2>{ft('任务记录')}</h2><p>{ft('最近 {count} 条可恢复摘要；不会删除旧回执或原图。',{count:COMFY_LIMITS.runHistoryEntries})}</p></div>{refreshButton()}<Button onClick={()=>setDrawer('logs')}>{ft('查看运行日志')}</Button></header>{historyIncomplete?<p role="status" className="comfy-local-note">{ft('部分历史未加载，仅显示最近可读记录。')}</p>:null}<div className="comfy-studio-task-scroll">{visibleRuns.length?visibleRuns.map(runSummary):<div className="comfy-studio-empty-view"><Icon name="history"/><h3>{ft('尚无任务记录')}</h3><p>{ft('同时只运行一个任务；历史记录不会自动重发。')}</p><Button onClick={()=>selectView('create')}>{ft('返回创作')}</Button></div>}</div>{pagination('runs',shownRuns.length)}</section>}
    {libraryOpen&&!libraryDocked?<><button type="button" className="comfy-studio-library-shade" aria-label={ft('关闭工作流库')} onClick={()=>setLibraryOpen(false)}/><div className="comfy-local-library comfy-studio-library-popover" data-comfy-region="library" ref={libraryRef} onKeyDown={libraryKeys} role="dialog" aria-label={ft('工作流库')} aria-modal="true">{libraryContent()}</div></>:null}
    {drawer==='environment'?<AppPortal>
    <div className="comfy-local-drawer" data-comfy-drawer="environment" hidden={false} role="dialog" aria-modal="true" aria-label={ft('环境设置')} onKeyDown={drawerKeys}><button type="button" className="comfy-local-drawer-shade" tabIndex={-1} disabled={setupBusy} aria-label={ft('关闭环境设置')} onClick={closeDrawer}/><div className="comfy-local-drawer-panel"><div className="comfy-local-drawer-heading"><h2>{ft('环境设置')}</h2><Button disabled={setupBusy} aria-label={ft('关闭环境设置')} onClick={closeDrawer}><Icon name="close"/></Button></div><div className="comfy-local-drawer-body comfy-env-guide-page" data-comfy-environment-guide>
      <section className="comfy-env-guide-status" data-comfy-env-status={environmentGuide.status} data-tone={environmentGuide.tone} aria-labelledby="comfy-service-title">
        <span className="comfy-env-guide-state"><Icon name={environmentGuide.usable?'successCircle':environmentGuide.tone==='error'?'warning':'info'}/>{ft(phaseLabel)}</span>
        <h3 id="comfy-service-title">{ft(environmentGuide.title)}</h3><p>{ft(environmentGuide.body)}</p>
        <div className="comfy-local-actions"><Button variant="primary" data-comfy-env-primary aria-label={environmentGuide.primaryAction.kind==='choose'?ft('选择 ComfyUI 目录'):undefined} data-action={environmentGuide.primaryAction.kind} disabled={environmentGuide.primaryAction.disabled||Boolean(environmentGuide.primaryAction.kind==='open'&&!api.openWeb)} onClick={environmentPrimary}>{ft(environmentGuide.primaryAction.label)}</Button>{environmentGuide.usable?<Button variant="ghost" disabled={busy||!api.openWeb} onClick={()=>void openWeb()}>{ft('打开 ComfyUI 网页')}</Button>:!serviceBusy&&!setupBusy?<Button variant="ghost" onClick={openConnection}>{ft('连接已有实例…')}</Button>:null}{serviceBusy&&snapshot?.owner==='app'?<Button variant="ghost" disabled={pending.includes('stop')||snapshot.phase==='stopping'||Boolean(currentRun)} onClick={()=>void stopEnvironment()}>{ft('取消启动')}</Button>:null}</div>
        {environmentGuide.primaryAction.reason?<small role="status">{ft(environmentGuide.primaryAction.reason)}</small>:null}
        {snapshot?.phase==='starting'||snapshot?.phase==='probing'?<p className="comfy-local-note">{snapshot.stage==='checking-port'?ft('检测端口'):ft('等待 HTTP 就绪 {elapsed}',{elapsed})}</p>:null}
      </section>
      {notice?<div role={notice.kind==='error'?'alert':'status'} className="comfy-local-alert" data-kind={notice.kind}>{notice.text===PYTHON_SETUP_HINT?ft(PYTHON_SETUP_HINT):notice.text}</div>:null}
      <section className="comfy-env-selected" data-comfy-basic hidden={false} aria-label={ft('使用的 ComfyUI')}>
        <div className="comfy-env-selected-heading"><h3>{ft('使用的 ComfyUI')}</h3>{config?.install?<Button variant="ghost" data-comfy-env-directory aria-label={ft('选择 ComfyUI 目录')} disabled={busy||configLocked||setupBusy||Boolean(currentRun)} onClick={()=>void chooseMainDirectory()}>{ft('更换主目录')}</Button>:null}</div>
        <div className="comfy-local-path" ref={directoryPickerRef}>{config?.install?.root?pathValue(config.install.root):<p className="comfy-local-note">{ft('选择已安装的 ComfyUI 主目录即可，无需分别配置 Python 和端口。')}</p>}</div>
        {config?.install?<dl className="comfy-env-selected-facts"><div><dt>Python</dt><dd>{hasPython?<><strong>{ft(config.install.pythonSelection?.mode==='auto'?'自动识别':'沿用当前选择')}</strong><code>{config.install.python}</code></>:ft('尚未确认，请按上方提示处理')}</dd></div><div><dt>{ft(ready?'实际端口':'端口')}</dt><dd>{ready?`${snapshot?.target?.host??'127.0.0.1'}:${snapshot?.target?.port??config.connection.port}`:ft(config.launch.portMode==='auto'?'启动时自动选择可用端口':'已保存手动端口，可在高级设置中修改')}</dd></div></dl>:null}
        {!hasPython&&config?.install?<div className="comfy-env-python-recovery"><p className="comfy-local-note">{ft('自动检测未确认可用 Python；请在高级设置中手动选择。')}</p><Button disabled={busy||configLocked||setupBusy} onClick={()=>openAdvanced('python')}>{ft('选择 Python 解释器')}</Button></div>:null}
        <p className="comfy-local-note">{ft('只使用已有环境，不安装或升级依赖；启动成功后才确认可用。')}</p>
        {environmentGuide.lockReason?<div className="comfy-env-lock" role="status"><p>{ft(environmentGuide.lockReason)}</p><p>{ft(environmentGuide.next)}</p>{(ready||snapshot?.owner==='app'&&snapshot.pid)?<Button variant="ghost" data-comfy-env-stop disabled={busy||setupBusy||serviceBusy||Boolean(currentRun)} onClick={()=>void stopEnvironment()}>{ft(snapshot?.owner==='external'?'断开连接（不结束外部进程）':'停止服务后更换环境')}</Button>:null}</div>:null}
      </section>
      <ComfyEnvironmentSetup api={api.setup} renderMode="guided" currentConfig={config} platform={platform?.os} refreshKey={setupRevision} locked={configLocked||Boolean(currentRun)} onBusyChange={setSetupBusy} onAdopt={next=>{adoptConfig(next);void refreshWorkbench();}} onManual={()=>void chooseMainDirectory()}/>
      <details ref={connectionDetailsRef} className="comfy-env-connection comfy-local-details" data-comfy-env-connection open={connectionOpen} onToggle={event=>setConnectionOpen(event.currentTarget.open)}><summary>{ft('连接已运行的 ComfyUI')}<small>{ft('只在你已通过其他程序启动时使用')}</small></summary>{connectionForm()}</details>
      <details ref={manualConfigRef} className="comfy-local-details comfy-local-advanced" data-comfy-advanced data-comfy-env-advanced open={manualMode} onToggle={event=>setManualMode(event.currentTarget.open)}><summary>{ft('高级设置')}<small>{ft('正常使用无需修改')}</small></summary><div className="comfy-local-config">
        <p className="comfy-local-note">{ft('自动检测失败时可手动补充；已有配置会保留，关闭高级设置不会清空。')}</p>
        <div className="comfy-local-path"><Button data-comfy-python-picker disabled={busy||configLocked||!config?.install} aria-describedby={!config?.install?'comfy-python-setup-hint':undefined} onClick={()=>void act('python',()=>choosePath('python'))}>{ft('选择 Python')}</Button>{pathValue(config?.install?.python)}</div>
        {!config?.install?<p id="comfy-python-setup-hint" className="comfy-local-note">{ft(PYTHON_SETUP_HINT)}</p>:null}
        <div className="comfy-local-path"><Button disabled={busy||configLocked||Boolean(currentRun)} onClick={()=>void act('output',()=>choosePath('output'))}>{ft('选择输出目录')}</Button>{config?.outputDirectory?pathValue(config.outputDirectory):<p className="comfy-local-note">{ft('使用软件默认输出目录的 ComfyUI 子目录')}</p>}</div>
        <div className="comfy-local-config-grid"><Field label={ft('本机地址')}><SelectMenuCompat aria-label={ft('本机地址')} value={host} disabled={configLocked||busy} onChange={event=>setHost(event.target.value as typeof host)}><option value="127.0.0.1">127.0.0.1</option><option value="::1">::1</option><option value="localhost">localhost</option></SelectMenuCompat></Field><Field label={ft('端口')}><input aria-label={ft('端口')} type="number" min={1} max={65535} step={1} disabled={configLocked||busy} value={port} onChange={event=>{setPort(event.target.value);setPortMode('manual');}}/></Field></div>
        <label className="comfy-local-check"><input aria-label={ft('自动选择可用端口')} type="checkbox" checked={portMode==='auto'} disabled={configLocked||busy} onChange={event=>setPortMode(event.target.checked?'auto':'manual')}/>{ft('自动选择可用端口')}</label>
        <Field label={ft('就绪超时（秒）')}><input aria-label={ft('就绪超时（秒）')} type="number" min={COMFY_LIMITS.readyTimeoutSecMin} max={COMFY_LIMITS.readyTimeoutSecMax} step={1} disabled={configLocked||busy} value={timeout} onChange={event=>setTimeoutValue(event.target.value)}/></Field>
        <label className="comfy-local-check"><input aria-label={ft('禁用云端 API 节点')} type="checkbox" checked={disableApiNodes} disabled={configLocked||busy} onChange={event=>setDisableApiNodes(event.target.checked)}/>{ft('禁用云端 API 节点')}</label>
        <label className="comfy-local-check"><input aria-label={ft('安全模式（禁用第三方节点）')} type="checkbox" checked={safeMode} disabled={configLocked||busy} onChange={event=>setSafeMode(event.target.checked)}/>{ft('安全模式（禁用第三方节点）')}</label>
        {config?.install&&(!config.install.supportedFlags.includes('--disable-api-nodes')||!config.install.supportedFlags.includes('--disable-all-custom-nodes'))?<p className="comfy-local-note">{ft('此版本不支持部分安全启动参数，请查看实际启动参数。')}</p>:null}
        <Field label={ft('额外启动参数（安全白名单）')}><textarea aria-label={ft('额外启动参数（安全白名单）')} value={extraArgs} disabled={configLocked||busy} onChange={event=>setExtraArgs(event.target.value)}/></Field>
        <p className="comfy-local-note">{ft('每行一个参数；选项和值分两行，路径不加引号。主进程会校验安全白名单。')}</p>
        <div className="comfy-local-actions"><Button disabled={configLocked||busy} onClick={()=>void act('settings',async()=>{await saveConfig();setNotice({kind:'success',text:ft('配置已保存')});})}>{ft('保存启动配置')}</Button><Button disabled={configLocked||busy||!config?.install} onClick={()=>void act('detect',async()=>{adoptConfig(await unwrap(api.detectInstall()));setSetupRevision(value=>value+1);})}>{ft('重新检测')}</Button></div>
        {config?.install?<div className="comfy-local-identity"><span>{config.install.layout} · Python {config.install.pythonVersion??ft('未知')} · {config.install.helpProbe}</span><span>{ft('布局来源')}: {config.install.layout}</span><span>{ft('解释器参数')}: <code>{config.install.pythonArgs?config.install.pythonArgs.join(' ')||ft('无'):ft('尚未检测')}</code></span>{dependencyReport()}<details><summary>{ft('支持的启动参数')}</summary><code>{config.install.supportedFlags.join(' ')}</code></details>{config.install.helpProbeMessage?<span>{config.install.helpProbeMessage}</span>:null}{config.install.pythonSelection?<span>{ft('检测结果')}: {config.install.pythonSelection.mode} · <code>{config.install.pythonSelection.reason}</code></span>:null}</div>:null}
        {snapshot?.identity?<div className="comfy-local-identity"><span>ComfyUI {snapshot.identity.comfyuiVersion??ft('未知')} · Python {snapshot.identity.pythonVersion??ft('未知')} · PyTorch {snapshot.identity.pytorchVersion??ft('未知')}</span>{snapshot.identity.devices.map((device,index)=><span key={index}>{device.name}{device.vramFree!==null&&device.vramTotal!==null?` · ${(device.vramFree/1073741824).toFixed(1)}/${(device.vramTotal/1073741824).toFixed(1)} GiB`:''}</span>)}{snapshot.identity.isProtocolFixture?<strong>{ft('协议测试服务，不代表真实模型推理。')}</strong>:null}{snapshot.identity.argv?<code>{snapshot.identity.argv.join(' ')}</code>:null}</div>:null}
        {snapshot?.failure?<div className="comfy-local-alert" data-kind="error"><details><summary>{ft('退出状态')}</summary><p>{ft('退出码')}: {snapshot.failure.exitCode??ft('未知')} · {ft('信号')}: {snapshot.failure.signal??ft('无')}</p></details><details><summary>{ft('原始诊断')}</summary><pre className="comfy-local-log">{`[${snapshot.failure.code}] ${snapshot.failure.message}\nexit=${snapshot.failure.exitCode??'null'} signal=${snapshot.failure.signal??'null'}\n${snapshot.failure.logTail.join('\n')}`}</pre></details></div>:null}

      </div></details>
      <details className="comfy-local-details comfy-env-troubleshooting" data-comfy-env-troubleshooting open={troubleshootingOpen} onToggle={event=>setTroubleshootingOpen(event.currentTarget.open)}><summary>{ft('故障排查')}<small>{ft('遇到问题时再查看')}</small></summary><div className="comfy-env-diagnostic-body"><div className="comfy-local-actions">{refreshButton()}<Button onClick={()=>setDrawer('logs')}>{ft('查看运行日志')}</Button></div>{snapshot?.failure?<p role="alert">{failureSummary()}</p>:null}{dependencyReport()}{dependencyRelated()}
        {platform?.launchAcceptance==='unverified'?<p className="comfy-local-note">{ft('本机平台未经实机验收，模型支持以本机分析结果为准。')}</p>:null}
        {analysis?.schemaDiagnostics?.total?<details className="comfy-local-details" data-comfy-schema-diagnostics><summary>{ft('第三方节点参数格式诊断（{count}）',{count:analysis.schemaDiagnostics.total})}</summary><p className="comfy-local-note">{ft('仅供环境排查；未使用的节点不会阻断当前工作流。')}</p><ul>{analysis.schemaDiagnostics.items.map((item,index)=><li key={index}><code>{item.displayName||item.classType}{item.input?` · ${item.input}`:''}</code><p>{item.detail}</p></li>)}</ul>{analysis.schemaDiagnostics.truncated?<p className="comfy-local-note">{ft('仅显示前 {count} 项诊断。',{count:analysis.schemaDiagnostics.items.length})}</p>:null}</details>:null}
      </div></details>
    </div></div></div></AppPortal>:null}
    {drawer==='logs'?<AppPortal><div className="comfy-local-drawer" data-comfy-drawer="logs" role={drawer==='logs'?'dialog':undefined} aria-modal={drawer==='logs'?true:undefined} aria-label={ft('运行日志')} hidden={drawer!=='logs'} onKeyDown={drawerKeys}><button type="button" className="comfy-local-drawer-shade" tabIndex={-1} aria-label={ft('关闭日志')} onClick={()=>setDrawer(null)}/><div className="comfy-local-drawer-panel"><div className="comfy-local-drawer-heading"><h2>{ft('运行日志')}</h2><Button aria-label={ft('关闭日志')} onClick={()=>setDrawer(null)}><Icon name="close"/></Button></div><div className="comfy-local-drawer-body">
        <details className="comfy-local-details" open={snapshot?.phase==='failed'}><summary>{ft('运行日志')} · {snapshot?.logs.length??0}</summary><pre className="comfy-local-log">{snapshot?.logs.length?snapshot.logs.map(line=>`${line.at} [${line.stream}] ${line.text}`).join('\n'):ft('暂无日志')}</pre></details>
      {snapshot?.failure?<pre className="comfy-local-log">{`[${snapshot.failure.code}] ${snapshot.failure.message}\nexit=${snapshot.failure.exitCode??'null'} signal=${snapshot.failure.signal??'null'}\n${snapshot.failure.logTail.join('\n')}`}</pre>:null}
    </div></div></div></AppPortal>:null}
    {drawer==='analysis'?<AppPortal><div className="comfy-local-drawer" data-comfy-drawer="analysis" role={drawer==='analysis'?'dialog':undefined} aria-modal={drawer==='analysis'?true:undefined} aria-label={ft('分析报告')} hidden={drawer!=='analysis'} onKeyDown={drawerKeys}><button type="button" className="comfy-local-drawer-shade" tabIndex={-1} aria-label={ft('关闭分析报告')} onClick={()=>setDrawer(null)}/><div className="comfy-local-drawer-panel"><div className="comfy-local-drawer-heading"><h2>{ft('分析报告')}</h2><Button aria-label={ft('关闭分析报告')} onClick={()=>setDrawer(null)}><Icon name="close"/></Button></div><div className="comfy-local-drawer-body">
      {workflow?<section className="comfy-local-panel"><div className="comfy-local-panel-heading"><div><h3>{workflow.name}</h3><small>{workflow.fileName??workflow.sourceKind} · {workflow.sourceSha256.slice(0,12)}</small></div><Button disabled={!ready||busy} onClick={()=>void act('analyze',()=>analyze(selected,values,true))}>{ft('重新分析')}</Button></div>
        <div className="comfy-local-workflow-toolbar"><input className="comfy-local-inline-input" aria-label={ft('重命名工作流')} maxLength={COMFY_LIMITS.workflowNameChars} value={rename} disabled={builtinWorkflow(workflow)} onChange={event=>setRename(event.target.value)}/><Button disabled={busy||builtinWorkflow(workflow)||!rename.trim()||rename.trim()===workflow.name} onClick={()=>{if(builtinWorkflow(workflow)||activityRef.current.busy||activityRef.current.active||!rename.trim()||rename.trim()===workflow.name)return;void act('rename',async()=>{const renamed=await unwrap(api.renameWorkflow(selected,rename.trim()));const next=workflowsRef.current.map(item=>item.id===renamed.id?renamed:item);collectionEvents.current.workflows++;workflowsRef.current=next;setWorkflows(next);});}}>{ft('重命名工作流')}</Button><Button disabled={busy||Boolean(currentRun?.workflowId===selected)} onClick={()=>setDeleteConfirm(true)}>{ft('删除工作流')}</Button></div>
        {deleteConfirm?<div className="comfy-local-alert"><p>{ft('确认删除工作流？结果图片不会删除。')}</p><div className="comfy-local-actions"><Button onClick={()=>setDeleteConfirm(false)}>{ft('取消')}</Button><Button variant="danger" disabled={busy} onClick={()=>{if(selectedRef.current===selected)void deleteSelectedWorkflow();}}>{ft('确认删除')}</Button></div></div>:null}
        {!ready?<p className="comfy-local-note">{ft('连接后才能分析并取得本机模型清单。')}</p>:null}
        {analysis?<>
          <details className="comfy-local-details" open={blocking.length>0}><summary>{ft('分析报告')} · {analysis.nodeCount}</summary><div className="comfy-local-report-counts"><span>{ft('阻断项 {count}',{count:blocking.length})}</span><span>{ft('待确认 {count}',{count:analysis.issues.filter(issue=>issue.severity==='confirm').length})}</span><span>{ft('警告 {count}',{count:analysis.issues.filter(issue=>issue.severity==='warn').length})}</span></div>{analysis.family?<p className="comfy-local-note">{ft('模型家族')}: {analysis.family.family} {analysis.family.variant??''} · {analysis.family.confidence}</p>:null}
          <ul className="comfy-local-issues">{analysis.issues.map((issue,index)=><li data-severity={issue.severity} key={index}><code>{issue.code}{issue.nodeId?` · #${issue.nodeId}`:''}{issue.classType?` · ${issue.classType}`:''}{issue.input?` → ${issue.input}`:''}</code><div>{issue.message}</div>{issue.detail?<small>{issue.detail}</small>:null}</li>)}</ul>{!blocking.length?<p className="comfy-local-note">{ft('未发现阻断项')}</p>:null}
          {analysis.missingModels.length?<><p className="comfy-local-note">{ft('模型缺失时可先选择本机替代文件，再重新分析。')}</p><ul className="comfy-local-issues">{analysis.missingModels.map((item,index)=><li key={index}><code>#{item.nodeId}.{item.input}: {item.value}</code>{item.directoryHint?<div>{item.directoryHint}</div>:null}{item.templateHint?<div>{item.templateHint.name} {item.templateHint.directory??''} {item.templateHint.url??''}</div>:null}</li>)}</ul></>:null}
          {staleValueKeys.length?<div className="comfy-local-alert"><p>{ft('当前分支不再使用以下 {count} 个参数；仅在确认清理后移除，其他输入保留。',{count:staleValueKeys.length})}</p><ul>{staleValueKeys.map(key=><li key={key}><code>{key}</code></li>)}</ul><Button disabled={busy||!ready} onClick={()=>void act('cleanup',async()=>{const kept=Object.fromEntries(Object.entries(values).filter(([key])=>!staleValueKeys.includes(key)));setValues(kept);await analyze(selected,kept);})}>{ft('清除失效参数并重新分析')}</Button></div>:null}
          {analysis.conversion?<p className="comfy-local-note">UI → API · {analysis.conversion.totals.accounted}/{analysis.conversion.totals.input} · {Object.entries(analysis.conversion.fates).map(([key,count])=>`${key}: ${count}`).join(' · ')}</p>:null}
          {analysis.prunedNodes.length?<ul className="comfy-local-issues">{analysis.prunedNodes.map((item,index)=><li key={index}><code>#{item.nodeId} · {item.classType} · {item.reason}</code></li>)}</ul>:null}
          </details>
          {analysis.cloudNodes.length?<div role="alert" className="comfy-local-alert" data-kind="error">{ft('此工作流含云端 API 节点，本地模式禁止运行。')}</div>:null}
          {analysis.thirdPartyFingerprint?<div className="comfy-local-trust"><p>{ft('第三方节点会以你的本机权限运行 Python 代码。请核对清单后确认。')}</p>{analysis.thirdParty.map((item,index)=><code key={index}>{item.classType} @ {item.pythonModule??'?'} · {item.nodeIds.join(', ')}</code>)}<small>{ft('确认指纹')}: <code>{analysis.thirdPartyFingerprint}</code></small><label className="comfy-local-check"><input type="checkbox" aria-label={ft('我信任这份节点清单')} checked={acceptedFingerprint===analysis.thirdPartyFingerprint} onChange={event=>setAcceptedFingerprint(event.target.checked?analysis.thirdPartyFingerprint:null)}/>{ft('我信任这份节点清单')}</label></div>:null}
          {analysis.unverifiedConversion?<div className="comfy-local-trust"><label className="comfy-local-check"><input type="checkbox" aria-label={ft('我接受未经验证的 UI 工作流转换结果')} checked={acceptedConversion} onChange={event=>setAcceptedConversion(event.target.checked)}/>{ft('我接受未经验证的 UI 工作流转换结果')}</label></div>:null}
        </>:null}
      </section>:<section className="comfy-local-panel"><p className="comfy-local-empty">{ft('从左侧选择工作流开始，不必重新导入基础配方。')}</p></section>}
    </div></div></div>
    </AppPortal>:null}
    </>}
    {previewIndex!==null&&previewImages[previewIndex]?<AppPortal><div className="image-preview-dialog-backdrop comfy-local-preview" role="dialog" aria-modal="true" aria-label={ft('预览结果')}><button type="button" className="image-preview-close" aria-label={ft('关闭预览')} onClick={()=>setPreviewIndex(null)}><Icon name="close"/></button><PreviewImageViewer images={previewImages} index={previewIndex} onIndex={setPreviewIndex} onBackgroundClick={()=>setPreviewIndex(null)} favoriteAction={null}/></div></AppPortal>:null}
  </main>;
}
