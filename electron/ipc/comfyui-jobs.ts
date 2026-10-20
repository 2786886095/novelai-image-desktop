import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  comfyGetBytes, comfyGetJson, comfyPostJson, openComfySocket, parseBinaryFrame,
  resolveLoopbackTarget, safeJson, viewQuery,
} from "./comfyui-http";
import type { ComfyTarget, ComfyHttpOptions } from "./comfyui-http";
import { appendResultRecords, writeRunReceipt } from "./comfyui-config";
import type { ComfyWorkflowRecord } from "./comfyui-config";
import { writeUniqueImageFile } from "./image-output";
import { toLocalMediaUrl } from "./local-media-protocol";
import { COMFY_LIMITS } from "../../src/comfyui/contract";
import type { ComfyRunRequest, ComfyRunSnapshot, ComfyResultItem, ComfySlotValue, ComfyNodeError, ComfyRunPhase } from "../../src/comfyui/contract";

type JsonObject = Record<string, unknown>;
export type ComfyCompiledPrompt = Record<string, { class_type: string; inputs: JsonObject; _meta?: unknown }>;
export type ComfyJobRequest = ComfyRunRequest;
export interface ComfyRemoteImage { nodeId: string; filename: string; subfolder: string; type: "output" | "temp" }
export interface ComfySavedImage extends ComfyResultItem { remote: ComfyRemoteImage }
export type ComfyJobPhase = ComfyRunPhase;
export type ComfyJobError = NonNullable<ComfyRunSnapshot["error"]> & { detail?: unknown };
export interface ComfyJobSnapshot extends Omit<ComfyRunSnapshot, "error" | "results"> {
  results: ComfySavedImage[];
  error: ComfyJobError | null;
  previewDataUrl?: string;
  warnings: string[];
}
export interface ComfyJobSocket extends EventTarget { close(): void; readyState: number }
export interface ComfyJobTransport {
  getJson(target: ComfyTarget, route: string, options?: ComfyHttpOptions): Promise<unknown>;
  postJson(target: ComfyTarget, route: string, body: unknown, options?: ComfyHttpOptions): Promise<unknown>;
  getBytes(target: ComfyTarget, route: string, options?: ComfyHttpOptions): Promise<Buffer>;
  openSocket(target: ComfyTarget, clientId: string, options?: ComfyHttpOptions): Promise<ComfyJobSocket>;
}
export interface ComfyCompiledRun {
  prompt: ComfyCompiledPrompt;
  /** Full resolved slot values, including generated seeds, for faithful result reuse. */
  slotValues: Record<string, ComfySlotValue>;
  seeds?: Record<string, number>;
  /** Include approval fingerprints, resolved slots and source hashes in the durable receipt. */
  receipt?: JsonObject;
}
export interface ComfyJobRunnerOptions {
  userData: string;
  outputDirectory: string | (() => string);
  getTarget: () => ComfyTarget | null;
  loadWorkflow: (id: string) => Promise<ComfyWorkflowRecord | null>;
  /** Trusted main-process compiler: re-fetch catalog, validate slots and enforce approvals here. */
  compileWorkflow: (record: ComfyWorkflowRecord, request: ComfyRunRequest) => Promise<ComfyCompiledRun>;
  transport?: Partial<ComfyJobTransport>;
  mediaUrl?: (filePath: string, revision: string) => string;
  pollIntervalMs?: number;
  maxDurationMs?: number;
  maxPollErrors?: number;
  now?: () => number;
}

