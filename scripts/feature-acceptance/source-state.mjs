import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

// Source provenance for native acceptance runs: exact Git blob identity, dirty
// state and lockfile hashes are recorded outside the compilation source tree.
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const within = (parent, child) => {
  const relative = path.relative(parent, child);
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

function recorder(directory) {
  fs.mkdirSync(directory, {recursive:true});
  const commands = [];
  function git(cwd, args) {
    const argv = ['-c', 'core.autocrlf=false', '-c', 'core.longpaths=true', ...args];
    const result = spawnSync('git', argv, {cwd, timeout:120000, maxBuffer:64*1024*1024});
    const stdout = result.stdout ?? Buffer.alloc(0), stderr = result.stderr ?? Buffer.alloc(0);
    const prefix = String(commands.length + 1).padStart(2, '0');
    const output = {};
    for (const [name, bytes] of Object.entries({stdout, stderr})) {
      const file = path.join(directory, `${prefix}.${name}.bin`);
      fs.writeFileSync(file, bytes);
      output[name] = {path:file, bytes:bytes.length, sha256:sha256(bytes)};
    }
    commands.push({command:['git', ...argv], cwd, ...output,
      exitStatus:result.status, signal:result.signal, error:result.error?.message ?? null});
    fs.writeFileSync(path.join(directory, 'commands.json'), JSON.stringify(commands, null, 2)+'\n');
    if (result.status !== 0 || result.error) throw Error(`Source provenance git command failed: ${args[0]} (exit ${result.status})`);
    return stdout;
  }
  return git;
}

export function captureSourceState({sourceRoot, sourceSha, evidenceDirectory, requirePristine=false}) {
  sourceRoot = fs.realpathSync(sourceRoot);
  evidenceDirectory = path.resolve(evidenceDirectory);
  if (within(sourceRoot, evidenceDirectory)) throw Error('Source provenance must be outside the compilation source tree.');
  if (!/^[a-f0-9]{40}$/i.test(sourceSha ?? '')) throw Error('An immutable source SHA is required.');
  const git = recorder(evidenceDirectory);
  const top = fs.realpathSync(git(sourceRoot, ['rev-parse', '--show-toplevel']).toString('utf8').trim());
  const samePath = (a,b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  if (!samePath(sourceRoot, top)) throw Error('The compilation source must be the actual Git checkout root.');
  const head = git(sourceRoot, ['rev-parse', 'HEAD']).toString('utf8').trim();
  if (head !== sourceSha) throw Error('Entry checkout HEAD differs from the requested immutable source SHA.');
  const format = git(sourceRoot, ['rev-parse', '--show-object-format']).toString('utf8').trim();
  if (!['sha1','sha256'].includes(format)) throw Error('Unknown Git blob identity format.');
  const tree = git(sourceRoot, ['ls-tree', '-r', '-z', 'HEAD']).toString('utf8');
  const manifest = [];
  for (const line of tree.split('\0').filter(Boolean)) {
    const match = line.match(/^(\d+) blob ([a-f0-9]+)\t([\s\S]+)$/);
    if (!match) throw Error('Only complete native Git blob trees are accepted; submodule entries are not silently skipped.');
    const [, mode, oid, relative] = match;
    const file = path.resolve(sourceRoot, relative);
    if (!within(sourceRoot, file) || file === sourceRoot) throw Error('Tracked source escaped its checkout.');
    const row = {path:relative, gitMode:mode, gitOid:oid};
    try {
      const stat = fs.lstatSync(file);
      let bytes;
      if (mode === '120000' && stat.isSymbolicLink()) bytes = Buffer.from(fs.readlinkSync(file));
      else if (['100644','100755'].includes(mode) && stat.isFile() && !stat.isSymbolicLink()) bytes = fs.readFileSync(file);
      else throw Error('Tracked file type differs from Git.');
      row.bytes = bytes.length; row.sha256 = sha256(bytes);
      row.workingGitOid = crypto.createHash(format).update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
      row.matchesHead = row.workingGitOid === oid;
    } catch (error) { row.matchesHead = false; row.error = error.message; }
    manifest.push(row);
  }
  const status = git(sourceRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const patch = git(sourceRoot, ['diff', '--no-ext-diff', '--binary', 'HEAD', '--']);
  fs.writeFileSync(path.join(evidenceDirectory, 'tracked-source-manifest.json'), JSON.stringify(manifest, null, 2)+'\n');
  fs.writeFileSync(path.join(evidenceDirectory, 'dirty-status.raw'), status);
  fs.writeFileSync(path.join(evidenceDirectory, 'tracked-diff.patch'), patch);
  const locks = ['package-lock.json'].map(relative => {
      const file = path.join(sourceRoot, relative);
      if (!fs.existsSync(file)) return {path:relative, exists:false};
      const bytes = fs.readFileSync(file);
      return {path:relative, exists:true, bytes:bytes.length, sha256:sha256(bytes)};
    });
  const result = {sourceRoot, sourceSha:head, trackedFiles:manifest.length,
    rawMatchesHead:manifest.every(row => row.matchesHead), clean:status.length === 0,
    dirtyPaths:status.toString('utf8').split('\0').filter(Boolean),
    patch:{path:path.join(evidenceDirectory, 'tracked-diff.patch'), bytes:patch.length, sha256:sha256(patch)},
    manifest:{path:path.join(evidenceDirectory, 'tracked-source-manifest.json'), sha256:sha256(fs.readFileSync(path.join(evidenceDirectory, 'tracked-source-manifest.json')))},
    locks, full195Certified:false};
  fs.writeFileSync(path.join(evidenceDirectory, 'source-state.json'), JSON.stringify(result, null, 2)+'\n');
  if (requirePristine && (!result.clean || !result.rawMatchesHead)) throw Error('Entry checkout must be clean and every raw source byte must equal its immutable Git blob.');
  return result;
}
