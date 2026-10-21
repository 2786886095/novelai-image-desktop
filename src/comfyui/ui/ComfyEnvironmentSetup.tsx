import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '../../components/ui';
import {useFeatureText} from '../../feature-i18n';
import type {ComfyLocalConfig,ComfyResponse} from '../contract';
import type {ComfySetupApi,ComfySetupPhase,ComfySetupState} from '../setup-contract';
import './comfy-environment-setup.css';
import {groupComfyEnvironmentCandidates} from '../environment-guide';

const ACTIVE=new Set<ComfySetupPhase>(['hashing','preflight','extracting','validating']);
const PHASE:Record<ComfySetupPhase,string>={idle:'等待选择整包',hashing:'计算本机摘要',preflight:'安装预检',extracting:'正在解压',validating:'核验环境结构',completed:'环境安装完成',cancelled:'已取消',failed:'安装失败'};
async function read<T>(work:Promise<ComfyResponse<T>>):Promise<T>{const result=await work;if(!result.ok)throw new Error(`[${result.error.code}] ${result.error.message}${result.error.detail?`\n${result.error.detail}`:''}`);return result.data;}

function setupAdvice(reason:string|null|undefined):string|null{
  if(!reason)return null;
  if(/NOT_EMPTY/i.test(reason))return '目标目录非空，不能覆盖；请选择新的空目录。';
  if(/PATH_LENGTH/i.test(reason))return '路径过长，请选择更短的安装位置。';
  if(/DISK_SPACE/i.test(reason))return '磁盘空间不足，请释放空间后重试。';
  if(/EXECUTOR_(?:HASH|UNAVAILABLE)/i.test(reason))return '解压组件不可用或校验失败，请重新获取候选版；不要关闭安全检查。';
  return null;
}

