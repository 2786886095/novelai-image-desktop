import { normalizeAppLanguage } from "../i18n";
import type { NavGroupId, ToolEntryId } from "./nav-model";

const zhCN = {
  groups: { create: "创作", prompt: "提示词", library: "素材库", automation: "工具与智能体" } as Record<NavGroupId, string>,
  tools: {
    comfyuiLocal: "本地 ComfyUI", japaneseComic: "日式漫画生成器", comic: "漫画生成器", promptCodex: "NovelAI 个人法典",
    redraw: "批量图生图", artistLookup: "画师链接查询", artistLab: "画风实验室（画风迭代）", v5ArtistRepair: "V4.5 画师串修复器", artistStringDraw: "画师串抽卡",
  } as Record<ToolEntryId, string>,
  settings: "设置", settingsHint: "API、存储、备份、外观、MCP…", outputDir: "输出目录", docs: "NovelAI 文档", onboarding: "新手引导",
  collapse: "收起导航", expand: "展开导航", arrange: "调整顺序", arrangeDone: "完成", arrangeReset: "恢复默认顺序",
  arrangeHelp: "拖动或按 Alt+↑/↓ 调整组内顺序，Esc 完成",
  search: "搜索功能、工具、设置…", searchShort: "搜索", searchEmpty: "没有匹配的功能", paletteTitle: "快速跳转",
  paletteHint: "↑↓ 选择 · Enter 打开 · Esc 关闭",
  cmdGroups: { page: "页面", tool: "工具", setting: "设置", action: "操作" },
  actions: {
    theme: "切换浅色／深色主题", stream: "开关流式预览", output: "打开输出目录", docs: "打开 NovelAI 文档", onboarding: "重新打开新手引导",
    rail: "收起／展开左侧导航", history: "显示／隐藏历史栏", tasks: "打开任务中心", layout: "查看新版布局说明",
  },
  tasks: "任务", tasksIdle: "空闲", tasksTitle: "任务中心", tasksEmpty: "当前没有任务。生成、批量、反推和转换任务会显示在这里。",
  recent: "最近完成", clearRecent: "清除记录", updatedAt: "更新于", secondsAgo: "{n} 秒前", minutesAgo: "{n} 分钟前", justNow: "刚刚",
  state: { waiting: "等待中", running: "进行中", paused: "已暂停", done: "已完成", failed: "失败", cancelled: "已取消" },
  step: { idle: "空闲", preparing: "准备（核对余额与估价）", requesting: "已提交，等待服务器", streaming: "正在生成", saving: "保存到历史", queued: "排队中", processing: "处理中", finished: "已结束" },
  kind: { generate: "文生图", i2i: "图生图", enhance: "增强", inpaint: "局部重绘", upscale: "超分", director: "导演工具", batchRedraw: "批量图生图", reverse: "AI 反推", convert: "中文转标签" },
  processed: "已处理 {current}/{total} 张", progress: "第 {current}/{total} 张", saved: "已保存 {n} 张", failedCount: "失败 {n} 张", waitingCount: "排队 {n} 张", sampling: "采样 {step}/{steps}",
  pause: "暂停", resume: "继续", stop: "停止（保留已生成）", clearQueue: "清空排队", open: "前往",
  account: "账户", streamOn: "流式预览：开", streamOff: "流式预览：关", themeLight: "浅色", themeDark: "深色",
  back: "返回", settingsBack: "返回工作区",
  layoutNoticeTitle: "界面已重新整理",
  layoutNoticeBody: "所有功能都在左侧分组导航里；按 Ctrl+K 可直接搜索任意页面、工具或设置项。角色、参考图与高级参数改为停靠在画布旁，不再遮挡预览。",
  layoutNoticeMore: "查看入口变化", dismiss: "知道了",
  layoutChanges: [
    ["顶部标签栏 + 「更多」下拉", "左侧分组导航：创作 / 提示词 / 素材库 / 工具与智能体，14 个页面全部直接可见"],
    ["「排列顶栏」", "导航底部「调整顺序」（组内拖动或 Alt+↑/↓，可恢复默认）"],
    ["顶栏「设置」弹窗", "导航底部「设置」，以独立页面打开，可随时返回原工作区"],
    ["顶栏「输出目录」「文档」", "导航底部工具按钮；也可在 Ctrl+K 中搜索"],
    ["顶栏「流式预览」开关", "标题栏右侧眼睛按钮"],
    ["账户选择 / 账户管理 / 中转站推荐", "标题栏右侧账户区（功能不变）"],
    ["工具页卡片", "仍在「工具」页；同时可从导航「工具」展开项或 Ctrl+K 一步打开"],
    ["角色提示 / 氛围迁移 / 精准参考 / 高级参数弹窗", "停靠在画布左侧的面板，不遮挡预览，可边看边改"],
    ["生成进度只在左下角", "标题栏「任务」实时显示步骤、进度、最后更新时间，可暂停 / 停止"],
  ] as Array<[string, string]>,
  dockTitle: "停靠面板", closeConfirm: { quitHint: "完全退出软件", trayHint: "后台继续运行，可从托盘图标恢复", cancelHint: "回到软件" },
};

