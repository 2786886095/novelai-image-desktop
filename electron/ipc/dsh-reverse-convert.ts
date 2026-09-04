export type DshImageAiMode = "focused" | "strict";
export type DshImageAiTask = "tavern-image" | "reverse" | "convert";

export const DSH_IMAGE_AI_PROVENANCE = Object.freeze({
  id: "dsh-infinite-gen-3",
  version: "0.5.0",
  sourceRepo: "https://github.com/Minglink/dsh-infinite-gen-3",
  sourceCommit: "d0c43196079849d4501afb3d1a8e195cf808024a",
  sourcePromptSha256: "86385E839813D79C1AB6495B723BEA70BF36B0C55B359FDB18B78C4230C49244",
  license: "MIT",
});

/**
 * Task-scoped adaptation of Infinite Gen 3's execution-first system contract.
 * Deliberately excludes the upstream prompt's unrelated security/runtime topics.
 */
export function buildDshImageAiSystemAddon(
  task: DshImageAiTask,
  mode: DshImageAiMode = "focused",
): string {
  const taskRule = task === "tavern-image"
    ? "Turn the current visual request and any attached references into a concrete NovelAI image proposal. Preserve every explicit subject, identity, pose, framing, camera, background, lighting, palette, material, and style constraint, and obey the existing <langbai-image> proposal contract."
    : task === "reverse"
      ? "Inspect the supplied image directly and reconstruct observable subject, identity, pose, framing, camera, background, lighting, palette, materials, and style as generation-ready prompt tokens. Do not replace visible details with generic prose."
      : "Convert the supplied description directly into generation-ready prompt tokens. Preserve every explicit subject, identity, pose, framing, camera, background, lighting, palette, material, and style constraint.";
  const strictRule = mode === "strict"
    ? "Before answering, silently check that no explicit visual constraint was dropped and that ambiguous prose was converted into concrete visual attributes."
    : "Prefer concise visual fidelity over commentary.";
  return [
    "[Built-in DSH Infinite Gen 3 · scoped image AI adapter]",
    "Treat the current image-prompt task as an execution request. Complete it directly without meta commentary, capability discussion, installation instructions, or unrelated content.",
    taskRule,
    strictRule,
    "The caller's existing output schema is authoritative. Return only that requested schema so the result can be parsed into the positive-prompt field. Never add Markdown fences or explanatory prefixes.",
  ].join("\n");
}

export function injectDshImageAiSystemPrompt(options: {
  task: DshImageAiTask;
  systemPrompt: string;
  enabled?: boolean;
  mode?: DshImageAiMode;
}): string {
  if (options.enabled === false) return options.systemPrompt;
  return [
    buildDshImageAiSystemAddon(options.task, options.mode ?? "focused"),
    options.systemPrompt.trim(),
  ].filter(Boolean).join("\n\n");
}
