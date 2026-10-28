import type { ArtistPoolSnapshot, ArtistPoolSyncProgress } from "../artist-lab";
import type { AppLanguage } from "../types";
import { artistPoolSelectionText } from "./ArtistPoolSelection";

const COPY = {
  "zh-CN": {
    network: "Danbooru 实时排行", cache: "本地缓存", unavailable: "实时排行暂不可用", loading: "正在获取 Danbooru 实时画师排行…",
    timeout: "在线请求超时", failed: "在线候选加载失败", invalid: "在线接口返回异常数据", empty: "在线候选返回为空或不完整", repeated: "在线接口重复返回同一页",
    retry: "请检查网络及设置中的资源下载代理，然后点击刷新。", offline: "未取得实时候选，抽卡与批量生图暂不可用。",
    ipc: "候选库服务异常，请重启软件后重试。",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

const SYNC_COPY = {
  "zh-CN": { title: "Danbooru 全部画师候选库", all: "收录全部有效画师 Tag，按作品数排序；不设前 N 名限制。", refresh: "刷新全库", cancel: "取消同步", cancelled: "已取消同步", progress: "已同步 {count} 名画师 · {pages} 页", retry: "服务器限流或暂忙，{seconds} 秒后重试", done: "全库同步完成", updated: "更新于" },
} satisfies Record<AppLanguage, Record<string, string>>;
export function artistPoolSyncCopy(language: AppLanguage) { return SYNC_COPY[language]; }

export function ArtistPoolStatus({ snapshot, loading, failed, language, progress }: {
  snapshot: ArtistPoolSnapshot | null; loading: boolean; failed: boolean; language: AppLanguage;
  progress?: ArtistPoolSyncProgress | null;
}) {
  const t = COPY[language];
  const all = SYNC_COPY[language];
  const issue = snapshot?.issue;
  const reason = issue === "cancelled" ? all.cancelled : issue === "timeout" ? t.timeout : issue === "invalid-response" ? t.invalid
    : issue === "empty-response" ? t.empty : issue === "repeated-page" ? t.repeated : t.failed;
  return <div className="artist-pool-status" role="status" aria-live="polite" data-warning={Boolean(issue || failed)}>
    {snapshot && <span>{snapshot.source === "empty" ? t.unavailable : t[snapshot.source]}{snapshot.source === "network" ? ` · ${snapshot.rankedCount}` : ""}</span>}
    {snapshot?.complete && <span>{snapshot.requested === "all" ? all.done : artistPoolSelectionText(language).done}{snapshot.savedAt ? ` · ${all.updated} ${new Date(snapshot.savedAt).toLocaleString(language)}` : ""}</span>}
    {loading && progress && <span>{all.progress.replace("{count}", progress.loaded.toLocaleString(language)).replace("{pages}", String(progress.pages))}</span>}
    {loading && progress?.state === "retrying" && <span>{all.retry.replace("{seconds}", String(Math.ceil((progress.retryAfterMs ?? 0) / 1000)))}</span>}
    {loading ? <span>{t.loading}</span> : failed ? <span>{t.ipc}</span> : issue ? <>
      <span>{reason}{snapshot.httpStatus ? ` (HTTP ${snapshot.httpStatus})` : ""}{issue === "cancelled" ? "" : `。${t.retry}`}</span>
      {snapshot.source === "empty" && <span>{t.offline}</span>}
    </> : null}
  </div>;
}