type ShellText = typeof zhCN;

const zhTW: ShellText = {
  ...zhCN,
  groups: { create: "創作", prompt: "提示詞", library: "素材庫", automation: "工具與智慧體" },
  tools: { comfyuiLocal: "本機 ComfyUI", japaneseComic: "日式漫畫產生器", comic: "漫畫產生器", promptCodex: "NovelAI 個人法典", redraw: "批次圖生圖", artistLookup: "畫師連結查詢", artistLab: "畫風實驗室（畫風迭代）", v5ArtistRepair: "V4.5 畫師串修復器", artistStringDraw: "畫師串抽卡" },
  settings: "設定", settingsHint: "API、儲存、備份、外觀、MCP…", outputDir: "輸出目錄", docs: "NovelAI 文件", onboarding: "新手引導",
  collapse: "收起導覽", expand: "展開導覽", arrange: "調整順序", arrangeDone: "完成", arrangeReset: "恢復預設順序", arrangeHelp: "拖曳或按 Alt+↑/↓ 調整組內順序，Esc 完成",
  search: "搜尋功能、工具、設定…", searchShort: "搜尋", searchEmpty: "沒有符合的功能", paletteTitle: "快速跳轉", paletteHint: "↑↓ 選擇 · Enter 開啟 · Esc 關閉",
  cmdGroups: { page: "頁面", tool: "工具", setting: "設定", action: "操作" },
  actions: { theme: "切換淺色／深色主題", stream: "開關串流預覽", output: "開啟輸出目錄", docs: "開啟 NovelAI 文件", onboarding: "重新開啟新手引導", rail: "收起／展開左側導覽", history: "顯示／隱藏歷史欄", tasks: "開啟任務中心", layout: "查看新版版面說明" },
  tasks: "任務", tasksIdle: "閒置", tasksTitle: "任務中心", tasksEmpty: "目前沒有任務。生成、批次、反推和轉換任務會顯示在這裡。",
  recent: "最近完成", clearRecent: "清除紀錄", updatedAt: "更新於", secondsAgo: "{n} 秒前", minutesAgo: "{n} 分鐘前", justNow: "剛剛",
  state: { waiting: "等待中", running: "進行中", paused: "已暫停", done: "已完成", failed: "失敗", cancelled: "已取消" },
  step: { idle: "閒置", preparing: "準備（核對餘額與估價）", requesting: "已提交，等待伺服器", streaming: "正在生成", saving: "儲存到歷史", queued: "排隊中", processing: "處理中", finished: "已結束" },
  kind: { generate: "文生圖", i2i: "圖生圖", enhance: "增強", inpaint: "局部重繪", upscale: "超解析", director: "導演工具", batchRedraw: "批次圖生圖", reverse: "AI 反推", convert: "中文轉標籤" },
  processed: "已處理 {current}/{total} 張", progress: "第 {current}/{total} 張", saved: "已儲存 {n} 張", failedCount: "失敗 {n} 張", waitingCount: "排隊 {n} 張", sampling: "取樣 {step}/{steps}",
  pause: "暫停", resume: "繼續", stop: "停止（保留已生成）", clearQueue: "清空排隊", open: "前往",
  account: "帳戶", streamOn: "串流預覽：開", streamOff: "串流預覽：關", themeLight: "淺色", themeDark: "深色", back: "返回", settingsBack: "返回工作區",
  layoutNoticeTitle: "介面已重新整理",
  layoutNoticeBody: "所有功能都在左側分組導覽中；按 Ctrl+K 可直接搜尋任何頁面、工具或設定。角色、參考圖與進階參數改為停靠在畫布旁，不再遮擋預覽。",
  layoutNoticeMore: "查看入口變化", dismiss: "知道了",
  dockTitle: "停靠面板", closeConfirm: { quitHint: "完全結束軟體", trayHint: "背景繼續執行，可從系統匣圖示還原", cancelHint: "回到軟體" },
};