const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const MAX_OUTPUTS = 256;
const MAX_RUN_IMAGE_BYTES = 512 * 1024 * 1024;
const PROMPT_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const terminal = new Set<ComfyJobPhase>(["completed", "failed", "cancelled"]);
function object(value: unknown): value is JsonObject { return value !== null && typeof value === "object" && !Array.isArray(value); }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function assertRequest(request: ComfyJobRequest): void {
  if (!object(request) || Object.keys(request).some((key) => !["workflowId", "analysisRevision", "slotValues", "seedMode", "confirmations"].includes(key))) throw new Error("COMFY_RUN_ID_AND_SLOTS_ONLY");
  if (typeof request.workflowId !== "string" || !PROMPT_ID.test(request.workflowId) || !object(request.slotValues)
    || typeof request.analysisRevision !== "string" || !request.analysisRevision || request.analysisRevision.length > 1024
    || !["fixed", "random"].includes(request.seedMode) || !object(request.confirmations)
    || Object.keys(request.confirmations).some((key) => !["thirdPartyFingerprint", "unverifiedConversion"].includes(key))
    || !(request.confirmations.thirdPartyFingerprint === null || typeof request.confirmations.thirdPartyFingerprint === "string")
    || (typeof request.confirmations.thirdPartyFingerprint === "string" && request.confirmations.thirdPartyFingerprint.length > 1024)
    || typeof request.confirmations.unverifiedConversion !== "boolean") throw new Error("COMFY_RUN_REQUEST");
  const entries = Object.entries(request.slotValues);
  if (entries.length > COMFY_LIMITS.slotCount) throw new Error("COMFY_SLOT_COUNT");
  for (const [key, value] of entries) {
    if (!key || key.length > 256 || ["__proto__", "constructor", "prototype"].includes(key)) throw new Error("COMFY_SLOT_KEY");
    if (typeof value === "string" && value.length <= COMFY_LIMITS.slotTextChars) continue;
    if (typeof value === "number" && Number.isFinite(value)) continue;
    if (typeof value === "boolean") continue;
    throw new Error("COMFY_SLOT_VALUE");
  }
}

function assertCompiledPrompt(prompt: ComfyCompiledPrompt): void {
  // Detailed schema/capability checks belong to the mandatory trusted compiler.
  // This last boundary prevents accidentally returning a UI graph or executable value.
  if (!object(prompt) || !Object.keys(prompt).length || Object.keys(prompt).length > 5000) throw new Error("COMFY_COMPILED_PROMPT");
  const bytes = JSON.stringify(prompt);
  if (Buffer.byteLength(bytes) > 16 * 1024 * 1024) throw new Error("COMFY_PROMPT_BYTES");
  safeJson(bytes);
  for (const node of Object.values(prompt)) {
    if (!object(node) || typeof node.class_type !== "string" || !object(node.inputs)) throw new Error("COMFY_COMPILED_PROMPT");
  }
}

function safeRemotePart(value: unknown, filename: boolean): string {
  if (typeof value !== "string" || value.length > 4096 || /[\0\r\n\\:]/.test(value) || (filename && !value)) throw new Error("COMFY_OUTPUT_PATH");
  let decoded = value;
  for (let i = 0; i < 2; i++) { try { const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next; } catch { throw new Error("COMFY_OUTPUT_PATH"); } }
  if (/[\0\r\n\\:]/.test(decoded) || decoded.startsWith("/") || (filename && decoded.includes("/"))
    || decoded.split("/").some((part) => part === "." || part === "..")) throw new Error("COMFY_OUTPUT_PATH");
  return value;
}

export function collectHistoryOutputs(history: unknown, promptId?: string): { images: ComfyRemoteImage[]; errors: string[]; nonImageOutputs: number } {
  const entry = promptId && object(history) ? history[promptId] : history;
  const images: ComfyRemoteImage[] = [], errors: string[] = [], seen = new Set<string>();
  let nonImageOutputs = 0;
  if (!object(entry) || !object(entry.outputs)) return { images, errors, nonImageOutputs };
  for (const [nodeId, output] of Object.entries(entry.outputs)) {
    if (!object(output)) continue;
    // Count only explicitly returned non-still-image output groups. No download or
    // claim of support for arbitrary audio/video/text custom-node outputs.
    for (const key of ["audio", "videos", "video", "gifs", "text"]) {
      const value = output[key];
      if (Array.isArray(value)) nonImageOutputs += value.length;
      else if (value !== undefined && value !== null) nonImageOutputs++;
    }
    if (!Array.isArray(output.images)) continue;
    for (const image of output.images) {
      try {
        if (!object(image) || !["output", "temp"].includes(String(image.type ?? "output"))) throw new Error("COMFY_OUTPUT_TYPE");
        const descriptor: ComfyRemoteImage = { nodeId, filename: safeRemotePart(image.filename, true), subfolder: safeRemotePart(image.subfolder ?? "", false), type: (image.type ?? "output") as "output" | "temp" };
        const key = JSON.stringify(descriptor); if (seen.has(key)) continue; seen.add(key);
        if (images.length >= MAX_OUTPUTS) throw new Error("COMFY_OUTPUT_COUNT");
        images.push(descriptor);
      } catch (error) { if (errors.length < MAX_OUTPUTS) errors.push(`${nodeId}: ${message(error)}`); }
    }
  }
  return { images, errors, nonImageOutputs };
}

