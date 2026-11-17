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
 it("keeps one quote per panel: classic uses the scrolling parameters and redesign keeps the footer",()=>{
  const app=get("./App.tsx");
  for(const [panel,feature] of [["GeneratePanel","generate"],["I2IPanel","i2i"]]){
   const body=app.split(`function ${panel}(`)[1]?.split("// ──")[0]??"";
   const scrollStart=body.indexOf('<div className="panel-scroll">');
   const footerStart=body.indexOf("<AccountAndRunButton");
   expect(footerStart).toBeGreaterThan(scrollStart);
   const scroll=body.slice(scrollStart,footerStart);
   expect(scroll).toMatch(/\{!redesign && costPreview\}\s*<\/div>\s*$/);
   expect(body.slice(footerStart)).toContain('costPreview={redesign ? costPreview : undefined}');
   expect(body.match(/<FeatureCostCard/g)).toHaveLength(1);
   expect(body).toContain(`feature="${feature}"`);
  }
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
