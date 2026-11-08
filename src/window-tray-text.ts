import type { AppLanguage } from "./types";

const texts = {
  "zh-CN": {
    label: "关闭窗口时隐藏到系统托盘",
    description: "开启后，点击 × 只隐藏窗口。可从托盘打开主窗口或完全退出。",
    open: "打开主窗口",
    quit: "退出",
  },
  "zh-TW": {
    label: "關閉視窗時隱藏到系統匣",
    description: "開啟後，按 × 只會隱藏視窗。可從系統匣開啟主視窗或完全結束。",
    open: "開啟主視窗",
    quit: "結束",
  },
  "en-US": {
    label: "Close to system tray",
    description: "When enabled, × hides the window. Open it again or quit from the tray.",
    open: "Open main window",
    quit: "Quit",
  },
  "ja-JP": {
    label: "閉じるときにシステムトレイに隠す",
    description: "有効にすると、× はウィンドウを隠します。トレイから再表示や終了ができます。",
    open: "メインウィンドウを開く",
    quit: "終了",
  },
  "ko-KR": {
    label: "창을 닫을 때 시스템 트레이로 숨기기",
    description: "활성화하면 ×를 눌러도 창만 숨겨집니다. 트레이에서 창을 열거나 종료할 수 있습니다.",
    open: "기본 창 열기",
    quit: "종료",
  },
} satisfies Record<AppLanguage, { label: string; description: string; open: string; quit: string }>;

export function windowTrayText(language: AppLanguage) {
  return texts[language] ?? texts["en-US"];
}
