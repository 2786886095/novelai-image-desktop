const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const src=process.cwd(),out=process.env.QA_OUT||__dirname;fs.mkdirSync(out,{recursive:true});process.env.NAI_UI_CAPTURE_USER_DATA=path.join(out,'isolated-draw-profile');app.setAppPath(src);
const nap=n=>new Promise(r=>setTimeout(r,n)),rows=[];const log=x=>{rows.push(x);fs.writeFileSync(path.join(out,'native.log'),rows.join('\n'))};
async function run(){let wc;for(let i=0;i<100;i++){wc=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'))?.webContents;if(wc)break;await nap(170)}assert(wc);await nap(900);
const js=(fn,...a)=>wc.executeJavaScript('('+fn+')(...'+JSON.stringify(a)+')',true);
const wait=async(fn,...a)=>{for(let i=0;i<160;i++){if(await js(fn,...a))return;await nap(100)}throw Error('timeout '+fn+' / '+(await js(()=>document.body.innerText.slice(-650))))};
const click=async(sel)=>{await wait(s=>document.querySelector(s),sel);await js(s=>{const b=document.querySelector(s);b.scrollIntoView({block:'center'});b.click()},sel);await nap(240)};
const input=async(sel,v)=>js((s,v)=>{const e=document.querySelector(s);Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}))},sel,v);
for(const layout of ['classic','redesign']){
 await js(l=>{localStorage.setItem('langbai.desktop-layout.v1',l);localStorage.setItem('langbai.desktop-layout-intro.v1','1')},layout);
 const u=new URL(wc.getURL());u.searchParams.set('uiCapture','artistStringDraw');await wc.loadURL(u.href);wc.setZoomFactor(.6);await wait(()=>document.querySelector('[data-testid="draw-roles"]'));
 let toggle='[data-testid="draw-roles"] input';if(!await js(s=>document.querySelector(s).checked,toggle))await click(toggle);
 await click('[data-testid="draw-roles"] button');await click('.role-bulk-launcher button');
 const scope='.role-bulk-dialog',draft=scope+' textarea', name='QA '+layout;
 await input(draft,JSON.stringify({characters:[{name:'Luna',prompt:'silver scarf',negativePrompt:'hat'},{name:'Sol',prompt:'green coat',negativePrompt:'fog'}]}));
 await click(scope+' details summary');await input(scope+' details input',name);await click(scope+' details .role-bulk-panel > button:last-child');
 await wait(async n=>(await window.naiDesktop.getSettings()).positivePromptPresets?.some(p=>p.name===n&&p.captions?.length===2&&p.captions[1].negativePrompt==='fog'),name);
 await input(draft,'');await click(scope+' details button[aria-haspopup="listbox"]');await js(n=>{const b=[...document.querySelectorAll('[role=option]')].find(v=>v.textContent.trim()===n);if(!b)throw Error('missing named preset');b.click()},name);
 await wait(()=>document.querySelector('.role-bulk-preview')?.innerText.includes('green coat'));await click(scope+' footer button');await wait(()=>document.querySelectorAll('[data-character-id]').length===2);
 const cap='[data-character-id] [data-character-field="prompt"]';await wait(s=>document.querySelector(s+' textarea')?.value==='silver scarf',cap);
 log(layout+' saved named pair (including negative), loaded it, previewed and applied two roles');
 const inspect=await js(s=>[...document.querySelector(s).querySelectorAll('button')].map(b=>[b.title,b.getAttribute('aria-label'),b.className]),cap);log(JSON.stringify(inspect));
 await js(s=>{const b=[...document.querySelector(s).querySelectorAll('button')].find(b=>/胶囊|Capsule/i.test(b.title+' '+b.getAttribute('aria-label')));if(!b)throw Error('capsule control not mounted');b.click()},cap);
 await click('.capsule-library-tag');const actual=await js(s=>[...document.querySelectorAll('[data-character-field="prompt"] textarea')].map(x=>x.value),cap);assert(actual[0].startsWith('silver scarf')&&actual[0].length>'silver scarf'.length);assert.equal(actual[1],'green coat');log(layout+' capsule appended only to first character: '+actual[0]);fs.writeFileSync(path.join(out,layout+'.png'),await wc.capturePage().then(i=>i.toPNG()));
}app.exit(0)}

app.whenReady().then(()=>run().catch(e=>{log(String(e.stack));app.exit(2)}));setTimeout(()=>{log('timeout');app.exit(4)},90000);require(path.join(src,'dist-electron/electron/main.js'));




