import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createImageSaveTracker, settleImageSave, type ImageSaveNotice } from "./image-save-feedback";

const pending: ImageSaveNotice = { id: 1, kind: "download", state: "pending", total: 3 };
describe("image save feedback", () => {
  it("treats cancellation as cancellation even when the backend returns ok", () => {
    expect(settleImageSave(pending, { ok: true, cancelled: true }).state).toBe("cancelled");
    expect(settleImageSave(pending, { ok: false, cancelled: true }).state).toBe("cancelled");
  });
  it("reports partial saves with their real folder and counts", () => {
    expect(settleImageSave(pending, { ok: true, savedPaths: ["a", "b"], failed: 1, outputDir: "D:/Saved" })).toMatchObject({ state: "partial", saved: 2, failed: 1, path: "D:/Saved" });
  });
  it("never reports a zero-file download as success", () => {
    expect(settleImageSave(pending, { ok: true, savedPaths: [], failed: 0 }).state).toBe("error");
  });
  it("retains actual save-as path and ZIP counts", () => {
    expect(settleImageSave(pending, { ok: true, filePath: "D:/Saved/a.webp" })).toMatchObject({ state: "success", saved: 1, path: "D:/Saved/a.webp" });
    expect(settleImageSave(pending, { ok: true, path: "D:/Saved/a.zip", count: 8, failed: 2 })).toMatchObject({ state: "partial", saved: 8, failed: 2 });
  });
  it("announces immediately, deduplicates the same task, and finishes after a real write", async () => {
    const dir = await mkdtemp(join(tmpdir(), "save-feedback-"));
    try {
      const path = join(dir, "saved.txt");
      const tracker = createImageSaveTracker();
      const events: ImageSaveNotice[][] = [];
      tracker.subscribe(value => events.push(value));
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const operation = vi.fn(async () => { await gate; await writeFile(path, "saved bytes"); return { ok: true, filePath: path }; });
      const first = tracker.run("same", "image", operation, 1);
      const second = tracker.run("same", "image", operation, 1);
      expect(first).toBe(second);
      expect(events.at(-1)?.[0].state).toBe("pending");
      await expect(readFile(path)).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(1);
      release(); await first;
      expect(await readFile(path, "utf8")).toBe("saved bytes");
      expect(events.at(-1)?.[0]).toMatchObject({ state: "success", path });
      tracker.dismiss(1);
      expect(events.at(-1)).toEqual([]);
    } finally { await rm(join(dir, "saved.txt"), { force: true }); await rmdir(dir); }
  });
  it("keeps concurrent tasks separate when they finish out of order", async () => {
    const tracker = createImageSaveTracker(); let latest: ImageSaveNotice[] = [];
    tracker.subscribe(value => { latest = value; });
    let release!: () => void;
    const first = tracker.run("slow", "image", () => new Promise<{ok:boolean;filePath:string}>(resolve => { release = () => resolve({ ok: true, filePath: "a" }); }));
    await tracker.run("fast", "image", async () => ({ ok: false }));
    expect(latest.map(item => item.state)).toEqual(["pending", "error"]);
    release(); await first;
    expect(latest.map(item => item.state)).toEqual(["success", "error"]);
  });
  it("does not hide active saves and replays them to a newly mounted view", async () => {
    const tracker = createImageSaveTracker(); let release!: () => void;
    const task = tracker.run("save", "image", () => new Promise<{ok:boolean}>(resolve => { release = () => resolve({ ok: true }); }));
    tracker.dismiss(1);
    const listener = vi.fn(); const stop = tracker.subscribe(listener);
    expect(listener.mock.calls[0][0][0].state).toBe("pending");
    stop(); await Promise.resolve(); release(); await task;
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("reports write errors without leaking raw URLs and permits explicit retry", async () => {
    const tracker = createImageSaveTracker(); let latest: ImageSaveNotice[] = [];
    tracker.subscribe(value => { latest = value; });
    await expect(tracker.run("save", "image", async () => { throw Object.assign(new Error("private URL"), { code: "ENOSPC" }); })).rejects.toThrow();
    expect(latest[0]).toMatchObject({ state: "error", errorCode: "ENOSPC" });
    expect(JSON.stringify(latest)).not.toContain("private URL");
    await tracker.run("save", "image", async () => ({ ok: true, filePath: "a" }));
    expect(latest[1].state).toBe("success");
  });
});
