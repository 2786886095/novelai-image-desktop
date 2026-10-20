import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Button,AppPortal} from './components/ui';
import {Icon} from './components/icons';
import {PreviewImageViewer} from './components/PreviewImageViewer';
import {useFeatureText} from './feature-i18n';
import {useAppStore} from './store';
import {COMFY_LIMITS,type ComfyAnalysis,type ComfyLocalConfig,type ComfyPlatformInfo,type ComfySnapshot,type ComfyWorkflowSummary,type ComfyResultItem,type ComfyRunSnapshot,type ComfySlot,type ComfySlotValue,type ComfyResponse,type ComfyRunRequest} from './comfyui/contract';
import './comfyui-local.css';

type Text=(key:string,values?:Record<string,string|number>)=>string;

export function comfyElapsed(startedAt:number|undefined,now:number):string {
  const seconds=Math.max(0,Math.floor((now-(startedAt!==undefined&&Number.isFinite(startedAt)?startedAt:now))/1000));
  return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
}

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
  unreachable:'无法连接本机服务，请确认它已经启动。',
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

function Field({label,children,wide=false,meta}:{label:string;children:ReactNode;wide?:boolean;meta?:string}) {
  return <label className={`comfy-local-field${wide?' wide':''}`}><span>{label}</span>{children}{meta?<small className="comfy-local-slot-meta">{meta}</small>:null}</label>;
}

function formatError(error:unknown):string {return error instanceof Error?error.message:String(error);}

async function unwrap<T>(promise:Promise<ComfyResponse<T>>):Promise<T> {
  const response=await promise;
  if(!response.ok)throw new Error(`[${response.error.code}] ${response.error.message}${response.error.detail?`\n${response.error.detail}`:''}`);
  return response.data;
}

function slotLabel(slot:ComfySlot,ft:Text):string {
  if(slot.kind==='model'&&slot.role==='text-encoder')return ft('文本编码器');
  if(slot.kind==='model'&&slot.role==='vae')return ft('VAE 文件');
  return KIND_TEXT[slot.kind]?ft(KIND_TEXT[slot.kind]):slot.label;
}

function SlotInput({slot,value,disabled,onChange,ft}:{slot:ComfySlot;value:ComfySlotValue|null;disabled:boolean;onChange:(value:ComfySlotValue|null)=>void;ft:Text}) {
  const label=`${slotLabel(slot,ft)} · ${slot.nodeId}.${slot.input}`;
  const meta=`${slot.classType} #${slot.nodeId} → ${slot.input}${slot.linkedFrom?` ← #${slot.linkedFrom.nodeId}`:''}`;
  const wide=slot.multiline||slot.kind==='positive'||slot.kind==='negative';
  let input:ReactNode;
  if(slot.valueType==='combo'&&slot.options?.length){
    const selected=String(value??'');const missing=value!==null&&!slot.options.some(option=>String(option)===selected);
    input=<><select aria-label={label} value={selected} disabled={disabled} onChange={event=>{const item=slot.options!.find(option=>String(option)===event.target.value);onChange(item??null);}}>
      {value===null?<option value="">{ft('未选择')}</option>:null}
      {missing?<option value={selected} disabled>{selected}</option>:null}
      {slot.options.map(option=><option value={String(option)} key={String(option)}>{String(option)}</option>)}
    </select>{missing?<small className="comfy-local-slot-meta">{ft('当前值不在本机可选项中：{value}',{value:selected})}</small>:null}</>;
  }else if(slot.valueType==='boolean'){
    input=<input type="checkbox" aria-label={label} checked={value===true} disabled={disabled} onChange={event=>onChange(event.target.checked)}/>;
  }else if(slot.valueType==='int'||slot.valueType==='float'){
    input=<input type="number" aria-label={label} value={typeof value==='number'?value:''} min={slot.min} max={slot.max} step={slot.step??(slot.valueType==='int'?1:'any')} disabled={disabled} onChange={event=>onChange(event.target.value===''?null:Number(event.target.value))}/>;
  }else if(wide){
    input=<textarea aria-label={label} value={String(value??'')} maxLength={COMFY_LIMITS.slotTextChars} disabled={disabled} onChange={event=>onChange(event.target.value)}/>;
  }else{
    input=<input aria-label={label} value={String(value??'')} maxLength={COMFY_LIMITS.slotTextChars} disabled={disabled} onChange={event=>onChange(event.target.value)}/>;
  }
  return <Field label={label} wide={Boolean(wide)} meta={meta}>{input}</Field>;
}

