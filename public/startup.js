/* Independent of the large application module graph: never reads credentials or resets storage. */
(()=>{
 const host=document.getElementById('studio-startup');if(!host)return;
 const rows={
  'zh-CN':['正在启动 Langbai NovelAI Studio','正在加载界面，请稍候。','加载时间较长或界面加载失败。可以重试；不会清除账号、设置或图片。','重新加载界面'],
  'zh-TW':['正在啟動 Langbai NovelAI Studio','正在載入介面，請稍候。','載入時間過長或介面載入失敗。可以重試；不會清除帳戶、設定或圖片。','重新載入介面'],
  en:['Starting Langbai NovelAI Studio','Loading the interface. Please wait.','Loading is taking longer than expected or the interface failed. Retry does not clear accounts, settings or images.','Reload interface'],
  ja:['Langbai NovelAI Studio を起動中','画面を読み込んでいます。','読込に時間がかかっているか、失敗しました。再読込してもアカウント・設定・画像は消去されません。','画面を再読込'],
  ko:['Langbai NovelAI Studio 시작 중','화면을 불러오고 있습니다.','시작이 지연되거나 실패했습니다. 다시 불러와도 계정·설정·이미지는 삭제되지 않습니다.','화면 다시 불러오기']
 };
 const language=navigator.language||'zh-CN';const text=rows[language]||rows[language.split('-')[0]]||rows.en;
 const title=host.querySelector('h1'),message=host.querySelector('p'),retry=host.querySelector('button');
 title.textContent=text[0];message.textContent=text[1];retry.textContent=text[3];let finished=false;
 function delayed(){if(!finished){message.textContent=text[2];retry.hidden=false;}}
 const timer=setTimeout(delayed,12000);
 retry.addEventListener('click',()=>window.location.reload());
 function ready(){if(finished)return;finished=true;clearTimeout(timer);host.remove();window.removeEventListener('error',delayed,true);window.removeEventListener('unhandledrejection',delayed);}
 window.addEventListener('error',delayed,true);window.addEventListener('unhandledrejection',delayed);window.addEventListener('studio:renderer-ready',ready,{once:true});
})();
