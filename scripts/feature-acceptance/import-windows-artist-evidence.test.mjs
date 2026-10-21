import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {windowsArtistControllerPaths, windowsArtistScenarioReceipt} from './windows-artist-contract.mjs';
import {createWindowsArtistUnitProof} from './windows-artist-contract-fixture.mjs';
import {windowsArtistEvidenceRepository as repo, windowsArtistEvidenceManifestSchema as schema,
  windowsArtistEvidenceLimits as caps, validateWindowsArtistEvidenceManifest as manifestCheck,
  validateOfflineWindowsArtistEvidence as offline, validateRemoteWindowsArtistEvidenceFixture as remote,
  validateWindowsArtistImportDestination as destination, parseWindowsArtistImportArgs as args,
  assertWindowsArtistProductionProof}
  from './import-windows-artist-evidence.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const clone = value => structuredClone(value);
const sourceSha = '1'.repeat(40), evidenceCommit = '2'.repeat(40);
const bindings = {sourceSha, profileSha256: '3'.repeat(64), controllerHashes:
  windowsArtistControllerPaths.map((path, i) => ({path, sha256: String(i + 4).repeat(64)}))};
function bundle(proof = {}, receipt = {}, data = {}) {
  const files = new Map([['controller-proof.json', json(proof)], ['windows-artist-scenarios-receipt.json', json(receipt)],
    ...Object.entries(data).map(([name, bytes]) => ['data/' + name, Buffer.from(bytes)])]);
  const manifest = {schema, sourceSha, profileSha256: bindings.profileSha256, controllerSources: clone(bindings.controllerHashes),
    files: [...files].map(([path, bytes]) => ({path, bytes: bytes.length, sha256: sha(bytes)}))};
  return {manifest, files, raw: json(manifest)};
}
const row = (path, bytes = 1) => ({path, bytes, sha256: '4'.repeat(64)});
function mutate(change) {const b = bundle(); change(b.manifest); return json(b.manifest);}
function temporary(t) {const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artist-import-unit-')); t.after(() => fs.rmSync(dir, {recursive: true, force: true})); return dir;}
function writeBundle(root, b) {fs.mkdirSync(root, {recursive: true}); fs.writeFileSync(path.join(root, 'manifest.json'), b.raw); for (const [relative, bytes] of b.files) {const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, bytes);}}
function gitFixture(b = bundle()) {
  const api = new Map(), requests = [], prefix = `repos/${repo}/git/`;
  function blob(bytes) {const oid = crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex'); api.set(prefix + 'blobs/' + oid, {sha: oid, encoding: 'base64', size: bytes.length, content: bytes.toString('base64')}); return {sha: oid, size: bytes.length, mode: '100644', type: 'blob'};}
  const data = [], evidence = [{path: 'manifest.json', ...blob(b.raw)}];
  for (const [name, bytes] of b.files) (name.startsWith('data/') ? data : evidence).push({path: name.replace(/^data\//, ''), ...blob(bytes)});
  const rootOid = 'a'.repeat(40), evidenceOid = 'b'.repeat(40), dataOid = 'c'.repeat(40);
  if (data.length) {evidence.push({path: 'data', mode: '040000', type: 'tree', sha: dataOid}); api.set(prefix + 'trees/' + dataOid, {sha: dataOid, truncated: false, tree: data});}
  const root = [{path: 'windows-artist-evidence', mode: '040000', type: 'tree', sha: evidenceOid}];
  api.set(prefix + 'commits/' + b.manifest.sourceSha, {sha: b.manifest.sourceSha}); api.set(prefix + 'commits/' + evidenceCommit, {sha: evidenceCommit, tree: {sha: rootOid}});
  api.set(prefix + 'trees/' + rootOid, {sha: rootOid, truncated: false, tree: root}); api.set(prefix + 'trees/' + evidenceOid, {sha: evidenceOid, truncated: false, tree: evidence});
  return {api, requests, root, evidence, data, readApi(endpoint) {requests.push(endpoint); assert(api.has(endpoint), endpoint); return clone(api.get(endpoint));}};
}
function readFixture(fixture, override = {}) {return remote({evidenceCommit, sourceSha, bindings, readApi: fixture.readApi, ...override});}

test('valid manifest binds fixed names, source, profile and current controller bytes', () => {
  const b = bundle(); assert.deepEqual(manifestCheck(b.raw, bindings), b.manifest);
});
test('rejects mutable refs, URL refs, abbreviated or uppercase hashes and unsupported offline CLI', () => {
  const out = path.join(os.tmpdir(), 'artist-import-unused');
  for (const ref of ['main', 'codex/evidence', 'https://github.com/x/y', 'a'.repeat(39), 'A'.repeat(40)]) assert.throws(() => args(['--evidence-commit', ref, '--source-sha', sourceSha, '--out', out]));
  assert.throws(() => args(['--fixture-root', out, '--source-sha', sourceSha, '--out', out]));
  assert.throws(() => args(['--evidence-commit', evidenceCommit, '--evidence-commit', evidenceCommit, '--out', out]));
  assert.throws(() => args(['--evidence-commit', evidenceCommit, '--source-sha', sourceSha, '--out', 'relative']));
  assert.equal(args(['--out', out, '--source-sha', sourceSha, '--evidence-commit', evidenceCommit])['--out'], out);
});
test('rejects duplicate JSON keys, unknown fields, invalid UTF8, BOM and oversized manifest', () => {
  const raw = bundle().raw.toString();
  assert.throws(() => manifestCheck(Buffer.from(raw.replace('{', '{"schema":"duplicate",')), bindings));
  assert.throws(() => manifestCheck(mutate(m => {m.extra = true;}), bindings));
  for (const bytes of [Buffer.from([0xff]), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(raw)]), Buffer.alloc(caps.manifest + 1, 32)]) assert.throws(() => manifestCheck(bytes, bindings));
});
test('rejects source, profile, controller order/path/hash mismatches', () => {
  for (const change of [m => {m.sourceSha = 'a'.repeat(40);}, m => {m.profileSha256 = 'b'.repeat(64);}, m => {m.controllerSources.reverse();}, m => {m.controllerSources[0].sha256 = 'c'.repeat(64);}, m => {m.controllerSources[0].path = '../controller.mjs';}]) assert.throws(() => manifestCheck(mutate(change), bindings));
  const bad = clone(bindings); bad.controllerHashes[0].path = 'arbitrary.mjs'; assert.throws(() => manifestCheck(mutate(m => {m.controllerSources = bad.controllerHashes;}), bad));
});
test('rejects unsafe traversal, encoded, absolute, device and receipt-like data names', () => {
  for (const name of ['../escape.json', 'data/../escape.json', 'data/a\\b.json', 'data/%2e%2e.json', '/data/x.json', 'C:/a.json', 'data/CON.json', 'data/com1.txt', 'data/a..b.json', 'data/raw-receipt.json', 'data/scenarios.json', 'data/nested/x.json']) assert.throws(() => manifestCheck(mutate(m => {m.files.push(row(name));}), bindings), name);
});
test('rejects duplicate, missing fixed files, invalid count, hashes and byte/total caps', () => {
  const changes = [m => m.files.push(clone(m.files[0])), m => m.files.pop(), m => {m.files = [];}, m => m.files.push(row('data/a.json', -1)), m => m.files.push(row('data/a.json', 1.5)), m => m.files.push(row('data/a.json', caps.file + 1)), m => {m.files[0].sha256 = 'X'.repeat(64);}, m => {m.files = [...m.files, ...Array.from({length: 63}, (_, i) => row(`data/a${i}.json`))];}, m => {m.files = [...m.files, ...Array.from({length: 5}, (_, i) => row(`data/a${i}.bin`, caps.file))];}];
  for (const change of changes) assert.throws(() => manifestCheck(mutate(change), bindings));
});
test('offline refuses extra/missing files and mismatched raw file hashes before proof admission', t => {
  const base = temporary(t), b = bundle(), root = path.join(base, 'evidence'); writeBundle(root, b);
  fs.writeFileSync(path.join(root, 'unlisted.mjs'), 'throw new Error("MUST NOT EXECUTE")'); assert.throws(() => offline({fixtureRoot: root, bindings}), /Unlisted/);
  fs.unlinkSync(path.join(root, 'unlisted.mjs')); fs.unlinkSync(path.join(root, 'controller-proof.json')); assert.throws(() => offline({fixtureRoot: root, bindings}), /differ/);
  writeBundle(root, b); fs.writeFileSync(path.join(root, 'controller-proof.json'), Buffer.alloc(b.files.get('controller-proof.json').length, 32)); assert.throws(() => offline({fixtureRoot: root, bindings}), /hash differs/);
});
test('offline refuses fake proof rather than manufacturing native receipt', t => {
  const root = path.join(temporary(t), 'evidence'); writeBundle(root, bundle({schema: 'windows-artist-controller/v1', mockedModules: true}));
  assert.throws(() => offline({fixtureRoot: root, bindings}));
});
test('offline rejects symlink/junction ancestor and data directories', t => {
  const base = temporary(t), root = path.join(base, 'real'), alias = path.join(base, 'alias'); writeBundle(root, bundle());
  fs.symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir'); assert.throws(() => offline({fixtureRoot: alias, bindings}), /Symlink/);
  fs.mkdirSync(path.join(root, 'nested')); assert.throws(() => offline({fixtureRoot: root, bindings}), /directory/);
});
test('remote rejects candidate/evidence identity differences before blobs', () => {
  let f = gitFixture(); f.api.get(`repos/${repo}/git/commits/${sourceSha}`).sha = evidenceCommit; assert.throws(() => readFixture(f), /Candidate/); assert.equal(f.requests.length, 1);
  f = gitFixture(); f.api.get(`repos/${repo}/git/commits/${evidenceCommit}`).sha = sourceSha; assert.throws(() => readFixture(f), /Evidence commit/);
  assert.throws(() => readFixture(gitFixture(), {bindings: {...bindings, sourceSha: evidenceCommit}}), /binding/);
});
test('remote rejects symlink/executable/subtree and truncated or duplicate tree metadata', () => {
  for (const change of [f => {f.root[0].mode = '120000';}, f => {f.evidence[0].mode = '100755';}, f => {f.evidence.push(clone(f.evidence[0]));}, f => {f.api.get(`repos/${repo}/git/trees/${'a'.repeat(40)}`).truncated = true;}, f => {f.evidence[0].path = '../manifest.json';}, f => {f.evidence.push({path: 'evil.mjs', mode: '100644', type: 'blob', sha: 'd'.repeat(40), size: 1});}]) {const f = gitFixture(); change(f); assert.throws(() => readFixture(f));}
  const f = gitFixture(bundle({}, {}, {'x.bin': Buffer.from('raw')})); f.data[0].mode = '120000'; assert.throws(() => readFixture(f), /symlink/);
});
test('remote rejects tree/list mismatch, byte count and Git content identity mismatch', () => {
  let f = gitFixture(); f.evidence.pop(); assert.throws(() => readFixture(f), /tree\/listed/);
  f = gitFixture(); f.evidence[1].size++; assert.throws(() => readFixture(f), /size differs/);
  for (const change of [b => {b.encoding = 'utf8';}, b => {b.content = '%%%';}, b => {b.sha = 'f'.repeat(40);}, b => {b.content = Buffer.from('xxx').toString('base64');}, b => {b.size = caps.manifest + 1;}]) {f = gitFixture(); change(f.api.get(`repos/${repo}/git/blobs/${f.evidence[0].sha}`)); assert.throws(() => readFixture(f));}
});
test('remote uses only fixed-repository immutable GET routes; recorded command is never executed', t => {
  const marker = path.join(temporary(t), 'MUST_NOT_EXIST'), b = bundle({command: [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)},'oops')`]});
  const f = gitFixture(b); assert.throws(() => readFixture(f)); assert(!fs.existsSync(marker));
  assert(f.requests.length > 4); assert(f.requests.every(endpoint => new RegExp(`^repos/${repo}/git/(?:commits|trees|blobs)/[a-f0-9]{40}$`).test(endpoint)));
});
test('fresh destination is strictly external real RUNNER_TEMP, never source or existing path', t => {
  const base = temporary(t), temp = path.join(base, 'runner-temp'), source = path.join(base, 'source'); fs.mkdirSync(temp); fs.mkdirSync(source);
  const out = path.join(temp, 'admitted'); assert.equal(destination({out, runnerTemp: temp, sourceRoot: source}), out);
  assert(!fs.existsSync(out)); fs.mkdirSync(out); assert.throws(() => destination({out, runnerTemp: temp, sourceRoot: source}), /fresh/);
  for (const out of [path.join(source, 'bad'), path.join(base, 'outside'), temp]) assert.throws(() => destination({out, runnerTemp: temp, sourceRoot: source}));
  const nested = path.join(temp, 'source'); fs.mkdirSync(nested); assert.throws(() => destination({out: path.join(nested, 'bad'), runnerTemp: temp, sourceRoot: nested}), /external/);
});
test('destination rejects alias/junction parents and dangling leaf symlinks', t => {
  const base = temporary(t), temp = path.join(base, 'temp'), source = path.join(base, 'source'), alias = path.join(base, 'alias'); fs.mkdirSync(temp); fs.mkdirSync(source);
  fs.symlinkSync(temp, alias, process.platform === 'win32' ? 'junction' : 'dir'); assert.throws(() => destination({out: path.join(alias, 'admitted'), runnerTemp: temp, sourceRoot: source}), /Symlink/);
  const dangling = path.join(temp, 'dangling'); fs.symlinkSync(path.join(base, 'missing'), dangling, process.platform === 'win32' ? 'junction' : 'dir'); assert.throws(() => destination({out: dangling, runnerTemp: temp, sourceRoot: source}), /fresh/);
});
test('formal CLI rejects offline/local invocation before any download/output', t => {
  const base = temporary(t), out = path.join(base, 'no-output');
  const file = fileURLToPath(new URL('./import-windows-artist-evidence.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [file, '--evidence-commit', evidenceCommit, '--source-sha', sourceSha, '--out', out], {encoding: 'utf8', env: {...process.env, GITHUB_ACTIONS: 'false'}, windowsHide: true, shell: false});
  assert.equal(result.status, 1); assert.match(result.stderr, /disposable Actions/); assert(!fs.existsSync(out)); assert.equal(result.stdout, '');
});
test('formal CLI refuses other repository and workflow/source mismatch before any GET', t => {
  const base = temporary(t), file = fileURLToPath(new URL('./import-windows-artist-evidence.mjs', import.meta.url));
  for (const [name, environment, message] of [
    ['repository', {GITHUB_REPOSITORY: 'attacker/elsewhere', GITHUB_SHA: sourceSha}, /fixed repository/],
    ['source', {GITHUB_REPOSITORY: repo, GITHUB_SHA: evidenceCommit}, /Workflow\/source identity/],
  ]) {
    const out = path.join(base, name), result = spawnSync(process.execPath, [file, '--evidence-commit', evidenceCommit, '--source-sha', sourceSha, '--out', out], {encoding: 'utf8', env: {...process.env, GITHUB_ACTIONS: 'true', ...environment}, windowsHide: true, shell: false});
    assert.equal(result.status, 1); assert.match(result.stderr, message); assert.equal(result.stdout, ''); assert(!fs.existsSync(out));
  }
});
test('production admission rejects explicit unit/mock fixture markers, never accepting missing proof', () => {
  for (const proof of [undefined, null, [], {unitOnly: false}, {unitFixture: true}, {mocktrue: true}, {host: {gpu: 'UNIT_ONLY_GPU_NOT_EXECUTED'}}]) assert.throws(() => assertWindowsArtistProductionProof(proof));
});

// Structure-only roundtrips use a documented hypothetical unit fixture with a
// fixed fake source identity and no process execution. Explicit production unit
// markers are tested as negatives; no fixture is actual native acceptance.
function unitBundle(change) {
  const fixture = createWindowsArtistUnitProof();
  if (change) change(fixture);
  const receipt = windowsArtistScenarioReceipt(fixture.proof, fixture.bindings);
  const b = bundle(fixture.proof, receipt, fixture.artifactBytes);
  Object.assign(b.manifest, {sourceSha: fixture.bindings.sourceSha, profileSha256: fixture.bindings.profileSha256, controllerSources: clone(fixture.bindings.controllerHashes)});
  b.raw = json(b.manifest); return {...b, fixture};
}
function repack(b) {b.manifest.files = [...b.files].map(([path, bytes]) => ({path, bytes: bytes.length, sha256: sha(bytes)})); b.raw = json(b.manifest); return b;}
test('UNIT structural proof and exact factory receipt roundtrip offline returns only non-admissible summary', t => {
  const b = unitBundle(), root = path.join(temporary(t), 'unit'); writeBundle(root, b);
  const result = offline({fixtureRoot: root, bindings: b.fixture.bindings});
  assert.deepEqual(result, {mode: 'offline-unit-validation', admissibleForRelease: false, filesChecked: 10});
  assert(!Object.hasOwn(result, 'receipt')); assert.equal(b.fixture.unitOnly, true);
  const marked = clone(b.fixture.proof); marked.diagnostics = {label: 'UNIT_ONLY_STRUCTURAL_TEST'};
  assert.throws(() => assertWindowsArtistProductionProof(marked), /Unit fixture/);
});
test('UNIT structure also roundtrips immutable fake GET transport without returning native receipt', () => {
  const b = unitBundle(), f = gitFixture(b), result = readFixture(f, {sourceSha: b.fixture.bindings.sourceSha, bindings: b.fixture.bindings});
  assert.deepEqual(result, {mode: 'remote-unit-validation', admissibleForRelease: false, filesChecked: 10}); assert(!Object.hasOwn(result, 'proof'));
});
test('valid outer hashes cannot mask altered exact factory receipt', t => {
  const b = unitBundle(), receipt = JSON.parse(b.files.get('windows-artist-scenarios-receipt.json')); receipt.checks[0].stdout = 'forged'; b.files.set('windows-artist-scenarios-receipt.json', json(receipt)); repack(b);
  const root = path.join(temporary(t), 'unit'); writeBundle(root, b); assert.throws(() => offline({fixtureRoot: root, bindings: b.fixture.bindings}), /exact factory/);
});
test('proof missing scene, fake runtime, dirty source, mock marker and malformed event fail even with new hashes', t => {
  for (const [name, change] of Object.entries({missing: p => {p.nativeCommand.stdout = p.nativeCommand.stdout.replace(/^WINDOWS_ARTIST_CHECK.*\n/m, '');}, runtime: p => {p.host.platform = 'linux';}, dirty: p => {p.sourceAfter.clean = false;}, mock: p => {p.mockedModules = true;}, fixture: p => {p.unitOnly = true;}, unitFixture: p => {p.unitFixture = true;}, unitString: p => {p.diagnostics = {label: 'UNIT_FIXTURE_STRUCTURAL_TEST'};}, controller: p => {p.controllerSources[0].sha256 = 'f'.repeat(64);}, source: p => {p.sourceBefore.sourceSha = 'f'.repeat(40);}, malformed: p => {p.nativeCommand.stdout += 'WINDOWS_ARTIST_CHECK bad\n';}})) {
    const b = unitBundle(), proof = clone(b.fixture.proof); change(proof); b.files.set('controller-proof.json', json(proof)); repack(b);
    const root = path.join(temporary(t), name); writeBundle(root, b); assert.throws(() => offline({fixtureRoot: root, bindings: b.fixture.bindings}), name);
  }
});
test('proof/artifact bindings reject raw report, transport, input and source-summary substitutions', t => {
  for (const name of ['prime-report.json', 'native-report.json', 'tls-requests.json', 'inputs-before.json', 'source-before.json']) {
    const b = unitBundle(), bytes = Buffer.from(name.startsWith('source-') ? '{"clean":true}\n' : 'CHANGED\n');
    b.files.set('data/' + name, bytes);
    // Rehash both outer manifest and inner artifact row, but preserve the native
    // report/transport/input/source observations to require the independent bind.
    const proof = clone(b.fixture.proof), item = proof.artifacts.find(x => x.path === name); item.bytes = bytes.length; item.sha256 = sha(bytes);
    b.files.set('controller-proof.json', json(proof));
    // The exact receipt includes the proof hash and must reflect this proof too.
    try {b.files.set('windows-artist-scenarios-receipt.json', json(windowsArtistScenarioReceipt(proof, b.fixture.bindings)));} catch {}
    repack(b); const root = path.join(temporary(t), name); writeBundle(root, b); assert.throws(() => offline({fixtureRoot: root, bindings: b.fixture.bindings}), name);
  }
});
test('proof rejects missing artifacts and unreferenced extra data even after rehash', t => {
  for (const mode of ['missing', 'extra']) {
    const b = unitBundle(); if (mode === 'missing') b.files.delete('data/selected-image.png'); else b.files.set('data/unreferenced.bin', Buffer.from('must-not-admit'));
    repack(b); const root = path.join(temporary(t), mode); writeBundle(root, b); assert.throws(() => offline({fixtureRoot: root, bindings: b.fixture.bindings}), /artifact|Unreferenced/);
  }
});
test('coherent rehash cannot substitute unrelated input metadata, counts, paths, encoder or runtime', t => {
  const changes = {metadata: i => {i.assetFiles++;}, count: i => {i.files.shift();}, bytes: i => {i.files[0].bytes++;}, encoder: i => {i.files[0].sha256 = 'e'.repeat(64);}, runtime: i => {i.files.at(-1).sha256 = 'e'.repeat(64);}, traversal: i => {i.files[1].path = '../escape';}, duplicate: i => {i.files.push(clone(i.files[0]));}, extra: i => {i.files[0].symlink = true;}};
  for (const [name, change] of Object.entries(changes)) {
    const b = unitBundle(), input = JSON.parse(b.files.get('data/inputs-before.json')); change(input); const bytes = json(input), proof = clone(b.fixture.proof);
    proof.inputs.beforeSha256 = proof.inputs.afterSha256 = sha(bytes);
    for (const file of ['inputs-before.json', 'inputs-after.json']) {b.files.set('data/' + file, bytes); Object.assign(proof.artifacts.find(row => row.path === file), {bytes: bytes.length, sha256: sha(bytes)});}
    b.files.set('controller-proof.json', json(proof)); b.files.set('windows-artist-scenarios-receipt.json', json(windowsArtistScenarioReceipt(proof, b.fixture.bindings))); repack(b);
    const root = path.join(temporary(t), name); writeBundle(root, b); assert.throws(() => offline({fixtureRoot: root, bindings: b.fixture.bindings}), name);
  }
});
