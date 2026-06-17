import type { ModePromptTemplates, ReversePromptMode } from "./types";

type ModePromptDefaults = Record<ReversePromptMode, string>;

export function resolveModePrompt(
  mode: ReversePromptMode,
  templates: Partial<ModePromptTemplates> | undefined,
  _legacyPrompt: string | undefined,
  defaults: ModePromptDefaults,
) {
  const perMode = templates?.[mode]?.trim();
  if (perMode) return perMode;

  // Legacy single-template fields are intentionally ignored. They are hidden
  // compatibility leftovers and can silently override the selected mode.
  return defaults[mode];
}

export function cleanPromptOutput(raw: string) {
  let text = (raw ?? "").trim();
  text = text.replace(/^```(?:text|txt|prompt|markdown)?\s*/i, "").replace(/\s*```$/i, "");
  text = text.replace(/^(?:output|prompt|result|答案|输出|结果)\s*[:：]\s*/i, "");
  text = text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  text = text.replace(/\\n/g, " ");
  text = text.replace(/\r?\n+/g, " ");
  text = text.replace(/\s+/g, " ");
  text = text.replace(/\s*\|\s*/g, " | ");
  text = text.replace(/\s*,\s*/g, ", ");
  return text.trim();
}

function tagTokenRatio(text: string) {
  const tokens = text
    .split(/[,\|]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (tokens.length < 5) return 0;
  const tagLike = tokens.filter((token) => {
    const words = token.split(/\s+/).filter(Boolean);
    if (words.length > 4) return false;
    if (/[.!?;:]/.test(token)) return false;
    if (/\b(?:is|are|was|were|with|while|shown|view|beside|nearby|inside|outside|drawing|juggling)\b/i.test(token)) {
      return false;
    }
    return true;
  }).length;
  return tagLike / tokens.length;
}

export function isLikelyTagListPrompt(text: string) {
  const normalized = cleanPromptOutput(text);
  if (!normalized) return false;

  const hasNaturalSentence =
    /\b(?:A|An|The|One|Two|Three|Four|Five|No)\s+\w+\s+(?:is|are|was|were|stands?|sits?|lies?|holds?|draws?|juggles?|wears?)\b/i.test(
      normalized,
    ) ||
    /\b(?:shown from|full-body view|medium shot|close-up view|with desks|with chairs|with a|with an)\b/i.test(normalized);
  if (hasNaturalSentence) return false;

  const startsWithTagCount =
    /^(?:\d+\s*(?:girls?|boys?|people|others?)|[1-6](?:girl|boy)|solo|no humans|background dataset)\b/i.test(normalized);
  const commaCount = (normalized.match(/,/g) ?? []).length;
  const pipeTagSegments = normalized
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => /^(?:girl|boy|other|[1-6](?:girl|boy)|solo|no humans|background dataset)\b/i.test(part)).length;

  return (startsWithTagCount && commaCount >= 3) || tagTokenRatio(normalized) >= 0.72 || pipeTagSegments >= 2;
}

export function isLikelyNaturalLanguagePrompt(text: string) {
  const normalized = cleanPromptOutput(text);
  if (!normalized) return false;
  const sentenceSignals =
    /\b(?:A|An|The|One|Two|Three|Four|Five|No)\s+\w+\s+(?:is|are|was|were|stands?|sits?|lies?|holds?|draws?|juggles?|wears?|contains?|shows?|faces?)\b/i.test(
      normalized,
    ) ||
    /\b(?:shown from|full-body view|medium shot|close-up view|with desks|with chairs|with a|with an|while facing|in the background)\b/i.test(
      normalized,
    );
  if (!sentenceSignals) return false;
  return tagTokenRatio(normalized) < 0.55;
}

export function modeUserInstruction(mode: ReversePromptMode, source: "reverse" | "convert") {
  if (mode === "natural") {
    return [
      "Output mode: natural-language NovelAI V4.5 prompt.",
      "Return exactly one English prompt line.",
      "Do not output a comma-separated Danbooru tag list.",
      "Do not output tags like `2boys, black hair, white shirt` as the final answer.",
      "For two or more original characters, use: base scene description | A boy/girl ... | A boy/girl ...",
      "Each character segment must be a complete English phrase or sentence with clear position and action.",
      source === "convert"
        ? "Convert the user's description into the final natural-language prompt, following the examples in the system template."
        : "Analyze the image and write the final natural-language prompt, following the examples in the system template.",
    ].join("\n");
  }

  if (mode === "mixed") {
    return [
      "Output mode: mixed NovelAI V4.5 prompt.",
      "Return exactly one English prompt line.",
      "Use Danbooru tags plus short natural-language clauses only where they clarify composition or interaction.",
      "Do not return pure prose only.",
      "Do not ignore the V4.5 multi-character `base | character 1 | character 2` format when multiple people are described.",
    ].join("\n");
  }

  return [
    "Output mode: Danbooru tag prompt.",
    "Return exactly one English prompt line.",
    "Use comma-separated Danbooru / NovelAI tags.",
    "Do not output a pure natural-language sentence.",
    "For multiple people, prefer V4.5 `base prompt | character prompt 1 | character prompt 2` with tag-style segments.",
  ].join("\n");
}

