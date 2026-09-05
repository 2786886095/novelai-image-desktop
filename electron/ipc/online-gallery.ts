import axios from "axios";
import { createHash } from "crypto";
import type {
  OnlineGalleryDetail,
  OnlineGalleryDetailRequest,
  OnlineGalleryItem,
  OnlineGalleryMedia,
  OnlineGalleryPage,
  OnlineGallerySearchRequest,
  OnlineGalleryTagGroups,
} from "../../src/online-gallery";
import {
  DEFAULT_GELBOORU_API_KEY,
  DEFAULT_GELBOORU_USER_ID,
  emptyOnlineGalleryTagGroups,
  splitOnlineGalleryTags,
} from "../../src/online-gallery";
import { proxyConfig } from "./proxy";

const PAGE_SIZE = 60;
const REQUEST_TIMEOUT = 30_000;
const MAX_QUERY_LENGTH = 2_000;
const QUICK_TAG_SOURCE = "https://novelai.quicktagcloud.com/data-source.json";
const USER_AGENT = "Langbai-NovelAI-Studio/Online-Gallery-Client";
const JSON_CACHE_TTL_MS = 10 * 60_000;

type ExternalSource = OnlineGallerySearchRequest["source"];
type JsonRecord = Record<string, unknown>;
type QuickTagCodexMeta = JsonRecord & {
  id: string;
  title: string;
  author: string;
  version: string;
  entryCount: number;
  imagedCount: number;
  cover: string;
  coverCodexId: string;
  nsfw: boolean;
  dataUrl: string;
  assetBaseUrl: string;
  assetPathMode: string;
};
type QuickTagCatalog = {
  baseUrl: string;
  release: string;
  releaseBaseUrl: string;
  siteBaseUrl: string;
  media: { baseUrl: string; imagePrefix: string; originalPrefix: string };
  manifestFiles: Record<string, { sha256: string; size: number }>;
  codexes: QuickTagCodexMeta[];
};
type QuickTagCodex = QuickTagCodexMeta & { entries: JsonRecord[]; source?: string; contributors?: unknown[] };

