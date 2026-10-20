/**
 * Local ComfyUI integration contract.
 *
 * Shared by the Electron main process, the preload bridge (`window.naiComfy`)
 * and the renderer. Types and constants only: no runtime dependency on React,
 * Electron or Node so both TypeScript projects compile this file.
 *
 * Trust boundary: the renderer never sends an executable path, a file path or
 * a prompt graph. It sends workflow ids, slot values and explicit confirmation
 * tokens; the main process owns every path, process and HTTP/WS request.
 */

export const COMFY_IPC = {
  getState: "comfyui:getState",
  snapshot: "comfyui:snapshot",
  chooseInstallDirectory: "comfyui:chooseInstallDirectory",
  choosePython: "comfyui:choosePython",
  chooseOutputDirectory: "comfyui:chooseOutputDirectory",
  detectInstall: "comfyui:detectInstall",
  setLaunchOptions: "comfyui:setLaunchOptions",
  setConnection: "comfyui:setConnection",
  start: "comfyui:start",
  connect: "comfyui:connect",
  stop: "comfyui:stop",
  disconnect: "comfyui:disconnect",
  refreshInventory: "comfyui:refreshInventory",
  importWorkflowFile: "comfyui:importWorkflowFile",
  importWorkflowJson: "comfyui:importWorkflowJson",
  listWorkflows: "comfyui:listWorkflows",
  renameWorkflow: "comfyui:renameWorkflow",
  deleteWorkflow: "comfyui:deleteWorkflow",
  analyzeWorkflow: "comfyui:analyzeWorkflow",
  run: "comfyui:run",
  cancel: "comfyui:cancel",
  listResults: "comfyui:listResults",
  openResult: "comfyui:openResult",
  openResultsFolder: "comfyui:openResultsFolder",
  reuseResult: "comfyui:reuseResult",
  /** main → renderer push channel. */
  event: "comfyui:event",
} as const;

export type ComfyIpcChannel = (typeof COMFY_IPC)[keyof typeof COMFY_IPC];

export const COMFY_DEFAULT_PORT = 8188;

/** Hard limits applied to untrusted data and renderer requests. */
export const COMFY_LIMITS = {
  workflowJsonChars: 16 * 1024 * 1024,
  workflowNodes: 5000,
  jsonDepth: 128,
  subgraphDepth: 16,
  stringValueChars: 1_000_000,
  slotTextChars: 65_536,
  slotCount: 128,
  workflowNameChars: 120,
  extraArgTokens: 64,
  extraArgChars: 1024,
  logLinesToRenderer: 300,
  readyTimeoutSecMin: 30,
  readyTimeoutSecMax: 1800,
} as const;

// ── Service state ────────────────────────────────────────────────────────────

/**
 * UI labels: idle=未启动, probing/starting=启动中, ready=启动完成,
 * failed=启动失败, stopping=停止中, stopped=已停止.
 * A spawned process is never `ready`; only a validated HTTP response is.
 */
export type ComfyPhase = "idle" | "probing" | "starting" | "ready" | "failed" | "stopping" | "stopped";

/** `app` = spawned and owned by this application; `external` = never terminated by it. */
export type ComfyOwner = "app" | "external";

export type ComfyStartStage = "checking-port" | "waiting-http";

export type ComfyFailureCode =
  | "not-configured"
  | "install-invalid"
  | "python-invalid"
  | "help-probe-failed"
  | "port-foreign"
  | "port-reserved"
  | "spawn-error"
  | "exited-early"
  | "ready-timeout"
  | "attribution-mismatch"
  | "crashed"
  | "unreachable"
  | "not-comfyui"
  | "stop-failed";

export interface ComfyFailure {
  code: ComfyFailureCode;
  /** Raw technical diagnostic; the renderer localizes by `code`. */
  message: string;
  exitCode: number | null;
  signal: string | null;
  /** Last redacted log lines captured before the failure. */
  logTail: string[];
  at: string;
}

export type ComfyLoopbackHost = "127.0.0.1" | "localhost" | "::1";

export interface ComfyConnectionTarget {
  host: ComfyLoopbackHost;
  port: number;
}

