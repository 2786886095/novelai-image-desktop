import type { AgentMessage, TavernImageProposal } from "../agent/types";

export interface ImagePromptContinuity {
  baseImageId?: string;
  previousPrompt?: string;
  suggestedPrompt?: string;
  reviewRequired: boolean;
  changes: Array<{ from: string; to: string }>;
}

export const IMAGE_CONTINUITY_INSTRUCTION = `Image revision contract (application-owned):
The separate <langbai-image-state> is the authoritative CURRENT image, even after chat summarization. Older image blocks are history, not the current state.
For an edit of that image, output <langbai-image> JSON with baseImageId equal to its imageId and promptPatch:{replacements:[{from:"exact existing substring",to:"replacement"}],append:["new prompt fragment"]}. Do not rewrite positivePrompt for an edit. Empty replacements/append preserve the prompt exactly (e.g. size-only edits).
Only replace or delete something explicitly changed by the latest user request. Preserve established clothing, appearance, characters, style-independent details and all unrelated requirements. Do not silently abbreviate or paraphrase old requirements. from must occur exactly once; use a longer exact fragment to disambiguate. An empty to explicitly removes that fragment. append contains only new details.
For the first image or an explicitly requested NEW scene/composition instead of revising the existing image, output promptMode:"new" and the full positivePrompt. Never use new merely because the conversation is long or the user adds background, light, pose or clothing details.
The other image parameter rules still apply: only explicit numerical overrides; never author stylePrompt or negativePrompt. Keep all machine blocks private. Ordinary chat has no image block.`;

export function latestImageState(messages: AgentMessage[], characterId?: string, beforeMessageId?: string, resetAt?: string): TavernImageProposal | undefined {
  const end = beforeMessageId ? messages.findIndex((m) => m.id === beforeMessageId) : -1;
  const history = end >= 0 ? messages.slice(0, end) : messages;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]; const p = m.imageProposal;
    if (m.status !== "complete" || (characterId && m.characterId && m.characterId !== characterId)) continue;
    if (resetAt && p && p.createdAt <= resetAt) continue;
    if (p?.positivePrompt.trim() && !p.continuity?.reviewRequired && !["cancelled", "error"].includes(p.status)) return p;
  }
  return undefined;
}

export function imageStateContext(base?: TavernImageProposal): string {
  return IMAGE_CONTINUITY_INSTRUCTION + "\n<langbai-image-state>" + JSON.stringify(base ? { imageId: base.id, positivePrompt: base.positivePrompt } : null) + "</langbai-image-state>";
}

/** Atomic literal patches: no normalization, LLM merge or summary can erase untouched bytes. */
export function resolveImagePrompt(raw: Record<string, unknown>, base?: TavernImageProposal): { positivePrompt: string; continuity: ImagePromptContinuity } {
  const candidate = typeof raw.positivePrompt === "string" ? raw.positivePrompt : "";
  const unchanged: ImagePromptContinuity = { ...(base ? { baseImageId: base.id, previousPrompt: base.positivePrompt } : {}), reviewRequired: false, changes: [] };
  const hold = () => ({ positivePrompt: base?.positivePrompt ?? candidate, continuity: { ...unchanged, reviewRequired: true, ...(candidate.trim() ? { suggestedPrompt: candidate } : {}) } });
  if (!base) return { positivePrompt: candidate, continuity: { ...unchanged, reviewRequired: !candidate.trim() || raw.promptPatch !== undefined } };
  if (raw.promptMode === "new" && candidate.trim() && raw.promptPatch === undefined) {
    return hold(); // A model cannot reset an established image without user confirmation.
  }
  if (raw.promptPatch === undefined) {
    return candidate === base.positivePrompt ? { positivePrompt: candidate, continuity: unchanged } : hold();
  }
  if (raw.baseImageId !== base.id || !raw.promptPatch || typeof raw.promptPatch !== "object" || Array.isArray(raw.promptPatch)) return hold();
  const patch = raw.promptPatch as Record<string, unknown>;
  if (!Array.isArray(patch.replacements) || !Array.isArray(patch.append) || patch.replacements.length + patch.append.length > 64) return hold();
  let prompt = base.positivePrompt;
  const changes: ImagePromptContinuity["changes"] = [];
  for (const op of patch.replacements) {
    if (!op || typeof op !== "object" || typeof op.from !== "string" || !op.from || typeof op.to !== "string" || op.to.length > 100_000) return hold();
    const at = prompt.indexOf(op.from);
    if (at < 0 || prompt.indexOf(op.from, at + 1) >= 0) return hold();
    prompt = prompt.slice(0, at) + op.to + prompt.slice(at + op.from.length);
    changes.push({ from: op.from, to: op.to });
  }
  for (const fragment of patch.append) {
    if (typeof fragment !== "string" || !fragment.trim() || fragment.length > 100_000) return hold();
    prompt += (prompt.trim() ? ", " : "") + fragment;
    changes.push({ from: "", to: fragment });
  }
  if (!prompt.trim() || prompt.length > 100_000) return hold();
  return { positivePrompt: prompt, continuity: { ...unchanged, changes } };
}

export function selectImageSwipe(message: AgentMessage, index: number): void {
  const current = message.swipeIndex ?? Math.max(0, (message.swipes?.length ?? 1) - 1);
  const snapshots = message.imageProposalSwipes ?? Array.from({ length: message.swipes?.length ?? 0 }, () => null);
  snapshots[current] = message.imageProposal ? structuredClone(message.imageProposal) : null;
  message.imageProposalSwipes = snapshots;
  const images = message.swipeAttachments ?? Array.from({ length: message.swipes?.length ?? 0 }, () => []);
  images[current] = structuredClone(message.attachments);
  message.swipeAttachments = images;
  message.attachments = structuredClone(images[index] ?? []);
  message.swipeIndex = index;
  message.imageProposal = snapshots[index] ? structuredClone(snapshots[index]!) : undefined;
}
