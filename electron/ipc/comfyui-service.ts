import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID, randomInt } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  ComfyLocalConfig, ComfyLaunchOptions, ComfyConnectionTarget, ComfySnapshot,
  ComfyStateBundle, ComfyEvent, ComfyWorkflowSummary, ComfyAnalysis,
  ComfySlotValue, ComfyRunRequest, ComfyRunSnapshot, ComfyResultItem,
  ComfyInventorySummary, ComfyPlatformInfo, ComfyInstallInspection,
} from "../../src/comfyui/contract";
import { COMFY_DEFAULT_PORT, COMFY_LIMITS } from "../../src/comfyui/contract";
import {
  readComfySettings, writeComfySettings, listWorkflowRecords, readWorkflowRecord,
  saveWorkflowRecord, renameWorkflowRecord, deleteWorkflowRecord,
  listResultRecords, readOwnedMarker, writeOwnedMarker, clearOwnedMarker,
} from "./comfyui-config";
import { ComfySupervisor, type SupervisorOptions } from "./comfyui-process";
import { detectInstallLayout, probeComfyHelp, buildLaunchSpec, validatePythonPath } from "./comfyui-install";
import { comfyGetJson, resolveLoopbackTarget, type ComfyTarget } from "./comfyui-http";
import { probeComfy } from "./comfyui-probe";
import { ComfyJobRunner, type ComfyCompiledPrompt, type ComfyCompiledRun } from "./comfyui-jobs";
import { toLocalMediaUrl } from "./local-media-protocol";

type Values = Record<string, ComfySlotValue>;
export interface StoredComfyWorkflow extends ComfyWorkflowSummary {
  /** Parsed JSON only. Never supplied by the renderer on run(). */
  payload: unknown;
  provenance?: Record<string, unknown>;
}
export interface TrustedComfyAnalysis {
  analysis: ComfyAnalysis;
  prompt: ComfyCompiledPrompt;
  /** Full resolved values, including defaults. */
  values: Values;
}
export interface ComfyWorkflowInput {
  payload: unknown;
  format: "api" | "ui";
  sourceKind: ComfyWorkflowSummary["sourceKind"];
  templateName?: string | null;
}
export interface ComfyLocalServiceOptions {
  userData: string;
  defaultOutputDirectory: () => string;
  platform?: NodeJS.Platform;
  launchAcceptance?: ComfyPlatformInfo["launchAcceptance"];
  /** Main-process dialogs only: no renderer-supplied paths. */
  chooseDirectory: (kind: "install" | "output") => Promise<string | null>;
  choosePython: () => Promise<string | null>;
  chooseWorkflowFile: () => Promise<string | null>;
  revealResult: (file: string) => Promise<void> | void;
  openDirectory: (directory: string) => Promise<void>;
  /** These mandatory trusted compilers are provided by the shared pure logic. */
  parseWorkflow: (text: string, image?: Buffer) => Promise<ComfyWorkflowInput> | ComfyWorkflowInput;
  analyze: (record: StoredComfyWorkflow, catalog: unknown, revision: string, values: Values) => Promise<TrustedComfyAnalysis> | TrustedComfyAnalysis;
  buildArgs: (config: ComfyLocalConfig) => string[];
  presets?: () => Array<{ name: string; text: string; provenance?: Record<string, unknown> }>;
  supervisor?: Partial<SupervisorOptions>;
  onDiagnostic?: (error: unknown) => void;
}

