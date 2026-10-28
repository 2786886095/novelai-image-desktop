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

/**
 * Library search: `#tag` tokens must match one of the entry's tags (exact, case-insensitive);
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
  for (const word of query.trim().split(/\s+/).filter(Boolean)) {
    if (word.length > 1 && word.startsWith("#")) {
      if (!tags.includes(cleanTag(word).toLocaleLowerCase())) return false;
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
  "zh-TW": { tags: "標籤", tagsHint: "以逗號分隔多個標籤；標籤只用於整理和篩選，不會寫入提示詞。", tagsPlaceholder: "例如：角色, 服裝, 夜景", filter: "依標籤瀏覽", all: "全部", untagged: "未加標籤", addTag: "新增標籤", searchHint: "搜尋名稱、內容或標籤；輸入 #標籤 可精確篩選" },
  "en-US": { tags: "Tags", tagsHint: "Separate tags with commas. Tags only organize and filter entries; they are never added to prompts.", tagsPlaceholder: "e.g. character, outfit, night", filter: "Browse by tag", all: "All", untagged: "Untagged", addTag: "Add tag", searchHint: "Search names, text or tags; type #tag to filter exactly" },
  "ja-JP": { tags: "タグ", tagsHint: "複数のタグはカンマで区切ります。タグは整理と絞り込み専用で、プロンプトには追加されません。", tagsPlaceholder: "例：キャラ, 衣装, 夜景", filter: "タグで表示", all: "すべて", untagged: "タグなし", addTag: "タグを追加", searchHint: "名前・内容・タグを検索。#タグ で完全一致の絞り込み" },
  "ko-KR": { tags: "태그", tagsHint: "여러 태그는 쉼표로 구분합니다. 태그는 정리와 필터 전용이며 프롬프트에 추가되지 않습니다.", tagsPlaceholder: "예: 캐릭터, 의상, 야경", filter: "태그별 보기", all: "전체", untagged: "태그 없음", addTag: "태그 추가", searchHint: "이름, 내용, 태그 검색. #태그 로 정확히 필터" },
};

export function promptTagText(language: unknown): TagText {
  return TAG_TEXT[String(language)] ?? TAG_TEXT["zh-CN"];
}
