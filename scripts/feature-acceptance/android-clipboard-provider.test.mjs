import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.ANDROID_CLIPBOARD_SOURCE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = 'mobile/android/app/src/main/AndroidManifest.xml';
const kotlinPath = 'mobile/android/app/src/main/kotlin/com/codex/novelai/novelai_mobile/ImageClipboardFileProvider.kt';
const namespace = 'com.codex.novelai.novelai_mobile';
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const attributes = (text) => Object.fromEntries([...text.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]));
function assertProviders(manifest, applicationId = '${applicationId}') {
  const providers = [...manifest.matchAll(/<provider\b([^>]*?)>([\s\S]*?)<\/provider>/g)].map((m) => ({ ...attributes(m[1]), body: m[2] }));
  const update = providers.filter((p) => p['android:authorities'] === `${applicationId}.updates`);
  const clipboard = providers.filter((p) => p['android:authorities'] === `${applicationId}.image_clipboard`);
  assert.equal(update.length, 1, 'exact update authority');
  assert.equal(clipboard.length, 1, 'exact clipboard authority');
  assert.equal(update[0]['android:name'], 'androidx.core.content.FileProvider', 'update component unchanged');
  assert.ok(['.ImageClipboardFileProvider', `${namespace}.ImageClipboardFileProvider`].includes(clipboard[0]['android:name']), 'clipboard requires its independent component');
  assert.notEqual(update[0]['android:name'], clipboard[0]['android:name'], 'distinct Android component identities');
  for (const [provider, resource] of [[update[0], '@xml/update_file_paths'], [clipboard[0], '@xml/image_clipboard_paths']]) {
    assert.equal(provider['android:exported'], 'false', 'providers must remain private');
    assert.equal(provider['android:grantUriPermissions'], 'true', 'only explicit URI grants');
    const metadata = [...provider.body.matchAll(/<meta-data\b([^>]*?)\/?\s*>/g)].map((m) => attributes(m[1]));
    assert.deepEqual(metadata, [{ 'android:name': 'android.support.FILE_PROVIDER_PATHS', 'android:resource': resource }], 'separate scoped path metadata');
  }
}
const source = read(manifestPath);
test('app manifest uses independent clipboard and update component identities', () => assertProviders(source));
test('provider roots remain separate narrow cache directories', () => {
  for (const [file, name, dir] of [['update_file_paths', 'verified_updates', 'updates/'], ['image_clipboard_paths', 'images', 'image-clipboard/']]) {
    const xml = read(`mobile/android/app/src/main/res/xml/${file}.xml`);
    assert.deepEqual([...xml.matchAll(/<(\w[\w-]*)\b([^>]*?)\/>/g)].map((m) => ({ tag: m[1], ...attributes(m[2]) })), [{ tag: 'cache-path', name, path: dir }]);
  }
});
test('clipboard provider is an empty FileProvider subclass without permission or I/O overrides', () => {
  const body = read(kotlinPath).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim();
  assert.match(body, /^package com\.codex\.novelai\.novelai_mobile\s+import androidx\.core\.content\.FileProvider\s+class ImageClipboardFileProvider\s*:\s*FileProvider\(\)\s*$/);
});
test('regression: a reused FileProvider component is rejected', () => {
  const collision = source.replace(/android:name="(?:\.ImageClipboardFileProvider|com\.codex\.novelai\.novelai_mobile\.ImageClipboardFileProvider)"/, 'android:name="androidx.core.content.FileProvider"');
  assert.throws(() => assertProviders(collision));
});
test('source placeholder resolves safely for production and isolated QA application IDs', () => {
  for (const appId of [namespace, `${namespace}.agenttest`]) {
    const resolved = source.replaceAll('${applicationId}', appId);
    assertProviders(resolved, appId);
    assert.throws(() => assertProviders(resolved, `${appId}.sibling`));
  }
});
test('negative: authority, exported/grant and merged-path widening are rejected', () => {
  const mutations = [
    source.replace('${applicationId}.image_clipboard', '${applicationId}.updates'),
    source.replace('android:exported="false"', 'android:exported="true"'),
    source.replace('android:grantUriPermissions="true"', 'android:grantUriPermissions="false"'),
    source.replace('@xml/image_clipboard_paths', '@xml/update_file_paths'),
  ];
  for (const altered of mutations) assert.throws(() => assertProviders(altered));
});
