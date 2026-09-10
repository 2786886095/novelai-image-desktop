import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ dir: "", get: vi.fn() }));
vi.mock("axios", () => ({ default: { get: m.get } }));
vi.mock("electron", () => ({ app: { getPath: () => m.dir }, dialog: {}, nativeImage: {} }));
vi.mock("./proxy", () => ({ proxyConfig: () => ({}) }));
vi.mock("./image-codec", () => ({ processableImage: vi.fn() }));
import { loadPopularArtistPool, loadPopularArtistTags } from "./artist-lab";
const artists = (count: number, start = 1) => Array.from({ length: count }, (_, i) => ({ id: i + start, name: `fixture_${i + start}`, postCount: 100000 - i - start, deprecated: false }));
const response = (count: number, start = 1) => ({ data: artists(count, start).map(a => ({ ...a, category: 1, post_count: a.postCount, is_deprecated: false })) });
const file = () => path.join(m.dir, "artist-lab-popular-artists.json");
const cache = (count = 200, savedAt = 1) => { const raw = JSON.stringify({ savedAt, items: artists(count) }); fs.writeFileSync(file(), raw); return raw; };
beforeEach(() => { m.dir = fs.mkdtempSync(path.join(os.tmpdir(), "artist-pool-test-")); m.get.mockReset(); });
afterEach(() => { fs.rmSync(m.dir, { recursive: true, force: true }); });

it("first-run offline reports failure with no static candidates", async () => {
  m.get.mockRejectedValue({ code: "ETIMEDOUT" });
  expect(await loadPopularArtistPool(1000)).toMatchObject({ source: "empty", items: [], rankedCount: 0, savedAt: null, issue: "timeout" });
  expect(fs.existsSync(file())).toBe(false);
});
it.each([403, 429, 500])("HTTP %s never substitutes cached candidates or leaks raw errors", async status => {
  const raw = cache(200, Date.now()); m.get.mockRejectedValue({ response: { status }, message: "SECRET_URL" });
  const pool = await loadPopularArtistPool(1000);
  expect(pool).toMatchObject({ source: "empty", items: [], httpStatus: status, issue: "network" });
  expect(JSON.stringify(pool)).not.toContain("SECRET_URL"); expect(fs.readFileSync(file(), "utf8")).toBe(raw);
});
it.each(["<html>blocked</html>", { error: "blocked" }, []])("invalid/empty response %j reports failure without overwriting cache", async data => {
  const raw = cache(); m.get.mockResolvedValue({ data });
  const pool = await loadPopularArtistPool(1000);
  expect(pool.source).toBe("empty"); expect(pool.items).toEqual([]); expect(pool.issue).not.toBeNull();
  expect(fs.readFileSync(file(), "utf8")).toBe(raw);
});
it("corrupt cache plus offline never activates a bundled fallback", async () => {
  fs.writeFileSync(file(), "{broken"); m.get.mockRejectedValue(new Error("offline"));
  expect((await loadPopularArtistPool(1000)).items).toEqual([]);
  expect(fs.readFileSync(file(), "utf8")).toBe("{broken");
});
it("requests live data even with a fresh sufficiently large cache", async () => {
  cache(2000, Date.now()); m.get.mockResolvedValue(response(100, 50000));
  const pool = await loadPopularArtistPool(100);
  expect(m.get).toHaveBeenCalledTimes(1); expect(pool.source).toBe("network");
  expect(pool.items).toEqual(artists(100, 50000));
});
it("uses fixed page sizes starting at page one regardless of partial cache", async () => {
  cache(150); m.get.mockImplementation((_url, o) => Promise.resolve(response(1000, (o.params.page - 1) * 1000 + 1)));
  const pool = await loadPopularArtistPool(1250);
  expect(pool.items.map(a => a.id)).toEqual(artists(1250).map(a => a.id));
  expect(m.get.mock.calls.map(c => [c[1].params.limit, c[1].params.page])).toEqual([[1000, 1], [1000, 2]]);
});
it("loads at most 5000 artists with five bounded requests", async () => {
  m.get.mockImplementation((_url, o) => Promise.resolve(response(1000, (o.params.page - 1) * 1000 + 1)));
  expect((await loadPopularArtistPool(5000)).items).toHaveLength(5000); expect(m.get).toHaveBeenCalledTimes(5);
});
it("rejects repeated pages rather than publishing partial candidates", async () => {
  m.get.mockResolvedValue(response(1000));
  expect(await loadPopularArtistPool(5000)).toMatchObject({ source: "empty", issue: "repeated-page", items: [] });
  expect(m.get).toHaveBeenCalledTimes(2); expect(fs.existsSync(file())).toBe(false);
});
it("rejects page-two failure without reusing partial or cached rankings", async () => {
  const raw = cache(2000); m.get.mockResolvedValueOnce(response(1000)).mockRejectedValueOnce({ code: "ECONNABORTED" });
  expect(await loadPopularArtistPool(2000)).toMatchObject({ source: "empty", issue: "timeout", items: [] });
  expect(fs.readFileSync(file(), "utf8")).toBe(raw);
});
it("returns only actual online records even when a larger old cache exists", async () => {
  const raw = cache(2000); m.get.mockResolvedValue(response(100, 50000));
  const pool = await loadPopularArtistPool(1000);
  expect(pool).toMatchObject({ source: "network", rankedCount: 100, issue: null });
  expect(pool.items).toHaveLength(100); expect(fs.readFileSync(file(), "utf8")).toBe(raw);
});
it("deduplicates concurrent requests but a later load always re-requests", async () => {
  m.get.mockResolvedValue(response(100));
  const a = loadPopularArtistPool(100), b = loadPopularArtistPool(100);
  expect(a).toBe(b); await Promise.all([a, b]); expect(m.get).toHaveBeenCalledTimes(1);
  await loadPopularArtistPool(100); expect(m.get).toHaveBeenCalledTimes(2);
  m.get.mockRejectedValue(new Error("offline"));
  expect((await loadPopularArtistPool(100)).items).toEqual([]); expect(m.get).toHaveBeenCalledTimes(3);
});
it("does not break the separate similarity-scoring cache", async () => {
  cache(200, Date.now());
  expect(await loadPopularArtistTags(100, false)).toHaveLength(100); expect(m.get).not.toHaveBeenCalled();
});
it("legacy scoring loads also never inject static candidates", async () => {
  m.get.mockRejectedValue(new Error("offline")); await expect(loadPopularArtistTags(100, true)).rejects.toThrow();
  m.get.mockResolvedValue(response(100)); expect(await loadPopularArtistTags(100, true)).toHaveLength(100);
});
it("persists only ranked records and reports exact counts with no extra names", async () => {
  m.get.mockResolvedValue(response(100));
  const pool = await loadPopularArtistPool(100);
  expect(pool.items).toEqual(artists(100)); expect(pool.rankedCount).toBe(100);
  expect(JSON.parse(fs.readFileSync(file(), "utf8")).items).toHaveLength(100);
  expect(fs.readdirSync(m.dir)).toEqual(["artist-lab-popular-artists.json"]);
});
it("filters invalid IDs, categories, deprecated records and duplicates", async () => {
  m.get.mockResolvedValue({ data: [
    { id: 1, name: "Same Name", category: 1 }, { id: 2, name: "same_name", category: 1 },
    { id: 0, name: "bad", category: 1 }, { id: 3, name: "general", category: 0 },
    { id: 4, name: "old", category: 1, is_deprecated: true },
  ] });
  const pool = await loadPopularArtistPool(100); expect(pool.rankedCount).toBe(1); expect(pool.items).toHaveLength(1);
});
