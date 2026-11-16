import {describe,expect,it} from "vitest";
import {DESKTOP_LAYOUT_KEY,readDesktopLayout} from "./desktop-layout";
describe("desktop shell selection",()=>{
  it("defaults to classic and rejects an invalid saved mode",()=>{
    expect(readDesktopLayout("win32")).toBe("classic");
    expect(readDesktopLayout("win32",{getItem:()=> "unknown"})).toBe("classic");
  });
  it("restores the selected Windows-only layout",()=>{
    const persist={getItem:(key:string)=>key===DESKTOP_LAYOUT_KEY?"redesign":null};
    expect(readDesktopLayout("win32",persist)).toBe("redesign");
    expect(readDesktopLayout("linux",persist)).toBe("classic");
    expect(readDesktopLayout("darwin",persist)).toBe("classic");
  });
  it("remains usable when storage is inaccessible",()=>{
    expect(readDesktopLayout("win32",{getItem:()=>{throw Error("disabled");}})).toBe("classic");
  });
});
