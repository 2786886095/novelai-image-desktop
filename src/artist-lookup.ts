export type ArtistProfile = { key: string; value: string; isUrl: boolean };
export type ArtistHit = { id: number; tag: string; urls: string[] };
export type ArtistIndexRow = ArtistHit & { savedAt: number; source: "danbooru" | "import" };
export type ArtistPreview = { id: number; url: string; createdAt: string };
export const artistIndexLimit = 2 * 1024 * 1024;
const maxRows = 2000;
const profileHosts = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]);
const reserved = new Set(["home","search","i","intent","explore","settings","share","messages","notifications","compose","login","signup"]);
export function artistProfile(input: string): ArtistProfile | null {
  if (!input || input.length > 512 || /[\x00-\x1f*\\]/.test(input)) return null;
  if (!input.includes("://")) {
    if (input.length > 120 || !/^[\p{L}\p{N}_(). '\u2019-]+$/u.test(input)) return null;
    const value = input.trim().replace(/\s+/g, "_");
    return value ? { key: "name:" + value.toLowerCase(), value, isUrl: false } : null;
  }
  if (!/^https?:\/\/[^/?#:@]+(?:[/?#]|$)/i.test(input)) return null;
  let u: URL;
  try { u = new URL(input); } catch { return null; }
  if (u.username || u.password || u.port) return null;
  if (["pixiv.net", "www.pixiv.net"].includes(u.hostname)) {
    const id = u.pathname.match(/^\/(?:[a-z]{2}\/)?users\/(\d{1,20})\/?$/i)?.[1] ??
      (u.pathname === "/member.php" && u.searchParams.getAll("id").length === 1 ? u.searchParams.get("id") : null);
    if (id && /^\d{1,20}$/.test(id) && !/^0+$/.test(id)) {
      const canonical = id.replace(/^0+/, "");
      return { key: "pixiv:" + canonical, value: "https://www.pixiv.net/users/" + canonical, isUrl: true };
    }
  }
  if (profileHosts.has(u.hostname)) {
    const handle = u.pathname.match(/^\/([a-z0-9_]{1,15})(?:\/status\/\d+)?\/?$/i)?.[1]?.toLowerCase();
    if (handle && !reserved.has(handle)) return { key: "x:" + handle, value: "https://twitter.com/" + handle, isUrl: true };
  }
  return null;
}
export function parseArtistBatch(input: string) {
  if (input.length > 12000) throw new Error("invalid");
  const chunks = input.split(/[\r\n,，;；]+/u).flatMap(line =>
    /https?:\/\//i.test(line) ? line.split(/(?=https?:\/\/)|\s+/i) : [line]);
  const profiles = new Map<string, ArtistProfile>();
  let invalid = 0;
  for (const chunk of chunks) {
    const value = chunk.trim();
    if (!value) continue;
    const profile = artistProfile(value);
    if (!profile) { invalid++; continue; }
    if (!profiles.has(profile.key)) profiles.set(profile.key, profile);
  }
  if (profiles.size > 12 || !profiles.size) throw new Error("invalid");
  return { profiles: [...profiles.values()], invalid };
}
const validTag = (value: unknown): value is string =>
  typeof value === "string" && /^[\p{L}\p{N}_().'\u2019-]{1,160}$/u.test(value) && !value.startsWith("-");
const safeId = (id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0;
export function artistHit(raw: unknown, fromApi = false): ArtistHit | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const tag = fromApi ? row.name : row.tag;
  if (!safeId(row.id) || !validTag(tag) || row.is_deleted === true || row.is_banned === true) return null;
  const urls = Array.isArray(row.urls) ? row.urls.slice(0, 100).flatMap(value => {
    if (value && typeof value === "object") {
      if (value.is_active === false) return [];
      value = value.url;
    }
    const profile = typeof value === "string" && artistProfile(value);
    return profile && profile.isUrl ? [profile.value] : [];
  }) : [];
  return { id: row.id, tag, urls: [...new Set(urls)].slice(0, 20) };
}
export function matchesArtist(profile: ArtistProfile, hit: ArtistHit) {
  return profile.isUrl ? hit.urls.includes(profile.value) : hit.tag.toLowerCase() === profile.value.toLowerCase();
}
export function readArtistIndex(raw: string, imported = false): ArtistIndexRow[] {
  if (raw.length > artistIndexLimit || new TextEncoder().encode(raw).length > artistIndexLimit) throw new Error("invalid");
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !Array.isArray(data.artists) || data.artists.length > maxRows) throw new Error("invalid");
  return data.artists.map((row: Record<string, unknown>) => {
    const hit = artistHit(row);
    const savedAt = row?.savedAt;
    if (!hit?.urls.length || !safeId(savedAt) || savedAt > Date.now() + 300000) throw new Error("invalid");
    return { ...hit, savedAt, source: !imported && row.source === "danbooru" ? "danbooru" : "import" };
  });
}
export function mergeArtistIndex(old: ArtistIndexRow[], updates: ArtistIndexRow[]) {
  const rows = new Map<number, ArtistIndexRow>();
  for (const row of [...old, ...updates]) {
    const prior = rows.get(row.id);
    if (!prior || (row.source === prior.source && row.savedAt >= prior.savedAt) || row.source === "danbooru" && prior.source !== "danbooru") rows.set(row.id, row);
  }
  return [...rows.values()].sort((a, b) => b.savedAt - a.savedAt).slice(0, maxRows);
}
export function formatLookupPrompt(items: { tag: string; weight: number }[], v5: boolean) {
  return items.filter(row => validTag(row.tag)).map(({tag,weight}) => {
    const n = Number.isFinite(weight) ? Math.round(Math.max(0.01, Math.min(5, weight)) * 100) / 100 : 1;
    return v5 ? n + "::artist:" + tag + " ::" : n === 1 ? tag : n + "::" + tag + " ::";
  }).join(", ");
}
export function parseArtistPreviews(rows: unknown): ArtistPreview[] {
  if (!Array.isArray(rows)) throw new Error("network");
  return rows.flatMap(row => {
    if (!row || row.rating !== "g" || row.is_deleted === true || !safeId(row.id) || typeof row.created_at !== "string" ||
      !Number.isFinite(Date.parse(row.created_at))) return [];
    const url = row.preview_file_url;
    if (typeof url !== "string" || !/^https:\/\/(?:cdn\.donmai\.us|danbooru\.donmai\.us)\/[A-Za-z0-9/_-]+\.(?:jpg|jpeg|png|webp)$/i.test(url)) return [];
    return [{ id: row.id, url, createdAt: row.created_at }];
  }).sort((a,b) => b.id - a.id).slice(0, 4);
}
export function artistLookupRequest(kind: "identity" | "preview", input: string) {
  const url = new URL(kind === "identity" ? "/artists.json" : "/posts.json", "https://danbooru.donmai.us");
  const query = kind === "identity" && artistProfile(input);
  if (query) {
    url.search = new URLSearchParams({limit:"20", "search[is_deleted]":"false",
      [query.isUrl ? "search[url_matches]" : "search[any_name_matches]"]:query.value,
      only:"id,name,urls,is_deleted,is_banned"}).toString();
  } else if (kind === "preview" && validTag(input)) {
    url.search = new URLSearchParams({limit:"8", tags:input + " rating:g",
      only:"id,created_at,rating,is_deleted,preview_file_url"}).toString();
  } else throw new Error("invalid");
  return url;
}
