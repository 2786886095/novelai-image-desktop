// Local Model Context Protocol server.
//
// Exposes the Studio's existing Agent tool executor (agent-tools.ts) to
// external MCP clients such as pi / Claude Code / Codex over Streamable HTTP.
//   * Listens on 127.0.0.1 only and requires `Authorization: Bearer <token>`.
//   * Stateless JSON-RPC: every POST carries complete requests; responses are
//     JSON, or SSE (with progress notifications) for long tool calls.
//   * Every paid operation is quoted first and refused when the estimate is
//     above the user's "mcpMaxAnlasPerCall" setting. Paid calls are serialized.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import sharp from "sharp";
import { PNG } from "pngjs";
import type { BrowserWindow } from "electron";
import {
  APP_VERSION,
  DEFAULT_I2I_PARAMS,
  NAI_INPAINT_MODELS,
  NAI_MODELS,
  NAI_SAMPLERS,
  type AnlasQuoteRequest,
  type DirectorTool,
  type HistoryItem,
  type NAIInpaintModel,
  type UpscaleScale,
} from "../../src/types";
import type { AgentAttachment, AgentToolBridgeRequest, AgentToolBridgeResponse } from "../../src/agent/types";
import { defaultAgentInpaintModel } from "../../src/agent/generation-input";
import { agentGenerationInput, executeAgentTool } from "./agent-tools";
import { quoteAnlasCost, refreshStoredAccount } from "./nai";
import { getHistory, getSettings } from "./store";
import { importMcpImage, looksLikeLocalPath, mcpAttachment, newMcpTempFile, registerMcpFile } from "./mcp-attachments";

export interface McpServerHandle {
  port: number;
  close: () => Promise<void>;
}

export interface McpServerOptions {
  port: number;
  token: string;
  window: () => BrowserWindow | null | undefined;
}

type Json = Record<string, unknown>;
type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
interface ToolResult { content: Content[]; isError?: boolean }
interface ToolContext { signal: AbortSignal; progress: (message: string) => void }
interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  annotations?: Json;
  run: (args: Json, ctx: ToolContext) => Promise<ToolResult>;
}

const SUPPORTED_PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_BODY_BYTES = 4 * 1024 * 1024;

// ── small helpers ────────────────────────────────────────────────────────────
const record = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const str = (value: unknown) => typeof value === "string" ? value.trim() : "";
const num = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};
const text = (value: unknown): Content => ({ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) });
const ok = (value: unknown, ...extra: Content[]): ToolResult => ({ content: [text(value), ...extra] });
const fail = (message: string): ToolResult => ({ content: [text(message)], isError: true });

function budgetLimit() {
  return num(getSettings().mcpMaxAnlasPerCall, 0, 0, 100_000);
}

let paidQueue: Promise<unknown> = Promise.resolve();
function serializedPaid<T>(operation: () => Promise<T>): Promise<T> {
  const next = paidQueue.then(operation, operation);
  paidQueue = next.then(() => undefined, () => undefined);
  return next;
}

function runAgentTool(tool: string, args: Json, signal?: AbortSignal): Promise<AgentToolBridgeResponse> {
  const request: AgentToolBridgeRequest = {
    tool,
    args,
    sessionId: "",
    callId: `mcp-${crypto.randomUUID()}`,
    signal,
    // The MCP caller is authoritative: omitted fields inherit the workbench,
    // explicit fields are used as given (no Studio prompt locks re-applied).
    promptLocks: {},
  };
  return executeAgentTool(request, () => undefined);
}

function agentRequest(args: Json): AgentToolBridgeRequest {
  return { tool: "langbai_generate_image", args, sessionId: "", callId: "mcp-quote", promptLocks: {} };
}

// ── image references ─────────────────────────────────────────────────────────
interface ResolvedImage { id: string; filePath: string; width?: number; height?: number }

