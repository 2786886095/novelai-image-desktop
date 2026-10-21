import { describe, expect, it } from 'vitest';
import type { ComfyDependencyCheck, ComfyFailureCode, ComfyInstallInspection, ComfyLocalConfig, ComfyRunSnapshot, ComfySnapshot } from './contract';
import type { ComfyEnvironmentCandidate } from './setup-contract';
import { COMFY_ENVIRONMENT_GUIDE_TEXT as T, comfyEnvironmentPathKey, deriveComfyEnvironmentGuide, groupComfyEnvironmentCandidates } from './environment-guide';

const check = (status: ComfyDependencyCheck['status']): ComfyDependencyCheck => ({ name: 'fixture-package', required: '1', installed: status === 'missing' ? null : '1', status });
function install(patch: Partial<ComfyInstallInspection> = {}): ComfyInstallInspection {
  return { root: 'F:\\Bundle\\ComfyUI', mainPy: 'F:\\Bundle\\ComfyUI\\main.py', python: 'F:\\Bundle\\.ext\\python.exe', cwd: 'F:\\Bundle',
    layout: 'portable', pythonArgs: [], pythonVersion: '3.11', supportedFlags: ['--disable-auto-launch'], helpProbe: 'passed', helpProbeMessage: null,
    checkedAt: '2026-10-21T00:00:00.000Z', dependencyChecks: [check('satisfied')], pythonSelection: { mode: 'auto', reason: 'COMFY_PYTHON_AUTO_METADATA_MATCH' }, ...patch };
}
function config(current: ComfyInstallInspection | null = install()): ComfyLocalConfig {
  return { schema: 1, install: current, launch: { portMode: 'auto', port: 8188, readyTimeoutSec: 300, disableApiNodes: true, safeMode: false, extraArgs: [] },
    connection: { host: '127.0.0.1', port: 8188 }, outputDirectory: null };
}
function snapshot(patch: Partial<ComfySnapshot> = {}): ComfySnapshot {
  return { phase: 'idle', owner: null, stage: null, target: { host: '127.0.0.1', port: 8188 }, baseUrl: null, pid: null, startedAt: null, readyAt: null,
    failure: null, identity: null, health: 'unknown', detectedExternal: null, previousSession: null, inventory: null, activeRun: null, logs: [], ...patch };
}
function failed(code: ComfyFailureCode, patch: Partial<ComfySnapshot> = {}): ComfySnapshot {
  return snapshot({ phase: 'failed', failure: { code, message: 'RAW_DIAGNOSTIC_MUST_NOT_BE_A_TRANSLATED_STATUS', exitCode: null, signal: null, logTail: [], at: '2026-10-21T00:00:00.000Z' }, ...patch });
}
function candidate(id: string, patch: Partial<ComfyEnvironmentCandidate> = {}): ComfyEnvironmentCandidate {
  return { id, label: 'Bundle', root: 'F:\\Bundle\\ComfyUI', python: 'F:\\Bundle\\.ext\\python.exe', layout: 'aki', modelDirectory: 'F:\\Bundle\\ComfyUI\\models',
    reason: 'static-layout-detected', warnings: ['runtime-not-verified'], sourceRoot: 'F:\\Bundle', source: 'discovered', pythonArgs: [], ...patch };
}
const identity = { comfyuiVersion: 'fixture', pythonVersion: null, pytorchVersion: null, embeddedPython: null, argv: null, os: null, devices: [], isProtocolFixture: true };

