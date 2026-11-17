import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {capsulePage,isCapsuleManagementTag} from "./components/CapsuleTagBrowser";
import {ACTIVE_TABS} from "./app/navigation";

it("hides only explicit metadata tags from capsule browsing while retaining generation tags",()=>{
 for(const tag of ["rating:sensitive","rating:general","commentary_request","COMMENTARY","translation_request","copyright_name"])
  expect(isCapsuleManagementTag(tag),tag).toBe(true);
 for(const tag of ["highres","1girl","hatsune_miku","artist:someone","score_9","blue eyes"])
  expect(isCapsuleManagementTag(tag),tag).toBe(false);
});
it("keeps capsule pages bounded and returns only the requested page",()=>{
 const items=Array.from({length:57},(_,i)=>i);
 expect(capsulePage(items,0).rows).toEqual(items.slice(0,24));
 expect(capsulePage(items,1).rows).toEqual(items.slice(24,48));
 expect(capsulePage(items,99)).toEqual({rows:items.slice(48),index:2,total:3});
 expect(capsulePage([],0)).toEqual({rows:[],index:0,total:1});
});
it("keeps the shared viewport work scoped to both desktop modes and does not remove known tabs",()=>{
 const html=readFileSync(new URL("./App.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("./studio-desktop-polish.css",import.meta.url),"utf8");
 expect(ACTIVE_TABS).toHaveLength(14);
 expect(html).toContain('data-studio-surface={showSettings ? "settings" : activeTab}');
 expect(html).toContain('href="#studio-main-workspace"');
 expect(css).toContain('[data-desktop-layout="classic"]');
 expect(css).toContain('[data-desktop-layout="redesign"]');
 expect(html).toContain('ClassicHistoryRailPane');
 expect(html).toContain('WorkbenchDockProvider');
});
