const {app, BrowserWindow} = require('electron');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const log = process.env.QA_LOG_PATH;
fs.writeFileSync(log, 'DRIVER_STARTED\n');
const write = (...a) => fs.appendFileSync(log, a.join(' ') + '\n');
process.on('uncaughtException', e => {write(e.stack); app.exit(1);});
process.on('unhandledRejection', e => {write(e.stack || e); app.exit(1);});
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({show: false, width: 1280, height: 1000, webPreferences: {contextIsolation: true, offscreen: true, backgroundThrottling: false}});
  const run = code => win.webContents.executeJavaScript(code, true);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function until(code) {for (let i = 0; i < 100; i++) {if (await run(code)) return; await pause(100);} throw Error('Timed out: ' + code);}
  const errors = [];
  win.webContents.on('console-message', (...args) => {const s = args.map(a => typeof a === 'object' ? a.message || '' : String(a)).join(' '); write('PAGE_CONSOLE', s); if (s.includes('Uncaught') || s.includes('Unhandled')) errors.push(s);});
  const select = async label => {
    await run(`document.querySelector('.random-generation-settings .select-menu-trigger').click()`);
    await until(`!![...document.querySelectorAll('[role=option]')].find(e=>e.textContent.includes(${JSON.stringify(label)}))`);
    await run(`([...document.querySelectorAll('[role=option]')].find(e=>e.textContent.includes(${JSON.stringify(label)}))).click()`);
  };
  try {
    await win.loadURL('http://127.0.0.1:19439/tests/artist-models-ui.html');
    await until('!!window.qa && !!document.querySelector(".random-generation-settings .select-menu-trigger")');
    await run(`localStorage.setItem('langbai.artist-lab.random.v6',JSON.stringify({basePrompt:'1girl, portrait',count:1,generationParams:{model:'nai-diffusion-5-full'},results:[],favorites:[]}))`);
    await win.reload();
    await until('!!window.qa && !!document.querySelector(".random-generation-settings .select-menu-trigger")');
    for (const [model, label] of [['nai-diffusion-4-5-full', '4.5 Full'], ['nai-diffusion-4-5-curated', '4.5 Curated'], ['nai-diffusion-5-full', 'V5 Full'], ['nai-diffusion-5-curated', 'V5 Curated']]) {
      await select(label);
      await until(`JSON.parse(localStorage.getItem('langbai.artist-lab.random.v6')).generationParams.model===${JSON.stringify(model)}`);
      await win.reload();
      await until('!!window.qa && !!document.querySelector(".random-generation-settings .select-menu-trigger")');
      assert.ok((await run(`document.querySelector('.random-generation-settings .select-menu-trigger').textContent`)).includes(label));
      await until(`!![...document.querySelectorAll('.artist-result-actions button')].find(b=>b.textContent.trim()==='生成这一批' && !b.disabled)`);
      await run(`([...document.querySelectorAll('.artist-result-actions button')].find(b=>b.textContent.trim()==='生成这一批')).click()`);
      await until('window.qa.calls.length===1');
      const request = await run('window.qa.calls[0]');
      assert.equal(request.params.model, model); assert.equal(request.mode, 'random');
      assert.equal(request.params.positivePrompt, '1girl, portrait');
      write('MODEL_SELECT_PERSIST_REOPEN_REQUEST=PASS', model);
      await until(`!![...document.querySelectorAll('.artist-result-actions button')].find(b=>b.textContent.trim()==='生成这一批' && !b.disabled)`);
    }
    assert.equal(errors.length, 0, errors.join('\n'));
    write('UNCUGHT_UI_ERRORS=0; PAID_API_CALLS=0');
    fs.writeFileSync(process.env.QA_SCREENSHOT_PATH, (await win.webContents.capturePage()).toPNG());
    win.destroy(); app.exit(0);
  } catch (e) {write('FAIL', e.stack); write('DOM', await run('document.body.innerText').catch(String)); app.exit(1);}
});
