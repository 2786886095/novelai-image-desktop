import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { COMFY_LIMITS } from "../../src/comfyui/contract";
import type { ComfyWorkflowSummary, ComfyResultItem, ComfyRunSnapshot, ComfyRunPhase, ComfyNodeError } from "../../src/comfyui/contract";

/** This store intentionally has no dependency on the NovelAI account store. */
export type ComfyWorkflowRecord = Pick<ComfyWorkflowSummary, "id" | "name" | "createdAt" | "updatedAt">;

export type ComfyStoredResult = Pick<ComfyResultItem, "id" | "runId" | "promptId" | "filePath">;

export interface ComfyOwnedMarker {
  pid: number;
}

type JsonRecord = Record<string, unknown>;
interface Envelope<T> { version: 1; updatedAt: string; data: T }
const queues = new Map<string, Promise<unknown>>();
const MAX_STORE_BYTES = 64 * 1024 * 1024;
const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

export function comfyDataDir(userData: string): string {
  if (!userData || !path.isAbsolute(userData)) throw new Error("ComfyUI userData must be absolute");
  return path.join(path.resolve(userData), "comfyui-local");
}

function object(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertJson(value: unknown, depth = 0, seen = new Set<object>()): void {
  if (depth > COMFY_LIMITS.jsonDepth + 16) throw new Error("ComfyUI stored JSON is too deep");
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object") throw new Error("ComfyUI store only accepts JSON values");
  if (seen.has(value)) throw new Error("ComfyUI store does not accept cyclic values");
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error("ComfyUI store only accepts plain objects");
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (BAD_KEYS.has(key)) throw new Error("Unsafe ComfyUI JSON key");
    assertJson(child, depth + 1, seen);
  }
  seen.delete(value);
}

function assertId(id: string): void {
  if (typeof id !== "string" || !ID.test(id)) throw new Error("Invalid ComfyUI record id");
}

function validWorkflow(value: unknown): value is ComfyWorkflowRecord {
  return object(value) && typeof value.id === "string" && ID.test(value.id)
    && typeof value.name === "string" && value.name.length > 0 && value.name.length <= COMFY_LIMITS.workflowNameChars
    && typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt))
    && typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt));
}

function validResult(value: unknown): value is ComfyStoredResult {
  return object(value) && typeof value.id === "string" && ID.test(value.id)
    && typeof value.runId === "string" && ID.test(value.runId)
    && typeof value.promptId === "string" && value.promptId.length > 0 && value.promptId.length <= 256
    && typeof value.filePath === "string" && path.isAbsolute(value.filePath);
}

async function rejectLink(file: string): Promise<void> {
  try {
    if ((await fs.lstat(file)).isSymbolicLink()) throw new Error("ComfyUI storage refuses symbolic links");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function ensureRoot(userData: string, child?: string): Promise<string> {
  const root = comfyDataDir(userData);
  await fs.mkdir(path.resolve(userData), { recursive: true });
  await rejectLink(root);
  await fs.mkdir(root, { recursive: true });
  if (!child) return root;
  if (!ID.test(child)) throw new Error("Invalid ComfyUI storage directory");
  const target = path.join(root, child);
  await rejectLink(target);
  await fs.mkdir(target, { recursive: true });
  const realRoot = await fs.realpath(root);
  const realTarget = await fs.realpath(target);
  if (path.dirname(realTarget) !== realRoot) throw new Error("ComfyUI storage escaped its root");
  return target;
}

function serialize<T>(userData: string, operation: () => Promise<T>): Promise<T> {
  const key = comfyDataDir(userData);
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  queues.set(key, next);
  const cleanup = () => { if (queues.get(key) === next) queues.delete(key); };
  void next.then(cleanup, cleanup);
  return next;
}

async function retryRename(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try { await fs.rename(from, to); return; } catch (error) {
      if (!["EPERM", "EBUSY", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "") || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
    }
  }
}

async function readEnvelope<T>(file: string, validate: (value: unknown) => value is T): Promise<Envelope<T> | null> {
  await rejectLink(file);
  let bytes: Buffer;
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > MAX_STORE_BYTES) throw new Error("Invalid ComfyUI store size");
    bytes = await fs.readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if ((error as NodeJS.ErrnoException).code) throw error;
    await quarantine(file);
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    assertJson(parsed);
    if (!object(parsed) || parsed.version !== 1 || typeof parsed.updatedAt !== "string" || !validate(parsed.data)) throw new Error("Invalid ComfyUI store schema");
    return parsed as unknown as Envelope<T>;
  } catch {
    await quarantine(file);
    return null;
  }
}

