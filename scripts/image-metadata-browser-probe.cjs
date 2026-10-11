const fs = require('node:fs'), path = require('node:path');
const {app, BrowserWindow} = require('electron');
// Pass a numeric port: Electron can consume URL-shaped CLI arguments itself.
const [port, root, reportFile] = process.argv.slice(2);
if (!/^\d{5}$/.test(port) || Number(port) < 40000 || Number(port) >= 60000) throw new Error('Invalid local test port');
const origin = 'http://127.0.0.1:' + port;
const profile = path.join(path.dirname(reportFile), 'profile');
fs.mkdirSync(profile, {recursive: true});
app.setPath('userData', profile);
app.commandLine.appendSwitch('no-error-dialogs');
let win;
app.whenReady().then(async () => {
  win = new BrowserWindow({show: false, webPreferences: {nodeIntegration: false, contextIsolation: true,
    sandbox: true, backgroundThrottling: false}});
  await win.loadURL(origin + '/__metadata_regression__');
  const fixtures = ['image-metadata-compat-fixtures', 'official-image-metadata-fixtures'].flatMap(dir => {
    const base = path.join(root, 'shared', dir);
    return JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8')).map(item => ({
      name: dir + '/' + item.name, expected: item.expected,
      base64: fs.readFileSync(path.join(base, item.name)).toString('base64')
    }));
  });
  if (fixtures.length !== 42) throw new Error('Metadata fixture matrix must not silently shrink');
  const result = await win.webContents.executeJavaScript(`(async () => {
    const mod = await import(${JSON.stringify(origin + '/src/png-meta.ts')});
    if (typeof Buffer !== 'undefined' || typeof require !== 'undefined') throw new Error('Node integration unexpectedly enabled');
    const cases = [];
    for (const item of ${JSON.stringify(fixtures)}) {
      const bytes = Uint8Array.from(atob(item.base64), c => c.charCodeAt(0));
      const before = bytes.slice();
      const report = mod.inspectImageMetadata(await mod.parseImageMetaAsync(bytes.buffer));
      const actual = {...report.imported, characters: report.characterCaptions.length};
      const entries = Object.entries(item.expected);
      const matches = entries.length ? entries.every(([key, value]) => actual[key] === value)
        : Object.keys(report.imported).length === 0 && report.characterCaptions.length === 0;
      cases.push({name: item.name, pass: matches && bytes.every((b, i) => b === before[i])});
    }
    return {cases, passed: cases.filter(c => c.pass).length, total: cases.length};
  })()`);
  const report = {...result, pass: result.passed === result.total, platform: process.platform,
    nodeIntegration: false, sandbox: true, paidCalls: 0};
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  win.destroy(); app.exit(report.pass ? 0 : 1);
}).catch(error => {
  console.error(error.stack ?? error); if (win) win.destroy(); app.exit(1);
});