type TimedValue<T> = { expiresAt: number; promise: Promise<T> };
let quickCatalogCache: TimedValue<QuickTagCatalog> | null = null;
const quickCodexCache = new Map<string, TimedValue<QuickTagCodex>>();
const requestCache = new Map<string, TimedValue<unknown>>();

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bool(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function page(value: unknown): number {
  const parsed = Math.trunc(number(value));
  return parsed >= 1 && parsed <= 100_000 ? parsed : 1;
}

function pageSize(value: unknown): number {
  const size = number(value);
  return [12, 24, 48, 60].includes(size) ? size : PAGE_SIZE;
}

function query(value: unknown): string {
  return text(value).trim().slice(0, MAX_QUERY_LENGTH);
}

function gelbooruCredentials(request: Pick<OnlineGallerySearchRequest, "gelbooruApiKey" | "gelbooruUserId">) {
  const apiKey = query(request.gelbooruApiKey) || DEFAULT_GELBOORU_API_KEY;
  const userId = query(request.gelbooruUserId) || DEFAULT_GELBOORU_USER_ID;
  if (!apiKey || !userId) throw new Error("GELBOORU_CREDENTIALS_REQUIRED");
  if (!/^\d+$/.test(userId)) throw new Error("GELBOORU_USER_ID_INVALID");
  return { apiKey, userId };
}

function safeSource(value: unknown): ExternalSource {
  if (value === "danbooru" || value === "safebooru" || value === "gelbooru" || value === "quicktag") return value;
  throw new Error("Unsupported online gallery source");
}

function safeCollectionId(value: unknown): string {
  const normalized = text(value).trim();
  return /^[a-z0-9][a-z0-9_-]{0,127}$/i.test(normalized) ? normalized : "";
}

function httpsUrl(value: unknown, base?: string): string {
  const raw = text(value).trim();
  if (!raw) return "";
  try {
    const resolved = new URL(raw, base);
    return resolved.protocol === "https:" ? resolved.toString() : "";
  } catch {
    return "";
  }
}

function encodedPath(value: string) {
  return value.split("/").map((part) => encodeURIComponent(decodeURIComponentSafe(part))).join("/");
}

function decodeURIComponentSafe(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function extensionOf(url: string): string | undefined {
  try {
    const extension = new URL(url).pathname.split(".").pop()?.toLowerCase();
    return extension && /^[a-z0-9]{1,10}$/.test(extension) ? extension : undefined;
  } catch {
    return undefined;
  }
}

function headers(referer: string) {
  return {
    Accept: "application/json",
    Referer: referer,
    "User-Agent": USER_AGENT,
  };
}

function cached<T>(key: string, load: () => Promise<T>, ttl = JSON_CACHE_TTL_MS): Promise<T> {
  const existing = requestCache.get(key) as TimedValue<T> | undefined;
  if (existing && existing.expiresAt > Date.now()) return existing.promise;
  const value: TimedValue<T> = { expiresAt: Date.now() + ttl, promise: load() };
  requestCache.set(key, value as TimedValue<unknown>);
  value.promise.catch(() => requestCache.delete(key));
  return value.promise;
}

function sourceUrl(source: "danbooru" | "safebooru", id: string) {
  const base = source === "safebooru" ? "https://safebooru.donmai.us" : "https://danbooru.donmai.us";
  return `${base}/posts/${encodeURIComponent(id)}`;
}

function makeMedia(id: string, preview: string, display: string, download: string, width: number, height: number): OnlineGalleryMedia {
  const best = download || display || preview;
  return {
    id,
    previewUrl: preview || display || download,
    displayUrl: display || download || preview,
    downloadUrl: best,
    width: Math.max(0, Math.trunc(width)),
    height: Math.max(0, Math.trunc(height)),
    extension: extensionOf(best),
  };
}

function parseDonmaiPost(value: unknown, source: "danbooru" | "safebooru"): OnlineGalleryItem {
  const post = record(value);
  const id = text(post.id);
  const tags: OnlineGalleryTagGroups = {
    artists: splitOnlineGalleryTags(post.tag_string_artist),
    characters: splitOnlineGalleryTags(post.tag_string_character),
    copyrights: splitOnlineGalleryTags(post.tag_string_copyright),
    general: splitOnlineGalleryTags(post.tag_string_general),
    meta: splitOnlineGalleryTags(post.tag_string_meta),
  };
  const allTags = splitOnlineGalleryTags(post.tag_string);
  const preview = httpsUrl(post.preview_file_url);
  const display = httpsUrl(post.large_file_url ?? post.sample_url ?? post.file_url);
  const download = httpsUrl(post.file_url ?? post.large_file_url ?? post.sample_url);
  return {
    source,
    id,
    kind: "work",
    title: tags.characters[0] || tags.copyrights[0] || `#${id}`,
    author: tags.artists.join(", "),
    description: allTags.slice(0, 16).join(" · "),
    createdAt: text(post.created_at),
    rating: text(post.rating || "g"),
    score: number(post.score),
    favoriteCount: number(post.fav_count),
    viewCount: 0,
    mediaCount: 1,
    prompt: allTags.join(", "),
    negativePrompt: "",
    tags,
    cover: makeMedia(`${source}:${id}:0`, preview, display, download, number(post.image_width), number(post.image_height)),
    sourceUrl: sourceUrl(source, id),
  };
}

function normalizeGelbooruPosts(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.map(record);
  const root = record(value);
  const posts = Array.isArray(root.post) ? root.post : [];
  return posts.map(record);
}

function parseGelbooruPost(value: unknown): OnlineGalleryItem {
  const post = record(value);
  const id = text(post.id);
  const allTags = splitOnlineGalleryTags(post.tags);
  const preview = httpsUrl(post.preview_url);
  const display = httpsUrl(post.sample_url ?? post.file_url);
  const download = httpsUrl(post.file_url ?? post.sample_url);
  return {
    source: "gelbooru",
    id,
    kind: "work",
    title: `#${id}`,
    author: text(post.owner),
    description: allTags.slice(0, 16).join(" · "),
    createdAt: text(post.created_at),
    rating: text(post.rating || "general"),
    score: number(post.score),
    favoriteCount: 0,
    viewCount: 0,
    mediaCount: 1,
    prompt: allTags.join(", "),
    negativePrompt: "",
    tags: { ...emptyOnlineGalleryTagGroups(), general: allTags },
    cover: makeMedia(`gelbooru:${id}:0`, preview, display, download, number(post.width), number(post.height)),
    sourceUrl: `https://gelbooru.com/index.php?page=post&s=view&id=${encodeURIComponent(id)}`,
  };
}

async function fetchDonmai(request: OnlineGallerySearchRequest): Promise<OnlineGalleryPage> {
  const source = request.source as "danbooru" | "safebooru";
  const base = source === "safebooru" ? "https://safebooru.donmai.us" : "https://danbooru.donmai.us";
  const targetPage = page(request.page);
  const targetPageSize = pageSize(request.pageSize);
  const rawQuery = query(request.query);
  const safeOnly = request.safeOnly !== false;
  const tags = [rawQuery, safeOnly ? "rating:g" : ""].filter(Boolean).join(" ");
  const key = `${source}:search:${targetPage}:${targetPageSize}:${tags}`;
  return cached(key, async () => {
    const [response, countResponse] = await Promise.all([
      axios.get(`${base}/posts.json`, {
        params: { tags, limit: targetPageSize, page: targetPage },
        timeout: REQUEST_TIMEOUT,
        headers: headers(base),
        ...proxyConfig("update"),
      }),
      axios.get(`${base}/counts/posts.json`, {
        params: { tags },
        timeout: REQUEST_TIMEOUT,
        headers: headers(base),
        ...proxyConfig("update"),
      }).catch(() => null),
    ]);
    const raw = Array.isArray(response.data) ? response.data : [];
    const items = raw.map((post) => parseDonmaiPost(post, source)).filter((item) => item.id && item.cover.previewUrl);
    const total = number(record(record(countResponse?.data).counts).posts) || undefined;
    return {
      source,
      page: targetPage,
      pageSize: targetPageSize,
      total,
      hasMore: total != null
        ? targetPage * targetPageSize < total
        : raw.length >= targetPageSize,
      items,
    };
  });
}

async function fetchGelbooru(request: OnlineGallerySearchRequest): Promise<OnlineGalleryPage> {
  const targetPage = page(request.page);
  const targetPageSize = pageSize(request.pageSize);
  const rawQuery = query(request.query);
  const safeOnly = request.safeOnly !== false;
  const tags = [rawQuery, safeOnly ? "rating:general" : ""].filter(Boolean).join(" ");
  const { apiKey, userId } = gelbooruCredentials(request);
  const key = `gelbooru:search:${targetPage}:${targetPageSize}:${tags}:${userId}:${createHash("sha256").update(apiKey).digest("hex")}`;
  return cached(key, async () => {
    const response = await axios.get("https://gelbooru.com/index.php", {
      params: {
        page: "dapi",
        s: "post",
        q: "index",
        json: 1,
        limit: targetPageSize,
        pid: targetPage - 1,
        tags,
        ...(apiKey && userId ? { api_key: apiKey, user_id: userId } : {}),
      },
      timeout: REQUEST_TIMEOUT,
      headers: headers("https://gelbooru.com/"),
      ...proxyConfig("update"),
    });
    const raw = normalizeGelbooruPosts(response.data);
    const items = raw.map(parseGelbooruPost).filter((item) => item.id && item.cover.previewUrl);
    const total = number(record(response.data)["@attributes"] && record(record(response.data)["@attributes"]).count) || undefined;
    return {
      source: "gelbooru",
      page: targetPage,
      pageSize: targetPageSize,
      total,
      hasMore: raw.length >= targetPageSize,
      items,
    };
  });
}

function normalizeQuickMeta(value: unknown): QuickTagCodexMeta {
  const item = record(value);
  return {
    ...item,
    id: safeCollectionId(item.id),
    title: text(item.title),
    author: text(item.author),
    version: text(item.version),
    entryCount: number(item.entryCount),
    imagedCount: number(item.imagedCount),
    cover: text(item.cover),
    coverCodexId: safeCollectionId(item.coverCodexId),
    nsfw: bool(item.nsfw),
    dataUrl: httpsUrl(item.dataUrl),
    assetBaseUrl: httpsUrl(item.assetBaseUrl),
    assetPathMode: text(item.assetPathMode),
  };
}

function ensureQuickUrl(value: string, allowedHosts: Set<string>) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) throw new Error("QuickTagCloud returned an untrusted data host");
  return url;
}

