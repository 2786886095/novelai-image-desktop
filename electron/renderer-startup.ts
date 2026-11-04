/** Startup-only health check: never retries requests, clears data or restarts a healthy UI. */
export function watchRendererStartup(options: {
  onProblem: (reason: string) => void;
  timeoutMs?: number;
}) {
  let ready = false, stopped = false, reported = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { if (timer) clearTimeout(timer); timer = undefined; };
  const fail = (reason: string) => {
    if (ready || stopped || reported) return;
    reported = true; clear();
    const safe = ['timeout', 'load-failed', 'unresponsive', 'oom', 'crashed', 'launch-failed'].includes(reason) ? reason : 'failed';
    options.onProblem(safe);
  };
  const retry = () => {
    if (ready || stopped) return false;
    clear(); reported = false;
    timer = setTimeout(() => fail('timeout'), options.timeoutMs ?? 45_000);
    return true;
  };
  retry();
  return {
    fail,
    retry,
    ready: () => { if (!stopped) { ready = true; clear(); } },
    isReady: () => ready,
    dispose: () => { stopped = true; clear(); },
  };
}

export function startupFailureText(language: unknown) {
  const key = String(language ?? 'zh-CN');
  if (key.startsWith('en')) return {title:'Startup needs attention', message:'The interface did not finish starting.', detail:'A renderer process may have failed or startup may be taking too long. Retry reloads only the interface; it does not clear accounts, settings or images, and does not repeat generation requests.', retry:'Retry startup', wait:'Keep waiting'};
  if (key.startsWith('ja')) return {title:'起動状態を確認してください', message:'画面の起動が完了していません。', detail:'描画プロセスが失敗したか、起動に時間がかかっています。再試行は画面のみを再読込します。アカウント・設定・画像は消去せず、生成要求を再送しません。', retry:'起動を再試行', wait:'待機する'};
  if (key.startsWith('ko')) return {title:'시작 상태 확인', message:'화면 시작이 완료되지 않았습니다.', detail:'렌더러가 실패했거나 시작이 지연되고 있습니다. 다시 시도는 화면만 새로 고칩니다. 계정·설정·이미지를 삭제하거나 생성 요청을 재전송하지 않습니다.', retry:'시작 다시 시도', wait:'계속 기다리기'};
  if (key === 'zh-TW') return {title:'啟動需要處理', message:'介面尚未完成啟動。', detail:'可能是繪製程序啟動失敗，或載入時間過長。重試只重新載入介面，不會清除帳戶、設定或圖片，也不會重送生圖請求。', retry:'重試啟動', wait:'繼續等待'};
  return {title:'启动需要处理', message:'界面尚未完成启动。', detail:'可能是渲染进程启动失败，或加载时间过长。重试只重新加载界面，不会清除账号、设置或图片，也不会重发生图请求。', retry:'重试启动', wait:'继续等待'};
}
