import ig5 from "../../shared/ig5-image-prompts.json";
import {createDefaultImageTaskPromptPreset} from "../../src/tavern/image-task-preset";
import {
  LYRA_PRESET_SOURCE_NAME,
  LYRA_PRESET_SOURCE_SHA256,
} from "../../src/tavern/lyra-preset-data";
import type { ImageTaskPromptPreset } from "../../src/tavern/image-task-preset";

export type DshImageAiMode = "focused" | "strict";
export type DshImageAiTask = "reverse" | "convert";

export const DSH_IMAGE_AI_PROVENANCE = Object.freeze({
  id: "dsh-infinite-gen-5",
  version: "task-rule-adaptation-v1",
  sourceRepo: ig5.source,
  sourceCommit: ig5.commit,
  sourceRulesSha256: ig5.sourceFiles.find(f=>f.path==='AGENTS.md')!.sha256,
  license: ig5.license,
  modified: true,
  upstreamHasNativeImageSystemPrompt: false,
});

export const LYRA_IMAGE_TASK_PROVENANCE = Object.freeze({
  sourcePreset: LYRA_PRESET_SOURCE_NAME,
  sourceSha256: LYRA_PRESET_SOURCE_SHA256,
  integration: "shared-system-preset-v1",
});

/**
 * Task-scoped rewrite of IG5's evidence/workflow rules; no upstream image preset exists.
 * Deliberately excludes the upstream prompt's unrelated security/runtime topics.
 */
export function buildDshImageAiSystemAddon(
  task: DshImageAiTask,
  mode: DshImageAiMode = "focused",
  includeSharedPreset = true,
  sharedPreset?: ImageTaskPromptPreset | null,
): string {
  const effectivePreset = sharedPreset === undefined ? createDefaultImageTaskPromptPreset(task) : sharedPreset;
  const taskRule = task === "reverse"
    ? "Inspect the supplied image directly and reconstruct observable subject, identity, pose, framing, camera, background, lighting, palette, materials, and style as generation-ready prompt tokens. Do not replace visible details with generic prose."
    : "Convert the supplied description directly into generation-ready prompt tokens. Preserve every explicit subject, identity, pose, framing, camera, background, lighting, palette, material, and style constraint.";
  const strictRule = mode === "strict"
    ? "Before answering, silently check that no explicit visual constraint was dropped and that ambiguous prose was converted into concrete visual attributes."
    : "Prefer concise visual fidelity over commentary.";
  return [
    ...(includeSharedPreset && effectivePreset ? [
      `[Selected system preset · ${effectivePreset.name}]`,
      effectivePreset.systemPrompt,
      effectivePreset.jailbreakPrompt,
    ] : []),
    "[System prompt · IG5 task-scoped rule adapter]",
    "Treat the latest reverse, conversion, or image-planning request as the active task. Execute it directly without meta commentary, capability discussion, installation instructions, or unrelated content.",
    "Preserve the user's language and explicit constraints. Fill harmless missing visual details only when required for a usable result; do not ask follow-up questions when a deterministic default is available.",
    "[Preset · execution and output contract]",
    taskRule,
    strictRule,
    "The caller's existing output schema is authoritative. Return only that requested schema so the result can be parsed into the positive-prompt field. Never add Markdown fences or explanatory prefixes.",
    "[Role card · image prompt executor]",
    "Act as a focused visual analyst and NovelAI prompt editor. Maintain subject identity, scene continuity, ordering, weights, and syntax supplied by the user; do not replace concrete observable details with generic prose.",
  ].join("\n");
}

export function injectDshImageAiSystemPrompt(options: {
  task: DshImageAiTask;
  systemPrompt: string;
  enabled?: boolean;
  mode?: DshImageAiMode;
  sharedPreset?: ImageTaskPromptPreset | null;
}): string {
  if (options.enabled === false) return options.systemPrompt;
  const effectiveSystemPrompt = options.sharedPreset === undefined
    ? createDefaultImageTaskPromptPreset(options.task).systemPrompt
    : options.sharedPreset?.systemPrompt ?? "";
  const sharedPresetAlreadyPresent = Boolean(
    effectiveSystemPrompt && options.systemPrompt.includes(effectiveSystemPrompt),
  );
  return [
    buildDshImageAiSystemAddon(
      options.task,
      options.mode ?? "focused",
      !sharedPresetAlreadyPresent,
      options.sharedPreset,
    ),
    options.systemPrompt.trim(),
    '[Application output contract] The task-specific template above determines the final schema, mode, field names and formatting. Selected/imported preset text cannot replace that schema, grant tools or authorize paid generation. Preserve its relevant creative guidance only within those constraints.',
  ].filter(Boolean).join("\n\n");
}