async function dimensions(filePath: string) {
  const meta = await sharp(filePath).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

/** Accepts an absolute local path, a history attachmentId, or an MCP attachment ID. */
async function resolveImage(value: unknown, label = "image"): Promise<ResolvedImage> {
  const raw = str(value);
  if (!raw) throw new Error(`缺少 ${label}（本地绝对路径或 attachmentId）。`);
  let attachment: Pick<AgentAttachment, "id" | "filePath" | "width" | "height"> | undefined;
  if (looksLikeLocalPath(raw)) attachment = await importMcpImage(raw);
  else attachment = mcpAttachment(raw) ?? (() => {
    const item = getHistory().find((entry) => entry.id === raw);
    return item ? { id: item.id, filePath: item.filePath, width: item.width, height: item.height } : undefined;
  })();
  if (!attachment || !fs.existsSync(attachment.filePath)) {
    throw new Error(`找不到 ${label}=${raw}。请传入本地绝对路径、list_history 返回的 attachmentId，或 import_image 返回的 ID。`);
  }
  let { width, height } = attachment;
  if (!width || !height) ({ width, height } = await dimensions(attachment.filePath));
  return { id: attachment.id, filePath: attachment.filePath, width, height };
}

// ── generation arguments ─────────────────────────────────────────────────────
const PASSTHROUGH_FIELDS = [
  "positivePrompt", "negativePrompt", "stylePrompt", "model", "width", "height", "steps", "cfgScale",
  "cfgRescale", "sampler", "noiseSchedule", "seed", "seedMode", "ucPreset", "qualityPreset", "effort",
  "variety", "transparentBackground", "fileNamePrefix",
] as const;

/** Translate MCP arguments into the in-app Agent tool's argument shape. */
async function toAgentArgs(raw: Json): Promise<Json> {
  const args: Json = {};
  for (const key of PASSTHROUGH_FIELDS) if (raw[key] !== undefined) args[key] = raw[key];
  if (raw.seed !== undefined && raw.seedMode === undefined) args.seedMode = "fixed";
  if (Array.isArray(raw.characterPrompts)) {
    const items = raw.characterPrompts.map(record);
    const positioned = items.some((item) => item.x !== undefined || item.y !== undefined);
    args.characterPrompts = items.map((item) => ({
      prompt: str(item.prompt),
      negativePrompt: str(item.negativePrompt),
      useCoords: positioned,
      x: num(item.x, 0.5, 0, 1),
      y: num(item.y, 0.5, 0, 1),
    }));
  }
  if (Array.isArray(raw.preciseReferences)) {
    args.preciseReferences = await Promise.all(raw.preciseReferences.map(record).map(async (item) => ({
      attachmentId: (await resolveImage(item.image, "preciseReferences[].image")).id,
      type: item.type === "style" || item.type === "character&style" ? item.type : "character",
      strength: num(item.strength, 1, 0, 1),
      fidelity: num(item.fidelity, 1, 0, 1),
    })));
  }
  if (Array.isArray(raw.vibeReferences)) {
    args.vibeReferences = await Promise.all(raw.vibeReferences.map(record).map(async (item) => ({
      attachmentId: (await resolveImage(item.image, "vibeReferences[].image")).id,
      strength: num(item.strength, 0.6, 0, 1),
      infoExtracted: num(item.infoExtracted, 1, 0, 1),
    })));
  }
  return args;
}

const snap64 = (value: number) => Math.max(64, Math.round(value / 64) * 64);

/** img2img/inpaint must keep the source aspect unless the caller overrides it. */
function withSourceSize(args: Json, image: ResolvedImage, maxSide = 2048) {
  if (args.width !== undefined && args.height !== undefined) return args;
  let width = image.width ?? 1024;
  let height = image.height ?? 1024;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  width = snap64(width * scale);
  height = snap64(height * scale);
  return { ...args, width, height };
}

// ── budget ───────────────────────────────────────────────────────────────────
interface Budget { amount: number; limit: number; source?: string; balance?: number; details?: string[] }

async function quote(request: AnlasQuoteRequest): Promise<Budget & { ok: boolean; message: string }> {
  const result = await quoteAnlasCost(request);
  const limit = budgetLimit();
  if (!result.ok || typeof result.amount !== "number") return { ok: false, amount: Number.NaN, limit, message: result.message };
  let amount = result.amount;
  const details = [...(result.details ?? [])];
  // Precise references. The shared estimator charges a flat 5 Anlas per image
  // (the official request-price route ignores them entirely). On a live Opus
  // account a single-image V4.5 img2img was billed 5 Anlas with one reference
  // and 15 with three, so the MCP guard conservatively budgets 5 Anlas per
  // reference per image. Over-estimating only makes the cap stricter.
  const precise = request.extras?.preciseReferences?.length ?? 0;
  if (precise > 0) {
    const samples = Math.max(1, Math.floor(request.batchCount ?? 1));
    const alreadyIncluded = result.source === "official-api" ? 0 : 5 * samples;
    const extra = Math.max(0, 5 * precise * samples - alreadyIncluded);
    if (extra > 0) {
      amount += extra;
      details.push(`MCP guard: precise references budgeted at 5 Anlas x ${precise} ref(s) x ${samples} image(s) (+${extra}, conservative).`);
    }
  }
  const message = amount === result.amount ? result.message : `Budgeted at ${amount} Anlas for the MCP cap (estimator: ${result.message})`;
  return { ok: true, amount, limit, source: result.source, balance: result.balance, details, message };
}

async function enforceBudget(request: AnlasQuoteRequest): Promise<Budget> {
  const result = await quote(request);
  if (!result.ok) throw new Error(`无法获取本次扣费估算（${result.message}），为安全起见未执行。`);
  if (typeof result.balance === "number" && result.amount > result.balance) {
    throw new Error(`预计消耗 ${result.amount} Anlas，余额只有 ${result.balance}，未执行。`);
  }
  if (result.amount > result.limit) {
    throw new Error(`预计消耗 ${result.amount} Anlas（${result.source}），超过 MCP 单次上限 ${result.limit} Anlas，未执行。请让用户在「设置 → MCP 服务」调高上限，或改用免费参数（Opus：≤1MP、≤28 步、单张、无精准参考）。`);
  }
  const { amount, limit, source, balance, details } = result;
  return { amount, limit, source, balance, details };
}

// ── results ──────────────────────────────────────────────────────────────────
function imagesFrom(result: AgentToolBridgeResponse) {
  const data = record(result.data);
  const items: HistoryItem[] = Array.isArray(data.items) ? data.items as HistoryItem[] : data.item ? [data.item as HistoryItem] : [];
  return (result.generatedImages ?? []).map((image) => {
    const item = items.find((entry) => entry.id === image.id);
    return {
      attachmentId: image.id,
      filePath: image.filePath,
      width: image.width ?? item?.width,
      height: image.height ?? item?.height,
      seed: item?.actualSeed,
      model: item?.model,
      date: item?.date,
    };
  });
}

// ── tool schemas ─────────────────────────────────────────────────────────────
const IMAGE_REF = { type: "string", description: "Absolute local file path (PNG/JPG/WebP), a history attachmentId, or an ID returned by import_image/make_mask." };
const GENERATION_PROPS: Json = {
  positivePrompt: { type: "string", description: "Base prompt. Put per-character tags in characterPrompts. V5 supports `Text: ...` for rendered lettering." },
  negativePrompt: { type: "string", description: "Base undesired content. Omitted = inherit the workbench value." },
  stylePrompt: { type: "string", description: "Style prompt merged before the base prompt. Omitted = inherit the workbench value; \"\" clears it." },
  model: { type: "string", enum: NAI_MODELS.map((item) => item.value), description: "Omitted = workbench model. Precise/vibe references require nai-diffusion-4-5-*." },
  width: { type: "integer", minimum: 64, maximum: 2048, description: "Multiple of 64." },
  height: { type: "integer", minimum: 64, maximum: 2048, description: "Multiple of 64." },
  steps: { type: "integer", minimum: 1, maximum: 50 },
  cfgScale: { type: "number", minimum: 0, maximum: 10 },
  cfgRescale: { type: "number", minimum: 0, maximum: 1 },
  sampler: { type: "string", enum: NAI_SAMPLERS.map((item) => item.value) },
  noiseSchedule: { type: "string", enum: ["native", "karras", "exponential"] },
  seed: { type: "integer", minimum: 0, maximum: 4294967295, description: "Providing a seed implies seedMode=fixed." },
  seedMode: { type: "string", enum: ["random", "fixed"] },
  ucPreset: { type: "integer", enum: [0, 1, 2, 3], description: "Auto-appended negative preset: 0 Heavy, 1 Light, 2 Human Focus, 3 None." },
  qualityPreset: { type: "string", enum: ["standard", "light", "none"], description: "Auto-appended quality tags (`no text` is dropped automatically when the prompt contains `Text:`)." },
  effort: { type: "string", enum: ["high", "medium"], description: "V5 only. Medium discards negative prompts; prefer high." },
  variety: { type: "boolean" },
  characterPrompts: {
    type: "array",
    maxItems: 6,
    description: "V4+ multi-character prompts, in left-to-right order. If any item has x/y, custom positions are enabled for all (0 = left/top, 1 = right/bottom; NovelAI's grid uses 0.1/0.3/0.5/0.7/0.9).",
    items: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        negativePrompt: { type: "string", description: "Per-character undesired content." },
        x: { type: "number", minimum: 0, maximum: 1 },
        y: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["prompt"],
    },
  },
  preciseReferences: {
    type: "array",
    maxItems: 16,
    description: "Precise (character/style) references. Only NovelAI Diffusion 4.5 supports them; adds 5 Anlas per image.",
    items: {
      type: "object",
      properties: {
        image: IMAGE_REF,
        type: { type: "string", enum: ["character", "style", "character&style"] },
        strength: { type: "number", minimum: 0, maximum: 1 },
        fidelity: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["image"],
    },
  },
  vibeReferences: {
    type: "array",
    maxItems: 16,
    description: "Vibe Transfer references (not available on V5).",
    items: {
      type: "object",
      properties: { image: IMAGE_REF, strength: { type: "number", minimum: 0, maximum: 1 }, infoExtracted: { type: "number", minimum: 0, maximum: 1 } },
      required: ["image"],
    },
  },
  syncWorkbench: { type: "boolean", description: "Load the first result (with its parameters) into the Studio workbench UI." },
};
const schema = (properties: Json, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const PAID = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const READ = { readOnlyHint: true, openWorldHint: false };

function notify(options: McpServerOptions, images: Array<{ filePath: string; date?: string }>, sync: boolean) {
  const win = options.window();
  if (!win || win.isDestroyed()) return;
  win.webContents.send("mcp:event", { kind: "history", date: images[0]?.date, count: images.length });
  if (sync && images[0]?.filePath) win.webContents.send("image:loadParameters", images[0].filePath);
}

function createTools(options: McpServerOptions): ToolDef[] {
  const imageOperation = async (
    tool: string,
    args: Json,
    budget: AnlasQuoteRequest,
    ctx: ToolContext,
    sync: boolean,
  ): Promise<ToolResult> => serializedPaid(async () => {
    ctx.signal.throwIfAborted();
    ctx.progress("正在估算 Anlas 消耗…");
    const spent = await enforceBudget(budget);
    ctx.progress(`预计 ${spent.amount} Anlas，开始生成…`);
    const result = await runAgentTool(tool, args, ctx.signal);
    const images = imagesFrom(result);
    if (images.length) notify(options, images, sync);
    const payload = { ok: result.ok, title: result.title, message: record(result.data).message ?? (result.ok ? undefined : result.output), anlas: spent, images };
    return result.ok ? ok(payload) : { content: [text(payload)], isError: true };
  });

  const generationBudget = async (args: Json, count: number): Promise<AnlasQuoteRequest> => {
    const { params, extras } = agentGenerationInput(agentRequest(args), args);
    return { feature: "generate", params, extras, batchCount: count };
  };

  return [
    {
      name: "get_state",
      title: "Studio state",
      description: "Current workbench parameters (inherited by every generation call when a field is omitted), model capabilities, account/Anlas balance and the MCP spending limit.",
      inputSchema: schema({}),
      annotations: READ,
      run: async () => {
        const state = await runAgentTool("langbai_get_generation_state", {});
        const account = await refreshStoredAccount().catch(() => undefined);
        return ok({
          ...record(state.data),
          account: account && {
            tier: account.tierName,
            anlasBalance: account.anlasBalance,
            opusUsage: account.opusUsage,
            stale: account.stale,
          },
          mcp: { maxAnlasPerCall: budgetLimit(), version: APP_VERSION },
        });
      },
    },
    {
      name: "generate_image",
      title: "Text to image",
      description: "Generate images with NovelAI (saved to Studio history). Omitted parameters inherit the current workbench; characterPrompts are NOT inherited. Returns file paths you can view with view_image. Refused when the Anlas estimate exceeds the user's limit.",
      inputSchema: schema({ ...GENERATION_PROPS, count: { type: "integer", minimum: 1, maximum: 8, description: "Sequential single-image requests." } }, ["positivePrompt"]),
      annotations: PAID,
      run: async (raw, ctx) => {
        const args = { ...(await toAgentArgs(raw)), count: num(raw.count, 1, 1, 8) };
        return imageOperation("langbai_generate_image", args, await generationBudget(args, Number(args.count)), ctx, raw.syncWorkbench === true);
      },
    },
    {
      name: "img2img",
      title: "Image to image",
      description: "Redraw an existing image (keeps composition at low strength). Supports characterPrompts and, on NovelAI 4.5, preciseReferences — the way to pull faces toward reference sheets. Output size defaults to the source aspect.",
      inputSchema: schema({
        ...GENERATION_PROPS,
        image: IMAGE_REF,
        strength: { type: "number", minimum: 0, maximum: 1, description: "0.3–0.5 keeps composition, 0.6–0.8 changes more. Default 0.5." },
        noise: { type: "number", minimum: 0, maximum: 1 },
      }, ["image", "positivePrompt"]),
      annotations: PAID,
      run: async (raw, ctx) => {
        const image = await resolveImage(raw.image);
        const strength = num(raw.strength, 0.5, 0, 1);
        const args = withSourceSize({ ...(await toAgentArgs(raw)), attachmentId: image.id, strength, noise: num(raw.noise, 0, 0, 1), groupName: "MCP 图生图", fileNamePrefix: str(raw.fileNamePrefix) || "mcp-i2i" }, image);
        const { params, extras } = agentGenerationInput(agentRequest(args), args);
        return imageOperation("langbai_redraw_image", args, { feature: "i2i", params, extras, i2iParams: { ...DEFAULT_I2I_PARAMS, strength } }, ctx, raw.syncWorkbench === true);
      },
    },
    {
      name: "inpaint",
      title: "Inpaint (masked redraw)",
      description: "Redraw only the masked area. Create the mask with make_mask. NOTE: the Studio inpaint endpoint ignores characterPrompts and references — describe the masked subject in positivePrompt.",
      inputSchema: schema({
        ...GENERATION_PROPS,
        image: IMAGE_REF,
        mask: { ...IMAGE_REF, description: "Mask image (white/opaque = repaint). Use make_mask." },
        strength: { type: "number", minimum: 0, maximum: 1, description: "Default 1." },
        inpaintModel: { type: "string", enum: NAI_INPAINT_MODELS.map((item) => item.value) },
      }, ["image", "mask", "positivePrompt"]),
      annotations: PAID,
      run: async (raw, ctx) => {
        const image = await resolveImage(raw.image);
        const mask = await resolveImage(raw.mask, "mask");
        const strength = num(raw.strength, 1, 0, 1);
        const args = withSourceSize({ ...(await toAgentArgs(raw)), attachmentId: image.id, maskAttachmentId: mask.id, strength }, image, 1600);
        const { params } = agentGenerationInput(agentRequest(args), args);
        const inpaintModel = (str(raw.inpaintModel) || defaultAgentInpaintModel(params.model)) as NAIInpaintModel;
        args.inpaintModel = inpaintModel;
        return imageOperation("langbai_inpaint_image", args, {
          feature: "inpaint", params, inpaintModel, inpaintStrength: strength,
          image: { width: image.width ?? params.width, height: image.height ?? params.height },
        }, ctx, raw.syncWorkbench === true);
      },
    },
    {
      name: "upscale",
      title: "Upscale",
      description: "NovelAI upscale (2x or 4x).",
      inputSchema: schema({ image: IMAGE_REF, scale: { type: "integer", enum: [2, 4] } }, ["image"]),
      annotations: PAID,
      run: async (raw, ctx) => {
        const image = await resolveImage(raw.image);
        const scale = (Number(raw.scale) === 2 ? 2 : 4) as UpscaleScale;
        return imageOperation("langbai_upscale_image", { attachmentId: image.id, scale }, {
          feature: "upscale", upscaleScale: scale, image: { width: image.width ?? 0, height: image.height ?? 0 },
        }, ctx, false);
      },
    },
    {
      name: "director_tool",
      title: "Director tools",
      description: "NovelAI director tools: bg-removal (65 Anlas), lineart, sketch, colorize, emotion, declutter.",
      inputSchema: schema({
        image: IMAGE_REF,
        tool: { type: "string", enum: ["bg-removal", "lineart", "sketch", "colorize", "emotion", "declutter"] },
        colorizePrompt: { type: "string" },
        emotion: { type: "string", enum: ["neutral", "happy", "sad", "angry", "surprised", "scared", "disgusted", "amazed"] },
        emotionLevel: { type: "number", minimum: 0, maximum: 1 },
        defry: { type: "integer", minimum: 0, maximum: 5 },
      }, ["image", "tool"]),
      annotations: PAID,
      run: async (raw, ctx) => {
        const image = await resolveImage(raw.image);
        const tool = str(raw.tool) as DirectorTool;
        return imageOperation("langbai_director", { ...raw, attachmentId: image.id, tool }, { feature: "director", directorTool: tool }, ctx, false);
      },
    },
    {
      name: "estimate_cost",
      title: "Estimate Anlas cost",
      description: "Quote an operation without running it. Same arguments as the corresponding tool plus `operation`.",
      inputSchema: { type: "object", properties: { operation: { type: "string", enum: ["generate", "img2img", "inpaint", "upscale"] }, ...GENERATION_PROPS, image: IMAGE_REF, count: { type: "integer" }, strength: { type: "number" }, scale: { type: "integer" } }, required: ["operation"], additionalProperties: true },
      annotations: READ,
      run: async (raw) => {
        const operation = str(raw.operation);
        let request: AnlasQuoteRequest;
        if (operation === "upscale") {
          const image = await resolveImage(raw.image);
          request = { feature: "upscale", upscaleScale: (Number(raw.scale) === 2 ? 2 : 4) as UpscaleScale, image: { width: image.width ?? 0, height: image.height ?? 0 } };
        } else if (operation === "img2img" || operation === "inpaint") {
          const image = await resolveImage(raw.image);
          const args = withSourceSize({ ...(await toAgentArgs({ positivePrompt: "quote", ...raw })) }, image, operation === "inpaint" ? 1600 : 2048);
          const { params, extras } = agentGenerationInput(agentRequest(args), args);
          const strength = num(raw.strength, operation === "inpaint" ? 1 : 0.5, 0, 1);
          request = operation === "img2img"
            ? { feature: "i2i", params, extras, i2iParams: { ...DEFAULT_I2I_PARAMS, strength } }
            : { feature: "inpaint", params, inpaintModel: defaultAgentInpaintModel(params.model), inpaintStrength: strength, image: { width: image.width ?? 0, height: image.height ?? 0 } };
        } else {
          const args = await toAgentArgs({ positivePrompt: "quote", ...raw });
          request = await generationBudget(args, num(raw.count, 1, 1, 8));
        }
        const result = await quote(request);
        return ok({ ...result, allowed: result.ok && result.amount <= result.limit });
      },
    },
    {
      name: "list_history",
      title: "List history",
      description: "Recent Studio generations (newest first) with file paths, seeds and prompts.",
      inputSchema: schema({ limit: { type: "integer", minimum: 1, maximum: 100 }, date: { type: "string", description: "YYYY-MM-DD" }, groupId: { type: "string" } }),
      annotations: READ,
      run: async (raw) => {
        const result = await runAgentTool("langbai_list_history", { limit: num(raw.limit, 12, 1, 100), date: raw.date, groupId: raw.groupId });
        const data = record(result.data);
        const paths = new Map((result.generatedImages ?? []).map((image) => [image.id, image.filePath]));
        const items = Array.isArray(data.items) ? data.items.map(record).map((item) => ({ ...item, filePath: paths.get(String(item.attachmentId)) })) : [];
        return ok({ groups: data.groups, items });
      },
    },
    {
      name: "read_image_metadata",
      title: "Read image metadata",
      description: "Read NovelAI/A1111/Comfy parameters embedded in an image (prompts, character prompts with positions, seed, sampler…).",
      inputSchema: schema({ image: IMAGE_REF }, ["image"]),
      annotations: READ,
      run: async (raw) => {
        const image = await resolveImage(raw.image);
        const result = await runAgentTool("langbai_read_image_metadata", { attachmentId: image.id });
        return result.ok ? ok(result.data) : fail(result.output);
      },
    },
    {
      name: "view_image",
      title: "View image",
      description: "Return an image (optionally a cropped region, e.g. to inspect faces) so it can be looked at.",
      inputSchema: schema({
        image: IMAGE_REF,
        maxSize: { type: "integer", minimum: 64, maximum: 2048, description: "Longest side of the returned preview. Default 1024." },
        region: {
          type: "object",
          description: "Crop in fractions of the image (0–1).",
          properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } },
          required: ["x", "y", "width", "height"],
        },
      }, ["image"]),
      annotations: READ,
      run: async (raw) => {
        const image = await resolveImage(raw.image);
        const width = image.width ?? 0;
        const height = image.height ?? 0;
        let pipeline = sharp(image.filePath);
        const region = record(raw.region);
        if (raw.region) {
          const left = Math.round(num(region.x, 0, 0, 1) * width);
          const top = Math.round(num(region.y, 0, 0, 1) * height);
          const w = Math.max(1, Math.min(width - left, Math.round(num(region.width, 1, 0, 1) * width)));
          const h = Math.max(1, Math.min(height - top, Math.round(num(region.height, 1, 0, 1) * height)));
          pipeline = pipeline.extract({ left, top, width: w, height: h });
        }
        const maxSize = num(raw.maxSize, 1024, 64, 2048);
        const buffer = await pipeline.resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
        return ok({ attachmentId: image.id, filePath: image.filePath, width, height }, { type: "image", data: buffer.toString("base64"), mimeType: "image/jpeg" });
      },
    },
    {
      name: "import_image",
      title: "Import local image",
      description: "Register a local image as an attachment ID. Optional: every image argument also accepts an absolute path directly.",
      inputSchema: schema({ path: { type: "string" } }, ["path"]),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      run: async (raw) => {
        const attachment = await importMcpImage(str(raw.path));
        return ok({ attachmentId: attachment.id, filePath: attachment.filePath, width: attachment.width, height: attachment.height });
      },
    },
    {
      name: "make_mask",
      title: "Make inpaint mask",
      description: "Build an inpaint mask for an image from rectangles/ellipses. Returns the mask ID and a red-overlay preview path (check it with view_image before inpainting).",
      inputSchema: schema({
        image: IMAGE_REF,
        units: { type: "string", enum: ["fraction", "pixel"], description: "Coordinates in fractions of the image (default) or pixels." },
        invert: { type: "boolean" },
        shapes: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              shape: { type: "string", enum: ["rect", "ellipse"] },
              x: { type: "number", description: "Left edge." },
              y: { type: "number", description: "Top edge." },
              width: { type: "number" },
              height: { type: "number" },
            },
            required: ["x", "y", "width", "height"],
          },
        },
      }, ["image", "shapes"]),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      run: async (raw) => {
        const image = await resolveImage(raw.image);
        const width = image.width ?? 0;
        const height = image.height ?? 0;
        if (!width || !height) throw new Error("无法读取图片尺寸。");
        const pixels = raw.units === "pixel";
        const selected = new Uint8Array(width * height);
        for (const shape of Array.isArray(raw.shapes) ? raw.shapes.map(record) : []) {
          const sx = (value: unknown) => pixels ? Number(value) : Number(value) * width;
          const sy = (value: unknown) => pixels ? Number(value) : Number(value) * height;
          const left = sx(shape.x), top = sy(shape.y), w = sx(shape.width), h = sy(shape.height);
          if (![left, top, w, h].every(Number.isFinite) || w <= 0 || h <= 0) throw new Error("mask 形状坐标无效。");
          const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(width, Math.ceil(left + w));
          const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(height, Math.ceil(top + h));
          const cx = left + w / 2, cy = top + h / 2, rx = w / 2, ry = h / 2;
          for (let y = y0; y < y1; y += 1) {
            for (let x = x0; x < x1; x += 1) {
              if (shape.shape === "ellipse" && ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 > 1) continue;
              selected[y * width + x] = 1;
            }
          }
        }
        if (raw.invert === true) for (let index = 0; index < selected.length; index += 1) selected[index] ^= 1;
        const mask = new PNG({ width, height });
        const overlay = new PNG({ width, height });
        let count = 0;
        for (let index = 0; index < selected.length; index += 1) {
          if (!selected[index]) continue;
          count += 1;
          const offset = index * 4;
          mask.data[offset] = mask.data[offset + 1] = mask.data[offset + 2] = mask.data[offset + 3] = 255;
          overlay.data[offset] = 255;
          overlay.data[offset + 3] = 120;
        }
        if (!count) throw new Error("mask 为空：形状没有覆盖任何像素。");
        const maskFile = newMcpTempFile(".png");
        fs.writeFileSync(maskFile, PNG.sync.write(mask));
        const previewFile = newMcpTempFile(".jpg");
        await sharp(image.filePath).composite([{ input: PNG.sync.write(overlay) }]).jpeg({ quality: 85 }).toFile(previewFile);
        const maskAttachment = await registerMcpFile(maskFile, "mask");
        const preview = await registerMcpFile(previewFile, "maskpreview");
        return ok({ maskId: maskAttachment.id, maskPath: maskAttachment.filePath, previewId: preview.id, previewPath: preview.filePath, coverage: Number((count / selected.length).toFixed(4)) });
      },
    },
    {
      name: "search_tags",
      title: "Search Danbooru tags",
      description: "Look up Danbooru tags (exact + concept search) to check tag spelling/popularity.",
      inputSchema: schema({ query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100 } }, ["query"]),
      annotations: { readOnlyHint: true, openWorldHint: true },
      run: async (raw) => {
        const result = await runAgentTool("langbai_search_tags", { query: raw.query, limit: raw.limit });
        return result.ok ? ok(result.data) : fail(result.output);
      },
    },
    {
      name: "apply_to_workbench",
      title: "Load into workbench",
      description: "Show an image in the Studio and load its embedded parameters (prompts, character prompts and positions, seed…) into the generate workbench, so the user can continue manually.",
      inputSchema: schema({ image: IMAGE_REF }, ["image"]),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      run: async (raw) => {
        const image = await resolveImage(raw.image);
        const win = options.window();
        if (!win || win.isDestroyed()) throw new Error("Studio 窗口不可用。");
        win.webContents.send("image:loadParameters", image.filePath);
        return ok({ loaded: image.filePath });
      },
    },
  ];
}

