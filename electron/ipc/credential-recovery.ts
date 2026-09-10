import { app, safeStorage } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { LEGACY_USER_DATA_DIRS, STABLE_USER_DATA_DIR, STORE_FILE_NAME } from "../user-data-migration";
import { CREDENTIAL_PREFIX, SENSITIVE_SETTING_KEYS } from "./credential-vault";

type StoreRecord = { token?: unknown; settings?: Record<string, unknown>; [key: string]: unknown };
export function lockedCredentials(data: StoreRecord, decrypt: (v: string) => string) {
  return ["token", ...SENSITIVE_SETTING_KEYS].flatMap(key => {
    const value = key === "token" ? data.token : data.settings?.[key];
    if (typeof value !== "string" || !value.startsWith(CREDENTIAL_PREFIX)) return [];
    try { decrypt(value); return []; } catch { return [{ key, value }]; }
  });
}

export function applyRecoveredCredentials(data: StoreRecord, original: {key: string; value: string}[],
  plain: (string | null)[], encrypt: (v: string) => string) {
  const next = { ...data, settings: { ...data.settings } };
  let recovered = 0;
  original.forEach(({key, value}, index) => {
    const target: Record<string, unknown> = key === "token" ? next : next.settings;
    if (target[key] !== value || !plain[index] || plain[index]!.startsWith(CREDENTIAL_PREFIX)) return;
    target[key] = encrypt(plain[index]!);
    recovered++;
  });
  return { data: next, recovered };
}

async function decryptInLegacyContext(localState: string, values: string[]): Promise<(string | null)[]> {
  const temporary = fs.mkdtempSync(path.join(app.getPath("temp"), "langbai-credential-"));
  try {
    fs.copyFileSync(localState, path.join(temporary, "Local State"));
    fs.writeFileSync(path.join(temporary, "request.json"), JSON.stringify(values));
    return await new Promise((resolve) => {
      const env: NodeJS.ProcessEnv = { ...process.env, LANGBAI_CREDENTIAL_HELPER: "1", LANGBAI_CREDENTIAL_PROFILE: temporary };
      delete env.ELECTRON_RUN_AS_NODE;
      const child = spawn(process.execPath, app.isPackaged ? [] : [app.getAppPath()],
        { env, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
      let output = "", settled = false;
      const done = (result: (string | null)[]) => { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } };
      const timer = setTimeout(() => { child.kill(); done([]); }, 18_000);
      child.on("error", () => done([]));
      child.stdin.on("error", () => undefined);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
        if (Buffer.byteLength(output) > 128 * 1024) { child.kill(); done([]); }
      });
      child.on("close", (code) => {
        try {
          const parsed: unknown = JSON.parse(output.trim());
          done(code === 0 && Array.isArray(parsed) && parsed.length === values.length
            && parsed.every(v => v === null || typeof v === "string") ? parsed : []);
        } catch { done([]); }
      });
      child.stdin.end();
    });
  } finally {
    // mkdtemp-created directory only; never remove an existing app profile.
    if (path.dirname(temporary) === path.resolve(app.getPath("temp"))
      && path.basename(temporary).startsWith("langbai-credential-")) {
      try { fs.rmSync(temporary, {recursive: true, force: true, maxRetries: 3}); } catch { /* next OS temp cleanup */ }
    }
  }
}

/** Windows releases previously changed userData after Chromium initialized its
 * encryption key. Recover only this app's known legacy contexts, then rewrite
 * recovered fields under the stable context. Never guess/substitute an API key. */
export async function recoverLegacyCredentials() {
  if (process.platform !== "win32" || !safeStorage.isEncryptionAvailable()) return;
  const stable = app.getPath("userData");
  if (path.basename(stable).toLowerCase() !== STABLE_USER_DATA_DIR) return;
  const file = path.join(stable, STORE_FILE_NAME);
  if (!fs.existsSync(file)) return;
  const decrypt = (v: string) => safeStorage.decryptString(Buffer.from(v.slice(CREDENTIAL_PREFIX.length), "base64"));
  const encrypt = (v: string) => CREDENTIAL_PREFIX + safeStorage.encryptString(v).toString("base64");
  for (const name of LEGACY_USER_DATA_DIRS) {
    const localState = path.join(app.getPath("appData"), name, "Local State");
    if (!fs.existsSync(localState)) continue;
    const beforeText = fs.readFileSync(file, "utf8");
    const before = JSON.parse(beforeText) as StoreRecord;
    const pending = lockedCredentials(before, decrypt);
    if (!pending.length) return;
    const recovered = await decryptInLegacyContext(localState, pending.map(p => p.value));
    if (!recovered.some(Boolean)) continue;
    // Re-read after the async helper, so unrelated changes are never overwritten.
    const currentText = fs.readFileSync(file, "utf8");
    const patched = applyRecoveredCredentials(JSON.parse(currentText), pending, recovered, encrypt);
    if (!patched.recovered) continue;
    const { atomicWriteFileSync } = await import("./store.js");
    const backup = `${file}.before-credential-recovery`;
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
    atomicWriteFileSync(file, JSON.stringify(patched.data, null, 2));
  }
}