/** Main owns paths, discovery, archives and execution. This component never runs an executable. */
export function ComfyEnvironmentSetup({api,onAdopt,onManual,onBusyChange,onConnectExisting,renderMode='drawer',locked=false,refreshKey=0,currentConfig,platform}:{api:ComfySetupApi|undefined;locked?:boolean;onAdopt:(config:ComfyLocalConfig)=>void;onManual:()=>void;onBusyChange?:(busy:boolean)=>void;onConnectExisting?:()=>void;renderMode?:'setup'|'drawer'|'guided';refreshKey?:number;currentConfig?:ComfyLocalConfig|null;platform?:string}){
  const ft=useFeatureText();
  const [state,setState]=useState<ComfySetupState|null>(null);
  const [pending,setPending]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [consent,setConsent]=useState<string|null>(null);
  const [candidateToInspect,setCandidateToInspect]=useState<string|null>(null);
  const adoptFlight=useRef(false);
  const [ack,setAck]=useState(false);
  const mounted=useRef(true);
  const seenRefresh=useRef(refreshKey);
  const busy=Boolean(pending)||Boolean(state&&ACTIVE.has(state.phase));
  const routineWarnings=state?.discovery?.warnings.filter(warning=>warning.startsWith('root-unavailable:'))??[];
  const advice=setupAdvice(error??state?.message);
  const discoveryIdentity=JSON.stringify(state?.discovery?.environments.map(item=>[item.id,item.root,item.python,item.pythonArgs]));
  const cancellable=Boolean(state&&ACTIVE.has(state.phase))||['load','discover','root','archive','install'].includes(pending??'');
  // Keep the active modal mounted while a main-owned operation is pending.
  // Closing after cancellation/completion is safe: reopening reloads main state.
  const executionBusy=Boolean(state&&ACTIVE.has(state.phase))||Boolean(pending&&!['copy','official'].includes(pending));
  useEffect(()=>{onBusyChange?.(executionBusy);return()=>onBusyChange?.(false);},[executionBusy,onBusyChange]);
  const act=useCallback(async(name:string,work:()=>Promise<void>)=>{
    setPending(name);setError(null);
    try{await work();}catch(reason){if(mounted.current)setError(reason instanceof Error?reason.message:String(reason));}
    finally{if(mounted.current)setPending(null);}
  },[]);
  useEffect(()=>{
    mounted.current=true;if(!api)return()=>{mounted.current=false;};
    const unsubscribe=api.onEvent(next=>{if(mounted.current)setState(next);});
    void act('load',async()=>{const initial=await read(api.getState());if(!mounted.current)return;setState(initial);if(renderMode!=='guided'&&initial.supported&&initial.phase==='idle'){const discovered=await read(api.discover());if(mounted.current)setState(discovered);}});
    return()=>{mounted.current=false;unsubscribe();};
  },[api,act,renderMode]);
  useEffect(()=>{
    if(!api||seenRefresh.current===refreshKey)return;
    seenRefresh.current=refreshKey;
    // Parent increments only after an explicit configuration mutation completes.
    // Refresh discovery in this mounted modal; never auto-adopt a candidate.
    void act('discover',async()=>{const discovered=await read(api.discover());if(mounted.current)setState(discovered);});
  },[api,act,refreshKey]);
  useEffect(()=>{setConsent(null);setCandidateToInspect(null);},[discoveryIdentity]);
  useEffect(()=>{setAck(false);},[state?.package?.id,state?.package?.sha256]);
  async function update(name:string,work:()=>Promise<ComfyResponse<ComfySetupState>>){await act(name,async()=>{const next=await read(work());if(mounted.current)setState(next);});}
  async function adopt(id:string){
    if(!api||locked||busy||adoptFlight.current||consent!==id)return;
    adoptFlight.current=true;try{await act('adopt',async()=>{const config=await read(api.adoptCandidate(id,true));if(mounted.current){setConsent(null);onAdopt(config);}});}finally{adoptFlight.current=false;}
  }
  async function install(){
    if(!api||locked||!state?.supported||!state.package||!state.selectedRoot||!ack||busy)return;
    await update('install',()=>api.install({acknowledgeUnverifiedSource:true}));
  }
  function pathValue(value:string){return <div className="comfy-local-path-value"><code>{value}</code><Button variant="ghost" aria-label={`${ft('复制路径')}: ${value}`} onClick={()=>void act('copy',async()=>{if(!navigator.clipboard?.writeText)throw new Error(ft('剪贴板不可用，请手动选择并复制路径。'));await navigator.clipboard.writeText(value);})}>{ft('复制路径')}</Button></div>;}
  const candidateGroups=groupComfyEnvironmentCandidates(state?.discovery?.environments??[],{platform,install:currentConfig?.install});
  function guidedCandidates(){return <div className="comfy-env-root-groups">{candidateGroups.map(group=><article className="comfy-env-root-group" data-comfy-env-root-group data-root-key={group.id} key={group.id}>
    <div className="comfy-env-root-group-heading"><strong>{group.label}</strong><span className="comfy-local-badge">{ft(group.isCurrent?'当前使用':group.isSaved?'已保存，尚未启动核验':'扫描发现，尚未核验')}</span></div>{pathValue(group.root)}
    <details className="comfy-env-python-options"><summary>{ft('查看可选 Python（{count} 个）',{count:group.interpreters.length})}</summary>{group.interpreters.map(interpreter=>{const candidate=interpreter.candidates.find(item=>item.isCurrent)??interpreter.candidates[0],chosen=candidateToInspect===candidate.id;return <div className="comfy-env-python-choice" data-comfy-env-python-choice data-python-key={interpreter.key} key={interpreter.key}>
      <span className="comfy-local-badge">{ft(interpreter.isCurrent?'当前使用':interpreter.isSaved?'已保存，尚未启动核验':'扫描发现，尚未核验')}</span>{interpreter.python?pathValue(interpreter.python):<p>{ft('这个目录尚未找到 Python，请选择主目录或在高级设置中手动选择。')}</p>}
      {interpreter.pythonArgs.length?<code className="comfy-env-python-args">{interpreter.pythonArgs.join(' ')}</code>:null}
      <p className="comfy-local-note">{ft(interpreter.compatibility==='matched'?'本机信息检查通过，不代表模型已配置。':interpreter.compatibility==='conflict'?'依赖信息需要核对':'尚未核验')}</p>
      {!chosen?<Button variant="ghost" disabled={busy||locked||!interpreter.python} aria-label={`${ft('选择此 Python')}: ${interpreter.python}`} onClick={()=>{if(!busy&&!locked){setCandidateToInspect(candidate.id);setConsent(null);}}}>{ft('选择此 Python')}</Button>:<><p className="comfy-local-note">{ft('检测前需要你同意运行此 Python；不会安装依赖。')}</p><label className="comfy-local-check"><input type="checkbox" aria-label={`${ft('我同意运行此环境的 Python 读取启动参数')} · ${interpreter.python}`} checked={consent===candidate.id} disabled={busy||locked||!interpreter.python} onChange={event=>setConsent(event.target.checked?candidate.id:null)}/>{ft('我同意运行此环境的 Python 读取启动参数')}</label><Button disabled={busy||locked||consent!==candidate.id} onClick={()=>void adopt(candidate.id)}>{ft('运行此 Python 检测')}</Button></>}
      <details className="comfy-local-details"><summary>{ft('扫描详情')}</summary><p>{group.labels.join(' · ')}</p>{interpreter.candidates.map(item=><div key={item.id}><code>{item.id}</code><p>{item.sourceRoot}</p>{item.modelDirectory?pathValue(item.modelDirectory):null}</div>)}{interpreter.warnings.map((warning,index)=><p key={index}>{warning}</p>)}</details>
    </div>;})}</details>
  </article>)}</div>;}
  const stage=state?.phase==='completed'?4:state?.phase==='extracting'||state?.phase==='validating'?4:state?.phase==='hashing'?3:state?.phase==='preflight'?2:1;
  return <section className="comfy-setup comfy-environment-setup" data-render-mode={renderMode} aria-label={ft(renderMode==='setup'?'环境准备':renderMode==='guided'?'其他环境与安装':'环境来源')}>
    {renderMode==='setup'?<header className="comfy-environment-intro"><h2>{ft('准备 ComfyUI 环境')}</h2><p>{ft('使用已有环境，或安装到独立目录。模型另行选择，不覆盖已有文件。')}</p></header>:null}
    {!api?(renderMode==='guided'?<details className="comfy-local-details"><summary>{ft('其他环境与安装')}</summary><p>{ft('安装桥不可用，请使用手动配置。')}</p></details>:<div className="comfy-environment-source"><h3>{ft('使用已有环境')}</h3><p className="comfy-local-note">{ft('安装桥不可用，请使用手动配置。')}</p><Button disabled={locked} onClick={onManual}>{ft('选择 ComfyUI 目录')}</Button></div>):<>
      {locked?<p className="comfy-local-note">{ft('服务运行中；停止或断开后才能修改环境。')}</p>:null}
      {advice?<div className="comfy-local-alert" data-kind="error"><p>{ft(advice)}</p>{/NOT_EMPTY/i.test(error??state?.message??'')?<Button disabled={busy||locked} onClick={onManual}>{ft('此目录已有环境？改用已有环境配置')}</Button>:null}</div>:null}
      {error?<div role="alert" className="comfy-local-alert" data-kind="error"><strong>{ft('操作未完成，请查看原始诊断。')}</strong><details><summary>{ft('原始诊断')}</summary><pre className="comfy-local-log">{error}</pre></details></div>:null}
      <section className="comfy-environment-source" aria-labelledby={renderMode==='guided'?undefined:'comfy-existing-source-title'}>
      {renderMode!=='guided'?<><div className="comfy-environment-source-heading"><h3 id="comfy-existing-source-title">{ft('使用已有环境')}</h3><Button disabled={busy||locked} onClick={onManual}>{ft('选择 ComfyUI 目录')}</Button></div><p className="comfy-local-note">{ft('选择 ComfyUI 目录后，自动只读检测兼容 Python 和可用端口；不会安装或升级依赖。')}</p></>:null}
      <details className="comfy-environment-discovery" data-comfy-env-discovery onToggle={event=>{if(renderMode==='guided'&&event.currentTarget.open&&!busy&&!state?.discovery)void update('discover',()=>api.discover());}} open={renderMode==='guided'?undefined:Boolean(state?.discovery?.environments.length)||pending==='load'||pending==='discover'||pending==='root'}>
      <summary>{ft(renderMode==='guided'?'查找其他已有环境':'发现已有环境')}{state?.discovery?.environments.length?<span className="comfy-environment-count">{renderMode==='guided'?candidateGroups.length:state.discovery.environments.length}</span>:null}</summary>
      <p className="comfy-local-note">{ft(renderMode==='guided'?'按主目录列出；同目录的不同 Python 保留为独立选项。':'静态发现，不运行任何程序。')}</p>
      <div className="comfy-local-actions"><Button disabled={busy} onClick={()=>void update('discover',()=>api.discover())}>{ft('重新扫描环境')}</Button><Button disabled={busy} onClick={()=>void update('root',()=>api.chooseDiscoveryRoot())}>{ft('补充扫描位置')}</Button><Button disabled={busy||locked} onClick={onManual}>{ft('手动选择已有环境')}</Button></div>
      {pending==='load'||pending==='discover'||pending==='root'?<p role="status" className="comfy-local-note">{ft('正在只读扫描…')}</p>:null}
      {state?.discovery?<>
        {renderMode!=='guided'&&state.discovery.conflict?<p className="comfy-local-alert">{ft('检测到多个 Python；当前配置保持不变，请核对后明确选择。')}</p>:null}
        {renderMode!=='guided'?<><p className="comfy-local-note">{ft('已尝试 {count} 个位置',{count:state.rootsChecked.length})}</p>{state.discovery.truncated?<p className="comfy-local-note">{ft('扫描已达上限；可补充指定目录。')}</p>:null}</>:null}
        {!state.discovery.environments.length?<p className="comfy-local-empty">{ft('未检测到环境。可导入官方整包，或手动选择已有目录。')}</p>:null}
        {renderMode==='guided'?guidedCandidates():<div className="comfy-setup-candidates">{state.discovery.environments.map(candidate=><article className="comfy-setup-candidate" data-environment-id={candidate.id} key={candidate.id}>
          <div className="comfy-environment-candidate-heading"><strong>{candidate.label}</strong><span className="comfy-local-badge">{candidate.layout} · {ft(candidate.isCurrent?'当前配置':candidate.source==='configured'?'已保存配置':'扫描发现')}</span></div>{pathValue(candidate.root)}
          <details className="comfy-environment-candidate-details"><summary>{ft('查看 Python 与模型目录')}</summary><span>Python</span>{candidate.python?pathValue(candidate.python):<p className="comfy-local-note">{ft('尚未配置')}</p>}{candidate.pythonArgs?<span>{ft('解释器参数')}: <code>{candidate.pythonArgs.join(' ')||ft('无')}</code></span>:null}{candidate.modelDirectory?<><span>{ft('模型目录')}</span>{pathValue(candidate.modelDirectory)}</>:null}
          <small>{ft('环境来源')}: {candidate.sourceRoot}</small>{candidate.reason==='python-not-found'?<p className="comfy-local-note">{ft('未检测到 Python，请手动选择。')}</p>:null}
          {candidate.warnings.map((warning,i)=><p className="comfy-local-note" key={i}>{warning}</p>)}
          </details>
          <label className="comfy-local-check"><input type="checkbox" aria-label={`${ft('我同意运行此环境的 Python 读取启动参数')} · ${candidate.label}`} checked={consent===candidate.id} disabled={busy||locked||!candidate.python} onChange={event=>setConsent(event.target.checked?candidate.id:null)}/>{ft('我同意运行此环境的 Python 读取启动参数')}</label>
          <Button disabled={busy||locked||!candidate.python||consent!==candidate.id} onClick={()=>void adopt(candidate.id)}>{ft('采用并检测')}</Button>
        </article>)}</div>}
        {renderMode!=='guided'&&routineWarnings.length?<p className="comfy-local-note">{ft('未找到 {count} 个默认位置；可展开扫描诊断查看详情。',{count:routineWarnings.length})}</p>:null}
        {(renderMode==='guided'?[]:state.discovery.warnings.filter(warning=>!warning.startsWith('root-unavailable:'))).map((warning,i)=><p className="comfy-local-note" key={i}>{warning}</p>)}
        {state.discovery.warnings.length?<details className="comfy-local-details" data-comfy-discovery-diagnostics><summary>{ft('扫描诊断（{count} 条）',{count:state.discovery.warnings.length})}</summary><pre className="comfy-local-log">{state.discovery.warnings.join('\n')}</pre></details>:null}
      </>:null}
      {state?.rootsChecked.length?<details className="comfy-local-details"><summary>{ft('已检查的位置')}</summary>{state.rootsChecked.map((root,i)=><code className="comfy-setup-path" key={i}>{root}</code>)}</details>:null}
      </details>
      </section>
      <details className="comfy-environment-source comfy-env-install-entry" data-comfy-env-install open={renderMode==='guided'?(state?.package||state&&ACTIVE.has(state.phase)?true:undefined):true}><summary>{ft('没有 ComfyUI？获取或导入')}</summary><div aria-labelledby="comfy-install-source-title">
      <h3 id="comfy-install-source-title">{ft('安装独立环境')}</h3>
      <p className="comfy-local-note">{ft('从官方页面下载整包后在此导入；本软件不会自动下载。')}</p>
      <div className="comfy-local-actions"><Button disabled={Boolean(pending)} onClick={()=>void act('official',async()=>{await read(api.openOfficialPage());})}>{ft('打开官方获取页面')}</Button><Button disabled={busy||locked||!state?.supported} onClick={()=>void update('archive',()=>api.chooseArchive())}>{ft('选择整包')}</Button></div>
      {state?.supported===false?<p role="status" className="comfy-local-note">{ft('当前平台不支持托管安装，仍可手动配置。')}</p>:null}
      <details className="comfy-setup-install" open={Boolean(state?.package)||Boolean(state&&ACTIVE.has(state.phase))||pending==='install'||state?.phase==='completed'||state?.phase==='failed'}>
        <summary>{ft('安装位置与校验')}</summary><p className="comfy-local-note">{ft('仅用于全新空目录；已有环境请使用上方配置与扫描。')}</p><ol className="comfy-setup-steps">{['来源','位置','校验','安装'].map((key,i)=><li key={key} aria-current={stage===i+1?'step':undefined}><span>{i+1}</span>{ft(key)}</li>)}</ol>
        <p className="comfy-local-note">{ft('环境与模型独立保存，不覆盖已有环境。')}</p>
        <div className="comfy-local-path"><Button disabled={busy||locked||!state?.supported} onClick={()=>void update('target',()=>api.chooseTargetDirectory())}>{ft('选择独立环境位置')}</Button>{state?.selectedRoot||state?.defaultRoot?pathValue(state.selectedRoot||state.defaultRoot):<code>{ft('尚未配置')}</code>}</div>
        {state?.package?<div className="comfy-setup-package"><strong>{state.package.name}</strong><span>{(state.package.bytes/1073741824).toFixed(2)} GiB</span><small>{ft('用户自选整包；签名、许可及官方完整性未核验。')}</small><strong>{ft('本机 SHA-256（不是官方校验值）')}</strong><code>{state.package.sha256}</code><p className="comfy-local-note">{ft('没有官方校验值；本机摘要不能证明来源可信。')}</p><label className="comfy-local-check"><input type="checkbox" aria-label={ft('我确认使用此自选整包，并接受无官方校验值的风险')} disabled={busy} checked={ack} onChange={event=>setAck(event.target.checked)}/>{ft('我确认使用此自选整包，并接受无官方校验值的风险')}</label></div>:<p className="comfy-local-note">{ft('尚未选择整包')}</p>}
        <div className="comfy-local-actions"><Button variant="primary" disabled={busy||locked||!state?.supported||!state.package||!state.selectedRoot||!ack} onClick={()=>void install()}>{ft('安装整包（不含模型配置）')}</Button>{cancellable?<Button disabled={pending==='cancel'} onClick={()=>void update('cancel',()=>api.cancel())}>{ft('取消当前操作')}</Button>:null}</div>
        <div className="comfy-setup-status" role="status" aria-live="polite"><strong>{ft(PHASE[state?.phase??'idle'])}</strong>{state?.progress?<><span>{state.progress.completed} / {state.progress.total} {state.progress.unit==='bytes'?'B':ft('个条目')}</span>{state.progress.total>0?<progress value={state.progress.completed} max={state.progress.total}/>:null}</>:null}</div>
        {state?.message?<details className="comfy-local-details" open={state.phase==='failed'}><summary>{ft('原始诊断')}</summary><pre className="comfy-local-log">{state.message}</pre></details>:null}
        {state?.phase==='completed'&&state.installed?<div className="comfy-setup-completed"><strong>{ft('已安装环境，尚未配置模型；不会自动运行 Python。')}</strong><code>{state.installed.root}</code><p className="comfy-local-note">{ft('重新扫描后，确认采用此环境。')}</p><div className="comfy-local-actions"><Button disabled={busy} onClick={()=>void update('discover',()=>api.discover())}>{ft('重新扫描环境')}</Button><Button disabled={busy||Boolean(state.shortcutPath)} onClick={()=>void update('shortcut',()=>api.createShortcut(state.installed!.id))}>{ft('创建桌面快捷方式（不覆盖）')}</Button></div>{state.shortcutPath?<p className="comfy-local-note">{ft('快捷方式已创建：{path}',{path:state.shortcutPath})}</p>:null}</div>:null}
      </details>
      </div></details>
    </>}
    {onConnectExisting?<section className="comfy-environment-source comfy-environment-connect"><h3>{ft('已经在本机运行了 ComfyUI？')}</h3><p className="comfy-local-note">{ft('直接连接本机 ComfyUI，不需要选择目录或 Python。')}</p><Button disabled={busy||locked} onClick={()=>{if(!busy&&!locked)onConnectExisting();}}>{ft('连接已运行的实例')}</Button></section>:null}
  </section>;
}
