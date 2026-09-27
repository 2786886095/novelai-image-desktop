import { app, dialog, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getToken, atomicWriteFileSync, getSetting } from "./store";
import {featureText} from '../../src/feature-text';
import { toLocalMediaUrl } from "./local-media-protocol";
import { detectiveDownloadStatus } from "./detective-download";
import { detectiveBudget, detectiveParameters, detectiveRounds, type DetectiveRunRequest, type DetectiveSnapshot } from "../../src/artist-detective-contract";

import {assertPortableIdle, registerPortableBusy} from './portable-projects';
type Config = { python?: string; assets?: string; directory?: string; pid?: number; image?: string };
let child: ChildProcess | null = null;
const configPath = () => path.join(app.getPath("userData"), "artist-detective-runtime.json");
function config(): Config {
  try { return JSON.parse(fs.readFileSync(configPath(), "utf8")); } catch { return {}; }
}
function save(value: Config) { atomicWriteFileSync(configPath(), JSON.stringify(value, null, 2)); }
function alive(pid?: number) { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } }
registerPortableBusy(()=>!!child || alive(config().pid), 'detective');
function read(file: string): any { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } }
function ready(c: Config) { return !!(c.python && c.assets && fs.existsSync(c.python) && fs.existsSync(path.join(c.assets, "manifest.json"))); }

export function detectiveStatus(): DetectiveSnapshot {
  const c = config(), running = alive(c.pid);
  const status = c.directory ? read(path.join(c.directory, "status.json")) : null;
  const failure = c.directory ? read(path.join(c.directory, "failure.json")) : null;
  const budget = status?.budget ?? 300;
  const reference = c.image && fs.existsSync(c.image) ? { filePath: c.image, fileUrl: toLocalMediaUrl(c.image), name: path.basename(c.image) } : undefined;
  let fixedPrompt = c.directory ? read(path.join(c.directory, "fixed-prompt.json")) : undefined;
  if (!fixedPrompt && c.directory) {
    try { fixedPrompt = JSON.parse(read(path.join(c.directory, "vision-caption.json"))?.content ?? "null"); } catch { /* incomplete vision output */ }
  }
  const candidates: DetectiveSnapshot["candidates"] = [];
  if (c.directory) {
    const search = path.join(c.directory, "search");
    // Fresh-seed validation is the final ranking; never mix it with training-seed maxima.
    const finalReady = fs.existsSync(path.join(search, "finalists.json"));
    if (fs.existsSync(search)) for (const file of fs.readdirSync(search).filter(f => finalReady ? f === "finalists.json" : /^round-\d+\.json$/.test(f))) {
      const data = read(path.join(search, file));
      for (const row of data?.results ?? []) {
        const preview = [...row.renders].sort((a, b) => b.score - a.score)[0];
        if (!preview?.image || !fs.existsSync(preview.image)) continue;
        candidates.push({ image: toLocalMediaUrl(preview.image), score: row.mean_score, phase: row.phase,
          prompt: row.artists.map((a: {tag: string; weight: number}) => `${a.weight}::artist:(${a.tag})::`).join(", ") });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return { ready: ready(c), running, stage: failure && !running ? "failed" : status?.stage ?? "idle",
    completed: status?.completed ?? 0, budget, rounds: detectiveRounds(budget),
    best: candidates[0]?.score ?? status?.best, message: failure?.message, directory: c.directory,
    reference, fixedPrompt, candidates: candidates.slice(0, 32) };
}

export async function detectiveConfigure(kind: "python" | "assets") {
  const c = config();
  if (alive(c.pid)) throw new Error("请先停止当前迭代。");
  if (kind !== "python" && kind !== "assets") throw new Error("Invalid configuration kind");
  const result = await dialog.showOpenDialog(kind === "python"
    ? { title: featureText(getSetting('language'),"选择已安装 Artist Detective 的 Python 3.12"), properties: ["openFile"], filters: [{ name: "Python", extensions: ["exe"] }] }
    : { title: featureText(getSetting('language'),"选择 novelai-desktop-assets 模型目录"), properties: ["openDirectory"] });
  if (!result.canceled && result.filePaths[0]) { c[kind] = result.filePaths[0]; save(c); }
  return detectiveStatus();
}

export async function detectiveStart(value: DetectiveRunRequest) {
  assertPortableIdle();
  if (detectiveDownloadStatus().busy) throw new Error("请等待模型与运行环境安装完成。");
  const c = config();
  if (alive(c.pid) || child) throw new Error("已有画风迭代正在运行。");
  if (!ready(c)) throw new Error("请先配置 Artist Detective 运行环境和模型目录。");
  if (!value || typeof value.image !== "string" || !fs.existsSync(value.image)) throw new Error("请选择目标图片。");
  if (typeof value.prompt !== "string" || !value.prompt.trim() || value.prompt.length > 16000 || typeof value.style !== "string" || value.style.length > 8000) throw new Error("请填写有效的固定内容提示词。");
  const parameters = detectiveParameters(value.parameters);
  const budget = detectiveBudget(value.budget), token = getToken();
  if (!token) throw new Error("请先配置 NovelAI API。");
  const directory = path.join(app.getPath("userData"), "artist-detective-runs", randomUUID());
  fs.mkdirSync(directory, { recursive: true });
  const root = app.getAppPath();
  const runner = path.join(root.endsWith(".asar") ? root + ".unpacked" : root, "scripts", "artist-detective-live.py");
  if (!fs.existsSync(runner)) throw new Error("Artist Detective runner missing");
  const log = fs.openSync(path.join(directory, "run.log"), "a");
  try {
    child = spawn(c.python!, ["-X", "utf8", "-u", runner], { windowsHide: true, stdio: ["pipe", log, log], env: { ...process.env, PYTHONUTF8: "1" } });
  } finally { fs.closeSync(log); }
  const active = child;
  save({ ...c, directory, pid: active.pid, image: value.image });
  atomicWriteFileSync(path.join(directory, "status.json"), JSON.stringify({ stage: "loading", completed: 0, budget }));
  const deadline = Date.now() + Math.max(3 * 3600_000, budget * 180_000 + 600_000) + 60_000;
  // An interval avoids Node's 32-bit setTimeout overflow for large user budgets.
  const timer = setInterval(() => { if (Date.now() >= deadline) active.kill(); }, 60_000);
  const fail = (message: string) => atomicWriteFileSync(path.join(directory, "failure.json"), JSON.stringify({ message }));
  active.on("error", () => { fail("Python 运行环境启动失败，请检查配置。"); });
  active.stdin!.on("error", () => { /* exit handler records early failure */ });
  active.once("close", code => {
    clearInterval(timer); child = null;
    if (code !== 0 && !fs.existsSync(path.join(directory, "failure.json"))) fail("迭代进程提前退出；已生成图片保留。");
    const current = config(); if (current.directory === directory) save({ ...current, pid: undefined });
  });
  // The renderer never receives the decrypted API token.
  active.stdin!.end(JSON.stringify({ output: directory, assets: c.assets, image: value.image,
    prompt: value.prompt.trim(), style: value.style.trim(), budget, parameters, token }));
  return detectiveStatus();
}

export function detectiveStop() {
  const c = config();
  if (c.directory && alive(c.pid)) fs.writeFileSync(path.join(c.directory, "STOP"), "stop after current request\n");
  return detectiveStatus();
}
export async function detectiveOpenResults() {
  const c = config();
  if (c.directory && fs.existsSync(c.directory)) await shell.openPath(c.directory);
}
