// Prompt standardization ("提示词标准化"), modeled on common NovelAI tag hygiene
// (see https://docs.novelai.net/en/image/ ). Tags are comma-separated; the
// weight syntax `{}` / `[]` and grouping `()` are part of NovelAI's prompt
// language and are preserved. Optional "wildcard" groups (anything containing a
// `|`, plus `${...}` / `<...>`) are shielded from every transform.

export interface NormalizeOptions {
  /** lower-case everything (Danbooru tags are conventionally lower-case) */
  lowercase: boolean;
  /** convert full-width punctuation（，。；：（）） to half-width */
  halfWidthPunct: boolean;
  /** strip decorative brackets 【】「」『』《》 — keeps NovelAI {} [] () */
  stripDecorative: boolean;
  /** underscores → spaces (blue_eyes → blue eyes) */
  underscoreToSpace: boolean;
  /** newlines → commas so multi-line input becomes one tag list */
  newlineToComma: boolean;
  /** drop duplicate tags (case-insensitive, keeps first occurrence) */
  dedupe: boolean;
  /** remove common quality / artist booster prefixes */
  stripQualityPrefix: boolean;
  /** remove non-ASCII characters (e.g. leftover Chinese) */
  stripNonAscii: boolean;
  /** protect wildcard groups like {a|b|c}, [a|b], ${x}, <lora> */
  keepWildcards: boolean;
}

export const DEFAULT_NORMALIZE_OPTIONS: NormalizeOptions = {
  lowercase: true,
  halfWidthPunct: true,
  stripDecorative: true,
  underscoreToSpace: true,
  newlineToComma: true,
  dedupe: true,
  stripQualityPrefix: true,
  stripNonAscii: true,
  keepWildcards: true,
};

// Common quality / aesthetic / artist booster tokens that add no descriptive
// value to a NovelAI prompt and are usually safe to drop.
const QUALITY_TAGS = new Set([
  "masterpiece",
  "best quality",
  "high quality",
  "highest quality",
  "ultra quality",
  "very aesthetic",
  "aesthetic",
  "absurdres",
  "highres",
  "high resolution",
  "ultra-detailed",
  "ultra detailed",
  "extremely detailed",
  "detailed",
  "8k",
  "4k",
  "best aesthetic",
  "amazing quality",
  "very detailed",
  "official art",
]);

const WILDCARD_RE = /\{[^{}]*\|[^{}]*\}|\[[^[\]]*\|[^[\]]*\]|\$\{[^}]*\}|<[^>]+>/g;

export function normalizePrompt(input: string, opts: NormalizeOptions): string {
  if (!input.trim()) return "";
  let text = input;

  // 1. Shield wildcard groups behind placeholders so no transform touches them.
  // Sentinel is pure ASCII, lower-case, no comma/underscore/whitespace, so it
  // survives every option (strip-non-ascii, lowercase, split, dedupe…).
  const shielded: string[] = [];
  if (opts.keepWildcards) {
    text = text.replace(WILDCARD_RE, (m) => {
      shielded.push(m);
      return ` @@wc${shielded.length - 1}@@ `;
    });
  }

  // 2. Whole-string transforms.
  if (opts.newlineToComma) text = text.replace(/[\r\n]+/g, ", ");
  if (opts.halfWidthPunct) {
    text = text
      .replace(/[，、､]/g, ",")
      .replace(/[。．]/g, ".")
      .replace(/[；]/g, ";")
      .replace(/[：]/g, ":")
      .replace(/[（]/g, "(")
      .replace(/[）]/g, ")")
      .replace(/[！]/g, "!")
      .replace(/[？]/g, "?")
      .replace(/[　]/g, " ");
  }
  if (opts.stripDecorative) text = text.replace(/[【】「」『』《》〈〉〔〕]/g, " ");
  if (opts.underscoreToSpace) text = text.replace(/_/g, " ");
  if (opts.lowercase) text = text.toLowerCase();

  // 3. Per-tag cleanup.
  let tags = text.split(",").map((t) => t.trim());
  if (opts.stripNonAscii) {
    tags = tags.map((t) => t.replace(/[^ -~]/g, "").trim());
  }
  // collapse runs of whitespace inside each tag
  tags = tags.map((t) => t.replace(/\s+/g, " ").trim());

  if (opts.stripQualityPrefix) {
    tags = tags.filter((t) => !QUALITY_TAGS.has(t.toLowerCase()) && !/^(artist:|by\s)/i.test(t));
  }

  tags = tags.filter(Boolean);

  if (opts.dedupe) {
    const seen = new Set<string>();
    tags = tags.filter((t) => {
      const key = t.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  let out = tags.join(", ");

  // 4. Restore shielded wildcard groups.
  if (opts.keepWildcards) {
    out = out.replace(/@@wc(\d+)@@/g, (_, i) => shielded[Number(i)] ?? "");
  }
  return out;
}

export const NORMALIZE_LABELS: { key: keyof NormalizeOptions; label: string }[] = [
  { key: "lowercase", label: "转为小写" },
  { key: "halfWidthPunct", label: "使用半角标点" },
  { key: "stripDecorative", label: "移除装饰符号（【】「」）" },
  { key: "underscoreToSpace", label: "下划线转为空格" },
  { key: "newlineToComma", label: "换行转逗号" },
  { key: "stripQualityPrefix", label: "移除常见质量 / artist 前缀" },
  { key: "stripNonAscii", label: "移除非 ASCII 字符" },
  { key: "dedupe", label: "去除重复标签" },
  { key: "keepWildcards", label: "保留 Wildcards 语法" },
];
