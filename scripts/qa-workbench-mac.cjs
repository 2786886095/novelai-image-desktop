const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const src=process.cwd(),out=process.env.QA_OUT,profile=path.join(out,'qa-profile');
process.env.NAI_UI_CAPTURE_USER_DATA=profile;app.setAppPath(src);
delete process.env.VITE_DEV_SERVER_URL;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const log=(x)=>fs.appendFileSync(path.join(out,'native.log'),x+'\n');
fs.mkdirSync(out,{recursive:true});const timeout=setTimeout(()=>{log('Timed out');app.exit(3)},125000);
async function run(){
 let w;for(let i=0;i<120;i++){w=BrowserWindow.getAllWindows().find(x=>/index\.html/.test(x.webContents.getURL()));if(w)break;await pause(250)}
 assert(w,'no product window');const wc=w.webContents,js=(fn,...args)=>wc.executeJavaScript('('+fn+')(...'+JSON.stringify(args)+')',true);
 const wait=async(fn,...args)=>{for(let i=0;i<64;i++){if(await js(fn,...args))return;await pause(110)}log(await js(()=>document.body.innerText.slice(-3800)));fs.writeFileSync(path.join(out,'stalled.png'),(await wc.capturePage()).toPNG());throw Error('Timeout: '+fn+' '+args)};
 const click=async(sel)=>{await wait(s=>document.querySelector(s),sel);await js(s=>{const b=document.querySelector(s);b.scrollIntoView({block:'center'});b.click()},sel);await pause(140)};
 await wait(()=>window.naiDesktop && document.querySelector('button'));
 assert.equal(process.platform,'darwin');for(const layout of ['classic']){
  await js(l=>{localStorage.setItem('langbai.desktop-layout.v1',l);localStorage.setItem('langbai.desktop-layout-intro.v1','1')},layout);
  await new Promise(r=>{wc.once('did-finish-load',r);wc.reload()});await pause(1800);
  log(layout+' body classes '+await js(()=>document.body.className+' / '+document.querySelector('#root')?.firstElementChild?.className));
  const findButton=()=>[...document.querySelectorAll('button')].find(b=>/灵感胶囊|靈感膠囊|Inspiration Capsule/i.test((b.title||'')+' '+(b.getAttribute('aria-label')||''))&&b.getClientRects().length);
  if(!await js(findButton)){log(await js(()=>JSON.stringify([...document.querySelectorAll('button')].filter(b=>b.title||b.getAttribute('aria-label')).map(b=>[b.title,b.getAttribute('aria-label')]).slice(0,110))));throw Error('capsule button not found');}
  await js(()=>[...document.querySelectorAll('button')].find(b=>/灵感胶囊|靈感膠囊|Inspiration Capsule/i.test((b.title||'')+' '+(b.getAttribute('aria-label')||''))&&b.getClientRects().length).click());
  await wait(()=>document.querySelector('[data-curated-cat]'));
  assert.equal(await js(()=>document.querySelectorAll('[data-curated-cat]').length),14);
  assert.deepEqual(await js(()=>[...document.querySelectorAll('[data-curated-sub]')].map(b=>b.dataset.curatedSub)),['对象','体型','上衣','下装','眼睛','配饰']);
  await click('[data-curated-sub="上衣"]');await wait(()=>document.querySelector('[data-capsule-library-tag="shirt"]'));
  const heading=await js(()=>document.querySelector('.capsule-library-heading').innerText);log(layout+' tops '+heading.replace(/\n/g,' / '));
  await click('[data-curated-disclosure]');assert.equal(await js(()=>document.querySelectorAll('[data-curated-sub]').length),48);
  await click('[data-curated-sub="鞋靴"]');assert(await js(()=>document.querySelector('.capsule-library-heading h3').textContent.includes('鞋靴')));
  await click('[data-curated-sub="上衣"]');
  fs.writeFileSync(path.join(out,layout+'.png'),(await wc.capturePage()).toPNG());
  await click('[data-curated-cat="服饰"]');await click('[data-curated-sub="下装"]');
  assert.equal(await js(()=>document.querySelector('.capsule-library-heading h3').innerText),'服饰 › 下装');
  log(layout+' PASS: 14 categories / 48 character subcategories / tops, shoes, bottoms');
 }
 clearTimeout(timeout);app.exit(0);
}
app.whenReady().then(()=>run().catch(e=>{log(String(e.stack));app.exit(2)}));
try { require(path.join(src,'dist-electron/electron/main.js')); } catch(err){log(err.stack); app.exit(4);}

