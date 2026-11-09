import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const lock = require('../../package-lock.json').packages['node_modules/electron'];
const electronPackage = require.resolve('electron/package.json');
const version = require(electronPackage).version;
if (lock.version !== version || !/^\d+\.\d+\.\d+$/.test(version)) throw Error('Electron differs from the lockfile.');
const checksums = JSON.parse(readFileSync(path.join(path.dirname(electronPackage), 'checksums.json'), 'utf8'));
const releaseBuild = process.argv[2] === '--package';
const arches = releaseBuild && process.platform === 'darwin' ? ['arm64', 'x64'] : [process.arch];
const manifests = [electronPackage, ...(releaseBuild ? [require.resolve('app-builder-lib/package.json')] : [])];
const caches = await Promise.all(manifests.map(async manifest => {
  const entry = createRequire(manifest).resolve('@electron/get');
  const { Cache } = await import(new URL('./Cache.js', pathToFileURL(entry)));
  return new Cache();
}));

const scratch = await mkdtemp(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'official-electron-'));
function curl(url, output, maxSize, accept) {
  const result = spawnSync('curl', ['--fail', '--silent', '--show-error', '--location',
    '--proto', '=https', '--proto-redir', '=https', '--retry', '2', '--connect-timeout', '10',
    '--max-time', '120', '--retry-max-time', '160', '--max-filesize', String(maxSize),
    '--header', 'Accept: ' + accept, '--output', output, url], { stdio: 'inherit', timeout: 180000 });
  if (result.error || result.status !== 0) throw Error('Official Electron release request failed.');
}
async function matches(file, expected) {
  if (!existsSync(file)) return false;
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex') === expected;
}

try {
  const api = 'https://api.github.com/repos/electron/electron/releases';
  let metadata;
  for (const arch of arches) {
    const file = `electron-v${version}-${process.platform}-${arch}.zip`;
    const expected = checksums[file];
    if (!/^[a-f0-9]{64}$/.test(expected || '')) throw Error('No pinned Electron checksum for ' + file);
    const canonical = `https://github.com/electron/electron/releases/download/v${version}/${file}`;
    const paths = [...new Set(caches.map(cache => cache.getCachePath(canonical, file)))];
    const needs = [];
    let verified;
    for (const dest of paths) {
      if (await matches(dest, expected)) verified = dest;
      else needs.push(dest);
    }
    if (needs.length === 0) {
      console.log('Pinned Electron cache already verified: ' + file);
      continue;
    }
    if (!verified) {
      if (!metadata) {
        const index = path.join(scratch, 'release.json');
        curl(api + '/tags/v' + version, index, 2 * 1024 * 1024, 'application/vnd.github+json');
        metadata = JSON.parse(readFileSync(index, 'utf8'));
        if (metadata.tag_name !== 'v' + version) throw Error('Unexpected Electron release tag.');
      }
      const assets = metadata.assets.filter(asset => asset.name === file && asset.browser_download_url === canonical);
      const asset = assets[0];
      if (assets.length !== 1 || !Number.isSafeInteger(asset.id) || asset.id <= 0 ||
          !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > 512 * 1024 * 1024 ||
          asset.digest !== 'sha256:' + expected) throw Error('Official metadata disagrees with the pinned Electron checksum.');
      verified = path.join(scratch, file);
      curl(api + '/assets/' + asset.id, verified, asset.size, 'application/octet-stream');
      if (!(await matches(verified, expected))) throw Error('Official Electron archive checksum mismatch.');
    }
    for (const dest of needs) {
      const partial = dest + '.ci-part-' + process.pid;
      try {
        await mkdir(path.dirname(dest), { recursive: true });
        await copyFile(verified, partial);
        await rename(partial, dest);
      } finally {
        await rm(partial, { force: true });
      }
    }
    console.log('Pinned Electron archive staged and verified: ' + file);
  }
} finally {
  // This directory is a newly created process-owned temporary directory.
  for (const name of ['release.json', ...arches.map(arch => `electron-v${version}-${process.platform}-${arch}.zip`)]) {
    await rm(path.join(scratch, name), { force: true });
  }
  const { rmdir } = await import('node:fs/promises');
  await rmdir(scratch);
}
