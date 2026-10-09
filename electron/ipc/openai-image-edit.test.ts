import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import sharp from "sharp";
import { buildMultipartBody, runOpenAIImageEdit } from "./openai-image-edit";
import { DEFAULT_OPENAI_IMAGE_EDIT } from "../../src/openai-image-edit";

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => { s.closeAllConnections(); s.close(() => r()); })));
});
async function server(handle: http.RequestListener) {
  const s = http.createServer(handle);
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(s.address() as import("node:net").AddressInfo).port}`;
}
const key = "fixture-edit-key";

type Part = { name: string; filename?: string; data: Buffer };
function parseMultipart(body: Buffer, contentType: string): Part[] {
  const boundary = /boundary=(.+)$/.exec(contentType)![1];
  const parts: Part[] = [];
  const delimiter = Buffer.from(`--${boundary}`);
  let start = body.indexOf(delimiter) + delimiter.length;
  while (start > 0) {
    const next = body.indexOf(delimiter, start);
    if (next < 0) break;
    const chunk = body.subarray(start + 2, next - 2); // strip leading CRLF and trailing CRLF
    const split = chunk.indexOf("\r\n\r\n");
    const headers = chunk.subarray(0, split).toString("utf8");
    const name = /name="([^"]+)"/.exec(headers)![1];
    const filename = /filename="([^"]+)"/.exec(headers)?.[1];
    parts.push({ name, filename, data: chunk.subarray(split + 4) });
    start = next + delimiter.length;
  }
  return parts;
}

async function readBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** 120×80 source: left half blue, right half green. */
const source = () => sharp({ create: { width: 120, height: 80, channels: 3, background: "#0000ff" } })
  .composite([{ input: { create: { width: 60, height: 80, channels: 3, background: "#00ff00" } }, left: 60, top: 0 }])
  .png().toBuffer();
/** Alpha-encoded editor mask selecting x∈[20,40), y∈[20,60). */
const editorMask = async () => {
  const pixels = Buffer.alloc(120 * 80 * 4);
  for (let y = 20; y < 60; y += 1) for (let x = 20; x < 40; x += 1) pixels.fill(255, (y * 120 + x) * 4, (y * 120 + x) * 4 + 4);
  return sharp(pixels, { raw: { width: 120, height: 80, channels: 4 } }).png().toBuffer();
};

describe("runOpenAIImageEdit", () => {
  it("builds a well-formed multipart body", () => {
    const { body, contentType } = buildMultipartBody([["model", "m"], ["prompt", "hi"]], [{ name: "image", filename: "a.png", contentType: "image/png", data: Buffer.from([1, 2, 3]) }], "B");
    expect(contentType).toBe("multipart/form-data; boundary=B");
    const parts = parseMultipart(body, contentType);
    expect(parts.map((part) => part.name)).toEqual(["model", "prompt", "image"]);
    expect(parts[2].filename).toBe("a.png");
    expect([...parts[2].data]).toEqual([1, 2, 3]);
  });

  it("posts once to /images/edits with an OpenAI-style mask and pastes only the masked area back", async () => {
    let calls = 0;
    let seen: { parts: Part[]; auth?: string; url?: string } | null = null;
    const base = await server(async (req, res) => {
      calls += 1;
      const parts = parseMultipart(await readBody(req), String(req.headers["content-type"]));
      seen = { parts, auth: req.headers.authorization, url: req.url };
      const size = parts.find((part) => part.name === "size")!.data.toString();
      const [width, height] = size.split("x").map(Number);
      const red = await sharp({ create: { width, height, channels: 3, background: "#ff0000" } }).png().toBuffer();
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: [{ b64_json: red.toString("base64") }] }));
    });
    const output = await runOpenAIImageEdit({
      source: await source(), mask: await editorMask(), prompt: "paint it red",
      settings: { ...DEFAULT_OPENAI_IMAGE_EDIT, baseUrl: `${base}/v1`, model: "gpt-image-2.5-sunburst", quality: "high" },
      apiKey: key,
    });
    expect(calls).toBe(1);
    expect(output.batch.complete).toBe(true);
    expect(seen!.url).toBe("/v1/images/edits");
    expect(seen!.auth).toBe(`Bearer ${key}`);
    const field = (name: string) => seen!.parts.find((part) => part.name === name)?.data.toString();
    expect(field("model")).toBe("gpt-image-2.5-sunburst");
    expect(field("prompt")).toBe("paint it red");
    expect(field("size")).toBe("1536x1024"); // 120×80 (1.5) → 1536×1024
    expect(field("quality")).toBe("high");
    expect(field("input_fidelity")).toBeUndefined();
    const image = seen!.parts.find((part) => part.name === "image")!;
    const mask = seen!.parts.find((part) => part.name === "mask")!;
    const imageMeta = await sharp(image.data).metadata();
    const maskRaw = await sharp(mask.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([imageMeta.width, imageMeta.height]).toEqual([maskRaw.info.width, maskRaw.info.height]);
    const alphaAt = (x: number, y: number) => maskRaw.data[(y * maskRaw.info.width + x) * 4 + 3];
    expect(alphaAt(Math.round(30 * 12.8), Math.round(40 * 12.8))).toBe(0);    // edit area is transparent
    expect(alphaAt(Math.round(100 * 12.8), Math.round(40 * 12.8))).toBe(255); // keep area is opaque
    expect(JSON.stringify(output.request)).not.toContain(key);

    expect(output.images).toHaveLength(1);
    const result = await sharp(output.images[0]).raw().toBuffer({ resolveWithObject: true });
    expect([result.info.width, result.info.height]).toEqual([120, 80]);
    const px = (x: number, y: number) => [...result.data.subarray((y * 120 + x) * result.info.channels, (y * 120 + x) * result.info.channels + 3)];
    expect(px(30, 40)).toEqual([255, 0, 0]); // inside the mask: provider pixels
    expect(px(5, 5)).toEqual([0, 0, 255]);   // outside: untouched source
    expect(px(100, 70)).toEqual([0, 255, 0]);
  });

  it("sends references as image[] parts and does not retry provider errors", async () => {
    let calls = 0;
    let names: string[] = [];
    const base = await server(async (req, res) => {
      calls += 1;
      names = parseMultipart(await readBody(req), String(req.headers["content-type"])).map((part) => part.name);
      res.statusCode = 500;
      res.end("{}");
    });
    const reference = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).png().toBuffer();
    const output = await runOpenAIImageEdit({
      source: await source(), mask: await editorMask(), prompt: "x", references: [reference, reference],
      settings: { ...DEFAULT_OPENAI_IMAGE_EDIT, baseUrl: base }, apiKey: key,
    });
    expect(calls).toBe(1);
    expect(names.filter((name) => name === "image[]")).toHaveLength(3);
    expect(names).toContain("mask");
    expect(output.batch.complete).toBe(false);
    expect(output.batch.error?.status).toBe(500);
    expect(output.images).toHaveLength(0);
  });

  it("rejects an empty mask before contacting the provider", async () => {
    let calls = 0;
    const base = await server((_req, res) => { calls += 1; res.end("{}"); });
    const empty = await sharp(Buffer.alloc(120 * 80 * 4), { raw: { width: 120, height: 80, channels: 4 } }).png().toBuffer();
    await expect(runOpenAIImageEdit({ source: await source(), mask: empty, prompt: "x", settings: { ...DEFAULT_OPENAI_IMAGE_EDIT, baseUrl: base }, apiKey: key }))
      .rejects.toThrow(/蒙版为空/);
    expect(calls).toBe(0);
  });
});
