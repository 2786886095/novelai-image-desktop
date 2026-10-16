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
