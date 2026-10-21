import type { ComfyDependencyCheck, ComfyInstallInspection, ComfyLocalConfig, ComfyPlatformInfo, ComfySnapshot } from './contract';
import type { ComfyEnvironmentCandidate, ComfySetupPhase } from './setup-contract';

/** Presentation keys only. Callers translate them; paths and technical facts stay separate. */
export const COMFY_ENVIRONMENT_GUIDE_TEXT = {
  loadingTitle: '正在读取环境状态', loadingBody: '读取完成后再选择下一步。', refresh: '刷新状态',
  busyTitle: '正在处理环境操作', busyBody: '请等待当前操作完成，不会同时切换环境。', waiting: '请稍候',
  installingTitle: '正在安装独立环境', installingBody: '安装期间不能切换环境；不会覆盖已有目录。',
  startingTitle: '正在启动 ComfyUI', startingBody: '正在确认本机服务是否就绪，请等待实际检测结果。',
  stoppingTitle: '正在停止或断开服务', stoppingBody: '确认完成后才能修改环境。',
  readyTitle: 'ComfyUI 已就绪', readyBody: '本机服务已响应，可以返回创作或打开网页。', open: '打开 ComfyUI 网页',
  create: '返回创作', viewTask: '查看当前任务',
  appLock: '服务运行中，停止服务后才能修改环境。', appNext: '如需更换环境，请先停止本软件启动的服务。',
  externalLock: '已连接外部服务，断开连接后才能修改环境。', externalNext: '如需更换环境，请先断开连接；不会结束外部进程。',
  transitionLock: '当前操作尚未结束，暂不能修改环境。', transitionNext: '等待当前操作结束后再修改环境。',
  taskTitle: '任务仍在执行', taskBody: '任务结束或取消后才能切换环境。', taskLock: '任务执行期间不能修改环境。',
  unresolvedTitle: '服务状态尚未确认', unresolvedBody: '先刷新实际服务状态；不会因此自动重启或重新生图。',
  unresponsiveTitle: '服务暂未响应', unresponsiveBody: '先刷新状态并查看诊断，不会自动重启服务。',
  stoppedLock: '服务停止状态尚未确认，暂不能修改环境。', stoppedNext: '查看诊断并确认服务已停止后再修改环境。',
  connectTitle: '发现本机运行的 ComfyUI', connectBody: '连接后核验服务状态，不会接管或结束外部进程。', connect: '连接已有 ComfyUI',
  chooseTitle: '先选择 ComfyUI 主目录', chooseBody: '选择已有主目录后识别 Python；启动时自动检查可用端口。', choose: '选择 ComfyUI 主目录',
  noPythonTitle: '需要确认 Python 环境', noPythonBody: '当前没有已确认的解释器，请重新选择主目录。', chooseAgain: '重新选择主目录',
  pythonNext: '自动识别无法确认时，可在高级设置中选择已有 Python。',
  inspectTitle: '需要检查环境诊断', inspectBody: '启动参数读取未通过，先查看诊断并核对已有解释器。', resolve: '查看环境诊断',
  configuredTitle: '环境已识别，尚未启动', configuredBody: '点击启动后核验实际服务；不会安装或升级依赖。', start: '启动本地 ComfyUI',
  dependencyTitle: '依赖信息需要核对', dependencyBody: '依赖元数据有差异，不代表实际启动结果；不会自动安装或升级。',
  unknownDependencyTitle: '依赖信息暂未确认', unknownDependencyBody: '保留当前解释器，启动时核验实际结果；不会静默替换环境。',
  autoPortTitle: '端口暂不可用', autoPortBody: '再次启动时会重新选择可用端口，不会结束占用端口的程序。', retryAutoPort: '重试并自动选择端口',
  manualPortTitle: '需要检查端口设置', manualPortBody: '当前使用手动端口，请在高级设置中检查占用或启用自动端口。', resolvePort: '检查端口设置',
  connectionTitle: '需要检查本机连接', connectionBody: '当前地址没有返回可用的 ComfyUI，请核对服务与端口。', resolveConnection: '检查连接设置',
  failureTitle: 'ComfyUI 启动未完成', failureBody: '查看本次诊断后再处理，不会自动重启或更换环境。',
  unsupportedTitle: '当前平台不支持本地启动', unsupportedBody: '可以连接本机已有的 ComfyUI；不会自动安装环境。',
  notChecked: '尚未核验', noPython: '未检测到 Python',
} as const;
const T = COMFY_ENVIRONMENT_GUIDE_TEXT;
export type ComfyEnvironmentGuideAction = 'choose' | 'start' | 'connect' | 'open' | 'refresh' | 'resolve' | 'wait' | 'create' | 'view-task';
export interface ComfyEnvironmentGuide {
  status: 'loading' | 'busy' | 'starting' | 'stopping' | 'ready' | 'unresponsive' | 'unconfigured' | 'python-required' | 'inspection-required' | 'configured' | 'warning' | 'failed' | 'unsupported';
  tone: 'neutral' | 'success' | 'warning' | 'error';
  usable: boolean;
  title: string;
  body: string;
  primaryAction: { kind: ComfyEnvironmentGuideAction; label: string; disabled: boolean; reason: string | null; next: string; focus?: 'python' | 'summary' };
  configurationLocked: boolean;
  lockReason: string | null;
  next: string;
}
export interface ComfyEnvironmentGuideInput {
  config: ComfyLocalConfig | null | undefined;
  snapshot: ComfySnapshot | null | undefined;
  platform?: Pick<ComfyPlatformInfo, 'launchSupported'> | null;
  busy?: boolean;
  setupBusy?: boolean;
  hasActiveJob?: boolean;
  setupPhase?: ComfySetupPhase;
}
const ACTIVE_TASKS = new Set(['validating', 'submitting', 'queued', 'running', 'saving', 'cancelling']);
const ACTIVE_SETUP = new Set<ComfySetupPhase>(['hashing', 'preflight', 'extracting', 'validating']);
export type ComfyMetadataCompatibility = 'not-checked' | 'matched' | 'conflict' | 'unknown';
function compatibility(checks?: readonly ComfyDependencyCheck[]): ComfyMetadataCompatibility {
  if (!checks?.length) return 'not-checked';
  if (checks.some(check => check.status === 'missing' || check.status === 'mismatch')) return 'conflict';
  return checks.every(check => check.status === 'satisfied') ? 'matched' : 'unknown';
}

