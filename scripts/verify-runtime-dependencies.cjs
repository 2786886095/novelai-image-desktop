// Build-time inspection only: never load packaged application code or native modules.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('@electron/asar');

function fail(details) {
  const error = new Error('Packaged runtime dependency closure is incomplete: ' +
    [...details.missingRequired.map(x => `${x.from} -> ${x.name}`), ...details.invalidUnpacked.map(x => x.path)].join(', '));
  error.code = 'PACKAGED_RUNTIME_DEPENDENCY_CLOSURE';
  error.details = details;
  throw error;
}
function applies(rules, target) {
  if (!Array.isArray(rules) || rules.length === 0) return true;
  if (rules.includes('!' + target)) return false;
  const positive = rules.filter(x => typeof x === 'string' && !x.startsWith('!'));
  return positive.length === 0 || positive.includes(target);
}
function targetCpus(arch) {
  const value = typeof arch === 'number' ? ['ia32', 'x64', 'armv7l', 'arm64', 'universal'][arch] : arch || process.arch;
  if (value === 'universal') return ['x64', 'arm64'];
  if (!['ia32', 'x64', 'armv7l', 'arm64'].includes(value)) throw new Error('Unsupported packaging target architecture');
  return [value];
}
function within(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function safeName(name) {
  return typeof name === 'string' && name.length > 0 && !name.includes('\\') && !name.includes(':') &&
    name.split('/').every(part => part && part !== '.' && part !== '..');
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function physicalPackageFile(projectDir, from, name) {
  let current = path.join(projectDir, ...from.split('/').filter(Boolean));
  while (within(projectDir, current)) {
    if (path.basename(current) !== 'node_modules') {
      const candidate = path.join(current, 'node_modules', ...name.split('/'), 'package.json');
      if (fs.existsSync(candidate)) return candidate;
    }
    if (current === projectDir) break;
    current = path.dirname(current);
  }
  return null;
}
function physicalPackage(projectDir, from, name) {
  const file = physicalPackageFile(projectDir, from, name);
  return file ? readJson(file) : null;
}
function verifiedTypeOnlyPeer(projectDir, from, name) {
  try {
    const file = physicalPackageFile(projectDir, from, name);
    if (!file) return false;
    const directory = path.dirname(file), pkg = readJson(file);
    const types = pkg.types || pkg.typings;
    if (typeof types !== 'string' || !types.endsWith('.d.ts') || pkg.main || pkg.module) return false;
    const declaration = path.resolve(directory, types);
    if (!within(directory, declaration) || !fs.statSync(declaration).isFile()) return false;
    // A peer's name or type hint is not sufficient: prove the installed tree is
    // physical and contains no JavaScript/native runtime before excusing it.
    if (!within(projectDir, fs.realpathSync(directory))) return false;
    const pending = [directory];
    let entries = 0;
    while (pending.length) {
      const current = pending.pop(), stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || ++entries > 10000) return false;
      if (stat.isDirectory()) for (const child of fs.readdirSync(current)) pending.push(path.join(current, child));
      else if (!stat.isFile() || /\.(?:js|mjs|cjs|node)$/i.test(current)) return false;
    }
    return true;
  } catch { return false; } // Unproven/missing types remain a hard missing peer.
}
async function verifyRuntimeDependencies(context) {
  const platform = context.electronPlatformName;
  if (!['win32', 'darwin', 'linux'].includes(platform)) throw new Error('Unsupported packaging target platform');
  const cpus = targetCpus(context.arch);
  const projectDir = path.resolve(context.packager.projectDir);
  const resources = typeof context.packager.getResourcesDir === 'function'
    ? context.packager.getResourcesDir(context.appOutDir)
    : platform !== 'darwin' ? path.join(context.appOutDir, 'resources') : null;
  if (!resources) throw new Error('Missing macOS resources-directory resolver');
  const archive = path.join(resources, 'app.asar');
  const unpacked = archive + '.unpacked';
  const details = { missingRequired: [], invalidUnpacked: [], skips: [] };
  const config = readJson(path.join(projectDir, 'package.json')).build || {};
  const platformConfig = config[platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux'] || {};
  const configuredFiles = [...(Array.isArray(config.files) ? config.files : []), ...(Array.isArray(platformConfig.files) ? platformConfig.files : [])];
  // This pre-existing browser-only ONNX build is deliberately excluded. No other
  // required dependency may be excused by a files negation or by being optional elsewhere.
  const browserOnnxExcluded = configuredFiles.includes('!node_modules/onnxruntime-web/**');
  const packages = new Map();
  const entries = asar.listPackage(archive).map(name => name.replace(/^[/\\]+/, '').replace(/\\/g, '/'));
  const seenNames = new Set();
  for (const name of entries) {
    if (!safeName(name) || seenNames.has(platform === 'win32' ? name.toLowerCase() : name)) throw new Error('Unsafe or duplicate ASAR member');
    seenNames.add(platform === 'win32' ? name.toLowerCase() : name);
    const stat = asar.statFile(archive, path.normalize(name), false);
    if ('link' in stat) throw new Error('Unexpected ASAR link: ' + name);
    if ('files' in stat) continue;
    if (stat.unpacked) {
      try {
        const rootStat = fs.lstatSync(unpacked);
        if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('unpacked root is not a physical directory');
        let actual = unpacked;
        for (const component of name.split('/')) {
          actual = path.join(actual, component);
          if (fs.lstatSync(actual).isSymbolicLink()) throw new Error('unpacked link');
        }
        const actualStat = fs.lstatSync(actual);
        if (!actualStat.isFile() || !within(fs.realpathSync(unpacked), fs.realpathSync(actual)) || actualStat.size !== stat.size) throw new Error('unpacked member size/type mismatch');
        if (stat.integrity) {
          if (stat.integrity.algorithm !== 'SHA256' || !/^[a-f0-9]{64}$/i.test(stat.integrity.hash)) throw new Error('unrecognized unpacked integrity');
          if (crypto.createHash('sha256').update(fs.readFileSync(actual)).digest('hex') !== stat.integrity.hash.toLowerCase()) throw new Error('unpacked integrity mismatch');
        }
      } catch (error) { details.invalidUnpacked.push({ path: name, reason: error.code || error.message }); }
    }
    if (name === 'package.json' || /(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+\/package\.json$/.test(name)) {
      if (stat.size > 1024 * 1024) throw new Error('Oversized packaged package manifest');
      const pkg = JSON.parse(asar.extractFile(archive, path.normalize(name)).toString('utf8'));
      const dir = path.posix.dirname(name);
      packages.set(dir === '.' ? '' : dir, pkg);
    }
  }
  if (!packages.has('')) throw new Error('Missing packaged root package.json');
  function resolvePackage(from, name) {
    let current = from;
    for (;;) {
      if (path.posix.basename(current) !== 'node_modules') {
        const candidate = path.posix.join(current, 'node_modules', name);
        if (packages.has(candidate)) return candidate;
      }
      if (!current) return null;
      current = path.posix.dirname(current);
      if (current === '.') current = '';
    }
  }
  const queue = [''], visited = new Set();
  let requiredEdges = 0, optionalEdges = 0;
  while (queue.length) {
    const from = queue.shift();
    if (visited.has(from)) continue;
    visited.add(from);
    const pkg = packages.get(from);
    const requiredPeers = Object.fromEntries(Object.entries(pkg.peerDependencies || {})
      .filter(([name]) => pkg.peerDependenciesMeta?.[name]?.optional !== true));
    const dependencies = { ...requiredPeers, ...pkg.dependencies, ...pkg.optionalDependencies };
    for (const [name, range] of Object.entries(dependencies)) {
      if (!safeName(name) || !/^(?:@[^/]+\/)?[^/]+$/.test(name) || typeof range !== 'string') throw new Error('Invalid runtime dependency declaration');
      const optional = Object.hasOwn(pkg.optionalDependencies || {}, name);
      optional ? optionalEdges++ : requiredEdges++;
      const found = resolvePackage(from, name);
      if (found) { queue.push(found); continue; }
      const peerOnly = Object.hasOwn(requiredPeers, name) &&
        !Object.hasOwn(pkg.dependencies || {}, name) && !Object.hasOwn(pkg.optionalDependencies || {}, name);
      if (peerOnly && verifiedTypeOnlyPeer(projectDir, from, name)) {
        details.skips.push({ from: from || 'APP', name, reason: 'verified type-only peer: installed .d.ts declaration, no runtime main/module, no JavaScript/native files or links' });
        continue;
      }
      if (name === 'onnxruntime-web' && browserOnnxExcluded) {
        details.skips.push({ from: from || 'APP', name, reason: 'pre-existing explicit browser-only ONNX build exclusion; Node runtime uses onnxruntime-node' });
        continue;
      }
      if (optional) {
        const installed = physicalPackage(projectDir, from, name);
        if (!installed || !applies(installed.os, platform) || !cpus.some(cpu => applies(installed.cpu, cpu))) {
          details.skips.push({ from: from || 'APP', name, reason: installed ? 'optional dependency does not target this os/cpu' : 'optional dependency not installed in build input' });
          continue;
        }
      }
      details.missingRequired.push({ from: from || 'APP', name, range, kind: optional ? 'installed-applicable-optional' : 'required' });
    }
  }
  if (details.missingRequired.length || details.invalidUnpacked.length) fail(details);
  const result = { schema: 'packaged-runtime-closure/v1', platform, cpus, archive, packageCount: packages.size - 1, reachablePackageCount: visited.size - 1, requiredEdges, optionalEdges, unpackedMembers: entries.filter(name => asar.statFile(archive, path.normalize(name), false).unpacked).length, skips: details.skips };
  console.log(`RUNTIME DEPENDENCIES VERIFIED: ${result.packageCount} packages, ${requiredEdges} required edges, ${result.skips.length} documented exclusions/optional skips`);
  return result;
}
module.exports = verifyRuntimeDependencies;
