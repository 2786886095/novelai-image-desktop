const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const src=process.cwd(),out=process.env.QA_OUT||__dirname;fs.mkdirSync(out,{recursive:true});process.env.NAI_UI_CAPTURE_USER_DATA=path.join(out,'isolated-draw-profile');app.setAppPath(src);
const nap=n=>new Promise(r=>setTimeout(r,n)),rows=[];const log=x=>{rows.push(x);fs.writeFileSync(path.join(out,'native.log'),rows.join('\n'))};
async function run(){let wc;for(let i=0;i<100;i++){wc=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'))?.webContents;if(wc)break;await nap(170)}assert(wc);await nap(900);
const js=(fn,...a)=>wc.executeJavaScript('('+fn+')(...'+JSON.stringify(a)+')',true);
const wait=async(fn,...a)=>{for(let i=0;i<160;i++){if(await js(fn,...a))return;await nap(100)}throw Error('timeout '+fn+' / '+(await js(()=>document.body.innerText.slice(-650))))};
const click=async(sel)=>{await wait(s=>document.querySelector(s),sel);await js(s=>{const b=document.querySelector(s);b.scrollIntoView({block:'center'});b.click()},sel);await nap(240)};
const storage=require(path.join(src,'dist-electron/electron/ipc/store.js')), {nativeImage}=require('electron');
if(path.resolve(app.getPath('userData'))!==path.resolve(process.env.NAI_UI_CAPTURE_USER_DATA))throw Error('nonisolated');
const pixels=nativeImage.createFromBitmap(Buffer.alloc(4*4*4,128),{width:4,height:4}).toPNG();
for(const layout of ['classic','redesign']){
 const group=storage.ensureHistoryGroup('Original '+layout),parent=storage.getSettings().outputDir;
 const rows=['A','B','C'].map((id,i)=>{const date='2026-02-0'+(i+1),filePath=path.join(parent,group.name,date,layout+'-'+id+'.png');fs.mkdirSync(path.dirname(filePath),{recursive:true});fs.writeFileSync(filePath,pixels);
 return {id:layout+id,groupId:group.id,date,filePath,fileUrl:require('url').pathToFileURL(filePath).href,width:4,height:4,model:'nai-diffusion-4-5-full',actualSeed:i,createdAt:date+'T12:00:00.000Z',prompt:'resource QA'};});
 storage.addHistory(rows);
 await js(l=>{localStorage.setItem('langbai.desktop-layout.v1',l);localStorage.setItem('langbai.desktop-layout-intro.v1','1')},layout);
 const u=new URL(wc.getURL());u.searchParams.set('uiCapture','works');await wc.loadURL(u.href);wc.setZoomFactor(.65);
 for(const id of ['A','B'])await click('input[type=checkbox][aria-label$="'+layout+'-'+id+'.png"]');
 if(!await js(()=>!!document.querySelector('.works-batch-controls'))) {await click('.works-selection > button');await click('input[type=checkbox][aria-label$="'+layout+'-C.png"]');}
 await js(()=>[...document.querySelectorAll('.works-batch-controls button')].find(x=>/移动所选|Move selected/.test(x.textContent)).click());await nap(300);log(await js(()=>JSON.stringify([document.querySelector('.works-error')?.innerText,document.querySelector('.works-selection')?.innerText])));
 await wait(async(l)=>{const a=await window.naiDesktop.getHistory();return ['A','B'].every(s=>a.find(v=>v.id===l+s)&&!a.find(v=>v.id===l+s).groupId)},layout);
 const confirmed=storage.getHistory().filter(v=>v.id.startsWith(layout));assert.equal(confirmed.length,3);assert.equal(confirmed.find(v=>v.id===layout+'C').groupId,group.id);assert(confirmed.every(v=>fs.existsSync(v.filePath)));log(layout+' gallery move A+B; C retained; three files readable');
 u.searchParams.set('uiCapture','referencePresets');await wc.loadURL(u.href);await click('.reference-preset-actions button');
 const b64=pixels.toString('base64');
 await js((data,l)=>{const file=new File([Uint8Array.from(atob(data),x=>x.charCodeAt(0))],l+'.png',{type:'image/png'}),dt=new DataTransfer();dt.items.add(file);const input=document.querySelector('.reference-preset-create input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));const name=document.querySelector('.reference-preset-create-fields label input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(name,'QA '+l);name.dispatchEvent(new Event('input',{bubbles:true}));},b64,layout);
 await wait(()=>!!document.querySelector('.reference-preset-create-image.has-image'));await click('.reference-preset-create button.btn-primary');
 await wait(async l=>(await window.naiDesktop.listReferencePresets()).presets.some(v=>v.name==='QA '+l),layout);
 const result=await js(async l=>{const p=(await window.naiDesktop.listReferencePresets()).presets.find(v=>v.name==='QA '+l);return (await window.naiDesktop.readReferencePreset(p.id)).base64},layout);assert.equal(result,b64);log(layout+' preset saved via file input; bytes match');
}app.exit(0)}

app.whenReady().then(()=>run().catch(e=>{log(String(e.stack));app.exit(2)}));setTimeout(()=>{log('timeout');app.exit(4)},90000);require(path.join(src,'dist-electron/electron/main.js'));