/** Derives one next action from observations only; it cannot execute, select or save anything. */
export function deriveComfyEnvironmentGuide(input: ComfyEnvironmentGuideInput): ComfyEnvironmentGuide {
  const { config, snapshot, platform } = input;
  const taskActive = Boolean(input.hasActiveJob || snapshot?.activeRun && ACTIVE_TASKS.has(snapshot.activeRun.phase));
  const transitioning = Boolean(snapshot && ['probing', 'starting', 'stopping'].includes(snapshot.phase));
  const ownedUnstopped = snapshot?.owner === 'app' && snapshot.pid !== null;
  const setupActive = Boolean(input.setupPhase && ACTIVE_SETUP.has(input.setupPhase));
  const operationBusy = input.busy || input.setupBusy;
  const unconfirmedStop = snapshot?.failure?.code === 'stop-failed';
  const configurationLocked = Boolean(operationBusy || setupActive || taskActive || transitioning || snapshot?.phase === 'ready' || ownedUnstopped || unconfirmedStop);
  const lockReason = taskActive ? T.taskLock : operationBusy || setupActive || transitioning ? T.transitionLock
    : snapshot?.phase === 'ready' ? snapshot.owner === 'external' ? T.externalLock : T.appLock
    : ownedUnstopped || unconfirmedStop ? T.stoppedLock : null;
  const lockNext = taskActive ? T.taskBody : snapshot?.phase === 'ready' ? snapshot.owner === 'external' ? T.externalNext : T.appNext
    : ownedUnstopped || unconfirmedStop ? T.stoppedNext : T.transitionNext;
  const guide = (status: ComfyEnvironmentGuide['status'], tone: ComfyEnvironmentGuide['tone'], title: string, body: string,
    kind: ComfyEnvironmentGuideAction, label: string, next = body, disabled = false, focus?: 'python' | 'summary'): ComfyEnvironmentGuide => ({
    status, tone, usable: status === 'ready', title, body, primaryAction: { kind, label, disabled, reason: disabled ? next : null, next, ...(focus ? { focus } : {}) },
    configurationLocked, lockReason, next,
  });
  if (taskActive) return guide(snapshot?.phase === 'ready' && snapshot.health === 'ok' ? 'ready' : 'busy', 'neutral', T.taskTitle, T.taskBody, 'view-task', T.viewTask, T.taskBody);
  if (operationBusy || setupActive) return guide('busy', 'neutral', setupActive ? T.installingTitle : T.busyTitle, setupActive ? T.installingBody : T.busyBody, 'wait', T.waiting, T.transitionNext, true);
  if (!snapshot) return guide('loading', 'neutral', T.loadingTitle, T.loadingBody, 'refresh', T.refresh);
  if (snapshot.phase === 'starting' || snapshot.phase === 'probing') return guide('starting', 'neutral', T.startingTitle, T.startingBody, 'wait', T.waiting, T.transitionNext, true);
  if (snapshot.phase === 'stopping') return guide('stopping', 'neutral', T.stoppingTitle, T.stoppingBody, 'wait', T.waiting, T.transitionNext, true);
  if (snapshot.phase === 'ready') {
    if (snapshot.health === 'ok') return guide('ready', 'success', T.readyTitle, T.readyBody, 'create', T.create, lockNext);
    return guide('unresponsive', 'warning', snapshot.health === 'unresponsive' ? T.unresponsiveTitle : T.unresolvedTitle,
      snapshot.health === 'unresponsive' ? T.unresponsiveBody : T.unresolvedBody, 'refresh', T.refresh, lockNext);
  }
  if (ownedUnstopped || snapshot.failure?.code === 'stop-failed') return guide('failed', 'error', T.unresolvedTitle, T.stoppedNext, 'resolve', T.resolve, T.stoppedNext, false, 'summary');
  if (!config) return guide('loading', 'neutral', T.loadingTitle, T.loadingBody, 'refresh', T.refresh);
  const failure = snapshot.phase === 'failed' ? snapshot.failure : null;
  const install = config?.install;
  if (failure?.code === 'port-foreign' || failure?.code === 'port-reserved') {
    if (config?.launch.portMode === 'auto' && install?.python && platform?.launchSupported !== false) return guide('warning', 'warning', T.autoPortTitle, T.autoPortBody, 'start', T.retryAutoPort);
    return guide('failed', 'warning', T.manualPortTitle, T.manualPortBody, 'resolve', T.resolvePort, T.manualPortBody, false, 'summary');
  }
  if (failure?.code === 'unreachable' || failure?.code === 'not-comfyui') return guide('failed', 'error', T.connectionTitle, T.connectionBody, 'resolve', T.resolveConnection, T.connectionBody, false, 'summary');
  if (failure && ['help-probe-failed', 'exited-early', 'ready-timeout', 'spawn-error', 'crashed', 'attribution-mismatch'].includes(failure.code)) return guide('failed', 'error', T.failureTitle, T.failureBody, 'resolve', T.resolve, T.pythonNext, false, 'python');
  if (snapshot.phase === 'failed' && (!failure || !['install-invalid', 'not-configured', 'python-invalid'].includes(failure.code))) return guide('failed', 'error', T.failureTitle, T.failureBody, 'resolve', T.resolve, T.failureBody, false, 'summary');
  const detected = snapshot.detectedExternal;
  const target = config?.connection || snapshot.target;
  if (detected && detected.target.host === target.host && detected.target.port === target.port) return guide('configured', 'neutral', T.connectTitle, T.connectBody, 'connect', T.connect);
  if (platform?.launchSupported === false) return guide('unsupported', 'warning', T.unsupportedTitle, T.unsupportedBody, 'connect', T.connect);
  if (!install || failure?.code === 'install-invalid' || failure?.code === 'not-configured') return guide('unconfigured', 'neutral', T.chooseTitle, T.chooseBody, 'choose', T.choose);
  if (!install.python?.trim() || failure?.code === 'python-invalid') return guide('python-required', 'warning', T.noPythonTitle, T.noPythonBody, 'choose', T.chooseAgain, T.pythonNext);
  if (install.helpProbe === 'failed') return guide('inspection-required', 'warning', T.inspectTitle, T.inspectBody, 'resolve', T.resolve, T.pythonNext, false, 'python');
  const metadata = compatibility(install.dependencyChecks);
  if (metadata === 'conflict') return guide('warning', 'warning', T.dependencyTitle, T.dependencyBody, 'start', T.start);
  if (metadata !== 'matched') return guide('warning', 'warning', T.unknownDependencyTitle, T.unknownDependencyBody, 'start', T.start);
  return guide('configured', 'neutral', T.configuredTitle, T.configuredBody, 'start', T.start);
}

