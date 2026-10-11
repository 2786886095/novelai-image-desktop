const fs=require('fs'),path=require('path'),net=require('net'),assert=require('assert/strict'),{spawn}=require('child_process');
const S=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),D=__dirname;
const binary=require('node:module').createRequire(path.join(S,'package.json'))('electron');
const evidence={source:S,fixture:'neutral long records in isolated actual app',paidCalls:0,layouts:[],pass:false};
const pause=ms=>new Promise(r=>setTimeout(r,ms));let child,main,renderer,stdout='',stderr='';
const port=async()=>{const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const connect=async(p,type)=>{let target;for(let i=0;i<300;i++){try{const list=await(await fetch('http://127.0.0.1:'+p+'/json/list')).json();target=type?list.find(t=>t.type===type):list[0];if(target?.webSocketDebuggerUrl)break;}catch{}await pause(100);}assert.ok(target?.webSocketDebuggerUrl,'debug endpoint');const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});let id=0;const pending=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data),entry=pending.get(m.id);if(entry){pending.delete(m.id);m.error?entry.reject(Error(JSON.stringify(m.error))):entry.resolve(m.result);}});const send=(method,params={})=>new Promise((resolve,reject)=>{const k=++id,t=setTimeout(()=>reject(Error('CDP timeout '+method)),15000);pending.set(k,{resolve:v=>{clearTimeout(t);resolve(v);},reject:e=>{clearTimeout(t);reject(e);}});ws.send(JSON.stringify({id:k,method,params}));});return{ws,send,eval:async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}};};
(async()=>{try{
 const cdp=await port(),inspect=await port();const env={...process.env,NAI_UI_CAPTURE_USER_DATA:fs.mkdtempSync(path.join(D,'ui-profile-')),NAI_UI_CAPTURE_PATH:path.join(D,'01-generate-offscreen-'+Date.now()+'.png')};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
 child=spawn(binary,[path.join(D,'fixture-app.cjs'),S,'--disable-gpu','--inspect=127.0.0.1:'+inspect,'--remote-debugging-address=127.0.0.1','--remote-debugging-port='+cdp],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 main=await connect(inspect);renderer=await connect(cdp,'page');
 const wait=async expression=>{for(let i=0;i<220;i++){try{if(await renderer.eval(expression))return;}catch{}await pause(80);}throw Error('Wait failed: '+expression);};
 await wait('!!window.naiDesktop && !!document.querySelector(".tab-bar")');
 await main.eval(`(()=>{const ipc=process.getBuiltinModule('module').createRequire(process.execPath)('electron').ipcMain;const line=Array.from({length:160},(_,i)=>'Neutral record line '+i+' about a blue coat and a tree.').join('\\n');ipc.removeHandler('ai:getLog');ipc.handle('ai:getLog',()=>Array.from({length:24},(_,i)=>({id:'neutral-'+i,time:1700000000000+i,label:'Neutral fixture '+i,api:'convert',model:'fixture-model',ok:i%2===0,systemPrompt:line,userText:line,response:line})));return true})()`);
 await renderer.send('Emulation.setDeviceMetricsOverride',{width:1385,height:900,deviceScaleFactor:1,mobile:false});await pause(300);
 assert.equal(await renderer.eval(`(()=>{const b=document.querySelector('.tab-bar button[data-tab="records"]');if(!b)return false;b.click();return true})()`),true);
  evidence.bridgeCount=await renderer.eval('(async()=> (await window.naiDesktop.getAiCallLog()).length)()');
  await pause(600);
  evidence.afterClick=await renderer.eval('({active:[...document.querySelectorAll(".tab-bar button")].filter(b=>b.classList.contains("active")).map(b=>b.textContent),panel:!!document.querySelector(".ai-log-panel"),count:document.querySelectorAll(".ai-log-item-head").length,visibleText:document.querySelector(".workspace")?.innerText.slice(0,500)})');
  await wait('document.querySelectorAll(".ai-log-item-head").length===24');
 await renderer.eval('document.querySelector(".ai-log-item-head").click()');await pause(600);
 for(const [width,height,scale] of [[1385,900,100],[900,700,200],[390,844,200]]){
  await renderer.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await renderer.eval(`window.naiDesktop.setSetting('uiTypography',{font:'default',scale:${scale}})`);
  // IPC writes preferences; production settings UI explicitly refreshes its
  // React store. Reload here to exercise normal startup loading, not a fake CSS scale.
  const recordsUrl=await renderer.eval(`(()=>{const u=new URL(location.href);u.searchParams.set('uiCapture','records');return u.href;})()`);
  await renderer.send('Page.navigate',{url:recordsUrl});await wait(`!!window.naiDesktop&&document.documentElement.dataset.uiTextScale===String(${scale})&&document.querySelectorAll('.ai-log-item-head').length===24`);
  await renderer.eval('document.querySelector(".ai-log-item-head").click()');await pause(600);
  await renderer.eval('(()=>{const p=document.querySelector(".ai-log-panel");p.scrollTop=0;for(const e of p.querySelectorAll("pre"))e.scrollTop=0;})()');
  const before=await renderer.eval('(()=>{const p=document.querySelector(".ai-log-panel"),r=p.getBoundingClientRect(),host=p.parentElement.getBoundingClientRect();return {top:r.top,bottom:r.bottom,hostBottom:host.bottom,client:p.clientHeight,scroll:p.scrollHeight,x:Math.max(30,r.left+8),y:Math.min(innerHeight-60,r.top+25)}})()');
  await renderer.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:before.x,y:before.y,deltaX:0,deltaY:500});await pause(400);
  const wheel=await renderer.eval('document.querySelector(".ai-log-panel").scrollTop');
  const end=await renderer.eval('(()=>{const p=document.querySelector(".ai-log-panel");p.scrollTop=p.scrollHeight;const r=p.getBoundingClientRect(),last=p.querySelector(".ai-log-item:last-child").getBoundingClientRect();return {scrollTop:p.scrollTop,lastVisible:last.bottom<=r.bottom+1}})()');
  const entry={width,height,scale,...before,wheel,atEnd:end.scrollTop,lastVisible:end.lastVisible,panelFits:before.bottom<=before.hostBottom+1,canScroll:wheel>0&&end.lastVisible};evidence.layouts.push(entry);
  // This test window is deliberately hidden. Verify native wheel/DOM behavior;
  // do not require Chromium to produce a compositor screenshot while hidden.
 }
 // A long text field retains its own scrolling and does not require the page to grow.
 await renderer.send('Emulation.setDeviceMetricsOverride',{width:1385,height:900,deviceScaleFactor:1,mobile:false});await renderer.eval("window.naiDesktop.setSetting('uiTypography',{font:'default',scale:100})");await pause(250);
 evidence.fieldScroll=await renderer.eval('(()=>{const p=document.querySelector(".ai-log-panel");p.scrollTop=0;const f=p.querySelector("pre");f.scrollTop=f.scrollHeight;return f.scrollTop>0;})()');
 // Exercise the actual Works UI and native IPC on 65 neutral fixture images.
 await main.eval(`(()=>{const req=process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(S,'package.json'))}),fs=req('fs'),path=req('path'),store=req('./dist-electron/electron/ipc/store.js'),types=req('./dist-electron/src/types.js');const root=path.join(process.getBuiltinModule('module').createRequire(process.execPath)('electron').app.getPath('userData'),'neutral-works');fs.mkdirSync(path.join(root,'2026-10-10'),{recursive:true});const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');const items=Array.from({length:65},(_,i)=>{const file=path.join(root,'2026-10-10','neutral-'+i+'.png');fs.writeFileSync(file,png);return{id:'neutral-work-'+i,filePath:file,fileUrl:'',date:'2026-10-10',createdAt:new Date(1700000000000+i*1000).toISOString(),params:types.DEFAULT_PARAMS,actualSeed:i,model:'nai-diffusion-4-5-full',width:1,height:1,groupId:'a'};});store.writeStore({...store.readStore(),history:items,historyGroups:[{id:'a',name:'Group A',createdAt:'2026-10-10'},{id:'b',name:'Group B',createdAt:'2026-10-10'}],settings:{...store.getSettings(),outputDir:root,uiTypography:{font:'default',scale:100}}});return true;})()`);
 const worksUrl=await renderer.eval(`(()=>{const u=new URL(location.href);u.searchParams.set('uiCapture','works');return u.href;})()`);
 await renderer.send('Page.navigate',{url:worksUrl});await wait(`document.querySelectorAll('.works-tile').length===60&&document.documentElement.dataset.uiTextScale==='100'`);
 const nativeCount=async()=>main.eval(`process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(S,'package.json'))})('./dist-electron/electron/ipc/store.js').readStore().history.length`);
 evidence.works={before:await nativeCount(),batchEntry:false,move:false,cancel:false,delete:false,externalDelete:false};
 const button=async(selector,text)=>renderer.eval(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true;})()`);
 evidence.works.batchEntry=await button('.works-actions button','批量编辑');
 if(evidence.works.batchEntry){
  await wait(`!!document.querySelector('.works-batch-controls')`);
  await renderer.eval(`(()=>{const c=[...document.querySelectorAll('.works-tile-caption input')];c[0].click();c[1].click();})()`);
  await renderer.eval(`document.querySelector('.works-batch-controls .select-menu-trigger').click()`);await wait(`!!document.querySelector('[role=listbox]')`);
  assert.equal(await button('[role=option]','Group B'),true);assert.equal(await button('.works-batch-controls button','移动所选'),true);
  await pause(800);
  evidence.works.move=await main.eval(`(()=>{const req=process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(S,'package.json'))}),store=req('./dist-electron/electron/ipc/store.js');return store.readStore().history.filter(i=>i.groupId==='b').length===2&&store.readStore().history.length===65;})()`);
  await renderer.eval(`(()=>{const c=[...document.querySelectorAll('.works-tile-caption input')];c[0].click();c[1].click();})()`);
  assert.equal(await button('.works-batch-controls button','删除所选'),true);await wait(`!!document.querySelector('.app-confirm-dialog')`);
  await renderer.eval(`document.querySelector('.app-confirm-dialog [data-result=cancel]').click()`);await pause(300);evidence.works.cancel=(await nativeCount())===65;
  assert.equal(await button('.works-batch-controls button','删除所选'),true);await wait(`!!document.querySelector('.app-confirm-dialog')`);
  await renderer.eval(`document.querySelector('.app-confirm-dialog [data-result=confirm]').click()`);await pause(1200);
  evidence.works.delete=(await nativeCount())===63;
 }
 evidence.works.beforeExternal=await nativeCount();
 await wait(`document.querySelector('.works-thumbnail img')?.complete&&document.querySelector('.works-thumbnail img')?.naturalWidth>0`);
 const firstFile=await renderer.eval(`document.querySelector('.works-tile-caption span').title`);
 await main.eval(`process.getBuiltinModule('fs').unlinkSync(${JSON.stringify(firstFile)})`);
 // Cached img stays decoded: the new active-page disk check must refresh it.
 await pause(11_500);
 const shown=await renderer.eval(`parseInt(document.querySelector('.works-count').textContent,10)`);
 evidence.works.afterExternal=await nativeCount();evidence.works.shown=shown;
 evidence.works.externalDelete=shown===evidence.works.beforeExternal-1&&evidence.works.afterExternal===shown;
 evidence.works.layouts=[];
 if(evidence.works.batchEntry){for(const [width,height,scale] of [[1385,900,100],[900,700,200],[390,844,200]]){
  await renderer.eval(`window.naiDesktop.setSetting('uiTypography',{font:'default',scale:${scale}})`);await renderer.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await renderer.send('Page.navigate',{url:worksUrl});await wait(`document.documentElement.dataset.uiTextScale===String(${scale})&&!!document.querySelector('.works-library')`);await button('.works-actions button','批量编辑');await wait(`!!document.querySelector('.works-batch-controls')`);await pause(200);
  const fit=await renderer.eval(`(()=>{const p=document.querySelector('.works-library');return [...p.querySelectorAll('.works-batch-controls button')].every(e=>{const r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;});})()`);evidence.works.layouts.push({width,height,scale,noHorizontalOverflow:fit});
 }}
 evidence.works.pass=['batchEntry','move','cancel','delete','externalDelete'].every(k=>evidence.works[k])&&evidence.works.layouts.every(e=>e.noHorizontalOverflow);
 evidence.pass=evidence.layouts.every(e=>e.panelFits&&e.canScroll)&&evidence.fieldScroll&&evidence.works.pass;console.log(JSON.stringify({pass:evidence.pass,layouts:evidence.layouts,fieldScroll:evidence.fieldScroll,works:evidence.works}));
}catch(error){evidence.error=error.stack;console.error(error.stack);try{evidence.debug=await renderer?.eval('({scale:document.documentElement.dataset.uiTextScale,text:document.body.innerText.slice(0,250),url:location.href,recordsButton:!!document.querySelector(".tab-bar button[data-tab=records]")})');console.error(JSON.stringify(evidence.debug));}catch{}}finally{evidence.stdout=stdout;evidence.stderr=stderr;fs.writeFileSync(out,JSON.stringify(evidence,null,2));renderer?.ws.close();main?.ws.close();if(child&&child.exitCode===null)child.kill();}})().then(()=>{process.exitCode=evidence.pass?0:1;}).catch(error=>{console.error(error);process.exitCode=1;});
