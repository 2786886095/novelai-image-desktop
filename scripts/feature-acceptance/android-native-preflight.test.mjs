import test from 'node:test';
import assert from 'node:assert/strict';
import {observedAndroidModal, prepareAndroidNative, inspectAndroidForeground} from './android-native-preflight.mjs';

const launcherAnr = '<hierarchy><node text="Pixel Launcher isn’t responding"/><node text="Close app" resource-id="android:id/aerr_close" bounds="[10,20][110,80]"/></hierarchy>';
const permission = '<hierarchy><node text="Allow Langbai NovelAI Studio to send you notifications?"/><node resource-id="com.android.permissioncontroller:id/permission_allow_button" text="Allow" bounds="[20,30][80,90]"/></hierarchy>';
const clean = '<hierarchy><node text="Pixel Launcher"/></hierarchy>';
function fixture({windows = [clean], physical = false, granted = true, boot = '1', nullFocus = false, failedTap = false} = {}) {
  const commands = [], phases = []; let index = 0, elapsed = 0;
  const command = argv => {
    commands.push(argv); const args = argv.slice(3).join(' ');
    let stdout = '';
    if (args === 'shell getprop ro.kernel.qemu') stdout = physical ? '0' : '1';
    if (args === 'shell getprop sys.boot_completed') stdout = boot;
    if (args === 'shell getprop ro.build.version.sdk') stdout = '35';
    if (args === 'shell uiautomator dump /data/local/tmp/acceptance-window.xml') stdout = 'UI hierchary dumped to: /data/local/tmp/acceptance-window.xml';
    if (args === 'shell cat /data/local/tmp/acceptance-window.xml') stdout = windows[Math.min(index++, windows.length - 1)];
    if (args === 'shell dumpsys window windows') stdout = nullFocus ? 'mCurrentFocus=null' : 'mCurrentFocus=Window{42 u0 com.google.android.apps.nexuslauncher/.NexusLauncher}\nmFocusedApp=ActivityRecord{42}';
    if (args.startsWith('shell dumpsys package ')) stdout = `android.permission.POST_NOTIFICATIONS: granted=${granted}`;
    return {exitStatus: failedTap && args.startsWith('shell input tap ') ? 1 : 0, stdout, stderr: '', error: null};
  };
  return {commands, phases, options: {adb: 'fixture-adb', device: 'emulator-5554', appId: 'com.langbai.novelai_mobile', command,
    phase: event => phases.push(event), now: () => elapsed, sleep: async ms => {elapsed += ms;}, timeoutMs: 2500}};
}

test('only the observed launcher ANR and exact test-app permission buttons are actionable', () => {
  assert.deepEqual(observedAndroidModal(launcherAnr), {kind: 'launcher-anr', tap: [60, 50]});
  assert.deepEqual(observedAndroidModal(permission), {kind: 'test-app-notification', tap: [50, 60]});
  assert.equal(observedAndroidModal(clean), null);
  assert.equal(observedAndroidModal(launcherAnr.replace('Pixel Launcher', 'Langbai NovelAI Studio')).kind, 'unhandled-anr');
  assert.equal(observedAndroidModal(permission.replace('Langbai NovelAI Studio', 'Another app')), null);
  assert.equal(observedAndroidModal(launcherAnr.replace('[10,20][110,80]', '[10,20][0,0]')).kind, 'unhandled-anr');
});

test('physical or unbound devices cannot receive even a wake/tap/grant operation', async () => {
  const f = fixture();
  await assert.rejects(prepareAndroidNative({...f.options, device: 'physical-phone'}), /emulator required/);
  assert.equal(f.commands.length, 0);
  await assert.rejects(prepareAndroidNative({...f.options, appId: 'bad;package'}), /test package required/);
  assert.equal(f.commands.length, 0);
  const actual = fixture({physical: true});
  await assert.rejects(prepareAndroidNative(actual.options), /actual disposable/);
  assert.equal(actual.commands.length, 1);
});

test('observed launcher ANR is closed once, followed by two independent clean foreground observations', async () => {
  const f = fixture({windows: [launcherAnr, clean, clean]});
  await prepareAndroidNative(f.options);
  assert.equal(f.commands.filter(argv => argv.includes('tap')).length, 1);
  assert.equal(f.commands.filter(argv => argv.includes('uiautomator')).length, 3);
  assert.equal(f.phases.at(-1).stage, 'ready');
  assert.equal(f.phases.at(-1).stableObservations, 2);
});

test('notification permission is actually granted and observed before launch; a false grant fails', async () => {
  const f = fixture();
  await prepareAndroidNative({...f.options, grantNotifications: true});
  const grant = f.commands.findIndex(argv => argv.includes('grant'));
  const read = f.commands.findIndex(argv => argv.includes('package') && argv.includes('dumpsys'));
  const window = f.commands.findIndex(argv => argv.includes('uiautomator'));
  assert(grant >= 0 && read > grant && window > read);
  const denied = fixture({granted: false});
  await assert.rejects(prepareAndroidNative({...denied.options, grantNotifications: true}), /not observed granted/);
});

