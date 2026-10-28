/** Tags shared by the positive preset library, the negative prompt library and
 * custom prompt chunks. Tags only organize saved entries; they never enter a
 * prompt. Shared by the renderer and the main-process settings normalizer. */
export const PROMPT_TAG_LIMIT = 12;
export const PROMPT_TAG_MAX_LENGTH = 24;
/** Filter value for entries without any tag. Not a valid tag itself. */
export const UNTAGGED_PROMPT_FILTER = "\u0000untagged";

const TAG_SEPARATORS = /[,，、;；\n\r]+/;

function cleanTag(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().replace(/^#+\s*/, "").trim().slice(0, PROMPT_TAG_MAX_LENGTH).trim();
}

/** Trim, drop empty values, de-duplicate case-insensitively (first spelling wins) and cap. */
export function normalizePromptTags(value: unknown): string[] {
  const raw = typeof value === "string" ? value.split(TAG_SEPARATORS) : Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of raw) {
    const tag = cleanTag(item);
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= PROMPT_TAG_LIMIT) break;
  }
  return tags;
}

/** Spread into a saved entry: omits the key when there is no tag so untagged
 * entries keep their previous stored shape. */
export function promptTagField(value: unknown): { tags?: string[] } {
  const tags = normalizePromptTags(value);
  return tags.length ? { tags } : {};
}

export function formatPromptTagInput(tags: readonly string[] | undefined): string {
  return (tags ?? []).join(", ");
}

/** Append one tag to comma-separated editor text unless it is already present. */
export function addPromptTagToInput(text: string, tag: string): string {
  const current = normalizePromptTags(text);
  return formatPromptTagInput(normalizePromptTags([...current, tag]));
}

export function mergePromptTags(...lists: Array<readonly string[] | undefined>): string[] {
  return normalizePromptTags(lists.flatMap((list) => list ?? []));
}

export interface PromptTagCount {
  tag: string;
  count: number;
}

/** Every tag in use with its entry count, most used first, then alphabetical. */
export function collectPromptTags(items: ReadonlyArray<{ tags?: readonly string[] }>): PromptTagCount[] {
  const counts = new Map<string, PromptTagCount>();
  for (const item of items) {
    for (const tag of normalizePromptTags(item.tags)) {
      const key = tag.toLocaleLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** True when the selected filter chip no longer exists: no entry carries that
 * tag any more, or it is the untagged filter and every entry now has a tag. */
export function isStalePromptTagFilter(items: ReadonlyArray<{ tags?: readonly string[] }>, value: string): boolean {
  if (!value) return false;
  if (value === UNTAGGED_PROMPT_FILTER) return items.every((item) => normalizePromptTags(item.tags).length > 0);
  const key = value.toLocaleLowerCase();
  return !items.some((item) => normalizePromptTags(item.tags).some((tag) => tag.toLocaleLowerCase() === key));
}

/**
 * Library search: `#tag` tokens must match one of the entry's tags (exact, case-insensitive;
 * a tag with spaces takes the following words, as in `#night sky`);
 * the remaining text is matched as one phrase against the given fields and the tags.
 * `activeTag` is the selected filter chip, or UNTAGGED_PROMPT_FILTER.
 */
export function matchesPromptLibraryEntry(
  entry: { tags?: readonly string[] },
  fields: readonly string[],
  query: string,
  activeTag = "",
): boolean {
  const tags = normalizePromptTags(entry.tags).map((tag) => tag.toLocaleLowerCase());
  if (activeTag === UNTAGGED_PROMPT_FILTER) {
    if (tags.length) return false;
  } else if (activeTag && !tags.includes(activeTag.toLocaleLowerCase())) {
    return false;
  }
  const words: string[] = [];
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  for (let index = 0; index < tokens.length; index++) {
    const word = tokens[index];
    if (word.length > 1 && word.startsWith("#")) {
      // The longest run of words that names one of the entry's tags.
      let candidate = cleanTag(word).toLocaleLowerCase();
      let last = tags.includes(candidate) ? index : -1;
      for (let next = index + 1; next < tokens.length && tags.some((tag) => tag.startsWith(candidate + " ")); next++) {
        candidate += " " + tokens[next].toLocaleLowerCase();
        if (tags.includes(candidate)) last = next;
      }
      if (last < 0) return false;
      index = last;
    } else {
      words.push(word);
    }
  }
  const phrase = words.join(" ").toLocaleLowerCase();
  if (!phrase) return true;
  return [...fields, ...tags].some((field) => field.toLocaleLowerCase().includes(phrase));
}

type TagText = {
  tags: string;
  tagsHint: string;
  tagsPlaceholder: string;
  filter: string;
  all: string;
  untagged: string;
  addTag: string;
  searchHint: string;
};

const TAG_TEXT: Record<string, TagText> = {
  "zh-CN": { tags: "标签", tagsHint: "用逗号分隔多个标签；标签只用于整理和筛选，不会写入提示词。", tagsPlaceholder: "例如：角色, 服装, 夜景", filter: "按标签浏览", all: "全部", untagged: "未加标签", addTag: "添加标签", searchHint: "搜索名称、内容或标签；输入 #标签 可精确筛选" },
};

export function promptTagText(language: unknown): TagText {
  return TAG_TEXT[String(language)] ?? TAG_TEXT["zh-CN"];
}