function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function fail(message: string): never { throw new Error(message); }
const terminal = (run: ComfyRunSnapshot | null) => !run || ["completed", "failed", "cancelled"].includes(run.phase);
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function assertId(value: string): void { if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) fail("COMFY_INVALID_ID"); }
function workflowName(value: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > COMFY_LIMITS.workflowNameChars || /[\0\r\n]/.test(value)) fail("COMFY_INVALID_WORKFLOW_NAME");
  return value.trim();
}
function checkedValues(value: unknown): Values {
  if (!plain(value) || Object.keys(value).length > COMFY_LIMITS.slotCount) fail("COMFY_INVALID_SLOT_VALUES");
  const result: Values = {};
  for (const [key, item] of Object.entries(value)) {
    if (!key || key.length > 256 || ["__proto__", "constructor", "prototype"].includes(key)) fail("COMFY_INVALID_SLOT_KEY");
    if ((typeof item === "string" && item.length <= COMFY_LIMITS.slotTextChars)
      || (typeof item === "number" && Number.isFinite(item)) || typeof item === "boolean") result[key] = item;
    else fail("COMFY_INVALID_SLOT_VALUE");
  }
  return result;
}
function defaultConfig(): ComfyLocalConfig {
  return { schema: 1, install: null, launch: { port: COMFY_DEFAULT_PORT, readyTimeoutSec: 300,
    disableApiNodes: true, safeMode: true, extraArgs: [] },
  connection: { host: "127.0.0.1", port: COMFY_DEFAULT_PORT }, outputDirectory: null };
}
function randomSeed(minimum: number | undefined, maximum: number | undefined): number {
  const min = Math.max(0, Math.ceil(minimum ?? 0)), max = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(maximum ?? Number.MAX_SAFE_INTEGER));
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) fail("COMFY_INVALID_SEED_RANGE");
  const span = BigInt(max) - BigInt(min) + 1n;
  if (span < (1n << 48n)) return min + randomInt(0, Number(span));
  // randomInt itself only accepts ranges <2^48. Rejection sampling preserves
  // the live schema's complete safe-integer range without uint64 rounding.
  const capacity = 1n << 53n, limit = capacity - capacity % span;
  let value: bigint;
  do { value = BigInt(randomInt(0, 1 << 21)) * (1n << 32n) + BigInt(randomInt(0, 0x1_0000_0000)); } while (value >= limit);
  return min + Number(value % span);
}
function normalizeConfig(raw: unknown): ComfyLocalConfig {
  const fallback = defaultConfig();
  if (!plain(raw) || raw.schema !== 1) return fallback;
  const result = { ...fallback, ...raw } as unknown as ComfyLocalConfig;
  if (!plain(result.launch)) result.launch = fallback.launch;
  else result.launch = { ...fallback.launch, ...result.launch };
  if (!Number.isInteger(result.launch.port) || result.launch.port < 1024 || result.launch.port > 65535
    || !Number.isInteger(result.launch.readyTimeoutSec) || result.launch.readyTimeoutSec < COMFY_LIMITS.readyTimeoutSecMin
    || result.launch.readyTimeoutSec > COMFY_LIMITS.readyTimeoutSecMax || typeof result.launch.safeMode !== "boolean"
    || typeof result.launch.disableApiNodes !== "boolean" || !Array.isArray(result.launch.extraArgs)
    || result.launch.extraArgs.some(x => typeof x !== "string")) result.launch = fallback.launch;
  try { const target = resolveLoopbackTarget(result.connection); result.connection = { host: target.host, port: target.port }; }
  catch { result.connection = fallback.connection; }
  if (result.outputDirectory !== null && (typeof result.outputDirectory !== "string" || !path.isAbsolute(result.outputDirectory))) result.outputDirectory = null;
  if (result.install !== null && (!plain(result.install) || typeof result.install.root !== "string"
    || typeof result.install.python !== "string" || !Array.isArray(result.install.supportedFlags))) result.install = null;
  return result;
}

