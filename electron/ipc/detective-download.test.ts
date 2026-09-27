import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
const mock = vi.hoisted(() => ({ root: "", language:'zh-CN', titles:[] as string[], get: vi.fn(), exec: vi.fn() }));
vi.mock("electron", () => ({ app: { getPath: () => mock.root }, dialog: { showOpenDialog: async (options:{title:string}) => {mock.titles.push(options.title);return { canceled: false, filePaths: [mock.root] };} } }));
vi.mock("./store", () => ({ getSetting:()=>mock.language, atomicWriteFileSync: (p: string, s: string) => fs.writeFileSync(p, s) }));
vi.mock("./proxy", () => ({ proxyConfig: () => ({}) }));
vi.mock("axios", () => ({ default: { get: (...args: unknown[]) => mock.get(...args) } }));
vi.mock("node:child_process", () => ({ execFile: (...args: unknown[]) => mock.exec(...args) }));
vi.mock("./detective-release.json", () => ({ default: { version: "fixture", packages: [{file:"assets.zip",bytes:6,sha256:"bef57ec7f53a6d40beb640a780a639c83bc29ac8a9816f1fc6c5c6dcd93c4721",kind:"assets",variant:"full",directory:"novelai-desktop-assets"},{file:"light.zip",bytes:3,sha256:"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",kind:"assets",variant:"light",directory:"novelai-light-desktop-assets"}] } }));
import { detectiveDownloadVariant, detectiveDownloadStart, detectiveDownloadStatus, detectiveDownloadCancel, detectiveDownloadDirectory, validateRange, verifyDownload, packageUrl } from "./detective-download";
beforeEach(async () => {
  mock.root = fs.mkdtempSync(path.join(os.tmpdir(), "detective-download-"));
  mock.get.mockReset(); mock.exec.mockReset();
  mock.exec.mockImplementation((...args: unknown[]) => (args.at(-1) as Function)(new Error("fixture extraction failure")));
  detectiveDownloadVariant("full");
  await detectiveDownloadDirectory();
});
afterEach(() => { fs.rmSync(mock.root, { recursive: true, force: true }); });
const done = async () => { await vi.waitFor(() => expect(detectiveDownloadStatus().busy).toBe(false)); return detectiveDownloadStatus(); };
it('uses the current language for the native directory picker',async()=>{
 for(const [language,title] of [['zh-CN','选择模型与运行环境存放位置'],['zh-TW','選擇模型與執行環境儲存位置'],['en-US','Choose model and runtime location'],['ja-JP','モデルと実行環境の保存先を選択'],['ko-KR','모델 및 실행 환경 저장 위치 선택']]){mock.language=language;await detectiveDownloadDirectory();expect(mock.titles.at(-1)).toBe(title);}mock.language='zh-CN';
});
it("pins downloads to the intended public repository", () => {
  expect(packageUrl("assets.zip")).toBe("https://huggingface.co/langbai666/novelai-studio-artist-detective/resolve/main/assets.zip");
  expect(detectiveDownloadStatus().total).toBe(6);
});
it("checks byte size and hash rather than trusting successful HTTP", async () => {
  const p = path.join(mock.root, "fixture"); fs.writeFileSync(p, "abcdef");
  const h = createHash("sha256").update("abcdef").digest("hex");
  await expect(verifyDownload(p, 6, h)).resolves.toBeUndefined();
  await expect(verifyDownload(p, 5, h)).rejects.toThrow("大小");
  await expect(verifyDownload(p, 6, "0".repeat(64))).rejects.toThrow("SHA-256");
});
it("validates resumed HTTP ranges", () => {
  expect(validateRange("bytes 3-5/6", 3, 6)).toBe(true);
  expect(validateRange("bytes 0-5/6", 3, 6)).toBe(false);
  expect(validateRange("bytes 3-5/9", 3, 6)).toBe(false);
});
it("resumes partial bytes without starting duplicate downloads", async () => {
  fs.writeFileSync(path.join(mock.root,"assets.zip.part"),"abc");
  mock.get.mockResolvedValue({status:206,headers:{"content-range":"bytes 3-5/6"},data:Readable.from([Buffer.from("def")])});
  detectiveDownloadStart(); detectiveDownloadStart(); await done();
  expect(mock.get).toHaveBeenCalledTimes(1);
  expect(mock.get.mock.calls[0][1].headers.Range).toBe("bytes=3-");
  expect(mock.exec).toHaveBeenCalledTimes(1);
  expect(fs.readFileSync(path.join(mock.root,"assets.zip"),"utf8")).toBe("abcdef");
  expect(detectiveDownloadStatus().stage).toBe("failed");
  expect(JSON.parse(fs.readFileSync(path.join(mock.root,"artist-detective-runtime.json"),"utf8")).assets).toBeUndefined();
});
it("restarts from zero when the server ignores Range", async () => {
  fs.writeFileSync(path.join(mock.root,"assets.zip.part"),"abc");
  mock.get.mockResolvedValue({status:200,headers:{},data:Readable.from([Buffer.from("abcdef")])});
  detectiveDownloadStart(); await done();
  expect(fs.readFileSync(path.join(mock.root,"assets.zip"),"utf8")).toBe("abcdef");
});
it("rejects corrupt payload before extracting", async () => {
  mock.get.mockResolvedValue({status:200,headers:{},data:Readable.from([Buffer.from("xxxxxx")])});
  detectiveDownloadStart(); await done();
  expect(mock.exec).not.toHaveBeenCalled();
  expect(detectiveDownloadStatus().stage).toBe("failed");
});
it("activates new paths only after successful runtime checks and preserves user data", async () => {
  const cfg = path.join(mock.root,"artist-detective-runtime.json"); fs.writeFileSync(cfg,'{"assets":"existing","directory":"history"}');
  mock.get.mockResolvedValue({status:200,headers:{},data:Readable.from([Buffer.from("abcdef")])});
  mock.exec.mockImplementation((...args: unknown[]) => (args.at(-1) as Function)(null,"RUNTIME_OK",""));
  detectiveDownloadStart(); await done();
  expect(mock.exec).toHaveBeenCalledTimes(2);
  expect(detectiveDownloadStatus().stage).toBe("complete");
  const next = JSON.parse(fs.readFileSync(cfg,"utf8"));
  expect(next.directory).toBe("history"); expect(next.assets).toContain("novelai-desktop-assets"); expect(next.python).toContain("python.exe");
});
it("keeps partial data and current settings on cancellation", async () => {
  fs.writeFileSync(path.join(mock.root,"assets.zip.part"),"abc");
  const cfg = path.join(mock.root,"artist-detective-runtime.json"); fs.writeFileSync(cfg,'{"assets":"existing"}');
  mock.get.mockImplementation((_url, options) => new Promise((_resolve,reject)=>options.signal.addEventListener("abort",()=>reject(new Error("cancelled")))));
  detectiveDownloadStart(); await vi.waitFor(()=>expect(mock.get).toHaveBeenCalled()); detectiveDownloadCancel(); await done();
  expect(detectiveDownloadStatus().stage).toBe("cancelled");
  expect(fs.readFileSync(path.join(mock.root,"assets.zip.part"),"utf8")).toBe("abc");
  expect(fs.readFileSync(cfg,"utf8")).toBe('{"assets":"existing"}');
});

