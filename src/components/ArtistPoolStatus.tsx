import type { ArtistPoolSnapshot, ArtistPoolSyncProgress } from "../artist-lab";
import type { AppLanguage } from "../types";
import { artistPoolSelectionText } from "./ArtistPoolSelection";

const COPY = {
  "zh-CN": {
    network: "Danbooru 实时排行", cache: "本地缓存", unavailable: "实时排行暂不可用", loading: "正在获取 Danbooru 实时画师排行…",
    timeout: "在线请求超时", failed: "在线候选加载失败", invalid: "在线接口返回异常数据", empty: "在线候选返回为空或不完整", repeated: "在线接口重复返回同一页",
    retry: "请检查网络及设置中的更新代理，然后点击刷新。", offline: "未取得实时候选，抽卡与批量生图暂不可用。",
    ipc: "候选库服务异常，请重启软件后重试。",
  },
  "zh-TW": {
    network: "Danbooru 即時排行", cache: "本機快取", unavailable: "即時排行暫不可用", loading: "正在取得 Danbooru 即時畫師排行…",
    timeout: "線上請求逾時", failed: "線上候選載入失敗", invalid: "線上介面傳回異常資料", empty: "線上候選為空或不完整", repeated: "線上介面重複傳回同一頁",
    retry: "請檢查網路及設定中的更新代理，然後點擊重新整理。", offline: "尚未取得即時候選，抽卡與批次生圖暫不可用。",
    ipc: "候選庫服務異常，請重新啟動軟體後重試。",
  },
  "en-US": {
    network: "Live Danbooru ranking", cache: "Local cache", unavailable: "Live ranking unavailable", loading: "Fetching the live Danbooru artist ranking…",
    timeout: "Online request timed out", failed: "Online candidates could not be loaded", invalid: "Invalid online response", empty: "Empty or incomplete online result", repeated: "The server returned the same page repeatedly",
    retry: "Check your connection and update proxy settings, then refresh.", offline: "Live candidates are required for random draws and batch generation.",
    ipc: "Candidate service error. Restart the app and retry.",
  },
  "ja-JP": {
    network: "Danbooru 最新ランキング", cache: "ローカルキャッシュ", unavailable: "最新ランキングを取得できません", loading: "Danbooru の最新絵師ランキングを取得中…",
    timeout: "通信がタイムアウトしました", failed: "候補の取得に失敗しました", invalid: "サーバーの応答形式が不正です", empty: "候補が空または不完全です", repeated: "同じページが繰り返し返されました",
    retry: "接続と更新用プロキシ設定を確認してから再読み込みしてください。", offline: "候補の取得後に抽選と一括生成を利用できます。",
    ipc: "候補サービスでエラーが発生しました。アプリを再起動してください。",
  },
  "ko-KR": {
    network: "Danbooru 실시간 순위", cache: "로컬 캐시", unavailable: "실시간 순위를 불러올 수 없습니다", loading: "Danbooru 실시간 작가 순위 로딩 중…",
    timeout: "온라인 요청 시간 초과", failed: "온라인 후보 로드 실패", invalid: "잘못된 서버 응답", empty: "온라인 후보가 비어 있거나 불완전합니다", repeated: "서버가 같은 페이지를 반복 반환했습니다",
    retry: "네트워크 및 업데이트 프록시 설정을 확인한 후 새로고침하세요.", offline: "무작위 추첨 및 일괄 생성에는 실시간 후보가 필요합니다.",
    ipc: "후보 서비스 오류입니다. 앱을 다시 시작하세요.",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

const SYNC_COPY = {
  "zh-CN": { title: "Danbooru 全部画师候选库", all: "收录全部有效画师 Tag，按作品数排序；不设前 N 名限制。", refresh: "刷新全库", cancel: "取消同步", cancelled: "已取消同步", progress: "已同步 {count} 名画师 · {pages} 页", retry: "服务器限流或暂忙，{seconds} 秒后重试", done: "全库同步完成", updated: "更新于" },
  "zh-TW": { title: "Danbooru 全部畫師候選庫", all: "收錄全部有效畫師 Tag，依作品數排序；不設前 N 名限制。", refresh: "重新整理全庫", cancel: "取消同步", cancelled: "已取消同步", progress: "已同步 {count} 名畫師 · {pages} 頁", retry: "伺服器限流或忙碌，{seconds} 秒後重試", done: "全庫同步完成", updated: "更新於" },
  "en-US": { title: "All Danbooru artist candidates", all: "All active artist tags, sorted by post count; no top-N limit.", refresh: "Refresh all artists", cancel: "Cancel sync", cancelled: "Sync cancelled", progress: "Synced {count} artists · {pages} pages", retry: "Server busy or rate limited; retrying in {seconds}s", done: "Full sync complete", updated: "Updated" },
  "ja-JP": { title: "Danbooru 全絵師候補", all: "有効な全絵師タグを投稿数順に収録。上位件数の制限なし。", refresh: "全候補を更新", cancel: "同期をキャンセル", cancelled: "同期をキャンセルしました", progress: "{count} 名を同期 · {pages} ページ", retry: "サーバー待機中。{seconds} 秒後に再試行", done: "全候補の同期完了", updated: "更新日時" },
  "ko-KR": { title: "Danbooru 전체 작가 후보", all: "모든 유효 작가 태그를 게시물 수순으로 수록합니다. 상위 개수 제한 없음.", refresh: "전체 새로고침", cancel: "동기화 취소", cancelled: "동기화 취소됨", progress: "작가 {count}명 동기화 · {pages}페이지", retry: "서버 제한 또는 지연으로 {seconds}초 후 재시도", done: "전체 동기화 완료", updated: "업데이트" },
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