/** Orchestrates the three layers without importing the NovelAI account store. */
export class ComfyLocalService {
  private config = defaultConfig();
  private initialization: Promise<void> | null = null;
  private readonly events = new EventEmitter();
  private readonly supervisorOptions: SupervisorOptions;
  readonly supervisor: ComfySupervisor;
  readonly jobs: ComfyJobRunner;
  private catalog: unknown = null;
  private inventory: ComfyInventorySummary | null = null;
  private analysis = new Map<string, TrustedComfyAnalysis>();
  private latestRun: ComfyRunSnapshot | null = null;
  private resultRefresh = Promise.resolve();
  private helpAbort: AbortController | null = null;
  private helpPending: ReturnType<typeof probeComfyHelp> | null = null;
  private admissionClosed = false;
  private lifecycleEpoch = 0;
  private pendingAdmissions = 0;
  private shutdownPending: Promise<void> | null = null;
  constructor(private readonly options: ComfyLocalServiceOptions) {
    if (!path.isAbsolute(options.userData)) fail("COMFY_USER_DATA_PATH");
    this.supervisorOptions = { ...options.supervisor, target: this.config.connection,
      readyTimeoutMs: options.supervisor?.readyTimeoutMs ?? this.config.launch.readyTimeoutSec * 1000,
      launch: async () => {
        if (!this.config.install) fail("COMFY_NOT_CONFIGURED");
        const inspection = await this.probeHelp(detectInstallLayout(this.config.install.root, this.config.install.python));
        this.config.install = inspection;
        await writeComfySettings(this.options.userData, this.config);
        return buildLaunchSpec(inspection, { port: this.config.launch.port, args: this.options.buildArgs(this.config), readyTimeoutSec: this.config.launch.readyTimeoutSec });
      },
      beforeStop: async () => { await this.cancelActive(); await options.supervisor?.beforeStop?.(); },
      ownedChanged: async marker => {
        if (marker) await writeOwnedMarker(this.options.userData, { ...marker, startedAt: new Date().toISOString() });
        else await clearOwnedMarker(this.options.userData);
        await options.supervisor?.ownedChanged?.(marker);
      },
    };
    this.supervisor = new ComfySupervisor(this.supervisorOptions);
    this.jobs = new ComfyJobRunner({ userData: options.userData,
      outputDirectory: () => this.outputRoot(),
      getTarget: () => this.target(),
      loadWorkflow: id => readWorkflowRecord<StoredComfyWorkflow>(options.userData, id),
      compileWorkflow: async (record, request) => this.compile(record as StoredComfyWorkflow, request),
    });
    this.supervisor.on(snapshot => this.emit({ type: "snapshot", snapshot: { ...snapshot, activeRun: this.latestRun } }));
    this.jobs.on(run => {
      this.latestRun = run;
      this.supervisor.setContext({ activeRun: run });
      this.emit({ type: "run", run });
      if (run.previewDataUrl) this.emit({ type: "preview", runId: run.runId, dataUrl: run.previewDataUrl });
      if (terminal(run)) this.resultRefresh = this.resultRefresh.then(async () => {
        this.emit({ type: "results", results: await this.listResults() });
      }).catch(error => this.options.onDiagnostic?.(error));
    });
  }
  onEvent(callback: (event: ComfyEvent) => void): () => void {
    this.events.on("event", callback); return () => this.events.removeListener("event", callback);
  }
  private emit(event: ComfyEvent): void {
    // A renderer closing during a push must not change process/job ownership.
    for (const callback of this.events.listeners("event")) {
      try { callback(structuredClone(event)); } catch (error) { this.options.onDiagnostic?.(error); }
    }
  }
  private async probeHelp(inspection: ComfyInstallInspection): Promise<Awaited<ReturnType<typeof probeComfyHelp>>> {
    if (this.admissionClosed) fail("COMFY_SHUTTING_DOWN");
    if (this.helpPending) fail("COMFY_HELP_BUSY");
    const abort = new AbortController(); this.helpAbort = abort;
    const pending = probeComfyHelp(inspection, { signal: abort.signal }); this.helpPending = pending;
    try { return await pending; }
    finally { if (this.helpPending === pending) { this.helpPending = null; this.helpAbort = null; } }
  }
  private outputRoot(): string { return this.config.outputDirectory || this.options.defaultOutputDirectory(); }
  private target(): ComfyTarget | null {
    const snapshot = this.supervisor.snapshot();
    return snapshot.phase === "ready" ? resolveLoopbackTarget(snapshot.target) : null;
  }
  private async initialize(): Promise<void> {
    this.initialization ??= (async () => {
      this.config = normalizeConfig(await readComfySettings(this.options.userData, defaultConfig()));
      this.supervisorOptions.readyTimeoutMs = this.options.supervisor?.readyTimeoutMs ?? this.config.launch.readyTimeoutSec * 1000;
      this.supervisorOptions.target = this.config.connection;
      const prior = await readOwnedMarker<{ pid: number; port?: number; startedAt?: string }>(this.options.userData);
      if (prior && typeof prior.port === "number" && typeof prior.startedAt === "string") {
        this.supervisor.setContext({ previousSession: { pid: prior.pid, port: prior.port, startedAt: prior.startedAt } });
      }
      // Passive detection never attaches to or terminates the discovered process.
      const detected = await probeComfy(this.config.connection, { timeoutMs: 300 });
      if (detected.kind === "comfyui" && detected.identity) {
        this.supervisor.setContext({ detectedExternal: { target: { host: detected.target.host, port: detected.target.port }, identity: detected.identity } });
      }
      await this.seedPresets();
    })();
    return this.initialization;
  }
  private async seedPresets(): Promise<void> {
    const directory = path.join(this.options.userData, "comfyui-local"), marker = path.join(directory, "builtin-seeded-v1.json");
    try { await fs.access(marker); return; } catch { /* first local-tool visit */ }
    const defaults = this.options.presets?.() || [];
    const existing = await listWorkflowRecords<StoredComfyWorkflow>(this.options.userData);
    for (let index = 0; index < defaults.length; index++) {
      const preset = defaults[index], id = `builtin-local-${index + 1}-v1`;
      if (existing.some(item => item.id === id)) continue;
      await this.importJson(preset.text, preset.name, null, undefined, id, preset.provenance);
    }
    if (defaults.length) { await fs.mkdir(directory, { recursive: true }); await fs.writeFile(marker, JSON.stringify({ schema: 1, count: defaults.length }), { flag: "wx" }); }
  }
  async getState(): Promise<ComfyStateBundle> {
    await this.initialize();
    return { config: structuredClone(this.config), snapshot: this.snapshot(), workflows: await this.listWorkflows(),
      results: await this.listResults(), platform: { os: this.options.platform || process.platform,
        launchSupported: ["win32", "darwin", "linux"].includes(this.options.platform || process.platform),
        launchAcceptance: this.options.launchAcceptance || "unverified" } };
  }
  snapshot(): ComfySnapshot { return { ...this.supervisor.snapshot(), activeRun: this.latestRun }; }
  private editable(): void {
    if (this.helpPending || !terminal(this.jobs.active()) || this.supervisor.ownedPid() !== null
      || ["probing", "starting", "ready", "stopping"].includes(this.supervisor.snapshot().phase)) fail("COMFY_BUSY_CONFIGURATION");
  }
  private async saveConfig(): Promise<ComfyLocalConfig> {
    this.supervisorOptions.readyTimeoutMs = this.options.supervisor?.readyTimeoutMs ?? this.config.launch.readyTimeoutSec * 1000;
    this.supervisorOptions.target = this.config.connection;
    await writeComfySettings(this.options.userData, this.config);
    return structuredClone(this.config);
  }
  private async inspect(root: string, python?: string): Promise<void> {
    const detected = detectInstallLayout(root, python);
    try { this.config.install = await this.probeHelp(detected); }
    catch (error) {
      if (String(error).includes("COMFY_HELP_ABORTED")) throw error;
      this.config.install = { ...detected, helpProbe: "failed", helpProbeMessage: String(error), checkedAt: new Date().toISOString() };
    }
  }
  async chooseInstallDirectory(): Promise<ComfyLocalConfig | null> {
    await this.initialize(); this.editable(); const selected = await this.options.chooseDirectory("install"); if (!selected) return null;
    await this.inspect(selected); return this.saveConfig();
  }
  async choosePython(): Promise<ComfyLocalConfig | null> {
    await this.initialize(); this.editable(); if (!this.config.install) fail("COMFY_NOT_CONFIGURED");
    const selected = await this.options.choosePython(); if (!selected) return null;
    await this.inspect(this.config.install.root, validatePythonPath(selected)); return this.saveConfig();
  }
  async chooseOutputDirectory(): Promise<ComfyLocalConfig | null> {
    await this.initialize(); this.editable(); const selected = await this.options.chooseDirectory("output"); if (!selected) return null;
    const real = await fs.realpath(selected); if (!path.isAbsolute(real) || /^(?:\\\\|\/\/)/.test(real)) fail("COMFY_LOCAL_OUTPUT_ONLY");
    if (!(await fs.stat(real)).isDirectory()) fail("COMFY_INVALID_OUTPUT_DIRECTORY"); this.config.outputDirectory = real; return this.saveConfig();
  }
  async detectInstall(): Promise<ComfyLocalConfig> {
    await this.initialize(); this.editable(); if (!this.config.install) fail("COMFY_NOT_CONFIGURED");
    await this.inspect(this.config.install.root, this.config.install.python || undefined); return this.saveConfig();
  }
  async setLaunchOptions(patch: Partial<ComfyLaunchOptions>): Promise<ComfyLocalConfig> {
    await this.initialize(); this.editable();
    if (!plain(patch) || Object.keys(patch).some(key => !["port", "readyTimeoutSec", "disableApiNodes", "safeMode", "extraArgs"].includes(key))) fail("COMFY_INVALID_LAUNCH_PATCH");
    const next = { ...this.config.launch, ...patch };
    const candidate = { ...this.config, launch: next };
    if (JSON.stringify(normalizeConfig(candidate).launch) !== JSON.stringify(next)) fail("COMFY_INVALID_LAUNCH_OPTIONS");
    // The trusted shared compiler validates the whitelist even before an install exists.
    this.options.buildArgs(candidate);
    this.config.launch = next; this.analysis.clear(); return this.saveConfig();
  }
  async setConnection(value: ComfyConnectionTarget): Promise<ComfyLocalConfig> {
    await this.initialize(); this.editable();
    if (!plain(value) || Object.keys(value).some(key => !["host", "port"].includes(key))) fail("COMFY_INVALID_CONNECTION");
    const target = resolveLoopbackTarget(value); this.config.connection = { host: target.host, port: target.port }; return this.saveConfig();
  }
  async start(): Promise<ComfySnapshot> {
    const epoch = this.enterAdmission();
    try {
      await this.initialize(); this.checkAdmission(epoch); await this.supervisor.start();
      if (!this.admissionClosed && epoch === this.lifecycleEpoch && this.supervisor.snapshot().phase === "ready") await this.refreshInventory();
      return this.snapshot();
    } finally { this.pendingAdmissions--; }
  }
  async connect(): Promise<ComfySnapshot> {
    const epoch = this.enterAdmission();
    try {
      await this.initialize(); this.checkAdmission(epoch); await this.supervisor.connect(this.config.connection);
      if (!this.admissionClosed && epoch === this.lifecycleEpoch && this.supervisor.snapshot().phase === "ready") await this.refreshInventory();
      return this.snapshot();
    } finally { this.pendingAdmissions--; }
  }
  async stop(options: { interruptRunning: boolean }): Promise<ComfySnapshot> {
    await this.initialize();
    if (!plain(options) || Object.keys(options).some(key => key !== "interruptRunning") || typeof options.interruptRunning !== "boolean") fail("COMFY_INVALID_STOP_OPTIONS");
    if (this.supervisor.snapshot().owner === "external") fail("COMFY_EXTERNAL_USE_DISCONNECT");
    if (!terminal(this.jobs.active()) && !options.interruptRunning) fail("COMFY_CONFIRM_RUNNING_STOP");
    await this.supervisor.stop(); this.invalidateInventory(); return this.snapshot();
  }
  async disconnect(): Promise<ComfySnapshot> {
    await this.initialize(); if (this.supervisor.ownedPid() !== null) fail("COMFY_OWNED_USE_STOP");
    if (!terminal(this.jobs.active())) fail("COMFY_CANCEL_JOB_BEFORE_DISCONNECT");
    await this.supervisor.disconnect(); this.invalidateInventory(); return this.snapshot();
  }
  private invalidateInventory(): void { this.catalog = null; this.inventory = null; this.analysis.clear(); this.supervisor.setContext({ inventory: null }); }
  async refreshInventory(): Promise<ComfyInventorySummary> {
    const target = this.target(); if (!target) fail("COMFY_NOT_READY");
    const catalog = await comfyGetJson(target, "/object_info"); if (!plain(catalog) || !Object.keys(catalog).length) fail("COMFY_INVALID_CATALOG");
    const revision = digest(catalog), modelFolders: Record<string, string[]> = {};
    let listed = false;
    try {
      const folders = await comfyGetJson(target, "/models");
      if (Array.isArray(folders)) for (const folder of folders.slice(0, 64)) {
        if (typeof folder !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(folder)) continue;
        try { const files = await comfyGetJson(target, `/models/${encodeURIComponent(folder)}`);
          if (Array.isArray(files)) { modelFolders[folder] = files.filter(x => typeof x === "string").slice(0, 100_000); listed = true; }
        } catch { /* object_info remains authoritative for loader combos */ }
      }
    } catch { /* Older ComfyUI has no /models route. */ }
    if (this.inventory?.catalogRevision !== revision) this.analysis.clear();
    this.catalog = catalog; this.inventory = { fetchedAt: new Date().toISOString(), nodeTypeCount: Object.keys(catalog).length,
      catalogRevision: revision, modelFolders: listed ? modelFolders : null };
    this.supervisor.setContext({ inventory: this.inventory }); return structuredClone(this.inventory);
  }
  async importWorkflowFile(): Promise<ComfyWorkflowSummary | null> {
    await this.initialize(); const selected = await this.options.chooseWorkflowFile(); if (!selected) return null;
    const stat = await fs.stat(selected); if (!stat.isFile() || stat.size > 64 * 1024 * 1024) fail("COMFY_IMPORT_FILE_LIMIT");
    const bytes = await fs.readFile(selected), image = /\.(?:png|webp)$/i.test(selected);
    if (!image && !/\.json$/i.test(selected)) fail("COMFY_IMPORT_FILE_TYPE");
    const text = image ? "" : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return this.importJson(text, path.basename(selected).replace(/\.[^.]+$/, "").slice(0, COMFY_LIMITS.workflowNameChars), path.basename(selected), image ? bytes : undefined);
  }
  async importWorkflowJson(text: string, name = "Imported workflow"): Promise<ComfyWorkflowSummary> {
    await this.initialize(); return this.importJson(text, name, null);
  }
  private async importJson(text: string, name: string, fileName: string | null, image?: Buffer, id: string = randomUUID(), provenance?: Record<string, unknown>): Promise<ComfyWorkflowSummary> {
    if (typeof text !== "string" || text.length > COMFY_LIMITS.workflowJsonChars) fail("COMFY_IMPORT_JSON_LIMIT");
    const input = await this.options.parseWorkflow(text, image);
    const now = new Date().toISOString();
    const record: StoredComfyWorkflow = { id, name: workflowName(name), createdAt: now, updatedAt: now,
      sourceKind: input.sourceKind, sourceFormat: input.format,
      sourceSha256: createHash("sha256").update(image || Buffer.from(text, "utf8")).digest("hex"), fileName,
      templateName: input.templateName || null, familyLabel: null, lastAnalysis: null, savedValues: {}, payload: input.payload,
      ...(provenance ? { provenance } : {}) };
    await saveWorkflowRecord(this.options.userData, record); await this.changedWorkflows(); return this.summary(record);
  }
  private summary(record: StoredComfyWorkflow): ComfyWorkflowSummary {
    const { payload: _payload, provenance: _provenance, ...summary } = record; return structuredClone(summary);
  }
  async listWorkflows(): Promise<ComfyWorkflowSummary[]> {
    return (await listWorkflowRecords<StoredComfyWorkflow>(this.options.userData)).map(record => this.summary(record));
  }
  private async changedWorkflows(): Promise<void> { this.emit({ type: "workflows", workflows: await this.listWorkflows() }); }
  async renameWorkflow(id: string, name: string): Promise<ComfyWorkflowSummary> {
    await this.initialize(); assertId(id); await renameWorkflowRecord(this.options.userData, id, workflowName(name));
    const record = await readWorkflowRecord<StoredComfyWorkflow>(this.options.userData, id); if (!record) fail("COMFY_WORKFLOW_NOT_FOUND");
    await this.changedWorkflows(); return this.summary(record);
  }
  async deleteWorkflow(id: string): Promise<{ deleted: boolean }> {
    await this.initialize(); assertId(id); if (this.jobs.active()?.workflowId === id) fail("COMFY_WORKFLOW_BUSY");
    const deleted = await deleteWorkflowRecord(this.options.userData, id); this.analysis.delete(id); await this.changedWorkflows(); return { deleted };
  }
  async analyzeWorkflow(id: string, values: Values = {}): Promise<ComfyAnalysis> {
    await this.initialize(); assertId(id); const supplied = checkedValues(values);
    if (!this.catalog || !this.inventory) await this.refreshInventory();
    const record = await readWorkflowRecord<StoredComfyWorkflow>(this.options.userData, id); if (!record) fail("COMFY_WORKFLOW_NOT_FOUND");
    const context = await this.options.analyze(record, this.catalog, this.inventory!.catalogRevision, supplied);
    this.analysis.set(id, context);
    record.familyLabel = context.analysis.family?.family || null;
    record.lastAnalysis = { ok: context.analysis.ok, at: new Date().toISOString(), blocking: context.analysis.issues.filter(i => i.severity === "block").length, revision: context.analysis.revision };
    await saveWorkflowRecord(this.options.userData, record); await this.changedWorkflows(); return structuredClone(context.analysis);
  }
  private async compile(record: StoredComfyWorkflow, request: ComfyRunRequest): Promise<ComfyCompiledRun> {
    const previous = this.analysis.get(record.id);
    if (!previous || previous.analysis.revision !== request.analysisRevision) fail("COMFY_STALE_ANALYSIS");
    const oldCatalog = this.inventory?.catalogRevision; await this.refreshInventory();
    if (oldCatalog !== this.inventory?.catalogRevision) fail("COMFY_STALE_CATALOG_REANALYZE");
    const values = checkedValues(request.slotValues);
    const current = await this.options.analyze(record, this.catalog, this.inventory!.catalogRevision, values);
    if (current.analysis.revision !== request.analysisRevision) fail("COMFY_STALE_VALUES_REANALYZE");
    if (!current.analysis.ok || current.analysis.issues.some(i => i.severity === "block") || current.analysis.cloudNodes.length) fail("COMFY_WORKFLOW_BLOCKED");
    if (current.analysis.thirdPartyFingerprint && request.confirmations.thirdPartyFingerprint !== current.analysis.thirdPartyFingerprint) fail("COMFY_THIRD_PARTY_CONFIRMATION_REQUIRED");
    if (current.analysis.unverifiedConversion && !request.confirmations.unverifiedConversion) fail("COMFY_CONVERSION_CONFIRMATION_REQUIRED");
    const seeds: Record<string, number> = {};
    if (request.seedMode === "random") for (const slot of current.analysis.slots.filter(slot => slot.kind === "seed")) {
      if (Object.hasOwn(values, slot.id)) continue;
      values[slot.id] = randomSeed(slot.min, slot.max);
    }
    const resolved = await this.options.analyze(record, this.catalog, this.inventory!.catalogRevision, values);
    if (!resolved.analysis.ok) fail("COMFY_RESOLVED_VALUES_INVALID");
    for (const slot of resolved.analysis.slots.filter(slot => slot.kind === "seed")) {
      const value = resolved.values[slot.id]; if (typeof value === "number") seeds[slot.id] = value;
    }
    record.savedValues = resolved.values; record.updatedAt = new Date().toISOString();
    await saveWorkflowRecord(this.options.userData, record);
    return { prompt: resolved.prompt, slotValues: resolved.values, seeds,
      receipt: { sourceSha256: record.sourceSha256, catalogRevision: this.inventory!.catalogRevision,
        analysisRevision: current.analysis.revision, confirmations: request.confirmations,
        family: resolved.analysis.family, conversion: resolved.analysis.conversion, provenance: record.provenance || null } };
  }
  async run(request: ComfyRunRequest): Promise<ComfyRunSnapshot> {
    const epoch = this.enterAdmission();
    try { await this.initialize(); this.checkAdmission(epoch); return await this.jobs.run(request); }
    finally { this.pendingAdmissions--; }
  }
  async cancel(id: string): Promise<ComfyRunSnapshot> {
    assertId(id); const active = this.jobs.active(); if (!active || active.runId !== id) fail("COMFY_RUN_NOT_FOUND");
    await this.jobs.cancel(id); return this.jobs.active() || this.latestRun || active;
  }
  async listResults(): Promise<ComfyResultItem[]> {
    const results = await listResultRecords<ComfyResultItem>(this.options.userData);
    return results.filter(item => typeof item.filePath === "string" && /\.(?:png|jpe?g|webp)$/i.test(item.filePath))
      .map(item => ({ ...item, fileUrl: toLocalMediaUrl(item.filePath, item.sha256) }));
  }
  private async knownResult(id: string): Promise<ComfyResultItem> {
    assertId(id); const result = (await this.listResults()).find(item => item.id === id); if (!result) fail("COMFY_RESULT_NOT_FOUND");
    if ((await fs.lstat(result.filePath)).isSymbolicLink()) fail("COMFY_RESULT_SYMLINK"); return result;
  }
  async openResult(id: string): Promise<void> { await this.options.revealResult((await this.knownResult(id)).filePath); }
  async openResultsFolder(): Promise<void> {
    await this.initialize(); const directory = path.join(this.outputRoot(), "ComfyUI"); await fs.mkdir(directory, { recursive: true }); await this.options.openDirectory(directory);
  }
  async reuseResult(id: string): Promise<{ workflowId: string; slotValues: Values }> {
    const item = await this.knownResult(id);
    if (!await readWorkflowRecord(this.options.userData, item.workflowId)) fail("COMFY_WORKFLOW_NOT_FOUND");
    return { workflowId: item.workflowId, slotValues: structuredClone(item.slotValues) };
  }
  hasActiveJobs(): boolean { return !terminal(this.jobs.active()); }
  private enterAdmission(): number {
    if (this.admissionClosed) fail("COMFY_SHUTTING_DOWN");
    this.pendingAdmissions++; return this.lifecycleEpoch;
  }
  private checkAdmission(epoch: number): void { if (this.admissionClosed || epoch !== this.lifecycleEpoch) fail("COMFY_SHUTTING_DOWN"); }
  needsQuitCleanup(): boolean { return this.pendingAdmissions > 0 || this.helpPending !== null || this.supervisor.ownedPid() !== null || ["starting", "probing", "stopping"].includes(this.snapshot().phase) || this.hasActiveJobs(); }
  async cancelActive(): Promise<void> {
    const active = this.jobs.active(); if (!active || terminal(active)) return;
    await this.jobs.cancel(active.runId);
    const until = Date.now() + 5000;
    while (this.hasActiveJobs() && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 50));
    if (this.hasActiveJobs() && this.supervisor.snapshot().owner === "external") fail("COMFY_EXTERNAL_RUN_CANCELLATION_UNCONFIRMED");
  }
  async shutdown(): Promise<void> {
    this.admissionClosed = true; this.lifecycleEpoch++;
    if (this.shutdownPending) return this.shutdownPending;
    const pending = (async () => {
      const help = this.helpPending; this.helpAbort?.abort();
      if (help) await help.catch(() => undefined);
      await this.cancelActive();
      if (this.supervisor.ownedPid() !== null || ["starting", "probing", "stopping"].includes(this.snapshot().phase)) await this.supervisor.stop();
      else await this.supervisor.disconnect();
    })();
    this.shutdownPending = pending;
    try { await pending; } finally { if (this.shutdownPending === pending) this.shutdownPending = null; }
  }
  resumeAfterUpdateFailure(): void {
    if (this.shutdownPending || this.helpPending || this.supervisor.ownedPid() !== null || this.hasActiveJobs()) return;
    this.admissionClosed = false;
  }
  shutdownSync(): void { this.admissionClosed = true; this.lifecycleEpoch++; this.helpAbort?.abort(); this.supervisor.killOwnedSync(); }
}
