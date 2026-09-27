import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => "/tmp/langbai-test-user-data" } }));
vi.mock("../ipc/proxy", () => ({ proxyConfig: () => ({}) }));
vi.mock("../ipc/local-media-protocol", () => ({
  toLocalMediaUrl: (filePath: string, revision?: string) => `nai-local://${encodeURIComponent(filePath)}${revision ? `?v=${revision}` : ""}`,
}));

import {
  DANBOORU_ARTISTS_URL,
  DANBOORU_POSTS_URL,
  DANBOORU_TAGS_URL,
  ArtistReferenceService,
  type ReferenceHttpGet,
} from "./references";
import { normalizeReferenceTag } from "../../src/artist-comparison/reference-types";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "langbai-reference-"));
  roots.push(root);
  return root;
}

function makePost(id = 12101827, tag = "lam_(ramdayo)") {
  return {
    id,
    rating: "g",
    tag_string_artist: tag,
    file_ext: "jpg",
    preview_file_url: `https://cdn.donmai.us/180x180/${id}.jpg`,
    large_file_url: `https://cdn.donmai.us/original/${id}.jpg`,
    media_asset: {
      image_width: 1_800,
      image_height: 900,
      variants: [
        { type: "180x180", url: `https://cdn.donmai.us/180x180/${id}.jpg`, width: 180, height: 90, file_ext: "jpg" },
        { type: "original", url: `https://cdn.donmai.us/original/${id}.jpg`, width: 1_800, height: 900, file_ext: "jpg" },
      ],
    },
  };
}

async function imageFixture(): Promise<Buffer> {
  return sharp({
    create: {
      width: 1_800,
      height: 900,
      channels: 4,
      background: { r: 20, g: 40, b: 60, alpha: 0.5 },
    },
  }).png().toBuffer();
}

function httpFixture(post: ReturnType<typeof makePost>, image: Buffer, tagName = "lam_(ramdayo)"): { request: ReferenceHttpGet; calls: Array<{ url: string; config?: Record<string, unknown> }> } {
  const calls: Array<{ url: string; config?: Record<string, unknown> }> = [];
  const request: ReferenceHttpGet = vi.fn(async (url, config) => {
    calls.push({ url, config: config as Record<string, unknown> });
    if (url === DANBOORU_TAGS_URL) return { data: [{ id: 82182, name: tagName, category: 1, post_count: 486 }] };
    if (url === DANBOORU_POSTS_URL) return { data: [post] };
    if (url.startsWith("https://cdn.donmai.us/")) return { data: image };
    throw new Error(`unexpected URL: ${url}`);
  });
  return { request, calls };
}

async function waitForDone(service: ArtistReferenceService, tag: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = (await service.action({ type: "load" })).state;
    const item = state.queue.find((candidate) => candidate.tag === tag);
    if (item?.status === "done" || item?.status === "error") return state;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("reference queue did not settle");
}

