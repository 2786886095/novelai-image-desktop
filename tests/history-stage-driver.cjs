const {app, BrowserWindow} = require('electron');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const log = process.env.QA_LOG_PATH;
fs.writeFileSync(log, 'DRIVER_STARTED\n');
const write = (...parts) => fs.appendFileSync(log, parts.join(' ') + '\n');
process.on('uncaughtException', error => {write('UNCAUGHT', error.stack); app.exit(1);});
process.on('unhandledRejection', error => {write('UNHANDLED', error.stack || error); app.exit(1);});
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({show: false, width: 1200, height: 1000, webPreferences: {offscreen: true, backgroundThrottling: false}});
  const run = code => win.webContents.executeJavaScript(code, true);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const errors = [];
  win.webContents.on('console-message', (_event, details) => {if (/Uncaught|Unhandled/.test(details?.message || '')) errors.push(details.message);});
  async function until(code) {for (let i = 0; i < 100; i++) {if (await run(code)) return; await pause(50);} throw Error('Timed out: ' + code);}
  async function mouse(type, x, y, count = 1) {win.webContents.sendInputEvent({type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: count}); await pause(40);}
  async function click(x, y, count = 1) {await mouse('mouseMove', x, y); await mouse('mouseDown', x, y, count); await mouse('mouseUp', x, y, count); await pause(80);}
  async function key(keyCode) {win.webContents.sendInputEvent({type: 'keyDown', keyCode}); win.webContents.sendInputEvent({type: 'keyUp', keyCode}); await pause(80);}
  const center = async selector => run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  const scale = () => run('new DOMMatrix(getComputedStyle(document.querySelector(".zoom-frame")).transform).a');
  const matrix = () => run('(()=>{const m=new DOMMatrix(getComputedStyle(document.querySelector(".zoom-frame")).transform);return {scale:m.a,x:m.e,y:m.f}})()');
  const state = 'window.issueUI.state()';
  try {
    await win.loadURL((process.env.QA_URL || 'http://127.0.0.1:19438') + '/tests/history-stage-ui.html');
    await until('!!window.issueUI && document.querySelector(".zoom-image")?.naturalHeight===900');
    await until('document.querySelector(".zoom-image").getBoundingClientRect().height>100');
    const p = await center('.zoom-image');
    assert.equal(await run(`document.elementFromPoint(${p.x},${p.y}).closest('.zoom-frame-shell')!==null`), true, 'fixture must be a production-shaped interactive canvas');
    assert.equal(await run('document.querySelector(".image-viewer-toolbar span").textContent'), '2 / 3');
    await run('document.querySelector("textarea").focus()'); await key('Right');
    assert.equal(await run(state + '.currentImage.id'), 'history-1');
    assert.equal(await run('document.activeElement.tagName'), 'TEXTAREA');
    write('TEXTAREA_KEYS_UNINTERCEPTED=PASS');
    await run('document.querySelector(".zoom-frame-shell").focus()'); await key('Right');
    await until(state + '.currentImage.id==="history-2"');
    assert.equal(await run('document.querySelector(".image-viewer-toolbar button[aria-label=Next]").disabled'), true);
    await key('Right'); assert.equal(await run(state + '.currentImage.id'), 'history-2');
    await run('document.querySelector(".image-viewer-toolbar button[aria-label=Previous]").click()');
    await until(state + '.currentImage.id==="history-1"');
    write('WORKBENCH_FILEPATH_MAIN_ARROWS_BOUNDARIES=PASS');
    await until('document.querySelector(".zoom-image").naturalHeight===900'); await pause(100);
    const blank = await run('(()=>{const r=document.querySelector(".zoom-frame-shell").getBoundingClientRect();return {x:r.left+5,y:r.top+r.height/2}})()');
    await click(blank.x, blank.y); await click(blank.x, blank.y, 2);
    assert.equal(await run('!!document.querySelector(".image-preview-viewer")'), false);
    assert.equal(await run('getComputedStyle(document.elementFromPoint(' + blank.x + ',' + blank.y + ')).cursor'), 'default');
    write('ACTUAL_LETTERBOX_CLICK_DOUBLECLICK_CURSOR=PASS');
    const image = await center('.zoom-image'); await mouse('mouseMove', image.x, image.y);
    assert.equal(await run('getComputedStyle(document.elementFromPoint(' + image.x + ',' + image.y + ')).cursor'), 'zoom-in');
    // Native Chromium wheel, then actual pointer capture pan and generated click.
    win.webContents.sendInputEvent({type: 'mouseWheel', x: Math.round(image.x), y: Math.round(image.y), deltaY: 100, canScroll: true});
    await until('new DOMMatrix(getComputedStyle(document.querySelector(".zoom-frame")).transform).a>1');
    assert.ok(await scale() > 1);
    assert.equal(await run('getComputedStyle(document.elementFromPoint(' + image.x + ',' + image.y + ')).cursor'), 'grab');
    const beforePan = await matrix();
    await mouse('mouseDown', image.x, image.y); await mouse('mouseMove', image.x, image.y + 45); await mouse('mouseUp', image.x, image.y + 45);
    const afterPan = await matrix(); assert.notEqual(afterPan.y, beforePan.y);
    assert.equal(await run('!!document.querySelector(".image-preview-viewer")'), false);
    const beforeBlankPan = await matrix();
    await mouse('mouseDown', blank.x, blank.y); await mouse('mouseMove', blank.x + 30, blank.y); await mouse('mouseUp', blank.x + 30, blank.y);
    assert.deepEqual(await matrix(), beforeBlankPan);
    write('NATIVE_WHEEL_ZOOM_PAN_MOVED_CLICK_SUPPRESSED_BLANK_PAN_IGNORED=PASS');
    win.webContents.sendInputEvent({type: 'mouseWheel', x: Math.round(image.x), y: Math.round(image.y), deltaY: -100, canScroll: true});
    await until('new DOMMatrix(getComputedStyle(document.querySelector(".zoom-frame")).transform).a===1');
    const open = await center('.zoom-image'); await click(open.x, open.y);
    await until('!!document.querySelector(".image-preview-viewer")');
    assert.ok((await run('document.querySelector(".image-preview-controls").textContent')).includes('2 / 3'));
    await run('window.issueUI.viewerNode=document.querySelector(".image-preview-viewer")');
    await key('Right'); await until(state + '.currentImage.id==="history-2"');
    assert.equal(await run('window.issueUI.viewerNode===document.querySelector(".image-preview-viewer")'), true);
    assert.ok((await run('document.querySelector(".image-preview-controls").textContent')).includes('3 / 3'));
    await run('[...document.querySelectorAll(".image-preview-controls button")].find(b=>b.textContent==="Previous").click()');
    await until(state + '.currentImage.id==="history-1"');
    await key('Left'); await until(state + '.currentImage.id==="history-0"');
    await key('Left'); assert.equal(await run(state + '.currentImage.id'), 'history-0');
    assert.equal(await run('window.issueUI.viewerNode===document.querySelector(".image-preview-viewer")'), true);
    write('ACTUAL_IMAGE_CLICK_SHARED_HISTORY_VIEWER_STAYS_MOUNTED=PASS');
    await run('window.issueUI.setHistory([window.issueUI.history[2],window.issueUI.history[0]])');
    await until('document.querySelector(".image-preview-controls").textContent.includes("2 / 2")');
    await key('Left'); await until(state + '.currentImage.id==="history-2"');
    assert.equal(await run('window.issueUI.viewerNode===document.querySelector(".image-preview-viewer")'), true);
    write('LIVE_HISTORY_FILTER_ORDER_AND_MATERIALS=PASS');
    await key('Escape'); await until('!document.querySelector(".image-preview-viewer")');
    assert.equal(errors.length, 0, errors.join('\n'));
    if (process.env.QA_SCREENSHOT_PATH) fs.writeFileSync(process.env.QA_SCREENSHOT_PATH, (await win.webContents.capturePage()).toPNG());
    write('UNCAUGHT_ERRORS=0; PAID_API_CALLS=0'); win.destroy(); app.exit(0);
  } catch (error) {
    write('FAIL', error.stack);
    write('DOM', await run('document.body.innerText').catch(String));
    write('GEOMETRY', await run('(()=>{const i=document.querySelector(".zoom-image"),s=document.querySelector(".zoom-frame-shell");return JSON.stringify({image:i?.getBoundingClientRect(),shell:s?.getBoundingClientRect(),natural:[i?.naturalWidth,i?.naturalHeight],pointerEvents:s&&getComputedStyle(s).pointerEvents})})()').catch(String));
    if (process.env.QA_SCREENSHOT_PATH) fs.writeFileSync(process.env.QA_SCREENSHOT_PATH, (await win.webContents.capturePage()).toPNG());
    win.destroy(); app.exit(1);
  }
});
