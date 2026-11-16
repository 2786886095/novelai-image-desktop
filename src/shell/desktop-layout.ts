import { useSyncExternalStore } from "react";

export const DESKTOP_LAYOUT_KEY = "langbai.desktop-layout.v1";
export type DesktopLayout = "classic" | "redesign";
type StorageReader = Pick<Storage,"getItem">;
export function readDesktopLayout(platform: string | undefined, storage?: StorageReader): DesktopLayout {
  if (platform !== "win32") return "classic";
  try { return storage?.getItem(DESKTOP_LAYOUT_KEY) === "redesign" ? "redesign" : "classic"; }
  catch { return "classic"; }
}
const platform=()=>typeof window!=="undefined"?window.naiDesktop?.platform:undefined;
function getLayout(): DesktopLayout {
  try { return readDesktopLayout(platform(), window.localStorage); }
  catch { return "classic"; }
}
const listeners=new Set<()=>void>();
let current:DesktopLayout|undefined;
const snapshot=()=>current??getLayout();
function subscribe(onChange:()=>void) {
  listeners.add(onChange);
  return ()=>{listeners.delete(onChange);};
}
export function setDesktopLayout(value: unknown) {
  if (platform()!=="win32" || (value!=="classic" && value!=="redesign") || value===snapshot()) return;
  current=value;
  try { window.localStorage.setItem(DESKTOP_LAYOUT_KEY,value); } catch { /* Still usable for this session. */ }
  listeners.forEach(notify=>notify());
}
export function useDesktopLayout() {return useSyncExternalStore(subscribe,snapshot,()=> "classic" as const);}
export function attachDesktopLayoutStyles(doc:Document,classic:string,modern:string,theme:string) {
  const base=doc.createElement("style"),shell=doc.createElement("style");
  base.dataset.studioLayoutBase="";shell.dataset.studioLayoutTheme="";
  doc.head.prepend(base);doc.head.append(shell);
  const apply=()=>{
    const redesigned=snapshot()==="redesign";
    doc.documentElement.dataset.desktopLayout=redesigned?"redesign":"classic";
    base.textContent=redesigned?modern:classic+"\n.classic-layout-contents{display:contents}";
    shell.textContent=redesigned?theme:"";
  };
  apply();
  const detach=subscribe(apply);
  return ()=>{detach();base.remove();shell.remove();};
}
export function desktopLayoutLabels(language?:string) {
  return ({
    "zh-CN":["桌面界面布局","经典界面","新版界面","立即切换，不需要重启；账号、提示词和图库共用。"],
    "zh-TW":["桌面介面配置","經典介面","新版介面","立即切換，不需重新啟動；帳號、提示詞與圖庫共用。"],
    "en-US":["Desktop layout","Classic interface","Redesigned interface","Switch immediately; accounts, prompts, and the library are shared."],
    "ja-JP":["デスクトップレイアウト","クラシック","新しいレイアウト","再起動は不要です。アカウント、プロンプト、ライブラリを共有します。"],
    "ko-KR":["데스크톱 레이아웃","기존 인터페이스","새 인터페이스","재시작 없이 전환하며 계정, 프롬프트, 라이브러리를 공유합니다."],
  } as Record<string,string[]>)[language??""]??["桌面界面布局","经典界面","新版界面","立即切换，不需要重启；账号、提示词和图库共用。"];
}