/** String comparison only, not a filesystem realpath or an assertion of validity. */
export function comfyEnvironmentPathKey(value: string, platform?: string): string {
  const windows = platform === 'win32' || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
  const separated = windows ? value.replace(/\\/g, '/') : value;
  const normalized = separated === '/' || /^[A-Za-z]:\/$/.test(separated) ? separated : separated.replace(/\/+$/, '');
  return `${windows ? 'windows' : 'posix'}:${windows ? normalized.toLowerCase() : normalized}`;
}
export interface ComfyEnvironmentInterpreterGroup {
  key: string;
  label: string;
  python: string;
  pythonArgs: string[];
  layout: ComfyEnvironmentCandidate['layout'];
  layouts: ComfyEnvironmentCandidate['layout'][];
  isCurrent: boolean;
  isSaved: boolean;
  sources: NonNullable<ComfyEnvironmentCandidate['source']>[];
  warnings: string[];
  candidates: ComfyEnvironmentCandidate[];
  compatibility: ComfyMetadataCompatibility;
  dependencyChecks: ComfyDependencyCheck[];
  dependencyProbeMessage: string | null;
  helpProbe: ComfyInstallInspection['helpProbe'] | null;
}
export interface ComfyEnvironmentRootGroup {
  id: string;
  root: string;
  label: string;
  labels: string[];
  isCurrent: boolean;
  isSaved: boolean;
  hasMultipleInterpreters: boolean;
  interpreters: ComfyEnvironmentInterpreterGroup[];
}
const add = <T,>(items: T[], value: T) => { if (!items.includes(value)) items.push(value); };