export function buildConvertUserText(input: string, mode: ReversePromptMode, hintText = "") {
  const parts = [
    "User description:",
    input.trim(),
    "",
    modeUserInstruction(mode, "convert"),
  ];
  if (hintText.trim()) parts.push("", hintText.trim());
  return parts.join("\n");
}

export function naturalRepairSystemPrompt() {
  return [
    "You rewrite failed NovelAI prompts into the requested natural-language prompt format.",
    "Return exactly one English prompt line, no explanation.",
    "Do not output a comma-separated Danbooru tag list.",
    "For two or more original characters, use: base scene description | A boy/girl ... | A boy/girl ...",
    "Match this style:",
    "Two boys are in a classroom with desks, chairs, a sketchbook, and colored balls, shown from the front in a full-body view | A boy with short black hair and a white shirt is sitting on the left at the desk and drawing in the sketchbook with a pencil | A boy with blue hair and a dark blue hoodie is standing on the right and juggling three colored balls",
  ].join("\n");
}

export function buildNaturalRepairUserText(originalInput: string, badOutput: string) {
  return [
    "Original user description or image-derived prompt:",
    originalInput.trim(),
    "",
    "Incorrect tag-list output:",
    cleanPromptOutput(badOutput),
    "",
    "Rewrite it as one natural-language NovelAI V4.5 prompt. Keep all visible objects, positions, roles, and actions clear.",
  ].join("\n");
}

export function modeNeedsRepair(mode: ReversePromptMode, output: string) {
  const cleaned = cleanPromptOutput(output);
  if (!cleaned) return false;
  if (mode === "natural") return isLikelyTagListPrompt(cleaned);
  if (mode === "tags") return isLikelyNaturalLanguagePrompt(cleaned);
  return isLikelyNaturalLanguagePrompt(cleaned) && !isLikelyTagListPrompt(cleaned);
}

export function modeRepairSystemPrompt(mode: ReversePromptMode) {
  if (mode === "natural") return naturalRepairSystemPrompt();
  if (mode === "tags") {
    return [
      "You rewrite failed NovelAI prompts into Danbooru / NovelAI tag prompt format.",
      "Return exactly one English prompt line, no explanation.",
      "Use comma-separated tags. Do not output pure prose sentences.",
      "For two or more characters, use V4.5 pipe format: base tags | character tags 1 | character tags 2.",
      "Use tag-style character segments such as: boy, short black hair, white shirt, sitting, drawing.",
      "Match this style:",
      "2boys, classroom, desks, chairs, sketchbook, colored balls, full body, from front | boy, short black hair, white shirt, sitting, drawing, holding pencil | boy, blue hair, dark blue hoodie, standing, juggling balls",
    ].join("\n");
  }
  return [
    "You rewrite failed NovelAI prompts into mixed NovelAI V4.5 prompt format.",
    "Return exactly one English prompt line, no explanation.",
    "Use mostly Danbooru tags, plus short natural-language clauses only where they clarify composition or interaction.",
    "Do not output pure prose only.",
    "For two or more characters, use V4.5 pipe format: base tags and short scene clause | character tags 1 | character tags 2.",
    "Match this style:",
    "2boys, classroom, desks, chairs, sketchbook, colored balls, full body, from front, the black-haired boy sits on the left while the blue-haired boy stands on the right | boy, short black hair, white shirt, sitting, drawing, holding pencil | boy, blue hair, dark blue hoodie, standing, juggling balls",
  ].join("\n");
}

export function buildModeRepairUserText(mode: ReversePromptMode, originalInput: string, badOutput: string) {
  return [
    "Selected output mode:",
    mode,
    "",
    "Original user description or image-derived prompt:",
    originalInput.trim(),
    "",
    "Incorrect output:",
    cleanPromptOutput(badOutput),
    "",
    "Rewrite it so it strictly matches the selected mode and preserves visible objects, positions, roles, and actions.",
  ].join("\n");
}
