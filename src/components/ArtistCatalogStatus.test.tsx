import { expect,it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ArtistCatalogStatus,artistCatalogText,formatCatalogUpdateError } from "./ArtistCatalogStatus";
import type { ArtistCatalogSelection } from "../artist-lab";
const snapshot:ArtistCatalogSelection={items:[],requested:1000,rankedCount:0,source:"cache",savedAt:1,issue:null,complete:true,mode:"random",seed:1,catalog:{total:738103,savedAt:1788946177802,source:"bundled"}};
it("labels the whole-catalog count and snapshot date without claiming live freshness",()=>{
 const html=renderToStaticMarkup(<ArtistCatalogStatus snapshot={snapshot} language="zh-CN"/>);
 expect(html).toContain("738,103");expect(html).toContain("榜单快照日期");expect(html).toContain("等概率");expect(html).not.toContain("实时");
});
it.each(["zh-CN","zh-TW","en-US","ja-JP","ko-KR"] as const)("provides complete labels for%s",language=>{
 expect(Object.values(artistCatalogText(language)).every(Boolean)).toBe(true);
 expect(renderToStaticMarkup(<ArtistCatalogStatus snapshot={{...snapshot,mode:"ranked",catalog:{...snapshot.catalog,source:"downloaded"}}} language={language}/>)).toContain(artistCatalogText(language).ranked);
});

it("shows the latest catalog metadata without changing the selected pool",()=>{
 const original=JSON.stringify(snapshot);
 const html=renderToStaticMarkup(<ArtistCatalogStatus snapshot={snapshot} latestCatalog={{total:2500,savedAt:snapshot.catalog.savedAt+86400000,source:"downloaded"}} language="zh-CN"/>);
 expect(html).toContain("2,500");expect(html).toContain("手动更新的本地快照");
 expect(html).toContain("当前候选仍来自旧快照");expect(html).toContain("1,000");
 expect(JSON.stringify(snapshot)).toBe(original);
});
it.each(["zh-CN","zh-TW","en-US","ja-JP","ko-KR"] as const)("distinguishes cancellation, failures and private error details for %s",language=>{
 const t=artistCatalogText(language);
 expect(formatCatalogUpdateError(new Error("Catalog update cancelled"),language)).toBe(t.updateCancelled);
 expect(formatCatalogUpdateError(new Error("Catalog network request failed (429)"),language)).toContain("HTTP 429");
 expect(formatCatalogUpdateError(new Error("Catalog operation timed out"),language)).toContain(t.updateTimeout);
 expect(formatCatalogUpdateError(new Error("Catalog worker failed"),language)).toContain(t.updateWorkerFailed);
 expect(formatCatalogUpdateError(new Error("Catalog update already running"),language)).toBe(t.updateBusy);
 expect(formatCatalogUpdateError(new Error("ENOSPC C:/private/path.bin"),language)).toContain("ENOSPC");
 expect(formatCatalogUpdateError(new Error("ENOSPC C:/private/path.bin"),language)).not.toContain("private");
 expect(formatCatalogUpdateError(undefined,language)).toBe(t.updateFailed);
});
