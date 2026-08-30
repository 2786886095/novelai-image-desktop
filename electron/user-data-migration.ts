import fs from "fs";
import path from "path";

export const STABLE_USER_DATA_DIR = "novelai-image-desktop";
export const STORE_FILE_NAME = "novelai-image-desktop.json";
export const LEGACY_USER_DATA_DIRS = [
  "Langbai NovelAI Studio",
  "langbai-novelai-studio",
  "NovelAI Studio",
] as const;

type JsonRecord = Record<string, unknown>;

export type UserDataMigrationResult =
  | "target-already-has-token"
  | "target-preserved-no-legacy-token"
  | "target-invalid-preserved"
  | "legacy-store-copied"
  | "legacy-token-merged"
  | "backup-failed-preserved";

function readJsonRecord(file: string): JsonRecord | null {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as JsonRecord
      : null;
  } catch {
    return null;
  }
}

function hasToken(value: JsonRecord | null): value is JsonRecord & { token: string } {
  return typeof value?.token === "string" && value.token.length > 0;
}

function newestLegacyStore(
  appData: string,
  legacyDirs: readonly string[],
  storeFile: string,
) {
  let best: { file: string; mtime: number; data: JsonRecord & { token: string } } | null = null;
  for (const dir of legacyDirs) {
    const file = path.join(appData, dir, storeFile);
    const data = readJsonRecord(file);
    if (!hasToken(data)) continue;
    try {
      const mtime = fs.statSync(file).mtimeMs;
      if (!best || mtime > best.mtime) best = { file, mtime, data };
    } catch {
      // A disappearing or unreadable legacy file is not a migration source.
    }
  }
  return best;
}

function atomicWriteJson(file: string, value: JsonRecord) {
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.migration-${process.pid}-${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, JSON.stringify(value), "utf8");
    const descriptor = fs.openSync(temporary, "r+");
    try {
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, file);
  } finally {
    try {
      if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
    } catch {
      // A stale temp file is safer than touching the live store after failure.
    }
  }
}

/**
 * Migrates only when doing so cannot erase a usable stable store.
 *
 * Older code copied an entire legacy JSON file whenever the stable target did
 * not contain a token. A perfectly healthy token-less target could therefore
 * lose newer settings, history, groups, and templates. The safe policy is:
 *
 * - missing target: copy the newest valid legacy store;
 * - valid target without a token: merge only the missing token/account after
 *   taking a non-overwriting backup;
 * - corrupt/unreadable target: preserve it for the normal backup-recovery path.
 */
export function migrateLegacyUserDataStore({
  appData,
  stableDir = path.join(appData, STABLE_USER_DATA_DIR),
  legacyDirs = LEGACY_USER_DATA_DIRS,
  storeFile = STORE_FILE_NAME,
}: {
  appData: string;
  stableDir?: string;
  legacyDirs?: readonly string[];
  storeFile?: string;
}): UserDataMigrationResult {
  fs.mkdirSync(stableDir, { recursive: true });
  const target = path.join(stableDir, storeFile);
  const targetExists = fs.existsSync(target);
  const targetData = targetExists ? readJsonRecord(target) : null;

  if (targetExists && !targetData) return "target-invalid-preserved";
  if (hasToken(targetData)) return "target-already-has-token";

  const legacy = newestLegacyStore(appData, legacyDirs, storeFile);
  if (!legacy) return "target-preserved-no-legacy-token";

  if (!targetExists) {
    fs.copyFileSync(legacy.file, target, fs.constants.COPYFILE_EXCL);
    return "legacy-store-copied";
  }

  const backupBase = `${target}.pre-legacy-token-merge.bak`;
  let backup = backupBase;
  for (let index = 1; fs.existsSync(backup); index += 1) {
    backup = `${backupBase}.${index}`;
  }
  try {
    fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
  } catch {
    return "backup-failed-preserved";
  }

  const merged: JsonRecord = { ...targetData, token: legacy.data.token };
  if (merged.account === undefined && legacy.data.account !== undefined) {
    merged.account = legacy.data.account;
  }
  atomicWriteJson(target, merged);
  return "legacy-token-merged";
}
