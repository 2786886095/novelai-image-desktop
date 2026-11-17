import {useEffect} from "react";
import {confirmLayoutIntro} from "../components/confirm";
import classicPreview from "./assets/layout-classic.webp";
import redesignPreview from "./assets/layout-redesign.webp";
import {readDesktopLayout,setDesktopLayout} from "./desktop-layout";

/** Introduction epoch, not a version nag. Existing profiles see it once when they receive this feature. */
export const DESKTOP_LAYOUT_INTRO_KEY="langbai.desktop-layout-intro.v1";
export function shouldOfferDesktopLayoutIntro(platform:string|undefined, existing:boolean, storage:Pick<Storage,"getItem">) {
  if(platform!=="win32"||!existing)return false;
  try {return storage.getItem(DESKTOP_LAYOUT_INTRO_KEY)!=="1";}
  catch {return false;}
}

const PREVIEW_NAMES:Record<string,readonly [string,string]>={
  "zh-CN":["经典界面","新版界面"], "zh-TW":["經典介面","新版介面"],
  "en-US":["Classic layout","Redesigned layout"],
  "ja-JP":["クラシック","新しいレイアウト"], "ko-KR":["기존 레이아웃","새 레이아웃"],
};

const TEXT:Record<string,readonly [string,string,string,string,string]>={
  "zh-CN":["选择桌面界面","更新后，你可以继续使用当前界面，也可以换另一套布局。两套界面共用账号、提示词和图库，不需要重启。以后可在「设置 → 外观 → 桌面界面布局」随时切换。","保留当前界面","切换新版界面","切回经典界面"],
  "zh-TW":["選擇桌面介面","更新後，你可以保留目前介面或切換配置。兩套介面共用帳號、提示詞與圖庫，不需重新啟動。日後可在「設定 → 外觀 → 桌面介面配置」隨時切換。","保留目前介面","切換新版介面","切回經典介面"],
  "en-US":["Choose a desktop layout","Keep this layout or switch to the other one. Both share your accounts, prompts, and library. Change anytime in Settings → Appearance → Desktop layout. No restart is needed.","Keep current layout","Switch to redesigned layout","Switch to classic layout"],
  "ja-JP":["デスクトップレイアウトを選択","現在のレイアウトを維持するか、別のレイアウトに切り替えられます。アカウント、プロンプト、ライブラリは共通です。「設定 → 外観 → デスクトップレイアウト」から、再起動なしでいつでも変更できます。","現在のレイアウトを維持","新しいレイアウトに切り替える","クラシックに戻す"],
  "ko-KR":["데스크톱 레이아웃 선택","현재 레이아웃을 유지하거나 다른 레이아웃으로 전환할 수 있습니다. 계정, 프롬프트, 라이브러리는 공통입니다. 설정 → 모양 → 데스크톱 레이아웃에서 재시작 없이 언제든 전환할 수 있습니다.","현재 레이아웃 유지","새 레이아웃으로 전환","기존 레이아웃으로 전환"],
};
export function DesktopLayoutUpdatePrompt({enabled,language}:{enabled:boolean;language?:string}) {
  useEffect(()=>{
    if(!enabled)return;
    let storage:Storage;
    try {storage=window.localStorage;}catch{return;}
    if(!shouldOfferDesktopLayoutIntro(window.naiDesktop?.platform,enabled,storage))return;
    const redesign=readDesktopLayout("win32",storage)==="redesign";
    const [title,message,keep,tryNew,classic]=TEXT[language??""]??TEXT["zh-CN"];
    const lifetime=new AbortController();
    const [classicLabel,redesignLabel]=PREVIEW_NAMES[language??""]??PREVIEW_NAMES["zh-CN"];
    void confirmLayoutIntro(message,title,lifetime.signal,{
      confirm:redesign?classic:tryNew,cancel:keep,localized:true,
    },[{label:classicLabel,src:classicPreview},{label:redesignLabel,src:redesignPreview}]).then(switchLayout=>{
      if(lifetime.signal.aborted)return;
      if(switchLayout)setDesktopLayout(redesign?"classic":"redesign");
      try {storage.setItem(DESKTOP_LAYOUT_INTRO_KEY,"1");}
      catch { /* The selection still applies for the current session. */ }
    });
    return ()=>lifetime.abort();
  },[enabled,language]);
  return null;
}
