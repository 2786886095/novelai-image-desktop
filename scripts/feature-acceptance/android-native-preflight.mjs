// Disposable-emulator preparation only. This does not emit native CHECK/DONE
// records, retry product assertions, or replace a real platform channel.
const decodeXml = value => value.replace(/&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'");

export function observedAndroidModal(xml, appLabel = 'Langbai NovelAI Studio') {
  const nodes = [...String(xml).matchAll(/<node\b[^>]*>/g)].map(([raw]) =>
    Object.fromEntries([...raw.matchAll(/([\w-]+)="([^"]*)"/g)]
      .map(([, key, value]) => [key, decodeXml(value)])));
  const text = nodes.map(node => node.text || '').join('\n');
  const point = node => {
    const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(node?.bounds || '');
    if (!bounds || +bounds[3] <= +bounds[1] || +bounds[4] <= +bounds[2]) return null;
    return [Math.floor((+bounds[1] + +bounds[3]) / 2), Math.floor((+bounds[2] + +bounds[4]) / 2)];
  };
  if (/isn['’]t responding|is not responding/i.test(text)) {
    // The historical artifact shows Pixel Launcher, not a product ANR. Never
    // dismiss a product/unknown ANR and then count its journey as healthy.
    if (!/Pixel Launcher isn['’]t responding|Pixel Launcher is not responding/.test(text)) {
      return {kind: 'unhandled-anr', text};
    }
    const button = nodes.find(node => node['resource-id'] === 'android:id/aerr_close' &&
      /^(Close app|Close)$/i.test(node.text || ''));
    const tap = point(button);
    return tap ? {kind: 'launcher-anr', tap} : {kind: 'unhandled-anr', text};
  }
  if (text.includes(`Allow ${appLabel} to send you notifications?`)) {
    const button = nodes.find(node => node['resource-id'] ===
      'com.android.permissioncontroller:id/permission_allow_button' && /^Allow$/i.test(node.text || ''));
    const tap = point(button);
    return tap ? {kind: 'test-app-notification', tap} : {kind: 'unhandled-notification', text};
  }
  return null;
}

function ensureResult(result, description) {
  if (result.exitStatus !== 0 || result.error) throw Error(`${description}: exit=${result.exitStatus} error=${result.error || 'none'}`);
  return result.stdout.trim();
}

export function validateAndroidPreflightTarget({device, appId}) {
  if (!/^emulator-\d+$/.test(device || '')) throw Error('Disposable Android emulator required for preflight.');
  if (!/^[a-zA-Z]\w*(?:\.[a-zA-Z]\w*)+$/.test(appId || '')) throw Error('Explicit isolated test package required for preflight.');
}

export async function inspectAndroidForeground({adb, device, appId, command, phase = () => {}, currentFocusOnly = false}) {
  validateAndroidPreflightTarget({device, appId});
  const adbCommand = args => command([adb, '-s', device, ...args], undefined, 20000);
  // A failed dump must never expose a prior observation from this fixed path.
  const cleared = adbCommand(['shell', 'rm', '-f', '/data/local/tmp/acceptance-window.xml']);
  ensureResult(cleared, 'Native stale hierarchy removal failed');
  if (cleared.stderr.trim()) throw Error('Native stale hierarchy removal returned unexpected stderr.');
  const dump = adbCommand(['shell', 'uiautomator', 'dump', '/data/local/tmp/acceptance-window.xml']);
  const dumped = ensureResult(dump, 'Native window dump failed');
  if (!/dumped to:\s*\/data\/local\/tmp\/acceptance-window\.xml/.test(dumped)) {
    const error = Error('Native window dump did not confirm a fresh hierarchy; stale XML is not accepted.');
    // This remains an error for all direct/runtime callers. Only preflight may
    // recognize this exact transient after it actually closed a launcher ANR.
    if (!dumped && dump.stderr.trim() === 'ERROR: null root node returned by UiTestAutomationBridge.' &&
        !dump.signal && !dump.timedOut && !dump.outputOverflow) error.code = 'ANDROID_LAUNCHER_NULL_HIERARCHY';
    throw error;
  }
  if (dump.stderr.trim()) throw Error('Native window dump returned unexpected stderr.');
  const read = adbCommand(['shell', 'cat', '/data/local/tmp/acceptance-window.xml']);
  const xml = ensureResult(read, 'Native window read failed');
  if (read.stderr.trim()) throw Error('Native window read returned unexpected stderr.');
  if (!/<hierarchy\b/.test(xml)) throw Error('Native window hierarchy is missing.');
  const modal = observedAndroidModal(xml);
  if (modal?.kind?.startsWith('unhandled-')) throw Error(`Unhealthy Android native foreground: ${modal.kind}: ${modal.text}`);
  if (modal) {
    phase({stage: 'observed-modal', kind: modal.kind, tap: modal.tap});
    ensureResult(adbCommand(['shell', 'input', 'tap', ...modal.tap.map(String)]), 'Observed native dialog tap failed');
  }
  let focus = ensureResult(adbCommand(['shell', 'dumpsys', 'window', 'windows']), 'Native foreground inspection failed');
  let lines = focus.split(/\r?\n/).filter(line => /mCurrentFocus=|mFocusedApp=/.test(line));
  if (lines.length === 0) {
    // AOSP Android 14's `windows` subcommand omits DisplayContent's focus
    // summary. Query the complete read-only dump only when fields are absent;
    // an explicitly null focus is not a missing-field success/retry signal.
    phase({stage: 'focus-query-fallback', from: 'window windows', to: 'window', reason: 'focus fields absent'});
    focus = ensureResult(adbCommand(['shell', 'dumpsys', 'window']), 'Native full foreground inspection failed');
    lines = focus.split(/\r?\n/).filter(line => /mCurrentFocus=|mFocusedApp=/.test(line));
  }
  if (currentFocusOnly && !modal && /WINDOW MANAGER LAST ANR/.test(focus)) {
    // Complete dumps include historical DisplayContent snapshots. Never discard
    // a null by choosing the last line: issue a new current-only OS query.
    phase({stage: 'current-focus-query', reason: 'historical-last-anr', to: 'window displays'});
    const current = adbCommand(['shell', 'dumpsys', 'window', 'displays']);
    const text = ensureResult(current, 'Native current-display inspection failed');
    if (current.stderr.trim() || current.signal || current.timedOut || current.outputOverflow || current.cleanupComplete === false ||
        /WINDOW MANAGER LAST ANR/.test(text) ||
        !/^WINDOW MANAGER DISPLAY CONTENTS \(dumpsys window displays\)\s*$/m.test(text)) {
      throw Error('Native current-display observation is invalid or historical.');
    }
    const currentLines = text.split(/\r?\n/).filter(line => /mCurrentFocus=|mFocusedApp=/.test(line));
    if (currentLines.filter(line => /mCurrentFocus=/.test(line)).length !== 1 ||
        currentLines.filter(line => /mFocusedApp=/.test(line)).length !== 1) {
      throw Error('Native current-display focus fields are missing or ambiguous.');
    }
    if (!/^\s*mCurrentFocus=(?:null|Window\{[^}\r\n]+\})\s*$/.test(currentLines.find(line => /mCurrentFocus=/.test(line))) ||
        !/^\s*mFocusedApp=(?:null|ActivityRecord\{[^}\r\n]+\})\s*$/.test(currentLines.find(line => /mFocusedApp=/.test(line)))) {
      throw Error('Native current-display focus fields are malformed.');
    }
    lines = currentLines;
  }
  phase({stage: 'foreground', focus: lines});
  return {modal, focus: lines};
}

export async function prepareAndroidNative({adb, device, appId, command, phase = () => {},
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now, timeoutMs = 45000,
  grantNotifications = false} = {}) {
  validateAndroidPreflightTarget({device, appId});
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw Error('Invalid Android readiness timeout.');
  // input.timeoutMs is also the APK-build budget. It cannot extend readiness.
  const budgetMs = Math.min(timeoutMs, 45000), deadline = now() + budgetMs;
  const expired = () => Error(`Disposable Android native foreground did not stabilize within ${budgetMs}ms.`);
  const boundedCommand = (argv, cwd, requested = 20000) => {
    const remaining = deadline - now();
    if (remaining <= 0) throw expired();
    const result = command(argv, cwd, Math.min(20000, requested, remaining));
    if (now() >= deadline) throw expired();
    return result;
  };
  const adbCommand = args => boundedCommand([adb, '-s', device, ...args], undefined, 20000);
  if (ensureResult(adbCommand(['shell', 'getprop', 'ro.kernel.qemu']), 'Emulator identity read failed') !== '1') {
    throw Error('Refusing preflight outside an actual disposable Android emulator.');
  }
  ensureResult(adbCommand(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']), 'Emulator wake failed');
  ensureResult(adbCommand(['shell', 'wm', 'dismiss-keyguard']), 'Emulator unlock failed');
  if (grantNotifications) {
    const sdk = Number(ensureResult(adbCommand(['shell', 'getprop', 'ro.build.version.sdk']), 'Android SDK read failed'));
    if (!Number.isInteger(sdk) || sdk < 1) throw Error('Unknown actual Android SDK.');
    if (sdk >= 33) {
      ensureResult(adbCommand(['shell', 'pm', 'grant', appId, 'android.permission.POST_NOTIFICATIONS']), 'Isolated notification permission grant failed');
      const permission = ensureResult(adbCommand(['shell', 'dumpsys', 'package', appId]), 'Notification permission inspection failed');
      if (!/android\.permission\.POST_NOTIFICATIONS:\s+granted=true\b/.test(permission)) {
        throw Error('Isolated notification permission was not observed granted in the actual package state.');
      }
      phase({stage: 'notification-permission', sdk, appId, permission: 'granted=true observed'});
    } else phase({stage: 'notification-permission-not-required', sdk, appId});
  }
  let stable = 0, closedLauncherAnr = false, nullHierarchyAttempts = 0;
  while (now() < deadline) {
    const boot = ensureResult(adbCommand(['shell', 'getprop', 'sys.boot_completed']), 'Boot state read failed');
    let result;
    try {
      result = await inspectAndroidForeground({adb, device, appId, command: boundedCommand, phase, currentFocusOnly: true});
    } catch (error) {
      if (!closedLauncherAnr || error.code !== 'ANDROID_LAUNCHER_NULL_HIERARCHY') throw error;
      if (++nullHierarchyAttempts > 3) throw Error('Launcher recovery null hierarchy retry budget exhausted.');
      stable = 0;
      phase({stage: 'not-ready', reason: 'launcher-recovery-null-root', attempt: nullHierarchyAttempts, maxAttempts: 3});
      await sleep(Math.min(500, Math.max(0, deadline - now())));
      continue;
    }
    if (result.modal?.kind === 'launcher-anr') closedLauncherAnr = true;
    const immersive = result.focus.some(line => /mCurrentFocus=.*ImmersiveModeConfirmation/.test(line));
    if (immersive) phase({stage: 'not-ready', reason: 'immersive-confirmation-visible'});
    // Two independently observed clean windows, not a guessed sleep, are needed
    // before launching the real entry. No CHECK result is fabricated here.
    stable = boot === '1' && !result.modal && !immersive && result.focus.some(line => /mCurrentFocus=Window\{/.test(line)) &&
      !result.focus.some(line => /mCurrentFocus=null/.test(line)) ? stable + 1 : 0;
    if (stable >= 2) {phase({stage: 'ready', appId, stableObservations: stable}); return;}
    await sleep(Math.min(500, Math.max(0, deadline - now())));
  }
  throw expired();
}
