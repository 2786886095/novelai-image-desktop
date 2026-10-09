import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";

const state = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  history: [] as unknown[],
  workbench: Buffer.alloc(0),
}));
vi.mock("./store", () => ({
  getSettings: () => state.settings,
  addHistory: (items: unknown[]) => { state.history.push(...items); },
  getHistoryGroups: () => [],
}));
vi.mock("./nai", () => ({ readWorkbenchImage: async () => ({ buffer: state.workbench }) }));
vi.mock("./proxy", () => ({ proxyConfigForUrl: async () => undefined }));
vi.mock("./local-media-protocol", () => ({ toLocalMediaUrl: (file: string) => `local://${file}` }));

import { openAIInpaintWorkbench } from "./openai-image-edit-workbench";

const servers: http.Server[] = [];
let outputDir = "";
beforeEach(() => {
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "oai-edit-"));
  state.history = [];
});
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => { s.closeAllConnections(); s.close(() => r()); })));
  fs.rmSync(outputDir, { recursive: true, force: true });
});
async function redServer() {
  let calls = 0;
  const s = http.createServer(async (req, res) => {
    calls += 1;
    for await (const _ of req) { /* drain */ }
    const red = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#ff0000" } }).png().toBuffer();
    res.end(JSON.stringify({ data: [{ b64_json: red.toString("base64") }] }));
  });
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(s.address() as import("node:net").AddressInfo).port}/v1`, calls: () => calls };
}

describe("openAIInpaintWorkbench", () => {
  it("edits only the focused region, keeps every other pixel and records an OpenAI history item", async () => {
    const server = await redServer();
    state.workbench = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#0000ff" } }).png().toBuffer();
    state.settings = {
      outputDir,
      openaiImageEdit: { baseUrl: server.url, model: "gpt-image-2.5-sunburst", quality: "auto", inputFidelity: "", size: "fit" },
      openaiImageEditApiKey: "k",
    };
    const mask = Buffer.alloc(200 * 100 * 4);
    for (let y = 40; y < 60; y += 1) for (let x = 120; x < 140; x += 1) mask.fill(255, (y * 200 + x) * 4, (y * 200 + x) * 4 + 4);
    const result = await openAIInpaintWorkbench({
      prompt: "red square",
      maskBase64: (await sharp(mask, { raw: { width: 200, height: 100, channels: 4 } }).png().toBuffer()).toString("base64"),
      region: { x: 100, y: 20, width: 64, height: 64 },
    });
    expect(result.ok).toBe(true);
    expect(server.calls()).toBe(1);
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item).toMatchObject({ generationProvider: "openai-images", model: "gpt-image-2.5-sunburst", width: 200, height: 100 });
    expect(item.compatibleRequest).toMatchObject({ endpoint: "images/edits", size: "1024x1024", mask: true });
    expect(JSON.stringify(item)).not.toContain("\"k\"");
    expect(state.history).toHaveLength(1);
    const saved = await sharp(item.filePath).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => [...saved.data.subarray((y * 200 + x) * saved.info.channels, (y * 200 + x) * saved.info.channels + 3)];
    const masked = px(130, 50); // masked: provider pixels (seam colour matching may shift them slightly)
    expect(masked[0]).toBeGreaterThan(200);
    expect(masked[2]).toBeLessThan(60);
    expect(px(10, 10)).toEqual([0, 0, 255]);  // outside the region
    expect(px(105, 25)).toEqual([0, 0, 255]); // inside the region but outside the mask
  });

  it("refuses without configuration and never calls the network", async () => {
    const server = await redServer();
    state.workbench = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).png().toBuffer();
    state.settings = { outputDir, openaiImageEdit: { baseUrl: server.url }, openaiImageEditApiKey: "" };
    const result = await openAIInpaintWorkbench({ prompt: "x", maskBase64: "AAAA" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/OpenAI 图像编辑/);
    expect(server.calls()).toBe(0);
  });
});