export interface ComfyImageType { extension: "png" | "jpg" | "webp"; mime: ComfyResultItem["mime"]; width: number; height: number }
function imageType(extension: ComfyImageType["extension"], mime: ComfyResultItem["mime"], width: number, height: number): ComfyImageType | null {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= 32768 && height <= 32768 && width * height <= 128 * 1024 * 1024 ? { extension, mime, width, height } : null;
}

/** Raster signatures and structural headers only; HTML/SVG/file extensions are never trusted. */
export function sniffImageType(bytes: Buffer): ComfyImageType | null {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.length > MAX_IMAGE_BYTES) return null;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    if (bytes.length < 45 || bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR") return null;
    let offset = 8, hasData = false, hasEnd = false, chunks = 0;
    while (offset + 12 <= bytes.length && chunks++ < 10000) {
      const length = bytes.readUInt32BE(offset), end = offset + 12 + length;
      if (end > bytes.length) return null;
      const name = bytes.toString("ascii", offset + 4, offset + 8);
      if (name === "IDAT") hasData = true;
      if (name === "IEND") { hasEnd = length === 0 && end === bytes.length; break; }
      offset = end;
    }
    return hasData && hasEnd ? imageType("png", "image/png", bytes.readUInt32BE(16), bytes.readUInt32BE(20)) : null;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++]; if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = bytes.readUInt16BE(offset); if (length < 2 || offset + length > bytes.length) return null;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) return imageType("jpg", "image/jpeg", bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
      offset += length;
    }
  }
  if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" && bytes.readUInt32LE(4) + 8 === bytes.length) {
    const format = bytes.toString("ascii", 12, 16);
    if (format === "VP8X") return imageType("webp", "image/webp", bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1);
    if (format === "VP8 " && bytes.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) return imageType("webp", "image/webp", bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff);
    if (format === "VP8L" && bytes[20] === 0x2f) return imageType("webp", "image/webp", 1 + bytes[21] + ((bytes[22] & 0x3f) << 8), 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0xf) << 10));
  }
  return null;
}

export function mapPromptError(error: unknown): ComfyJobError {
  const value = object(error) && object(error.responseJson) ? error.responseJson : error;
  if (object(value) && (value.error !== undefined || value.node_errors !== undefined)) {
    const detail = value.error;
    const nodeErrors: ComfyNodeError[] = [];
    if (object(value.node_errors)) for (const [nodeId, node] of Object.entries(value.node_errors)) {
      if (!object(node)) continue;
      for (const item of Array.isArray(node.errors) ? node.errors.slice(0, 32) : [node]) {
        nodeErrors.push({ nodeId, classType: typeof node.class_type === "string" ? node.class_type : null, message: object(item) && typeof item.message === "string" ? item.message.slice(0, 4096) : String(item).slice(0, 4096), details: object(item) && typeof item.details === "string" ? item.details.slice(0, 4096) : null });
      }
    }
    return { code: "prompt-rejected", message: object(detail) && typeof detail.message === "string" ? detail.message.slice(0, 4096) : "ComfyUI rejected the workflow", nodeErrors, detail: { error: detail ?? null, node_errors: value.node_errors ?? null } };
  }
  return { code: "job-failed", message: message(error).slice(0, 4096), nodeErrors: [] };
}