const ACTIVE_RUN_PHASES=new Set(['validating','submitting','queued','running','saving','cancelling']);

export default function ComfyLocalTool({onBack}:{onBack:()=>void}) {
  const ft=useFeatureText();
  const api=window.naiComfy;
  const language=useAppStore(state=>state.settings?.language);
  const [config,setConfig]=useState<ComfyLocalConfig|null>(null);
  const [snapshot,setSnapshot]=useState<ComfySnapshot|null>(null);
  const [platform,setPlatform]=useState<ComfyPlatformInfo|null>(null);
  const [workflows,setWorkflows]=useState<ComfyWorkflowSummary[]>([]);
  const [results,setResults]=useState<ComfyResultItem[]>([]);
  const [runs,setRuns]=useState<ComfyRunSnapshot[]>([]);
  const [selected,setSelected]=useState('');
  const selectedRef=useRef(selected);selectedRef.current=selected;
  const [analysis,setAnalysis]=useState<ComfyAnalysis|null>(null);
  const [values,setValues]=useState<Record<string,ComfySlotValue>>({});
  const [seedMode,setSeedMode]=useState<'fixed'|'random'>('random');
  const [acceptedFingerprint,setAcceptedFingerprint]=useState<string|null>(null);
  const [acceptedConversion,setAcceptedConversion]=useState(false);
  const [pending,setPending]=useState<string[]>([]);
  const [notice,setNotice]=useState<{kind:'error'|'success';text:string}|null>(null);
  const [family,setFamily]=useState('');
  const [paste,setPaste]=useState('');
  const [importName,setImportName]=useState('');
  const [rename,setRename]=useState('');
  const [deleteConfirm,setDeleteConfirm]=useState(false);
  const [port,setPort]=useState('8188');
  const [timeout,setTimeoutValue]=useState('300');
  const [host,setHost]=useState<'127.0.0.1'|'localhost'|'::1'>('127.0.0.1');
  const [disableApiNodes,setDisableApiNodes]=useState(true);
  const [safeMode,setSafeMode]=useState(false);
  const [extraArgs,setExtraArgs]=useState('');
  const [now,setNow]=useState(Date.now());
  const [previewIndex,setPreviewIndex]=useState<number|null>(null);
  const [livePreviews,setLivePreviews]=useState<Record<string,string>>({});
  const mounted=useRef(true);
  const analysisTicket=useRef(0);
  const busy=pending.length>0;
  const ready=snapshot?.phase==='ready';
  const serviceBusy=['probing','starting','stopping'].includes(snapshot?.phase??'');
  const configLocked=serviceBusy||ready;
  const workflow=workflows.find(item=>item.id===selected);
  const shownWorkflows=workflows.filter(item=>!family||item.familyLabel===family);
  const shownResults=results.filter(item=>!selected||item.workflowId===selected);
  const blocking=analysis?.issues.filter(issue=>issue.severity==='block')??[];
  const staleValueKeys=analysis?.issues.some(issue=>issue.code==='stale-slot')?Object.keys(values).filter(key=>!analysis.slots.some(slot=>slot.id===key)):[];
  const confirmationMissing=Boolean(analysis&&(analysis.thirdPartyFingerprint&&acceptedFingerprint!==analysis.thirdPartyFingerprint||analysis.unverifiedConversion&&!acceptedConversion));
  const canRun=Boolean(ready&&selected&&analysis?.ok&&!blocking.length&&!analysis.cloudNodes.length&&!confirmationMissing&&!busy);
  const currentRun=runs.find(run=>ACTIVE_RUN_PHASES.has(run.phase));

  const adoptConfig=useCallback((next:ComfyLocalConfig)=>{
    setConfig(next);setPort(String(next.launch.port));setTimeoutValue(String(next.launch.readyTimeoutSec));
    setHost(next.connection.host);setDisableApiNodes(next.launch.disableApiNodes);setSafeMode(next.launch.safeMode);
    setExtraArgs(next.launch.extraArgs.join('\n'));
  },[]);
  const adoptRun=useCallback((run:ComfyRunSnapshot)=>{
    setRuns(previous=>[run,...previous.filter(item=>item.runId!==run.runId)].slice(0,20));
  },[]);
  const act=useCallback(async <T,>(name:string,work:()=>Promise<T>):Promise<T|undefined>=>{
    setPending(previous=>[...previous,name]);setNotice(null);
    try{return await work();}
    catch(error){if(mounted.current)setNotice({kind:'error',text:formatError(error)});return undefined;}
    finally{if(mounted.current)setPending(previous=>{const i=previous.indexOf(name);return i<0?previous:previous.filter((_,index)=>index!==i);});}
  },[]);

  useEffect(()=>{
    mounted.current=true;
    if(!api)return()=>{mounted.current=false;};
    const unsubscribe=api.onEvent(event=>{
      if(!mounted.current)return;
      if(event.type==='snapshot'){setSnapshot(event.snapshot);if(event.snapshot.activeRun)adoptRun(event.snapshot.activeRun);}
      else if(event.type==='run')adoptRun(event.run);
      else if(event.type==='workflows')setWorkflows(event.workflows);
      else if(event.type==='results')setResults(event.results);
      else if(event.type==='preview')setLivePreviews(previous=>Object.fromEntries([...Object.entries(previous).filter(([id])=>id!==event.runId),[event.runId,event.dataUrl]].slice(-20)));
    });
    void act('load',async()=>{
      const bundle=await unwrap(api.getState());if(!mounted.current)return;
      adoptConfig(bundle.config);setSnapshot(bundle.snapshot);setPlatform(bundle.platform);
      setWorkflows(bundle.workflows);setResults(bundle.results);if(bundle.snapshot.activeRun)adoptRun(bundle.snapshot.activeRun);
    });
    return()=>{mounted.current=false;analysisTicket.current++;unsubscribe();};
  },[api,act,adoptConfig,adoptRun]);

  useEffect(()=>{
    if(snapshot?.phase!=='starting'&&snapshot?.phase!=='probing')return;
    setNow(Date.now());const timer=window.setInterval(()=>setNow(Date.now()),1000);
    return()=>window.clearInterval(timer);
  },[snapshot?.phase,snapshot?.startedAt]);

  const analyze=useCallback(async (id:string,nextValues:Record<string,ComfySlotValue>,refresh=false)=>{
    if(!api||!id)return;
    const ticket=++analysisTicket.current;
    if(refresh)await unwrap(api.refreshInventory());
    const report=await unwrap(api.analyzeWorkflow(id,nextValues));
    if(mounted.current&&ticket===analysisTicket.current&&selectedRef.current===id)setAnalysis(report);
    return report;
  },[api]);

  const chooseWorkflow=useCallback((item:ComfyWorkflowSummary,nextValues=item.savedValues)=>{
    analysisTicket.current++;selectedRef.current=item.id;setSelected(item.id);setRename(item.name);setDeleteConfirm(false);
    setAnalysis(null);setValues({...nextValues});setAcceptedFingerprint(null);setAcceptedConversion(false);setNotice(null);
    if(ready)void act('analyze',()=>analyze(item.id,nextValues));
  },[ready,act,analyze]);

  useEffect(()=>{
    // Connecting may finish after a workflow was selected while offline.
    if(ready&&selected&&!analysis&&!pending.includes('analyze'))void act('analyze',()=>analyze(selected,values));
  },[ready,selected]);

  async function saveConfig(){
    if(!api)return;
    const numericPort=Number(port),numericTimeout=Number(timeout);
    if(!Number.isInteger(numericPort)||numericPort<1||numericPort>65535||!Number.isInteger(numericTimeout)||numericTimeout<COMFY_LIMITS.readyTimeoutSecMin||numericTimeout>COMFY_LIMITS.readyTimeoutSecMax)throw new Error(ft('端口需要是 1–65535 的整数，超时需要是正整数。'));
    const next=await unwrap(api.setLaunchOptions({port:numericPort,readyTimeoutSec:numericTimeout,disableApiNodes,safeMode,extraArgs:extraArgs.split(/\r?\n/).map(arg=>arg.trim()).filter(Boolean)}));
    const connected=await unwrap(api.setConnection({host,port:numericPort}));
    adoptConfig({...next,connection:connected.connection});
  }

  async function choosePath(kind:'install'|'python'|'output'){
    if(!api)return;
    const next=await unwrap(kind==='install'?api.chooseInstallDirectory():kind==='python'?api.choosePython():api.chooseOutputDirectory());
    if(next)adoptConfig(next);
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
    if(!api||!id)return;
    const sourceSlots=id===selected?analysis?.slots??[]:[];
    const initial=await unwrap(api.analyzeWorkflow(id,editedValues(source,sourceSlots,mode)));
    const slotValues=editedValues(source,initial.slots,mode);
    const report=mode==='random'&&initial.slots.some(slot=>slot.kind==='seed'&&slot.id in source)?await unwrap(api.analyzeWorkflow(id,slotValues)):initial;
    if(selectedRef.current===id)setAnalysis(report);
    if(!report.ok||report.issues.some(issue=>issue.severity==='block')||report.cloudNodes.length||report.thirdPartyFingerprint&&report.thirdPartyFingerprint!==trust||report.unverifiedConversion&&!conversion)throw new Error(ft('请先修复阻断项并完成风险确认。'));
    const request:ComfyRunRequest={workflowId:id,analysisRevision:report.revision,slotValues,seedMode:mode,confirmations:{thirdPartyFingerprint:trust,unverifiedConversion:conversion}};
    adoptRun(await unwrap(api.run(request)));
  }

  async function reuse(item:ComfyResultItem,rerun:boolean){
    if(!api)return;
    const restored=await unwrap(api.reuseResult(item.id));
    const itemWorkflow=workflows.find(candidate=>candidate.id===restored.workflowId);
    if(!itemWorkflow)throw new Error(ft('暂无工作流，先连接服务，再导入自己的工作流。'));
    setFamily('');chooseWorkflow(itemWorkflow,restored.slotValues);setSeedMode('fixed');
    const report=await analyze(itemWorkflow.id,restored.slotValues);
    if(rerun&&report)await runWorkflow(itemWorkflow.id,restored.slotValues,'fixed',null,false);
  }

  async function refresh(){
    if(!api)return;const latest=await unwrap(api.getState());
    setSnapshot(latest.snapshot);setWorkflows(latest.workflows);setResults(latest.results);if(latest.snapshot.activeRun)adoptRun(latest.snapshot.activeRun);
  }

  const phaseLabel=snapshot?.phase==='ready'&&snapshot.owner==='external'?ft('启动完成 · 外部实例'):ft(PHASE_TEXT[snapshot?.phase??'idle']);
  const elapsed=comfyElapsed(snapshot?.startedAt?Date.parse(snapshot.startedAt):undefined,now);
  const previewImages=useMemo(()=>shownResults.map(item=>({src:item.fileUrl,alt:`${ft('输出文件')} ${item.filePath}`})),[shownResults,language]);

  return <main className="comfy-local" data-comfy-local>
    <header className="comfy-local-hero"><div><span className="eyebrow">COMFYUI · LOCAL</span><h2>{ft('本地 ComfyUI')}</h2><p>{ft('本机启动，不打开网页；配置、工作流与结果独立保存。')}</p></div><Button onClick={onBack}>{ft('返回工具首页')}</Button></header>
    {!api?<section className="comfy-local-panel"><p className="comfy-local-empty">{ft('当前环境没有本地 ComfyUI 桌面桥，请使用桌面版。')}</p></section>:<>
    {notice?<div role={notice.kind==='error'?'alert':'status'} className="comfy-local-alert" data-kind={notice.kind}>{notice.text}</div>:null}
    <div className="comfy-local-layout"><aside className="comfy-local-sidebar">
      <section className="comfy-local-panel" aria-labelledby="comfy-service-title">
        <div className="comfy-local-panel-heading"><h3 id="comfy-service-title">{ft('服务与运行环境')}</h3></div>
        <div role="status" aria-live="polite" className="comfy-local-status" data-phase={snapshot?.phase??'idle'}>{phaseLabel}</div>
        {snapshot?.phase==='starting'||snapshot?.phase==='probing'?<p className="comfy-local-note">{snapshot.stage==='checking-port'?ft('检测端口'):ft('等待 HTTP 就绪 {elapsed}',{elapsed})}</p>:null}
        {snapshot?.owner==='external'?<p className="comfy-local-note">{ft('这是外部实例，断开不会结束它。')}</p>:null}
        {snapshot?.detectedExternal&&!ready?<p className="comfy-local-note">{ft('检测到本机已有 ComfyUI，可连接。')}</p>:null}
        {snapshot?.previousSession?<p className="comfy-local-note">{ft('上次会话可能留下进程 PID {pid}，本软件不会自动结束它。',{pid:snapshot.previousSession.pid})}</p>:null}
        {snapshot?.health==='unresponsive'?<p role="alert" className="comfy-local-note">{ft('本地服务无响应，请查看日志；不会自动结束进程。')}</p>:null}
        {snapshot?.failure?<div className="comfy-local-alert" data-kind="error"><strong>{ft(FAILURE_TEXT[snapshot.failure.code]??'启动失败')}</strong><details><summary>{ft('原始诊断')}</summary><pre className="comfy-local-log">{`[${snapshot.failure.code}] ${snapshot.failure.message}\nexit=${snapshot.failure.exitCode??'null'} signal=${snapshot.failure.signal??'null'}\n${snapshot.failure.logTail.join('\n')}`}</pre></details></div>:null}
        {platform?.launchAcceptance==='unverified'?<p className="comfy-local-note">{ft('本机平台未经实机验收，模型支持以本机分析结果为准。')}</p>:null}
        {snapshot?.identity?<div className="comfy-local-identity"><span>ComfyUI {snapshot.identity.comfyuiVersion??ft('未知')} · Python {snapshot.identity.pythonVersion??ft('未知')} · PyTorch {snapshot.identity.pytorchVersion??ft('未知')}</span>{snapshot.identity.devices.map((device,index)=><span key={index}>{device.name}{device.vramFree!==null&&device.vramTotal!==null?` · ${(device.vramFree/1073741824).toFixed(1)}/${(device.vramTotal/1073741824).toFixed(1)} GiB`:''}</span>)}{snapshot.identity.isProtocolFixture?<strong>{ft('协议测试服务，不代表真实模型推理。')}</strong>:null}{snapshot.identity.argv?<code>{snapshot.identity.argv.join(' ')}</code>:null}</div>:null}
        <div className="comfy-local-actions">
          <Button variant="primary" disabled={busy||configLocked||!config?.install||platform?.launchSupported===false} onClick={()=>void act('start',async()=>{await saveConfig();setSnapshot(await unwrap(api.start()));})}><Icon name="play"/>{ft('启动本地 ComfyUI')}</Button>
          <Button disabled={busy||configLocked} onClick={()=>void act('connect',async()=>{await saveConfig();setSnapshot(await unwrap(api.connect()));})}>{ft('连接已有实例')}</Button>
          {snapshot?.owner==='external'&&ready?<Button disabled={pending.includes('stop')} onClick={()=>void act('stop',async()=>setSnapshot(await unwrap(api.disconnect())))}>{ft('断开连接')}</Button>:null}
          {snapshot?.owner==='app'&&(ready||serviceBusy)?<Button disabled={pending.includes('stop')||snapshot.phase==='stopping'} onClick={()=>void act('stop',async()=>setSnapshot(await unwrap(api.stop({interruptRunning:true}))))}>{ft('停止本软件启动的服务')}</Button>:null}
        </div>
        <details className="comfy-local-details" open={!config?.install}><summary>{ft('配置与启动参数')}</summary><div className="comfy-local-config">
          <div className="comfy-local-path"><Button disabled={busy||configLocked} onClick={()=>void act('install',()=>choosePath('install'))}>{ft('选择 ComfyUI 目录')}</Button><code>{config?.install?.root??ft('尚未配置')}</code></div>
          <div className="comfy-local-path"><Button disabled={busy||configLocked} onClick={()=>void act('python',()=>choosePath('python'))}>{ft('选择 Python')}</Button><code>{config?.install?.python??ft('尚未配置')}</code></div>
          <div className="comfy-local-path"><Button disabled={busy||configLocked||Boolean(currentRun)} onClick={()=>void act('output',()=>choosePath('output'))}>{ft('选择输出目录')}</Button><code>{config?.outputDirectory??ft('使用软件默认输出目录的 ComfyUI 子目录')}</code></div>
          {config?.install?<div className="comfy-local-identity"><span>{config.install.layout} · Python {config.install.pythonVersion??ft('未知')} · {config.install.helpProbe}</span><code>{config.install.supportedFlags.join(' ')}</code>{config.install.helpProbeMessage?<span>{config.install.helpProbeMessage}</span>:null}</div>:null}
          <div className="comfy-local-config-grid"><Field label={ft('本机地址')}><select aria-label={ft('本机地址')} value={host} disabled={configLocked||busy} onChange={event=>setHost(event.target.value as typeof host)}><option value="127.0.0.1">127.0.0.1</option><option value="::1">::1</option><option value="localhost">localhost</option></select></Field><Field label={ft('端口')}><input aria-label={ft('端口')} type="number" min={1} max={65535} step={1} disabled={configLocked||busy} value={port} onChange={event=>setPort(event.target.value)}/></Field></div>
          <Field label={ft('就绪超时（秒）')}><input aria-label={ft('就绪超时（秒）')} type="number" min={COMFY_LIMITS.readyTimeoutSecMin} max={COMFY_LIMITS.readyTimeoutSecMax} step={1} disabled={configLocked||busy} value={timeout} onChange={event=>setTimeoutValue(event.target.value)}/></Field>
          <label className="comfy-local-check"><input aria-label={ft('禁用云端 API 节点')} type="checkbox" checked={disableApiNodes} disabled={configLocked||busy} onChange={event=>setDisableApiNodes(event.target.checked)}/>{ft('禁用云端 API 节点')}</label>
          <label className="comfy-local-check"><input aria-label={ft('安全模式（禁用第三方节点）')} type="checkbox" checked={safeMode} disabled={configLocked||busy} onChange={event=>setSafeMode(event.target.checked)}/>{ft('安全模式（禁用第三方节点）')}</label>
          {config?.install&&(!config.install.supportedFlags.includes('--disable-api-nodes')||!config.install.supportedFlags.includes('--disable-all-custom-nodes'))?<p className="comfy-local-note">{ft('此版本不支持部分安全启动参数，请查看实际启动参数。')}</p>:null}
          <Field label={ft('额外启动参数（安全白名单）')}><textarea aria-label={ft('额外启动参数（安全白名单）')} value={extraArgs} disabled={configLocked||busy} onChange={event=>setExtraArgs(event.target.value)}/></Field>
          <p className="comfy-local-note">{ft('每行一个参数；选项和值分两行，路径不加引号。主进程会校验安全白名单。')}</p>
          <div className="comfy-local-actions"><Button disabled={configLocked||busy} onClick={()=>void act('settings',async()=>{await saveConfig();setNotice({kind:'success',text:ft('配置已保存')});})}>{ft('保存启动配置')}</Button><Button disabled={configLocked||busy||!config?.install} onClick={()=>void act('detect',async()=>adoptConfig(await unwrap(api.detectInstall())))}>{ft('重新检测')}</Button></div>
        </div></details>
        <details className="comfy-local-details" open={snapshot?.phase==='failed'}><summary>{ft('运行日志')} · {snapshot?.logs.length??0}</summary><pre className="comfy-local-log">{snapshot?.logs.length?snapshot.logs.map(line=>`${line.at} [${line.stream}] ${line.text}`).join('\n'):ft('暂无日志')}</pre></details>
      </section>
      <section className="comfy-local-panel" aria-labelledby="comfy-workflows-title"><div className="comfy-local-panel-heading"><h3 id="comfy-workflows-title">{ft('工作流库')} · {workflows.length}</h3></div>
        <Button disabled={busy} onClick={()=>void act('import',()=>importOne(true))}><Icon name="folder"/>{ft('导入 JSON 或图片元数据')}</Button>
        <details className="comfy-local-details"><summary>{ft('粘贴 JSON')}</summary><div className="comfy-local-paste"><Field label={ft('工作流名称')}><input aria-label={ft('工作流名称')} maxLength={COMFY_LIMITS.workflowNameChars} value={importName} onChange={event=>setImportName(event.target.value)}/></Field><textarea aria-label={ft('粘贴 JSON')} value={paste} maxLength={COMFY_LIMITS.workflowJsonChars} spellCheck={false} onChange={event=>setPaste(event.target.value)}/><div className="comfy-local-actions"><Button disabled={busy||!paste.trim()} onClick={()=>void act('import',()=>importOne(false))}>{ft('导入粘贴内容')}</Button></div></div></details>
        <Field label={ft('模型家族')}><select aria-label={ft('筛选工作流')} value={family} onChange={event=>setFamily(event.target.value)}><option value="">{ft('自动识别 / 其他')}</option><option value="moss-image">MOSS-Image</option><option value="anima">Anima</option><option value="krea2">Krea2</option></select></Field><p className="comfy-local-note">{ft('家族仅用于筛选和提示，不代表已验证兼容。')}</p>
        <div className="comfy-local-workflows">{shownWorkflows.length?shownWorkflows.map(item=><button type="button" className="comfy-local-workflow" key={item.id} aria-pressed={selected===item.id} disabled={busy} onClick={()=>chooseWorkflow(item)}><strong>{item.name}</strong><small>{item.familyLabel??item.sourceFormat.toUpperCase()} · {item.lastAnalysis?ft('阻断项 {count}',{count:item.lastAnalysis.blocking}):ft('尚未分析')}</small></button>):<p className="comfy-local-empty">{ft('暂无工作流，先连接服务，再导入自己的工作流。')}</p>}</div>
      </section>
    </aside><div className="comfy-local-main">
      {workflow?<section className="comfy-local-panel"><div className="comfy-local-panel-heading"><div><h3>{workflow.name}</h3><small>{workflow.fileName??workflow.sourceKind} · {workflow.sourceSha256.slice(0,12)}</small></div><Button disabled={!ready||busy} onClick={()=>void act('analyze',()=>analyze(selected,values,true))}>{ft('重新分析')}</Button></div>
        <div className="comfy-local-workflow-toolbar"><input className="comfy-local-inline-input" aria-label={ft('重命名工作流')} maxLength={COMFY_LIMITS.workflowNameChars} value={rename} onChange={event=>setRename(event.target.value)}/><Button disabled={busy||!rename.trim()||rename.trim()===workflow.name} onClick={()=>void act('rename',async()=>{const renamed=await unwrap(api.renameWorkflow(selected,rename.trim()));setWorkflows(previous=>previous.map(item=>item.id===renamed.id?renamed:item));})}>{ft('重命名工作流')}</Button><Button disabled={busy||Boolean(currentRun?.workflowId===selected)} onClick={()=>setDeleteConfirm(true)}>{ft('删除工作流')}</Button></div>
        {deleteConfirm?<div className="comfy-local-alert"><p>{ft('确认删除工作流？结果图片不会删除。')}</p><div className="comfy-local-actions"><Button onClick={()=>setDeleteConfirm(false)}>{ft('取消')}</Button><Button variant="danger" disabled={busy} onClick={()=>void act('delete',async()=>{await unwrap(api.deleteWorkflow(selected));setWorkflows(await unwrap(api.listWorkflows()));analysisTicket.current++;selectedRef.current='';setSelected('');setAnalysis(null);setDeleteConfirm(false);setValues({});})}>{ft('确认删除')}</Button></div></div>:null}
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
      </section>:<section className="comfy-local-panel"><p className="comfy-local-empty">{ft('暂无工作流，先连接服务，再导入自己的工作流。')}</p></section>}
      {workflow&&analysis?<section className="comfy-local-panel" aria-labelledby="comfy-parameters-title"><div className="comfy-local-panel-heading"><h3 id="comfy-parameters-title">{ft('参数与模型')}</h3></div><p className="comfy-local-note">{ft('模型、编码器和 VAE 分别绑定本机加载节点，不会自动替换成同名家族。')}</p>
        <div className="comfy-local-parameters">{analysis.slots.map(slot=><SlotInput key={slot.id} slot={slot} value={Object.prototype.hasOwnProperty.call(values,slot.id)?values[slot.id]:slot.defaultValue} disabled={busy||slot.kind==='seed'&&seedMode==='random'} ft={ft} onChange={value=>setValues(previous=>{const next={...previous};if(value===null)delete next[slot.id];else next[slot.id]=value;return next;})}/>)}</div>
        {!analysis.slots.length?<p className="comfy-local-note">{ft('没有识别到可调参数，请检查工作流和分析报告。')}</p>:null}
        {analysis.slots.some(slot=>slot.kind==='seed')?<label className="comfy-local-check"><input type="checkbox" aria-label={ft('每次随机种子')} checked={seedMode==='random'} disabled={busy} onChange={event=>setSeedMode(event.target.checked?'random':'fixed')}/>{ft('每次随机种子')}</label>:null}
        <div className="comfy-local-actions"><Button variant="primary" disabled={!canRun} onClick={()=>void act('run',()=>runWorkflow())}><Icon name="play"/>{ft('提交生图任务')}</Button>{busy?<span className="comfy-local-note" role="status">{ft('正在处理…')}</span>:null}</div>{blocking.length||confirmationMissing?<p className="comfy-local-note">{ft('请先修复阻断项并完成风险确认。')}</p>:null}
      </section>:null}
      <section className="comfy-local-panel" aria-labelledby="comfy-results-title"><div className="comfy-local-panel-heading"><h3 id="comfy-results-title">{ft('任务与结果')}</h3><div className="comfy-local-actions"><Button disabled={pending.includes('refresh')} onClick={()=>void act('refresh',refresh)}>{ft('刷新任务与结果')}</Button><Button onClick={()=>void act('folder',()=>unwrap(api.openResultsFolder()))}>{ft('打开结果目录')}</Button></div></div>
        {!runs.length&&!shownResults.length?<p className="comfy-local-empty">{ft('暂无任务')}</p>:null}
        {runs.filter(run=>!selected||run.workflowId===selected).map(run=><article className="comfy-local-run" key={run.runId} data-run-phase={run.phase}><div className="comfy-local-run-heading"><strong>{ft(RUN_TEXT[run.phase]??run.phase)} · {run.runId.slice(0,12)}</strong>{ACTIVE_RUN_PHASES.has(run.phase)?<Button disabled={run.phase==='cancelling'||pending.includes(`cancel:${run.runId}`)} onClick={()=>void act(`cancel:${run.runId}`,async()=>adoptRun(await unwrap(api.cancel(run.runId))))}>{ft('取消任务')}</Button>:null}</div><div className="comfy-local-run-meta">{run.queuePosition!==null?<span>{ft('队列位置 {position}',{position:run.queuePosition})}</span>:null}{run.currentNode?<span>{ft('当前节点 {node}',{node:`#${run.currentNode.id} ${run.currentNode.classType??''}`})}</span>:null}<span>{run.nodesExecuted}/{run.nodesTotal}</span>{run.progress?<span>{run.progress.value}/{run.progress.max}</span>:null}</div>{run.progress?<progress aria-label={ft('运行中')} value={run.progress.value} max={run.progress.max||1}/>:null}{run.error?<div role="alert" className="comfy-local-alert" data-kind="error">[{run.error.code}] {run.error.message}{run.error.nodeErrors.map((error,index)=><div key={index}><strong>{ft('失败节点 {node}',{node:`#${error.nodeId} ${error.classType??''}`})}</strong><p>{error.message}</p>{error.details?<pre className="comfy-local-log">{error.details}</pre>:null}</div>)}</div>:null}{livePreviews[run.runId]&&ACTIVE_RUN_PHASES.has(run.phase)?<img className="comfy-local-live-preview" src={livePreviews[run.runId]} alt={ft('预览结果')}/>:null}{run.nonImageOutputs>0?<p className="comfy-local-note">{ft('另有 {count} 个非静态图片输出保留在 ComfyUI 输出目录。',{count:run.nonImageOutputs})}</p>:null}</article>)}
        <div className="comfy-local-results">{shownResults.map((item,index)=><article className="comfy-local-result" key={item.id}><button type="button" className="comfy-local-result-preview" aria-label={`${ft('预览结果')} ${index+1}`} onClick={()=>setPreviewIndex(index)}><img src={item.fileUrl} width={item.width} height={item.height} loading="lazy" alt={`${item.width} × ${item.height}`}/></button><p>{item.width} × {item.height} · {(item.bytes/1048576).toFixed(2)} MiB</p><p>{item.filePath}</p><div className="comfy-local-actions"><Button onClick={()=>void act('reveal',()=>unwrap(api.openResult(item.id)))}>{ft('打开结果目录')}</Button><Button disabled={busy} onClick={()=>void act('reuse',()=>reuse(item,false))}>{ft('复用参数')}</Button><Button disabled={busy||!ready} onClick={()=>void act('rerun',()=>reuse(item,true))}>{ft('相同参数再生成')}</Button></div></article>)}</div>
      </section>
    </div></div>
    </>}
    {previewIndex!==null&&previewImages[previewIndex]?<AppPortal><div className="image-preview-dialog-backdrop comfy-local-preview" role="dialog" aria-modal="true" aria-label={ft('预览结果')}><button type="button" className="image-preview-close" aria-label={ft('关闭预览')} onClick={()=>setPreviewIndex(null)}><Icon name="close"/></button><PreviewImageViewer images={previewImages} index={previewIndex} onIndex={setPreviewIndex} onBackgroundClick={()=>setPreviewIndex(null)} favoriteAction={null}/></div></AppPortal>:null}
  </main>;
}
