// Runs the actual browser decoder, not a Sharp replacement, in a sandboxed renderer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-metadata-regression-'));
const reportFile = path.join(temp, 'report.json');
let server;
try {
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    throw new Error('Browser metadata gate requires a display; use xvfb-run -a npm run test:metadata. No skipped acceptance.');
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    server = await createServer({root, configFile: false, logLevel: 'error', cacheDir: path.join(temp, 'vite-cache'),
      optimizeDeps: {entries: [], noDiscovery: true, include: ['pako']},
      server: {host: '127.0.0.1', port: 40000 + Math.floor(Math.random() * 20000), strictPort: true,
        watch: {ignored: ['**/*']}},
      plugins: [{name: 'metadata-regression-shell', configureServer(vite) {
        vite.middlewares.use((req, res, next) => {
          if (req.url !== '/__metadata_regression__') return next();
          res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Metadata regression</title>');
        });
      }}]});
    try { await server.listen(); break; }
    catch (error) { await server.close(); server = undefined; if (error.code !== 'EADDRINUSE' || attempt === 29) throw error; }
  }
  if (!server) throw new Error('No free local test port');
  const port = server.httpServer.address().port;
  const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  const electron = createRequire(import.meta.url)('electron');
  // Use an isolated byte-identical probe; no profile files are written to the source.
  const probe = path.join(temp, 'probe.cjs');
  fs.copyFileSync(path.join(root, 'scripts/image-metadata-browser-probe.cjs'), probe);
  const child = spawn(electron, [probe,
    String(port), root, reportFile], {env, windowsHide: true});
  let stdout = '', stderr = '';
  child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {child.kill(); reject(new Error('Browser metadata gate timed out'));}, 90000);
    child.once('error', error => {clearTimeout(timer); reject(error);});
    child.once('exit', code => {clearTimeout(timer); resolve(code);});
  });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (code !== 0 || !fs.existsSync(reportFile)) throw new Error('Browser metadata gate failed: ' + code);
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  if (!report.pass || report.passed !== 42 || report.total !== 42 || report.nodeIntegration !== false || !report.sandbox) {
    throw new Error('Incomplete browser metadata acceptance');
  }
} catch (error) {
  console.error(error.stack ?? error); process.exitCode = 1;
} finally {
  await server?.close();
  // Only our uniquely created temporary directory; never the source or user images.
  if (path.dirname(temp) !== path.resolve(os.tmpdir())) throw new Error('Unsafe test cleanup path');
  fs.rmSync(temp, {recursive: true, force: true});
}
