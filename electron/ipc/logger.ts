// Lightweight file logger so users can inspect error details.
//
// The log directory is user-configurable (settings.logDir); default is
// <userData>/logs. Everything is best-effort — logging must never throw into the
// app. Captures: explicit logError() calls, console.error/console.warn, and
// uncaught exceptions / unhandled rejections in the main process.

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { app, dialog, shell } from "electron";
import { getSettings } from "./store";

const LOG_FILE = "app.log";
const MAX_READ_BYTES = 256 * 1024; // tail size for in-app viewing

function logDir(): string {
  const configured = getSettings().logDir?.trim();
  return configured || path.join(app.getPath("userData"), "logs");
}

function logFilePath(): string {
  return path.join(logDir(), LOG_FILE);
}

function ensureDirSync(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
}

function format(level: string, message: string): string {
  return `[${new Date().toISOString()}] [${level}] ${message}\n`;
}

/** Append a line. Best-effort, synchronous so it survives a crash on exit. */
export function appendLog(level: string, message: string): void {
  try {
    if (getSettings().loggingEnabled === false) return; // logging turned off
    const dir = logDir();
    ensureDirSync(dir);
    fs.appendFileSync(path.join(dir, LOG_FILE), format(level, message));
  } catch {
    /* never throw from logging */
  }
}

export function logError(context: string, error: unknown): void {
  const detail =
    error instanceof Error ? error.stack || `${error.name}: ${error.message}` : String(error);
  appendLog("ERROR", `${context} | ${detail}`);
}

export function logInfo(message: string): void {
  appendLog("INFO", message);
}

let installed = false;
export function installGlobalLogging(): void {
  if (installed) return;
  installed = true;

  process.on("uncaughtException", (err) => logError("uncaughtException", err));
  process.on("unhandledRejection", (reason) => logError("unhandledRejection", reason));

  // Mirror console.error / console.warn into the log file without losing the
  // normal console output.
  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    appendLog("ERROR", args.map(stringifyArg).join(" "));
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    appendLog("WARN", args.map(stringifyArg).join(" "));
    origWarn(...args);
  };

  appendLog("INFO", `=== app started v${app.getVersion?.() ?? "?"} ===`);
}

function stringifyArg(arg: unknown): string {
  if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`;
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

// ── IPC-facing helpers ────────────────────────────────────────────────────────
export async function getLogInfo(): Promise<{ path: string; dir: string; exists: boolean; sizeBytes: number }> {
  const file = logFilePath();
  let exists = false;
  let sizeBytes = 0;
  try {
    const stat = await fsp.stat(file);
    exists = true;
    sizeBytes = stat.size;
  } catch {
    /* not created yet */
  }
  return { path: file, dir: logDir(), exists, sizeBytes };
}

/** Open a folder picker for the log directory; returns the chosen path (or null). */
export async function selectLogDir(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: "选择日志存放文件夹",
    properties: ["openDirectory", "createDirectory"],
    defaultPath: logDir(),
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const chosen = result.filePaths[0];
  ensureDirSync(chosen);
  return chosen;
}

export async function openLogFile(): Promise<{ ok: boolean; message?: string }> {
  const file = logFilePath();
  try {
    await fsp.access(file);
  } catch {
    return { ok: false, message: "日志文件还不存在（暂无记录）。" };
  }
  const err = await shell.openPath(file);
  return err ? { ok: false, message: err } : { ok: true };
}

export async function openLogDir(): Promise<{ ok: boolean; message?: string }> {
  const dir = logDir();
  ensureDirSync(dir);
  const err = await shell.openPath(dir);
  return err ? { ok: false, message: err } : { ok: true };
}

/** Return the tail of the log file (up to MAX_READ_BYTES) for in-app viewing. */
export async function readRecentLog(): Promise<string> {
  const file = logFilePath();
  try {
    const stat = await fsp.stat(file);
    const start = Math.max(0, stat.size - MAX_READ_BYTES);
    const handle = await fsp.open(file, "r");
    try {
      const length = stat.size - start;
      const buf = Buffer.alloc(length);
      await handle.read(buf, 0, length, start);
      return buf.toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return "";
  }
}