const enUS: ShellText = {
  ...zhCN,
  groups: { create: "Create", prompt: "Prompts", library: "Library", automation: "Tools & agent" },
  tools: { comfyuiLocal: "Local ComfyUI", japaneseComic: "Japanese comic generator", comic: "Comic generator", promptCodex: "NovelAI personal codex", redraw: "Batch img2img", artistLookup: "Artist profile lookup", artistLab: "Style lab (style iteration)", v5ArtistRepair: "V4.5 artist string repair", artistStringDraw: "Artist string draw" },
  settings: "Settings", settingsHint: "API, storage, backup, appearance, MCP…", outputDir: "Output folder", docs: "NovelAI docs", onboarding: "Getting started",
  collapse: "Collapse navigation", expand: "Expand navigation", arrange: "Reorder", arrangeDone: "Done", arrangeReset: "Reset order", arrangeHelp: "Drag or press Alt+↑/↓ to reorder within a group, Esc to finish",
  search: "Search pages, tools, settings…", searchShort: "Search", searchEmpty: "No matching feature", paletteTitle: "Go to", paletteHint: "↑↓ select · Enter open · Esc close",
  cmdGroups: { page: "Page", tool: "Tool", setting: "Setting", action: "Action" },
  actions: { theme: "Toggle light / dark theme", stream: "Toggle live preview", output: "Open output folder", docs: "Open NovelAI docs", onboarding: "Reopen getting started", rail: "Collapse / expand navigation", history: "Show / hide history rail", tasks: "Open task center", layout: "What moved in the new layout" },
  tasks: "Tasks", tasksIdle: "Idle", tasksTitle: "Task center", tasksEmpty: "No tasks right now. Generation, batch, reverse and convert jobs appear here.",
  recent: "Recently finished", clearRecent: "Clear", updatedAt: "Updated", secondsAgo: "{n}s ago", minutesAgo: "{n}m ago", justNow: "just now",
  state: { waiting: "Waiting", running: "Running", paused: "Paused", done: "Done", failed: "Failed", cancelled: "Cancelled" },
  step: { idle: "Idle", preparing: "Preparing (balance & quote)", requesting: "Submitted, waiting for server", streaming: "Generating", saving: "Saving to history", queued: "Queued", processing: "Processing", finished: "Finished" },
  kind: { generate: "Text to image", i2i: "Image to image", enhance: "Enhance", inpaint: "Inpaint", upscale: "Upscale", director: "Director tool", batchRedraw: "Batch img2img", reverse: "AI reverse", convert: "Text to tags" },
  processed: "Processed {current}/{total}", progress: "Image {current}/{total}", saved: "{n} saved", failedCount: "{n} failed", waitingCount: "{n} queued", sampling: "Step {step}/{steps}",
  pause: "Pause", resume: "Resume", stop: "Stop (keep results)", clearQueue: "Clear queue", open: "Open",
  account: "Account", streamOn: "Live preview: on", streamOff: "Live preview: off", themeLight: "Light", themeDark: "Dark", back: "Back", settingsBack: "Back to workspace",
  layoutNoticeTitle: "The interface has been reorganized",
  layoutNoticeBody: "Every feature is in the grouped navigation on the left; press Ctrl+K to jump to any page, tool or setting. Characters, references and advanced parameters now dock beside the canvas instead of covering the preview.",
  layoutNoticeMore: "What moved", dismiss: "Got it",
  layoutChanges: [
    ["Top tab bar + “More” menu", "Grouped left navigation; all 14 pages visible at once"],
    ["“Arrange tabs”", "“Reorder” at the bottom of the navigation (drag or Alt+↑/↓, resettable)"],
    ["Settings dialog", "“Settings” in the navigation, opened as a page with a Back button"],
    ["Output folder / Docs buttons", "Navigation footer, also searchable with Ctrl+K"],
    ["Live preview switch", "Eye button on the title bar"],
    ["Account picker / manager / relay", "Account area on the title bar (unchanged behaviour)"],
    ["Tool cards", "Still on the Tools page; also one click from the navigation or Ctrl+K"],
    ["Character / vibe / precise reference / advanced dialogs", "Docked panel beside the canvas, preview stays visible"],
    ["Progress only near the run button", "Title-bar Tasks shows step, progress and last update with pause/stop"],
  ],
  dockTitle: "Docked panel", closeConfirm: { quitHint: "Exit the application", trayHint: "Keep running in the background; restore from the tray icon", cancelHint: "Return to the app" },
};