async function quarantine(file: string): Promise<void> {
  // A random suffix avoids overwriting earlier recovery evidence in one millisecond.
  await retryRename(file, `${file}.corrupt-${Date.now()}-${randomUUID()}`);
}

async function durableReplace(file: string, bytes: Buffer): Promise<void> {
  await rejectLink(file);
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporary, "wx", 0o600);
  try {
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await retryRename(temporary, file);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    // Do not fall back to copyFile: readers must never see a partially copied JSON.
    throw error;
  }
}

async function writeFile<T>(file: string, data: T, validate: (value: unknown) => value is T, keepBackup = true): Promise<void> {
  assertJson(data);
  if (!validate(data)) throw new Error("Invalid ComfyUI store value");
  const envelope: Envelope<T> = { version: 1, updatedAt: new Date().toISOString(), data };
  const bytes = Buffer.from(`${JSON.stringify(envelope)}\n`, "utf8");
  if (bytes.length > MAX_STORE_BYTES) throw new Error("ComfyUI store exceeds byte limit");
  const current = await readEnvelope(file, validate);
  if (keepBackup && current) {
    await rejectLink(`${file}.bak`);
    await durableReplace(`${file}.bak`, Buffer.from(`${JSON.stringify(current)}\n`, "utf8"));
  }
  await durableReplace(file, bytes);
}

async function readFile<T>(file: string, fallback: T, validate: (value: unknown) => value is T, critical = false): Promise<T> {
  const current = await readEnvelope(file, validate);
  if (current) return current.data;
  const backup = await readEnvelope(`${file}.bak`, validate);
  if (backup) {
    // Repair without overwriting the known-good backup with corrupt primary data.
    await writeFile(file, backup.data, validate, false);
    return backup.data;
  }
  if (critical && (await fs.readdir(path.dirname(file))).some((name) => name.startsWith(`${path.basename(file)}.corrupt-`) || name.startsWith(`${path.basename(file)}.bak.corrupt-`))) {
    throw new Error("COMFY_STORE_CORRUPT: quarantined records require recovery; refusing an empty replacement");
  }
  return fallback;
}

export async function readComfySettings<T extends object = JsonRecord>(userData: string, fallback: T = {} as T): Promise<T> {
  return serialize(userData, async () => readFile(path.join(await ensureRoot(userData), "settings.json"), fallback, (value): value is T => object(value)));
}

export async function writeComfySettings<T extends object>(userData: string, settings: T): Promise<void> {
  return serialize(userData, async () => writeFile(path.join(await ensureRoot(userData), "settings.json"), settings, (value): value is T => object(value)));
}

function workflowList(value: unknown): value is ComfyWorkflowRecord[] {
  return Array.isArray(value) && value.length <= 1000 && value.every(validWorkflow)
    && new Set(value.map((record) => record.id)).size === value.length;
}

export async function listWorkflowRecords<T extends ComfyWorkflowRecord = ComfyWorkflowRecord>(userData: string): Promise<T[]> {
  return serialize(userData, async () => readFile(path.join(await ensureRoot(userData), "workflows.json"), [], workflowList, true) as Promise<T[]>);
}

export async function readWorkflowRecord<T extends ComfyWorkflowRecord = ComfyWorkflowRecord>(userData: string, id: string): Promise<T | null> {
  assertId(id);
  return (await listWorkflowRecords<T>(userData)).find((record) => record.id === id) ?? null;
}

export async function saveWorkflowRecord<T extends ComfyWorkflowRecord>(userData: string, record: T, options: { createOnly?: boolean } = {}): Promise<T> {
  return serialize(userData, async () => {
    assertJson(record);
    if (!validWorkflow(record)) throw new Error("Invalid ComfyUI workflow record");
    const file = path.join(await ensureRoot(userData), "workflows.json");
    const records = await readFile(file, [], workflowList, true);
    const index = records.findIndex((item) => item.id === record.id);
    if (index >= 0 && options.createOnly) throw new Error("COMFY_WORKFLOW_ALREADY_EXISTS");
    if (index < 0) records.push(record); else records[index] = record;
    await writeFile(file, records, workflowList);
    return record;
  });
}

/** Read-modify-write in the store queue, so asynchronous analysis cannot
 * replace a newer name or an explicitly saved editor snapshot. */