/** One card per normalized main directory, never one implicit choice per card. */
export function groupComfyEnvironmentCandidates(candidates: readonly ComfyEnvironmentCandidate[], options: { platform?: string; install?: ComfyInstallInspection | null } = {}): ComfyEnvironmentRootGroup[] {
  const groups = new Map<string, ComfyEnvironmentRootGroup>();
  const key = (value: string) => comfyEnvironmentPathKey(value, options.platform);
  for (const source of candidates) {
    const rootKey = key(source.root), args = [...(source.pythonArgs || [])];
    let group = groups.get(rootKey);
    if (!group) { group = { id: rootKey, root: source.root, label: source.label, labels: [], isCurrent: false, isSaved: false, hasMultipleInterpreters: false, interpreters: [] }; groups.set(rootKey, group); }
    add(group.labels, source.label);
    const interpreterKey = JSON.stringify([key(source.python), args]);
    const inspection = options.install;
    const matchingInspection = Boolean(inspection && key(inspection.root) === rootKey && key(inspection.python) === key(source.python) && JSON.stringify(inspection.pythonArgs || []) === JSON.stringify(args));
    const current = Boolean(source.isCurrent || matchingInspection);
    const saved = source.source === 'configured' || current;
    let interpreter = group.interpreters.find(item => item.key === interpreterKey);
    if (!interpreter) {
      interpreter = { key: interpreterKey, label: source.python ? `${source.python}${args.length ? ` ${args.join(' ')}` : ''}` : T.noPython,
        python: source.python, pythonArgs: args, layout: source.layout, layouts: [], isCurrent: false, isSaved: false, sources: [], warnings: [], candidates: [],
        compatibility: 'not-checked', dependencyChecks: [], dependencyProbeMessage: null, helpProbe: null };
      group.interpreters.push(interpreter);
    }
    interpreter.candidates.push({ ...source, warnings: [...source.warnings], ...(source.pythonArgs ? { pythonArgs: [...source.pythonArgs] } : {}) });
    add(interpreter.layouts, source.layout);
    if (source.source) add(interpreter.sources, source.source);
    for (const warning of source.warnings) add(interpreter.warnings, warning);
    interpreter.isCurrent ||= current; interpreter.isSaved ||= saved;
    group.isCurrent ||= current; group.isSaved ||= saved;
    if (matchingInspection && inspection) {
      interpreter.compatibility = compatibility(inspection.dependencyChecks);
      interpreter.dependencyChecks = (inspection.dependencyChecks || []).map(check => ({ ...check }));
      interpreter.dependencyProbeMessage = inspection.dependencyProbeMessage || null;
      interpreter.helpProbe = inspection.helpProbe;
    }
  }
  for (const group of groups.values()) group.hasMultipleInterpreters = group.interpreters.filter(item => Boolean(item.python)).length > 1;
  return [...groups.values()];
}
