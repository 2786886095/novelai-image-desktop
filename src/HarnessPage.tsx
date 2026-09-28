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
  const activeRef=useRef(active);activeRef.current=active;
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
    void window.naiDesktop.harnessCheckUpdates().then(snapshot=>{if(!disposed)setState(snapshot);})
      .catch(e=>{if(!disposed)setError(String(e));});
    return()=>{disposed=true;};
  },[active]);
  const last=state.logs.at(-1)?.id;
  useEffect(()=>{if(follow.current && consoleRef.current)consoleRef.current.scrollTop=consoleRef.current.scrollHeight;},[last]);
  const action=async(kind:'Start'|'Stop'|'CheckUpdates')=>{
    setPending(true);try{setState(await window.naiDesktop[`harness${kind}`]());setError('');}catch(e){setError(String(e));}finally{setPending(false);}
  };
  const prepare=async(kind:'component'|'official',reinstall=false)=>{
    if(pending)return;
    setPending(true);setUpdateMessage(ft("正在检查兼容性…"));
    try{
      const plan=await window.naiDesktop.harnessPlanDownload(kind,reinstall);
      if(!activeRef.current)return;
      if(plan.current){setUpdateMessage(ft("当前已是最新版本。"));return;}
      if(!await confirmAction(ft("将下载 Agent {version}，大小 {size} MiB。下载后检查兼容性，保留对话和全部用户资料。是否继续？",{version:plan.version,size:(plan.bytes/1048576).toFixed(1)}),ft(reinstall?"重新安装组件":"下载并安装组件"))){setUpdateMessage(ft("已取消下载。"));return;}
      const proposal=await window.naiDesktop.harnessPrepareUpdate(kind,plan.token);
      setUpdateMessage(ft(proposal.message));
      if(proposal.status!=='ready'||!proposal.token||!activeRef.current)return;
      const message=ft("兼容检查通过。组件 {from} → {to}，Harness {fromUpstream} → {upstream}。确认后先备份再升级，保留自定义插件与资料。",{from:proposal.fromVersion??ft("尚未安装"),to:proposal.version!,fromUpstream:proposal.fromUpstream??ft("尚未安装"),upstream:proposal.upstream!});
      if(!await confirmAction(message,ft(kind==='official'?"确认升级 Harness 官方版本？":"确认升级 Studio 适配组件？"))){setUpdateMessage(ft("已取消升级，现有酒馆保持不变。"));return;}
      const snapshot=await window.naiDesktop.harnessApplyPreparedUpdate(proposal.token);setState(snapshot);
      setUpdateMessage(ft(snapshot.phase==='error'?"升级失败，请查看日志；备份和旧组件已保留。":"升级完成，请手动启动 Agent。"));
    }catch(e){setUpdateMessage(ft(String(e)));}finally{setPending(false);}
  };
  const idle=state.phase==='stopped'||state.phase==='error';


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
          <button className="btn secondary" disabled={pending||!idle||state.checkingUpdates} onClick={()=>void prepare('component')}>{ft(state.version?"检查适配更新":"安装组件")}</button>
        </div>
        <div className="harness-update-versions">
          <span>{ft("当前组件版本：")}{state.version ?? ft("尚未安装")}</span>
          <span role="status">{(()=>{const message=componentStatus(state);return ft(message.key,message.params);})()}</span>
        </div>
      </article>
      <article className="harness-update-card">
        <div className="harness-update-heading">
          <h3>{ft("Harness 官方版本")}</h3>
          <button className="btn secondary" disabled={pending||!idle||state.checkingUpdates} onClick={()=>void prepare('official')}>{state.checkingUpdates?ft("检查中…"):ft("检查官方更新")}</button>
        </div>
        <div className="harness-update-versions">
          <span>{ft("当前运行环境：")}{state.installedUpstream ?? ft("尚未安装")}</span>
          <span role="status">{state.checkingUpdates ? ft("检查中…") : !state.updateInfo ? ft("尚未检查") : state.updateInfo.officialFailed || !state.updateInfo.official ? ft("检查失败，请重试") : `${ft("官方最新版本：")}${state.updateInfo.official}`}</span>
        </div>
      </article>
      {updateMessage && <p className="harness-update-note" role="status">{updateMessage}</p>}
      <details className="harness-update-note">
        <summary>{ft("更新说明")}{state.updateInfo && <span>{ft("上次检查：")}{new Date(state.updateInfo.checkedAt).toLocaleTimeString(language)}</span>}</summary>
        <p>{ft("每次进入此页面自动检测以上两项；重新打开软件后仍会检测，不会自动安装。")}</p>
        <p>{ft("更新经过适配的运行环境和随附插件；安装前备份，保留自定义插件与资料。")}</p>
        <p>{ft("两项更新均先检查兼容性，通过后由你确认升级；未通过时保留现有酒馆。")}</p>
      </details>
    </section>
    <section className="harness-backup-help" aria-label={ft("组件管理")}>
      <p>{ft("进入页面只检查版本，不下载。卸载组件保留对话、角色卡、预设、图片、设置和备份，重装后继续使用。")}</p>
      <div className="harness-backup-actions">
        <button className="btn secondary" disabled={pending||!idle||!state.version} onClick={()=>void prepare('component',true)}>{ft("重新安装组件")}</button>
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
