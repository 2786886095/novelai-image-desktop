import type { AgentConversation, AgentTokenUsage, TavernImageProposal } from '../agent/types';
import { imageStateContext, resolveImagePrompt } from './image-continuity';
import { parseLangbaiImageProposal } from './prompt';

const IMAGE_FIELDS = ['positivePrompt', 'promptMode', 'baseImageId', 'promptPatch', 'scene', 'scenePatch'] as const;

/** Call only on initial disk recovery, never while an in-memory request is active. */
export function recoverInterruptedImageRepairs(conversation: AgentConversation): boolean {
  let changed = false;
  for (const message of conversation.messages) {
    const proposal = message.imageProposal;
    if (proposal?.continuity?.repairStatus !== 'repairing') continue;
    proposal.continuity.repairStatus = 'failed';
    proposal.continuity.reviewRequired = true;
    proposal.status = 'pending';
    message.status = 'complete';
    changed = true;
  }
  if (changed) conversation.status = 'idle';
  return changed;
}

/** Retry the output contract once, not the generation. Never accept a full rewrite as a patch. */
export async function repairImagePrompt(options: {
  raw: Record<string, unknown>; base?: TavernImageProposal; model?: string; signal: AbortSignal;
  request: (instruction: string, controller: AbortController) => Promise<{ content: string; usage?: AgentTokenUsage }>;
  onStart?: () => void; timeoutMs?: number;
}): Promise<{ raw: Record<string, unknown>; state: 'unchanged' | 'repaired' | 'failed'; usage?: AgentTokenUsage }> {
  const { raw, base, signal } = options;
  signal.throwIfAborted();
  if (!resolveImagePrompt(raw, base, options.model).continuity.reviewRequired) return { raw, state: 'unchanged' };
  const controller = new AbortController();
  const stop = () => controller.abort(signal.reason);
  signal.addEventListener('abort', stop, { once: true });
  let rejectAbort!: (reason: unknown) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const rejectStopped = () => rejectAbort(controller.signal.reason ?? new Error('REPAIR_STOPPED'));
  controller.signal.addEventListener('abort', rejectStopped, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('REPAIR_TIMEOUT')), options.timeoutMs ?? 45_000);
  try {
    options.onStart?.();
    const instruction = `Repair only the machine-readable image block from your last reply. The application rejected its revision format. Return exactly one <langbai-image> JSON block, without narration.
${imageStateContext(base, options.model)}
Apply only changes explicitly requested in the latest ORIGINAL user message above. Keep every unrelated requirement; do not use the rejected full candidate to infer permission to delete tags. An ordinary request to generate again is not permission to reset the scene. Do not alter image parameters, stylePrompt or negativePrompt.
${base?.scene ? 'Return baseImageId plus scenePatch with exact revision and before objects. Never rewrite scene, change locked fields, or rebind identities.' : base ? 'Return baseImageId plus promptPatch:{replacements:[],append:[]}; replace only unique literal substrings. Never return a full positivePrompt or promptMode:new.' : 'Return a valid first image block following the scene schema above when the selected model supports it.'}
If no change was requested, use an empty patch. If a requested change is ambiguous or conflicts with locked data, return no image block rather than inventing a replacement.`;
    const response = await Promise.race([options.request(instruction, controller), aborted]);
    signal.throwIfAborted();
    const candidate = parseLangbaiImageProposal(response.content).proposal;
    if (!candidate) return { raw, state: 'failed', usage: response.usage };
    // A formatting retry must not overwrite right-panel parameters or earlier explicit overrides.
    const merged = { ...raw };
    for (const key of IMAGE_FIELDS) {
      delete merged[key];
      if (Object.hasOwn(candidate, key)) merged[key] = candidate[key];
    }
    const checked = resolveImagePrompt(merged, base, options.model);
    return !checked.continuity.reviewRequired && checked.positivePrompt.trim()
      ? { raw: merged, state: 'repaired', usage: response.usage }
      : { raw, state: 'failed', usage: response.usage };
  } catch {
    signal.throwIfAborted();
    return { raw, state: 'failed' };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
    controller.signal.removeEventListener('abort', rejectStopped);
  }
}

export function combineImageTurnUsage(first?: AgentTokenUsage, repair?: AgentTokenUsage): AgentTokenUsage | undefined {
  if (!first && !repair) return undefined;
  const sum = (key: keyof AgentTokenUsage) => Number(first?.[key] ?? 0) + Number(repair?.[key] ?? 0);
  return {
    input: sum('input'), output: sum('output'), reasoning: sum('reasoning'),
    cacheRead: sum('cacheRead'), cacheWrite: sum('cacheWrite'), total: sum('total'),
    ...(first?.cost !== undefined || repair?.cost !== undefined ? { cost: sum('cost') } : {}),
    ...(!first || !repair || first.estimated || repair.estimated ? { estimated: true } : {}),
  };
}