export async function updateWorkflowRecord<T extends ComfyWorkflowRecord>(userData: string, id: string, update: (record: T) => T): Promise<T> {
  assertId(id);
  return serialize(userData, async () => {
    const file = path.join(await ensureRoot(userData), "workflows.json");
    const records = await readFile(file, [], workflowList, true) as T[];
    const index = records.findIndex(record => record.id === id);
    if (index < 0) throw new Error("COMFY_WORKFLOW_NOT_FOUND");
    const record = update(structuredClone(records[index]));
    assertJson(record);
    if (!validWorkflow(record) || record.id !== id) throw new Error("Invalid ComfyUI workflow update");
    records[index] = record;
    await writeFile(file, records, workflowList);
    return structuredClone(record);
  });
}

export async function renameWorkflowRecord(userData: string, id: string, name: string): Promise<ComfyWorkflowRecord> {
  assertId(id);
  if (typeof name !== "string" || !name.trim() || name.length > COMFY_LIMITS.workflowNameChars) throw new Error("Invalid ComfyUI workflow name");
  return serialize(userData, async () => {
    const file = path.join(await ensureRoot(userData), "workflows.json");
    const records = await readFile(file, [], workflowList, true);
    const record = records.find((item) => item.id === id);
    if (!record) throw new Error("ComfyUI workflow was not found");
    record.name = name.trim(); record.updatedAt = new Date().toISOString();
    await writeFile(file, records, workflowList);
    return record;
  });
}

export async function deleteWorkflowRecord(userData: string, id: string): Promise<boolean> {
  assertId(id);
  return serialize(userData, async () => {
    const file = path.join(await ensureRoot(userData), "workflows.json");
    const records = await readFile(file, [], workflowList, true);
    const remaining = records.filter((item) => item.id !== id);
    if (remaining.length === records.length) return false;
    await writeFile(file, remaining, workflowList);
    return true;
  });
}

function resultList(value: unknown): value is ComfyStoredResult[] {
  return Array.isArray(value) && value.length <= 20000 && value.every(validResult)
    && new Set(value.map((record) => record.id)).size === value.length;
}

export async function appendResultRecords<T extends ComfyStoredResult>(userData: string, results: T[]): Promise<void> {
  return serialize(userData, async () => {
    const file = path.join(await ensureRoot(userData), "results.json");
    const records = await readFile(file, [], resultList, true);
    const ids = new Set(records.map((item) => item.id));
    for (const result of results) {
      if (ids.has(result.id)) throw new Error("Duplicate ComfyUI result id");
      ids.add(result.id); records.push(result);
    }
    await writeFile(file, records, resultList);
  });
}

export async function listResultRecords<T extends ComfyStoredResult = ComfyStoredResult>(userData: string): Promise<T[]> {
  return serialize(userData, async () => readFile(path.join(await ensureRoot(userData), "results.json"), [], resultList, true) as Promise<T[]>);
}

export async function writeRunReceipt<T extends object>(userData: string, runId: string, receipt: T): Promise<void> {
  assertId(runId);
  return serialize(userData, async () => writeFile(path.join(await ensureRoot(userData, "receipts"), `${runId}.json`), receipt, (value): value is T => object(value)));
}

export async function readRunReceipt<T extends object = JsonRecord>(userData: string, runId: string): Promise<T | null> {
  assertId(runId);
  return serialize(userData, async () => readFile(path.join(await ensureRoot(userData, "receipts"), `${runId}.json`), null as T | null, (value): value is T | null => object(value)));
}

const HISTORY_ENTRY_BUDGET = 20000;
const HISTORY_CANDIDATE_BUDGET = 400;
const HISTORY_BYTE_BUDGET = 64 * 1024 * 1024;
const HISTORY_PHASES = new Set<ComfyRunPhase>(['validating', 'submitting', 'queued', 'running', 'saving', 'cancelling', 'completed', 'failed', 'cancelled']);
const HISTORY_TERMINAL = new Set<ComfyRunPhase>(['completed', 'failed', 'cancelled']);
const boundedText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
const timestamp = (value: unknown): value is string => boundedText(value, 100) && Number.isFinite(Date.parse(value));
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

/** Whitelist a small, inert summary; never return requests, workflow graphs,
 * target credentials, persisted media URLs, dataURLs or arbitrary receipt keys. */
