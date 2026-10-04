const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const logPath=process.env.QA_SCREENSHOT_PATH+'.log';fs.writeFileSync(logPath,'DRIVER_STARTED\n');
console.log=(...a)=>fs.appendFileSync(logPath,a.join(' ')+'\n');console.error=console.log;
process.on('uncaughtException',e=>{console.log('UNCAUGHT',e.stack);app.exit(1)});process.on('unhandledRejection',e=>{console.log('UNHANDLED',e.stack??e);app.exit(1)});
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{contextIsolation:true,offscreen:true,backgroundThrottling:false}});
  const errors=[];win.webContents.on('console-message',(_e,...args)=>{if(String(args).includes('Uncaught'))errors.push(args.join(' '));});
  const exec=async code=>{try{return await win.webContents.executeJavaScript(code,true);}catch(e){console.log("FAILED_SCRIPT",code);throw e;}};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  async function until(code){for(let i=0;i<100;i++){if(await exec(code))return;await wait(100);}throw Error('Timed out: '+code);}
  const click=selector=>exec(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const textButton=(scope,label)=>exec(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(scope+' button')})].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing button '+${JSON.stringify(label)});b.click()})()`);
  try{
    await win.loadURL('http://127.0.0.1:19437/tests/issues35-37-ui.html');
    await until('!!document.querySelector(".pi-composer button")');
    assert.equal(await exec('document.querySelector(".pi-composer button").disabled'),false);
    await click('.pi-composer button');await until('window.qa.receipts.length===1');
    assert.equal(await exec('window.qa.workspace.conversations[0].status'),'running');
    assert.equal(await exec('window.qa.workspace.conversations[0].messages[0].content'),'Actual stream in progress');
    const transfer=(type,target,name,body)=>exec(`(()=>{const d=new DataTransfer();d.items.add(new File([${JSON.stringify(body)}],${JSON.stringify(name)},{type:'text/plain'}));const e=new ${type==='paste'?'ClipboardEvent':'DragEvent'}(${JSON.stringify(type)},{bubbles:true,cancelable:true,${type==='paste'?'clipboardData':'dataTransfer'}:d});document.querySelector(${JSON.stringify(target)}).dispatchEvent(e);return e.defaultPrevented})()`);
    assert.equal(await transfer('paste','.pi-composer textarea','paste.txt','paste receipt'),true);
    await until('window.qa.receipts.length===2');
    assert.equal(await transfer('drop','.pi-compose-area','drop.md','drop receipt'),true);
    await until('window.qa.receipts.length===3');
    assert.deepEqual(await exec('window.qa.receipts.map(x=>x.name)'),['picker.txt','paste.txt','drop.md']);
    assert.equal(await exec('new TextDecoder().decode(new Uint8Array(window.qa.receipts[2].bytes))'),'drop receipt');
    assert.equal(await exec(`(()=>{const d=new DataTransfer();d.setData('text/plain','plain text stays text');const e=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d});document.querySelector('.pi-composer textarea').dispatchEvent(e);return e.defaultPrevented})()`),false);
    console.log('UI_REPLY_UPLOAD=PASS; UI_PASTE_DROP_BYTES=PASS; TEXT_PASTE_UNINTERCEPTED=PASS');
    await exec('window.qa.finish()');await until('!document.querySelector(".pi-sidebar-footer button").disabled');
    await click('.pi-sidebar-footer button');await until('!!document.querySelector(".pi-model-collection")');
    await textButton('.pi-model-collection','加载可用模型');await until('document.querySelectorAll(".pi-model-discovery-list input").length===80');
    const height=await exec('document.querySelector(".pi-model-discovery-list").getBoundingClientRect().height');assert.ok(height<=400,height);
    await click('.pi-model-discovery-list input');await until('document.querySelectorAll(".pi-saved-model").length===2');
    const setInput=(selector,value)=>exec(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await setInput('.pi-saved-model:last-child input[type=number]','96000');
    await textButton('.pi-saved-model:last-child','Very long model 0 '+('long-id/'.repeat(15)));
    // SelectMenuCompat is a custom menu; select its explicit high-effort item.
    await exec(`(()=>{const row=document.querySelector('.pi-saved-model:last-child');const b=row.querySelector('.select-menu-trigger');if(!b)throw Error('Missing effort combobox');b.click()})()`);
    await until('!![...document.querySelectorAll("[role=option]")].find(e=>e.textContent.trim()==="高")');
    await exec(`([...document.querySelectorAll('[role=option]')].find(e=>e.textContent.trim()==='高')).click()`);
    await textButton('[role=dialog]','保存');await until('!document.querySelector(".pi-model-collection")');
    assert.equal(await exec('window.qa.settings.agentApiModel'),'owned-model-0');
    assert.equal(await exec('window.qa.settings.agentContextWindow'),96000);
    assert.equal(await exec('window.qa.settings.agentReasoningEffort'),'high');
    await click('.pi-model-chip');await until('!!document.querySelector(".pi-model-list")');
    assert.equal(await exec('document.querySelectorAll(".pi-model-list>button").length'),2);
    console.log('UI_MODEL_LIST_BOUNDED=PASS; UI_ONLY_SELECTED_MODELS=PASS; MODEL_CONTEXT_EFFORT_SAVE=PASS');
    await wait(500);
    if(process.env.QA_SCREENSHOT_PATH)fs.writeFileSync(process.env.QA_SCREENSHOT_PATH,(await win.webContents.capturePage()).toPNG());
    assert.deepEqual(errors,[]);console.log('RENDERER_UNCAUGHT_ERRORS=0');win.destroy();app.exit(0);
  }catch(error){console.error(error.stack);console.log(await exec('document.body.innerText').catch(()=>''));win.destroy();app.exit(1);}
});
