import fs from "node:fs/promises";
import path from "node:path";

export const ARTIST_FAVORITE_COLLECTIONS = [
  "random",
  "v5-repair",
  "artist-string-draw",
] as const;

export type ArtistFavoriteCollectionName = typeof ARTIST_FAVORITE_COLLECTIONS[number];

export interface ArtistFavoriteLibrarySnapshot {
  version: 1;
  updatedAt: string;
  collections: Record<ArtistFavoriteCollectionName, unknown[]>;
}

const FILE_NAME = "artist-favorites.v1.json";
const writeQueues = new Map<string, Promise<void>>();

function emptyLibrary(): ArtistFavoriteLibrarySnapshot {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    collections: {
      random: [],
      "v5-repair": [],
      "artist-string-draw": [],
    },
  };
}

function normalizeFavorites(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => (
    item !== null
    && typeof item === "object"
    && typeof (item as { id?: unknown }).id === "string"
  ));
}

function normalizeLibrary(value: unknown): ArtistFavoriteLibrarySnapshot | null {
  if (!value || typeof value !== "object") return null;
  const source = value as {
    version?: unknown;
    updatedAt?: unknown;
    collections?: unknown;
  };
  if (source.version !== 1 || !source.collections || typeof source.collections !== "object") {
    return null;
  }
  const collections = source.collections as Record<string, unknown>;
  if (!ARTIST_FAVORITE_COLLECTIONS.every((collection) => Array.isArray(collections[collection]))) {
    return null;
  }
  return {
    version: 1,
    updatedAt: typeof source.updatedAt === "string"
      ? source.updatedAt
      : new Date(0).toISOString(),
    collections: {
      random: normalizeFavorites(collections.random),
      "v5-repair": normalizeFavorites(collections["v5-repair"]),
      "artist-string-draw": normalizeFavorites(collections["artist-string-draw"]),
    },
  };
}

export function artistFavoriteLibraryPath(userDataRoot: string) {
  return path.join(userDataRoot, FILE_NAME);
}

async function readJson(filePath: string): Promise<ArtistFavoriteLibrarySnapshot | null> {
  try {
    return normalizeLibrary(JSON.parse(await fs.readFile(filePath, "utf8")));
  } catch {
    return null;
  }
}

/**
 * Read the durable favorite library. A rolling backup is kept beside the
 * primary file so a truncated write or disk interruption never turns into an
 * empty collection on the next launch.
 */
export async function loadArtistFavoriteLibrary(
  userDataRoot: string,
): Promise<ArtistFavoriteLibrarySnapshot> {
  const target = artistFavoriteLibraryPath(userDataRoot);
  return await readJson(target)
    ?? await readJson(`${target}.bak`)
    ?? emptyLibrary();
}

async function writeLibrary(
  userDataRoot: string,
  snapshot: ArtistFavoriteLibrarySnapshot,
) {
  await fs.mkdir(userDataRoot, { recursive: true });
  const target = artistFavoriteLibraryPath(userDataRoot);
  const temporary = `${target}.${process.pid}.tmp`;
  // Never replace a known-good backup with a corrupt/partial primary file.
  // This matters when recovery succeeded from .bak and the subsequent repair
  // write is interrupted before the new primary reaches disk.
  if (await readJson(target)) {
    await fs.copyFile(target, `${target}.bak`).catch(() => undefined);
  }
  await fs.writeFile(temporary, `${JSON.stringify(snapshot)}\n`, "utf8");
  try {
    await fs.rename(temporary, target);
  } catch {
    // Windows can reject replacing an existing file with rename. Copying the
    // fully-written temporary file still preserves the previous .bak.
    await fs.copyFile(temporary, target);
    await fs.unlink(temporary).catch(() => undefined);
  }
}

/** Serialize updates from different tools so two near-simultaneous saves do
 * not overwrite each other's independent favorite collection. */
export function saveArtistFavoriteCollection(
  userDataRoot: string,
  collection: ArtistFavoriteCollectionName,
  favorites: unknown,
): Promise<void> {
  if (!ARTIST_FAVORITE_COLLECTIONS.includes(collection)) {
    return Promise.reject(new TypeError("Unknown artist favorite collection."));
  }
  const root = path.resolve(userDataRoot);
  const previous = writeQueues.get(root) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const current = await loadArtistFavoriteLibrary(root);
    const snapshot: ArtistFavoriteLibrarySnapshot = {
      ...current,
      updatedAt: new Date().toISOString(),
      collections: {
        ...current.collections,
        [collection]: normalizeFavorites(favorites),
      },
    };
    await writeLibrary(root, snapshot);
  });
  writeQueues.set(root, next);
  const cleanup = () => {
    if (writeQueues.get(root) === next) writeQueues.delete(root);
  };
  void next.then(cleanup, cleanup);
  return next;
}
