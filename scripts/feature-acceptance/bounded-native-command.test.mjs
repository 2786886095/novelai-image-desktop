import test from 'node:test';
import assert from 'node:assert/strict';
import {runBoundedNativeCommand} from './bounded-native-command.mjs';

const node = code => [process.execPath, '-e', code];
test('records exact stdout, stderr and a successful exit', async () => {
  const r = await runBoundedNativeCommand(node('process.stdout.write("OUT\\n");process.stderr.write("ERR\\n")'));
  assert.equal(r.stdout, 'OUT\n'); assert.equal(r.stderr, 'ERR\n');
  assert.equal(r.exitStatus, 0); assert.equal(r.timedOut, false); assert.equal(r.error, null);
});
test('a nonzero native exit remains nonzero', async () => {
  const r = await runBoundedNativeCommand(node('process.exit(17)'));
  assert.equal(r.exitStatus, 17); assert.equal(r.timedOut, false);
});
test('spawn errors are retained and do not count as success', async () => {
  const r = await runBoundedNativeCommand(['not-an-installed-native-command-bae43e00']);
  assert.equal(r.exitStatus, null); assert.match(r.error, /ENOENT/);
});
test('an output flood is bounded and never accepted', async () => {
  const r = await runBoundedNativeCommand(node('process.stdout.write("x".repeat(100000));setInterval(()=>{},1000)'),
    {maxBuffer: 1024, timeout: 5000, killGrace: 100, drainGrace: 200});
  assert.equal(r.exitStatus, 125); assert.equal(r.outputOverflow, true); assert(r.stdout.length <= 1024);
});
test('a real child tree ignoring SIGTERM is force-cleaned by its deadline', async () => {
  const childCode = 'process.on("SIGTERM",()=>{});console.log("CHILD="+process.pid);setInterval(()=>{},1000)';
  const parentCode = 'const{spawn}=require("node:child_process");process.on("SIGTERM",()=>{});spawn(process.execPath,["-e",' +
    JSON.stringify(childCode) + '],{stdio:["ignore","inherit","inherit"]});setInterval(()=>{},1000)';
  const r = await runBoundedNativeCommand(node(parentCode), {timeout: 1500, killGrace: 150, drainGrace: 500});
  const descendant = Number(/CHILD=(\d+)/.exec(r.stdout)?.[1]);
  assert(descendant > 0, r.stdout + r.stderr);
  assert.equal(r.timedOut, true); assert.equal(r.exitStatus, 124); assert(r.elapsedMs < 6000);
  assert.equal(r.cleanupComplete, true, JSON.stringify(r));
  assert(r.cleanup.some(c => c.force === true));
  for (const pid of [r.pid, descendant]) {
    // POSIX may briefly retain a dead grandchild as a zombie; signal 0 then
    // succeeds. Its /proc entry, when available, must be zombie or absent.
    try { process.kill(pid, 0); }
    catch (e) { assert.equal(e.code, 'ESRCH'); continue; }
    if (process.platform === 'linux') {
      const fs = await import('node:fs');
      assert.match(fs.readFileSync(`/proc/${pid}/stat`, 'utf8'), /\) Z /);
    } else assert.fail(`test process ${pid} survived the cleanup deadline: ${JSON.stringify(r)}`);
  }
});
test('an exited parent with a descendant-held pipe cannot block the controller',
  {skip: process.platform === 'win32'}, async () => {
    const code = 'const{spawn}=require("node:child_process");const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:["ignore","inherit","inherit"]});console.log("CHILD="+c.pid);c.unref();';
    const r = await runBoundedNativeCommand(node(code), {timeout: 4000, drainGrace: 150});
    assert.equal(r.exitStatus, 125); assert.equal(r.timedOut, false);
    assert.match(r.error, /inherited output pipes/); assert(r.elapsedMs < 2000);
  });
