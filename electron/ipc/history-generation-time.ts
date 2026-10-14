import crypto from 'node:crypto';
import type {HistoryItem} from '../../src/types';

type GenerationTime = Pick<HistoryItem, 'generatedAt'|'generatedAtSource'|'generatedImageSha256'>;

export function validGenerationTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const day = new Date(value.slice(0,10)+'T00:00:00Z');
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0,10) === value.slice(0,10) &&
    Number(value.slice(11,13)) < 24 && Number(value.slice(14,16)) < 60 && Number(value.slice(17,19)) < 60;
}

/** Local receipt/completion time, not an official server timestamp. Hash final saved bytes. */
export function localGenerationTime(bytes: Uint8Array, completedAt = new Date()): GenerationTime {
  return {generatedAt: completedAt.toISOString(), generatedAtSource: 'local-completion',
    generatedImageSha256: crypto.createHash('sha256').update(bytes).digest('hex')};
}

/** Never synthesize a generation time for legacy/imported records. Not a signature verifier. */
export function preservedGenerationTime(raw: Partial<HistoryItem>): GenerationTime {
  if (raw.generatedAtSource !== 'local-completion' || !validGenerationTimestamp(raw.generatedAt) || typeof raw.generatedImageSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(raw.generatedImageSha256)) return {};
  return {generatedAt: new Date(raw.generatedAt).toISOString(), generatedAtSource: 'local-completion',
    generatedImageSha256: raw.generatedImageSha256};
}
