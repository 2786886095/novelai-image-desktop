// Verify the final Electron application, not a development font alias or mock UI.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),net=require('node:net'),crypto=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const binary=path.resolve(process.argv[2]||'release/win-unpacked/Langbai NovelAI Studio.exe'),asar=path.join(path.dirname(binary),'resources/app.asar'),out=path.resolve('release/packaged-smoke/fonts-'+Date.now());
fs.mkdirSync(out,{recursive:true});const catalog=JSON.parse(fs.readFileSync('public/ui-fonts/catalog.json'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));let child,ws;const pending=new Map();let id=0;
const evidence={event:'actual_packaged_chromium_font_check',version:'2.5.3',binary,isolatedProfile:path.join(out,'profile'),fonts:[],externalFontRequests:[],paidCalls:0,pass:false};
const command=[binary,path.resolve('scripts/packaged-font-assets-probe.cjs'),asar,process.cwd()];
const assets=spawnSync(command[0],command.slice(1),{encoding:'utf8',windowsHide:true,timeout:90000,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
evidence.assetCommand={command,stdout:assets.stdout,stderr:assets.stderr,exitStatus:assets.status,error:assets.error?.message};
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(evidence,null,2));
assert.equal(assets.status,0,assets.stderr||assets.error?.message);process.stdout.write(assets.stdout);
const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;const t=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method));},20000);pending.set(key,{resolve:r=>{clearTimeout(t);resolve(r)},reject:e=>{clearTimeout(t);reject(e)}});ws.send(JSON.stringify({id:key,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
(async()=>{try{
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 const env={...process.env,NAI_UI_CAPTURE_USER_DATA:evidence.isolatedProfile};delete env.ELECTRON_RUN_AS_NODE;delete env.NAI_UI_CAPTURE_PATH;delete env.VITE_DEV_SERVER_URL;
 child=spawn(binary,['--disable-gpu','--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b;evidence.childStdout=stdout});child.stderr.on('data',b=>{stderr+=b;evidence.childStderr=stderr});
 let target;for(let n=0;n<160;n++){if(child.exitCode!==null)throw Error('Packaged application exited '+child.exitCode+' '+stderr);try{const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();evidence.lastTargets=targets;target=targets.find(t=>t.type==='page'&&t.webSocketDebuggerUrl);if(target)break;}catch(e){evidence.lastConnectionError=String(e)}await pause(250);}assert.ok(target,'Packaged renderer unavailable');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);}if(m.method==='Network.requestWillBeSent'){const u=m.params.request.url;if(/\.(?:ttf|otf|woff2?)(?:$|\?)/i.test(u)&&/^https?:/i.test(u))evidence.externalFontRequests.push(u);}});
 await send('Runtime.enable');await send('DOM.enable');await send('CSS.enable');await send('Network.enable');
 for(let n=0;n<120;n++){if(await evaluate('!!document.querySelector(".app-shell") && !!window.naiDesktop'))break;await pause(250);}assert.equal(await evaluate('!!document.querySelector(".app-shell")'),true);
 await evaluate('(()=>{const b=[...document.querySelectorAll("button")].find(x=>x.textContent.includes("跳过向导"));if(b)b.click()})()');await pause(500);
 assert.deepEqual(await evaluate('(async()=>{const s=await window.naiDesktop.getSettings();return s.uiTypography})()'),{font:'default',scale:100});
 for(const f of catalog){
  await evaluate(`window.naiDesktop.setSetting('uiTypography',{font:${JSON.stringify(f.id)},scale:200})`);await send('Page.reload');
  let ready=false;for(let n=0;n<100;n++){try{ready=await evaluate(`document.documentElement.dataset.uiTextScale==='200' && getComputedStyle(document.body).fontFamily.includes(${JSON.stringify('Studio-'+f.id)})`);if(ready)break;}catch{}await pause(200);}assert.ok(ready,'Global font not applied '+f.id);
  await evaluate(`(async()=>{await document.fonts.load('26px "Studio-${f.id}"');await document.fonts.ready;const e=document.createElement('p');e.id='qa-packaged-font';e.textContent='春风花月山水画师角色提示词生成预览字体设置';Object.assign(e.style,{position:'fixed',top:'180px',left:'24px',margin:'0',zIndex:'999999',background:'white'});document.body.append(e);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`);
  const {root}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#qa-packaged-font'});let faces=[];for(let n=0;n<30;n++){faces=(await send('CSS.getPlatformFontsForNode',{nodeId})).fonts;if(faces.some(x=>x.isCustomFont&&x.glyphCount===21))break;await pause(100)}
  assert.ok(faces.some(x=>x.isCustomFont&&x.glyphCount===21),JSON.stringify({id:f.id,faces}));
  assert.equal((await evaluate('window.naiDesktop.getSettings()')).uiTypography.font,f.id);
  const bounds=await evaluate('(()=>{const r=document.querySelector("#qa-packaged-font").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()');
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:bounds});const bytes=Buffer.from(shot.data,'base64');fs.writeFileSync(path.join(out,f.id+'.png'),bytes);
  const layout=await evaluate('({pageOverflow:document.documentElement.scrollWidth>innerWidth+1,bodyFont:parseFloat(getComputedStyle(document.body).fontSize),navFont:parseFloat(getComputedStyle(document.querySelector(".tab-bar button")).fontSize)})');assert.equal(layout.pageOverflow,false);assert.equal(layout.bodyFont,26);assert.ok(layout.navFont<20);
  evidence.fonts.push({id:f.id,faces,reloadPersisted:true,screenshotSha256:crypto.createHash('sha256').update(bytes).digest('hex'),layout});
 }
 assert.equal(new Set(evidence.fonts.map(x=>x.screenshotSha256)).size,6);assert.equal(evidence.externalFontRequests.length,0);evidence.pass=true;
 evidence.childStdout=stdout;evidence.childStderr=stderr;console.log(JSON.stringify(evidence));
 await send('Browser.close').catch(()=>{});
}finally{
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(evidence,null,2));if(ws)ws.close();if(child&&child.exitCode===null)child.kill();
}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
