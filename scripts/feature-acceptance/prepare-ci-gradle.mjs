import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const version = '8.9';
const archive = `gradle-${version}-bin.zip`;
const url = `https://services.gradle.org/distributions/${archive}`;
const officialAsset = 'https://api.github.com/repos/gradle/gradle-distributions/releases/assets/178998845';
// https://services.gradle.org/distributions/gradle-8.9-bin.zip.sha256
const sha256 = 'd725d707bfabd4dfdc958c624003b3c80accc03f7037b5122c4b1d0ef15cecab';
const wrapper = readFileSync(new URL('../../mobile/android/gradle/wrapper/gradle-wrapper.properties', import.meta.url), 'utf8').replaceAll('\\:', ':');
for (const property of [`distributionUrl=${url}`, 'zipStoreBase=GRADLE_USER_HOME', 'zipStorePath=wrapper/dists']) {
  if (!wrapper.split(/\r?\n/).includes(property)) throw Error('Gradle wrapper does not match the pinned download.');
}
const bucket = BigInt('0x' + createHash('md5').update(url).digest('hex')).toString(36);
const gradleHome = process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle');
const dir = path.join(gradleHome, 'wrapper', 'dists', `gradle-${version}-bin`, bucket);
const dest = path.join(dir, archive);
const temp = dest + '.ci-part-' + process.pid;

async function matches(file) {
  if (!existsSync(file)) return false;
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex') === sha256;
}

await mkdir(dir, { recursive: true });
if (existsSync(dest + '.ok') && existsSync(path.join(dir, `gradle-${version}`, 'lib', `gradle-launcher-${version}.jar`))) {
  console.log('Gradle wrapper distribution already installed.');
} else if (await matches(dest)) {
  console.log('Gradle wrapper ZIP already verified.');
} else {
  try {
    // This is the same upstream ZIP Gradle redirects to, via the official asset API.
    // No auth header is supplied; never accept a substitute URL or unverified bytes.
    const result = spawnSync('curl', ['--fail', '--silent', '--show-error', '--location',
      '--proto', '=https', '--proto-redir', '=https', '--retry', '2',
      '--connect-timeout', '10', '--max-time', '120', '--retry-max-time', '160',
      '--max-filesize', '136114148', '--header', 'Accept: application/octet-stream',
      '--output', temp, officialAsset], { stdio: 'inherit', timeout: 180000 });
    if (result.error || result.status !== 0) throw Error('Official Gradle release asset download failed.');
    if (!(await matches(temp))) throw Error('Official Gradle archive checksum mismatch.');
    await rename(temp, dest);
    console.log('Pinned Gradle wrapper ZIP staged from the official release asset.');
  } finally {
    await rm(temp, { force: true });
  }
}
