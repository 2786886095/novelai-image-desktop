import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Host policy contracts only. These never invoke Xcode, simctl, a simulator or an app.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(root, '.github/workflows/ios-provider-fixture-check.yml');
const workflow = () => fs.readFileSync(file, 'utf8');

test('ProviderHost compile workflow is manual macOS14 read-only and immutable-action pinned', () => {
  const text = workflow();
  assert.match(text, /on:\n  workflow_dispatch:\n\npermissions:\n  contents: read/);
  assert.match(text, /runs-on: macos-14/); assert.match(text, /timeout-minutes: 15/);
  assert.match(text, /checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09/);
  assert.match(text, /upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
  assert.match(text, /persist-credentials: false/);
  assert.doesNotMatch(text, /pull_request:|push:|schedule:|secrets\.|permissions:\s+write/);
});

test('fresh external output and uniform finite command budget cannot overwrite old evidence', () => {
  const text = workflow();
  assert.match(text, /output\.mkdir\(\)/); assert.match(text, /output\.parent == temp/);
  assert.match(text, /deadline = started \+ 660/); assert.match(text, /timeout = min\(seconds, remaining\)/);
  assert.match(text, /16 \* 1024 \* 1024/); assert.match(text, /start_new_session=True/);
  assert.match(text, /signal\.SIGTERM/); assert.match(text, /signal\.SIGKILL/);
  assert.match(text, /stdout=stdout, stderr=stderr/); assert.match(text, /'COMMANDS\.json'/);
  assert.doesNotMatch(text, /rmtree|remove\(|unlink\(|mkdir\(.*exist_ok=True/);
});

test('source qualification binds HEAD-index-raw hashes before and after to workflow SHA', () => {
  const text = workflow();
  for (const value of ['rev-parse', "'HEAD'", "'--cached'", "'--porcelain'", "'--stage'", "'Raw/index mismatch:", "before = source_identity('before')", "after = source_identity('after')", 'assert after == before']) assert(text.includes(value), value);
  assert.match(text, /head == source_sha/); assert.match(text, /hashlib\.sha1\(b'blob '/);
  assert.match(text, /'rawEqualsIndex': True, 'indexEqualsHead': True/);
  assert.match(text, /'before'|before =/); assert.match(text, /'after-manifest\.json'|label \+ '-manifest\.json'/);
});

test('actual production profile hash is supplied as both compiled fixture identity fields', () => {
  const text = workflow();
  assert.match(text, /import \{fullFeatureProfiles,profileSha256\} from/);
  assert.match(text, /profile\['features'\] == 39 and profile\['scenarios'\] == 122/);
  assert.match(text, /'FEATURE_SOURCE_SHA=' \+ source_sha/);
  assert.match(text, /'FEATURE_PROFILE_SHA=' \+ profile\['profileSha256'\]/);
  assert.match(text, /info\['FixtureSourceSha'\] == source_sha and info\['FixtureProfileSha'\] == profile\['profileSha256'\]/);
});

test('destination is selected only from existing available iPhone simulators and state must not change', () => {
  const text = workflow();
  assert.equal((text.match(/'simctl', 'list', 'devices', 'available', '--json'/g) || []).length, 2);
  assert.match(text, /device\.get\('isAvailable'\) is True/);
  assert.match(text, /device\.get\('state'\) in \('Shutdown', 'Booted'\)/);
  assert.match(text, /'name', ''\)\.startswith\('iPhone'\)/);
  assert.match(text, /assert candidates,/);
  assert.match(text, /device_states\(devices_after\) == device_states\(devices_before\)/);
  assert.doesNotMatch(text, /'simctl', '(?:create|delete|boot|shutdown|erase|install|launch|terminate)'/);
});

test('isolated app and UITest compile only with no test action or Runner project', () => {
  const text = workflow();
  assert.match(text, /ios-provider-host\/ProviderHost\.xcodeproj/);
  assert.match(text, /'-scheme', 'ProviderHost'/); assert.match(text, /'build-for-testing'\], 480/);
  assert.match(text, /'CODE_SIGNING_ALLOWED=NO'/);
  assert.match(text, /'-derivedDataPath', str\(output \/ 'DerivedData'\)/);
  assert.match(text, /'-resultBundlePath', str\(output \/ 'Compile\.xcresult'\)/);
  assert.doesNotMatch(text, /Runner\.xcodeproj|Runner\.xcworkspace|'test'|'test-without-building'|flutter|xcodebuild.*archive/);
});

test('green compilation requires both binaries xctestrun xcresult and product byte hashes', () => {
  const text = workflow();
  assert.match(text, /app \/ 'ProviderHost'\)\.is_file/);
  assert.match(text, /uitest \/ 'ProviderHostUITests'\)\.is_file/);
  assert.match(text, /glob\('\*\.xctestrun'\)/); assert.match(text, /'Compile\.xcresult'\)\.is_dir/);
  assert.match(text, /'PRODUCT_MANIFEST\.json'/); assert.match(text, /'sha256': digest\(data\)/);
  assert.match(text, /'CFBundleIdentifier'\] == 'org\.langbai\.nativefixture\.providerhost'/);
});

test('failed commands and source drift fail while raw logs remain uploaded unconditionally', () => {
  const text = workflow();
  assert.match(text, /assert status == 0 and not timed_out and not overflow/);
  assert.match(text, /result\['success'\] = False/);
  assert.match(text, /return 0 if result\['success'\] else 1/);
  assert.match(text, /if: always\(\)/); assert.match(text, /if-no-files-found: error/);
  assert.match(text, /'COMPILE_RESULT\.json'/);
});

test('every compile receipt explicitly denies native acceptance and publishing credit', () => {
  const text = workflow();
  for (const field of ['nativeExecutionClaimed', 'full195Certified', 'published', 'installedOrLaunched']) assert(text.includes(`'${field}': False`));
  assert.match(text, /'compileOnly': True/);
  assert.doesNotMatch(text, /FEATURE_ACCEPTANCE_(?:CHECK|BEGIN|DONE)|FEATURE_NATIVE_(?:CHECK|BEGIN|DONE)|gh release|git push/);
});
