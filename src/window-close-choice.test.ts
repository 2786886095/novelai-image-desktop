import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {windowTrayText} from "./window-tray-text";
import type {AppLanguage} from "./types";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
it("has distinct short action names and explicit persistence copy in all desktop languages",()=>{
 for(const language of ["zh-CN","zh-TW","en-US","ja-JP","ko-KR"] as AppLanguage[]){
  const labels=windowTrayText(language);
  expect(new Set([labels.hide,labels.closeQuit,labels.cancel]).size).toBe(3);
  expect([labels.hide,labels.closeQuit,labels.cancel].every(label=>label.length<20)).toBe(true);
  expect(["不再询问","不再詢問","Do not ask again"]).not.toContain(labels.remember);
  expect(labels.closeDetail.length).toBeGreaterThan(labels.hide.length);
 }
});
it("uses the same close-choice chrome in both layouts without changing other confirmations",()=>{
 const component=read("./components/confirm.ts");
 const css=read("./components/close-window-choice.css");
 expect(component).toContain("close-window-choice.css");
 expect(component).not.toContain("close-choice-label");
 expect(component).toContain('alternative: text.closeQuit');
 expect(component).toContain('action !== "cancel" && remember');
 expect(component).toContain('performance.now() - openedAt >= CLOSE_CHOICE_GUARD_MS');
 expect(css).toMatch(/\.app-confirm-dialog\.is-close-choice \.app-confirm-actions\s*\{\s*display: flex/);
 expect(read("./shell/studio-shell.css")).not.toContain("is-close-choice");
});