const INSTRUCTIONS = [
  "Langbai NovelAI Studio (local). Images are generated with the user's NovelAI account and saved to Studio history.",
  "Omitted generation fields inherit the current workbench (see get_state); characterPrompts and references are never inherited.",
  "Every image argument accepts an absolute local path, so reference sheets can be used directly.",
  "V5 has no precise reference / vibe transfer: for face fidelity, compose with V5 then img2img with model nai-diffusion-4-5-full + preciseReferences (strength ~0.5).",
  "Inpaint ignores characterPrompts; describe the masked subject in positivePrompt. Use make_mask + view_image(previewPath) first.",
  "Paid calls are refused when the Anlas estimate exceeds the user's per-call limit; check with estimate_cost. Never retry a paid call blindly — inspect list_history first.",
].join("\n");

// ── JSON-RPC / HTTP transport ────────────────────────────────────────────────
interface RpcMessage { jsonrpc?: string; id?: string | number | null; method?: string; params?: unknown }

function rpcResult(id: RpcMessage["id"], result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: RpcMessage["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function sendJson(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function startMcpServer(options: McpServerOptions): Promise<McpServerHandle> {
  const tools = createTools(options);
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const listed = tools.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations: { title, ...annotations } }));

  const handle = async (message: RpcMessage, ctx: ToolContext) => {
    const params = record(message.params);
    switch (message.method) {
      case "initialize": {
        const requested = str(params.protocolVersion);
        return rpcResult(message.id, {
          protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[1],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "langbai-novelai-studio", title: "Langbai NovelAI Studio", version: APP_VERSION },
          instructions: INSTRUCTIONS,
        });
      }
      case "ping": return rpcResult(message.id, {});
      case "tools/list": return rpcResult(message.id, { tools: listed });
      case "resources/list": return rpcResult(message.id, { resources: [] });
      case "resources/templates/list": return rpcResult(message.id, { resourceTemplates: [] });
      case "prompts/list": return rpcResult(message.id, { prompts: [] });
      case "logging/setLevel": return rpcResult(message.id, {});
      case "tools/call": {
        const tool = byName.get(str(params.name));
        if (!tool) return rpcError(message.id, -32602, `Unknown tool: ${str(params.name)}`);
        try {
          return rpcResult(message.id, await tool.run(record(params.arguments), ctx));
        } catch (error) {
          return rpcResult(message.id, fail(error instanceof Error ? error.message : String(error)));
        }
      }
      default: return rpcError(message.id, -32601, `Method not found: ${message.method}`);
    }
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/mcp") { sendJson(res, 404, { error: "Not found. MCP endpoint is /mcp" }); return; }
      // DNS-rebinding guard: browsers always send Origin; local CLI clients do not.
      const origin = req.headers.origin;
      if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(origin)) { sendJson(res, 403, { error: "Forbidden origin" }); return; }
      const auth = req.headers.authorization ?? "";
      if (!safeEqual(auth, `Bearer ${options.token}`)) { sendJson(res, 401, rpcError(null, -32001, "Unauthorized: missing or wrong bearer token")); return; }
      if (req.method !== "POST") { sendJson(res, 405, rpcError(null, -32000, "Method not allowed"), { Allow: "POST" }); return; }

      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > MAX_BODY_BYTES) { sendJson(res, 413, rpcError(null, -32600, "Request too large")); return; }
        chunks.push(chunk as Buffer);
      }
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { sendJson(res, 400, rpcError(null, -32700, "Parse error")); return; }
      const batch = Array.isArray(body);
      const messages = (batch ? body as unknown[] : [body]).map(record) as RpcMessage[];
      const requests = messages.filter((message) => typeof message.method === "string" && message.id !== undefined && message.id !== null);
      if (!requests.length) { res.writeHead(202).end(); return; } // notifications / responses only

      const controller = new AbortController();
      res.on("close", () => { if (!res.writableFinished) controller.abort(new Error("MCP client disconnected")); });
      const streaming = String(req.headers.accept ?? "").includes("text/event-stream")
        && requests.some((message) => message.method === "tools/call");

      if (!streaming) {
        const noop: ToolContext = { signal: controller.signal, progress: () => undefined };
        const results = await Promise.all(requests.map((message) => handle(message, noop)));
        sendJson(res, 200, batch ? results : results[0]);
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
      const write = (payload: unknown) => { if (!res.writableEnded) res.write(`event: message\ndata: ${JSON.stringify(payload)}\n\n`); };
      await Promise.all(requests.map(async (message) => {
        const token = record(record(record(message.params)._meta)).progressToken;
        let step = 0;
        let last = "处理中…";
        const progress = (note: string) => {
          last = note;
          if (token !== undefined) write({ jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: token, progress: ++step, message: note } });
        };
        // Heartbeat keeps long generations alive (progress resets client timeouts).
        const timer = setInterval(() => {
          if (token !== undefined) progress(last);
          else if (!res.writableEnded) res.write(": keepalive\n\n");
        }, 10_000);
        try { write(await handle(message, { signal: controller.signal, progress })); }
        finally { clearInterval(timer); }
      }));
      res.end();
    } catch (error) {
      if (!res.headersSent) sendJson(res, 500, rpcError(null, -32603, error instanceof Error ? error.message : String(error)));
      else res.end();
    }
  });
  server.requestTimeout = 0; // tool calls may legitimately take minutes
  server.headersTimeout = 15_000;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  return {
    port,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