const jaJP: ShellText = {
  ...enUS,
  groups: { create: "作成", prompt: "プロンプト", library: "ライブラリ", automation: "ツールとエージェント" },
  tools: { comfyuiLocal: "ローカル ComfyUI", japaneseComic: "日本式漫画ジェネレーター", comic: "漫画ジェネレーター", promptCodex: "NovelAI 個人プロンプト法典", redraw: "一括 img2img", artistLookup: "絵師リンク検索", artistLab: "画風ラボ（画風反復）", v5ArtistRepair: "V4.5 絵師タグ修復", artistStringDraw: "絵師タグ抽選" },
  settings: "設定", settingsHint: "API・保存・バックアップ・外観・MCP…", outputDir: "出力フォルダ", docs: "NovelAI ドキュメント", onboarding: "はじめに",
  collapse: "ナビを折りたたむ", expand: "ナビを展開", arrange: "並べ替え", arrangeDone: "完了", arrangeReset: "初期順序に戻す", arrangeHelp: "ドラッグまたは Alt+↑/↓ でグループ内を並べ替え、Esc で完了",
  search: "機能・ツール・設定を検索…", searchShort: "検索", searchEmpty: "該当する機能がありません", paletteTitle: "移動", paletteHint: "↑↓ 選択 · Enter 開く · Esc 閉じる",
  cmdGroups: { page: "ページ", tool: "ツール", setting: "設定", action: "操作" },
  tasks: "タスク", tasksIdle: "待機", tasksTitle: "タスクセンター", tasksEmpty: "現在タスクはありません。生成・一括・逆解析・変換がここに表示されます。",
  recent: "最近完了", clearRecent: "クリア", updatedAt: "更新", secondsAgo: "{n} 秒前", minutesAgo: "{n} 分前", justNow: "たった今",
  state: { waiting: "待機中", running: "実行中", paused: "一時停止", done: "完了", failed: "失敗", cancelled: "キャンセル" },
  step: { idle: "待機", preparing: "準備中（残高と見積り）", requesting: "送信済み・サーバー待ち", streaming: "生成中", saving: "履歴に保存中", queued: "待ち行列", processing: "処理中", finished: "終了" },
  pause: "一時停止", resume: "再開", stop: "停止（生成済みは保持）", clearQueue: "待ち行列をクリア", open: "開く",
  progress: "{current}/{total} 枚目", processed: "処理済み {current}/{total} 枚", saved: "保存 {n} 枚", failedCount: "失敗 {n} 枚", waitingCount: "待機 {n} 枚", sampling: "ステップ {step}/{steps}",
  account: "アカウント", back: "戻る", settingsBack: "作業画面に戻る", layoutNoticeTitle: "画面を再構成しました", dismiss: "OK",
};

