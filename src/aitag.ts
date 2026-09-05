export const AITAG_SITE_URL = "https://aitag.win";
// The desktop UI paginates in compact 12-item pages. The AITag API currently
// requires requests of at least 60 items; the Electron adapter translates and
// slices those API pages back into this client-facing page size.
export const AITAG_PAGE_SIZE = 12;

export type AitagSort = "new" | "monthly";

export interface AitagSearchRequest {
  page?: number;
  pageSize?: number;
  query?: string;
  prompt?: string;
  sort?: AitagSort;
  timeRange?: string;
}

export interface AitagConfig {
  assetBaseUrl: string;
  availableYears: number[];
  availableMonths: string[];
}

export interface AitagWorkSummary {
  id: number;
  userId: string;
  title: string;
  caption: string;
  tags: string[];
  createDate: string;
  aiType: string;
  totalView: number;
  totalBookmarks: number;
  imageCount: number;
}

export interface AitagImage {
  id: number;
  workId: number;
  authorId: string;
  imageType: string;
  model: string;
  fileName: string;
  aiJson: unknown;
  promptText: string;
}

export interface AitagWorkDetail {
  work: AitagWorkSummary;
  images: AitagImage[];
}

export interface AitagSearchResult {
  page: number;
  pageSize: number;
  total: number;
  items: AitagWorkSummary[];
}

type JsonObject = Record<string, unknown>;

function record(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseAitagJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function stringList(value: unknown): string[] {
  const parsed = parseAitagJson(value);
  if (Array.isArray(parsed)) return parsed.map(text).filter(Boolean);
  return typeof parsed === "string"
    ? parsed.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
}

function normalizeWork(value: unknown): AitagWorkSummary {
  const source = record(value);
  return {
    id: number(source.id),
    userId: text(source.userId ?? source.userid),
    title: text(source.title),
    caption: text(source.caption),
    tags: stringList(source.tags),
    createDate: text(source.create_date ?? source.createDate),
    aiType: text(source.AI_type ?? source.ai_type ?? source.aiType),
    totalView: number(source.total_view ?? source.totalView),
    totalBookmarks: number(source.total_bookmarks ?? source.totalBookmarks),
    imageCount: number(source.image_count ?? source.imageCount),
  };
}

export function normalizeAitagConfig(value: unknown): AitagConfig {
  const source = record(value);
  const base = text(source.asset_base_url ?? source.assetBaseUrl).trim();
  const years = Array.isArray(source.available_years) ? source.available_years : [];
  const months = Array.isArray(source.available_months) ? source.available_months : [];
  return {
    assetBaseUrl: base || "https://ai-img.10118899.xyz/",
    availableYears: years.map(number).filter((year) => year >= 2000 && year <= 2200),
    availableMonths: months.map(text).filter((month) => /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)),
  };
}

export function normalizeAitagSearch(value: unknown): AitagSearchResult {
  const source = record(value);
  const rawItems = Array.isArray(source.items) ? source.items : [];
  return {
    page: Math.max(1, number(source.page) || 1),
    pageSize: number(source.page_size ?? source.pageSize) || AITAG_PAGE_SIZE,
    total: Math.max(0, number(source.total)),
    items: rawItems.map(normalizeWork).filter((item) => item.id > 0),
  };
}

export function normalizeAitagDetail(value: unknown): AitagWorkDetail {
  const source = record(value);
  const rawImages = Array.isArray(source.images) ? source.images : [];
  return {
    work: normalizeWork(source.work),
    images: rawImages.map((value) => {
      const image = record(value);
      return {
        id: number(image.id),
        workId: number(image.work_id ?? image.workId),
        authorId: text(image.author_id ?? image.authorId),
        imageType: text(image.image_type ?? image.imageType),
        model: text(image.model),
        fileName: text(image.file_name ?? image.fileName),
        aiJson: parseAitagJson(image.ai_json ?? image.aiJson),
        promptText: text(image.prompt_text ?? image.promptText),
      } satisfies AitagImage;
    }),
  };
}

export function aitagImageUrl(config: AitagConfig, image: AitagImage): string {
  if (!image.authorId || !image.imageType || !image.fileName) return "";
  const base = config.assetBaseUrl.replace(/\/+$/, "");
  const path = [image.imageType, image.authorId, `${image.fileName}.webp`]
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}/${path}`;
}

export function formatAitagMetadata(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

/** Convert AITag's per-image payload into the same metadata shape used by the
 * local Restore Image Metadata inspector. This keeps parsing, compatible NAI
 * values, localized labels, and copy behavior consistent across both tools. */
export function aitagMetadataRecord(image: AitagImage, aiType: string): Record<string, string> {
  const parsed = image.aiJson;
  const source = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    result[key] = typeof value === "string" ? value : formatAitagMetadata(value);
  }
  if (typeof parsed === "string" && parsed.trim()) {
    result.parameters = parsed;
  }
  if (typeof source.parameters === "string") {
    result.parameters = source.parameters;
  }
  if (source.prompt && typeof source.prompt === "object") {
    result.prompt = formatAitagMetadata(source.prompt);
  }
  if (source.workflow && typeof source.workflow === "object") {
    result.workflow = formatAitagMetadata(source.workflow);
  }
  const novelAi = /novel|nai/i.test(aiType) || /novel|nai/i.test(image.model);
  if (novelAi && !result.parameters && !result.prompt && !result.workflow) {
    const prompt = image.promptText || (typeof source.prompt === "string" ? source.prompt : "");
    result.Description = result.Description || prompt;
    result.Comment = result.Comment || formatAitagMetadata(source);
    result.Source = result.Source || image.model;
    result.Software = result.Software || "NovelAI";
  }
  if (!Object.keys(result).length && image.promptText) result.Description = image.promptText;
  return result;
}

export function stripAitagHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}