export interface ComfyLaunchOptions {
  port: number;
  readyTimeoutSec: number;
  /** Adds `--disable-api-nodes` only when the installed ComfyUI reports the flag. */
  disableApiNodes: boolean;
  /** Adds `--disable-all-custom-nodes` only when the installed ComfyUI reports the flag. */
  safeMode: boolean;
  /** Allow-listed extra flags, already tokenized (see launch-args.ts). */
  extraArgs: string[];
}

export type ComfyInstallLayout = "portable" | "venv" | "custom";

export interface ComfyInstallConfig {
  /** Directory containing main.py. */
  root: string;
  mainPy: string;
  python: string;
  layout: ComfyInstallLayout;
  /** Working directory used for spawn (portable root for the portable layout). */
  cwd: string;
}

export interface ComfyInstallInspection extends ComfyInstallConfig {
  pythonVersion: string | null;
  /** Flags parsed from `python main.py --help`; empty when the probe did not pass. */
  supportedFlags: string[];
  helpProbe: "passed" | "failed" | "not-run";
  helpProbeMessage: string | null;
  checkedAt: string;
}

export interface ComfyLocalConfig {
  schema: 1;
  install: ComfyInstallInspection | null;
  launch: ComfyLaunchOptions;
  connection: ComfyConnectionTarget;
  /** null = `<app outputDir>/ComfyUI`. Chosen only through a main-process dialog. */
  outputDirectory: string | null;
}

export interface ComfyDevice {
  name: string;
  type: string;
  vramTotal: number | null;
  vramFree: number | null;
}

export interface ComfyIdentity {
  comfyuiVersion: string | null;
  pythonVersion: string | null;
  pytorchVersion: string | null;
  embeddedPython: boolean | null;
  argv: string[] | null;
  os: string | null;
  devices: ComfyDevice[];
  /** `system_stats` declared itself a protocol test fixture. Never real inference. */
  isProtocolFixture: boolean;
}

export interface ComfyLogLine {
  seq: number;
  at: string;
  stream: "stdout" | "stderr" | "app";
  text: string;
}

export type ComfyHealth = "unknown" | "ok" | "unresponsive";

export interface ComfyInventorySummary {
  fetchedAt: string;
  nodeTypeCount: number;
  /** Opaque digest of the fetched object_info; part of every analysis revision. */
  catalogRevision: string;
  /** `/models` folder → file names when the endpoint answered; otherwise null. */
  modelFolders: Record<string, string[]> | null;
}

export interface ComfySnapshot {
  phase: ComfyPhase;
  owner: ComfyOwner | null;
  stage: ComfyStartStage | null;
  target: ComfyConnectionTarget;
  baseUrl: string | null;
  /** Only for owner=app. */
  pid: number | null;
  startedAt: string | null;
  readyAt: string | null;
  failure: ComfyFailure | null;
  identity: ComfyIdentity | null;
  health: ComfyHealth;
  /** Passive detection of a running instance that is not connected yet. */
  detectedExternal: { target: ComfyConnectionTarget; identity: ComfyIdentity } | null;
  /** Informational marker of a process launched by a previous session; never used to kill. */
  previousSession: { pid: number; port: number; startedAt: string } | null;
  inventory: ComfyInventorySummary | null;
  activeRun: ComfyRunSnapshot | null;
  logs: ComfyLogLine[];
}

export interface ComfyPlatformInfo {
  os: string;
  /** Launching is implemented on this OS. */
  launchSupported: boolean;
  /** Real-machine acceptance status of launching on this OS. */
  launchAcceptance: "verified" | "unverified";
}

// ── Analysis ─────────────────────────────────────────────────────────────────

export type ComfyIssueSeverity = "block" | "confirm" | "warn" | "info";

