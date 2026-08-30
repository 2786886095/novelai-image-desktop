import {
  canonicalArtistTagName,
  ensureTrailingPromptComma,
  parseArtistRecipe,
  type ArtistRecipeComparison,
} from "./artist-recipe";
import type { HistoryItem, NaiDesktopApi } from "./types";

export const RANDOM_ARTIST_SESSION_STORAGE_KEY = "langbai.artist-lab.random.v6";
export const ARTIST_FAVORITES_CHANGED_EVENT = "langbai:artist-favorites-changed";

export type ArtistFavoriteCollection = "random" | "v5-repair" | "artist-string-draw";

const RANDOM_ARTIST_LEGACY_SESSION_STORAGE_KEYS = [
  RANDOM_ARTIST_SESSION_STORAGE_KEY,
  "langbai.artist-lab.random.v5",
  "langbai.artist-lab.random.v4",
  "langbai.artist-lab.random.v3",
  "langbai.artist-lab.random.v2",
] as const;

const FAVORITE_STORAGE_KEYS: Record<ArtistFavoriteCollection, string> = {
  random: "langbai.artist-lab.random.favorites.v1",
  "v5-repair": "langbai.artist-lab.v5-repair.favorites.v1",
  "artist-string-draw": "langbai.artist-lab.artist-string-draw.favorites.v1",
};
const pendingFavoriteWrites = new Set<Promise<unknown>>();

export type SharedArtistFavorite = ArtistRecipeComparison & {
  sequence: number;
  status: "pending" | "generating" | "done" | "failed";
  image?: HistoryItem;
  error?: string;
  liked?: boolean;
  saving?: boolean;
  generationModel?: string;
  generationSeed?: number;
};

function normalizeFavoriteArray(value: unknown): SharedArtistFavorite[] {
  return Array.isArray(value)
    ? value.filter((item): item is SharedArtistFavorite => (
      item !== null
      && typeof item === "object"
      && typeof (item as { id?: unknown }).id === "string"
    ))
    : [];
}

function parseFavoriteArray(value: string | null): SharedArtistFavorite[] {
  try {
    return normalizeFavoriteArray(JSON.parse(value ?? "[]"));
  } catch {
    return [];
  }
}

function desktopApi(): Partial<NaiDesktopApi> | undefined {
  return (window as Window & { naiDesktop?: Partial<NaiDesktopApi> }).naiDesktop;
}

function favoriteIdentity(item: SharedArtistFavorite) {
  return item.image?.id ? `image:${item.image.id}` : `recipe:${item.id}`;
}

export function mergeArtistFavorites(
  ...sources: ReadonlyArray<readonly SharedArtistFavorite[]>
): SharedArtistFavorite[] {
  const merged: SharedArtistFavorite[] = [];
  const ids = new Set<string>();
  const identities = new Set<string>();
  for (const source of sources) {
    for (const item of source) {
      if (!item || typeof item.id !== "string") continue;
      const identity = favoriteIdentity(item);
      if (ids.has(item.id) || identities.has(identity)) continue;
      ids.add(item.id);
      identities.add(identity);
      merged.push(item);
    }
  }
  return merged;
}

/**
 * Every random-gacha favorite is promoted into durable image history before it
 * is added to localStorage. Rebuild a usable favorite card from that canonical
 * history record when a Chromium profile rename made localStorage look empty.
 */
export function recoverRandomArtistFavoritesFromHistory(
  history: readonly HistoryItem[],
  existing: readonly SharedArtistFavorite[] = [],
): SharedArtistFavorite[] {
  const recovered: SharedArtistFavorite[] = [];
  for (const image of history) {
    if (image.feature !== "artist-lab") continue;
    const prompt = image.params?.stylePrompt?.trim();
    if (!prompt) continue;
    let tokens: ReturnType<typeof parseArtistRecipe>;
    try {
      tokens = parseArtistRecipe(prompt);
    } catch {
      // One damaged legacy history item must not block every other favorite
      // from being restored and mirrored.
      continue;
    }
    const artists = tokens
      .filter((token) => token.kind === "artist" && token.weight > 0)
      .map((token) => ({
        name: canonicalArtistTagName(token.value.replace(/^artist\s*:/i, "")),
        weight: token.weight,
      }))
      .filter((artist) => artist.name);
    if (!artists.length) continue;
    const id = `history-${image.id}`;
    recovered.push({
      id,
      pairId: id,
      variant: "plain",
      sequence: existing.length + recovered.length + 1,
      status: "done",
      artists,
      auxiliary: tokens.filter((token) => token.kind !== "artist"),
      mutations: [],
      franchiseStyles: [],
      basePrompt: ensureTrailingPromptComma(prompt),
      prompt: ensureTrailingPromptComma(prompt),
      image,
      liked: true,
      generationModel: image.model,
      generationSeed: image.actualSeed,
    });
  }
  return mergeArtistFavorites(existing, recovered);
}