describe("global artist reference types and persistence", () => {
  it("normalizes artist identity exactly across prefix, escaped parentheses and spaces", () => {
    expect(normalizeReferenceTag(" artist: LAM \\(Ramdayo\\) ")).toBe("lam_(ramdayo)");
    expect(normalizeReferenceTag("LAM_(ramdayo)")).toBe("lam_(ramdayo)");
  });

  it("deduplicates shared tags, persists the queue, and resumes a cached cover after restart", async () => {
    const root = makeRoot();
    const image = await imageFixture();
    const { request, calls } = httpFixture(makePost(), image);
    const service = new ArtistReferenceService({
      rootDir: root,
      request,
      sleep: async () => undefined,
      toLocalMediaUrl: (filePath, revision) => `nai-local://${encodeURIComponent(filePath)}${revision ? `?v=${revision}` : ""}`,
    });

    const started = await service.action({ type: "start", tags: ["artist: LAM (ramdayo)", "lam_(ramdayo)"] });
    expect(started.state.queue).toHaveLength(1);
    const settled = await waitForDone(service, "lam_(ramdayo)");
    expect(settled.queue[0]?.status).toBe("done");
    expect(settled.records["lam_(ramdayo)"].postCount).toBe(486);
    expect(settled.records["lam_(ramdayo)"].cover?.width).toBeLessThanOrEqual(960);
    expect(settled.records["lam_(ramdayo)"].cover?.height).toBeLessThanOrEqual(960);
    expect(settled.records["lam_(ramdayo)"].cover?.imageUrl).toMatch(/^nai-local:/);
    expect(calls.filter((call) => call.url.startsWith("https://cdn.donmai.us/")).length).toBe(1);
    expect((calls.find((call) => call.url === DANBOORU_POSTS_URL)?.config?.params as Record<string, unknown>).tags).toBe("lam_(ramdayo) rating:g");

    const restarted = new ArtistReferenceService({
      rootDir: root,
      request: vi.fn(async () => { throw new Error("network must not be used for cached start"); }),
      sleep: async () => undefined,
      toLocalMediaUrl: (filePath, revision) => `nai-local://${encodeURIComponent(filePath)}${revision ? `?v=${revision}` : ""}`,
    });
    const loaded = await restarted.action({ type: "load" });
    expect(loaded.state.records["lam_(ramdayo)"].cover?.imageUrl).toMatch(/^nai-local:/);
    const duplicateStart = await restarted.action({ type: "start", tags: ["LAM_(ramdayo)", "artist: LAM (ramdayo)"] });
    expect(duplicateStart.state.queue).toHaveLength(1);
    expect(duplicateStart.state.queue[0]?.status).toBe("done");
  });

  it("resets a persisted running item to pending and paused on restart", async () => {
    const root = makeRoot();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "references.v1.json"), JSON.stringify({
      version: 1,
      records: {},
      queue: [{ tag: "lam_(ramdayo)", status: "running" }],
      running: true,
      paused: false,
    }));
    const service = new ArtistReferenceService({ rootDir: root, request: vi.fn(), sleep: async () => undefined });
    const loaded = await service.action({ type: "load" });
    expect(loaded.state.running).toBe(false);
    expect(loaded.state.paused).toBe(true);
    expect(loaded.state.queue[0]).toMatchObject({ tag: "lam_(ramdayo)", status: "pending" });
    expect(JSON.parse(fs.readFileSync(path.join(root, "references.v1.json"), "utf8")).queue[0].status).toBe("pending");
  });

  it("keeps an existing cover when a replacement image cannot be decoded", async () => {
    const root = makeRoot();
    const initial = await imageFixture();
    const fixture = httpFixture(makePost(12101827), initial);
    const service = new ArtistReferenceService({ rootDir: root, request: fixture.request, sleep: async () => undefined });
    await service.action({ type: "start", tags: ["lam_(ramdayo)"] });
    const before = await waitForDone(service, "lam_(ramdayo)");
    const previous = before.records["lam_(ramdayo)"].cover;
    expect(previous).toBeDefined();

    const bad = httpFixture(makePost(12101828), Buffer.from("not-an-image"));
    const retry = new ArtistReferenceService({ rootDir: root, request: bad.request, sleep: async () => undefined });
    await retry.action({ type: "retry", tag: "lam_(ramdayo)" });
    const failed = await waitForDone(retry, "lam_(ramdayo)");
    expect(failed.queue[0]?.status).toBe("error");
    expect(failed.records["lam_(ramdayo)"].cover?.postId).toBe(previous?.postId);
    expect(failed.records["lam_(ramdayo)"].error).toBeTruthy();
  });

  it("pauses on 429 and does not bypass the cooldown through start or resume", async () => {
    const root = makeRoot();
    let clock = 0;
    let limited = true;
    const image = await imageFixture();
    const post = makePost();
    const request: ReferenceHttpGet = vi.fn(async (url) => {
      if (limited && url === DANBOORU_TAGS_URL) {
        limited = false;
        return { data: [], status: 429, headers: { "retry-after": "60" } };
      }
      if (url === DANBOORU_TAGS_URL) return { data: [{ id: 1, name: "lam_(ramdayo)", category: 1, post_count: 486 }] };
      if (url === DANBOORU_POSTS_URL) return { data: [post] };
      if (url.startsWith("https://cdn.donmai.us/")) return { data: image };
      throw new Error(`unexpected URL: ${url}`);
    });
    const service = new ArtistReferenceService({ rootDir: root, request, now: () => clock, sleep: async (ms) => { clock += ms; } });
    await service.action({ type: "start", tags: ["lam_(ramdayo)"] });
    for (let attempt = 0; attempt < 100 && !(await service.action({ type: "load" })).state.paused; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    const paused = (await service.action({ type: "load" })).state;
    expect(paused.paused).toBe(true);
    expect(paused.resumeAt).toBeGreaterThan(clock);
    expect((request as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    await service.action({ type: "start", tags: ["other_artist"] });
    await service.action({ type: "resume" });
    expect((request as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    clock = paused.resumeAt! + 1;
    await service.action({ type: "resume" });
    const settled = await waitForDone(service, "lam_(ramdayo)");
    expect(settled.queue.find((item) => item.tag === "lam_(ramdayo)")?.status).toBe("done");
  });

  it("uses an explicitly bound alias for candidates and validates the chosen post", async () => {
    const root = makeRoot();
    const image = await imageFixture();
    const post = makePost(42, "alias_name");
    const request: ReferenceHttpGet = vi.fn(async (url) => {
      if (url === `${DANBOORU_ARTISTS_URL}/82182.json`) return { data: { id: 82182, name: "alias_name" } };
      if (url === DANBOORU_TAGS_URL) return { data: [{ id: 9, name: "alias_name", category: 1, post_count: 7 }] };
      if (url === DANBOORU_POSTS_URL) return { data: [post] };
      if (url === `${DANBOORU_POSTS_URL.replace(/\.json$/, "")}/42.json`) return { data: post };
      if (url.startsWith("https://cdn.donmai.us/")) return { data: image };
      throw new Error(`unexpected URL: ${url}`);
    });
    const service = new ArtistReferenceService({ rootDir: root, request, sleep: async () => undefined });
    const bound = await service.action({ type: "bind", tag: "original_name", artistId: 82182 });
    expect(bound.state.records.original_name.artistName).toBe("alias_name");
    await service.action({ type: "bind", tag: "canonical_name", artistId: 82182 });
    const candidates = await service.action({ type: "candidates", tag: "original_name" });
    expect(candidates.candidates).toHaveLength(1);
    expect((request as ReturnType<typeof vi.fn>).mock.calls.some(([url, config]) => url === DANBOORU_POSTS_URL && (config?.params as Record<string, unknown>)?.tags === "alias_name rating:g")).toBe(true);
    const chosen = await service.action({ type: "choose", tag: "original_name", postId: 42 });
    expect(chosen.error).toBeUndefined();
    expect(chosen.state.records.original_name.cover?.postId).toBe(42);
    expect(chosen.state.records.canonical_name.cover?.postId).toBe(42);
    const callsBefore = (request as ReturnType<typeof vi.fn>).mock.calls.length;
    const reused = await service.action({ type: "start", tags: ["alias_name"] });
    expect(reused.state.records.alias_name.cover?.filePath).toBe(chosen.state.records.original_name.cover?.filePath);
    expect((request as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });

  it("stops after the current network action when paused and resumes the durable item", async () => {
    const root = makeRoot();
    const image = await imageFixture();
    const post = makePost();
    let releaseTags!: (value: { data: unknown[] }) => void;
    const firstTags = new Promise<{ data: unknown[] }>((resolve) => { releaseTags = resolve; });
    let tagsCalls = 0;
    const request: ReferenceHttpGet = vi.fn(async (url) => {
      if (url === DANBOORU_TAGS_URL) {
        tagsCalls += 1;
        if (tagsCalls === 1) return firstTags;
        return { data: [{ id: 1, name: "lam_(ramdayo)", category: 1, post_count: 486 }] };
      }
      if (url === DANBOORU_POSTS_URL) return { data: [post] };
      if (url.startsWith("https://cdn.donmai.us/")) return { data: image };
      throw new Error(`unexpected URL: ${url}`);
    });
    const service = new ArtistReferenceService({ rootDir: root, request, sleep: async () => undefined });
    await service.action({ type: "start", tags: ["lam_(ramdayo)"] });
    for (let attempt = 0; attempt < 100 && tagsCalls === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    await service.action({ type: "pause" });
    releaseTags({ data: [{ id: 1, name: "lam_(ramdayo)", category: 1, post_count: 486 }] });
    for (let attempt = 0; attempt < 100 && (await service.action({ type: "load" })).state.running; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    expect((request as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === DANBOORU_POSTS_URL)).toHaveLength(0);
    expect((await service.action({ type: "load" })).state.queue[0]?.status).toBe("pending");
    await service.action({ type: "resume" });
    const settled = await waitForDone(service, "lam_(ramdayo)");
    expect(settled.records["lam_(ramdayo)"].cover).toBeDefined();
  });

  it("fails closed on a corrupt or wrong-version index without overwriting it", () => {
    const root = makeRoot();
    const index = path.join(root, "references.v1.json");
    fs.mkdirSync(root, { recursive: true });
    const corrupt = "{not-json";
    fs.writeFileSync(index, corrupt);
    expect(() => new ArtistReferenceService({ rootDir: root })).toThrow();
    expect(fs.readFileSync(index, "utf8")).toBe(corrupt);
    const wrong = JSON.stringify({ version: 999, records: {}, queue: [] });
    fs.writeFileSync(index, wrong);
    expect(() => new ArtistReferenceService({ rootDir: root })).toThrow();
    expect(fs.readFileSync(index, "utf8")).toBe(wrong);
  });
});

describe("local original references", () => {
  it("preserves ratio, source file, restart and backup without network access", async () => {
    const root = makeRoot(), input = path.join(root, "original.png");
    const raw = await imageFixture();
    fs.writeFileSync(input, raw);
    const request = vi.fn(async () => { throw Error("must not request"); });
    const service = new ArtistReferenceService({ rootDir: root, request });
    const result = await service.importLocalReference("demo", input);
    expect(result.error).toBeUndefined();
    expect(result.state.records.demo.cover).toMatchObject({ source: "local", postId: 0, width: 960, height: 480, sourceUrl: "", postUrl: "" });
    expect(fs.readFileSync(input)).toEqual(raw);
    const restored = new ArtistReferenceService({ rootDir: root, request });
    expect((await restored.action({type:"load"})).state.records.demo.cover?.source).toBe("local");
    await restored.action({type:"start",tags:["demo"]});
    expect(request).not.toHaveBeenCalled();
    const { exportReferenceBackup, importReferenceBackup } = await import("./reference-backup");
    const archive = path.join(root,"backup.zip");
    await exportReferenceBackup(root,result.state,archive);
    const target = makeRoot();
    const empty = {version:1 as const,records:{},queue:[],running:false,paused:false};
    await importReferenceBackup(target,path.join(target,"references.v1.json"),empty,archive);
    const imported = new ArtistReferenceService({rootDir:target,request});
    expect((await imported.action({type:"load"})).state.records.demo.cover).toMatchObject({source:"local",width:960,height:480});
    fs.writeFileSync(input,"broken");
    expect((await restored.importLocalReference("demo",input)).error).toBeTruthy();
    expect((await restored.action({type:"load"})).state.records.demo.cover?.source).toBe("local");
  });

  it("keeps local selection when an older network request fails", async () => {
    const root=makeRoot(), input=path.join(root,"sample.png");
    fs.writeFileSync(input,await imageFixture());
    let reject!: (error: Error)=>void;
    const request=vi.fn(()=>new Promise<any>((_,r)=>{reject=r;}));
    const service=new ArtistReferenceService({rootDir:root,request,sleep:async()=>{}});
    await service.action({type:"start",tags:["demo"]});
    await vi.waitFor(()=>expect(request).toHaveBeenCalled());
    await service.importLocalReference("demo",input);
    reject(Error("network failure"));
    await vi.waitFor(async()=>expect((await service.action({type:"load"})).state.running).toBe(false));
    const state=(await service.action({type:"load"})).state;
    expect(state.queue[0].status).toBe("done");
    expect(state.records.demo.error).toBeUndefined();
    expect(state.records.demo.cover?.source).toBe("local");
  });
});

it("searches past twelve unusable posts without returning an unbounded candidate list", async () => {
  const root = makeRoot(), good = makePost(100), image = await imageFixture();
  const base = httpFixture(good,image);
  const request: ReferenceHttpGet = async (url,config) => {
    if(url===DANBOORU_POSTS_URL) {
      expect((config?.params as any).limit).toBe(48);
      return {data:[...Array.from({length:12},(_,i)=>({...makePost(200+i),is_banned:true})),good]};
    }
    return base.request(url,config);
  };
  const service = new ArtistReferenceService({rootDir:root,request,sleep:async()=>{}});
  await service.action({type:"start",tags:["lam_(ramdayo)"]});
  const state = await waitForDone(service,"lam_(ramdayo)");
  expect(state.records["lam_(ramdayo)"].cover?.postId).toBe(100);
});