async function fetchJson(value: string, referer: string): Promise<unknown> {
  const response = await axios.get(value, {
    timeout: REQUEST_TIMEOUT,
    headers: headers(referer),
    ...proxyConfig("update"),
  });
  return response.data as unknown;
}

async function loadQuickCatalog(): Promise<QuickTagCatalog> {
  if (quickCatalogCache && quickCatalogCache.expiresAt > Date.now()) return quickCatalogCache.promise;
  const promise = (async () => {
    const source = record(await fetchJson(QUICK_TAG_SOURCE, "https://novelai.quicktagcloud.com/"));
    const baseUrl = httpsUrl(source.baseUrl);
    const pointerName = text(source.pointer);
    const allowedHosts = new Set(["assets.quicktagcloud.com", "novelai.quicktagcloud.com"]);
    if (!baseUrl || !/^[-a-z0-9_/]+\.json$/i.test(pointerName)) throw new Error("Invalid QuickTagCloud data source");
    const pointerUrl = ensureQuickUrl(new URL(pointerName, `${baseUrl.replace(/\/+$/, "")}/`).toString(), allowedHosts);
    const pointer = record(await fetchJson(pointerUrl.toString(), "https://novelai.quicktagcloud.com/"));
    const release = safeCollectionId(pointer.release);
    const manifestPath = text(pointer.manifest);
    if (!release || !/^releases\/[a-z0-9_-]+\/manifest\.json$/i.test(manifestPath)) throw new Error("Invalid QuickTagCloud release pointer");
    const releaseBaseUrl = `${baseUrl.replace(/\/+$/, "")}/releases/${encodeURIComponent(release)}/`;
    const manifest = record(await fetchJson(ensureQuickUrl(new URL(manifestPath, `${baseUrl.replace(/\/+$/, "")}/`).toString(), allowedHosts).toString(), "https://novelai.quicktagcloud.com/"));
    const files = record(manifest.files);
    const [codexesRaw, mediaRaw] = await Promise.all([
      fetchJson(`${releaseBaseUrl}codexes.json`, "https://novelai.quicktagcloud.com/"),
      fetchJson(`${releaseBaseUrl}media.json`, "https://novelai.quicktagcloud.com/"),
    ]);
    const media = record(mediaRaw);
    return {
      baseUrl,
      release,
      releaseBaseUrl,
      siteBaseUrl: "https://novelai.quicktagcloud.com",
      media: {
        baseUrl: httpsUrl(media.baseUrl) || "https://assets.quicktagcloud.com",
        imagePrefix: text(media.imagePrefix) || "images",
        originalPrefix: text(media.originalPrefix) || "originals",
      },
      manifestFiles: Object.fromEntries(Object.entries(files).map(([name, metadata]) => {
        const item = record(metadata);
        return [name, { sha256: text(item.sha256), size: number(item.size) }];
      })),
      codexes: list(codexesRaw).map(normalizeQuickMeta).filter((item) => item.id),
    };
  })();
  quickCatalogCache = { expiresAt: Date.now() + 30 * 60_000, promise };
  promise.catch(() => { quickCatalogCache = null; });
  return promise;
}

