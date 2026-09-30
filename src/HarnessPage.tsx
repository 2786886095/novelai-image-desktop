import {chooseHarnessPlugins} from './components/harness-plugin-choice';
import {officialUpdateStatus,combinedUpdateKind} from './harness-update-status';
import {confirmAction} from './components/confirm';
import {useFeatureText} from "./feature-i18n";
import {useEffect,useRef,useState} from 'react';
import type {HarnessSnapshot} from './harness-types';
import {useAppStore} from './store';
import './harness-launcher.css';
import {componentStatus} from './harness-component-status';

const labels={
  'zh-CN':{title:'酒馆Agent',start:'启动',stop:'关闭',update:'更新',empty:'点击启动，在浏览器中打开 Agent。',states:{stopped:'未运行',installing:'准备组件中',starting:'启动中',running:'运行中',stopping:'正在关闭',updating:'检查更新中',error:'运行异常'}},
  'zh-TW':{title:'酒館Agent',start:'啟動',stop:'關閉',update:'更新',empty:'點擊啟動，在瀏覽器中開啟 Agent。',states:{stopped:'未執行',installing:'準備元件中',starting:'啟動中',running:'執行中',stopping:'正在關閉',updating:'檢查更新中',error:'執行異常'}},
  'en-US':{title:'Tavern Agent',start:'Start',stop:'Stop',update:'Update',empty:'Start the Agent to open its browser interface.',states:{stopped:'Stopped',installing:'Preparing',starting:'Starting',running:'Running',stopping:'Stopping',updating:'Checking updates',error:'Error'}},
  'ja-JP':{title:'酒場Agent',start:'起動',stop:'停止',update:'更新',empty:'起動するとブラウザーで Agent が開きます。',states:{stopped:'停止中',installing:'準備中',starting:'起動中',running:'実行中',stopping:'停止処理中',updating:'更新確認中',error:'エラー'}},
  'ko-KR':{title:'Tavern Agent',start:'시작',stop:'종료',update:'업데이트',empty:'시작하면 브라우저에서 Agent가 열립니다.',states:{stopped:'중지됨',installing:'준비 중',starting:'시작 중',running:'실행 중',stopping:'종료 중',updating:'업데이트 확인 중',error:'오류'}},
};
export default function HarnessPage({active=true}:{active?:boolean}){
  const ft=useFeatureText();
  const language=useAppStore(s=>s.settings?.language ?? 'zh-CN');
  const text=labels[language as keyof typeof labels]??labels['en-US'];
  const [state,setState]=useState<HarnessSnapshot>({phase:'stopped',version:null,logs:[],dataDirectory:''});
  const [error,setError]=useState('');const [pending,setPending]=useState(false);
  const [updateMessage,setUpdateMessage]=useState('');
  const [pluginToggleBusy,setPluginToggleBusy]=useState(false);
  const updateBusy=useRef(false),autoOffered=useRef('');
  const reviewRef=useRef<(snapshot:HarnessSnapshot)=>Promise<void>>(async()=>{});
  const activeRef=useRef(active);activeRef.current=active;
  const choiceAbort=useRef<AbortController|null>(null);
  useEffect(()=>{if(!active)choiceAbort.current?.abort();return()=>choiceAbort.current?.abort();},[active]);
  const consoleRef=useRef<HTMLDivElement>(null);const follow=useRef(true);
  useEffect(()=>{
    let disposed=false;let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try{const snapshot=await window.naiDesktop.harnessSnapshot();if(!disposed){setState(snapshot);setError('');}}
      catch(e){if(!disposed)setError(String(e));}
      finally{if(!disposed)timer=setTimeout(poll,700);}
    };void poll();return()=>{disposed=true;clearTimeout(timer);};
  },[]);
  useEffect(()=>{
    if(!active)return;
    let disposed=false;
    void window.naiDesktop.harnessCheckUpdates().then(async snapshot=>{if(!disposed){setState(snapshot);await reviewRef.current(snapshot);}})
      .catch(e=>{if(!disposed)setError(String(e));});
    return()=>{disposed=true;};
  },[active]);
  const last=state.logs.at(-1)?.id;
  useEffect(()=>{if(follow.current && consoleRef.current)consoleRef.current.scrollTop=consoleRef.current.scrollHeight;},[last]);
  const action=async(kind:'Start'|'Stop'|'CheckUpdates')=>{
    if(kind==='CheckUpdates')return checkBoth();
    setPending(true);setUpdateMessage('');try{setState(await window.naiDesktop[`harness${kind}`]());setError('');}catch(e){setError(String(e));}finally{setPending(false);}
  };
  const performUpdate=async(task:()=>Promise<void>)=>{
    if(updateBusy.current)return;
    updateBusy.current=true;setPending(true);setUpdateMessage('');
    try{await task();}catch(e){setUpdateMessage(ft(String(e)));}
    finally{updateBusy.current=false;setPending(false);}
  };
  const prepare=async(kind:'component'|'official',reinstall=false,review?:HarnessSnapshot)=>{
      setUpdateMessage(ft("正在检查兼容性…"));
      const plan=await window.naiDesktop.harnessPlanDownload(kind,reinstall);
      if(!activeRef.current)return;
      setState(await window.naiDesktop.harnessSnapshot());
      if(plan.current||plan.blocked){setUpdateMessage(ft(plan.message ?? "检查失败，请重试"));return;}
      const downloadMessage=plan.official?ft("将独立下载 Harness 官方 {version} 及其依赖，下载大小由依赖决定。Studio 适配组件版本保持不变。下载走软件更新代理，先隔离检查兼容性，通过后确认备份和安装。是否立即更新？",{version:plan.version}):review?ft("两项检查完成。\nStudio 组件：{installedComponent} → {component}\nHarness 官方：{installedOfficial} → {official}\n\n可下载适配组件 {version}，大小 {size} MiB。选择立即更新后下载并检查兼容性；现有资料保留。",{
        installedComponent:review.version??ft("尚未安装"),component:review.updateInfo?.componentFailed?ft("检查失败，请重试"):review.updateInfo?.component??ft("暂无已发布组件"),
        installedOfficial:review.installedUpstream??ft("尚未安装"),official:review.updateInfo?.officialFailed?ft("检查失败，请重试"):review.updateInfo?.official??ft("尚未检查"),
        version:plan.version,size:(plan.bytes/1048576).toFixed(1),
      }):ft("将下载 Agent {version}，大小 {size} MiB。下载后检查兼容性，保留对话和全部用户资料。是否继续？",{version:plan.version,size:(plan.bytes/1048576).toFixed(1)});
      if(!await confirmAction((plan.official&&review?ft("两项检查完成：Studio {component}；Harness {official}。",{component:review.updateInfo?.component??ft("检查失败，请重试"),official:review.updateInfo?.official??ft("检查失败，请重试")})+"\n\n":"")+downloadMessage,ft(review?"检查完成，是否立即更新？":plan.official?"下载并升级官方运行环境":reinstall?"重新安装组件":"下载并安装组件"),undefined,undefined,review?{confirm:"立即更新",cancel:"稍后"}:undefined)){
        setUpdateMessage(ft(review?"已选择稍后更新，尚未下载或修改组件。":"已取消下载。"));return;
      }
      if(!activeRef.current)return;
      let disablePlugins:string[]=[];
      if(plan.pluginUpdates?.length){
        choiceAbort.current=new AbortController();
        const decision=await chooseHarnessPlugins(plan.pluginUpdates,ft,choiceAbort.current.signal);
        if(decision==='cancel'||!activeRef.current){setUpdateMessage(ft('已取消升级，现有酒馆保持不变。'));return;}
        if(decision==='disable'){const unresolved=plan.pluginUpdates.filter(p=>!p.version);disablePlugins=(unresolved.length?unresolved:plan.pluginUpdates).map(p=>p.name);}
      }
      const proposal=await window.naiDesktop.harnessPrepareUpdate(kind,plan.token,disablePlugins);
      setUpdateMessage(ft(proposal.message));
      if(proposal.status!=='ready'||!proposal.token||!activeRef.current)return;
      const message=ft("兼容检查通过。组件 {from} → {to}，Harness {fromUpstream} → {upstream}。确认后先备份再升级，保留自定义插件与资料。",{from:proposal.fromVersion??ft("尚未安装"),to:proposal.version!,fromUpstream:proposal.fromUpstream??ft("尚未安装"),upstream:proposal.upstream!});
      const pluginSummary=(proposal.pluginUpdates??[]).map(p=>`${p.name}: ${p.action==='disable'?ft('禁用（保留插件和配置）'):`${p.fromVersion} → ${p.version}`}`).join('\n');
      if(!await confirmAction(message+(pluginSummary?'\n\n'+pluginSummary:''),ft(kind==='official'?"确认升级 Harness 官方版本？":"确认升级 Studio 适配组件？"))){setUpdateMessage(ft("已取消升级，现有酒馆保持不变。"));return;}
      const snapshot=await window.naiDesktop.harnessApplyPreparedUpdate(proposal.token);setState(snapshot);
      setUpdateMessage(ft(snapshot.phase==='error'?"升级失败，请查看日志；备份和旧组件已保留。":"升级完成，请手动启动 Agent。"));
  };
  const reviewCheckedSnapshot=async(snapshot:HarnessSnapshot,automatic=false)=>{
    const key=JSON.stringify([snapshot.version,snapshot.installedUpstream,snapshot.updateInfo?.component,snapshot.updateInfo?.official,snapshot.updateInfo?.componentFailed,snapshot.updateInfo?.officialFailed]);
    if(automatic&&autoOffered.current===key)return;
    if(!activeRef.current)return;
    const kind=combinedUpdateKind(snapshot);
    if(!kind){setUpdateMessage(ft(snapshot.updateInfo?.componentFailed||snapshot.updateInfo?.officialFailed?"部分更新检查失败，请重试。":"两项检查完成，暂无可安装更新。"));return;}
    if(!['stopped','error'].includes(snapshot.phase)){setUpdateMessage(ft("检测到更新，请先关闭 Agent 后再检查更新。"));return;}
    autoOffered.current=key;
    await prepare(kind,false,snapshot);
  };
  const checkBoth=()=>performUpdate(async()=>{
    const snapshot=await window.naiDesktop.harnessCheckUpdates();
    if(!activeRef.current)return;
    setState(snapshot);setError('');await reviewCheckedSnapshot(snapshot);
  });
  reviewRef.current=(snapshot)=>performUpdate(()=>reviewCheckedSnapshot(snapshot,true));
  const idle=state.phase==='stopped'||state.phase==='error';
  const officialStatus=officialUpdateStatus(state);


  return <section className="harness-launcher" aria-label={text.title}>
    <header className="harness-launcher-header">
      <div className="harness-launcher-status" role="status"><span className={`harness-status-dot phase-${state.phase}`} /><strong>{text.states[state.phase]}</strong>{state.version && <small>Agent {state.version}</small>}</div>
      <div className="harness-launcher-actions">
        <button className="btn secondary" disabled={pending||state.checkingUpdates} onClick={()=>void action('CheckUpdates')}>{state.checkingUpdates?ft("检查中…"):ft("检查两项更新")}</button>
        <button className="btn secondary" disabled={idle||state.phase==='stopping'} onClick={()=>void action('Stop')}>{text.stop}</button>
        <button className="btn primary" disabled={pending||!idle||!state.version} onClick={()=>void action('Start')}>▶ {text.start}</button>
      </div>
    </header>
    <section className="harness-update-grid" aria-label={ft("Agent 更新状态")} aria-busy={!!state.checkingUpdates}>
      <article className="harness-update-card">
        <div className="harness-update-heading">
          <h3>{ft("Studio 适配组件")}</h3>
          <button className="btn secondary" disabled={pending||!idle||state.checkingUpdates} onClick={()=>void performUpdate(()=>prepare('component'))}>{ft(state.version?"检查适配更新":"安装组件")}</button>
        </div>
        <div className="harness-update-versions">
          <span>{ft("当前组件版本：")}{state.version ?? ft("尚未安装")}</span>
          <span role="status">{(()=>{const message=componentStatus(state);return ft(message.key,message.params);})()}</span>
        </div>
      </article>
      <article className="harness-update-card">
        <div className="harness-update-heading">
          <h3>{ft("Harness 官方版本")}</h3>
          <button className="btn secondary" disabled={pending||!idle||state.checkingUpdates} onClick={()=>void performUpdate(()=>prepare('official'))}>{state.checkingUpdates?ft("检查中…"):ft(officialStatus==='available'?"检查并升级官方版本":"检查官方更新")}</button>
        </div>
        <div className="harness-update-versions">
          <span>{ft("当前运行环境：")}{state.installedUpstream ?? ft("尚未安装")}</span>
          <span role="status">{state.checkingUpdates ? ft("检查中…") : !state.updateInfo ? ft("尚未检查") : state.updateInfo.officialFailed || !state.updateInfo.official ? ft("检查失败，请重试") : `${ft("官方最新版本：")}${state.updateInfo.official}`}</span>
        </div>
        {officialStatus==='available' && <p className="harness-update-note">{ft("检测到官方新版；可独立下载，兼容检查通过后确认升级。")}</p>}
      </article>
      <details className="harness-update-card harness-plugin-card" aria-label={ft('插件自动更新')}>
        <summary className="harness-plugin-summary">
          <span>{ft('插件自动更新')}</span>
          <span className="harness-plugin-status" role="status">{ft(state.pluginAuto?.message??'插件自动检查尚未开始')}</span>
        </summary>
        <div className="harness-update-heading harness-plugin-body">
          <button className="btn secondary" disabled={!state.version||pending||['checking','updating'].includes(state.pluginAuto?.phase??'')}
            onClick={async()=>{try{const pluginAuto=await window.naiDesktop.harnessCheckPluginUpdates();setState(s=>({...s,pluginAuto}));}catch(e){setError(String(e));}}}>{ft('检查并更新插件')}</button>
        </div>
        <label className="field-inline harness-plugin-toggle">
          <input type="checkbox" checked={state.pluginAuto?.enabled??true} disabled={!state.pluginAuto||pluginToggleBusy}
            onChange={async e=>{
              const enabled=e.currentTarget.checked;setPluginToggleBusy(true);
              setState(s=>({...s,pluginAuto:s.pluginAuto?{...s.pluginAuto,enabled}:undefined}));
              try{const pluginAuto=await window.naiDesktop.harnessSetAutoPluginUpdates(enabled);setState(s=>({...s,pluginAuto}));}
              catch(e){setError(String(e));setState(await window.naiDesktop.harnessSnapshot());}
              finally{setPluginToggleBusy(false);}
            }}/>
          <span>{ft('自动检查并安装兼容的插件更新')}</span>
        </label>
        <p className="harness-update-note">{ft('启动后及每 6 小时检查；Agent 运行时等待关闭。更新前备份并隔离测试，不自动禁用插件。')}</p>
        <p className="harness-update-note" role="status">{ft(state.pluginAuto?.message??'插件自动检查尚未开始')}</p>
        {!!state.pluginAuto?.plugins.length&&<details className="harness-update-note">
          <summary>{ft('插件检查详情')}</summary>
          <ul>{state.pluginAuto.plugins.map((p,i)=><li key={`${p.name}-${i}`}><strong>{p.name}</strong> {p.fromVersion}{p.version?` → ${p.version}`:''}<br/>{p.reason}</li>)}</ul>
        </details>}
        {!!state.disabledPlugins?.length&&<details className="harness-update-note" open>
          <summary>{ft('Agent 已启动，但部分插件未加载')}</summary>
          <ul>{state.disabledPlugins.map((p,i)=><li key={i}>{p}</li>)}</ul>
        </details>}
      </details>
      {updateMessage && <p className="harness-update-note" role="status">{updateMessage}</p>}
      <details className="harness-update-note">
        <summary>{ft("更新说明")}{state.updateInfo && <span>{ft("上次检查：")}{new Date(state.updateInfo.checkedAt).toLocaleTimeString(language)}</span>}</summary>
        <p>{ft("每次进入此页面自动检测以上两项；重新打开软件后仍会检测，不会自动安装。")}</p>
        <p>{ft("更新经过适配的运行环境和随附插件；安装前备份，保留自定义插件与资料。")}</p>
        <p>{ft("两项更新均先检查兼容性，通过后由你确认升级；未通过时保留现有酒馆。")}</p>
      </details>
    </section>
    <section className="harness-backup-help" aria-label={ft("组件管理")}>
      <div className="harness-backup-actions">
        <button className="btn secondary" disabled={pending||!idle||!state.version} onClick={()=>void performUpdate(()=>prepare('component',true))}>{ft("重新安装组件")}</button>
        <button className="btn secondary" disabled={pending||!idle||!state.version} onClick={async()=>{
          if(!await confirmAction(ft("仅移除 Agent 运行组件和下载缓存。对话、角色卡、预设、图片、设置和备份全部保留。"),ft("卸载组件")))return;
          setPending(true);setUpdateMessage('');try{setState(await window.naiDesktop.harnessUninstall(true));}catch(e){setError(String(e));}finally{setPending(false);}
        }}>{ft("卸载组件")}</button>
      </div>
    </section>
    <details className="harness-backup-help">
      <summary>{ft("更新备份与恢复")}</summary>
      <p>{ft("有可安装更新时，会先自动备份用户配置、插件和会话；备份失败则停止升级。没有更新时不会新建备份。")}</p>
      <p><strong>{ft("备份位置：")}</strong><code>{state.dataDirectory ? `${state.dataDirectory.replace(/[\\/]$/, '')}${state.dataDirectory.includes('\\') ? '\\' : '/'}backups` : '…'}</code></p>
      <div className="harness-backup-actions">
        <button className="btn secondary" disabled={!state.dataDirectory} onClick={()=>void window.naiDesktop.harnessOpenBackups().catch(e=>setError(String(e)))}>{ft("打开备份目录")}</button>
        <button className="btn secondary" disabled={pending||!idle} onClick={()=>{setPending(true);void window.naiDesktop.harnessRestoreBackup().then(setState).catch(e=>setError(String(e))).finally(()=>setPending(false));}}>{ft("从备份恢复…")}</button>
      </div>
      <ol>
        <li>{ft("先关闭正在运行的 Agent，再点击“从备份恢复”，选择备份目录中的日期文件夹。")}</li>
        <li>{ft("恢复前会保留当前资料；恢复完成后不会自动启动，请检查后手动启动 Agent。")}</li>
        <li>{ft("新备份会同步恢复对应的组件版本。较早且没有组件记录的备份只恢复资料，组件版本不变。请保留 versions 文件夹。")}</li>
      </ol>
    </details>
    <div className="harness-console" ref={consoleRef} role="log" aria-label={ft("Agent 日志")} aria-live="off" tabIndex={0}
      onScroll={e=>{const box=e.currentTarget;follow.current=box.scrollHeight-box.scrollTop-box.clientHeight<60;}}>
      {!state.logs.length && <div className="harness-log info">{state.version?text.empty:ft("请先安装组件，再启动 Agent。")}</div>}
      {state.logs.map(line=><div key={line.id} className={`harness-log ${line.level}`}><span className="harness-log-time">{new Date(line.time).toLocaleTimeString(language)}</span> <span className="harness-log-level">[{line.level.toUpperCase()}]</span> {ft(line.text)}</div>)}
      {error && <div className="harness-log error" role="alert">{ft(error)}</div>}
    </div>
  </section>;
}
