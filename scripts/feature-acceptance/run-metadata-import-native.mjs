import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { finished } from 'node:stream/promises';
import {pathToFileURL} from 'node:url';
import {profileSha256} from './full-feature-profiles.mjs';

export const METADATA_IMPORT_ENTRY='metadata_import3';
export const METADATA_IMPORT_TEST_FILE='integration_test/native_metadata_import_scenarios.dart';
export const METADATA_IMPORT_SCENARIOS=Object.freeze([
  'default-online-local-bytes','offline-and-selected-apply','formats-error-cancel-no-upload',
]);
export const METADATA_IMPORT_ASSET_IDS=Object.freeze([
  'png-text','exif','importer','codec','png-wrapper','webp-wrapper','alpha-helper','buffer-runtime','png-wasm','webp-wasm',
]);
export const METADATA_IMPORT_FIXTURES=Object.freeze([
  'rgba-8-plain.png','webp-lossless-alpha.webp','png-text-plus-stealth.png',
]);
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

// Pure admission policy is called before any Git/device/asset command. It never
// authorizes a native pass: the original recording runner still checks the real
// device inventory, source, native process, protocol and fixed profile receipt.
export function validateMetadataImportInput(input,{ciMode=process.env.GITHUB_ACTIONS==='true',hostPlatform=process.platform}={}) {
  if(input.entry!==METADATA_IMPORT_ENTRY||input.testFile!==METADATA_IMPORT_TEST_FILE||input.expectedChecks!==3||input.profileSha256!==profileSha256)throw Error('Fixed metadata_import3 entry/testFile/count/profile required.');
  if(input.isolated!==true||!['android','ios'].includes(input.platform))throw Error('An explicitly disposable Android emulator/iOS simulator is required.');
  if(input.platform==='android'&&!/^emulator-\d+$/.test(input.device))throw Error('Physical Android devices are forbidden.');
  if(input.platform==='ios'&&hostPlatform!=='darwin')throw Error('iOS requires a macOS host and a verified booted simulator.');
  if(!ciMode&&(input.platform!=='android'||input.device!=='emulator-5586'))throw Error('Local runs remain locked to the NEW disposable emulator-5586.');
  if(!ciMode&&(input.sourceSha!=='uncommitted'||!/^[a-f0-9]{64}$/.test(input.sourceSnapshotSha256??'')))throw Error('Local builds require uncommitted plus their real snapshot hash.');
  if(ciMode&&!/^[a-f0-9]{40}$/i.test(input.sourceSha??''))throw Error('CI sourceSha must be actual Git HEAD.');
}

