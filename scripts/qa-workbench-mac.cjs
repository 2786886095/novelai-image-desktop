const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const src=process.cwd(),out=process.env.QA_OUT||__dirname;fs.mkdirSync(out,{recursive:true});process.env.NAI_UI_CAPTURE_USER_DATA=path.join(out,'isolated-draw-profile');app.setAppPath(src);
const nap=n=>new Promise(r=>setTimeout(r,n)),rows=[];const log=x=>{rows.push(x);fs.writeFileSync(path.join(out,'native.log'),rows.join('\n'))};
async function run(){let wc;for(let i=0;i<100;i++){wc=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'))?.webContents;if(wc)break;await nap(170)}assert(wc);await nap(900);
const js=(fn,...a)=>wc.executeJavaScript('('+fn+')(...'+JSON.stringify(a)+')',true);
const wait=async(fn,...a)=>{for(let i=0;i<160;i++){if(await js(fn,...a))return;await nap(100)}throw Error('timeout '+fn+' / '+(await js(()=>document.body.innerText.slice(0,400))))};
const click=async(sel)=>{await wait(s=>document.querySelector(s),sel);await js(s=>{const b=document.querySelector(s);b.scrollIntoView({block:'center'});b.click()},sel);await nap(240)};
for(const layout of ['classic','redesign']){
await js(l=>{localStorage.setItem('langbai.desktop-layout.v1',l);localStorage.setItem('langbai.desktop-layout-intro.v1','1')},layout);
const u=new URL(wc.getURL());u.searchParams.set('uiCapture','artistStringDraw');await wc.loadURL(u.href);wc.setZoomFactor(.6);await wait(()=>document.querySelector('[data-testid="draw-roles"]'));
const root='[data-testid="draw-roles"]';assert.equal(await js(s=>document.querySelector(s+' input').checked,root),false);
await click(root+' input');await click(root+' button');await wait(()=>document.querySelector('.char-modal'));log(layout+' opened normal role editor');
await js(()=>{const b=[...document.querySelectorAll('.char-modal button')].find(b=>/添加角色|新增角色|Add Character|Add character/.test(b.textContent+' '+b.title));if(!b)throw Error('add unavailable: '+document.querySelector('.char-modal').innerText.slice(-450));b.click()});await wait(()=>document.querySelector('.char-modal [data-character-id]'));const count=await js(()=>document.querySelectorAll('.char-modal [data-character-id]').length);assert(count>0);log(layout+' added a workbench role');fs.writeFileSync(path.join(out,layout+'.png'),await wc.capturePage().then(x=>x.toPNG()));
}app.exit(0)}
app.whenReady().then(()=>run().catch(e=>{log(String(e.stack));app.exit(2)}));setTimeout(()=>{log('timeout');app.exit(4)},90000);require(path.join(src,'dist-electron/electron/main.js'));