async function outputDirectory(base: string, date: string): Promise<string> {
  if (!path.isAbsolute(base) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("COMFY_OUTPUT_DIRECTORY");
  await fs.mkdir(base, { recursive: true });
  const realBase = await fs.realpath(base);
  let current = realBase;
  for (const segment of ["ComfyUI", date]) {
    current = path.join(current, segment);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error("COMFY_OUTPUT_SYMLINK"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await fs.mkdir(current, { recursive: true });
    const real = await fs.realpath(current);
    if (!real.startsWith(realBase + path.sep)) throw new Error("COMFY_OUTPUT_ESCAPE");
  }
  return current;
}

export async function saveComfyOutputs(options: {
  target: ComfyTarget; images: ComfyRemoteImage[]; outputDirectory: string;
  runId: string; workflowId: string; promptId: string; createdAt: string;
  slotValues: Record<string, ComfySlotValue>;
  getBytes?: ComfyJobTransport["getBytes"]; mediaUrl?: (filePath: string, revision: string) => string;
}): Promise<{ results: ComfySavedImage[]; errors: string[] }> {
  if (!PROMPT_ID.test(options.runId) || !PROMPT_ID.test(options.promptId) || options.images.length > MAX_OUTPUTS) throw new Error("COMFY_OUTPUT_REQUEST");
  const dir = await outputDirectory(options.outputDirectory, options.createdAt.slice(0, 10));
  const results: ComfySavedImage[] = [], errors: string[] = [];
  let totalBytes = 0;
  for (const [index, remote] of options.images.entries()) {
    try {
      safeRemotePart(remote.filename, true); safeRemotePart(remote.subfolder, false);
      if (!["output", "temp"].includes(remote.type)) throw new Error("COMFY_OUTPUT_TYPE");
      const bytes = await (options.getBytes ?? comfyGetBytes)(options.target, viewQuery(remote), { maxBytes: MAX_IMAGE_BYTES, timeoutMs: 60_000 });
      const kind = sniffImageType(bytes); if (!kind) throw new Error("COMFY_OUTPUT_INVALID_RASTER");
      if (totalBytes + bytes.length > MAX_RUN_IMAGE_BYTES) throw new Error("COMFY_OUTPUT_TOTAL_BYTES");
      totalBytes += bytes.length;
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const filePath = await writeUniqueImageFile(dir, `${options.runId}-${index}`, kind.extension, bytes);
      const id = randomUUID();
      results.push({ id, runId: options.runId, workflowId: options.workflowId, promptId: options.promptId, sourceNodeId: remote.nodeId, filePath, fileUrl: (options.mediaUrl ?? toLocalMediaUrl)(filePath, id), sha256, bytes: bytes.length, mime: kind.mime, width: kind.width, height: kind.height, createdAt: options.createdAt, slotValues: structuredClone(options.slotValues), remote });
    } catch (error) { errors.push(`${remote.nodeId}/${remote.filename}: ${message(error)}`); }
  }
  return { results, errors };
}

interface RunContext {
  state: ComfyJobSnapshot; target: ComfyTarget; clientId: string; receipt: JsonObject;
  slotValues: Record<string, ComfySlotValue>; prompt?: ComfyCompiledPrompt; executed: Set<string>;
  socket?: ComfyJobSocket; cancelRequested: boolean; cancelPromise?: Promise<boolean>;
  accepted: boolean; cancelConfirmed: boolean; interruptRequested: boolean;
}

function queueItems(value: unknown, field: string): unknown[][] {
  if (!object(value) || !Array.isArray(value[field])) throw new Error("COMFY_QUEUE_SCHEMA");
  return (value[field] as unknown[]).filter(Array.isArray);
}
function ownedItem(item: unknown[], context: RunContext): boolean {
  return item[1] === context.state.promptId && object(item[3]) && item[3].client_id === context.clientId;
}
function historyEntry(value: unknown, promptId: string): JsonObject | null { return object(value) && object(value[promptId]) ? value[promptId] as JsonObject : null; }
function historyStatus(entry: JsonObject): "success" | "failed" | "cancelled" | null {
  const status = object(entry.status) ? entry.status : {};
  const events = Array.isArray(status.messages) ? status.messages : [];
  if (events.some((event) => Array.isArray(event) && event[0] === "execution_interrupted")) return "cancelled";
  if (status.status_str === "error" || events.some((event) => Array.isArray(event) && event[0] === "execution_error")) return "failed";
  return status.completed === true && status.status_str === "success" ? "success" : null;
}

function executionNodeErrors(entry: JsonObject, prompt?: ComfyCompiledPrompt): ComfyNodeError[] {
  const status = object(entry.status) ? entry.status : {};
  const errors: ComfyNodeError[] = [];
  for (const event of Array.isArray(status.messages) ? status.messages : []) {
    if (!Array.isArray(event) || event[0] !== "execution_error" || !object(event[1])) continue;
    const detail = event[1], nodeId = String(detail.node_id ?? "unknown").slice(0, 256);
    errors.push({ nodeId, classType: typeof detail.node_type === "string" ? detail.node_type.slice(0, 1024) : prompt?.[nodeId]?.class_type ?? null,
      message: typeof detail.exception_message === "string" ? detail.exception_message.slice(0, 4096) : "ComfyUI execution error",
      details: typeof detail.exception_type === "string" ? detail.exception_type.slice(0, 4096) : null });
    if (errors.length >= 32) break;
  }
  return errors;
}

/** One private job lane, never registered with the NovelAI cancel-all registry. */
export class ComfyJobRunner {
  private current: RunContext | null = null;
  private readonly listeners = new Set<(state: ComfyJobSnapshot) => void>();
  private readonly transport: ComfyJobTransport;
  private readonly now: () => number;
  constructor(private readonly options: ComfyJobRunnerOptions) {
    this.transport = { getJson: comfyGetJson, postJson: comfyPostJson, getBytes: comfyGetBytes, openSocket: openComfySocket, ...options.transport };
    this.now = options.now ?? Date.now;
  }
  active(): ComfyJobSnapshot | null { return this.current ? structuredClone(this.current.state) : null; }
  on(listener: (state: ComfyJobSnapshot) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(context: RunContext): void {
    for (const listener of this.listeners) { try { listener(structuredClone(context.state)); } catch { /* a renderer listener cannot stop monitoring */ } }
  }
  private update(context: RunContext, patch: Partial<ComfyJobSnapshot>): void { Object.assign(context.state, patch); this.emit(context); }
  private async receipt(context: RunContext): Promise<void> {
    const value = { ...context.receipt, snapshot: context.state, target: { host: context.target.host, port: context.target.port }, clientId: context.clientId };
    await writeRunReceipt(this.options.userData, context.state.runId, value);
  }
  private async finish(context: RunContext, phase: "completed" | "failed" | "cancelled", error?: ComfyJobError): Promise<ComfyJobSnapshot> {
    this.update(context, { phase, progress: null, finishedAt: new Date(this.now()).toISOString(), ...(error ? { error } : {}) });
    try { await this.receipt(context); } catch (failure) {
      context.state.warnings.push(`Receipt save failed: ${message(failure)}`);
      if (phase === "completed") { context.state.phase = "failed"; context.state.error = { code: "receipt-save-failed", message: "Images were preserved but the complete run receipt could not be saved", nodeErrors: [] }; }
      this.emit(context);
    }
    return structuredClone(context.state);
  }
  private socketMessage(context: RunContext, event: Event): void {
    if (terminal.has(context.state.phase)) return;
    const data = (event as MessageEvent<unknown>).data;
    if (typeof data !== "string") {
      if (!(data instanceof ArrayBuffer) && !Buffer.isBuffer(data) && !(data instanceof Uint8Array)) return;
      const frame = parseBinaryFrame(data); if (!frame || frame.promptId !== context.state.promptId || !sniffImageType(frame.bytes)) return;
      this.update(context, { previewDataUrl: `data:${frame.mime};base64,${frame.bytes.toString("base64")}` }); return;
    }
    if (Buffer.byteLength(data) > 4 * 1024 * 1024) return;
    let eventData: unknown; try { eventData = safeJson(data); } catch { return; }
    if (!context.state.promptId || !object(eventData) || !object(eventData.data) || eventData.data.prompt_id !== context.state.promptId || terminal.has(context.state.phase)) return;
    const detail = eventData.data;
    if (eventData.type === "execution_start") this.update(context, { phase: "running", currentNode: null, progress: null });
    if (eventData.type === "executing" && (detail.node === null || typeof detail.node === "string" && detail.node.length > 0)) {
      const id = detail.node as string | null;
      const changed = id === null || context.state.currentNode?.id !== id;
      this.update(context, { ...(id !== null ? { phase: "running" as const } : {}), currentNode: id ? { id, classType: context.prompt?.[id]?.class_type ?? null } : null, ...(changed ? { progress: null } : {}) });
    }
    if (eventData.type === "progress" && typeof detail.value === "number" && typeof detail.max === "number" && Number.isFinite(detail.value) && Number.isFinite(detail.max) && detail.value >= 0 && detail.max > 0 && detail.value <= detail.max) {
      const named = detail.node !== undefined && detail.node !== null;
      if (!named || typeof detail.node === "string" && context.state.currentNode?.id === detail.node && context.prompt && Object.hasOwn(context.prompt, detail.node)) this.update(context, { phase: "running", progress: { value: detail.value, max: detail.max } });
    }
    const executed = eventData.type === "executed" ? [detail.node] : eventData.type === "execution_cached" && Array.isArray(detail.nodes) ? detail.nodes : [];
    if (eventData.type === "progress_state" && object(detail.nodes)) {
      const states=Object.entries(detail.nodes);
      if(states.length<=COMFY_LIMITS.workflowNodes)for(const [id,node] of states){
        if(!object(node)||node.state!=="finished"||(node.prompt_id!==undefined&&node.prompt_id!==context.state.promptId)||(node.node_id!==undefined&&node.node_id!==id))continue;
        executed.push(id);
      }
    }
    const previousCount=context.executed.size;
    for (const id of executed) if (typeof id === "string" && context.prompt && Object.hasOwn(context.prompt,id)) context.executed.add(id);
    if (context.executed.size!==previousCount) this.update(context, { nodesExecuted: context.executed.size });
    // WS completion/error is advisory. Only this prompt's history makes a terminal state.
    if (["execution_error", "execution_interrupted"].includes(String(eventData.type))) context.receipt.lastSocketError = detail;
  }
  async run(request: ComfyJobRequest): Promise<ComfyJobSnapshot> {
    assertRequest(request);
    if (this.current) throw new Error("COMFY_JOB_BUSY");
    const candidate = this.options.getTarget(); if (!candidate) throw new Error("COMFY_NOT_CONNECTED");
    const target = resolveLoopbackTarget(candidate), startedAt = new Date(this.now()).toISOString();
    const context: RunContext = { state: { runId: randomUUID(), workflowId: request.workflowId, phase: "validating", startedAt, finishedAt: null, promptId: null, queuePosition: null, currentNode: null, progress: null, nodesExecuted: 0, nodesTotal: 0, seeds: {}, error: null, results: [], nonImageOutputs: 0, warnings: [] }, target, clientId: randomUUID(), receipt: { request: structuredClone(request), postAttempts: 0 }, slotValues: {}, executed: new Set(), cancelRequested: false, accepted: false, cancelConfirmed: false, interruptRequested: false };
    this.current = context; this.emit(context);
    try {
      const workflow = await this.options.loadWorkflow(request.workflowId); if (!workflow) throw new Error("COMFY_WORKFLOW_NOT_FOUND");
      const compiled = await this.options.compileWorkflow(structuredClone(workflow), structuredClone(request));
      assertCompiledPrompt(compiled.prompt);
      context.prompt = structuredClone(compiled.prompt);
      context.slotValues = structuredClone(compiled.slotValues);
      if (!object(context.slotValues)) throw new Error("COMFY_RESOLVED_SLOT_VALUES");
      assertRequest({ ...request, slotValues: context.slotValues });
      this.update(context, { nodesTotal: Object.keys(context.prompt).length, seeds: compiled.seeds ?? {} });
      context.receipt.workflow = workflow; context.receipt.compiledPrompt = context.prompt;
      context.receipt.resolvedSlotValues = context.slotValues;
      context.receipt.workflowSha256 = createHash("sha256").update(JSON.stringify(workflow)).digest("hex");
      context.receipt.compiledPromptSha256 = createHash("sha256").update(JSON.stringify(context.prompt)).digest("hex");
      context.receipt.compiler = compiled.receipt ?? {};
      await this.receipt(context);
      if (context.cancelRequested) return await this.finish(context, "cancelled");
      // WS is attempted before admission. Unsupported /ws safely falls back to history polling.
      try {
        context.socket = await this.transport.openSocket(target, context.clientId, { timeoutMs: 3000 });
        context.socket.addEventListener("message", (event) => this.socketMessage(context, event));
        context.socket.addEventListener("close", () => { if (!terminal.has(context.state.phase)) { context.state.warnings.push("WebSocket disconnected; polling the same prompt history"); this.emit(context); } });
      } catch { context.state.warnings.push("WebSocket unavailable; polling history"); }
      if (context.cancelRequested) return await this.finish(context, "cancelled");
      const plannedPromptId = randomUUID(); context.receipt.plannedPromptId = plannedPromptId;
      this.update(context, { phase: "submitting" }); context.receipt.postAttempts = 1;
      await this.receipt(context);
      let posted: unknown;
      try { posted = await this.transport.postJson(target, "/prompt", { prompt: context.prompt, client_id: context.clientId, prompt_id: plannedPromptId, extra_data: { extra_pnginfo: { prompt: context.prompt } } }); }
      catch (error) {
        const mapped = mapPromptError(error);
        const status = object(error) ? error.status : undefined;
        if (typeof status !== "number" || status === 0 || status >= 500) {
          context.receipt.admissionUncertain = true;
          return await this.finish(context, "failed", { code: "submission-uncertain", message: "The submission result is unknown; it was not repeated. Check the local ComfyUI queue.", nodeErrors: [], detail: { plannedPromptId, diagnostic: mapped } });
        }
        return await this.finish(context, "failed", mapped);
      }
      if (object(posted) && posted.error) return await this.finish(context, "failed", mapPromptError(posted));
      if (!object(posted) || typeof posted.prompt_id !== "string" || !PROMPT_ID.test(posted.prompt_id)) return await this.finish(context, "failed", { code: "submission-uncertain", message: "ComfyUI returned an unrecognized admission response; the request was not repeated", nodeErrors: [], detail: posted });
      context.accepted = true; context.receipt.admission = posted;
      this.update(context, { phase: "queued", promptId: posted.prompt_id, queuePosition: typeof posted.number === "number" ? posted.number : null });
      try { await this.receipt(context); } catch (error) { context.state.warnings.push(`Admission receipt save failed: ${message(error)}`); }
      if (context.cancelRequested) await this.cancel(context.state.runId);
      let pollErrors = 0;
      while (this.now() - Date.parse(startedAt) < (this.options.maxDurationMs ?? 24 * 60 * 60 * 1000)) {
        if (context.cancelConfirmed) return await this.finish(context, "cancelled");
        try {
          const raw = await this.transport.getJson(target, `/history/${encodeURIComponent(context.state.promptId!)}`);
          const entry = historyEntry(raw, context.state.promptId!);
          if (entry) {
            const status = historyStatus(entry);
            if (status) {
              context.receipt.history = entry;
              this.update(context, { phase: "saving" });
              const collected = collectHistoryOutputs(entry);
              const saved = await saveComfyOutputs({ target, images: collected.images, outputDirectory: typeof this.options.outputDirectory === "function" ? this.options.outputDirectory() : this.options.outputDirectory, runId: context.state.runId, workflowId: request.workflowId, promptId: context.state.promptId!, createdAt: new Date(this.now()).toISOString(), slotValues: context.slotValues, getBytes: this.transport.getBytes, mediaUrl: this.options.mediaUrl });
              context.state.results = saved.results;
              context.state.nonImageOutputs = collected.nonImageOutputs;
              const outputErrors = [...collected.errors, ...saved.errors];
              if (saved.results.length) { try { await appendResultRecords(this.options.userData, saved.results); } catch (error) { outputErrors.push(`Result index save failed: ${message(error)}`); } }
              const admissionErrors = object(posted.node_errors) && Object.keys(posted.node_errors).length > 0 ? mapPromptError(posted) : null;
              if (admissionErrors) outputErrors.push(admissionErrors.message);
              if (status === "cancelled") return await this.finish(context, "cancelled", outputErrors.length ? { code: "partial-output", message: outputErrors.join("\n"), nodeErrors: admissionErrors?.nodeErrors ?? [] } : undefined);
              if (status === "failed") {
                const nodeErrors = [...executionNodeErrors(entry, context.prompt), ...(admissionErrors?.nodeErrors ?? [])];
                return await this.finish(context, "failed", { code: "execution-failed", message: nodeErrors[0]?.message ?? "ComfyUI reported an execution error; any returned images were preserved.", nodeErrors, detail: { status: entry.status, outputErrors } });
              }
              if (outputErrors.length || !saved.results.length) return await this.finish(context, "failed", { code: saved.results.length ? "partial-output" : "no-image-output", message: outputErrors.join("\n") || "The workflow finished without a saved image output", nodeErrors: admissionErrors?.nodeErrors ?? [] });
              return await this.finish(context, "completed");
            }
          }
          const queue = await this.transport.getJson(target, "/queue");
          const running = queueItems(queue, "queue_running");
          if (!context.interruptRequested && running.some((item) => ownedItem(item, context))) this.update(context, { phase: "running" });
          // An empty queue is deliberately not treated as success (or failure).
          pollErrors = 0;
        } catch (error) {
          if (++pollErrors >= (this.options.maxPollErrors ?? 5)) return await this.finish(context, "failed", { code: "monitoring-lost", message: `Cannot confirm the submitted prompt's outcome; it was not resubmitted: ${message(error)}`, nodeErrors: [] });
        }
        await new Promise((resolve) => setTimeout(resolve, Math.max(10, this.options.pollIntervalMs ?? 1000)));
      }
      return await this.finish(context, "failed", { code: "monitoring-timeout", message: "Monitoring timed out; the submitted prompt was not repeated and may still be running", nodeErrors: [] });
    } catch (error) {
      return await this.finish(context, "failed", mapPromptError(error));
    } finally {
      context.socket?.close();
      if (this.current === context) this.current = null;
    }
  }
  async cancel(runId?: string): Promise<boolean> {
    const context = this.current;
    if (!context || (runId !== undefined && context.state.runId !== runId) || terminal.has(context.state.phase)) return false;
    context.cancelRequested = true;
    if (!context.accepted || !context.state.promptId) return true;
    if (context.cancelPromise) return context.cancelPromise;
    context.cancelPromise = this.cancelOwned(context).finally(() => { context.cancelPromise = undefined; });
    return context.cancelPromise;
  }
  private async cancelOwned(context: RunContext): Promise<boolean> {
    const queue = await this.transport.getJson(context.target, "/queue");
    const running = queueItems(queue, "queue_running"), pending = queueItems(queue, "queue_pending");
    if (pending.some((item) => ownedItem(item, context))) {
      this.update(context, { phase: "cancelling" });
      await this.transport.postJson(context.target, "/queue", { delete: [context.state.promptId] });
      const after = await this.transport.getJson(context.target, "/queue");
      if (!queueItems(after, "queue_pending").some((item) => ownedItem(item, context)) && !queueItems(after, "queue_running").some((item) => ownedItem(item, context))) {
        const history = await this.transport.getJson(context.target, `/history/${context.state.promptId}`);
        if (!historyEntry(history, context.state.promptId!)) { context.cancelConfirmed = true; return true; }
      }
      return false;
    }
    if (running.length === 1 && ownedItem(running[0], context) && !context.interruptRequested) {
      // Never clear a shared queue or interrupt an unowned/currently different prompt.
      this.update(context, { phase: "cancelling" });
      await this.transport.postJson(context.target, "/interrupt", { prompt_id: context.state.promptId });
      context.interruptRequested = true;
      return true; // The UI reaches cancelled only when history confirms interruption.
    }
    return false;
  }
}
