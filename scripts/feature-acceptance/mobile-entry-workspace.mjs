import {mobileNativeEntries,isMobileScenarioEntry} from './mobile-entry-specs.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

// One immutable checkout per bounded entry. Never copy a runner's dirty files,
// .dart_tool, Pods or platform project into another entry's compilation tree.
const entryNames = new Set(Object.keys(mobileNativeEntries));
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
  // Preserve only these otherwise-untracked generated project inputs for review.
  // This is evidence, never a whitelist or approval of a dirty compilation tree.
  const generatedProject = {allowlist:['mobile/ios/Podfile', 'mobile/ios/Podfile.lock'],
    maxFileBytes:1024*1024, files:[]};
  const generatedErrors = [];
  const actualEvidenceRoot = fs.realpathSync(evidenceDirectory);
  if (within(sourceRoot, actualEvidenceRoot)) throw Error('Generated project evidence escaped into its source checkout.');
  for (const relative of generatedProject.allowlist) {
    const row = {path:relative, exists:null, bytes:null, sha256:null,
      evidencePath:null, reopenedMatch:null};
    generatedProject.files.push(row);
    let descriptor;
    try {
      let current = sourceRoot, missing = false;
      const parts = relative.split('/');
      for (let index=0; index<parts.length; index++) {
        current = path.resolve(current, parts[index]);
        if (!within(sourceRoot, current) || current === sourceRoot) throw Error('Generated project input escaped its checkout.');
        const stat = fs.lstatSync(current, {throwIfNoEntry:false});
        if (!stat) { missing=true; break; }
        if (index === parts.length-1) row.exists = true;
        if (stat.isSymbolicLink()) throw Error('Generated project input symlink is forbidden: '+relative);
        if (index < parts.length-1 && !stat.isDirectory()) throw Error('Generated project parent is not a directory: '+relative);
        if (index === parts.length-1 && !stat.isFile()) throw Error('Generated project input is not a regular file: '+relative);
      }
      if (missing) { row.exists=false; continue; }
      const before = fs.lstatSync(current);
      if (before.size > generatedProject.maxFileBytes) throw Error('Generated project input exceeds 1MiB: '+relative);
      if (!within(sourceRoot, fs.realpathSync(current))) throw Error('Generated project input real path escaped its checkout.');
      descriptor = fs.openSync(current, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const opened = fs.fstatSync(descriptor);
      if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) throw Error('Generated project input changed while opening: '+relative);
      if (opened.size > generatedProject.maxFileBytes) throw Error('Generated project input exceeds 1MiB: '+relative);
      const buffer = Buffer.alloc(generatedProject.maxFileBytes+1);
      let length=0, read;
      while (length < buffer.length && (read=fs.readSync(descriptor, buffer, length, buffer.length-length, null)) > 0) length += read;
      if (length > generatedProject.maxFileBytes) throw Error('Generated project input exceeds 1MiB while reading: '+relative);
      const after = fs.fstatSync(descriptor), leaf = fs.lstatSync(current);
      if (leaf.isSymbolicLink() || !leaf.isFile() || leaf.dev !== opened.dev || leaf.ino !== opened.ino ||
          after.size !== length || opened.size !== after.size || opened.mtimeMs !== after.mtimeMs || opened.ctimeMs !== after.ctimeMs) {
        throw Error('Generated project input changed while reading: '+relative);
      }
      const bytes = buffer.subarray(0, length);
      let destination = actualEvidenceRoot;
      for (const segment of ['generated-project', ...parts.slice(0, -1)]) {
        destination = path.resolve(destination, segment);
        if (!within(actualEvidenceRoot, destination)) throw Error('Generated project archive escaped its evidence root.');
        const stat = fs.lstatSync(destination, {throwIfNoEntry:false});
        if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) throw Error('Generated project archive parent is unsafe.');
        if (!stat) fs.mkdirSync(destination);
      }
      destination = path.join(destination, parts.at(-1));
      fs.writeFileSync(destination, bytes, {flag:'wx', mode:0o600});
      const reopened = fs.readFileSync(destination);
      row.bytes = bytes.length; row.sha256 = sha256(bytes); row.evidencePath = destination;
      row.reopenedMatch = reopened.length === bytes.length && sha256(reopened) === row.sha256;
      if (!row.reopenedMatch) throw Error('Generated project archive readback mismatch: '+relative);
    } catch (error) { row.error=error.message; generatedErrors.push(error.message); }
    finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
  }
  const generatedManifestPath = path.join(actualEvidenceRoot, 'generated-project-manifest.json');
  const generatedManifestBytes = Buffer.from(JSON.stringify(generatedProject, null, 2)+'\n');
  fs.writeFileSync(generatedManifestPath, generatedManifestBytes, {flag:'wx'});
  const generatedReopened = fs.readFileSync(generatedManifestPath);
  const generatedProjectManifest = {path:generatedManifestPath, bytes:generatedManifestBytes.length,
    sha256:sha256(generatedManifestBytes), reopenedMatch:generatedReopened.equals(generatedManifestBytes)};
  if (!generatedProjectManifest.reopenedMatch) throw Error('Generated project manifest readback mismatch.');
  if (generatedErrors.length) throw Error('Generated project evidence rejected: '+generatedErrors.join('; '));
  const locks = ['package-lock.json', 'mobile/pubspec.lock', 'mobile/ios/Podfile.lock',
    'mobile/android/gradle/wrapper/gradle-wrapper.properties'].map(relative => {
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
    locks, generatedProject, generatedProjectManifest, full195Certified:false};
  fs.writeFileSync(path.join(evidenceDirectory, 'source-state.json'), JSON.stringify(result, null, 2)+'\n');
  if (requirePristine && (!result.clean || !result.rawMatchesHead)) throw Error('Entry checkout must be clean and every raw source byte must equal its immutable Git blob.');
  return result;
}

