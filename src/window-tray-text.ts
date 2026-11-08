import type { AppLanguage } from "./types";

const texts = {
  "zh-CN": {
    label: "关闭窗口时隐藏到系统托盘",
    description: "开启后，托盘图标在软件运行期间保持显示。点击 × 只隐藏窗口，可从托盘恢复或退出。",
    open: "打开主窗口",
    quit: "退出",
  },
  "zh-TW": {
    label: "關閉視窗時隱藏到系統匣",
    description: "開啟後，程式執行期間會顯示系統匣圖示。按 × 只會隱藏視窗，可從系統匣還原或結束。",
    open: "開啟主視窗",
    quit: "結束",
  },
  "en-US": {
    label: "Close to system tray",
    description: "When enabled, the tray icon stays visible while the app runs. × hides the window; reopen it or quit from the tray.",
    open: "Open main window",
    quit: "Quit",
  },
  "ja-JP": {
    label: "閉じるときにシステムトレイに隠す",
    description: "有効にすると、起動中はトレイアイコンが表示されます。× で隠したウィンドウはトレイから再表示または終了できます。",
    open: "メインウィンドウを開く",
    quit: "終了",
  },
  "ko-KR": {
    label: "창을 닫을 때 시스템 트레이로 숨기기",
    description: "활성화하면 앱이 실행되는 동안 트레이 아이콘이 표시됩니다. ×는 창만 숨기며, 트레이에서 다시 열거나 종료할 수 있습니다.",
    open: "기본 창 열기",
    quit: "종료",
  },
} satisfies Record<AppLanguage, { label: string; description: string; open: string; quit: string }>;

export function windowTrayText(language: AppLanguage) {
  return texts[language] ?? texts["en-US"];
}
