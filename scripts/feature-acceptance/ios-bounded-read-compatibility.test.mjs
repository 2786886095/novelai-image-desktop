// Host source contracts only: this does NOT compile Swift or prove iOS/provider IO.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../mobile/ios/Runner/OutputFolderBridge.swift', import.meta.url), 'utf8');
const project = readFileSync(new URL('../../mobile/ios/Runner.xcodeproj/project.pbxproj', import.meta.url), 'utf8');
const framework = readFileSync(new URL('../../mobile/ios/Flutter/AppFrameworkInfo.plist', import.meta.url), 'utf8');
const read = source.slice(source.indexOf('private func read('));
test('iOS12 host source contract: original deployment floor and real grant/coordinator remain', () => {
  assert.equal((project.match(/IPHONEOS_DEPLOYMENT_TARGET = 12\.0;/g) || []).length, 3);
  assert.match(framework, /<key>MinimumOSVersion<\/key>\s*<string>12\.0<\/string>/);
  assert.match(source, /startAccessingSecurityScopedResource\(\)/);
  assert.match(read, /guard let granted = grants\[root\]/);
  assert.match(read, /NSFileCoordinator\(\)\.coordinate\(readingItemAt: file/);
  assert.ok(read.indexOf('if probeOnly { probed = true; return }') < read.indexOf('var data = Data()'));
});
test('iOS12 host source contract: no unavailable or ObjC-exception FileHandle reads', () => {
  assert.doesNotMatch(read, /FileHandle\(|handle\.close\(|read\(upToCount:|readData\(ofLength:|availableData|readDataToEndOfFile/);
  assert.match(source, /^import Darwin$/m);
});
test('iOS12 host source contract: read-only non-following descriptor validated and always closed', () => {
  assert.match(read, /Darwin\.open\(coordinated\.path, O_RDONLY \| O_NOFOLLOW \| O_NONBLOCK\)/);
  assert.match(read, /guard descriptor >= 0/);
  assert.match(read, /defer \{ _ = Darwin\.close\(descriptor\) \}/);
  assert.match(read, /Darwin\.fstat\(descriptor, &descriptorValues\)/);
  assert.match(read, /descriptorValues\.st_mode & mode_t\(S_IFMT\)\) == mode_t\(S_IFREG\)/);
  assert.match(read, /descriptorValues\.st_size > 0, descriptorValues\.st_size <= off_t\(limit\)/);
});
test('iOS12 host source contract: short reads and growth keep the 64KiB and limit+1 bounds', () => {
  assert.match(read, /guard limit > 0, limit <= 64 \* 1024 \* 1024/);
  assert.match(read, /var buffer = \[UInt8\]\(repeating: 0, count: 64 \* 1024\)/);
  assert.match(read, /while data\.count <= limit/);
  assert.match(read, /let requested = min\(buffer\.count, limit \+ 1 - data\.count\)/);
  assert.match(read, /Darwin\.read\(descriptor, \$0\.baseAddress!, requested\)/);
  assert.match(read, /if count == 0 \{ break \}/);
  assert.match(read, /data\.append\(contentsOf: buffer\.prefix\(count\)\)/);
  assert.match(read, /guard !data\.isEmpty, data\.count <= limit/);
});
test('iOS12 host source contract: errno is captured, EINTR retries, other read failures throw', () => {
  assert.match(read, /if count < 0 \{\s*let code = errno\s*if code == EINTR \{ continue \}\s*throw NSError\(domain: NSPOSIXErrorDomain, code: Int\(code\), userInfo: nil\)/);
  assert.match(read, /if Darwin\.fstat\(descriptor, &descriptorValues\) != 0 \{\s*throw NSError\(domain: NSPOSIXErrorDomain, code: Int\(errno\), userInfo: nil\)/);
});
test('iOS12 host source contract: only local ENOENT is missing; provider errors remain unavailable', () => {
  assert.match(read, /let missing = !external && \(\(failure\.domain == NSCocoaErrorDomain/);
  assert.match(read, /failure\.domain == NSPOSIXErrorDomain && failure\.code == Int\(ENOENT\)/);
  assert.match(read, /code: missing \? "output_image_missing" : "output_folder_read"/);
  assert.match(read, /Original history was retained/);
});