function historySnapshot(value: unknown, fileId: string): ComfyRunSnapshot | null {
  if (!object(value) || value.runId !== fileId || !boundedText(value.workflowId, 128) || !ID.test(value.workflowId)
    || !HISTORY_PHASES.has(value.phase as ComfyRunPhase) || !timestamp(value.startedAt)
    || value.finishedAt !== null && !timestamp(value.finishedAt)
    || value.promptId !== null && !boundedText(value.promptId, 256)
    || value.queuePosition !== null && !count(value.queuePosition)
    || !count(value.nodesExecuted) || !count(value.nodesTotal) || !count(value.nonImageOutputs)
    || !object(value.seeds) || Object.keys(value.seeds).length > COMFY_LIMITS.slotCount
    || !Array.isArray(value.results) || value.results.length > 256) return null;
  const seeds: Record<string, number> = Object.create(null);
  for (const [key, seed] of Object.entries(value.seeds)) {
    if (!key || key.length > 256 || BAD_KEYS.has(key) || !count(seed)) return null;
    seeds[key] = seed;
  }
  let currentNode: ComfyRunSnapshot['currentNode'] = null;
  if (value.currentNode !== null) {
    if (!object(value.currentNode) || !boundedText(value.currentNode.id, 256)
      || value.currentNode.classType !== null && !boundedText(value.currentNode.classType, 1024)) return null;
    currentNode = { id: value.currentNode.id, classType: value.currentNode.classType as string | null };
  }
  let progress: ComfyRunSnapshot['progress'] = null;
  if (value.progress !== null) {
    if (!object(value.progress) || ![value.progress.value, value.progress.max].every(item => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= Number.MAX_SAFE_INTEGER)) return null;
    progress = { value: value.progress.value as number, max: value.progress.max as number };
  }
  let error: ComfyRunSnapshot['error'] = null;
  if (value.error !== null) {
    if (!object(value.error) || !boundedText(value.error.code, 256) || !boundedText(value.error.message, 4096)
      || !Array.isArray(value.error.nodeErrors) || value.error.nodeErrors.length > 128) return null;
    const nodeErrors: ComfyNodeError[] = [];
    for (const entry of value.error.nodeErrors) {
      if (!object(entry) || !boundedText(entry.nodeId, 256) || !boundedText(entry.message, 4096)
        || entry.classType !== null && !boundedText(entry.classType, 1024)
        || entry.details !== null && !boundedText(entry.details, 4096)) return null;
      nodeErrors.push({ nodeId: entry.nodeId, classType: entry.classType as string | null, message: entry.message, details: entry.details as string | null });
    }
    error = { code: value.error.code, message: value.error.message, nodeErrors };
  }
  const phase = value.phase as ComfyRunPhase;
  return { runId: fileId, workflowId: value.workflowId, promptId: value.promptId as string | null, phase,
    queuePosition: value.queuePosition as number | null, currentNode, progress,
    nodesExecuted: value.nodesExecuted, nodesTotal: value.nodesTotal, startedAt: value.startedAt,
    finishedAt: value.finishedAt as string | null, seeds, error, results: [], nonImageOutputs: value.nonImageOutputs,
    history: { restored: true, status: HISTORY_TERMINAL.has(phase) ? 'recorded' : 'unknown', resultCount: value.results.length } };
}

/** Bounded, read-only recovery. Deliberately does not call ensureRoot/readEnvelope:
 * opening the tool must not create, quarantine, truncate or rename old receipts. */
