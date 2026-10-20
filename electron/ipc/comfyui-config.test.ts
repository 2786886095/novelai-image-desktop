import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendResultRecords, clearOwnedMarker, comfyDataDir, deleteWorkflowRecord,
  listResultRecords, listWorkflowRecords, readComfySettings, readOwnedMarker,
  readRunReceipt, readWorkflowRecord, renameWorkflowRecord, saveWorkflowRecord,
  writeComfySettings, writeOwnedMarker, writeRunReceipt,
} from "./comfyui-config";

const evidenceBase = process.env.COMFY_TEST_EVIDENCE_ROOT ?? path.join(os.tmpdir(), "comfy-config-tests");
async function root() { await fs.mkdir(evidenceBase, { recursive: true }); return fs.mkdtemp(path.join(evidenceBase, "store-")); }
function record(id: string) { return { id, name: id, createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z", apiPrompt: { "1": { class_type: "SaveImage", inputs: { filename_prefix: id } } }, slots: [{ id: "prompt", value: "full parameters" }] }; }
afterEach(() => vi.restoreAllMocks());

describe("independent durable ComfyUI store", () => {
  it("writes only its dedicated directory and preserves the NovelAI store bytes", async () => {
    const userData = await root(); const original = Buffer.from('{"account":"unchanged"}\n');
    const main = path.join(userData, "novelai-image-desktop.json"); await fs.writeFile(main, original);
    await writeComfySettings(userData, { port: 8188, extraArgs: ["--lowvram"] });
    expect(await readComfySettings(userData)).toEqual({ port: 8188, extraArgs: ["--lowvram"] });
    expect(await fs.readFile(main)).toEqual(original);
    expect(createHash("sha256").update(await fs.readFile(main)).digest("hex")).toBe(createHash("sha256").update(original).digest("hex"));
    expect((await fs.readdir(userData)).sort()).toEqual(["comfyui-local", "novelai-image-desktop.json"]);
  });

  it("retains a complete previous backup and leaves no temporary file", async () => {
    const userData = await root();
    await writeComfySettings(userData, { port: 8188 }); await writeComfySettings(userData, { port: 8189 });
    const dir = comfyDataDir(userData);
    expect(JSON.parse(await fs.readFile(path.join(dir, "settings.json.bak"), "utf8")).data).toEqual({ port: 8188 });
    expect((await fs.readdir(dir)).filter((file) => file.endsWith(".tmp"))).toEqual([]);
  });

  it("quarantines corrupt primary bytes and repairs from known-good backup", async () => {
    const userData = await root();
    await writeComfySettings(userData, { port: 8188 }); await writeComfySettings(userData, { port: 8189 });
    const dir = comfyDataDir(userData); await fs.writeFile(path.join(dir, "settings.json"), "{truncated");
    expect(await readComfySettings(userData)).toEqual({ port: 8188 });
    const corrupt = (await fs.readdir(dir)).find((file) => file.startsWith("settings.json.corrupt-"));
    expect(corrupt).toBeTruthy(); expect(await fs.readFile(path.join(dir, corrupt!), "utf8")).toBe("{truncated");
    expect(JSON.parse(await fs.readFile(path.join(dir, "settings.json.bak"), "utf8")).data).toEqual({ port: 8188 });
    expect(JSON.parse(await fs.readFile(path.join(dir, "settings.json"), "utf8")).data).toEqual({ port: 8188 });
  });

  it("quarantines valid JSON with wrong schema and rejects hostile object keys", async () => {
    const userData = await root(); const dir = comfyDataDir(userData); await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, "settings.json"), '{"version":2,"data":[]}');
    expect(await readComfySettings(userData, { port: 8188 })).toEqual({ port: 8188 });
    await expect(writeComfySettings(userData, JSON.parse('{"__proto__":{"polluted":true}}'))).rejects.toThrow("Unsafe");
    await expect(writeComfySettings(userData, { bad: Number.NaN })).rejects.toThrow("JSON");
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("serializes concurrent workflows without losing graphs and parameters", async () => {
    const userData = await root();
    await Promise.all(Array.from({ length: 20 }, (_, i) => saveWorkflowRecord(userData, record(`workflow-${i}`))));
    expect(await listWorkflowRecords(userData)).toHaveLength(20);
    expect(await readWorkflowRecord(userData, "workflow-8")).toEqual(record("workflow-8"));
    await renameWorkflowRecord(userData, "workflow-8", "  renamed  ");
    expect((await readWorkflowRecord(userData, "workflow-8"))?.name).toBe("renamed");
    expect((await readWorkflowRecord(userData, "workflow-8"))?.apiPrompt).toEqual(record("workflow-8").apiPrompt);
    expect(await deleteWorkflowRecord(userData, "workflow-8")).toBe(true);
    expect(await readWorkflowRecord(userData, "workflow-8")).toBeNull();
    expect(await listWorkflowRecords(userData)).toHaveLength(19);
    expect(await deleteWorkflowRecord(userData, "workflow-8")).toBe(false);
  });

  it("validates ids and record schemas before changing a workflow index", async () => {
    const userData = await root(); await saveWorkflowRecord(userData, record("valid"));
    await expect(readWorkflowRecord(userData, "../outside")).rejects.toThrow("id");
    await expect(saveWorkflowRecord(userData, { ...record("invalid"), updatedAt: "not-date" })).rejects.toThrow("record");
    await expect(renameWorkflowRecord(userData, "valid", "  ")).rejects.toThrow("name");
    expect(await listWorkflowRecords(userData)).toHaveLength(1);
  });

  it("stores independent result index and lossless reproducibility receipts", async () => {
    const userData = await root();
    const result = { id: "result-1", runId: "run-1", promptId: "prompt-1", filePath: path.join(userData, "output", "ComfyUI", "a.png"), sha256: "abc", source: "ComfyUI" };
    await appendResultRecords(userData, [result]);
    expect(await listResultRecords(userData)).toEqual([result]);
    await expect(appendResultRecords(userData, [result])).rejects.toThrow("Duplicate");
    expect(await listResultRecords(userData)).toEqual([result]);
    const receipt = { prompt: record("wf").apiPrompt, slotValues: { text: "complete text", seed: 1234 }, state: "failed", originalWorkflow: record("wf") };
    await writeRunReceipt(userData, "run-1", receipt);
    expect(await readRunReceipt(userData, "run-1")).toEqual(receipt);
    expect(await readRunReceipt(userData, "missing")).toBeNull();
    await expect(writeRunReceipt(userData, "../escape", receipt)).rejects.toThrow("id");
    expect(await fs.readdir(userData)).not.toContain("history.json");
  });

  it("persists markers only as informational records and clears just its own marker", async () => {
    const userData = await root(); const marker = { pid: 1234, token: "session-test", port: 8188 };
    await writeOwnedMarker(userData, marker); expect(await readOwnedMarker(userData)).toEqual(marker);
    await expect(writeOwnedMarker(userData, { pid: -2 })).rejects.toThrow("value");
    await clearOwnedMarker(userData); expect(await readOwnedMarker(userData)).toBeNull();
    await clearOwnedMarker(userData);
  });

  it("does not follow a junction replacing its dedicated data directory", async () => {
    const userData = await root(); const outside = await root();
    await fs.writeFile(path.join(outside, "sentinel.txt"), "untouched");
    await fs.symlink(outside, comfyDataDir(userData), process.platform === "win32" ? "junction" : "dir");
    await expect(writeComfySettings(userData, { port: 8188 })).rejects.toThrow("symbolic");
    expect(await fs.readdir(outside)).toEqual(["sentinel.txt"]);
  });

  it("retries transient Windows rename locks without using a partial-copy fallback", async () => {
    const userData = await root(); const rename = fs.rename.bind(fs); let attempts = 0;
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      attempts++;
      if (attempts <= 2) throw Object.assign(new Error("fixture lock"), { code: "EBUSY" });
      return rename(from, to);
    });
    await writeComfySettings(userData, { port: 8190 });
    expect(attempts).toBe(3); expect(await readComfySettings(userData)).toEqual({ port: 8190 });
  });

  it("refuses to silently replace an unrecoverable workflow/result index with an empty one", async () => {
    const userData = await root(); await saveWorkflowRecord(userData, record("preserve"));
    const dir = comfyDataDir(userData), bytes = Buffer.from("{corrupt-original");
    await fs.writeFile(path.join(dir, "workflows.json"), bytes);
    await expect(listWorkflowRecords(userData)).rejects.toThrow("COMFY_STORE_CORRUPT");
    await expect(saveWorkflowRecord(userData, record("new"))).rejects.toThrow("COMFY_STORE_CORRUPT");
    const quarantined = (await fs.readdir(dir)).filter((name) => name.startsWith("workflows.json.corrupt-"));
    expect(quarantined).toHaveLength(1); expect(await fs.readFile(path.join(dir, quarantined[0]))).toEqual(bytes);
    await fs.writeFile(path.join(dir, "results.json"), "broken");
    await expect(listResultRecords(userData)).rejects.toThrow("COMFY_STORE_CORRUPT");
    await expect(appendResultRecords(userData, [])).rejects.toThrow("COMFY_STORE_CORRUPT");
  });

  it("quarantines invalid UTF-8 rather than replacing byte errors with new text", async () => {
    const userData = await root(), dir = comfyDataDir(userData); await fs.mkdir(dir);
    const bytes = Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]);
    await fs.writeFile(path.join(dir, "settings.json"), bytes);
    expect(await readComfySettings(userData, { safe: true })).toEqual({ safe: true });
    const quarantined = (await fs.readdir(dir)).find((name) => name.startsWith("settings.json.corrupt-"));
    expect(await fs.readFile(path.join(dir, quarantined!))).toEqual(bytes);
  });

  it("preserves legal workflow JSON deeper than 32 levels inside receipt envelopes", async () => {
    const userData = await root(); let nested: unknown = "leaf";
    for (let i = 0; i < 70; i++) nested = { child: nested };
    const receipt = { fullWorkflow: nested };
    await writeRunReceipt(userData, "deep-receipt", receipt);
    expect(await readRunReceipt(userData, "deep-receipt")).toEqual(receipt);
  });

});