export function parseMetadataImportAssets(inventory) {
  const rows=[...inventory.matchAll(/OfficialMetadataAsset\('([^']+)','([^']+)',(\d+),'([a-f0-9]{64})','([^']+)'\)/g)];
  if(rows.length!==10)throw Error('Expected ten pinned public assets');
  const seen=new Set(),assets=[];
  for(const [,id,url,size,sha256] of rows){
    const parsed=new URL(url);
    if(!METADATA_IMPORT_ASSET_IDS.includes(id)||seen.has(id)||!Number.isSafeInteger(Number(size))||Number(size)<=0||parsed.origin!=='https://novelai.net'||!parsed.pathname.startsWith('/_next/static/')||parsed.username||parsed.password)throw Error('Non-fixed asset inventory');
    seen.add(id);assets.push({id,url,bytes:Number(size),sha256});
  }
  return assets;
}
export function verifyMetadataImportAsset(bytes,asset) {
  if(bytes.length!==asset.bytes||digest(bytes)!==asset.sha256)throw Error(`Pinned asset mismatch ${asset.id}`);
  return bytes;
}
export function loadMetadataImportSamples(project,officialAssetsRoot) {
  const inventory=fs.readFileSync(path.join(project,'lib/images/official_metadata_assets.dart'),'utf8');
  const assets=new Map();
  for(const asset of parseMetadataImportAssets(inventory))assets.set(`/assets/${asset.id}`,verifyMetadataImportAsset(fs.readFileSync(path.join(officialAssetsRoot,asset.id)),asset));
  for(const name of METADATA_IMPORT_FIXTURES)assets.set(`/fixtures/${name}`,fs.readFileSync(path.join(project,'..','shared','official-image-metadata-fixtures',name)));
  return assets;
}
export function metadataImportTransportHandler(assets,requests) {
  return (request,response)=>{
    const bytes=assets.get(request.url);
    const record={method:request.method,path:request.url,authorized:request.method==='GET'&&!!bytes,
      requestBodyAccepted:false,bytesSent:request.method==='GET'&&bytes?bytes.length:0,
      responseSha256:request.method==='GET'&&bytes?digest(bytes):null};
    requests.push(record);
    if(request.method!=='GET'){response.writeHead(405);response.end();return;}
    if(!bytes){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':bytes.length});response.end(bytes);
  };
}
export function validateMetadataImportReceipt(receipt,input) {
  if(receipt.entry!==METADATA_IMPORT_ENTRY||receipt.expectedChecks!==3||receipt.sourceSha!==input.sourceSha||receipt.platform!==input.platform||receipt.device!==input.device||receipt.appId!==input.appId||receipt.isolated!==true||receipt.exitStatus!==0||receipt.completeFeatureRowsCertified!==0||receipt.full195Certified!==false||!Array.isArray(receipt.checks)||receipt.checks.length!==3)throw Error('Unexpected bounded identity/check count or overclaimed certification');
  const done=receipt.nativeCompletion;
  if(done?.sourceSha!==input.sourceSha||done?.platform!==input.platform||done?.profileSha!==profileSha256||done?.checks!==3||done?.exitStatus!==0||done?.paidCalls!==0)throw Error('Metadata native completion/profile mismatch');
  const begin=receipt.nativeBegin;
  if(begin?.sourceSha!==input.sourceSha||begin?.profileSha!==profileSha256||begin?.platform!==input.platform||begin?.testEntry!==METADATA_IMPORT_ENTRY||begin?.expectedChecks!==3||begin?.kind!=='device'||begin?.nativeOnly!==true||begin?.mockOnly!==false||begin?.paidCalls!==0||!Number.isSafeInteger(begin?.nativePid)||begin.nativePid<=0||receipt.nativeRuntime?.type!=='flutter'||typeof receipt.nativeRuntime.version!=='string'||!receipt.nativeRuntime.version)throw Error('Metadata native BEGIN/runtime identity mismatch');
  const seen=new Set();
  for(const check of receipt.checks){
    if(check.feature!=='metadata-import'||!METADATA_IMPORT_SCENARIOS.includes(check.scenario)||seen.has(check.scenario)||check.sourceSha!==input.sourceSha||check.platform!==input.platform||check.profileSha!==profileSha256||check.kind!=='device'||check.status!=='passed'||check.mockOnly!==false||check.paidCalls!==0||check.exitStatus!==0||check.skipped!==false||check.acceptanceLevel!=='scenario'||!check.observed||typeof check.observed!=='object'||Array.isArray(check.observed)||!Object.keys(check.observed).length)throw Error('Metadata native scenario/profile identity mismatch');
    seen.add(check.scenario);
  }
}

export async function runMetadataImportNative(inputArgument) {
// Separate disposable-device component entry, not a replacement release gate.
// Keep the event loop alive while the recording runner invokes native Flutter.
const inputPath = path.resolve(inputArgument);
const inputBytes = fs.readFileSync(inputPath);
const input = JSON.parse(inputBytes.toString('utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const output = path.resolve(input.outputRoot);
fs.mkdirSync(output, { recursive: true });
const requests = [], commands = [];
let server, status = 1, failure, reverseAdded = false;
const ciMode = process.env.GITHUB_ACTIONS === 'true';
const command = argv => {
  const r = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', timeout: 30000 });
  commands.push({ argv, stdout: r.stdout ?? '', stderr: r.stderr ?? '', exit: r.status, error: r.error?.message ?? null });
  if (r.status !== 0) throw new Error(`Command failed: ${argv.join(' ')}: ${r.stderr}`);
};
try {
  validateMetadataImportInput(input);
  if (!input.isolated || !['android', 'ios'].includes(input.platform)) throw new Error('An explicitly disposable Android emulator/iOS simulator is required.');
  if (!ciMode && (input.platform !== 'android' || input.device !== 'emulator-5586')) throw new Error('Local runs remain locked to the NEW disposable emulator-5586.');
  if (!ciMode && (input.sourceSha !== 'uncommitted' || !/^[a-f0-9]{64}$/.test(input.sourceSnapshotSha256 ?? ''))) throw new Error('Local builds require uncommitted plus their real snapshot hash.');
  if (input.platform === 'android' && !/^emulator-\d+$/.test(input.device)) throw new Error('Physical Android devices are forbidden.');
  if (input.platform === 'ios' && process.platform !== 'darwin') throw new Error('iOS requires a macOS host and a verified booted simulator.');
  const source = path.resolve(input.sourceRoot);
  const project = path.resolve(input.projectRoot);
  if (ciMode) {
    if (!/^[a-f0-9]{40}$/i.test(input.sourceSha ?? '')) throw new Error('CI sourceSha must be actual Git HEAD.');
    const top = spawnSync('git', ['-C', source, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    commands.push({ argv: ['git', '-C', source, 'rev-parse', '--show-toplevel'], stdout: top.stdout ?? '', stderr: top.stderr ?? '', exit: top.status });
    const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
    if (top.status !== 0 || !samePath(fs.realpathSync(top.stdout.trim()), fs.realpathSync(source)) ||
        !samePath(fs.realpathSync(project), fs.realpathSync(path.join(source, 'mobile')))) throw new Error('CI must use the actual checkout root/mobile, not an ancestor Git repository or another build tree.');
    const head = spawnSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
    commands.push({ argv: ['git', '-C', source, 'rev-parse', 'HEAD'], stdout: head.stdout ?? '', stderr: head.stderr ?? '', exit: head.status });
    if (head.status !== 0 || head.stdout.trim().toLowerCase() !== input.sourceSha.toLowerCase()) throw new Error('CI sourceSha does not match the actual checkout HEAD.');
    // Preserve literal dirty inputs/diffs before the unchanged fail-closed guard.
    const evidenceCommands = [];
    function gitEvidence(args, file) {
      const argv = ['git', '-C', source, ...args];
      const result = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', timeout: 30000, maxBuffer: 80 * 1024 * 1024 });
      const row = { argv, stdout: result.stdout ?? '', stderr: result.stderr ?? '', exitStatus: result.status, error: result.error?.message ?? null };
      evidenceCommands.push(row); fs.writeFileSync(path.join(output, file), row.stdout);
      if (row.exitStatus !== 0 || row.error) throw new Error('Cannot record exact dirty source evidence.');
      return row.stdout;
    }
    const names = gitEvidence(['diff', '--name-only', 'HEAD', '--'], 'dirty-source-names.txt');
    gitEvidence(['diff', '--binary', 'HEAD', '--'], 'dirty-source.patch');
    gitEvidence(['diff', '--cached', '--binary', 'HEAD', '--'], 'dirty-source-index.patch');
    const tracked = gitEvidence(['ls-files', '--stage', '-z'], 'dirty-source-tracked.txt');
    const files = tracked.split('\0').filter(Boolean).map(record => {
      const match = /^([0-7]{6}) ([a-f0-9]{40}) ([0-3])\t([\s\S]+)$/.exec(record);
      if (!match || match[3] !== '0') throw new Error('Invalid tracked source index.');
      const file = path.join(source, match[4]);
      const exists = fs.lstatSync(file, { throwIfNoEntry: false });
      const bytes = exists ? (match[1] === '120000' ? fs.readlinkSync(file, { encoding: 'buffer' }) : fs.readFileSync(file)) : null;
      return { path: match[4], mode: match[1], indexOid: match[2], exists: bytes !== null, bytes: bytes?.length ?? null, sha256: bytes ? hash(bytes) : null };
    });
    const dirtyEvidence = { sourceRoot: source, sourceSha: input.sourceSha, names, files, commands: evidenceCommands, boundary: 'Raw evidence, not a whitelist, restore, or acceptance of generated changes.' };
    const evidencePath = path.join(output, 'dirty-source-evidence.json');
    fs.writeFileSync(evidencePath, JSON.stringify(dirtyEvidence, null, 2) + '\n');
    if (JSON.parse(fs.readFileSync(evidencePath, 'utf8')).files.length !== files.length) throw new Error('Dirty evidence readback failed.');
    commands.push(...evidenceCommands);
    command(['git', '-C', source, 'diff', '--quiet', 'HEAD', '--']);
  }
  const assets = loadMetadataImportSamples(project, input.officialAssetsRoot);
  if (input.platform === 'android') {
    const start = spawnSync(input.adb, ['-s', input.device, 'shell', 'getprop', 'ro.kernel.qemu'], { encoding: 'utf8' });
    commands.push({ argv: [input.adb, '-s', input.device, 'shell', 'getprop', 'ro.kernel.qemu'], stdout: start.stdout ?? '', stderr: start.stderr ?? '', exit: start.status });
    if (start.status !== 0 || start.stdout.trim() !== '1') throw new Error('Disposable native emulator is not running');
  }
  // The shared recording runner additionally verifies Android boot/qemu or the
  // actual available/booted iOS Simulator inventory before install/launch.
  server = http.createServer(metadataImportTransportHandler(assets, requests));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(18786, '127.0.0.1', resolve); });
  if (input.platform === 'android') {
    command([input.adb, '-s', input.device, 'reverse', 'tcp:18786', 'tcp:18786']);
    reverseAdded = true;
  }
  const nativeInput = { ...input, testFile: METADATA_IMPORT_TEST_FILE };
  const nativeInputPath = path.join(output, 'native-execution-input.json');
  fs.writeFileSync(nativeInputPath, JSON.stringify(nativeInput, null, 2));
  const core = path.join(source, 'scripts/feature-acceptance/run-mobile-native.mjs');
  const argv = [process.execPath, core, nativeInputPath];
  const stdout = fs.createWriteStream(path.join(output, 'runner.stdout.txt'));
  const stderr = fs.createWriteStream(path.join(output, 'runner.stderr.txt'));
  const result = await new Promise(resolve => {
    const child = spawn(argv[0], argv.slice(1), { cwd: project, env: { ...process.env, STUDIO_NODE_BINARY: process.execPath } });
    child.stdout.on('data', data => { stdout.write(data); process.stdout.write(data); });
    child.stderr.on('data', data => { stderr.write(data); process.stderr.write(data); });
    let childError;
    child.on('error', error => { childError = error.message; });
    child.on('close', (exit, signal) => resolve({ exit, signal, error: childError ?? null }));
  });
  stdout.end(); stderr.end();
  await Promise.all([finished(stdout), finished(stderr)]);
  const streamReadback = ['runner.stdout.txt', 'runner.stderr.txt'].map(name => {
    const bytes = fs.readFileSync(path.join(output, name));
    return { path: path.join(output, name), bytes: bytes.length, sha256: hash(bytes) };
  });
  commands.push({ argv, cwd: project, ...result, streamReadback });
  if (result.exit !== 0) throw new Error(`Native metadata/import component runner failed exit ${result.exit}`);
  const receipt = JSON.parse(fs.readFileSync(path.join(output, 'native-mobile-receipt.json'), 'utf8'));
  validateMetadataImportReceipt(receipt, input);
  if (requests.some(r => r.method !== 'GET' || !r.authorized)) throw new Error('Unexpected transport request; no image upload is permitted');
  status = 0;
} catch (error) { failure = error.stack || String(error); process.stderr.write(`${failure}\n`); }
finally {
  if (server) await new Promise(resolve => server.close(resolve));
  // Removing this one reverse mapping is confined to the new disposable AVD.
  if (reverseAdded) {
    try { command([input.adb, '-s', input.device, 'reverse', '--remove', 'tcp:18786']); } catch (error) { commands.push({ cleanupError: error.message }); }
  }
  const receipt = { inputPath, inputSha256: hash(inputBytes), sourceSha: input.sourceSha, ciMode,
    entry: METADATA_IMPORT_ENTRY, testFile: METADATA_IMPORT_TEST_FILE, profileSha256: input.profileSha256, expectedChecks: 3,
    sourceSnapshotSha256: input.sourceSnapshotSha256, commands, requests, exit: status, failure: failure ?? null,
    officialAssetTransport: 'controlled loopback GET of separately verified real public bytes; not a live CDN connectivity test',
    imagesUploaded: 0, paidCalls: 0, full195Certified: false, completeFeatureRowsCertified: 0 };
  const file = path.join(output, 'metadata-import-transport.json');
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2));
  console.log(`TRANSPORT_RECEIPT ${file} SHA256=${hash(fs.readFileSync(file))} EXIT=${status}`);
  process.exitCode = status;
}

}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runMetadataImportNative(process.argv[2]);
