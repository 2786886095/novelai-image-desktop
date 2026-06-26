import fs from "fs";
import path from "path";
import type { TuiwenProject, TuiwenProjectSnapshotResult } from "../../src/types";

export const TUIWEN_SNAPSHOT_FILE = "tuiwen-project-snapshot.json";

export function tuiwenSnapshotPath(userDataRoot: string) {
  return path.join(userDataRoot, TUIWEN_SNAPSHOT_FILE);
}

export async function saveTuiwenProjectSnapshot(
  project: TuiwenProject,
  userDataRoot: string,
): Promise<TuiwenProjectSnapshotResult> {
  const filePath = tuiwenSnapshotPath(userDataRoot);
  const savedAt = Date.now();
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify({ savedAt, project }, null, 2), "utf8");
  return { ok: true, message: "小说推文项目快照已保存。", savedAt, path: filePath };
}

export async function loadTuiwenProjectSnapshot(userDataRoot: string): Promise<TuiwenProjectSnapshotResult> {
  const filePath = tuiwenSnapshotPath(userDataRoot);
  try {
    const raw = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
    if (!raw?.project) return { ok: false, message: "小说推文快照为空。", path: filePath };
    return {
      ok: true,
      message: "已读取小说推文项目快照。",
      project: raw.project,
      savedAt: Number(raw.savedAt) || undefined,
      path: filePath,
    };
  } catch (error: any) {
    if (error?.code === "ENOENT") return { ok: false, message: "暂无小说推文项目快照。", path: filePath };
    return { ok: false, message: `读取小说推文快照失败：${error?.message ?? String(error)}`, path: filePath };
  }
}
