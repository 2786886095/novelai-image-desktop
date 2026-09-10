import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("axios", () => ({ default: { get: m.get } }));
vi.mock("./proxy", () => ({ proxyConfig: () => ({}) }));
import { createArtistPoolSyncManager, syncAllArtistTags } from "./artist-pool-sync";
const row = (id: number) => ({ id, name: `artist_${id}`, category: 1, post_count: id % 100, is_deprecated: false });
const page = (ids: number[]) => ({ data: ids.map(row) });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10000); m.get.mockReset(); });
afterEach(() => { vi.useRealTimers(); });
const run = async (options: Parameters<typeof syncAllArtistTags>[0] = {}) => { const result = syncAllArtistTags(options); await vi.runAllTimersAsync(); return result; };
it("traverses beyond 5000 artists by stable cursor until the empty terminal page", async () => {
  const all = Array.from({ length: 6005 }, (_, i) => row(6005 - i));
  m.get.mockImplementation((_url, { params }) => ({ data: all.filter(r => params.page === 1 || r.id < Number(params.page.slice(1))).slice(0, 1000) }));
  const progress: number[] = [];
  const result = await run({ onProgress: p => progress.push(p.loaded) });
  expect(result).toMatchObject({ complete: true, requested: "all", rankedCount: 6005, pages: 7, issue: null });
  expect(result.items).toHaveLength(6005); expect(new Set(result.items.map(r => r.id)).size).toBe(6005);
  expect(m.get.mock.calls.map(c => c[1].params.page)).toEqual([1, "b5006", "b4006", "b3006", "b2006", "b1006", "b6", "b1"]);
  expect(progress.at(-1)).toBe(6005);
  expect(result.items.every((v, i, a) => !i || a[i-1].postCount >= v.postCount)).toBe(true);
});
it("keeps zero-post artists and verifies exhaustion even after a short page", async () => {
  m.get.mockResolvedValueOnce(page([300, 200])).mockResolvedValueOnce(page([100])).mockResolvedValueOnce({ data: [] });
  const r = await run(); expect(r.complete).toBe(true); expect(r.items).toHaveLength(3); expect(r.items.every(a => a.postCount === 0)).toBe(true);
  expect(m.get).toHaveBeenCalledTimes(3);
});
it("does not skip records when popularity changes between pages", async () => {
  m.get.mockResolvedValueOnce({ data: [row(200), { ...row(199), post_count: 99999 }] }).mockResolvedValueOnce(page([1])).mockResolvedValueOnce({ data: [] });
  const r = await run(); expect(r.items.map(a => a.id)).toEqual([199, 1, 200]);
  expect(m.get.mock.calls[1][1].params).toMatchObject({ page: "b199", "search[order]": "date" });
});
it.each(["<html>blocked</html>", {}, [null], [{ ...row(1), category: 0 }], [{ ...row(1), is_deprecated: true }]])("rejects malformed page %j, never a partial full library", async data => {
  m.get.mockResolvedValueOnce(page([3])).mockResolvedValueOnce({ data });
  const r = await run(); expect(r.complete).toBe(false); expect(r.items).toEqual([]); expect(r.issue).toBe("invalid-response");
});
it("stops a repeated cursor page instead of looping forever", async () => {
  m.get.mockResolvedValue(page([3, 2, 1]));
  expect(await run()).toMatchObject({ complete: false, items: [], issue: "repeated-page" }); expect(m.get).toHaveBeenCalledTimes(2);
});
it("bounds retry attempts and never exposes raw error text", async () => {
  m.get.mockRejectedValue({ code: "ETIMEDOUT", message: "SECRET" });
  const r = await run(); expect(m.get).toHaveBeenCalledTimes(4); expect(r.issue).toBe("timeout"); expect(JSON.stringify(r)).not.toContain("SECRET");
});
it("honors Retry-After on the same cursor and reports waiting progress", async () => {
  m.get.mockRejectedValueOnce({ response: { status: 429, headers: { "retry-after": "5" } } }).mockResolvedValueOnce(page([1])).mockResolvedValueOnce({ data: [] });
  const progress: any[] = []; const start = Date.now();
  expect((await run({ onProgress: p => progress.push(p) })).complete).toBe(true);
  expect(progress.some(p => p.state === "retrying" && p.retryAfterMs === 5000)).toBe(true);
  expect(Date.now() - start).toBeGreaterThanOrEqual(6000); expect(m.get.mock.calls[0][1].params.page).toBe(m.get.mock.calls[1][1].params.page);
});
it("cancels during backoff without returning partial candidates", async () => {
  const controller = new AbortController(); m.get.mockRejectedValue({ response: { status: 429 } });
  const r = await run({ signal: controller.signal, onProgress: p => { if (p.state === "retrying") controller.abort(); } });
  expect(r).toMatchObject({ issue: "cancelled", complete: false, items: [] }); expect(m.get).toHaveBeenCalledTimes(1);
});
it("distinguishes a genuinely empty first response from a completed library", async () => {
  m.get.mockResolvedValue({ data: [] }); expect(await run()).toMatchObject({ complete: false, issue: "empty-response" });
});
it("later refresh re-reads all data instead of returning a completed promise/cache", async () => {
  m.get.mockResolvedValueOnce(page([1])).mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce(page([2,1])).mockResolvedValueOnce({ data: [] });
  expect((await run()).items).toHaveLength(1); expect((await run()).items).toHaveLength(2);
});
it("manager deduplicates one job and cancels only a matching renderer/request", async () => {
  m.get.mockRejectedValue({ response: { status: 429 } }); const manager = createArtistPoolSyncManager();
  const a = manager.start(1, "A", () => {}), duplicate = manager.start(1, "A", () => {});
  expect(a).toBe(duplicate); expect(manager.cancel(2, "A")).toBe(false); expect(manager.cancel(1, "wrong")).toBe(false);
  expect(manager.cancel(1, "A")).toBe(true); await vi.runAllTimersAsync(); expect((await a).issue).toBe("cancelled");
});
it("superseding a request and renderer destruction cancel only owned jobs", async () => {
  m.get.mockRejectedValue({ response: { status: 429 } }); const manager = createArtistPoolSyncManager();
  const a=manager.start(1,"A",()=>{}),b=manager.start(1,"B",()=>{}),c=manager.start(2,"C",()=>{});
  manager.dispose(1);manager.cancel(2,"C");await vi.runAllTimersAsync();
  expect((await Promise.all([a,b,c])).every(r=>r.issue==="cancelled")).toBe(true);
});