describe('pure guided ComfyUI environment state', () => {
  it('requires actual healthy readiness; missing snapshot only offers a state read', () => {
    const loading = deriveComfyEnvironmentGuide({ config: config(), snapshot: null });
    expect(loading).toMatchObject({ status: 'loading', usable: false, primaryAction: { kind: 'refresh', disabled: false } });
    expect(deriveComfyEnvironmentGuide({ config: null, snapshot: snapshot() })).toMatchObject({ status: 'loading', primaryAction: { kind: 'refresh' } });
    const ready = deriveComfyEnvironmentGuide({ config: config(install({ helpProbe: 'failed', dependencyChecks: [check('mismatch')] })), snapshot: snapshot({ phase: 'ready', owner: 'app', health: 'ok', pid: 42 }) });
    expect(ready).toMatchObject({ status: 'ready', usable: true, primaryAction: { kind: 'create', label: T.create }, configurationLocked: true, lockReason: T.appLock });
    for (const health of ['unknown', 'unresponsive'] as const) {
      const state = deriveComfyEnvironmentGuide({ config: config(), snapshot: snapshot({ phase: 'ready', owner: 'external', health }) });
      expect(state).toMatchObject({ status: 'unresponsive', usable: false, configurationLocked: true, primaryAction: { kind: 'refresh', disabled: false }, lockReason: T.externalLock });
      expect(state.title).not.toBe(T.readyTitle);
    }
  });
  it.each(['probing', 'starting', 'stopping'] as const)('locks %s with an explicit wait reason and does not suggest another environment', phase => {
    const state = deriveComfyEnvironmentGuide({ config: config(), snapshot: snapshot({ phase }) });
    expect(state).toMatchObject({ usable: false, configurationLocked: true, primaryAction: { kind: 'wait', disabled: true, reason: T.transitionNext } });
    expect(state.next).toBe(T.transitionNext);
  });
  it.each(['hashing', 'preflight', 'extracting', 'validating'] as const)('locks setup %s without an implicit launch', setupPhase => {
    const state = deriveComfyEnvironmentGuide({ config: config(), snapshot: snapshot(), setupPhase });
    expect(state).toMatchObject({ status: 'busy', title: T.installingTitle, configurationLocked: true, primaryAction: { kind: 'wait', disabled: true } });
  });
  it('treats caller busy flags as readonly operation locks', () => {
    for (const flags of [{ busy: true }, { setupBusy: true }]) {
      expect(deriveComfyEnvironmentGuide({ config: config(null), snapshot: snapshot(), ...flags })).toMatchObject({ status: 'busy', configurationLocked: true, lockReason: T.transitionLock, primaryAction: { kind: 'wait', disabled: true } });
    }
  });
  it('offers one main-directory step rather than separate Python and port requirements', () => {
    expect(deriveComfyEnvironmentGuide({ config: config(null), snapshot: snapshot() })).toMatchObject({ status: 'unconfigured', title: T.chooseTitle, primaryAction: { kind: 'choose' }, configurationLocked: false });
    expect(deriveComfyEnvironmentGuide({ config: config(install({ python: '', helpProbe: 'not-run', pythonSelection: { mode: 'auto', reason: 'COMFY_PYTHON_AUTO_UNCONFIRMED' } })), snapshot: snapshot() })).toMatchObject({ status: 'python-required', primaryAction: { kind: 'choose', label: T.chooseAgain, next: T.pythonNext } });
  });
  it('never treats metadata compatibility as usable, and preserves unknown manual selections', () => {
    const exact = deriveComfyEnvironmentGuide({ config: config(), snapshot: snapshot() });
    expect(exact).toMatchObject({ status: 'configured', usable: false, primaryAction: { kind: 'start' } });
    for (const dependencyChecks of [undefined, [], [check('unknown')], [check('missing')], [check('mismatch')], [check('satisfied'), check('unknown')]]) {
      const state = deriveComfyEnvironmentGuide({ config: config(install({ dependencyChecks, pythonSelection: { mode: 'manual', reason: 'COMFY_PYTHON_MANUAL_SELECTION' } })), snapshot: snapshot() });
      expect(state).toMatchObject({ status: 'warning', usable: false, primaryAction: { kind: 'start' } });
      expect(state.title).not.toBe(T.readyTitle);
    }
  });
  it('shows a help failure as resolvable, rather than pretending to choose a compatible Python', () => {
    const state = deriveComfyEnvironmentGuide({ config: config(install({ helpProbe: 'failed', dependencyChecks: [check('satisfied')] })), snapshot: snapshot() });
    expect(state).toMatchObject({ status: 'inspection-required', usable: false, primaryAction: { kind: 'resolve', focus: 'python' } });
  });
  it.each(['port-foreign', 'port-reserved'] as const)('distinguishes automatic vs manual %s without modifying either', code => {
    const autoConfig = config(), manualConfig = config(); manualConfig.launch.portMode = 'manual';
    expect(deriveComfyEnvironmentGuide({ config: autoConfig, snapshot: failed(code) })).toMatchObject({ primaryAction: { kind: 'start', label: T.retryAutoPort }, usable: false });
    expect(deriveComfyEnvironmentGuide({ config: manualConfig, snapshot: failed(code) })).toMatchObject({ primaryAction: { kind: 'resolve', label: T.resolvePort, focus: 'summary' }, usable: false });
    expect(autoConfig.launch.portMode).toBe('auto'); expect(manualConfig.launch.portMode).toBe('manual');
    expect(deriveComfyEnvironmentGuide({ config: autoConfig, snapshot: failed(code, { owner: 'app', pid: 10 }) }).primaryAction.kind).toBe('resolve');
  });
  it('connects a matching detected endpoint but never silently swaps to a different port', () => {
    const detectedExternal = { target: { host: '127.0.0.1' as const, port: 8188 }, identity };
    expect(deriveComfyEnvironmentGuide({ config: config(null), snapshot: snapshot({ detectedExternal }) })).toMatchObject({ usable: false, primaryAction: { kind: 'connect' } });
    const mismatch = { ...detectedExternal, target: { ...detectedExternal.target, port: 1135 } };
    expect(deriveComfyEnvironmentGuide({ config: config(null), snapshot: snapshot({ detectedExternal: mismatch }) }).primaryAction.kind).toBe('choose');
  });
  it('allows external connection on unsupported local-launch platforms without advertising a start', () => {
    expect(deriveComfyEnvironmentGuide({ config: config(), snapshot: snapshot(), platform: { launchSupported: false } })).toMatchObject({ status: 'unsupported', usable: false, primaryAction: { kind: 'connect' } });
  });
  it.each(['unreachable', 'not-comfyui'] as const)('uses connection diagnostics for %s', code => {
    expect(deriveComfyEnvironmentGuide({ config: config(), snapshot: failed(code) })).toMatchObject({ status: 'failed', primaryAction: { kind: 'resolve', label: T.resolveConnection, focus: 'summary' } });
  });
  it.each(['spawn-error', 'exited-early', 'ready-timeout', 'crashed', 'attribution-mismatch', 'help-probe-failed'] as const)('uses explicit diagnostics for %s and never copies raw error text into translated status', code => {
    const state = deriveComfyEnvironmentGuide({ config: config(), snapshot: failed(code) });
    expect(state).toMatchObject({ status: 'failed', usable: false, primaryAction: { kind: 'resolve', focus: 'python' } });
    expect(JSON.stringify(state)).not.toContain('RAW_DIAGNOSTIC');
  });
  it('keeps an unresolved stop locked even if there is no trusted pid to display', () => {
    const state = deriveComfyEnvironmentGuide({ config: config(), snapshot: failed('stop-failed') });
    expect(state).toMatchObject({ configurationLocked: true, lockReason: T.stoppedLock, primaryAction: { kind: 'resolve' }, next: T.stoppedNext });
  });
  it('fails safely to diagnostics when a failed snapshot has no recognizable diagnosis', () => {
    for (const state of [snapshot({ phase: 'failed' }), failed('future-backend-failure' as ComfyFailureCode)]) {
      expect(deriveComfyEnvironmentGuide({ config: config(), snapshot: state })).toMatchObject({ status: 'failed', usable: false, primaryAction: { kind: 'resolve', focus: 'summary' } });
    }
  });
  it.each(['validating', 'submitting', 'queued', 'running', 'saving', 'cancelling'] as const)('routes active %s work to task viewing, never to stopping the service', phase => {
    const state = deriveComfyEnvironmentGuide({ config: config(), snapshot: snapshot({ phase: 'ready', health: 'ok', owner: 'app', activeRun: { phase } as ComfyRunSnapshot }) });
    expect(state).toMatchObject({ usable: true, configurationLocked: true, lockReason: T.taskLock, next: T.taskBody, primaryAction: { kind: 'view-task', disabled: false } });
    expect(state.next).not.toContain('停止');
  });
  it('honors caller-known work even without a service snapshot or during a concurrent refresh', () => {
    for (const current of [null, snapshot(), snapshot({ phase: 'starting' })]) {
      const state = deriveComfyEnvironmentGuide({ config: config(), snapshot: current, hasActiveJob: true, busy: true });
      expect(state).toMatchObject({ configurationLocked: true, lockReason: T.taskLock, primaryAction: { kind: 'view-task' }, usable: false });
    }
  });
  it.each(['completed', 'failed', 'cancelled'] as const)('does not treat a terminal %s run as an active lock', phase => {
    expect(deriveComfyEnvironmentGuide({ config: config(), snapshot: snapshot({ activeRun: { phase } as ComfyRunSnapshot }) })).toMatchObject({ configurationLocked: false, primaryAction: { kind: 'start' } });
  });
});

