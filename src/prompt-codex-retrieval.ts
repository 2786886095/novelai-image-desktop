import promptCodexSnapshot from "./data/prompt-codex.json";
import guidanceSnapshot from "../skills/novelai-prompt-codex/references/guidance.json";
import type { PromptCodexMatch } from "./types";

export type PromptCodexMode = "convert" | "reverse";

export type MatureTagCandidate = {
  tag: string;
  description?: string;
  count?: number;
  source?: string;
};

type GuidanceEntry = {
  id: string;
  title: string;
  category: string;
  keywords: string[];
  text: string;
  adult: boolean;
  modes: PromptCodexMode[];
  source: string;
};

type CodexEntry = {
  id: string;
  bookId: string;
  section: string;
  category: string;
  title: string;
  prompt: string;
  adult: boolean;
  sourceUrl: string;
};

type CodexBook = {
  id: string;
  title: string;
  adult: boolean;
};

const guidanceEntries = guidanceSnapshot.entries as GuidanceEntry[];
const codexEntries = promptCodexSnapshot.entries as CodexEntry[];
const bookNames = new Map(
  (promptCodexSnapshot.books as CodexBook[]).map((book) => [book.id, book.title]),
);

const ADULT_RELEVANCE = [
  "成人",
  "性爱",
  "性交",
  "裸体",
  "裸露",
  "乳头",
  "阴部",
  "内裤",
  "内衣",
  "丝袜",
  "连裤袜",
  "破损连裤袜",
  "大腿袜",
  "半脱",
  "提裙",
  "诱惑",
  "淫荡",
  "高潮",
  "口交",
  "自慰",
  "后入",
  "骑乘",
  "nsfw",
  "nude",
  "naked",
  "nipples",
  "pussy",
  "panties",
  "underwear",
  "pantyhose",
  "thighhighs",
  "sex",
  "fellatio",
  "masturbation",
  "orgasm",
  "doggystyle",
  "cowgirl",
  "seductive",
  "lewd",
];

const ALWAYS_GUIDANCE = new Set([
  "core-output",
  "canonical-tag-priority",
  "conflict-check",
]);

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTerms(value: string): string[] {
  const text = normalize(value);
  const terms = new Set<string>();
  for (const word of text.match(/[a-z0-9#]+/g) ?? []) {
    if (word.length >= 2) terms.add(word);
  }
  for (const run of text.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    if (run.length <= 6) terms.add(run);
    for (let size = 2; size <= Math.min(4, run.length); size += 1) {
      for (let index = 0; index + size <= run.length; index += 1) {
        terms.add(run.slice(index, index + size));
      }
    }
  }
  return [...terms].slice(0, 180);
}

function containsRelevant(text: string, triggers: string[]): boolean {
  const normalized = normalize(text);
  return triggers.some((trigger) => normalized.includes(normalize(trigger)));
}

function scoreText(query: string, terms: string[], fields: string[]): number {
  const normalizedFields = fields.map(normalize);
  const joined = normalizedFields.join("\n");
  let score = 0;
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length >= 3 && joined.includes(normalizedQuery)) score += 60;
  for (const term of terms) {
    if (!joined.includes(term)) continue;
    score += /[\p{Script=Han}]/u.test(term)
      ? Math.min(12, term.length * 3)
      : Math.min(8, Math.max(2, term.length / 2));
    if (normalizedFields[0]?.includes(term)) score += 4;
    if (normalizedFields[1]?.includes(term)) score += 3;
  }
  return score;
}

function excerpt(value: string, limit = 260): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length <= limit ? cleaned : `${cleaned.slice(0, limit - 1)}…`;
}

