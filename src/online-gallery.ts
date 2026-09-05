export type OnlineGallerySourceId =
  | "aitag"
  | "artist-ranking"
  | "danbooru"
  | "safebooru"
  | "gelbooru"
  | "quicktag";

export type OnlineGalleryItemKind = "work" | "collection";

// Shared public Gelbooru credentials requested by the project owner. They are
// intentionally bundled so the gallery opens without a credential form.
export const DEFAULT_GELBOORU_USER_ID = "2045330";
export const DEFAULT_GELBOORU_API_KEY = "01f32eb53a430f85762184542ba8dfb757f0ca61960fb26b14b8c328a4fc974579bd1cbc008b5786513b6bea46b220179e12f71cfd120e0419f865257d66d35d";

export interface OnlineGallerySourceInfo {
  id: OnlineGallerySourceId;
  label: string;
  siteUrl: string;
  supportsPromptSearch: boolean;
  supportsCollections: boolean;
  requiresCredentials?: boolean;
}

export const ONLINE_GALLERY_SOURCES: readonly OnlineGallerySourceInfo[] = [
  {
    id: "artist-ranking",
    label: "画师排行榜",
    siteUrl: "https://danbooru.donmai.us/artists",
    supportsPromptSearch: false,
    supportsCollections: false,
  },
  {
    id: "aitag",
    label: "AI TAG",
    siteUrl: "https://aitag.win",
    supportsPromptSearch: true,
    supportsCollections: false,
  },
  {
    id: "safebooru",
    label: "Safebooru",
    siteUrl: "https://safebooru.donmai.us",
    supportsPromptSearch: false,
    supportsCollections: false,
  },
  {
    id: "danbooru",
    label: "Danbooru",
    siteUrl: "https://danbooru.donmai.us",
    supportsPromptSearch: false,
    supportsCollections: false,
  },
  {
    id: "gelbooru",
    label: "Gelbooru",
    siteUrl: "https://gelbooru.com",
    supportsPromptSearch: false,
    supportsCollections: false,
    requiresCredentials: true,
  },
  {
    id: "quicktag",
    label: "法典图鉴",
    siteUrl: "https://novelai.quicktagcloud.com",
    supportsPromptSearch: false,
    supportsCollections: true,
  },
] as const;

export interface OnlineGallerySearchRequest {
  source: Exclude<OnlineGallerySourceId, "aitag" | "artist-ranking">;
  page?: number;
  pageSize?: number;
  query?: string;
  collectionId?: string;
  safeOnly?: boolean;
  gelbooruApiKey?: string;
  gelbooruUserId?: string;
}

export interface OnlineGalleryMedia {
  id: string;
  previewUrl: string;
  displayUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  extension?: string;
}

export interface OnlineGalleryTagGroups {
  artists: string[];
  characters: string[];
  copyrights: string[];
  general: string[];
  meta: string[];
}

export interface OnlineGalleryItem {
  source: Exclude<OnlineGallerySourceId, "aitag" | "artist-ranking">;
  id: string;
  kind: OnlineGalleryItemKind;
  collectionId?: string;
  title: string;
  author: string;
  description: string;
  createdAt: string;
  rating: string;
  score: number;
  favoriteCount: number;
  viewCount: number;
  mediaCount: number;
  prompt: string;
  negativePrompt: string;
  tags: OnlineGalleryTagGroups;
  cover: OnlineGalleryMedia;
  sourceUrl: string;
}

export interface OnlineGalleryPage {
  source: Exclude<OnlineGallerySourceId, "aitag" | "artist-ranking">;
  page: number;
  pageSize: number;
  total?: number;
  hasMore: boolean;
  collectionId?: string;
  collectionTitle?: string;
  items: OnlineGalleryItem[];
}

export interface OnlineGalleryDetail {
  item: OnlineGalleryItem;
  media: OnlineGalleryMedia[];
  prompt: string;
  negativePrompt: string;
  note: string;
  categoryPath: string[];
  metadata: Record<string, unknown>;
}

export interface OnlineGalleryDetailRequest {
  source: Exclude<OnlineGallerySourceId, "aitag" | "artist-ranking">;
  id: string;
  collectionId?: string;
  gelbooruApiKey?: string;
  gelbooruUserId?: string;
}

export function emptyOnlineGalleryTagGroups(): OnlineGalleryTagGroups {
  return { artists: [], characters: [], copyrights: [], general: [], meta: [] };
}

export function splitOnlineGalleryTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function onlineGallerySourceInfo(source: OnlineGallerySourceId): OnlineGallerySourceInfo {
  return ONLINE_GALLERY_SOURCES.find((item) => item.id === source) ?? ONLINE_GALLERY_SOURCES[0];
}