describe('one main-directory card with explicit interpreter choices', () => {
  it('normalizes Windows spelling only and does not invent filesystem equivalence', () => {
    expect(comfyEnvironmentPathKey('F:\\Bundle\\ComfyUI\\')).toBe(comfyEnvironmentPathKey('f:/bundle/COMFYUI'));
    expect(comfyEnvironmentPathKey('/home/ComfyUI')).not.toBe(comfyEnvironmentPathKey('/home/comfyui'));
    expect(comfyEnvironmentPathKey('/home/project/../ComfyUI')).not.toBe(comfyEnvironmentPathKey('/home/ComfyUI'));
  });
  it('merges duplicate configured/discovered choices but retains every original ID and source flag', () => {
    const values = [candidate('saved', { source: 'configured', isCurrent: true }), candidate('discovered', { root: 'f:/bundle/comfyui/', python: 'f:/bundle/.EXT/PYTHON.EXE', warnings: ['static-only'] }),
      candidate('other-python', { python: 'F:\\Bundle\\python\\python.exe', source: 'managed', layout: 'portable' })];
    const result = groupComfyEnvironmentCandidates(values, { install: install() });
    expect(result).toHaveLength(1); expect(result[0]).toMatchObject({ isCurrent: true, isSaved: true, hasMultipleInterpreters: true });
    expect(result[0].interpreters).toHaveLength(2);
    expect(result[0].interpreters[0]).toMatchObject({ isCurrent: true, isSaved: true, sources: ['configured', 'discovered'], compatibility: 'matched', helpProbe: 'passed' });
    expect(result[0].interpreters[0].candidates.map(item => item.id)).toEqual(['saved', 'discovered']);
    expect(result[0].interpreters[0].warnings).toEqual(['runtime-not-verified', 'static-only']);
    expect(result[0].interpreters[1]).toMatchObject({ isCurrent: false, isSaved: false, compatibility: 'not-checked', sources: ['managed'] });
    expect(result[0].interpreters[0].label).not.toBe(result[0].interpreters[1].label);
  });
  it('does not equate an identical Python path with identical interpreter arguments or discard layout observations', () => {
    const result = groupComfyEnvironmentCandidates([candidate('with-prefix', { pythonArgs: ['-s'], layout: 'portable' }), candidate('without-prefix'), candidate('same-with-layout', { source: 'configured', layout: 'source' })], { install: install() });
    expect(result[0].interpreters).toHaveLength(2); expect(result[0].hasMultipleInterpreters).toBe(true);
    expect(result[0].interpreters[0]).toMatchObject({ pythonArgs: ['-s'], compatibility: 'not-checked' });
    expect(result[0].interpreters[1]).toMatchObject({ pythonArgs: [], compatibility: 'matched', layouts: ['aki', 'source'], sources: ['discovered', 'configured'] });
    expect(result[0].interpreters[1].candidates.map(item => item.id)).toEqual(['without-prefix', 'same-with-layout']);
  });
  it('never merges different main directories just because they share a scan boundary, label or Python', () => {
    const result = groupComfyEnvironmentCandidates([candidate('a'), candidate('b', { root: 'F:\\Bundle\\OtherComfyUI' }), candidate('linux', { root: '/opt/ComfyUI', python: '/opt/venv/bin/python' }), candidate('linux-case', { root: '/opt/comfyui', python: '/opt/venv/bin/python' })]);
    expect(result).toHaveLength(4);
  });
  it('keeps missing-Python observations explicit and never promotes another candidate as confirmed compatible', () => {
    const result = groupComfyEnvironmentCandidates([candidate('no-runtime', { python: '', reason: 'python-not-found', layout: 'source' }), candidate('unverified-alternative')]);
    expect(result[0].interpreters).toHaveLength(2); expect(result[0].hasMultipleInterpreters).toBe(false);
    expect(result[0].interpreters.map(item => item.compatibility)).toEqual(['not-checked', 'not-checked']);
    expect(result[0].interpreters[0].label).toBe(T.noPython);
    expect(result[0].interpreters.every(item => !item.isCurrent)).toBe(true);
  });
  it.each(['unknown', 'missing', 'mismatch', 'satisfied'] as const)('retains authoritative %s metadata only for the exact configured source/runtime', status => {
    const result = groupComfyEnvironmentCandidates([candidate('current'), candidate('other', { python: 'F:\\other\\python.exe' })], { install: install({ dependencyChecks: [check(status)], dependencyProbeMessage: 'actual backend metadata' }) });
    expect(result[0].interpreters[0]).toMatchObject({ compatibility: status === 'satisfied' ? 'matched' : status === 'unknown' ? 'unknown' : 'conflict', dependencyChecks: [check(status)], dependencyProbeMessage: 'actual backend metadata' });
    expect(result[0].interpreters[1]).toMatchObject({ compatibility: 'not-checked', dependencyChecks: [], dependencyProbeMessage: null });
  });
  it('is deterministic, read-only and returns independent arrays for presentation', () => {
    const current = config(), state = snapshot(), candidates = [candidate('a')];
    const before = JSON.stringify({ current, state, candidates });
    const first = deriveComfyEnvironmentGuide({ config: current, snapshot: state });
    expect(deriveComfyEnvironmentGuide({ config: current, snapshot: state })).toEqual(first);
    const grouped = groupComfyEnvironmentCandidates(candidates, { install: current.install });
    grouped[0].interpreters[0].warnings.push('presentation-only');
    grouped[0].interpreters[0].candidates[0].warnings.push('copied-candidate-only');
    grouped[0].interpreters[0].dependencyChecks[0].status = 'missing';
    expect(JSON.stringify({ current, state, candidates })).toBe(before);
  });
});