export type ComfyIssueCode =
  | "invalid-json"
  | "too-large"
  | "forbidden-key"
  | "unknown-format"
  | "ui-not-submittable"
  | "missing-node-type"
  | "missing-input"
  | "invalid-link"
  | "link-type-mismatch"
  | "missing-model"
  | "invalid-option"
  | "remote-option-unverified"
  | "value-type"
  | "value-range"
  | "cycle"
  | "no-output-node"
  | "cloud-node"
  | "third-party-node"
  | "unknown-node-origin"
  | "unknown-input"
  | "conversion-error"
  | "conversion-unverified"
  | "node-unverified"
  | "widget-mapping"
  | "subgraph-values"
  | "muted-dependency"
  | "unsupported-mode"
  | "group-node"
  | "inner-value-used"
  | "dynamic-prompt-syntax"
  | "switch-unresolved"
  | "pruned-branch"
  | "prompt-derived"
  | "negative-zeroed"
  | "stale-slot"
  | "slot-value"
  | "revision-mismatch"
  | "confirmation-required"
  | "unreachable-node"
  | "deprecated-node";

export interface ComfyIssue {
  code: ComfyIssueCode;
  severity: ComfyIssueSeverity;
  /** Technical English diagnostic; the renderer localizes by `code`. */
  message: string;
  nodeId?: string;
  classType?: string;
  input?: string;
  detail?: string;
}

export type ComfySlotKind =
  | "model"
  | "model-option"
  | "positive"
  | "negative"
  | "width"
  | "height"
  | "batch"
  | "seed"
  | "steps"
  | "cfg"
  | "sampler"
  | "scheduler"
  | "denoise"
  | "branch";

export type ComfyModelRole = "diffusion" | "checkpoint" | "text-encoder" | "vae" | "lora" | "controlnet" | "upscale" | "other";

export type ComfySlotValue = string | number | boolean;

export type ComfySlotValueType = "string" | "int" | "float" | "boolean" | "combo";

export interface ComfySlot {
  /** Stable for a given workflow + branch values: `${kind}:${nodeId}:${input}`. */
  id: string;
  kind: ComfySlotKind;
  /** API node id whose input is written. */
  nodeId: string;
  input: string;
  classType: string;
  /** Best available human label (subgraph input label, node title or input name). */
  label: string;
  valueType: ComfySlotValueType;
  /** Value in the imported workflow; null when the input is linked. */
  defaultValue: ComfySlotValue | null;
  /** Set when the input is currently a link; writing a value replaces the link. */
  linkedFrom?: { nodeId: string; classType: string };
  /** Combo options from the live object_info (actual local files for loaders). */
  options?: Array<string | number>;
  /** Options come from a remote route and could not be enumerated. */
  optionsRemote?: boolean;
  min?: number;
  max?: number;
  step?: number;
  multiline?: boolean;
  role?: ComfyModelRole;
  /** For `branch`: API node ids of the ComfySwitchNode(s) it controls. */
  controls?: string[];
}

export interface ComfyModelHint {
  name: string;
  /** Shown as text only; never downloaded automatically. */
  url: string | null;
  directory: string | null;
}

export interface ComfyMissingModel {
  nodeId: string;
  classType: string;
  input: string;
  value: string;
  role: ComfyModelRole;
  directoryHint: string | null;
  templateHint: ComfyModelHint | null;
}

export interface ComfyThirdPartyNode {
  classType: string;
  pythonModule: string | null;
  nodeIds: string[];
}

export type ComfyFamilyId = "moss-image" | "anima" | "krea2";

export interface ComfyFamilyGuess {
  family: ComfyFamilyId;
  variant: string | null;
  confidence: "template" | "encoder-type" | "model-file";
  evidence: string[];
}

export type ComfyConversionFate =
  | "converted"
  | "expanded-subgraph"
  | "virtual-dropped"
  | "muted"
  | "bypassed"
  | "primitive-inlined"
  | "reroute-resolved"
  | "failed";

export interface ComfyConversionNode {
  /** API id for converted nodes, otherwise the would-be execution id. */
  execId: string;
  uiPath: string;
  uiId: string;
  type: string;
  fate: ComfyConversionFate;
  reason?: string;
}

export interface ComfyConversionSummary {
  /** Always false until a template is proven against an official frontend export. */
  verified: boolean;
  totals: { input: number; accounted: number };
  fates: Partial<Record<ComfyConversionFate, number>>;
  nodes: ComfyConversionNode[];
}