const koKR: ShellText = {
  ...enUS,
  groups: { create: "생성", prompt: "프롬프트", library: "라이브러리", automation: "도구 및 에이전트" },
  tools: { comfyuiLocal: "로컬 ComfyUI", japaneseComic: "일본식 만화 생성기", comic: "만화 생성기", promptCodex: "NovelAI 개인 프롬프트 법전", redraw: "일괄 img2img", artistLookup: "작가 링크 조회", artistLab: "화풍 실험실(화풍 반복)", v5ArtistRepair: "V4.5 작가 태그 복구", artistStringDraw: "작가 태그 뽑기" },
  settings: "설정", settingsHint: "API·저장·백업·외관·MCP…", outputDir: "출력 폴더", docs: "NovelAI 문서", onboarding: "시작 안내",
  collapse: "탐색 접기", expand: "탐색 펼치기", arrange: "순서 변경", arrangeDone: "완료", arrangeReset: "기본 순서", arrangeHelp: "드래그하거나 Alt+↑/↓로 그룹 내 순서를 바꾸고 Esc로 완료",
  search: "기능·도구·설정 검색…", searchShort: "검색", searchEmpty: "일치하는 기능이 없습니다", paletteTitle: "이동", paletteHint: "↑↓ 선택 · Enter 열기 · Esc 닫기",
  cmdGroups: { page: "페이지", tool: "도구", setting: "설정", action: "작업" },
  tasks: "작업", tasksIdle: "대기", tasksTitle: "작업 센터", tasksEmpty: "현재 작업이 없습니다. 생성·일괄·역추론·변환 작업이 여기에 표시됩니다.",
  recent: "최근 완료", clearRecent: "지우기", updatedAt: "업데이트", secondsAgo: "{n}초 전", minutesAgo: "{n}분 전", justNow: "방금",
  state: { waiting: "대기 중", running: "진행 중", paused: "일시 정지", done: "완료", failed: "실패", cancelled: "취소됨" },
  step: { idle: "대기", preparing: "준비 중(잔액·견적)", requesting: "제출됨, 서버 대기", streaming: "생성 중", saving: "기록에 저장 중", queued: "대기열", processing: "처리 중", finished: "종료" },
  pause: "일시 정지", resume: "계속", stop: "중지(생성분 유지)", clearQueue: "대기열 비우기", open: "열기",
  progress: "{current}/{total}번째", processed: "처리됨 {current}/{total}장", saved: "저장 {n}장", failedCount: "실패 {n}장", waitingCount: "대기 {n}장", sampling: "단계 {step}/{steps}",
  account: "계정", back: "뒤로", settingsBack: "작업 공간으로", layoutNoticeTitle: "화면이 재구성되었습니다", dismiss: "확인",
};

const TEXT: Record<string, ShellText> = { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS, "ja-JP": jaJP, "ko-KR": koKR };

export function shellText(language: unknown): ShellText {
  return TEXT[normalizeAppLanguage(language)] ?? zhCN;
}

export function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

const DELETE_IMAGE_TEXT: Record<string, { title: string; message: string; confirm: string; cancel: string }> = {
  "zh-CN": { title: "删除这张收藏图片？", message: "将从收藏中移除，并删除这张图片文件及其历史记录（与历史栏中的删除相同，无法撤销）。", confirm: "删除", cancel: "取消" },
  "zh-TW": { title: "刪除這張收藏圖片？", message: "將從收藏中移除，並刪除這張圖片檔案及其歷史紀錄（與歷史欄中的刪除相同，無法復原）。", confirm: "刪除", cancel: "取消" },
  "en-US": { title: "Delete this favorite image?", message: "It is removed from favorites and its image file and history entry are deleted (same as deleting from the history rail; cannot be undone).", confirm: "Delete", cancel: "Cancel" },
  "ja-JP": { title: "このお気に入り画像を削除しますか？", message: "お気に入りから外し、画像ファイルと履歴を削除します（履歴欄での削除と同じで、元に戻せません）。", confirm: "削除", cancel: "キャンセル" },
  "ko-KR": { title: "이 즐겨찾기 이미지를 삭제할까요?", message: "즐겨찾기에서 제거하고 이미지 파일과 기록을 삭제합니다(기록 패널에서 삭제하는 것과 같으며 되돌릴 수 없습니다).", confirm: "삭제", cancel: "취소" },
};

/** Second confirmation for favorite removals that also delete the image file. */
export function deleteFavoriteImageText(language: unknown) {
  return DELETE_IMAGE_TEXT[normalizeAppLanguage(language)] ?? DELETE_IMAGE_TEXT["zh-CN"];
}
