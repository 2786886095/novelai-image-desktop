import { randomUUID } from 'node:crypto';

export interface StudioGenerationPreview {
  positivePrompt: string;
  model: string;
  width: number;
  height: number;
  steps: number;
  count: number;
  effort?: 'medium' | 'high';
  imageProvider: string;
  estimatedAnlas: number | null;
  estimateSource: 'local-estimate' | 'provider-unknown';
  warning: string;
}

interface PreparedGeneration {
  id: string;
  sessionId: string;
  createdAt: number;
  fingerprint: string;
  args: Record<string, unknown>;
  preview: StudioGenerationPreview;
}

/** One-shot, session-scoped preparation. Model text is never authorization. */
export class StudioGenerationPreparations {
  private readonly pending = new Map<string, PreparedGeneration>();
  constructor(private readonly now = () => Date.now()) {}

  prepare(sessionId: string, args: Record<string, unknown>, fingerprint: string, preview: StudioGenerationPreview) {
    this.prune();
    if (!sessionId || !fingerprint) throw new Error('生图准备缺少会话或设置快照。');
    if (typeof args.positivePrompt !== 'string' || !args.positivePrompt.trim()) {
      throw new Error('请先提供正面提示词，再准备生图。');
    }
    const encoded = JSON.stringify(args);
    if (!encoded || encoded.length > 20_000) throw new Error('生图参数过长。');
    if (this.pending.size >= 32) throw new Error('待确认生图过多，请稍后重试。');
    const id = randomUUID();
    const item: PreparedGeneration = { id, sessionId, createdAt: this.now(), fingerprint,
      args: JSON.parse(encoded) as Record<string, unknown>, preview };
    this.pending.set(id, item);
    return { preparationId: id, expiresInSeconds: 600, ...preview };
  }

  inspect(sessionId: string, id: unknown, fingerprint: string) {
    this.prune();
    const item = typeof id === 'string' ? this.pending.get(id) : undefined;
    if (!item || item.sessionId !== sessionId) throw new Error('生图准备不存在或已过期，请重新准备。');
    if (item.fingerprint !== fingerprint) throw new Error('生图设置已变化，请重新准备并查看费用。');
    return item;
  }

  consume(sessionId: string, id: unknown, fingerprint: string) {
    const item = this.inspect(sessionId, id, fingerprint);
    this.pending.delete(item.id); // Never retry an uncertain paid operation.
    return structuredClone(item.args);
  }

  private prune() {
    for (const [id, item] of this.pending) {
      if (this.now() - item.createdAt >= 600_000) this.pending.delete(id);
    }
  }
}