export function createEntryWorkspace({repositoryRoot, sourceSha, entry, platform, runnerTemp, evidenceRoot}) {
  if (!entryNames.has(entry) || !['android','ios'].includes(platform)) throw Error('Unknown bounded mobile entry.');
  if (!runnerTemp || !path.isAbsolute(runnerTemp)) throw Error('An absolute disposable runner temp directory is required.');
  repositoryRoot = fs.realpathSync(repositoryRoot);
  runnerTemp = fs.realpathSync(runnerTemp);
  evidenceRoot = path.resolve(evidenceRoot);
  const evidenceDirectory = path.join(evidenceRoot, entry, 'source-provenance');
  const original = captureSourceState({sourceRoot:repositoryRoot, sourceSha,
    evidenceDirectory:path.join(evidenceDirectory, 'original-checkout')});
  const directory = fs.mkdtempSync(path.join(runnerTemp, `feature-mobile-workspace-${platform}-${entry}-`));
  if (within(evidenceRoot, directory) || within(directory, evidenceRoot) || within(repositoryRoot, directory)) {
    throw Error('Entry compilation workspaces must stay outside the upload evidence root and the original checkout.');
  }
  const sourceRoot = path.join(directory, 'source');
  const git = recorder(path.join(evidenceDirectory, 'workspace-creation'));
  git(repositoryRoot, ['worktree', 'add', '--detach', sourceRoot, sourceSha]);
  const before = captureSourceState({sourceRoot, sourceSha,
    evidenceDirectory:path.join(evidenceDirectory, 'before'), requirePristine:true});
  const result = {entry, platform, sourceRoot, projectRoot:path.join(sourceRoot, 'mobile'),
    sourceSha, evidenceDirectory, original, before, originalDirtyFilesCopied:false,
    copiedDependencyTree:false, retainedWorkspaceForRunnerCleanup:true};
  fs.writeFileSync(path.join(evidenceDirectory, 'workspace.json'), JSON.stringify(result, null, 2)+'\n');
  return result;
}