function migrateRandomFavorites(): SharedArtistFavorite[] {
  const key = FAVORITE_STORAGE_KEYS.random;
  const dedicated = localStorage.getItem(key);
  // Presence, including an intentionally empty array, marks the one-time
  // migration complete. Otherwise removed favorites would be resurrected from
  // a stale legacy session whenever the tool opens.
  if (dedicated !== null) return parseFavoriteArray(dedicated);

  const merged: SharedArtistFavorite[] = [];
  const seen = new Set<string>();
  for (const sessionKey of RANDOM_ARTIST_LEGACY_SESSION_STORAGE_KEYS) {
    try {
      const session = JSON.parse(localStorage.getItem(sessionKey) ?? "null") as {
        favorites?: unknown;
      } | null;
      const favorites = Array.isArray(session?.favorites)
        ? session.favorites as SharedArtistFavorite[]
        : [];
      for (const favorite of favorites) {
        if (!favorite || typeof favorite.id !== "string" || seen.has(favorite.id)) continue;
        seen.add(favorite.id);
        merged.push(favorite);
      }
    } catch {
      // A corrupt historical session must not hide intact favorites from the
      // remaining versions.
    }
  }
  localStorage.setItem(key, JSON.stringify(merged));
  return merged;
}

function readCollection(collection: ArtistFavoriteCollection): SharedArtistFavorite[] {
  if (collection === "random") return migrateRandomFavorites();
  return parseFavoriteArray(localStorage.getItem(FAVORITE_STORAGE_KEYS[collection]));
}

export function loadArtistFavorites(
  collection: ArtistFavoriteCollection,
): SharedArtistFavorite[] {
  return readCollection(collection);
}

export function replaceArtistFavorites(
  collection: ArtistFavoriteCollection,
  favorites: SharedArtistFavorite[],
) {
  writeArtistFavorites(collection, favorites, true);
}

function writeArtistFavorites(
  collection: ArtistFavoriteCollection,
  favorites: SharedArtistFavorite[],
  persistToFilesystem: boolean,
) {
  const normalized = normalizeFavoriteArray(favorites);
  localStorage.setItem(FAVORITE_STORAGE_KEYS[collection], JSON.stringify(normalized));
  if (persistToFilesystem) {
    const save = desktopApi()?.artistLabSaveFavoriteCollection;
    if (typeof save === "function") {
      const pending = save(collection, normalized);
      pendingFavoriteWrites.add(pending);
      void pending.finally(() => pendingFavoriteWrites.delete(pending)).catch(() => undefined);
    }
  }
  window.dispatchEvent(new CustomEvent(ARTIST_FAVORITES_CHANGED_EVENT, {
    detail: { collection },
  }));
}

/** Wait until every renderer-initiated favorite mirror has reached the durable
 * sidecar. Backup/export calls use this barrier so the newest click cannot be
 * omitted when the workspace category was intentionally deselected. */
export async function flushArtistFavoritePersistence(): Promise<void> {
  while (pendingFavoriteWrites.size > 0) {
    await Promise.allSettled([...pendingFavoriteWrites]);
  }
}

/** Merge the current Chromium profile, the filesystem backup, and promoted
 * random-gacha history. No source is deleted or overwritten before the union
 * has been written back to both storage layers. */
export async function hydrateArtistFavoriteLibrary(): Promise<void> {
  const desktop = desktopApi();
  if (
    typeof desktop?.artistLabLoadFavoriteLibrary !== "function"
    || typeof desktop.artistLabListPromotedFavorites !== "function"
  ) return;

  const [diskResult, historyResult] = await Promise.allSettled([
    desktop.artistLabLoadFavoriteLibrary(),
    desktop.artistLabListPromotedFavorites(),
  ]);
  const disk = diskResult.status === "fulfilled" ? diskResult.value?.collections : undefined;
  const promoted = historyResult.status === "fulfilled" ? historyResult.value : [];
  // A failed disk read is not the same thing as an empty disk collection. Keep
  // the intact filesystem sidecar untouched on transient IPC/read errors; only
  // refresh the Chromium copy until a later boot can merge all sources again.
  const canWriteFilesystem = diskResult.status === "fulfilled";

  const random = recoverRandomArtistFavoritesFromHistory(
    promoted,
    mergeArtistFavorites(
      loadArtistFavorites("random"),
      normalizeFavoriteArray(disk?.random),
    ),
  );
  const repair = mergeArtistFavorites(
    loadArtistFavorites("v5-repair"),
    normalizeFavoriteArray(disk?.["v5-repair"]),
  );
  const draw = mergeArtistFavorites(
    loadArtistFavorites("artist-string-draw"),
    normalizeFavoriteArray(disk?.["artist-string-draw"]),
  );

  writeArtistFavorites("random", random, canWriteFilesystem);
  writeArtistFavorites("v5-repair", repair, canWriteFilesystem);
  writeArtistFavorites("artist-string-draw", draw, canWriteFilesystem);
}

export function addArtistFavorite(
  collection: ArtistFavoriteCollection,
  favorite: SharedArtistFavorite,
) {
  const current = loadArtistFavorites(collection);
  replaceArtistFavorites(collection, [
    favorite,
    ...current.filter((item) => item.id !== favorite.id),
  ]);
}

export function removeArtistFavorite(
  collection: ArtistFavoriteCollection,
  id: string,
) {
  replaceArtistFavorites(
    collection,
    loadArtistFavorites(collection).filter((item) => item.id !== id),
  );
}
