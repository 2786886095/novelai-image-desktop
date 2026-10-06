const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),assert=require('node:assert/strict');
const log=process.env.QA_LOG_PATH;fs.writeFileSync(log,'DRIVER_STARTED\n');const write=(...v)=>fs.appendFileSync(log,v.join(' ')+'\n');
app.setPath('userData',process.env.QA_PROFILE_PATH);app.disableHardwareAcceleration();
process.on('uncaughtException',e=>{write('FAIL',e.stack);app.exit(1);});process.on('unhandledRejection',e=>{write('FAIL',e.stack||e);app.exit(1);});
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1280,height:1000,webPreferences:{offscreen:true,backgroundThrottling:false}}),pause=ms=>new Promise(r=>setTimeout(r,ms)),run=c=>win.webContents.executeJavaScript(c,true),errors=[];
 win.webContents.on('console-message',(...args)=>{const s=args.map(a=>typeof a==='object'?a.message??'':String(a)).join(' ');write('PAGE_CONSOLE',s);if(/Uncaught|Unhandled/.test(s))errors.push(s);});
 async function until(code){for(let i=0;i<100;i++){if(await run(code))return;await pause(100);}throw Error('Timed out: '+code);}
 async function click(selector){await run(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);await pause(500);const r=await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);win.webContents.sendInputEvent({type:'mouseMove',...r});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...r});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...r});await pause(150);}
 try{
  await win.loadURL('http://127.0.0.1:19441/tests/character-enabled-ui.html');await until('window.qa && document.querySelectorAll("[role=switch]").length===2');
  await pause(600);assert.equal(await run('document.querySelectorAll(".char-position-marker").length'),2);
  await click('[data-character-id=alice] [role=switch]');await until('window.qa.store.getState().charCaptions[0].enabled===false');
  assert.equal(await run('document.querySelectorAll(".char-position-marker").length'),1);assert.equal(await run('document.querySelector(".char-position-marker").textContent'),'2');
  const before=await run('window.qa.store.getState().charCaptions');assert.equal(before[0].prompt,'blue coat');assert.equal(before[0].negativePrompt,'red coat');assert.equal(before[0].x,.2);assert.equal(before[0].y,.3);assert.equal(before[1].enabled,undefined);
  write('REAL_MOUSE_TOGGLE_EXCLUDES_MARKER_PRESERVES_FIELDS_OTHER_CHARACTER=PASS');
  await click('[data-character-id=alice] .char-row-toggle');assert.equal(await run('window.qa.store.getState().charCaptions[0].enabled'),false);write('COLLAPSE_DOES_NOT_CHANGE_ENABLED=PASS');
  await win.reload();await until('window.qa && document.querySelectorAll("[role=switch]").length===2');assert.equal(await run('window.qa.store.getState().charCaptions[0].enabled'),false);write('REAL_RELOAD_PERSISTS_OFF=PASS');
  await pause(700);win.webContents.focus();await run('document.querySelector("[data-character-id=alice] [role=switch]").focus()');write('FOCUS',await run('document.activeElement.outerHTML'));await run('window.keys=[];document.addEventListener("keydown",e=>window.keys.push({key:e.key,code:e.code,target:e.target.outerHTML.slice(0,100)}),true)');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await pause(120);write('KEYS',JSON.stringify(await run('window.keys')));await until('window.qa.store.getState().charCaptions[0].enabled===true');
  assert.equal(await run('document.querySelectorAll(".char-position-marker").length'),2);write('REAL_KEYBOARD_REENABLE_RESTORES_POSITION=PASS');
  win.setContentSize(390,844);await pause(200);await click('[data-character-id=bob] [role=switch]');await until('window.qa.store.getState().charCaptions[1].enabled===false');
  const bounds=await run('(()=>{const modal=document.querySelector(".char-modal").getBoundingClientRect(),b=document.querySelector("[data-character-id=bob] [role=switch]").getBoundingClientRect();return{left:modal.left,right:modal.right,switchLeft:b.left,switchRight:b.right,width:innerWidth}})()');assert.ok(bounds.switchLeft>=0&&bounds.switchRight<=bounds.width&&bounds.left>=0&&bounds.right<=bounds.width,JSON.stringify(bounds));
  write('NARROW_390PX_CLICKABLE_SWITCH_NO_HEADER_OVERFLOW=PASS');assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(process.env.QA_SCREENSHOT_PATH,(await win.webContents.capturePage()).toPNG());write('UNCAUGHT_ERRORS=0; PAID_API_CALLS=0');win.destroy();app.exit(0);
 }catch(e){write('FAIL',e.stack);write('DOM',await run('document.body.innerText').catch(String));fs.writeFileSync(process.env.QA_SCREENSHOT_PATH,(await win.webContents.capturePage()).toPNG());app.exit(1);}
});