export interface ComfyPrunedNode {
  nodeId: string;
  classType: string;
  reason: "switch-collapsed" | "unselected-branch" | "unreachable";
}

export interface ComfyAnalysis {
  ok: boolean;
  /** Opaque token; a run is rejected unless it echoes the current revision. */
  revision: string;
  sourceFormat: "api" | "ui";
  issues: ComfyIssue[];
  slots: ComfySlot[];
  missingNodeTypes: string[];
  missingModels: ComfyMissingModel[];
  cloudNodes: Array<{ nodeId: string; classType: string }>;
  thirdParty: ComfyThirdPartyNode[];
  /** Required in run confirmations when third-party nodes are present. */
  thirdPartyFingerprint: string | null;
  /** A UI→API conversion requires explicit confirmation before running. */
  unverifiedConversion: boolean;
  conversion: ComfyConversionSummary | null;
  family: ComfyFamilyGuess | null;
  prunedNodes: ComfyPrunedNode[];
  nodeCount: number;
  outputNodes: string[];
}

// ── Workflows, runs and results ──────────────────────────────────────────────

export type ComfyWorkflowSourceKind = "api-json" | "ui-json" | "image-metadata" | "graph-to-prompt";

export interface ComfyWorkflowSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sourceKind: ComfyWorkflowSourceKind;
  sourceFormat: "api" | "ui";
  sourceSha256: string;
  fileName: string | null;
  /** Official template file name when the source bytes match a known template. */
  templateName: string | null;
  familyLabel: ComfyFamilyId | null;
  lastAnalysis: { ok: boolean; at: string; blocking: number; revision: string } | null;
  /** Last slot values the user chose for this workflow. */
  savedValues: Record<string, ComfySlotValue>;
}

export interface ComfyRunConfirmations {
  /** Echo of `ComfyAnalysis.thirdPartyFingerprint` after the user confirmed. */
  thirdPartyFingerprint: string | null;
  /** User reviewed an unverified UI→API conversion. */
  unverifiedConversion: boolean;
}

export interface ComfyRunRequest {
  workflowId: string;
  analysisRevision: string;
  slotValues: Record<string, ComfySlotValue>;
  /** `random` draws a new value for every seed slot not given in slotValues. */
  seedMode: "fixed" | "random";
  confirmations: ComfyRunConfirmations;
}

export type ComfyRunPhase =
  | "validating"
  | "submitting"
  | "queued"
  | "running"
  | "saving"
  | "completed"
  | "failed"
  | "cancelling"
  | "cancelled";

export interface ComfyNodeError {
  nodeId: string;
  classType: string | null;
  message: string;
  details: string | null;
}

export interface ComfyResultItem {
  id: string;
  runId: string;
  workflowId: string;
  promptId: string;
  filePath: string;
  /** nai-local:// URL registered by the main process. */
  fileUrl: string;
  mime: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  sourceNodeId: string;
  createdAt: string;
  slotValues: Record<string, ComfySlotValue>;
}

export interface ComfyRunSnapshot {
  runId: string;
  workflowId: string;
  promptId: string | null;
  phase: ComfyRunPhase;
  queuePosition: number | null;
  currentNode: { id: string; classType: string | null } | null;
  progress: { value: number; max: number } | null;
  nodesExecuted: number;
  nodesTotal: number;
  startedAt: string;
  finishedAt: string | null;
  /** Seeds actually submitted, by slot id. */
  seeds: Record<string, number>;
  error: { code: string; message: string; nodeErrors: ComfyNodeError[] } | null;
  results: ComfyResultItem[];
  /** Outputs that are not still images (not imported, still in ComfyUI's output folder). */
  nonImageOutputs: number;
}

// ── Envelopes, events and the preload API ───────────────────────────────────

export type ComfyErrorCode =
  | ComfyFailureCode
  | "busy"
  | "invalid-request"
  | "not-ready"
  | "not-found"
  | "cancelled"
  | "io"
  | "blocked"
  | "stale"
  | "internal";