function quickAssetUrl(catalog: QuickTagCatalog, codex: QuickTagCodexMeta, file: string, kind: "image" | "original", assetCodexId = "") {
  if (!file) return "";
  const absolute = httpsUrl(file);
  if (absolute) return absolute;
  if (codex.assetPathMode === "relative" && codex.assetBaseUrl) {
    return httpsUrl(encodedPath(file), `${codex.assetBaseUrl.replace(/\/+$/, "")}/`);
  }
  const prefix = kind === "original" ? catalog.media.originalPrefix : catalog.media.imagePrefix;
  const collection = assetCodexId || codex.coverCodexId || codex.id;
  return `${catalog.media.baseUrl.replace(/\/+$/, "")}/${encodedPath(prefix)}/${encodedPath(collection)}/${encodedPath(file)}`;
}

function quickCollectionItem(catalog: QuickTagCatalog, codex: QuickTagCodexMeta): OnlineGalleryItem {
  const cover = quickAssetUrl(catalog, codex, codex.cover, "image");
  return {
    source: "quicktag",
    id: codex.id,
    kind: "collection",
    collectionId: codex.id,
    title: codex.title || codex.id,
    author: codex.author,
    description: `${codex.version || "—"} · ${codex.entryCount} 条`,
    createdAt: codex.version,
    rating: codex.nsfw ? "explicit" : "general",
    score: 0,
    favoriteCount: 0,
    viewCount: 0,
    mediaCount: codex.imagedCount,
    prompt: "",
    negativePrompt: "",
    tags: emptyOnlineGalleryTagGroups(),
    cover: makeMedia(`quicktag:${codex.id}:cover`, cover, cover, cover, 0, 0),
    sourceUrl: catalog.siteBaseUrl,
  };
}