test('exact first-run notification dialog is handled during real native log collection', async () => {
  const f = fixture({windows: [permission]});
  await inspectAndroidForeground(f.options);
  assert(f.commands.some(argv => argv.slice(-3).join(' ') === 'tap 50 60'));
  assert.equal(f.phases[0].kind, 'test-app-notification');
});

test('product ANR, tap failure, non-booted state and null focus never qualify a healthy entry', async () => {
  const f = fixture({windows: [launcherAnr.replace('Pixel Launcher', 'Langbai NovelAI Studio')]});
  await assert.rejects(prepareAndroidNative(f.options), /unhandled-anr/);
  assert.equal(f.commands.some(argv => argv.includes('tap')), false);
  const tap = fixture({windows: [launcherAnr], failedTap: true});
  await assert.rejects(prepareAndroidNative(tap.options), /dialog tap failed/);
  for (const options of [{boot: '0'}, {nullFocus: true}]) {
    const notReady = fixture(options);
    await assert.rejects(prepareAndroidNative(notReady.options), /did not stabilize/);
    assert.equal(notReady.phases.some(event => event.stage === 'ready'), false);
  }
});

// Exact first raw API dump from G job117174310979. It is a windows-only
// failure observation, NOT a synthetic healthy device result. Keeping it gzip
// encoded avoids 70KB of repetitive OS diagnostic noise in this unit module.
import {gunzipSync} from 'node:zlib';
import crypto from 'node:crypto';
const recordedWindowsOnly = gunzipSync(Buffer.from('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', 'base64')).toString('utf8');
const syntheticFullDump = 'WINDOW MANAGER DISPLAY CONTENTS (dumpsys window displays)\n  mCurrentFocus=Window{42 u0 com.google.android.apps.nexuslauncher/.NexusLauncher}\n  mFocusedApp=ActivityRecord{42}\nWINDOW MANAGER WINDOWS (dumpsys window windows)\n';
function recordedFixture({fullDump = syntheticFullDump, fullExit = 0} = {}) {
  const f = fixture(), original = f.options.command;
  f.options.command = argv => {
    const result = original(argv), args = argv.slice(3).join(' ');
    if (args === 'shell dumpsys window windows') result.stdout = recordedWindowsOnly;
    if (args === 'shell dumpsys window') {
      result.stdout = fullDump; result.exitStatus = fullExit;
      if (fullExit) result.stderr = 'synthetic full-dump command failure';
    }
    return result;
  };
  return f;
}

test('recorded API34 windows-only failure trace falls back to an explicitly synthetic complete dump', async () => {
  assert.equal(crypto.createHash('sha256').update(recordedWindowsOnly).digest('hex'), 'e6959c60d28c8c5cf6e9fcca66b2bc195f93d6beb83ba320d22ded9d3c1ac341');
  assert(recordedWindowsOnly.includes('WINDOW MANAGER WINDOWS (dumpsys window windows)'));
  assert(!/mCurrentFocus=|mFocusedApp=/.test(recordedWindowsOnly));
  const f = recordedFixture(), result = await inspectAndroidForeground(f.options);
  assert.equal(result.focus.length, 2);
  assert(f.commands.some(argv => argv.slice(3).join(' ') === 'shell dumpsys window'));
  assert.equal(f.phases.filter(p => p.stage === 'focus-query-fallback').length, 1);
  assert.equal(f.phases.at(-1).stage, 'foreground');
});

test('complete-dump fallback still requires two independently observed nonnull foreground windows', async () => {
  const f = recordedFixture();
  await prepareAndroidNative(f.options);
  assert.equal(f.commands.filter(argv => argv.slice(3).join(' ') === 'shell dumpsys window windows').length, 2);
  assert.equal(f.commands.filter(argv => argv.slice(3).join(' ') === 'shell dumpsys window').length, 2);
  assert.equal(f.phases.at(-1).stableObservations, 2);
  assert.equal(f.commands.filter(argv => argv.includes('KEYCODE_WAKEUP')).length, 1);
  assert.equal(f.commands.filter(argv => argv.includes('dismiss-keyguard')).length, 1);
});

test('complete-dump missing fields or explicit null focus never become healthy observations', async () => {
  for (const fullDump of ['WINDOW MANAGER DISPLAY CONTENTS\n', 'mCurrentFocus=null\nmFocusedApp=ActivityRecord{42}']) {
    const f = recordedFixture({fullDump});
    await assert.rejects(prepareAndroidNative(f.options), /did not stabilize/);
    assert.equal(f.phases.some(p => p.stage === 'ready'), false);
  }
  const nullLimited = fixture({nullFocus: true});
  await assert.rejects(prepareAndroidNative(nullLimited.options), /did not stabilize/);
  assert.equal(nullLimited.commands.some(argv => argv.slice(3).join(' ') === 'shell dumpsys window'), false);
});

test('a failed complete-dump command fails closed without granting foreground readiness', async () => {
  const f = recordedFixture({fullExit: 2});
  await assert.rejects(prepareAndroidNative(f.options), /Native full foreground inspection failed/);
  assert.equal(f.phases.some(p => p.stage === 'ready'), false);
});
