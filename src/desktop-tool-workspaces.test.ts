import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {toolWorkspaceText} from "./tool-workspace-text";
const source=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
describe("desktop tool workspace changes",()=>{
 it("keeps the ten existing tools and their back handlers discoverable",()=>{
  const hub=source("./ToolsHub.tsx");
  const tools=[...hub.matchAll(/data-tool-card="(\w+)"/g)].map(x=>x[1]);
  expect(new Set(tools).size).toBe(10);
  for(const tool of tools)expect(hub).toContain('activeTool === "'+tool+'"');
  expect(hub.match(/onBack=\{back\}/g)).toHaveLength(10);
 });
 it("limits the expandable account track to the classic shell",()=>{
  const css=source("./desktop-tool-workspaces.css");
  expect(css).toMatch(/app-shell\[data-desktop-layout="classic"\][^{]*\{\s*grid-template-rows:[^;]*minmax\(44px,max-content\)/);
  expect(source("./app/AppChrome.tsx")).toContain("classic-account-toolbar");
  const chrome=source("./app/AppChrome.tsx");
  for(const handler of ["toggleStreamPreview","openInExplorer","openSettings","openExternal"])expect(chrome).toContain(handler);
 });
 it("sizes Personal Codex scroll rows to the complete entry in either desktop layout",()=>{
  expect(source("./PromptCodex.tsx")).toContain('className="prompt-codex-results tool-results-scroll"');
  expect(source("./desktop-tool-workspaces.css")).toMatch(/\.prompt-codex-results\.tool-results-scroll\s*\{\s*grid-auto-rows:\s*max-content;/);
 });
 it("provides labels for five locales",()=>{
  for(const locale of ["zh-CN","zh-TW","en-US","ja-JP","ko-KR"])expect(Object.values(toolWorkspaceText(locale)).every(Boolean)).toBe(true);
 });
});
