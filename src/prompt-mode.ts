import type {
  ModePromptTemplates,
  PromptVariants,
  ReversePromptMode,
  ReversePromptTemplateVersion,
} from "./types";

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

function cleanVariantValue(value: unknown) {
  return cleanPromptOutput(typeof value === "string" ? value : "");
}

function extractLooseJson(text: string): Record<string, unknown> | null {
  const cleaned = (text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
}

function pickFirstString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function parseLabeledVariant(text: string, label: RegExp, stop: RegExp) {
  const match = text.match(label);
  if (!match || match.index === undefined) return "";
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const stopMatch = rest.match(stop);
  return (stopMatch?.index === undefined ? rest : rest.slice(0, stopMatch.index)).trim();
}

export function parsePromptVariantResponse(raw: string, knownCharacter: boolean) {
  if (!knownCharacter) {
    return { primary: cleanPromptOutput(raw) };
  }

  const json = extractLooseJson(raw);
  if (json) {
    const namePrompt = cleanVariantValue(
      pickFirstString(json, ["namePrompt", "characterNamePrompt", "name_version", "character_name_version", "versionA"]),
    );
    const featurePrompt = cleanVariantValue(
      pickFirstString(json, ["featurePrompt", "featureTagPrompt", "feature_version", "tag_version", "versionB"]),
    );
    if (namePrompt || featurePrompt) {
      return {
        primary: namePrompt || featurePrompt,
        variants: { namePrompt, featurePrompt } satisfies PromptVariants,
      };
    }
  }

  const text = (raw ?? "").trim().replace(/^```(?:text|txt|prompt|markdown)?\s*/i, "").replace(/\s*```$/i, "");
  const namePrompt = cleanPromptOutput(
    parseLabeledVariant(
      text,
      /(?:角色名版|角色名版本|namePrompt|name prompt|character name version|version a)\s*[:：-]\s*/i,
      /(?:特征版|特征版本|featurePrompt|feature prompt|feature tag version|version b)\s*[:：-]\s*/i,
    ),
  );
  const featurePrompt = cleanPromptOutput(
    parseLabeledVariant(
      text,
      /(?:特征版|特征版本|featurePrompt|feature prompt|feature tag version|version b)\s*[:：-]\s*/i,
      /(?:角色名版|角色名版本|namePrompt|name prompt|character name version|version a)\s*[:：-]\s*/i,
    ),
  );
  if (namePrompt || featurePrompt) {
    return {
      primary: namePrompt || featurePrompt,
      variants: { namePrompt, featurePrompt } satisfies PromptVariants,
    };
  }

  return { primary: cleanPromptOutput(raw) };
}

export function knownCharacterRuntimeInstruction(
  mode: ReversePromptMode,
  source: "reverse" | "convert",
  knownCharacter: boolean,
  templateVersion: ReversePromptTemplateVersion = "v5",
) {
  // Kept in Chinese to match CONVERT_SYSTEM_PROMPTS / REVERSE_SYSTEM_PROMPTS —
  // mixing languages within one system prompt measurably hurt output quality
  // (the model treated the appended English block as a separate, lower-
  // priority afterthought instead of an integral part of the template).
  const versionLabel = templateVersion === "v4.5" ? "V4.5" : "V5";
  const modeText =
    mode === "natural"
      ? `使用简洁的英文自然语言 NovelAI ${versionLabel} 提示词。`
      : mode === "mixed"
        ? `使用 NovelAI ${versionLabel} 混合提示词：约 80% Danbooru tag + 20% 简短英文自然语言，两部分都不得省略。`
        : `使用简洁的英文逗号分隔 Danbooru / NovelAI ${versionLabel} tag。`;

  if (knownCharacter) {
    const identityRules =
      source === "convert"
        ? [
            "namePrompt：先确认角色与作品，使用规范 Danbooru 角色 Tag；重名角色用作品名括号消歧。角色 Tag 已包含的默认外貌和默认服装不重复，只保留用户明确要求的变化、动作与场景。",
            "featurePrompt：删除全部角色名、作品名和版权 Tag；把每名已确认角色替换为足以辨认的高置信度标志性外貌、默认服装与配饰。若用户指定了换装或外观变化，以用户描述为准，不得再混入默认服装；无法确认的细节不要猜。",
          ]
        : [
            "namePrompt：只有能从图片或用户提示可靠确认时才使用规范角色 Tag；重名角色用作品名括号消歧。角色 Tag 已包含的默认外貌和默认服装不重复，只保留图片中可见的特殊服装、状态、动作与场景。",
            "featurePrompt：删除全部角色名、作品名和版权 Tag；只用图片中可见的外貌、服装与配饰识别每名角色，不调用不可见的角色设定补全画面。",
          ];
    return [
      "已知网络/游戏/动漫角色模式已开启。",
      "本段输出契约高于基础模板中的“只输出一行最终 prompt”：外层只返回 JSON，两个字段值各自仍必须是一行英文 Prompt。",
      "只输出严格 JSON，必须且只能包含这两个字符串字段：namePrompt 和 featurePrompt。",
      `两个字段必须描述同一完整画面，并分别遵守当前模式、NovelAI ${versionLabel} 多人分段、互动、权重、Text: 与个人法典规则；场景、动作、位置、构图、道具和文字必须一致，区别只能是角色身份写法。`,
      ...identityRules,
      "多人时，namePrompt 与 featurePrompt 的角色段数量和顺序必须完全一致，并逐人完成角色 Tag ↔ 特征组替换。",
      modeText,
      source === "reverse"
        ? "如果反推范围是角色，除非需要识别可见的特殊服装或状态，否则不要描述整个场景。"
        : "角色知识只用于确认规范角色 Tag 和生成特征版所需的高置信度标志性特征；不得借此新增用户未要求的动作、场景、表情或道具。",
    ].join("\n");
  }

  return [
    "已知网络/游戏/动漫角色模式已关闭。",
    "不要使用角色名；用最少必要的可见外貌、服装、位置和动作区分角色。",
    modeText,
  ].join("\n");
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

export function hasMixedNaturalLanguage(text: string) {
  const normalized = cleanPromptOutput(text);
  if (!normalized) return false;
  return /\b(?:on the left|on the right|in the middle|at the center|beside|next to|in front of|behind|toward|towards|with (?:his|her|their|its|both)|while|who |offering|receiving|reaching with|looking (?:at|toward)|partly hidden|overlapping)\b/i.test(
    normalized,
  );
}

export function modeUserInstruction(
  mode: ReversePromptMode,
  source: "reverse" | "convert",
  knownCharacter = false,
  templateVersion: ReversePromptTemplateVersion = "v5",
) {
  const versionLabel = templateVersion === "v4.5" ? "V4.5" : "V5";
  const outputContract = knownCharacter
    ? [
        "Return strict JSON only, with exactly two string fields: `namePrompt` and `featurePrompt`; do not add Markdown or any third field.",
        "Each field must contain one complete English prompt line for the same image. Keep scene, action, position, composition, props, text, character count, and character order identical in both fields.",
        source === "convert"
          ? "In namePrompt use verified canonical character tags. In featurePrompt remove all character/copyright names and replace each character with high-confidence signature appearance, outfit, and accessories; explicit user changes override canonical defaults."
          : "In namePrompt use only reliably verified character tags. In featurePrompt remove all character/copyright names and replace each character only with appearance, outfit, and accessories visible in the image.",
      ]
    : ["Return exactly one English prompt line."];
  if (mode === "natural") {
    return [
      `Output mode: natural-language NovelAI ${versionLabel} prompt.`,
      ...outputContract,
      "Use concise English prose, not a comma-separated tag list. Dataset prefixes, numeric weights, and `text, <language> text, Text: ...` are the only syntax exceptions.",
      "For multiple characters use `base scene | A boy/girl ... | A boy/girl ...`; every segment must identify position and action without vague pronouns.",
      source === "convert"
        ? "Convert only the user's stated content."
        : "Describe only visible evidence in the requested scope.",
    ].join("\n");
  }

  if (mode === "mixed") {
    return [
      `Output mode: mixed NovelAI ${versionLabel} prompt.`,
      ...outputContract,
      "Keep approximately 75–85% mature Danbooru/NovelAI tag units and 15–25% concise English natural-language relation phrases. Both parts are mandatory; even a short prompt needs at least one non-invented prose phrase.",
      "Use prose for tag-uncovered position, hand/side, target, depth, overlap, or text placement; never pad the ratio by inventing facts or fully restating existing tags.",
      "Discard retrieved candidates that are not exact matches. Use `base | character 1 | character 2` for multiple people and do not return pure prose.",
    ].join("\n");
  }

  return [
    `Output mode: Danbooru tag prompt for NovelAI ${versionLabel}.`,
    ...outputContract,
    "Use exact mature Danbooru / NovelAI tags once, discard inexact retrieved candidates, and do not add synonym or prose repetitions.",
    "Use comma-separated tags and `base | character 1 | character 2` for multiple people; do not output prose.",
  ].join("\n");
}

export function buildConvertUserText(
  input: string,
  mode: ReversePromptMode,
  hintText = "",
  knownCharacter = false,
  templateVersion: ReversePromptTemplateVersion = "v5",
) {
  const parts = [
    "User description:",
    input.trim(),
    "",
    modeUserInstruction(mode, "convert", knownCharacter, templateVersion),
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
    "Rewrite it as one natural-language NovelAI V5 prompt. Keep all visible objects, positions, roles, and actions clear.",
  ].join("\n");
}

export function modeNeedsRepair(mode: ReversePromptMode, output: string) {
  const cleaned = cleanPromptOutput(output);
  if (!cleaned) return false;
  if (mode === "natural") return isLikelyTagListPrompt(cleaned);
  if (mode === "tags") return isLikelyNaturalLanguagePrompt(cleaned);
  if (isLikelyNaturalLanguagePrompt(cleaned) && !isLikelyTagListPrompt(cleaned)) {
    return true;
  }
  return isLikelyTagListPrompt(cleaned) && !hasMixedNaturalLanguage(cleaned);
}

function normalizedTagToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[-+]?\d+(?:\.\d+)?::/, "")
    .replace(/::$/, "")
    .replace(/[{}\[\]]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PROMPT_CONFLICTS: Array<[string, string]> = [
  ["close-up", "full body"],
  ["close up", "full body"],
  ["upper body", "full body"],
  ["cowboy shot", "upper body"],
  ["cowboy shot", "full body"],
  ["from front", "from behind"],
  ["from above", "from below"],
  ["sitting", "standing"],
];

const MATURE_TAG_DECOMPOSITIONS: Record<string, string[]> = {
  dogeza: ["bowing", "hands on floor", "kneeling on floor"],
  wariza: ["kneeling sit", "kneeling sitting", "sitting on feet"],
  yokozuwari: ["legs to side", "sideways sitting"],
  "cowboy shot": ["upper body", "full body", "medium shot"],
  "dutch angle": ["tilted angle", "tilted composition"],
  "crossed arms": ["arms crossed"],
  "hands behind back": ["arms behind back"],
};

/**
 * Deterministic, deliberately conservative checks. Semantic selection remains
 * the model's job; this validator only flags high-confidence format, duplicate,
 * conflict, and mature-tag decomposition mistakes.
 */
export function promptRuleViolations(
  mode: ReversePromptMode,
  output: string,
  matureTags: string[] = [],
) {
  if (mode === "natural") return [];
  const cleaned = cleanPromptOutput(output);
  if (!cleaned) return [];
  const issues = new Set<string>();
  if (modeNeedsRepair(mode, cleaned)) {
    issues.add(
      mode === "tags"
        ? "输出不是以逗号分隔的 Danbooru Tag 格式"
        : isLikelyNaturalLanguagePrompt(cleaned)
          ? "混合模式输出退化成了纯自然语言，缺少 Tag 主体"
          : "混合模式缺少约 20% 的自然语言关系短语",
    );
  }
  const tokens = cleaned
    .split(/[|,]/)
    .map(normalizedTagToken)
    .filter(Boolean);
  const tokenSet = new Set<string>();
  for (const token of tokens) {
    if (tokenSet.has(token)) issues.add(`重复 Tag：${token}`);
    tokenSet.add(token);
  }
  for (const [left, right] of PROMPT_CONFLICTS) {
    if (tokenSet.has(left) && tokenSet.has(right)) {
      issues.add(`互斥 Tag 同时出现：${left} / ${right}`);
    }
  }
  const candidateSet = new Set(matureTags.map(normalizedTagToken));
  for (const [mature, decompositions] of Object.entries(
    MATURE_TAG_DECOMPOSITIONS,
  )) {
    if (!candidateSet.has(mature) || !tokenSet.has(mature)) continue;
    for (const decomposition of decompositions) {
      if (tokenSet.has(decomposition)) {
        issues.add(`成熟 Tag ${mature} 已完整表达概念，不应再叠加 ${decomposition}`);
      }
    }
  }
  return [...issues];
}

export function promptRuleRepairSystemPrompt(
  mode: ReversePromptMode,
  knownCharacter = false,
  templateVersion: ReversePromptTemplateVersion = "v5",
) {
  const versionLabel = templateVersion === "v4.5" ? "V4.5" : "V5";
  const outputContract = knownCharacter
    ? "只输出严格 JSON，且只能包含 namePrompt 与 featurePrompt 两个字符串字段；两份提示词都必须完成相同检查。"
    : "只输出修复后的单行英文 Prompt，不要解释、标题或 Markdown。";
  return [
    `你是 NovelAI ${versionLabel} 提示词规则校验与定向修复器。不要重新创作画面，只修复明确列出的违规项。`,
    outputContract,
    mode === "tags"
      ? "保持 Danbooru Tag 模式，以英文逗号分隔；多人继续使用 base | character 1 | character 2。"
      : "保持混合模式：约 75–85% Danbooru Tag + 15–25% 简短英文自然语言，两部分都不得省略；不得靠重复或编造凑比例。",
    "成熟整词优先：一个成熟 Tag 已完整表达动作、姿态或构图时，只保留该 Tag 一次，删除拆解词、近义词和重复自然语言；未覆盖的关键差异才允许最少量补充。",
    "候选成熟 Tag 不贴合原始输入时必须舍弃，不能硬套；不得新增原始输入或图片中没有的内容。",
  ].join("\n");
}

export function buildPromptRuleRepairUserText(options: {
  mode: ReversePromptMode;
  originalInput: string;
  draft: string;
  violations: string[];
  matureTags?: string[];
}) {
  return [
    `输出模式：${options.mode}`,
    "原始输入或反推范围：",
    options.originalInput.trim(),
    "待校验 Prompt：",
    options.draft.trim(),
    "程序检测到的违规项：",
    ...options.violations.map((issue, index) => `${index + 1}. ${issue}`),
    options.matureTags?.length
      ? `本地检索到的成熟 Tag 候选（仅精确贴合时使用）：${options.matureTags.join(", ")}`
      : "本次没有可靠成熟 Tag 候选，请采用最短基础组合。",
    "只修复上述问题并执行最终去重、互斥检查；保留其余正确内容。",
  ].join("\n\n");
}

export function modeRepairSystemPrompt(
  mode: ReversePromptMode,
  templateVersion: ReversePromptTemplateVersion = "v5",
) {
  const versionLabel = templateVersion === "v4.5" ? "V4.5" : "V5";
  if (mode === "natural") return naturalRepairSystemPrompt();
  if (mode === "tags") {
    return [
      "You rewrite failed NovelAI prompts into Danbooru / NovelAI tag prompt format.",
      "Return exactly one English prompt line, no explanation.",
      "Use comma-separated tags. Do not output pure prose sentences.",
      `For two or more characters, use NovelAI ${versionLabel} pipe format: base tags | character tags 1 | character tags 2.`,
      "Use tag-style character segments such as: boy, short black hair, white shirt, sitting, drawing.",
      "Match this style:",
      "2boys, classroom, desks, chairs, sketchbook, colored balls, full body, from front | boy, short black hair, white shirt, sitting, drawing, holding pencil | boy, blue hair, dark blue hoodie, standing, juggling balls",
    ].join("\n");
  }
  return [
    `You rewrite failed NovelAI prompts into mixed NovelAI ${versionLabel} prompt format.`,
    "Return exactly one English prompt line, no explanation.",
    "Use approximately 75–85% Danbooru tag units and 15–25% concise English natural-language relation phrases; both are mandatory.",
    "Do not output pure prose or a pure tag list, and do not invent or repeat facts merely to pad the ratio.",
    `For two or more characters, use NovelAI ${versionLabel} pipe format: base tags and short scene clause | character tags 1 | character tags 2.`,
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
