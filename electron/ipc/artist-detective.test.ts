import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
const mock = vi.hoisted(() => ({ root: "", launch: vi.fn(), token: "FIXTURE_ONLY", open: vi.fn() }));
vi.mock("electron", () => ({ app: { getPath: () => mock.root, getAppPath: () => mock.root }, dialog: { showOpenDialog: vi.fn() }, shell: { openPath: mock.open } }));
vi.mock("node:child_process", () => ({ spawn: (...args: unknown[]) => mock.launch(...args) }));
vi.mock("./store", () => ({ getToken: () => mock.token, getSetting: () => 'zh-CN', getSettings: () => ({imageBaseUrl:'https://image.novelai.net'}), atomicWriteFileSync: (file: string, text: string) => fs.writeFileSync(file, text) }));
vi.mock("./local-media-protocol", () => ({ toLocalMediaUrl: (file: string) => "local:" + file }));
vi.mock('./detective-runtime-check',()=>({detectiveRuntimeChecking:()=>false,detectiveRuntimeValidation:()=>({state:'passed'}),validateDetectiveRuntime:vi.fn()}));
import { detectiveStart, detectiveStatus } from "./artist-detective";

describe("desktop Artist Detective bridge", () => {
  let spawned: EventEmitter & { stdin: PassThrough; kill: ReturnType<typeof vi.fn>; pid: undefined };
  beforeEach(() => {
    mock.root = fs.mkdtempSync(path.join(os.tmpdir(), "artist-detective-test-"));
    fs.mkdirSync(path.join(mock.root, "assets"));
    fs.writeFileSync(path.join(mock.root, "assets/manifest.json"), "{}");
    fs.writeFileSync(path.join(mock.root, "python.exe"), "fixture");
    fs.writeFileSync(path.join(mock.root, "reference.png"), "fixture");
    fs.mkdirSync(path.join(mock.root, "scripts"));
    fs.writeFileSync(path.join(mock.root, "scripts/artist-detective-live.py"), "fixture");
    fs.writeFileSync(path.join(mock.root, "artist-detective-runtime.json"), JSON.stringify({ python: path.join(mock.root, "python.exe"), assets: path.join(mock.root, "assets") }));
    spawned = Object.assign(new EventEmitter(), { stdin: new PassThrough(), kill: vi.fn(), pid: undefined });
    mock.launch.mockReset().mockReturnValue(spawned);
  });
  afterEach(() => { spawned.emit("close", 0); fs.rmSync(mock.root, { recursive: true, force: true }); });
  const request = () => ({ image: path.join(mock.root, "reference.png"), prompt: "1girl, standing", style: "cel shading", budget: 300 });
  it("keeps credentials out of argv, environment overrides and persistent config", async () => {
    const status = await detectiveStart(request());
    expect(status.ready).toBe(true);
    expect(status.budget).toBe(300);
    const [exe, args, options] = mock.launch.mock.calls[0];
    expect(JSON.stringify([exe, args, options])).not.toContain(mock.token);
    const body = JSON.parse(spawned.stdin.read().toString());
    expect(body.token).toBe(mock.token);
    expect(body.budget).toBe(300);
    expect(body.prompt).toBe("1girl, standing");
    expect(fs.readFileSync(path.join(mock.root, "artist-detective-runtime.json"), "utf8")).not.toContain(mock.token);
  });
  it("rejects a second worker and invalid image budgets", async () => {
    await expect(detectiveStart({ ...request(), budget: 301 })).rejects.toThrow("偶数");
    await detectiveStart(request());
    await expect(detectiveStart(request())).rejects.toThrow("正在运行");
    expect(mock.launch).toHaveBeenCalledTimes(1);
  });
  it("reports process errors instead of staying stuck at loading", async () => {
    await detectiveStart(request());
    spawned.emit("error", new Error("fixture spawn error"));
    spawned.emit("close", 1);
    expect(detectiveStatus().stage).toBe("failed");
    expect(detectiveStatus().message).toContain("启动失败");
  });
  it("ranks completed runs by fresh-seed finalists, not the larger search-seed score", async () => {
    const status = await detectiveStart(request());
    spawned.emit("close", 0);
    const directory = status.directory!;
    fs.mkdirSync(path.join(directory, "search"));
    const row = (phase: string, score: number) => ({ phase, mean_score: score,
      artists: [{ tag: "fixture_artist", weight: 1 }], renders: [{ image: path.join(mock.root, "reference.png"), score }] });
    fs.writeFileSync(path.join(directory, "search/round-00.json"), JSON.stringify({ results: [row("round-00", 0.99)] }));
    fs.writeFileSync(path.join(directory, "search/finalists.json"), JSON.stringify({ results: [row("finalists", 0.7)] }));
    expect(detectiveStatus().candidates).toHaveLength(1);
    expect(detectiveStatus().best).toBe(0.7);
    expect(detectiveStatus().candidates[0].phase).toBe("finalists");
  });
});
