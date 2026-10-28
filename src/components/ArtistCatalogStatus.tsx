import type { ArtistCatalogInfo, ArtistCatalogSelection } from "../artist-lab";
import type { AppLanguage } from "../types";

const COPY = {
 "zh-CN": {updateCancelled:"已取消更新，原快照与当前候选保持不变。",updateTimeout:"更新超时，请稍后重试。",updateWorkerFailed:"画师库后台进程异常，请重试。",updateBusy:"已有榜单更新任务正在运行。",updateNetworkFailed:"网络请求失败",updateDiskFailed:"磁盘写入失败",previousCandidates:"当前候选仍来自旧快照；换一批后使用新榜单。",settingsFailed:"选择设置未保存，重启后可能恢复旧选择。",title:"Danbooru 固定画师库",description:"全量榜单快照保存在本机，抽取与换一批不联网。",mode:"抽取方式",random:"全库随机（等概率、不重复）",ranked:"热门前 N 名",count:"本次抽取数量",draw:"换一批候选",load:"读取本地画师库…",total:"快照有效画师 Tag",date:"榜单快照日期",bundled:"软件内置快照",downloaded:"手动更新的本地快照",pending:"方式或数量已改变，点击换一批生效。",update:"更新全量榜单",confirm:"联网更新会遍历全部画师，首次可能需要十多分钟；期间可继续使用当前候选。",start:"确认更新",cancel:"取消",updated:"全量快照已更新；点击换一批使用新榜单。",failed:"本地画师库读取失败，请重试或检查安装文件。",updateFailed:"更新未完成，原快照与当前候选保持不变。",selection:"本次候选",warning:"一次抽取较多画师可能短暂卡顿；默认 1000 名。"},
} satisfies Record<AppLanguage,Record<string,string>>;
export const artistCatalogText=(language:AppLanguage)=>COPY[language];
export function formatCatalogUpdateError(error: unknown, language: AppLanguage): string {
 const t=COPY[language], message=error instanceof Error?error.message:typeof error==="string"?error:"";
 if (/catalog update cancel(?:led|ed)/i.test(message)) return t.updateCancelled;
 if (/catalog operation timed out/i.test(message)) return t.updateFailed+" "+t.updateTimeout;
 if (/catalog worker (?:failed|stopped)/i.test(message)) return t.updateFailed+" "+t.updateWorkerFailed;
 if (/catalog update already running/i.test(message)) return t.updateBusy;
 const status=message.match(/catalog network request failed(?: \((\d{3})\))?/i);
 if (status) return t.updateFailed+" "+t.updateNetworkFailed+(status[1]?` (HTTP ${status[1]})`:"");
 const disk=message.match(/\b(ENOSPC|EACCES|EPERM)\b/);
 if (disk) return t.updateFailed+" "+t.updateDiskFailed+` (${disk[1]})`;
 return t.updateFailed;
}
export function ArtistCatalogStatus({snapshot,latestCatalog,language}:{snapshot:ArtistCatalogSelection|null;latestCatalog?:ArtistCatalogInfo|null;language:AppLanguage}) {
 const t=COPY[language];
 if(!snapshot)return null;
 const catalog=latestCatalog??snapshot.catalog;
 const previous=catalog.savedAt!==snapshot.catalog.savedAt;
 return <div className="artist-catalog-status" role="status" aria-live="polite">
   <span>{t.total}：{catalog.total.toLocaleString(language)}</span>
   <small>{t.date}：{new Date(catalog.savedAt).toLocaleString(language)} · {catalog.source==="bundled"?t.bundled:t.downloaded}</small>
   <small>{t.selection}：{snapshot.items.length.toLocaleString(language)} / {snapshot.requested.toLocaleString(language)} · {snapshot.mode==="random"?t.random:t.ranked}</small>
   {previous && <small>{t.previousCandidates}</small>}
 </div>;
}
