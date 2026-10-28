// Read-only import of public data from one immutable same-repository commit.
// Never checkout/import/evaluate an evidence branch or run its recorded commands.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {profileSha256} from './full-feature-profiles.mjs';
import {assertWindowsArtistProof, windowsArtistScenarioReceipt,
  readWindowsArtistControllerHashes, windowsArtistControllerPaths} from './windows-artist-contract.mjs';

export const windowsArtistEvidenceRepository = 'OldLi1337/novelai-image-desktop';
export const windowsArtistEvidenceDirectory = 'windows-artist-evidence';
export const windowsArtistEvidenceManifestSchema = 'windows-artist-evidence-manifest/v1';
export const windowsArtistEvidenceProof = 'controller-proof.json';
export const windowsArtistEvidenceReceipt = 'windows-artist-scenarios-receipt.json';
export const windowsArtistEvidenceLimits = Object.freeze({manifest: 64 * 1024,
  file: 8 * 1024 * 1024, total: 32 * 1024 * 1024, files: 64});
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hex = (value, n) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${n}}$`).test(value);
const own = (object, names) => {
  assert(object && !Array.isArray(object) && typeof object === 'object');
  assert.deepEqual(Object.keys(object).sort(), [...names].sort(), 'Unexpected evidence schema fields');
};
function json(bytes, limit, label) {
  assert(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= limit, `${label} size exceeds cap`);
  const text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
  assert(text.charCodeAt(0) !== 0xfeff, `${label} UTF-8 BOM is not allowed`);
  return JSON.parse(text);
}
function compactJson(text) {
  let quoted = false, escaped = false, result = '';
  for (const char of text) {
    if (quoted) { result += char; if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; }
    else if (char === '"') {quoted = true; result += char;}
    else if (!/[\t\r\n ]/.test(char)) result += char;
  }
  return result;
}
function relativeFile(value) {
  assert(typeof value === 'string' && value.length <= 160, 'Invalid evidence path');
  if ([windowsArtistEvidenceProof, windowsArtistEvidenceReceipt].includes(value)) return value;
  assert(/^data\/[a-z0-9][a-z0-9.-]{0,100}\.(?:json|txt|bin|png)$/.test(value), 'Only fixed evidence/data paths are permitted');
  const basename = value.slice(5);
  assert(!basename.includes('..') && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(basename), 'Unsafe Windows data basename');
  assert(!/(?:^|[-_])(?:receipt|scenarios)\.json$/i.test(basename), 'Data must not masquerade as recursive native receipts');
  return value;
}
function bindControllers(actual, expected) {
  assert(Array.isArray(expected) && expected.length === 3, 'Three current controller hashes required');
  for (const row of expected) {own(row, ['path', 'sha256']); assert(hex(row.sha256, 64));}
  assert.deepEqual(expected.map(row => row.path), [...windowsArtistControllerPaths], 'Exact current controller paths required');
  assert.deepEqual(actual, expected, 'Evidence controller bytes differ from current candidate');
}
export function validateWindowsArtistEvidenceManifest(bytes, bindings) {
  const manifest = json(bytes, windowsArtistEvidenceLimits.manifest, 'Manifest');
  own(manifest, ['schema', 'sourceSha', 'profileSha256', 'controllerSources', 'files']);
  assert.equal(compactJson(bytes.toString('utf8')), JSON.stringify(manifest), 'Manifest must not contain duplicate or noncanonical JSON values');
  assert.equal(manifest.schema, windowsArtistEvidenceManifestSchema);
  assert(hex(bindings?.sourceSha, 40) && hex(bindings?.profileSha256, 64), 'Immutable source/profile bindings required');
  assert.equal(manifest.sourceSha, bindings.sourceSha, 'Manifest source differs');
  assert.equal(manifest.profileSha256, bindings.profileSha256, 'Manifest profile differs');
  bindControllers(manifest.controllerSources, bindings.controllerHashes);
  assert(Array.isArray(manifest.files) && manifest.files.length >= 2 && manifest.files.length <= windowsArtistEvidenceLimits.files, 'Invalid evidence file count');
  const seen = new Set(); let total = 0;
  for (const row of manifest.files) {
    own(row, ['path', 'bytes', 'sha256']); relativeFile(row.path);
    assert(!seen.has(row.path), 'Duplicate evidence file'); seen.add(row.path);
    assert(Number.isSafeInteger(row.bytes) && row.bytes >= 0 && row.bytes <= windowsArtistEvidenceLimits.file, 'Evidence file size exceeds cap');
    assert(hex(row.sha256, 64), 'Invalid evidence SHA256'); total += row.bytes;
  }
  assert(total <= windowsArtistEvidenceLimits.total, 'Evidence total exceeds cap');
  assert(seen.has(windowsArtistEvidenceProof) && seen.has(windowsArtistEvidenceReceipt), 'Fixed proof/receipt files are required');
  return manifest;
}
function verifyBundle(manifestBytes, files, bindings) {
  const manifest = validateWindowsArtistEvidenceManifest(manifestBytes, bindings);
  assert.deepEqual([...files.keys()].sort(), manifest.files.map(row => row.path).sort(), 'Evidence tree/listed files differ');
  for (const row of manifest.files) {
    const bytes = files.get(row.path); assert(Buffer.isBuffer(bytes));
    assert.equal(bytes.length, row.bytes, `Evidence bytes differ: ${row.path}`);
    assert.equal(digest(bytes), row.sha256, `Evidence hash differs: ${row.path}`);
  }
  const proof = json(files.get(windowsArtistEvidenceProof), windowsArtistEvidenceLimits.file, 'Proof');
  const receipt = json(files.get(windowsArtistEvidenceReceipt), windowsArtistEvidenceLimits.file, 'Receipt');
  assertWindowsArtistProof(proof, bindings);
  assert.deepEqual(receipt, windowsArtistScenarioReceipt(proof, bindings), 'Receipt differs from current exact factory output');
  const artifactPaths = new Set();
  for (const row of proof.artifacts) {
    const relative = relativeFile('data/' + row.path);
    assert(!artifactPaths.has(relative), 'Duplicate proof artifact'); artifactPaths.add(relative);
    const bytes = files.get(relative); assert(Buffer.isBuffer(bytes), `Proof artifact missing: ${relative}`);
    assert.equal(bytes.length, row.bytes, `Proof artifact bytes differ: ${relative}`);
    assert.equal(digest(bytes), row.sha256, `Proof artifact hash differs: ${relative}`);
  }
  assert.deepEqual([...artifactPaths].sort(), [...files.keys()].filter(name => name.startsWith('data/')).sort(), 'Unreferenced data files are forbidden');
  assert.equal(files.get('data/prime-report.json').toString('utf8'), proof.primeReportText, 'Prime report raw bytes differ');
  assert.equal(files.get('data/native-report.json').toString('utf8'), proof.nativeReportText, 'Native report raw bytes differ');
  for (const [name, expected] of [['tls-requests.json', proof.transport.ledgerSha256],
    ['inputs-before.json', proof.inputs.beforeSha256], ['inputs-after.json', proof.inputs.afterSha256]])
    assert.equal(digest(files.get('data/' + name)), expected, `Native observation bytes differ: ${name}`);
  assert.deepEqual(json(files.get('data/tls-requests.json'), windowsArtistEvidenceLimits.file, 'Transport ledger'), proof.transport.requests, 'Raw transport ledger differs from proof observations');
  const inputBefore = json(files.get('data/inputs-before.json'), windowsArtistEvidenceLimits.file, 'Input observations');
  assert.deepEqual(inputBefore, json(files.get('data/inputs-after.json'), windowsArtistEvidenceLimits.file, 'Input observations'), 'Input observations changed');
  assert.equal(inputBefore.schema, 'windows-artist-inputs/v1');
  for (const key of ['manifestSha256', 'encoderSha256', 'assetFiles', 'assetBytes', 'runtimeSha256']) assert.equal(inputBefore[key], proof.inputs[key], 'Raw input metadata differs: ' + key);
  assert(Array.isArray(inputBefore.files) && inputBefore.files.length > 0, 'Raw input file observations required');
  const inputNames = new Set();
  for (const item of inputBefore.files) {
    own(item, ['root', 'path', 'bytes', 'sha256', 'mtimeMs']);
    assert(['assets', 'runtime'].includes(item.root));
    assert(typeof item.path === 'string' && item.path.length > 0 && !/[\\:\u0000-\u001f]/.test(item.path) && !path.posix.isAbsolute(item.path) && item.path.split('/').every(segment => segment && segment !== '.' && segment !== '..'), 'Unsafe observed input path');
    const key = item.root + '/' + item.path; assert(!inputNames.has(key), 'Duplicate observed input'); inputNames.add(key);
    assert(Number.isSafeInteger(item.bytes) && item.bytes >= 0 && hex(item.sha256, 64) && Number.isFinite(item.mtimeMs) && item.mtimeMs >= 0, 'Invalid raw input observation');
  }
  const assets = inputBefore.files.filter(item => item.root === 'assets');
  assert.equal(assets.length, proof.inputs.assetFiles, 'Raw asset count differs');
  assert.equal(assets.reduce((total, item) => total + item.bytes, 0), proof.inputs.assetBytes, 'Raw asset bytes differ');
  assert.equal(assets.find(item => item.path === 'models/artist-style.pt')?.sha256, proof.inputs.encoderSha256, 'Raw encoder identity differs');
  assert(inputBefore.files.some(item => item.root === 'runtime' && item.sha256 === proof.inputs.runtimeSha256), 'Raw Python runtime identity missing');
  for (const name of ['before', 'after']) assert.deepEqual(json(files.get(`data/source-${name}.json`), windowsArtistEvidenceLimits.file, 'Source summary'), proof[name === 'before' ? 'sourceBefore' : 'sourceAfter'], 'Source summary differs');
  return {manifest, files, proof, receipt, manifestBytes};
}
function regularBytes(root, relative, maxBytes) {
  let current = root;
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]); const stat = fs.lstatSync(current);
    assert(!stat.isSymbolicLink(), 'Evidence symlink is forbidden');
    assert(i === parts.length - 1 ? stat.isFile() : stat.isDirectory(), 'Evidence file/directory type differs');
    if (i === parts.length - 1) assert(stat.size <= maxBytes, 'Evidence file size exceeds cap');
  }
  return fs.readFileSync(current);
}
function noSymlinkAncestors(file) {
  let current = path.resolve(file);
  while (true) {
    const stat = fs.lstatSync(current);
    assert(!stat.isSymbolicLink(), 'Symlink/junction ancestor is forbidden');
    if (current === path.dirname(current)) break;
    current = path.dirname(current);
  }
}
// Unit/negative inspection only: deliberately no output argument or admitted receipt.
export function validateOfflineWindowsArtistEvidence({fixtureRoot, bindings}) {
  const root = path.resolve(fixtureRoot); noSymlinkAncestors(root); assert(fs.lstatSync(root).isDirectory(), 'Fixture root must be a directory');
  const raw = regularBytes(root, 'manifest.json', windowsArtistEvidenceLimits.manifest);
  const manifest = validateWindowsArtistEvidenceManifest(raw, bindings), files = new Map();
  const expected = new Set(['manifest.json', ...manifest.files.map(row => row.path)]), actual = [];
  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      assert(!entry.isSymbolicLink(), 'Evidence symlink is forbidden'); const name = prefix + entry.name;
      if (entry.isDirectory()) {assert.equal(name, 'data', 'Unexpected evidence directory'); walk(path.join(dir, entry.name), name + '/');}
      else {assert(entry.isFile() && expected.has(name), 'Unlisted evidence file'); actual.push(name);}
    }
  }
  walk(root); assert.deepEqual(actual.sort(), [...expected].sort(), 'Evidence tree/listed files differ');
  for (const row of manifest.files) files.set(row.path, regularBytes(root, row.path, windowsArtistEvidenceLimits.file));
  verifyBundle(raw, files, bindings);
  return {mode: 'offline-unit-validation', admissibleForRelease: false, filesChecked: files.size};
}
function gitBlob(body, oid, cap) {
  assert(body && body.sha === oid && body.encoding === 'base64', 'Git blob identity/encoding differs');
  assert(Number.isSafeInteger(body.size) && body.size >= 0 && body.size <= cap, 'Git blob size exceeds cap');
  assert(typeof body.content === 'string' && body.content.length <= Math.ceil(cap / 3) * 4 + cap / 20 + 4096, 'Git blob content exceeds cap');
  const encoded = body.content.replace(/[\r\n]/g, '');
  assert(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded), 'Invalid Git base64');
  const bytes = Buffer.from(encoded, 'base64'); assert.equal(bytes.toString('base64'), encoded, 'Noncanonical Git base64');
  assert.equal(bytes.length, body.size, 'Git blob byte count differs');
  assert.equal(crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex'), oid, 'Git blob SHA1 differs');
  return bytes;
}
function readRemoteWindowsArtistEvidence({evidenceCommit, sourceSha, bindings, readApi}) {
  assert(hex(evidenceCommit, 40) && hex(sourceSha, 40), 'Only immutable 40hex commits are permitted');
  assert.equal(bindings?.sourceSha, sourceSha, 'Candidate/source binding differs');
  const api = (kind, oid, cap = 2 * 1024 * 1024) => {
    assert(hex(oid, 40)); return readApi(`repos/${windowsArtistEvidenceRepository}/git/${kind}/${oid}`, cap);
  };
  const candidate = api('commits', sourceSha); assert.equal(candidate.sha, sourceSha, 'Candidate commit does not belong to fixed repository');
  const commit = api('commits', evidenceCommit); assert.equal(commit.sha, evidenceCommit, 'Evidence commit differs'); assert(hex(commit.tree?.sha, 40));
  function tree(oid) {
    const body = api('trees', oid); assert.equal(body.sha, oid); assert.equal(body.truncated, false, 'Truncated Git tree is forbidden');
    assert(Array.isArray(body.tree) && body.tree.length <= 4096); const names = new Set();
    for (const entry of body.tree) {assert(typeof entry.path === 'string' && !entry.path.includes('/') && !entry.path.includes('\\') && entry.path !== '.' && entry.path !== '..'); assert(!names.has(entry.path)); names.add(entry.path); assert(hex(entry.sha, 40));}
    return body.tree;
  }
  const root = tree(commit.tree.sha), directory = root.find(entry => entry.path === windowsArtistEvidenceDirectory);
  assert(directory?.type === 'tree' && directory.mode === '040000', 'Fixed evidence directory must be a real Git tree');
  const entries = tree(directory.sha), manifestEntry = entries.find(entry => entry.path === 'manifest.json');
  assert(manifestEntry?.mode === '100644' && manifestEntry.type === 'blob', 'Manifest must be a regular non-executable Git blob');
  const raw = gitBlob(api('blobs', manifestEntry.sha, 2 * windowsArtistEvidenceLimits.manifest + 4096), manifestEntry.sha, windowsArtistEvidenceLimits.manifest);
  const manifest = validateWindowsArtistEvidenceManifest(raw, bindings), indexed = new Map();
  for (const entry of entries) {
    if (entry.path === 'manifest.json') continue;
    if (entry.path === 'data') {
      assert(entry.type === 'tree' && entry.mode === '040000', 'Data must be a real Git tree');
      for (const item of tree(entry.sha)) {relativeFile('data/' + item.path); assert(item.mode === '100644' && item.type === 'blob', 'Data symlink/executable/subtree is forbidden'); indexed.set('data/' + item.path, item);}
    } else {relativeFile(entry.path); assert(entry.mode === '100644' && entry.type === 'blob', 'Proof/receipt symlink/executable is forbidden'); indexed.set(entry.path, entry);}
  }
  assert.deepEqual([...indexed.keys()].sort(), manifest.files.map(row => row.path).sort(), 'Git tree/listed files differ');
  const files = new Map();
  for (const row of manifest.files) {
    const entry = indexed.get(row.path); assert.equal(entry.size, row.bytes, 'Git tree file size differs');
    files.set(row.path, gitBlob(api('blobs', entry.sha, 2 * row.bytes + 4096), entry.sha, Math.min(row.bytes, windowsArtistEvidenceLimits.file)));
  }
  return verifyBundle(raw, files, bindings);
}
// Test transport is deliberately validation-only: it cannot return or write an
// admissible native receipt. Only main() owns the real fixed-host GET transport.
export function validateRemoteWindowsArtistEvidenceFixture(options) {
  const bundle = readRemoteWindowsArtistEvidence(options);
  return {mode: 'remote-unit-validation', admissibleForRelease: false, filesChecked: bundle.files.size};
}
export function assertWindowsArtistProductionProof(proof) {
  assert(proof && typeof proof === 'object' && !Array.isArray(proof));
  const text = JSON.stringify(proof);
  assert(!/(?:UNIT_ONLY|"unitOnly"\s*:|"unitFixture"\s*:|"mocktrue"\s*:)/.test(text), 'Unit fixture data cannot be admitted as real GPU evidence');
}
function within(root, child) {const relative = path.relative(root, child); return Boolean(relative) && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);}
export function validateWindowsArtistImportDestination({out, runnerTemp, sourceRoot}) {
  assert(path.isAbsolute(out) && runnerTemp && path.isAbsolute(runnerTemp), 'Absolute RUNNER_TEMP destination required');
  noSymlinkAncestors(runnerTemp); noSymlinkAncestors(path.dirname(out));
  const temp = fs.realpathSync(runnerTemp), parent = fs.realpathSync(path.dirname(out)), source = fs.realpathSync(sourceRoot);
  assert(fs.statSync(temp).isDirectory() && fs.statSync(parent).isDirectory() && fs.statSync(source).isDirectory(), 'Real import/source directories required');
  assert((parent === temp || within(temp, parent)) && parent !== source && !within(source, parent), 'Import destination must be external real RUNNER_TEMP');
  const destination = path.join(parent, path.basename(out));
  assert(within(temp, destination) && destination !== source && !within(source, destination), 'Import destination must be strictly inside external RUNNER_TEMP');
  assert(!fs.lstatSync(destination, {throwIfNoEntry: false}), 'Import destination must be fresh');
  return destination;
}
function currentBindings(sourceRoot, sourceSha) {
  function git(args, cap = 8 * 1024 * 1024) {
    const row = spawnSync('git', ['--no-optional-locks', '-C', sourceRoot, ...args], {encoding: 'buffer', timeout: 30000, maxBuffer: cap, windowsHide: true, shell: false, env: {...process.env, GIT_OPTIONAL_LOCKS: '0'}});
    assert(row.status === 0 && !row.error, 'Current source Git identity command failed'); return row.stdout;
  }
  assert.equal(fs.realpathSync(git(['rev-parse', '--show-toplevel']).toString().trim()), fs.realpathSync(sourceRoot));
  assert.equal(git(['rev-parse', 'HEAD']).toString().trim(), sourceSha, 'Current HEAD differs from source SHA');
  assert.equal(git(['status', '--porcelain=v1', '-z', '--untracked-files=all']).length, 0, 'Current source must be pristine');
  const controllerHashes = readWindowsArtistControllerHashes(sourceRoot);
  for (const row of controllerHashes) assert.equal(digest(git(['show', sourceSha + ':' + row.path])), row.sha256, 'Current controller raw bytes differ from HEAD');
  return {sourceSha, profileSha256, controllerHashes};
}
export function parseWindowsArtistImportArgs(args) {
  assert.equal(args.length, 6, 'Expected --evidence-commit SHA --source-sha SHA --out ABS_PATH; offline/URL/branch inputs are forbidden');
  const values = {};
  for (let i = 0; i < args.length; i += 2) {assert(['--evidence-commit', '--source-sha', '--out'].includes(args[i]) && !Object.hasOwn(values, args[i]), 'Unsupported/duplicate import option'); values[args[i]] = args[i + 1];}
  assert(hex(values['--evidence-commit'], 40) && hex(values['--source-sha'], 40), 'Only immutable 40hex commits are permitted');
  assert(typeof values['--out'] === 'string' && path.isAbsolute(values['--out'])); return values;
}
async function main() {
  const values = parseWindowsArtistImportArgs(process.argv.slice(2)), sourceSha = values['--source-sha'];
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Formal import is limited to disposable Actions');
  assert.equal(process.env.GITHUB_REPOSITORY, windowsArtistEvidenceRepository, 'Formal import is limited to the fixed repository');
  assert.equal(process.env.GITHUB_SHA, sourceSha, 'Workflow/source identity differs');
  const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
  const out = validateWindowsArtistImportDestination({out: values['--out'], runnerTemp: process.env.RUNNER_TEMP, sourceRoot});
  const bindings = currentBindings(sourceRoot, sourceSha), commands = [], deadline = Date.now() + 600000;
  const readApi = (endpoint, cap) => {
    assert(new RegExp(`^repos/${windowsArtistEvidenceRepository}/git/(?:commits|trees|blobs)/[a-f0-9]{40}$`).test(endpoint));
    const timeout = Math.min(30000, deadline - Date.now()); assert(timeout > 0, 'Evidence GET deadline exceeded');
    const argv = ['api', '--method', 'GET', '--hostname', 'github.com', endpoint];
    const row = spawnSync('gh', argv, {timeout, maxBuffer: cap, windowsHide: true, shell: false});
    const stdout = row.stdout ?? Buffer.alloc(0), stderr = row.stderr ?? Buffer.alloc(0);
    commands.push({command: ['gh', ...argv], exitStatus: row.status, stdoutBytes: stdout.length,
      stdoutSha256: digest(stdout), stderr: stderr.toString('utf8'), error: row.error?.message ?? null});
    assert(row.status === 0 && !row.error && stdout.length <= cap, 'Fixed-repository evidence GET failed/capped');
    return json(stdout, cap, 'GitHub response');
  };
  const bundle = readRemoteWindowsArtistEvidence({evidenceCommit: values['--evidence-commit'], sourceSha, bindings, readApi});
  assertWindowsArtistProductionProof(bundle.proof);
  // No untrusted download bytes are written before the complete proof, current
  // controller binding and exact factory receipt have all passed.
  const rows = [['manifest.json', bundle.manifestBytes], ...bundle.files], written = [];
  const parent = path.dirname(out), stage = path.join(parent, '.windows-artist-import-' + crypto.randomUUID());
  assert(within(parent, stage) && !fs.lstatSync(stage, {throwIfNoEntry: false}));
  fs.mkdirSync(stage, {mode: 0o700});
  try {
    for (const [relative, bytes] of rows) {
      if (relative !== 'manifest.json') relativeFile(relative);
      const file = path.join(stage, ...relative.split('/')); if (relative.startsWith('data/')) fs.mkdirSync(path.join(stage, 'data'), {mode: 0o700, recursive: true});
      fs.writeFileSync(file, bytes, {flag: 'wx', mode: 0o600});
      const reopened = fs.readFileSync(file); assert.equal(digest(reopened), digest(bytes)); written.push({path: relative, bytes: reopened.length, sha256: digest(reopened)});
    }
    fs.writeFileSync(path.join(stage, 'IMPORT_METADATA.json'), JSON.stringify({schema: 'windows-artist-data-import/v1',
      repository: windowsArtistEvidenceRepository, evidenceCommit: values['--evidence-commit'], sourceSha,
      executionOrigin: 'local-windows-gpu', hostedExecution: false, importedBy: 'read-only-actions-importer',
      controllerSources: bindings.controllerHashes, files: written, readOnlyGetCommands: commands}, null, 2) + '\n', {flag: 'wx', mode: 0o600});
    assert(!fs.lstatSync(out, {throwIfNoEntry: false}), 'Import destination collided during validation');
    fs.renameSync(stage, out);
  } finally {
    if (fs.lstatSync(stage, {throwIfNoEntry: false})) {
      assert(within(parent, stage) && path.basename(stage).startsWith('.windows-artist-import-') && !fs.lstatSync(stage).isSymbolicLink(), 'Unsafe temporary import cleanup');
      fs.rmSync(stage, {recursive: true, force: false});
    }
  }
  console.log('WINDOWS_ARTIST_EVIDENCE_IMPORTED ' + JSON.stringify({out, sourceSha, evidenceCommit: values['--evidence-commit'], executionOrigin: 'local-windows-gpu', hostedExecution: false, files: written.length}));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {console.error(error.stack || String(error)); process.exitCode = 1;});
