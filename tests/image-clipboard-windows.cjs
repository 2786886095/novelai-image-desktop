// Real Electron/main-process Windows clipboard probe. Temporarily replaces the
// desktop clipboard; restores its standard text/HTML/RTF/image representations.
// Run: node tests/image-clipboard-windows.cjs [path/to/image-clipboard.ts]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

if (process.argv[2] !== '--electron') {
  if (process.platform !== 'win32') {
    console.log('SKIP: real clipboard probe requires Windows');
    process.exit(0);
  }
  const { spawnSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-clipboard-probe-'));
  const report = path.join(dir, 'result.json');
  const source = path.resolve(process.argv[2] || 'electron/ipc/image-clipboard.ts');
  const env = { ...process.env, NODE_PATH: path.resolve('node_modules') };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [__filename, '--electron', source, report], {
    env, encoding: 'utf8', timeout: 60000, windowsHide: true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (fs.existsSync(report)) console.log(fs.readFileSync(report, 'utf8'));
  else console.error('Clipboard probe did not produce a report');
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(result.status === 0 && !result.error ? 0 : 1);
}

const ts = require('typescript');
require.extensions['.ts'] = (module, file) => {
  module.paths.push(path.resolve(__dirname, '../node_modules'));
  module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, file);
};
const { app, clipboard, BrowserWindow } = require('electron');
const { pngWithComment } = require('./image-clipboard-fixture.cjs');
const source = process.argv[3];
const reportFile = process.argv[4];
const report = { platform: process.platform, offCopy: null, paste: null, copy: null };
let stage = 'ready';

app.whenReady().then(async () => {
  const previous = { text: clipboard.readText(), html: clipboard.readHTML(), rtf: clipboard.readRTF(), image: clipboard.readImage() };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-clipboard-native-'));
  let window;
  try {
    stage = 'load-module';
    const api = require(source);
    const png = pngWithComment();
    // Exercise the unchanged native context-menu fallback, not a mock.
    stage = 'off-native-copy';
    window = new BrowserWindow({ show: false, width: 100, height: 100 });
    await window.loadURL(`data:text/html,${encodeURIComponent(`<img style="position:absolute;left:0;top:0;width:32px;height:16px" src="data:image/png;base64,${png.toString('base64')}">`)}`);
    await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const img=document.querySelector('img');if(img.complete&&img.naturalWidth)resolve();else{img.onload=resolve;img.onerror=reject;}})`);
    clipboard.clear();
    window.webContents.copyImageAt(8, 8);
    for (let attempt = 0; attempt < 200 && clipboard.readImage().isEmpty(); attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert(!clipboard.readImage().isEmpty(), 'OFF fallback must copy a native image');
    const offBytes = clipboard.readBuffer('PNG');
    report.offCopy = { comment: offBytes.includes(Buffer.from('Comment\0')), standardImage: true };
    assert(!report.offCopy.comment, 'OFF fallback must not preserve the original Comment');
    stage = 'raw-fixture';
    clipboard.writeBuffer('PNG', png);
    assert(clipboard.readBuffer('PNG').equals(png), 'Raw clipboard fixture must be exact');
    stage = 'read-paste';
    const pasted = Buffer.from((await api.readClipboardImageFiles())[0].bytes);
    report.paste = {
      originalBytes: pasted.equals(png), comment: pasted.includes(Buffer.from('Comment\0')),
      standardImage: !clipboard.readImage().isEmpty(),
    };
    if (api.copyImageWithMetadata) {
      const { toLocalMediaUrl } = require(path.join(path.dirname(source), 'local-media-protocol.ts'));
      const file = path.join(dir, 'fixture 中文.png');
      fs.writeFileSync(file, png);
      stage = 'copy-png';
      const result = await api.copyImageWithMetadata(toLocalMediaUrl(file, 'probe'));
      assert.equal(result.status, 'copied', 'Safe PNG must be copied');
      assert(clipboard.readBuffer('PNG').equals(png), 'Copy must preserve original PNG bytes');
      assert(!clipboard.readImage().isEmpty(), 'Copy must remain a standard native image');
      stage = 'bitmap-fallback';
      // has('CF_DIB') asks Electron for a *registered name*, not predefined
      // Windows format 8. Query real Win32 IDs 8/17 rather than a custom name.
      const { spawnSync } = require('node:child_process');
      const query = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class NativeClip { [DllImport("user32.dll")] public static extern bool IsClipboardFormatAvailable(uint format); }'; $image=[Windows.Forms.Clipboard]::GetImage(); $ok=$image -and $image.Width -eq 2 -and $image.Height -eq 1; if ($image) { $image.Dispose() }; if ($ok -and ([NativeClip]::IsClipboardFormatAvailable(8) -or [NativeClip]::IsClipboardFormatAvailable(17))) { exit 0 } else { exit 1 }`;
      const bitmap = spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
        ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(query, 'utf16le').toString('base64')],
        { windowsHide: true, encoding: 'utf8', timeout: 10000 });
      assert.equal(bitmap.status, 0, 'Copy must include Windows bitmap paste fallback');
      const roundtrip = Buffer.from((await api.readClipboardImageFiles())[0].bytes);
      assert(roundtrip.equals(png), 'App paste must preserve original PNG bytes');
      report.copy = { status: result.status, originalBytes: true, comment: true, standardImage: true, bitmapFallback: true };
    }
    fs.writeFileSync(reportFile, JSON.stringify(report));
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    clipboard.write(previous);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  app.exit(0);
}).catch(error => {
  // Never dump metadata, srcURLs, clipboard text or errors containing payloads.
  fs.writeFileSync(reportFile, JSON.stringify({ ...report, error: 'CLIPBOARD_PROBE_FAILED', stage,
    code: typeof error.code === 'string' ? error.code : error.constructor.name }));
  app.exit(1);
});
