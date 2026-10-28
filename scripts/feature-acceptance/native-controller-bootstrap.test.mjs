import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runBoundedNativeCommand} from './bounded-native-command.mjs';
const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const system = read('./run-desktop-system-native.mjs');

test('system controller preserves the native deadline, inventory and failed timeout semantics', () => {
  assert.match(system, /import \{runBoundedNativeCommand\}/);
  assert.match(system, /actual=await command\(argv,240000\)/);
  assert.doesNotMatch(system, /spawnSync\(argv\[0\]/);
  assert.match(system, /actual\.timedOut\|\|actual\.outputOverflow\|\|actual\.error/);
  assert.match(system, /report\.passed!==expected\.length/);
  assert.match(system, /'accounts','secure-crud-switch'/);
  assert.match(system, /'accounts','invalid-credential-errors-no-leak'/);
  assert.doesNotMatch(system, /'updates'/);
});

test('the actual system command adapter records literal streams and force-cleans a real timed-out child', async () => {
  const run = fs.mkdtempSync(path.join(os.tmpdir(), 'system-controller-test-')), ledger = [];
  const declaration = system.slice(system.indexOf('async function command('), system.indexOf('\nconst expected'));
  const command = new Function('fs', 'path', 'run', 'ledger', 'tlsCa', 'runBoundedNativeCommand', 'req', 'startMacNativeStallDiagnostics',
    declaration + ';return command;')(fs, path, run, ledger, path.join(run, 'absent-cert'), runBoundedNativeCommand, () => 'not-electron', () => async () => {});
  const ok = await command([process.execPath, '-e', 'process.stdout.write("SYSTEM_OUT\\n");process.stderr.write("SYSTEM_ERR\\n")']);
  assert.equal(ok.exitStatus, 0); assert.equal(ok.stdout, 'SYSTEM_OUT\n'); assert.equal(ok.stderr, 'SYSTEM_ERR\n');
  const failed = await command([process.execPath, '-e', 'setInterval(()=>{},1000)'], 300);
  assert.equal(failed.exitStatus, 124); assert.equal(failed.timedOut, true); assert.equal(failed.cleanupComplete, true);
  assert(failed.elapsedMs < 6500); assert.equal(ledger.length, 2);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(run, 'command-ledger.json'))), ledger);
});

for (const kind of ['generation', 'system']) test(`${kind} bootstrap writes exact begin/end/error before scenario proof`, async () => {
  const source = read(`./desktop-${kind}-journeys.cjs`), run = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-trace-test-'));
  const start = source.indexOf('function bootstrapPhase('), end = source.indexOf('\n', source.indexOf('async function bootAsync(', start));
  const declaration = source.slice(start, end);
  const {bootSync, bootAsync} = new Function('fs', 'path', 'run', 'checks', declaration + ';return {bootSync,bootAsync};')(fs, path, run, []);
  assert.equal(bootSync('sync', () => 41), 41);
  assert.equal(await bootAsync('async', async () => 42), 42);
  assert.throws(() => bootSync('throw', () => {throw Error('literal bootstrap failure');}), /literal bootstrap failure/);
  const events = fs.readFileSync(path.join(run, 'BOOTSTRAP_PHASES.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(event => [event.step, event.stage]), [['sync','begin'],['sync','end'],['async','begin'],['async','end'],['throw','begin'],['throw','error']]);
  assert.equal(events.at(-1).error, 'Error: literal bootstrap failure');
  assert.equal(events.every(event => event.completed === 0), true);
  assert.equal(fs.existsSync(path.join(run, 'PHASE_EVENTS.jsonl')), false, 'bootstrap diagnostics are not accepted scenario events');
  assert(source.indexOf('bootstrapPhase') < source.indexOf('app.whenReady().then'));
});