async function loadQuickCodex(catalog: QuickTagCatalog, id: string): Promise<QuickTagCodex> {
  const meta = catalog.codexes.find((item) => item.id === id);
  if (!meta) throw new Error("QuickTagCloud collection was not found");
  const cachedCodex = quickCodexCache.get(id);
  if (cachedCodex && cachedCodex.expiresAt > Date.now()) return cachedCodex.promise;
  const promise = (async () => {
    const canonicalPath = `${id}.json`;
    const url = meta.dataUrl || `${catalog.releaseBaseUrl}${encodedPath(canonicalPath)}`;
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: 180_000,
      maxContentLength: 32 * 1024 * 1024,
      maxBodyLength: 32 * 1024 * 1024,
      headers: headers(catalog.siteBaseUrl),
      ...proxyConfig("update"),
    });
    const bytes = Buffer.from(response.data);
    const manifestEntry = meta.dataUrl ? undefined : catalog.manifestFiles[canonicalPath];
    if (manifestEntry) {
      const sha = createHash("sha256").update(bytes).digest("hex");
      if (bytes.length !== manifestEntry.size || sha !== manifestEntry.sha256) throw new Error("QuickTagCloud collection integrity check failed");
    }
    const parsed = record(JSON.parse(bytes.toString("utf8")));
    return {
      ...meta,
      ...parsed,
      id: meta.id,
      title: text(parsed.title) || meta.title,
      author: text(parsed.author) || meta.author,
      version: text(parsed.version) || meta.version,
      entries: list(parsed.entries).map(record),
    };
  })();
  quickCodexCache.set(id, { expiresAt: Date.now() + 30 * 60_000, promise });
  promise.catch(() => quickCodexCache.delete(id));
  return promise;
}

function quickEntryImages(catalog: QuickTagCatalog, codex: QuickTagCodex, entry: JsonRecord, entryId: string): OnlineGalleryMedia[] {
  const values = list(entry.images).map(record);
  if (!values.length && (entry.image || entry.original)) values.push({ path: entry.image, original: entry.original });
  const assetCodexId = safeCollectionId(entry.assetCodexId) || codex.id;
  return values.map((image, index) => {
    const imagePath = text(image.path ?? image.image ?? entry.image);
    const originalPath = text(image.original ?? entry.original) || imagePath;
    const preview = quickAssetUrl(catalog, codex, imagePath, "image", assetCodexId);
    const original = quickAssetUrl(catalog, codex, originalPath, "original", assetCodexId) || preview;
    return makeMedia(
      `quicktag:${codex.id}:${entryId}:${index}`,
      preview,
      preview,
      original,
      number(image.width ?? entry.imageWidth),
      number(image.height ?? entry.imageHeight),
    );
  }).filter((media) => media.previewUrl);
}

