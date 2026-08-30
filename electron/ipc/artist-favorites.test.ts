import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  artistFavoriteLibraryPath,
  loadArtistFavoriteLibrary,
  saveArtistFavoriteCollection,
} from "./artist-favorites";

const roots: string[] = [];

async function temporaryRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "nai-artist-favorites-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("durable artist favorite library", () => {
  it("serializes simultaneous updates without mixing the three collections", async () => {
    const root = await temporaryRoot();
    await Promise.all([
      saveArtistFavoriteCollection(root, "random", [{ id: "random-a" }]),
      saveArtistFavoriteCollection(root, "v5-repair", [{ id: "repair-a" }]),
      saveArtistFavoriteCollection(root, "artist-string-draw", [{ id: "draw-a" }]),
    ]);

    const library = await loadArtistFavoriteLibrary(root);
    expect(library.collections.random).toEqual([{ id: "random-a" }]);
    expect(library.collections["v5-repair"]).toEqual([{ id: "repair-a" }]);
    expect(library.collections["artist-string-draw"]).toEqual([{ id: "draw-a" }]);
  });

  it("falls back to the previous complete backup when the primary file is corrupt", async () => {
    const root = await temporaryRoot();
    await saveArtistFavoriteCollection(root, "random", [{ id: "safe-copy" }]);
    await saveArtistFavoriteCollection(root, "random", [{ id: "new-copy" }]);
    await fs.writeFile(artistFavoriteLibraryPath(root), "{truncated", "utf8");

    const library = await loadArtistFavoriteLibrary(root);
    expect(library.collections.random).toEqual([{ id: "safe-copy" }]);
  });

  it("does not overwrite a good backup with a corrupt primary during repair", async () => {
    const root = await temporaryRoot();
    const target = artistFavoriteLibraryPath(root);
    await saveArtistFavoriteCollection(root, "random", [{ id: "safe-copy" }]);
    await saveArtistFavoriteCollection(root, "random", [{ id: "newer-copy" }]);
    await fs.writeFile(target, "{truncated", "utf8");

    await saveArtistFavoriteCollection(root, "v5-repair", [{ id: "repair" }]);

    const backup = JSON.parse(await fs.readFile(`${target}.bak`, "utf8"));
    expect(backup.collections.random).toEqual([{ id: "safe-copy" }]);
    const library = await loadArtistFavoriteLibrary(root);
    expect(library.collections.random).toEqual([{ id: "safe-copy" }]);
    expect(library.collections["v5-repair"]).toEqual([{ id: "repair" }]);
  });

  it("treats parseable but incomplete primary data as corrupt and uses the backup", async () => {
    const root = await temporaryRoot();
    const target = artistFavoriteLibraryPath(root);
    await saveArtistFavoriteCollection(root, "random", [{ id: "safe-copy" }]);
    await saveArtistFavoriteCollection(root, "random", [{ id: "newer-copy" }]);
    await fs.writeFile(target, JSON.stringify({ version: 1, collections: {} }), "utf8");

    const library = await loadArtistFavoriteLibrary(root);
    expect(library.collections.random).toEqual([{ id: "safe-copy" }]);
  });
});