it("selects only the light bundle, persists choice and activates matching directory", async () => {
  detectiveDownloadVariant("light");
  expect(detectiveDownloadStatus()).toMatchObject({variant:"light",total:3});
  expect(detectiveDownloadStatus().packages.map(p=>p.file)).toEqual(["light.zip"]);
  mock.get.mockResolvedValue({status:200,headers:{},data:Readable.from([Buffer.from("abc")])});
  mock.exec.mockImplementation((...args: unknown[]) => (args.at(-1) as Function)(null,"RUNTIME_OK",""));
  detectiveDownloadStart(); await done();
  expect(detectiveDownloadStatus().stage).toBe("complete");
  const config=JSON.parse(fs.readFileSync(path.join(mock.root,"artist-detective-runtime.json"),"utf8"));
  expect(config).toMatchObject({variant:"light",downloadVariant:"light"});
  expect(config.assets).toContain("novelai-light-desktop-assets");
  expect(JSON.stringify(mock.exec.mock.calls)).not.toContain("8_000_000_000");
});
it("rejects invalid variants and prevents changing packages while downloading", async () => {
  expect(()=>detectiveDownloadVariant("other" as any)).toThrow("Invalid");
  mock.get.mockImplementation((_url, options) => new Promise((_resolve,reject)=>options.signal.addEventListener("abort",()=>reject(new Error("cancelled")))));
  detectiveDownloadStart(); await vi.waitFor(()=>expect(mock.get).toHaveBeenCalled());
  expect(()=>detectiveDownloadVariant("light")).toThrow("取消");
  detectiveDownloadCancel(); await done();
});
