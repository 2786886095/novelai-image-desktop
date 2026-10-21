import type { ComfyResultItem, ComfyRunSnapshot, ComfySlotValue } from './contract';

export interface ComfyTaskFacts {
  images: ComfyResultItem[];
  firstImage: ComfyResultItem | null;
  imageCount: number | null;
  startedMs: number | null;
  finishedMs: number | null;
  /** Wall-clock time from submission, including queueing; not inference time. */
  elapsedSeconds: number | null;
  liveElapsed: boolean;
  prompt: string;
  /** Actual output image dimensions, not the submitted workflow dimensions. */
  dimensions: Array<{ width: number; height: number }>;
  seeds: Array<{ id: string; value: number }>;
  recordedValues: Record<string, ComfySlotValue> | null;
}

const ACTIVE_PHASES = new Set(['validating', 'submitting', 'queued', 'running', 'saving', 'cancelling']);
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const nonnegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const positiveInteger = (value: unknown): value is number => nonnegativeInteger(value) && value > 0;
const thumbnailUrl = (value: unknown): value is string => nonempty(value) &&
  (/^nai-local:\/\//i.test(value) || /^data:image\/(?:png|jpeg|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) && value.slice(value.indexOf(',') + 1).length > 0);
const timestamp = (value: unknown): number | null => {
  if (!nonempty(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function recordedSlots(value: unknown): Record<string, ComfySlotValue> | null {
  if (!record(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([key, item]) => nonempty(key) &&
    (typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item)))) return null;
  // fromEntries copies own scalar values without invoking __proto__ setters.
  return Object.fromEntries(entries) as Record<string, ComfySlotValue>;
}

/** Display facts from saved receipts only. Does not authorize reuse or generation. */
export function comfyTaskFacts(
  run: ComfyRunSnapshot,
  results: readonly ComfyResultItem[],
  now = Date.now(),
): ComfyTaskFacts {
  // Old or damaged history must not make the task view throw or invent facts.
  const source: Record<string, unknown> = record(run) ? run : {};
  const hasIdentity = nonempty(source.runId) && nonempty(source.workflowId);
  const belongs = (value: unknown): value is Record<string, unknown> => hasIdentity && record(value) &&
    value.runId === source.runId && value.workflowId === source.workflowId && nonempty(value.id);
  const isImageReceipt = (value: unknown): value is Record<string, unknown> => belongs(value) &&
    typeof value.mime === 'string' && IMAGE_MIMES.has(value.mime);
  const seen = new Set<string>();
  const images: ComfyResultItem[] = [];
  for (const item of Array.isArray(results) ? results : []) {
    if (!isImageReceipt(item) || !nonempty(item.filePath) || !thumbnailUrl(item.fileUrl) || seen.has(item.id as string)) continue;
    seen.add(item.id as string);
    images.push(item as unknown as ComfyResultItem);
  }
  const firstImage = images[0] ?? null;
  // Keep receipt counts independent of whether a local thumbnail can be shown.
  const isHistory = Object.hasOwn(source, 'history') && source.history !== undefined;
  const history = record(source.history) ? source.history : null;
  const imageCount = isHistory
    ? history && nonnegativeInteger(history.resultCount) ? history.resultCount : null
    : Array.isArray(source.results) ? source.results.filter(isImageReceipt).length : null;
  const startedMs = timestamp(source.startedAt);
  const finishedMs = timestamp(source.finishedAt);
  const hasFinished = source.finishedAt !== null && source.finishedAt !== undefined;
  const liveElapsed = !isHistory && !hasFinished && typeof source.phase === 'string' && ACTIVE_PHASES.has(source.phase) &&
    startedMs !== null && typeof now === 'number' && Number.isFinite(now) && now >= startedMs;
  const end = finishedMs ?? (liveElapsed ? now : null);
  const elapsedSeconds = startedMs !== null && end !== null && end >= startedMs
    ? Math.floor((end - startedMs) / 1000) : null;
  const recordedValues = firstImage ? recordedSlots(firstImage.slotValues) : null;
  const prompt = recordedValues ? Object.entries(recordedValues)
    .filter(([id, value]) => /^(positive|prompt):/.test(id) && typeof value === 'string')
    .map(([, value]) => value as string).filter(value => value.trim()).join(' · ') : '';
  const dimensionKeys = new Set<string>();
  const dimensions: ComfyTaskFacts['dimensions'] = [];
  for (const image of images) {
    if (!positiveInteger(image.width) || !positiveInteger(image.height)) continue;
    const key = `${image.width}x${image.height}`;
    if (dimensionKeys.has(key)) continue;
    dimensionKeys.add(key);
    dimensions.push({ width: image.width, height: image.height });
  }
  const seeds = record(source.seeds) ? Object.entries(source.seeds)
    .filter((entry): entry is [string, number] => nonempty(entry[0]) && nonnegativeInteger(entry[1]))
    .map(([id, value]) => ({ id, value })) : [];
  return { images, firstImage, imageCount, startedMs, finishedMs, elapsedSeconds, liveElapsed, prompt, dimensions, seeds, recordedValues };
}
