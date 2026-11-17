import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {pageUi} from "./desktop-page-ui";
const get=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
describe("desktop workbench page changes",()=>{
 it("has usable labels in the desktop locales",()=>{
  for(const locale of ["zh-CN","zh-TW","en-US","ja-JP","ko-KR"]){
   const labels=pageUi(locale);
   expect(labels.sizes).toHaveLength(3);
   expect(Object.values(labels).every(Boolean)).toBe(true);
  }
  expect(pageUi("unknown").searchTools).toBeTruthy();
 });
 it("keeps the original quote calculation and single quote component adjacent to run",()=>{
  const app=get("./App.tsx");
  expect(app).toContain('costPreview={<FeatureCostCard label={t("cost.beforeRun")} feature="generate" />}');
  expect(app).toContain('costPreview={<FeatureCostCard label={t("cost.beforeRun")} feature="i2i" />}');
  expect(app.match(/\.quoteAnlas\(/g)).toHaveLength(1);
 });
 it("does not share selectors between shell definitions or replace underlying capabilities",()=>{
  const app=get("./App.tsx");
  expect(app).toContain('variant={isRedesign ? "page" : "modal"}');
  expect(app).toContain("clearAiCallLog()");
  expect(app).toContain("deleteReverseHistoryItem(id)");
  expect(app).toContain("deleteConvertHistoryItem(id)");
  const works=get("./components/WorksLibrary.tsx");
  expect(works).toContain("data-thumbnail-density={density}");
  expect(works).toContain("applyImageParameters(selected.filePath)");
  expect(get("./AgentPage.tsx")).toContain("deleteAgentAttachment(conversation.id, item.id)");
 });
});
