import type { ArtistRecipeComparison } from "./artist-recipe";
import type { HistoryItem } from "./types";

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

function parseFavoriteArray(value: string | null): SharedArtistFavorite[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed as SharedArtistFavorite[] : [];
  } catch {
    return [];
  }
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
  localStorage.setItem(FAVORITE_STORAGE_KEYS[collection], JSON.stringify(favorites));
  window.dispatchEvent(new CustomEvent(ARTIST_FAVORITES_CHANGED_EVENT, {
    detail: { collection },
  }));
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
