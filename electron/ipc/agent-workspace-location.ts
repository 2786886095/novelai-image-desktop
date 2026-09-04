import { app, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { AgentWorkspaceLocation } from "../../src/agent/types";

let cached: AgentWorkspaceLocation | null = null;

function directoryEmpty(directory: string) {
  try { return fs.readdirSync(directory).length === 0; } catch { return true; }
}

function ensureWritable(directory: string) {
  fs.mkdirSync(directory, { recursive: true });
  const probe = path.join(directory, `.write-probe-${process.pid}-${Date.now()}`);
  fs.writeFileSync(probe, "ok", "utf8");
  fs.unlinkSync(probe);
}

function copyLegacyWorkspace(legacy: string, target: string) {
  if (!fs.existsSync(legacy) || !directoryEmpty(target)) return false;
  fs.cpSync(legacy, target, { recursive: true, force: false, errorOnExist: false });
  return true;
}

/**
 * Prefer a user-visible workspace next to the packaged executable. Read-only
 * installs (Program Files, signed macOS bundles, managed devices) fall back to
 * the normal app-data location rather than failing startup.
 */
export function getAgentWorkspaceLocation(): AgentWorkspaceLocation {
  if (cached) return cached;
  const userData = app.getPath("userData");
  const legacy = path.join(userData, "agent-workspace");
  const fallback = path.join(userData, "LangbaiWorkspace");
  let target = fallback;
  let installAdjacent = false;
  let fallbackReason: string | undefined;

  if (app.isPackaged) {
    const adjacent = path.join(path.dirname(app.getPath("exe")), "LangbaiWorkspace");
    try {
      ensureWritable(adjacent);
      target = adjacent;
      installAdjacent = true;
    } catch (error) {
      fallbackReason = error instanceof Error ? error.message : String(error);
      ensureWritable(fallback);
    }
  } else {
    ensureWritable(fallback);
    fallbackReason = "开发环境使用应用数据目录；安装版会优先放在软件旁边。";
  }

  let migratedFromLegacy = false;
  try { migratedFromLegacy = path.resolve(legacy) !== path.resolve(target) && copyLegacyWorkspace(legacy, target); } catch { /* legacy data remains untouched */ }
  cached = { path: target, installAdjacent, migratedFromLegacy, ...(fallbackReason ? { fallbackReason } : {}) };
  return cached;
}

export function agentWorkspaceDirectory() {
  return getAgentWorkspaceLocation().path;
}

export async function openAgentWorkspaceDirectory() {
  const location = getAgentWorkspaceLocation();
  fs.mkdirSync(location.path, { recursive: true });
  const message = await shell.openPath(location.path);
  return message ? { ok: false, message } : { ok: true };
}

export function resetAgentWorkspaceLocationForTests() {
  cached = null;
}