export async function readRunHistory(userData: string): Promise<{ runs: ComfyRunSnapshot[]; incomplete: boolean }> {
  const directory = path.join(comfyDataDir(userData), 'receipts');
  const result: { runs: ComfyRunSnapshot[]; incomplete: boolean } = { runs: [], incomplete: false };
  const normalized = path.resolve(directory), parsed = path.parse(normalized);
  if (/^(?:\\\\|\/\/|\\\?\?\\)/.test(normalized) || /[\0\r\n]/.test(normalized)) return { runs: [], incomplete: true };
  try {
    let current = parsed.root;
    const parts = normalized.slice(parsed.root.length).split(path.sep).filter(Boolean);
    if (parts.length > 128) return { runs: [], incomplete: true };
    for (const part of parts) {
      current = path.join(current, part); const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) return { runs: [], incomplete: true };
    }
  } catch (error) { return { runs: [], incomplete: (error as NodeJS.ErrnoException).code !== 'ENOENT' }; }
  const key = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
  try { if (key(await fs.realpath(directory)) !== key(normalized)) return { runs: [], incomplete: true }; }
  catch { return { runs: [], incomplete: true }; }
  const candidates: Array<{ file: string; id: string; size: number; mtimeMs: number; ino: number; dev: number }> = [];
  let handle: Awaited<ReturnType<typeof fs.opendir>> | undefined;
  try {
    handle = await fs.opendir(directory);
    let scanned = 0;
    while (scanned < HISTORY_ENTRY_BUDGET) {
      const entry = await handle.read(); if (!entry) break; scanned++;
      if (!entry.name.endsWith('.json')) continue;
      const id = entry.name.slice(0, -5);
      if (!ID.test(id) || !entry.isFile() || entry.isSymbolicLink()) { result.incomplete = true; continue; }
      const file = path.join(directory, entry.name);
      try {
        const stat = await fs.lstat(file);
        if (stat.isSymbolicLink() || !stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size < 1 || stat.size > MAX_STORE_BYTES) { result.incomplete = true; continue; }
        candidates.push({ file, id, size: stat.size, mtimeMs: stat.mtimeMs, ino: stat.ino, dev: stat.dev });
      } catch { result.incomplete = true; }
    }
    if (scanned >= HISTORY_ENTRY_BUDGET) result.incomplete = true;
  } catch { result.incomplete = true; }
  finally { await handle?.close().catch(() => undefined); }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs || b.id.localeCompare(a.id));
  if (candidates.length > HISTORY_CANDIDATE_BUDGET) result.incomplete = true;
  let reservedBytes = 0;
  for (const candidate of candidates.slice(0, HISTORY_CANDIDATE_BUDGET)) {
    if (candidate.size + 1 > HISTORY_BYTE_BUDGET - reservedBytes) { result.incomplete = true; continue; }
    // Reserve before allocation/I/O. Failed or partial reads still consume the
    // full allowance, so repeated I/O failures cannot bypass the total budget.
    reservedBytes += candidate.size + 1;
    let file: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      if ((await fs.lstat(directory)).isSymbolicLink() || key(await fs.realpath(directory)) !== key(normalized)) { result.incomplete = true; break; }
      const observed = await fs.lstat(candidate.file);
      if (observed.isSymbolicLink() || !observed.isFile()) throw new Error('unsafe receipt');
      file = await fs.open(candidate.file, 'r'); const opened = await file.stat();
      if (!opened.isFile() || opened.size !== candidate.size || opened.ino !== candidate.ino || opened.dev !== candidate.dev || opened.mtimeMs !== candidate.mtimeMs) throw new Error('changed receipt');
      // A bounded buffer plus one guard byte prevents a growing file from
      // defeating the aggregate byte limit after its stat was checked.
      const buffer = Buffer.alloc(candidate.size + 1); let offset = 0;
      while (offset < buffer.length) { const read = await file.read(buffer, offset, buffer.length - offset, offset); if (!read.bytesRead) break; offset += read.bytesRead; }
      const after = await file.stat();
      if (offset !== candidate.size || after.size !== candidate.size || after.mtimeMs !== candidate.mtimeMs) throw new Error('changed receipt');
      const envelope: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset)));
      if (!object(envelope) || envelope.version !== 1 || !timestamp(envelope.updatedAt) || !object(envelope.data)) throw new Error('invalid receipt envelope');
      const snapshot = historySnapshot(envelope.data.snapshot, candidate.id);
      if (!snapshot) throw new Error('invalid receipt snapshot');
      result.runs.push(snapshot);
    } catch { result.incomplete = true; }
    finally { await file?.close().catch(() => undefined); }
  }
  result.runs.sort((a, b) => Date.parse(b.finishedAt || b.startedAt) - Date.parse(a.finishedAt || a.startedAt) || b.runId.localeCompare(a.runId));
  result.runs = result.runs.slice(0, COMFY_LIMITS.runHistoryEntries);
  return result;
}

function validMarker(value: unknown): value is ComfyOwnedMarker {
  return object(value) && Number.isSafeInteger(value.pid) && Number(value.pid) > 0;
}

/** Informational only: a persisted PID never establishes process ownership. */
export async function writeOwnedMarker<T extends ComfyOwnedMarker>(userData: string, marker: T): Promise<void> {
  return serialize(userData, async () => writeFile(path.join(await ensureRoot(userData), "owned-session.json"), marker, validMarker, false));
}

export async function readOwnedMarker<T extends ComfyOwnedMarker = ComfyOwnedMarker>(userData: string): Promise<T | null> {
  return serialize(userData, async () => {
    const value = await readEnvelope(path.join(await ensureRoot(userData), "owned-session.json"), validMarker);
    return value?.data as T ?? null;
  });
}

export async function clearOwnedMarker(userData: string): Promise<void> {
  return serialize(userData, async () => {
    const file = path.join(await ensureRoot(userData), "owned-session.json");
    await rejectLink(file);
    await fs.unlink(file).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  });
}
