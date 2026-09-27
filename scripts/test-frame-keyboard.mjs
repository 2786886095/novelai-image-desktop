import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let playwright;
try { playwright=require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch(error) {
 if(process.env.PLAYWRIGHT_MODULE)throw error;
 playwright=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}
const {chromium}=playwright;
const cssPath=process.argv[2]||'src/styles.css';
const output=process.argv[3]||'artifacts/pgdn-frame-20260927/modified';
fs.mkdirSync(output,{recursive:true});
const css=fs.readFileSync(cssPath,'utf8');
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
const records=[];let failure;
try {
 for(const [width,height] of [[1385,900],[1024,768],[800,600]])for(const theme of ['light','dark']) {
  const page=await browser.newPage({viewport:{width,height}});
  const label=`${width}-${theme}`;
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(`<html class="theme-${theme}"><body class="theme-${theme}"><div id="root"><div class="app-shell"><header class="title-bar">Studio · keyboard regression</header><div class="app-notice-slot"></div><div class="menu-bar">Settings</div><nav class="tab-bar">Generate · Styles · Agent</nav><main class="workspace"><section class="left-panel"><div class="panel-scroll"><label>Prompt<textarea class="prompt-box">short prompt</textarea></label><input aria-label="Name" value="single line"><div style="height:1200px">Generation parameters</div><button id="last">Last parameter</button></div></section><div></div><div class="canvas-area">Image preview (fixture)</div><div></div><aside class="history-panel"><div class="panel-scroll" tabindex="0" style="height:100%"><div style="height:1800px">Image history</div></div></aside></main><footer class="status-bar">Ready</footer></div></div></body></html>`);
  await page.addStyleTag({content:css});
  const frame=()=>page.evaluate(()=>({offsets:[document.documentElement,document.body,document.querySelector('#root'),document.querySelector('.app-shell')].map(e=>[e.scrollLeft,e.scrollTop]),title:[document.querySelector('header').getBoundingClientRect().x,document.querySelector('header').getBoundingClientRect().y],footer:[document.querySelector('footer').getBoundingClientRect().x,document.querySelector('footer').getBoundingClientRect().y]}));
  const initial=await frame();
  const check=async name=>{
   const actual=await frame();records.push({label,name,initial,actual});
   assert.deepEqual(actual,initial,`${label}: ${name} moved application frame`);
  };
  const ta=page.locator('textarea');
  await ta.focus();for(let i=0;i<5;i++)await page.keyboard.press('PageDown');
  await page.waitForTimeout(250);
  await page.screenshot({path:path.join(output,`${label}.png`)});
  await check('short textarea PageDown x5');
  assert.ok(await page.locator('.left-panel .panel-scroll').evaluate(e=>e.scrollTop)>0,'inner panel still pages');
  for(let i=0;i<5;i++)await page.keyboard.press('PageUp');
  await page.waitForTimeout(250);await check('PageUp x5');
  await page.locator('input').focus();for(let i=0;i<5;i++)await page.keyboard.press('PageDown');
  await page.waitForTimeout(250);await check('single-line input paging');
  await ta.fill(Array.from({length:150},(_,i)=>`Line ${i}: sample prompt`).join('\n'));
  await ta.evaluate(e=>{e.focus();e.setSelectionRange(0,0);e.scrollTop=0;});
  await page.keyboard.press('Shift+PageDown');await page.waitForTimeout(150);
  const selection=await ta.evaluate(e=>({start:e.selectionStart,end:e.selectionEnd,scroll:e.scrollTop}));
  assert.ok(selection.end>selection.start,'Shift+PageDown selects text');
  await page.keyboard.press('PageDown');await page.keyboard.press('PageDown');await page.waitForTimeout(200);
  assert.ok(await ta.evaluate(e=>e.scrollTop)>0,'long textarea scrolls internally');
  await check('long textarea selection');
  await page.keyboard.press('Control+End');await page.keyboard.press('PageDown');
  await page.waitForTimeout(150);await check('caret end paging');
  await page.locator('#last').evaluate(e=>e.focus());await check('focus reveal');
  const history=page.locator('.history-panel .panel-scroll');
  if(await history.isVisible()) {
   await history.focus();await page.keyboard.press('PageDown');await page.waitForTimeout(250);
   assert.ok(await history.evaluate(e=>e.scrollTop)>0,'history still pages');await check('history paging');
  }
  // Hidden overflow would also permit programmatic scrolling and caret reveal.
  await page.locator('.app-shell').evaluate(e=>e.scrollTo(160,180));await check('frame rejects scrollTo');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: 6 viewport/theme cases; frame fixed; textarea selection, PageUp/PageDown, focus reveal and inner scrolling preserved.');
}catch(e){failure=e;console.log('FAIL: '+e.message.split('\n')[0]);}
finally{fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(records,null,2));await browser.close();}
if(failure)process.exitCode=1;
