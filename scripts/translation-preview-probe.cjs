const fs=require('node:fs'),path=require('node:path');
const {app,BrowserWindow}=require('electron');
const [port,root,reportFile]=process.argv.slice(2);
if(!/^\d+$/.test(port))throw Error('Invalid loopback port');
app.setPath('userData',path.join(path.dirname(reportFile),'profile'));
app.commandLine.appendSwitch('no-error-dialogs');
let win;
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1200,height:1000,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 await win.loadURL('http://127.0.0.1:'+port+'/__translation_regression__');
 const errors=[];win.webContents.on('console-message',(_e,...args)=>{if(String(args).includes('Error'))errors.push(String(args));});
 await win.webContents.executeJavaScript(`(async()=>{
  await import('/src/styles.css');await import('/src/prompt-editor.css');
  const {React,createRoot,TranslationPreview,useAppStore}=await import('/scripts/translation-preview-test-entry.tsx');
  const reactRoot=createRoot(document.getElementById('fixture'));
  let settings,value,closed=false,resolveReply,failSave=false,apiCalls=[];
  window.naiDesktop={
   translate:async(source,target,from)=>{apiCalls.push({source,target,from});return new Promise(resolve=>resolveReply=resolve);},
   setSetting:async(key,next)=>{if(failSave)throw Error('fixture setting save failed');settings={...settings,[key]:next};return next;},
   getSettings:async()=>settings,
  };
  window.fixture={
   tick:()=>new Promise(r=>setTimeout(r,80)),
   reset(from='en'){settings={language:'zh-CN',translateSourceLanguage:from,translateTargetLanguage:'zh-CN',translateRealtime:false,reduceMotion:true};useAppStore.setState({settings});value='black jacket';closed=false;apiCalls=[];failSave=false;},
   mount(){closed=false;reactRoot.render(React.createElement(TranslationPreview,{currentValue:value,context:'fixture-prompt',language:'zh-CN',onApply:(next,expected)=>{if(value!==expected)return false;value=next;return true;},onClose:()=>{closed=true;reactRoot.render(null);}}));},
   close(){reactRoot.render(null);},
   click(text){const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text);if(!button)throw Error('Missing button: '+text);button.click();},
   resolve(reply){if(!resolveReply)throw Error('No in-flight fixture reply');const r=resolveReply;resolveReply=undefined;r(reply);},
   rects(){return [...document.querySelectorAll('.translation-preview-columns textarea,.translation-preview-dialog footer')].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});},
   state(){return {settings,value,closed,apiCalls:[...apiCalls]};},
   failSave(){failSave=true;},
   swap(){document.querySelector('.translation-swap-button').click();},
   scale(scale){document.documentElement.style.fontSize=(16*scale)+'px';document.body.style.fontSize=(14*scale)+'px';document.body.classList.add('motion-reduced');},
  };
 })()`);
 const cases=[];
 const js=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()');
 for(const width of [390,1200])for(const scale of [1,1.5]){
  win.setSize(width,1000);
  const result=await js(`fixture.close();await fixture.tick();fixture.scale(${scale});fixture.reset();fixture.mount();await fixture.tick();await fixture.tick();const idle=fixture.rects();fixture.click('翻译');await fixture.tick();const busy=fixture.rects();fixture.resolve({ok:false,error:'fixture very long translation error. '.repeat(20)});await fixture.tick();const failed=fixture.rects();return {idle,busy,failed,pass:JSON.stringify(idle)===JSON.stringify(busy)&&JSON.stringify(idle)===JSON.stringify(failed)};`);
  cases.push({name:'#71 status geometry '+width+' scale '+scale,...result});
  const success=await js(`fixture.close();await fixture.tick();fixture.reset();fixture.mount();await fixture.tick();const idle=fixture.rects();fixture.click('翻译');await fixture.tick();const busy=fixture.rects();fixture.resolve({ok:true,text:'黑色夹克',sourceLanguage:'en'});await fixture.tick();const completed=fixture.rects();return {idle,busy,completed,pass:JSON.stringify(idle)===JSON.stringify(busy)&&JSON.stringify(idle)===JSON.stringify(completed)};`);
  cases.push({name:'#71 completed geometry '+width+' scale '+scale,...success});
 }
 win.setSize(1200,1000);
 for(const from of ['en','auto']){
  const result=await js(`fixture.close();await fixture.tick();fixture.scale(1);fixture.reset('${from}');fixture.mount();await fixture.tick();fixture.click('翻译');await fixture.tick();fixture.resolve({ok:true,text:'黑色夹克',sourceLanguage:'en'});await fixture.tick();fixture.swap();await fixture.tick();fixture.click('应用译文');await fixture.tick();await fixture.tick();fixture.mount();await fixture.tick();const s=fixture.state();return {...s,pass:s.value==='black jacket'&&s.settings.translateSourceLanguage==='en'&&s.settings.translateTargetLanguage==='zh-CN'&&s.apiCalls.length===1};`);
  cases.push({name:'#70 apply/swap/reopen '+from,...result});
 }
 const save=await js(`fixture.close();await fixture.tick();fixture.reset();fixture.mount();await fixture.tick();fixture.click('翻译');await fixture.tick();fixture.resolve({ok:true,text:'黑色夹克',sourceLanguage:'en'});await fixture.tick();fixture.failSave();fixture.click('应用译文');await fixture.tick();await fixture.tick();const s=fixture.state();return {...s,pass:!s.closed&&s.value==='black jacket'&&document.body.textContent.includes('fixture setting save failed')};`);
 cases.push({name:'#70 failed preference save never applies parent',...save});
 const cancel=await js(`fixture.close();await fixture.tick();fixture.reset();fixture.mount();await fixture.tick();fixture.click('翻译');await fixture.tick();fixture.resolve({ok:true,text:'黑色夹克',sourceLanguage:'en'});await fixture.tick();fixture.click('取消');await fixture.tick();const s=fixture.state();return {...s,pass:s.closed&&s.value==='black jacket'&&s.settings.translateSourceLanguage==='en'&&s.settings.translateTargetLanguage==='zh-CN'};`);
 cases.push({name:'cancel preserves input/preferences',...cancel});
 const report={cases,total:cases.length,passed:cases.filter(c=>c.pass).length,platform:process.platform,paidCalls:0,nodeIntegration:false,sandbox:true,errors};
 fs.writeFileSync(reportFile,JSON.stringify(report,null,2));console.log('TRANSLATION_UI_REPORT '+JSON.stringify(report));win.destroy();app.exit(report.passed===report.total?0:1);
}).catch(e=>{console.error(e.stack??e);if(win)win.destroy();app.exit(1);});