export function retrievePromptCodex(
  query: string,
  options: {
    mode: PromptCodexMode;
    allowAdult: boolean;
    guidanceLimit?: number;
    codexLimit?: number;
  },
): PromptCodexMatch[] {
  const terms = queryTerms(query);
  const adultRelevant = options.allowAdult && containsRelevant(query, ADULT_RELEVANCE);
  const guidanceLimit = options.guidanceLimit ?? 6;
  const codexLimit = options.codexLimit ?? 5;

  const guidance = guidanceEntries
    .filter((entry) => entry.modes.includes(options.mode))
    .filter((entry) => !entry.adult || adultRelevant)
    .map((entry) => {
      const keywordScore = entry.keywords.reduce(
        (total, keyword) =>
          normalize(query).includes(normalize(keyword)) ? total + 24 : total,
        0,
      );
      const score =
        scoreText(query, terms, [entry.title, entry.category, ...entry.keywords]) +
        keywordScore +
        (ALWAYS_GUIDANCE.has(entry.id) ? 12 : 0);
      return { entry, score };
    })
    .filter(({ entry, score }) => ALWAYS_GUIDANCE.has(entry.id) || score >= 10)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, guidanceLimit)
    .map(({ entry, score }): PromptCodexMatch => ({
      id: `guidance:${entry.id}`,
      title: entry.title,
      section: entry.category,
      source: entry.source,
      excerpt: entry.text,
      adult: entry.adult,
      score,
    }));

  const codex = codexEntries
    .filter((entry) => !entry.adult || adultRelevant)
    .filter((entry) => entry.category !== "artist")
    .map((entry) => ({
      entry,
      score: scoreText(query, terms, [
        entry.title,
        entry.section,
        entry.category,
        entry.prompt,
      ]),
    }))
    .filter(({ score }) => score >= 18)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, codexLimit)
    .map(({ entry, score }): PromptCodexMatch => ({
      id: `codex:${entry.id}`,
      title: entry.title,
      section: entry.section,
      source: bookNames.get(entry.bookId) ?? "NovelAI 个人法典",
      excerpt: excerpt(entry.prompt),
      adult: entry.adult,
      score,
    }));

  return [...guidance, ...codex];
}

export function formatPromptCodexContext(matches: PromptCodexMatch[]): string {
  if (matches.length === 0) return "";
  const mature = matches.filter((match) => match.section === "mature-tag");
  const references = matches.filter((match) => match.section !== "mature-tag");
  return [
    "【最高优先级：成熟整词】先判断下列成熟 Tag 是否能完整概括动作、姿态或构图。能用一个成熟 Tag 准确表达时，只使用该 Tag 一次，禁止再叠加它的拆解词、近义词或自然语言复述。只有单 Tag 缺少关键差异时，才用最少必要 Tag 补足。候选不贴合时必须舍弃，禁止硬套。",
    ...(mature.length
      ? [
          "本地 Danbooru 成熟 Tag 候选：",
          ...mature.map(
            (match, index) =>
              `${index + 1}. ${match.title}${match.excerpt ? ` — ${match.excerpt}` : ""}`,
          ),
        ]
      : ["本次未命中可靠的本地成熟 Tag；请使用最短、无同义重复的基础组合。"]),
    "以下是本地 NovelAI 提示词法典按当前内容检索出的参考。它们只用于校正结构、补充准确 Tag 与避免冲突；不要无条件复制，不要加入画面中不存在的内容：",
    ...references.map(
      (match, index) =>
        `${index + 1}. [${match.title}｜${match.source}] ${match.excerpt}`,
    ),
  ].join("\n");
}

export function buildPromptCodexEnhancement(
  query: string,
  mode: PromptCodexMode,
  allowAdult: boolean,
  matureTags: MatureTagCandidate[] = [],
): { matches: PromptCodexMatch[]; context: string } {
  const seen = new Set<string>();
  const matureMatches = matureTags
    .filter((candidate) => {
      const key = normalize(candidate.tag);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12)
    .map((candidate, index): PromptCodexMatch => ({
      id: `danbooru:${candidate.tag}`,
      title: candidate.tag.replace(/_/g, " "),
      section: "mature-tag",
      source: candidate.source ?? "本地 Danbooru 标签库",
      excerpt: [
        candidate.description?.trim(),
        candidate.count ? `使用量 ${candidate.count}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      adult: false,
      score: 1000 - index,
    }));
  const matches = [
    ...matureMatches,
    ...retrievePromptCodex(query, { mode, allowAdult }),
  ];
  return { matches, context: formatPromptCodexContext(matches) };
}