function quickEntryItem(catalog: QuickTagCatalog, codex: QuickTagCodex, entry: JsonRecord, index: number): OnlineGalleryItem {
  const id = text(entry.id) || `${codex.id}_${index + 1}`;
  const media = quickEntryImages(catalog, codex, entry, id);
  const prompt = text(entry.tags ?? entry.prompt);
  const path = list(entry.path).map(text).filter(Boolean);
  return {
    source: "quicktag",
    id,
    kind: "work",
    collectionId: codex.id,
    title: text(entry.title) || id,
    author: [text(entry.credit), text(entry.author), codex.author].filter(Boolean).filter((value, position, all) => all.indexOf(value) === position).join(" · "),
    description: text(entry.note) || path.join(" / "),
    createdAt: codex.version,
    rating: codex.nsfw || bool(entry.nsfw) ? "explicit" : "general",
    score: 0,
    favoriteCount: 0,
    viewCount: 0,
    mediaCount: media.length,
    prompt,
    negativePrompt: text(entry.negative ?? entry.negativePrompt),
    tags: { ...emptyOnlineGalleryTagGroups(), general: prompt.split(",").map((tag) => tag.trim()).filter(Boolean) },
    cover: media[0] ?? makeMedia(`quicktag:${codex.id}:${id}:0`, "", "", "", 0, 0),
    sourceUrl: httpsUrl(codex.source) || catalog.siteBaseUrl,
  };
}

async function fetchQuickTag(request: OnlineGallerySearchRequest): Promise<OnlineGalleryPage> {
  const catalog = await loadQuickCatalog();
  const targetPage = page(request.page);
  const targetPageSize = pageSize(request.pageSize);
  const search = query(request.query).toLowerCase();
  const safeOnly = request.safeOnly !== false;
  const collectionId = safeCollectionId(request.collectionId);
  if (!collectionId) {
    const filtered = catalog.codexes
      .filter((item) => !safeOnly || !item.nsfw)
      .filter((item) => !search || [item.title, item.author, item.id, text(item.source)].join(" ").toLowerCase().includes(search));
    const offset = (targetPage - 1) * targetPageSize;
    return {
      source: "quicktag",
      page: targetPage,
      pageSize: targetPageSize,
      total: filtered.length,
      hasMore: offset + targetPageSize < filtered.length,
      items: filtered.slice(offset, offset + targetPageSize).map((item) => quickCollectionItem(catalog, item)),
    };
  }
  const codex = await loadQuickCodex(catalog, collectionId);
  if (safeOnly && codex.nsfw) throw new Error("This QuickTagCloud collection is hidden by the all-ages filter");
  const all = codex.entries.map((entry, index) => quickEntryItem(catalog, codex, entry, index));
  const filtered = all.filter((item) => !search || [item.title, item.author, item.description, item.prompt].join(" ").toLowerCase().includes(search));
  const offset = (targetPage - 1) * targetPageSize;
  return {
    source: "quicktag",
    page: targetPage,
    pageSize: targetPageSize,
    total: filtered.length,
    hasMore: offset + targetPageSize < filtered.length,
    collectionId,
    collectionTitle: codex.title,
    items: filtered.slice(offset, offset + targetPageSize),
  };
}

