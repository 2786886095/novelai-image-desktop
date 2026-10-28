import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {runBoundedNativeCommand} from './bounded-native-command.mjs';


// Test-only probe. Signal0 and procfs are not an atomic snapshot.
// afterSignalZero is a timing seam for deterministic real child reaping.
export async function assertOwnedTestProcessIsGone(pid, result, {
  platform = process.platform,
  signalZero = value => process.kill(value, 0),
  afterSignalZero = async () => {},
  readStat = file => fs.readFileSync(file, 'utf8'),
} = {}) {
  assert(Number.isSafeInteger(pid) && pid > 0, 'Exact owned test PID required');
  try { signalZero(pid); }
  catch (error) { assert.equal(error.code, 'ESRCH'); return; }
  if (platform !== 'linux') assert.fail('test process '+pid+' survived the cleanup deadline: '+JSON.stringify(result));
  await afterSignalZero(pid);
  const procPath = '/proc/'+pid+'/stat';
  let stat;
  try { stat = readStat(procPath); }
  catch (error) {
    // Only this exact entry disappearing is death, not permissions, I/O,
    // malformed stat data or an unrelated missing file.
    assert.equal(error.code, 'ENOENT');
    assert.equal(error.path, procPath);
    try { signalZero(pid); }
    catch (gone) { assert.equal(gone.code, 'ESRCH'); return; }
    assert.fail('Missing proc entry but owned test PID still exists; death not proven');
  }
  assert.match(stat, /\) Z /);
}

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
    await assertOwnedTestProcessIsGone(pid, r);
  }
});
test('an exited parent with a descendant-held pipe cannot block the controller',
  {skip: process.platform === 'win32'}, async () => {
    const code = 'const{spawn}=require("node:child_process");const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:["ignore","inherit","inherit"]});console.log("CHILD="+c.pid);c.unref();';
    const r = await runBoundedNativeCommand(node(code), {timeout: 4000, drainGrace: 150});
    assert.equal(r.exitStatus, 125); assert.equal(r.timedOut, false);
    assert.match(r.error, /inherited output pipes/); assert(r.elapsedMs < 2000);
  });

async function realOwnedProbeChild(t) {
  const child = spawn(process.execPath, ['-e',
    'process.on("message",m=>{if(m==="exit")process.exit(0)});process.send({ready:true,pid:process.pid});setInterval(()=>{},1000)'],
  {stdio:['ignore','pipe','pipe','ipc']});
  const closed = once(child, 'close');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
    assert.throws(() => process.kill(child.pid, 0), error => error.code === 'ESRCH');
  });
  const [ready] = await once(child, 'message');
  assert.deepEqual(ready, {ready:true,pid:child.pid});
  return {child,closed};
}

test('an actual owned child reaped between signal0 and procfs read is not alive',
  {skip:process.platform !== 'linux',timeout:10000}, async t => {
    const {child,closed} = await realOwnedProbeChild(t);
    let afterProbe = false;
    await assertOwnedTestProcessIsGone(child.pid, {testOnly:true}, {
      afterSignalZero: async observedPid => {
        assert.equal(observedPid, child.pid);
        process.kill(child.pid, 0);
        child.send('exit');
        await closed;
        assert.throws(() => process.kill(child.pid, 0), error => error.code === 'ESRCH');
        afterProbe = true;
        console.log('PROC_REAP_RACE:'+JSON.stringify({pid:child.pid,signalZeroSucceeded:true,reapedBeforeStatRead:true,realChild:true}));
      },
    });
    assert.equal(afterProbe, true);
  });

test('a real still-live owned child must fail the cleanup probe',
  {skip:process.platform !== 'linux',timeout:10000}, async t => {
    const {child} = await realOwnedProbeChild(t);
    await assert.rejects(assertOwnedTestProcessIsGone(child.pid, {testOnly:true}));
    // A missing proc read alone is not death if a second real signal0 still
    // observes this actual live child (e.g. a restricted/transient proc view).
    await assert.rejects(assertOwnedTestProcessIsGone(child.pid, {testOnly:true}, {
      readStat:file=>{throw Object.assign(Error('controlled missing view of a real live child'),{code:'ENOENT',path:file});},
    }));
    process.kill(child.pid, 0);
  });

test('cleanup probe rejects permission, stat and unrelated-path errors instead of swallowing them', async () => {
  const pid = 5317, procPath = '/proc/'+pid+'/stat';
  for (const code of ['EPERM','EACCES','EIO']) {
    await assert.rejects(assertOwnedTestProcessIsGone(pid, {}, {
      platform:'linux',signalZero:()=>{throw Object.assign(Error('signal error'),{code});},
    }));
    await assert.rejects(assertOwnedTestProcessIsGone(pid, {}, {
      platform:'linux',signalZero:()=>{},readStat:()=>{throw Object.assign(Error('stat error'),{code,path:procPath});},
    }));
  }
  await assert.rejects(assertOwnedTestProcessIsGone(pid, {}, {
    platform:'linux',signalZero:()=>{},readStat:()=>{throw Object.assign(Error('unrelated missing file'),{code:'ENOENT',path:'/not-the-owned-proc-entry'});},
  }));
  for (const stat of ['malformed stat',pid+' (node) S 0 0',pid+' (node) R 0 0']) {
    await assert.rejects(assertOwnedTestProcessIsGone(pid, {}, {platform:'linux',signalZero:()=>{},readStat:()=>stat}));
  }
  let probes = 0;
  await assert.doesNotReject(assertOwnedTestProcessIsGone(pid, {}, {
    platform:'linux',signalZero:()=>{if(++probes===2)throw Object.assign(Error('reaped after first probe'),{code:'ESRCH'});},
    readStat:()=>{throw Object.assign(Error('exact entry disappeared'),{code:'ENOENT',path:procPath});},
  }));
  assert.equal(probes, 2);
  await assert.doesNotReject(assertOwnedTestProcessIsGone(pid, {}, {platform:'linux',signalZero:()=>{},readStat:()=>pid+' (node) Z 0 0'}));
  await assert.doesNotReject(assertOwnedTestProcessIsGone(pid, {}, {
    signalZero:()=>{throw Object.assign(Error('already gone'),{code:'ESRCH'});},
    readStat:()=>{throw Error('must not read after ESRCH');},
  }));
});