export interface ComfyError {
  code: ComfyErrorCode;
  message: string;
  detail?: string;
  issues?: ComfyIssue[];
}

export type ComfyResponse<T> = { ok: true; data: T } | { ok: false; error: ComfyError };

export type ComfyEvent =
  | { type: "snapshot"; snapshot: ComfySnapshot }
  | { type: "run"; run: ComfyRunSnapshot }
  | { type: "preview"; runId: string; dataUrl: string }
  | { type: "workflows"; workflows: ComfyWorkflowSummary[] }
  | { type: "results"; results: ComfyResultItem[] };

export interface ComfyStateBundle {
  config: ComfyLocalConfig;
  snapshot: ComfySnapshot;
  workflows: ComfyWorkflowSummary[];
  results: ComfyResultItem[];
  platform: ComfyPlatformInfo;
}

/** Exposed by preload as `window.naiComfy`. Every call resolves; failures use the envelope. */
export interface ComfyLocalApi {
  getState(): Promise<ComfyResponse<ComfyStateBundle>>;
  snapshot(): Promise<ComfyResponse<ComfySnapshot>>;
  /** Main-process dialogs. `null` data = the user cancelled. */
  chooseInstallDirectory(): Promise<ComfyResponse<ComfyLocalConfig | null>>;
  choosePython(): Promise<ComfyResponse<ComfyLocalConfig | null>>;
  chooseOutputDirectory(): Promise<ComfyResponse<ComfyLocalConfig | null>>;
  /** Re-inspect the configured install (layout, python, `--help` flags). */
  detectInstall(): Promise<ComfyResponse<ComfyLocalConfig>>;
  setLaunchOptions(patch: Partial<ComfyLaunchOptions>): Promise<ComfyResponse<ComfyLocalConfig>>;
  setConnection(target: ComfyConnectionTarget): Promise<ComfyResponse<ComfyLocalConfig>>;
  start(): Promise<ComfyResponse<ComfySnapshot>>;
  connect(): Promise<ComfyResponse<ComfySnapshot>>;
  /** Owned instance: stop it. External instance: rejected; use disconnect. */
  stop(options: { interruptRunning: boolean }): Promise<ComfyResponse<ComfySnapshot>>;
  disconnect(): Promise<ComfyResponse<ComfySnapshot>>;
  /** Re-fetch object_info / models so a fixed install can be re-analyzed. */
  refreshInventory(): Promise<ComfyResponse<ComfyInventorySummary>>;
  importWorkflowFile(): Promise<ComfyResponse<ComfyWorkflowSummary | null>>;
  importWorkflowJson(text: string, name?: string): Promise<ComfyResponse<ComfyWorkflowSummary>>;
  listWorkflows(): Promise<ComfyResponse<ComfyWorkflowSummary[]>>;
  renameWorkflow(workflowId: string, name: string): Promise<ComfyResponse<ComfyWorkflowSummary>>;
  deleteWorkflow(workflowId: string): Promise<ComfyResponse<{ deleted: boolean }>>;
  /** Analyze / re-analyze with the slot values currently chosen (branch values change the graph). */
  analyzeWorkflow(workflowId: string, slotValues?: Record<string, ComfySlotValue>): Promise<ComfyResponse<ComfyAnalysis>>;
  run(request: ComfyRunRequest): Promise<ComfyResponse<ComfyRunSnapshot>>;
  cancel(runId: string): Promise<ComfyResponse<ComfyRunSnapshot>>;
  listResults(): Promise<ComfyResponse<ComfyResultItem[]>>;
  /** Reveal one saved result in the system file manager. */
  openResult(resultId: string): Promise<ComfyResponse<void>>;
  openResultsFolder(): Promise<ComfyResponse<void>>;
  /** Slot values of a saved result, for loading back into the form. */
  reuseResult(resultId: string): Promise<ComfyResponse<{ workflowId: string; slotValues: Record<string, ComfySlotValue> }>>;
  /** Returns an unsubscribe function. */
  onEvent(callback: (event: ComfyEvent) => void): () => void;
}
