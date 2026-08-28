import type { ArtistRecipeComparison } from "./artist-recipe";
import type { HistoryItem } from "./types";

export const RANDOM_ARTIST_SESSION_STORAGE_KEY = "langbai.artist-lab.random.v6";
export const ARTIST_FAVORITES_CHANGED_EVENT = "langbai:artist-favorites-changed";

export type ArtistFavoriteCollection = "v5-repair" | "artist-string-draw";

const FAVORITE_STORAGE_KEYS: Record<ArtistFavoriteCollection, string> = {
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

function readCollection(collection: ArtistFavoriteCollection): SharedArtistFavorite[] {
  try {
    const value = JSON.parse(localStorage.getItem(FAVORITE_STORAGE_KEYS[collection]) ?? "[]");
    return Array.isArray(value) ? value as SharedArtistFavorite[] : [];
  } catch {
    return [];
  }
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
