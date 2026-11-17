import {describe,expect,it,vi} from "vitest";
vi.mock("../components/confirm",()=>({confirmLayoutIntro:vi.fn()}));
import {DESKTOP_LAYOUT_INTRO_KEY,shouldOfferDesktopLayoutIntro} from "./DesktopLayoutUpdatePrompt";

describe("Windows layout introduction",()=>{
  it("offers the choice on a pre-existing Windows profile without auto-switching",()=>{
    const get=vi.fn(()=>null);
    expect(shouldOfferDesktopLayoutIntro("win32",true,{getItem:get})).toBe(true);
    expect(get).toHaveBeenCalledWith(DESKTOP_LAYOUT_INTRO_KEY);
  });
  it("never prompts at fresh onboarding, off Windows, after acknowledgement or with unusable storage",()=>{
    expect(shouldOfferDesktopLayoutIntro("win32",false,{getItem:()=>null})).toBe(false);
    expect(shouldOfferDesktopLayoutIntro("linux",true,{getItem:()=>null})).toBe(false);
    expect(shouldOfferDesktopLayoutIntro("win32",true,{getItem:()=>"1"})).toBe(false);
    expect(shouldOfferDesktopLayoutIntro("win32",true,{getItem:()=>{throw Error("disabled");}})).toBe(false);
  });
});