export async function searchOnlineGallery(raw: unknown): Promise<OnlineGalleryPage> {
  const input = record(raw);
  const request: OnlineGallerySearchRequest = {
    source: safeSource(input.source),
    page: page(input.page),
    pageSize: pageSize(input.pageSize),
    query: query(input.query),
    collectionId: safeCollectionId(input.collectionId),
    safeOnly: input.safeOnly !== false,
    gelbooruApiKey: query(input.gelbooruApiKey),
    gelbooruUserId: query(input.gelbooruUserId),
  };
  if (request.source === "danbooru" || request.source === "safebooru") return fetchDonmai(request);
  if (request.source === "gelbooru") return fetchGelbooru(request);
  return fetchQuickTag(request);
}

async function fetchDonmaiDetail(request: OnlineGalleryDetailRequest): Promise<OnlineGalleryDetail> {
  const source = request.source as "danbooru" | "safebooru";
  const base = source === "safebooru" ? "https://safebooru.donmai.us" : "https://danbooru.donmai.us";
  if (!/^\d+$/.test(request.id)) throw new Error("Invalid post id");
  const response = await axios.get(`${base}/posts/${request.id}.json`, {
    timeout: REQUEST_TIMEOUT,
    headers: headers(base),
    ...proxyConfig("update"),
  });
  const item = parseDonmaiPost(response.data, source);
  return { item, media: [item.cover], prompt: item.prompt, negativePrompt: "", note: "", categoryPath: [], metadata: record(response.data) };
}

async function fetchGelbooruDetail(request: OnlineGalleryDetailRequest): Promise<OnlineGalleryDetail> {
  if (!/^\d+$/.test(request.id)) throw new Error("Invalid post id");
  const { apiKey, userId } = gelbooruCredentials(request);
  const response = await axios.get("https://gelbooru.com/index.php", {
    params: {
      page: "dapi",
      s: "post",
      q: "index",
      json: 1,
      id: request.id,
      api_key: apiKey,
      user_id: userId,
    },
    timeout: REQUEST_TIMEOUT,
    headers: headers("https://gelbooru.com/"),
    ...proxyConfig("update"),
  });
  const raw = normalizeGelbooruPosts(response.data)[0];
  if (!raw) throw new Error("Gelbooru post was not found");
  const item = parseGelbooruPost(raw);
  return { item, media: [item.cover], prompt: item.prompt, negativePrompt: "", note: "", categoryPath: [], metadata: raw };
}

async function fetchQuickDetail(request: OnlineGalleryDetailRequest): Promise<OnlineGalleryDetail> {
  const catalog = await loadQuickCatalog();
  const collectionId = safeCollectionId(request.collectionId);
  if (!collectionId) throw new Error("QuickTagCloud collection id is required");
  const codex = await loadQuickCodex(catalog, collectionId);
  const index = codex.entries.findIndex((entry, position) => (text(entry.id) || `${codex.id}_${position + 1}`) === request.id);
  if (index < 0) throw new Error("QuickTagCloud entry was not found");
  const entry = codex.entries[index];
  const item = quickEntryItem(catalog, codex, entry, index);
  return {
    item,
    media: quickEntryImages(catalog, codex, entry, item.id),
    prompt: item.prompt,
    negativePrompt: item.negativePrompt,
    note: text(entry.note),
    categoryPath: list(entry.path).map(text).filter(Boolean),
    metadata: { collectionId: codex.id, collectionTitle: codex.title, collectionVersion: codex.version, entry },
  };
}

export async function getOnlineGalleryDetail(raw: unknown): Promise<OnlineGalleryDetail> {
  const input = record(raw);
  const request: OnlineGalleryDetailRequest = {
    source: safeSource(input.source),
    id: text(input.id).trim().slice(0, 256),
    collectionId: safeCollectionId(input.collectionId),
    gelbooruApiKey: query(input.gelbooruApiKey),
    gelbooruUserId: query(input.gelbooruUserId),
  };
  if (!request.id) throw new Error("Online gallery item id is required");
  if (request.source === "danbooru" || request.source === "safebooru") return fetchDonmaiDetail(request);
  if (request.source === "gelbooru") return fetchGelbooruDetail(request);
  return fetchQuickDetail(request);
}

export function clearOnlineGalleryDataCache() {
  quickCatalogCache = null;
  quickCodexCache.clear();
  requestCache.clear();
}
