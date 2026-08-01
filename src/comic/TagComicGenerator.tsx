import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Button, NumberInput, Toggle } from "../components/ui";
import { Icon } from "../components/icons";
import { useAppStore } from "../store";
import {
  NAI_MODELS,
  NAI_SAMPLERS,
  type GenerateParams,
  type TagComicCandidate,
  type TagComicGenerateRequest,
  type TagComicPanel,
  type TagComicPanelReference,
  type TagComicProject,
  type TagComicReferenceAsset,
} from "../types";
import {
  TAG_COMIC_STORAGE_KEY,
  TAG_COMIC_SIZE_PRESETS,
  TagComicPanelRangeError,
  TagComicSizeImportError,
  buildTagComicGenerateRequest,
  createTagComicPanel,
  createTagComicProject,
  mergeTagComicParams,
  normalizeTagComicProject,
  formatTagComicPanelRange,
  parseTagComicImport,
  parseTagComicPanelRange,
  parseTagComicSizeImport,
  tagComicReferenceApplies,
  tagComicSizeTemplate,
} from "./tag-comic";

type Step = "import" | "global" | "panels" | "generate";
type QueueTask = { panelId: string; ordinal: number };
type PreparedQueueTask = QueueTask & { request: TagComicGenerateRequest };

const COPY = {
  "zh-CN": {
    title: "漫画生成器",
    subtitle: "直接导入 Tag，统一设定参数，为每个分镜挑选最终主图",
    back: "返回工具",
    stepImport: "导入",
    stepImportHint: "Tag / JSON / CSV",
    stepGlobal: "全局设定",
    stepGlobalHint: "风格 / 参数 / 次数",
    stepPanels: "分镜",
    stepPanelsHint: "标题 / Tag / 微调",
    stepGenerate: "生成",
    stepGenerateHint: "候选 / 主图 / ZIP",
    newProject: "新建项目",
    exportJson: "保存项目 JSON",
    importHeading: "导入 Tag 分镜",
    importDescription:
      "粘贴时每行一个分镜。JSON/CSV 可包含 title 与 prompt（或 tags）字段。",
    importPlaceholder:
      "masterpiece, 1girl, standing...\nmasterpiece, 1girl, close-up...",
    importText: "导入文本",
    chooseFile: "选择 TXT / JSON / CSV",
    replaceWarning: "导入会替换当前分镜，但不会修改全局参数。",
    noTags: "没有找到可导入的 Tag 提示词。",
    imported: "已导入 {count} 个分镜。",
    oldProject: "旧版漫画项目不再兼容，请导出 Tag 后重新导入。",
    projectTitle: "项目名称",
    globalStyle: "全局风格提示词",
    globalNegative: "全局负面提示词",
    initialCount: "每个提示词初次生成次数",
    initialCountHint: "默认 1，范围 1–10；完成后仍可继续追加候选图。",
    sizeMode: "分镜图片尺寸",
    sizeUniform: "统一尺寸",
    sizePerPanel: "逐分镜尺寸",
    sizeModeHint: "逐分镜模式按分镜顺序逐行匹配，只接受下方列出的合法尺寸。",
    sizesInput: "逐分镜尺寸（一行一个）",
    sizesPlaceholder: "832×1216\n1216×832\n1024×1024",
    sizeTemplate: "生成尺寸模板",
    importSizes: "导入并匹配尺寸",
    sizesApplied: "已为 {count} 个分镜匹配尺寸。",
    sizeEmpty: "请先填写逐分镜尺寸。",
    sizeCount: "尺寸数量不一致：需要 {expected} 行，实际 {actual} 行。",
    sizeBlank: "尺寸第 {line} 行为空。",
    sizeFormat: "尺寸第 {line} 行格式错误，请使用“宽×高”。",
    sizeUnsupported: "尺寸第 {line} 行不是软件支持的 NovelAI 尺寸。",
    sizesIncomplete: "部分分镜尚未指定合法尺寸，请重新导入完整尺寸列表。",
    panelSize: "本分镜尺寸",
    preciseHeading: "全局精准参考图",
    preciseHint: "参考图会复制到项目资源目录。最多 5 张，仅 NovelAI V4.5 可用。",
    preciseUpload: "添加精准参考图",
    preciseEmpty: "尚未添加精准参考图。",
    preciseCharacter: "角色",
    preciseStyle: "风格",
    preciseBoth: "角色与风格",
    preciseStrength: "参考强度",
    preciseFidelity: "信息保真度",
    preciseRemove: "移除",
    precisePanelHeading: "本分镜使用的精准参考",
    precisePanelHint: "勾选后可为当前分镜单独调整类型、强度和保真度。",
    preciseReset: "恢复全局值",
    preciseV45Only: "精准参考只能用于 NovelAI V4.5 模型。",
    preciseImportFailed: "精准参考图导入失败：{message}",
    preciseScope: "应用范围",
    preciseScopeAll: "全部分镜",
    preciseScopeInclude: "仅指定分镜",
    preciseScopeExclude: "排除指定分镜",
    preciseRange: "分镜编号",
    preciseRangePlaceholder: "例如：1-8, 10, 12",
    preciseApplyRange: "应用范围",
    preciseCoverage: "当前覆盖 {count}/{total} 个分镜",
    preciseRangeEmpty: "请输入需要指定或排除的分镜编号。",
    preciseRangeFormat: "分镜范围“{token}”格式错误。",
    preciseRangeOut: "分镜范围“{token}”超出当前分镜数量。",
    preciseManual: "手动覆盖",
    dragPanel: "拖拽调整分镜顺序",
    syncParams: "同步生成页参数",
    model: "模型",
    width: "宽度",
    height: "高度",
    steps: "步数",
    cfg: "提示词引导",
    sampler: "采样器",
    seed: "Seed（0 = 随机）",
    advanced: "展开高级参数",
    collapse: "收起高级参数",
    panelsHeading: "逐个编辑分镜",
    panelsEmpty: "还没有分镜，请先导入 Tag。",
    addPanel: "新增分镜",
    panelTitle: "分镜标题",
    panelPrompt: "Tag 提示词",
    delete: "删除",
    moveUp: "上移",
    moveDown: "下移",
    override: "单独设置本分镜参数",
    overrideHint: "关闭时使用全局生成参数。负面提示词始终使用全局设定。",
    ready: "待生成",
    generating: "生成中",
    done: "已生成",
    failed: "失败",
    generateHeading: "候选图与主图",
    generateInitial: "生成未完成的初始候选",
    addAll: "全部分镜各追加 1 张",
    addOne: "追加 1 张",
    retry: "重试",
    chooseMain: "设为主图",
    currentMain: "当前主图",
    candidates: "候选图片（{count}）",
    showCandidates: "展开候选",
    hideCandidates: "收起候选",
    noCandidate: "尚未生成候选图",
    previewHint: "双击主图可全屏预览",
    exportZip: "打包当前主图 ZIP",
    exportHint: "ZIP 每个分镜只包含当前选中的主图，并在点击后选择保存路径。",
    balance: "余额 {amount} Anlas",
    progress: "生成进度 {done}/{total}",
    stop: "停止全部任务",
    queueStopped: "已停止剩余生成任务。",
    confirmGenerate:
      "将生成 {count} 张图片，官方预估 {quote} Anlas。是否继续？",
    quoteFailed: "官方报价暂不可用，仍然尝试生成？",
    needToken: "请先配置 NovelAI Token。",
    emptyPrompt: "分镜 #{index} 的 Tag 为空。",
    generated: "分镜 #{index} 已追加候选图。",
    exportDone: "ZIP 已保存：{path}",
    confirmNew: "新建项目会清空当前漫画工作区，是否继续？",
    confirmReplace: "这会替换当前 {count} 个分镜，是否继续？",
    closePreview: "关闭预览",
    selectedCount: "{selected}/{total} 个分镜已有主图",
  },
  "zh-TW": {
    title: "漫畫生成器",
    subtitle: "直接匯入 Tag，統一設定參數，為每個分鏡挑選最終主圖",
    back: "返回工具",
    stepImport: "匯入",
    stepImportHint: "Tag / JSON / CSV",
    stepGlobal: "全域設定",
    stepGlobalHint: "風格 / 參數 / 次數",
    stepPanels: "分鏡",
    stepPanelsHint: "標題 / Tag / 微調",
    stepGenerate: "生成",
    stepGenerateHint: "候選 / 主圖 / ZIP",
    newProject: "新建專案",
    exportJson: "儲存專案 JSON",
    importHeading: "匯入 Tag 分鏡",
    importDescription:
      "貼上時每行一個分鏡。JSON/CSV 可包含 title 與 prompt（或 tags）欄位。",
    importPlaceholder:
      "masterpiece, 1girl, standing...\nmasterpiece, 1girl, close-up...",
    importText: "匯入文字",
    chooseFile: "選擇 TXT / JSON / CSV",
    replaceWarning: "匯入會取代目前分鏡，但不會修改全域參數。",
    noTags: "找不到可匯入的 Tag 提示詞。",
    imported: "已匯入 {count} 個分鏡。",
    oldProject: "舊版漫畫專案不再相容，請匯出 Tag 後重新匯入。",
    projectTitle: "專案名稱",
    globalStyle: "全域風格提示詞",
    globalNegative: "全域負面提示詞",
    initialCount: "每個提示詞初次生成次數",
    initialCountHint: "預設 1，範圍 1–10；完成後仍可繼續追加候選圖。",
    sizeMode: "分鏡圖片尺寸",
    sizeUniform: "統一尺寸",
    sizePerPanel: "逐分鏡尺寸",
    sizeModeHint: "逐分鏡模式依順序逐行配對，只接受下方列出的合法尺寸。",
    sizesInput: "逐分鏡尺寸（一行一個）",
    sizesPlaceholder: "832×1216\n1216×832\n1024×1024",
    sizeTemplate: "產生尺寸範本",
    importSizes: "匯入並配對尺寸",
    sizesApplied: "已為 {count} 個分鏡配對尺寸。",
    sizeEmpty: "請先填寫逐分鏡尺寸。",
    sizeCount: "尺寸數量不一致：需要 {expected} 行，實際 {actual} 行。",
    sizeBlank: "尺寸第 {line} 行為空。",
    sizeFormat: "尺寸第 {line} 行格式錯誤，請使用「寬×高」。",
    sizeUnsupported: "尺寸第 {line} 行不是軟體支援的 NovelAI 尺寸。",
    sizesIncomplete: "部分分鏡尚未指定合法尺寸，請重新匯入完整尺寸清單。",
    panelSize: "本分鏡尺寸",
    preciseHeading: "全域精準參考圖",
    preciseHint: "參考圖會複製到專案資源目錄。最多 5 張，僅 NovelAI V4.5 可用。",
    preciseUpload: "加入精準參考圖",
    preciseEmpty: "尚未加入精準參考圖。",
    preciseCharacter: "角色",
    preciseStyle: "風格",
    preciseBoth: "角色與風格",
    preciseStrength: "參考強度",
    preciseFidelity: "資訊保真度",
    preciseRemove: "移除",
    precisePanelHeading: "本分鏡使用的精準參考",
    precisePanelHint: "勾選後可為目前分鏡單獨調整類型、強度與保真度。",
    preciseReset: "恢復全域值",
    preciseV45Only: "精準參考只能用於 NovelAI V4.5 模型。",
    preciseImportFailed: "精準參考圖匯入失敗：{message}",
    preciseScope: "套用範圍",
    preciseScopeAll: "全部分鏡",
    preciseScopeInclude: "僅指定分鏡",
    preciseScopeExclude: "排除指定分鏡",
    preciseRange: "分鏡編號",
    preciseRangePlaceholder: "例如：1-8, 10, 12",
    preciseApplyRange: "套用範圍",
    preciseCoverage: "目前覆蓋 {count}/{total} 個分鏡",
    preciseRangeEmpty: "請輸入需要指定或排除的分鏡編號。",
    preciseRangeFormat: "分鏡範圍「{token}」格式錯誤。",
    preciseRangeOut: "分鏡範圍「{token}」超出目前分鏡數量。",
    preciseManual: "手動覆蓋",
    dragPanel: "拖曳調整分鏡順序",
    syncParams: "同步生成頁參數",
    model: "模型",
    width: "寬度",
    height: "高度",
    steps: "步數",
    cfg: "提示詞引導",
    sampler: "採樣器",
    seed: "Seed（0 = 隨機）",
    advanced: "展開進階參數",
    collapse: "收起進階參數",
    panelsHeading: "逐個編輯分鏡",
    panelsEmpty: "尚無分鏡，請先匯入 Tag。",
    addPanel: "新增分鏡",
    panelTitle: "分鏡標題",
    panelPrompt: "Tag 提示詞",
    delete: "刪除",
    moveUp: "上移",
    moveDown: "下移",
    override: "單獨設定本分鏡參數",
    overrideHint: "關閉時使用全域生成參數。負面提示詞一律使用全域設定。",
    ready: "待生成",
    generating: "生成中",
    done: "已生成",
    failed: "失敗",
    generateHeading: "候選圖與主圖",
    generateInitial: "生成未完成的初始候選",
    addAll: "全部分鏡各追加 1 張",
    addOne: "追加 1 張",
    retry: "重試",
    chooseMain: "設為主圖",
    currentMain: "目前主圖",
    candidates: "候選圖片（{count}）",
    showCandidates: "展開候選",
    hideCandidates: "收起候選",
    noCandidate: "尚未生成候選圖",
    previewHint: "雙擊主圖可全螢幕預覽",
    exportZip: "打包目前主圖 ZIP",
    exportHint: "ZIP 每個分鏡只包含目前選中的主圖，並在點擊後選擇儲存路徑。",
    balance: "餘額 {amount} Anlas",
    progress: "生成進度 {done}/{total}",
    stop: "停止全部任務",
    queueStopped: "已停止剩餘生成任務。",
    confirmGenerate:
      "將生成 {count} 張圖片，官方預估 {quote} Anlas。是否繼續？",
    quoteFailed: "官方報價暫不可用，仍然嘗試生成？",
    needToken: "請先設定 NovelAI Token。",
    emptyPrompt: "分鏡 #{index} 的 Tag 為空。",
    generated: "分鏡 #{index} 已追加候選圖。",
    exportDone: "ZIP 已儲存：{path}",
    confirmNew: "新建專案會清空目前漫畫工作區，是否繼續？",
    confirmReplace: "這會取代目前 {count} 個分鏡，是否繼續？",
    closePreview: "關閉預覽",
    selectedCount: "{selected}/{total} 個分鏡已有主圖",
  },
  "en-US": {
    title: "Comic Generator",
    subtitle:
      "Import tags, share global settings, and choose a final image for every panel",
    back: "Back to Tools",
    stepImport: "Import",
    stepImportHint: "Tags / JSON / CSV",
    stepGlobal: "Global",
    stepGlobalHint: "Style / params / count",
    stepPanels: "Panels",
    stepPanelsHint: "Title / tags / tuning",
    stepGenerate: "Generate",
    stepGenerateHint: "Candidates / main / ZIP",
    newProject: "New project",
    exportJson: "Save project JSON",
    importHeading: "Import tag panels",
    importDescription:
      "Paste one panel per line. JSON/CSV may include title and prompt (or tags) fields.",
    importPlaceholder:
      "masterpiece, 1girl, standing...\nmasterpiece, 1girl, close-up...",
    importText: "Import text",
    chooseFile: "Choose TXT / JSON / CSV",
    replaceWarning:
      "Import replaces the current panels without changing global settings.",
    noTags: "No tag prompts were found.",
    imported: "Imported {count} panels.",
    oldProject:
      "Legacy comic projects are unsupported. Export their tags and import again.",
    projectTitle: "Project name",
    globalStyle: "Global style prompt",
    globalNegative: "Global negative prompt",
    initialCount: "Initial images per prompt",
    initialCountHint:
      "Default 1, range 1–10. More candidates can be appended after completion.",
    sizeMode: "Panel image sizes",
    sizeUniform: "Uniform size",
    sizePerPanel: "Per-panel sizes",
    sizeModeHint: "Per-panel mode matches one line to each panel in order and accepts only the listed NovelAI sizes.",
    sizesInput: "Panel sizes (one per line)",
    sizesPlaceholder: "832×1216\n1216×832\n1024×1024",
    sizeTemplate: "Create size template",
    importSizes: "Import and match sizes",
    sizesApplied: "Matched sizes to {count} panels.",
    sizeEmpty: "Enter panel sizes first.",
    sizeCount: "Size count mismatch: expected {expected} lines, received {actual}.",
    sizeBlank: "Size line {line} is blank.",
    sizeFormat: "Size line {line} is invalid. Use width×height.",
    sizeUnsupported: "Size line {line} is not a supported NovelAI size.",
    sizesIncomplete: "Some panels do not have a supported size. Import a complete size list again.",
    panelSize: "Panel size",
    preciseHeading: "Global precise references",
    preciseHint: "References are copied into project resources. Up to 5; NovelAI V4.5 only.",
    preciseUpload: "Add precise references",
    preciseEmpty: "No precise references added.",
    preciseCharacter: "Character",
    preciseStyle: "Style",
    preciseBoth: "Character & style",
    preciseStrength: "Reference strength",
    preciseFidelity: "Information fidelity",
    preciseRemove: "Remove",
    precisePanelHeading: "Precise references for this panel",
    precisePanelHint: "Select references and tune type, strength, and fidelity for this panel.",
    preciseReset: "Reset to global",
    preciseV45Only: "Precise Reference requires a NovelAI V4.5 model.",
    preciseImportFailed: "Could not import precise reference: {message}",
    preciseScope: "Apply to",
    preciseScopeAll: "All panels",
    preciseScopeInclude: "Only selected panels",
    preciseScopeExclude: "All except selected",
    preciseRange: "Panel numbers",
    preciseRangePlaceholder: "Example: 1-8, 10, 12",
    preciseApplyRange: "Apply range",
    preciseCoverage: "Applies to {count}/{total} panels",
    preciseRangeEmpty: "Enter panel numbers to include or exclude.",
    preciseRangeFormat: "Panel range “{token}” has an invalid format.",
    preciseRangeOut: "Panel range “{token}” is outside the current panel count.",
    preciseManual: "Manual override",
    dragPanel: "Drag to reorder panels",
    syncParams: "Sync Generate settings",
    model: "Model",
    width: "Width",
    height: "Height",
    steps: "Steps",
    cfg: "Prompt guidance",
    sampler: "Sampler",
    seed: "Seed (0 = random)",
    advanced: "Show advanced parameters",
    collapse: "Hide advanced parameters",
    panelsHeading: "Edit panels",
    panelsEmpty: "No panels yet. Import tags first.",
    addPanel: "Add panel",
    panelTitle: "Panel title",
    panelPrompt: "Tag prompt",
    delete: "Delete",
    moveUp: "Move up",
    moveDown: "Move down",
    override: "Override this panel's parameters",
    overrideHint:
      "Off uses global parameters. The negative prompt is always global.",
    ready: "Ready",
    generating: "Generating",
    done: "Generated",
    failed: "Failed",
    generateHeading: "Candidates and main images",
    generateInitial: "Generate missing initial candidates",
    addAll: "Add 1 image to every panel",
    addOne: "Add 1 image",
    retry: "Retry",
    chooseMain: "Set as main",
    currentMain: "Current main",
    candidates: "Candidates ({count})",
    showCandidates: "Show candidates",
    hideCandidates: "Hide candidates",
    noCandidate: "No candidates yet",
    previewHint: "Double-click the main image to preview",
    exportZip: "Export current main images",
    exportHint:
      "The ZIP contains only the selected main image for each panel. Choose a location after clicking.",
    balance: "Balance {amount} Anlas",
    progress: "Progress {done}/{total}",
    stop: "Stop all tasks",
    queueStopped: "Remaining generation tasks stopped.",
    confirmGenerate: "Generate {count} images? Official quote: {quote} Anlas.",
    quoteFailed: "Official quote is unavailable. Try generation anyway?",
    needToken: "Configure a NovelAI token first.",
    emptyPrompt: "Panel #{index} has no tags.",
    generated: "Added a candidate to panel #{index}.",
    exportDone: "ZIP saved to {path}",
    confirmNew: "A new project clears the current comic workspace. Continue?",
    confirmReplace: "Replace the current {count} panels?",
    closePreview: "Close preview",
    selectedCount: "{selected}/{total} panels have a main image",
  },
  "ja-JP": {
    title: "漫画ジェネレーター",
    subtitle: "Tag を直接読み込み、共通設定で生成し、各コマの最終画像を選択",
    back: "ツールへ戻る",
    stepImport: "読み込み",
    stepImportHint: "Tag / JSON / CSV",
    stepGlobal: "全体設定",
    stepGlobalHint: "スタイル / パラメータ / 枚数",
    stepPanels: "コマ",
    stepPanelsHint: "タイトル / Tag / 調整",
    stepGenerate: "生成",
    stepGenerateHint: "候補 / メイン / ZIP",
    newProject: "新規プロジェクト",
    exportJson: "プロジェクト JSON を保存",
    importHeading: "Tag コマを読み込む",
    importDescription:
      "貼り付けは1行1コマ。JSON/CSV は title と prompt（または tags）に対応します。",
    importPlaceholder:
      "masterpiece, 1girl, standing...\nmasterpiece, 1girl, close-up...",
    importText: "テキストを読み込む",
    chooseFile: "TXT / JSON / CSV を選択",
    replaceWarning:
      "読み込みは現在のコマを置換しますが、全体設定は変更しません。",
    noTags: "読み込める Tag がありません。",
    imported: "{count} コマを読み込みました。",
    oldProject:
      "旧形式の漫画プロジェクトには対応しません。Tag を書き出して再読み込みしてください。",
    projectTitle: "プロジェクト名",
    globalStyle: "全体スタイルプロンプト",
    globalNegative: "全体ネガティブプロンプト",
    initialCount: "各プロンプトの初回生成枚数",
    initialCountHint: "既定 1、範囲 1～10。完了後も候補を追加できます。",
    sizeMode: "コマ画像サイズ",
    sizeUniform: "共通サイズ",
    sizePerPanel: "コマ別サイズ",
    sizeModeHint: "コマ別モードは順番に1行ずつ対応し、一覧内の NovelAI 対応サイズのみ受け付けます。",
    sizesInput: "コマ別サイズ（1行1件）",
    sizesPlaceholder: "832×1216\n1216×832\n1024×1024",
    sizeTemplate: "サイズ雛形を作成",
    importSizes: "サイズを読み込んで対応",
    sizesApplied: "{count} コマにサイズを対応しました。",
    sizeEmpty: "先にコマ別サイズを入力してください。",
    sizeCount: "サイズ数が一致しません。必要 {expected} 行、実際 {actual} 行です。",
    sizeBlank: "サイズの {line} 行目が空です。",
    sizeFormat: "サイズの {line} 行目が不正です。「幅×高さ」で入力してください。",
    sizeUnsupported: "サイズの {line} 行目は対応している NovelAI サイズではありません。",
    sizesIncomplete: "サイズ未設定のコマがあります。完全なサイズ一覧を再読み込みしてください。",
    panelSize: "このコマのサイズ",
    preciseHeading: "共通精密参照画像",
    preciseHint: "参照画像はプロジェクト資源へコピーされます。最大5枚、NovelAI V4.5専用です。",
    preciseUpload: "精密参照画像を追加",
    preciseEmpty: "精密参照画像はありません。",
    preciseCharacter: "キャラクター",
    preciseStyle: "スタイル",
    preciseBoth: "キャラクターとスタイル",
    preciseStrength: "参照強度",
    preciseFidelity: "情報忠実度",
    preciseRemove: "削除",
    precisePanelHeading: "このコマの精密参照",
    precisePanelHint: "選択後、このコマだけ種類・強度・忠実度を調整できます。",
    preciseReset: "共通値に戻す",
    preciseV45Only: "精密参照は NovelAI V4.5 モデル専用です。",
    preciseImportFailed: "精密参照画像を読み込めません：{message}",
    preciseScope: "適用範囲",
    preciseScopeAll: "すべてのコマ",
    preciseScopeInclude: "指定したコマのみ",
    preciseScopeExclude: "指定したコマを除外",
    preciseRange: "コマ番号",
    preciseRangePlaceholder: "例：1-8, 10, 12",
    preciseApplyRange: "範囲を適用",
    preciseCoverage: "{count}/{total} コマに適用",
    preciseRangeEmpty: "指定または除外するコマ番号を入力してください。",
    preciseRangeFormat: "コマ範囲「{token}」の形式が不正です。",
    preciseRangeOut: "コマ範囲「{token}」が現在のコマ数を超えています。",
    preciseManual: "手動上書き",
    dragPanel: "ドラッグしてコマ順を変更",
    syncParams: "生成画面の設定を同期",
    model: "モデル",
    width: "幅",
    height: "高さ",
    steps: "ステップ",
    cfg: "プロンプト誘導",
    sampler: "サンプラー",
    seed: "Seed（0 = ランダム）",
    advanced: "詳細パラメータを表示",
    collapse: "詳細パラメータを閉じる",
    panelsHeading: "コマを編集",
    panelsEmpty: "コマがありません。先に Tag を読み込んでください。",
    addPanel: "コマを追加",
    panelTitle: "コマのタイトル",
    panelPrompt: "Tag プロンプト",
    delete: "削除",
    moveUp: "上へ",
    moveDown: "下へ",
    override: "このコマだけパラメータを変更",
    overrideHint: "オフでは全体設定を使用。ネガティブは常に全体共通です。",
    ready: "待機",
    generating: "生成中",
    done: "生成済み",
    failed: "失敗",
    generateHeading: "候補画像とメイン画像",
    generateInitial: "不足している初回候補を生成",
    addAll: "全コマに1枚ずつ追加",
    addOne: "1枚追加",
    retry: "再試行",
    chooseMain: "メインに設定",
    currentMain: "現在のメイン",
    candidates: "候補画像（{count}）",
    showCandidates: "候補を開く",
    hideCandidates: "候補を閉じる",
    noCandidate: "候補画像はありません",
    previewHint: "メイン画像をダブルクリックしてプレビュー",
    exportZip: "現在のメイン画像を ZIP",
    exportHint:
      "ZIP には各コマで選択したメイン画像だけを含めます。クリック後に保存先を選びます。",
    balance: "残高 {amount} Anlas",
    progress: "生成 {done}/{total}",
    stop: "すべて停止",
    queueStopped: "残りの生成を停止しました。",
    confirmGenerate:
      "{count} 枚を生成します。公式見積りは {quote} Anlas。続行しますか？",
    quoteFailed: "公式見積りを取得できません。生成を試しますか？",
    needToken: "NovelAI Token を設定してください。",
    emptyPrompt: "コマ #{index} の Tag が空です。",
    generated: "コマ #{index} に候補を追加しました。",
    exportDone: "ZIP 保存先：{path}",
    confirmNew: "新規プロジェクトは現在の作業を消去します。続行しますか？",
    confirmReplace: "現在の {count} コマを置換しますか？",
    closePreview: "プレビューを閉じる",
    selectedCount: "{selected}/{total} コマにメイン画像があります",
  },
  "ko-KR": {
    title: "만화 생성기",
    subtitle:
      "Tag를 직접 가져오고 공통 설정으로 생성한 뒤 각 컷의 최종 이미지를 선택하세요",
    back: "도구로 돌아가기",
    stepImport: "가져오기",
    stepImportHint: "Tag / JSON / CSV",
    stepGlobal: "전체 설정",
    stepGlobalHint: "스타일 / 매개변수 / 수량",
    stepPanels: "컷",
    stepPanelsHint: "제목 / Tag / 조정",
    stepGenerate: "생성",
    stepGenerateHint: "후보 / 메인 / ZIP",
    newProject: "새 프로젝트",
    exportJson: "프로젝트 JSON 저장",
    importHeading: "Tag 컷 가져오기",
    importDescription:
      "붙여넣기는 한 줄에 한 컷입니다. JSON/CSV는 title과 prompt(또는 tags) 필드를 지원합니다.",
    importPlaceholder:
      "masterpiece, 1girl, standing...\nmasterpiece, 1girl, close-up...",
    importText: "텍스트 가져오기",
    chooseFile: "TXT / JSON / CSV 선택",
    replaceWarning: "가져오기는 현재 컷만 교체하며 전체 설정은 유지합니다.",
    noTags: "가져올 Tag 프롬프트가 없습니다.",
    imported: "{count}개 컷을 가져왔습니다.",
    oldProject:
      "이전 만화 프로젝트는 지원하지 않습니다. Tag를 내보낸 뒤 다시 가져오세요.",
    projectTitle: "프로젝트 이름",
    globalStyle: "전체 스타일 프롬프트",
    globalNegative: "전체 네거티브 프롬프트",
    initialCount: "프롬프트당 최초 생성 수",
    initialCountHint:
      "기본 1, 범위 1~10. 완료 후 후보를 계속 추가할 수 있습니다.",
    sizeMode: "컷 이미지 크기",
    sizeUniform: "통일 크기",
    sizePerPanel: "컷별 크기",
    sizeModeHint: "컷별 모드는 순서대로 한 줄씩 연결하며 목록의 NovelAI 지원 크기만 허용합니다.",
    sizesInput: "컷별 크기 (한 줄에 하나)",
    sizesPlaceholder: "832×1216\n1216×832\n1024×1024",
    sizeTemplate: "크기 템플릿 만들기",
    importSizes: "크기 가져오기 및 연결",
    sizesApplied: "{count}개 컷에 크기를 연결했습니다.",
    sizeEmpty: "먼저 컷별 크기를 입력하세요.",
    sizeCount: "크기 수가 맞지 않습니다. 필요 {expected}줄, 실제 {actual}줄입니다.",
    sizeBlank: "크기 {line}번째 줄이 비어 있습니다.",
    sizeFormat: "크기 {line}번째 줄 형식이 잘못되었습니다. 너비×높이를 사용하세요.",
    sizeUnsupported: "크기 {line}번째 줄은 지원되는 NovelAI 크기가 아닙니다.",
    sizesIncomplete: "일부 컷에 지원 크기가 없습니다. 전체 크기 목록을 다시 가져오세요.",
    panelSize: "이 컷 크기",
    preciseHeading: "전체 정밀 참조 이미지",
    preciseHint: "참조 이미지는 프로젝트 리소스에 복사됩니다. 최대 5장, NovelAI V4.5 전용입니다.",
    preciseUpload: "정밀 참조 추가",
    preciseEmpty: "추가된 정밀 참조가 없습니다.",
    preciseCharacter: "캐릭터",
    preciseStyle: "스타일",
    preciseBoth: "캐릭터 및 스타일",
    preciseStrength: "참조 강도",
    preciseFidelity: "정보 충실도",
    preciseRemove: "제거",
    precisePanelHeading: "이 컷의 정밀 참조",
    precisePanelHint: "선택 후 이 컷의 유형, 강도, 충실도를 개별 조정할 수 있습니다.",
    preciseReset: "전체 값으로 복원",
    preciseV45Only: "정밀 참조는 NovelAI V4.5 모델에서만 사용할 수 있습니다.",
    preciseImportFailed: "정밀 참조를 가져오지 못했습니다: {message}",
    preciseScope: "적용 범위",
    preciseScopeAll: "모든 컷",
    preciseScopeInclude: "지정한 컷만",
    preciseScopeExclude: "지정한 컷 제외",
    preciseRange: "컷 번호",
    preciseRangePlaceholder: "예: 1-8, 10, 12",
    preciseApplyRange: "범위 적용",
    preciseCoverage: "{count}/{total}개 컷에 적용",
    preciseRangeEmpty: "지정하거나 제외할 컷 번호를 입력하세요.",
    preciseRangeFormat: "컷 범위 “{token}” 형식이 잘못되었습니다.",
    preciseRangeOut: "컷 범위 “{token}”이 현재 컷 수를 벗어났습니다.",
    preciseManual: "수동 재정의",
    dragPanel: "드래그하여 컷 순서 변경",
    syncParams: "생성 화면 설정 동기화",
    model: "모델",
    width: "너비",
    height: "높이",
    steps: "스텝",
    cfg: "프롬프트 가이드",
    sampler: "샘플러",
    seed: "Seed(0 = 무작위)",
    advanced: "고급 매개변수 열기",
    collapse: "고급 매개변수 닫기",
    panelsHeading: "컷 편집",
    panelsEmpty: "컷이 없습니다. 먼저 Tag를 가져오세요.",
    addPanel: "컷 추가",
    panelTitle: "컷 제목",
    panelPrompt: "Tag 프롬프트",
    delete: "삭제",
    moveUp: "위로",
    moveDown: "아래로",
    override: "이 컷의 매개변수만 변경",
    overrideHint:
      "끄면 전체 설정을 사용합니다. 네거티브는 항상 전체 공통입니다.",
    ready: "대기",
    generating: "생성 중",
    done: "생성됨",
    failed: "실패",
    generateHeading: "후보와 메인 이미지",
    generateInitial: "부족한 최초 후보 생성",
    addAll: "모든 컷에 1장씩 추가",
    addOne: "1장 추가",
    retry: "재시도",
    chooseMain: "메인으로 설정",
    currentMain: "현재 메인",
    candidates: "후보 이미지({count})",
    showCandidates: "후보 펼치기",
    hideCandidates: "후보 접기",
    noCandidate: "후보 이미지 없음",
    previewHint: "메인 이미지를 두 번 클릭해 미리보기",
    exportZip: "현재 메인 이미지 ZIP",
    exportHint:
      "ZIP에는 각 컷에서 선택한 메인 이미지만 포함됩니다. 클릭 후 저장 위치를 선택합니다.",
    balance: "잔액 {amount} Anlas",
    progress: "생성 진행 {done}/{total}",
    stop: "모든 작업 중지",
    queueStopped: "남은 생성 작업을 중지했습니다.",
    confirmGenerate:
      "{count}장을 생성합니다. 공식 예상 비용은 {quote} Anlas입니다. 계속할까요?",
    quoteFailed: "공식 견적을 가져오지 못했습니다. 그래도 생성할까요?",
    needToken: "NovelAI Token을 먼저 설정하세요.",
    emptyPrompt: "컷 #{index}의 Tag가 비어 있습니다.",
    generated: "컷 #{index}에 후보를 추가했습니다.",
    exportDone: "ZIP 저장 위치: {path}",
    confirmNew: "새 프로젝트를 만들면 현재 작업이 삭제됩니다. 계속할까요?",
    confirmReplace: "현재 {count}개 컷을 교체할까요?",
    closePreview: "미리보기 닫기",
    selectedCount: "{selected}/{total}개 컷에 메인 이미지가 있습니다",
  },
} as const;

type CopyKey = keyof (typeof COPY)["en-US"];

function text(language: unknown, key: CopyKey) {
  const code =
    typeof language === "string" && language in COPY
      ? (language as keyof typeof COPY)
      : "zh-CN";
  return COPY[code][key] ?? COPY["en-US"][key];
}

function format(
  language: unknown,
  key: CopyKey,
  values: Record<string, unknown>,
) {
  return text(language, key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values[name] ?? ""),
  );
}

function selectedCandidate(panel: TagComicPanel) {
  return (
    panel.candidates.find((item) => item.id === panel.selectedCandidateId) ??
    panel.candidates[0]
  );
}

function statusLabel(language: unknown, panel: TagComicPanel) {
  return text(language, panel.status);
}

export function TagComicGenerator({ onBack }: { onBack?: () => void }) {
  const currentParams = useAppStore((state) => state.params);
  const settings = useAppStore((state) => state.settings);
  const account = useAppStore((state) => state.account);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const refreshHistory = useAppStore((state) => state.refreshHistory);
  const setToast = useAppStore((state) => state.setToast);
  const language = settings?.language;
  const [project, setProject] = useState<TagComicProject>(() => {
    try {
      const stored = localStorage.getItem(TAG_COMIC_STORAGE_KEY);
      return stored
        ? normalizeTagComicProject(JSON.parse(stored), currentParams, {
            trustOutputs: true,
          })
        : createTagComicProject(currentParams);
    } catch {
      return createTagComicProject(currentParams);
    }
  });
  const [step, setStep] = useState<Step>("import");
  const [bulkText, setBulkText] = useState("");
  const [sizeText, setSizeText] = useState("");
  const [referenceRanges, setReferenceRanges] = useState<Record<string, string>>({});
  const [activePanelId, setActivePanelId] = useState("");
  const [draggedPanelId, setDraggedPanelId] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedCandidates, setExpandedCandidates] = useState<Set<string>>(
    () => new Set(),
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [queue, setQueue] = useState<{ total: number; done: number } | null>(
    null,
  );
  const queueRef = useRef({ running: false, cancelled: false });
  const mountedRef = useRef(true);
  const projectRef = useRef(project);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (queueRef.current.running) {
        queueRef.current.cancelled = true;
        void window.naiDesktop.cancel();
      }
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(TAG_COMIC_STORAGE_KEY, JSON.stringify(project));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const panels = useMemo(
    () => [...project.panels].sort((a, b) => a.index - b.index),
    [project.panels],
  );
  const activePanel =
    panels.find((panel) => panel.id === activePanelId) ?? panels[0];
  const selectedCount = panels.filter((panel) =>
    selectedCandidate(panel),
  ).length;

  useEffect(() => {
    if (panels.length && !panels.some((panel) => panel.id === activePanelId)) {
      setActivePanelId(panels[0].id);
    }
  }, [activePanelId, panels]);

  function patchProject(patch: Partial<TagComicProject>) {
    setProject((current) => {
      const next = { ...current, ...patch };
      projectRef.current = next;
      return next;
    });
  }

  function patchGlobalParam<K extends keyof GenerateParams>(
    key: K,
    value: GenerateParams[K],
  ) {
    setProject((current) => {
      const next = {
        ...current,
        globalParams: {
          ...current.globalParams,
          [key]: value,
          positivePrompt: "",
        },
      };
      projectRef.current = next;
      return next;
    });
  }

  function patchPanel(
    panelId: string,
    updater: (panel: TagComicPanel) => TagComicPanel,
  ) {
    setProject((current) => {
      const next = {
        ...current,
        panels: current.panels.map((panel) =>
          panel.id === panelId ? updater(panel) : panel,
        ),
      };
      projectRef.current = next;
      return next;
    });
  }

  function patchPanelParam<K extends keyof GenerateParams>(
    panelId: string,
    key: K,
    value: GenerateParams[K],
  ) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      paramsOverride: {
        ...panel.paramsOverride,
        params: { ...panel.paramsOverride.params, [key]: value },
      },
    }));
  }

  function replacePanels(items: Array<{ title: string; prompt: string }>) {
    if (!items.length) {
      setToast(text(language, "noTags"));
      return;
    }
    if (
      panels.length &&
      !window.confirm(
        format(language, "confirmReplace", { count: panels.length }),
      )
    )
      return;
    const defaultSize = {
      width: project.globalParams.width,
      height: project.globalParams.height,
    };
    patchProject({
      panels: items.map((item, index) => ({
        ...createTagComicPanel(item.prompt, index + 1, item.title),
        imageSize: project.sizeMode === "perPanel" ? defaultSize : undefined,
      })),
      historyGroupId: undefined,
      preciseReferences: project.preciseReferences.map((reference) => ({
        ...reference,
        scope: "all",
        scopePanelIds: [],
      })),
    });
    setSizeText("");
    setReferenceRanges({});
    setActivePanelId("");
    setToast(format(language, "imported", { count: items.length }));
    setStep("global");
  }

  function importText() {
    try {
      replacePanels(parseTagComicImport(bulkText));
      setBulkText("");
    } catch (error) {
      setToast(
        error instanceof Error && error.message.includes("Old")
          ? text(language, "oldProject")
          : error instanceof Error
            ? error.message
            : String(error),
      );
    }
  }

  async function importFile(file: File | null) {
    if (!file) return;
    try {
      const raw = await file.text();
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(raw) as unknown;
        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          (parsed as { schemaVersion?: unknown }).schemaVersion === 2
        ) {
          const next = normalizeTagComicProject(parsed, currentParams, {
            trustOutputs: false,
          });
          projectRef.current = next;
          setProject(next);
          setActivePanelId("");
          setStep("global");
          return;
        }
      }
      replacePanels(parseTagComicImport(raw, file.name));
    } catch (error) {
      setToast(
        error instanceof Error &&
          (error.message.includes("Old") || error.message.includes("schema"))
          ? text(language, "oldProject")
          : error instanceof Error
            ? error.message
            : String(error),
      );
    }
  }

  function exportProjectJson() {
    const portableProject = {
      ...project,
      preciseReferences: [],
      panels: project.panels.map((panel) => ({
        ...panel,
        preciseReferences: [],
      })),
    };
    const blob = new Blob([JSON.stringify(portableProject, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.title || "comic-project"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function newProject() {
    if (!window.confirm(text(language, "confirmNew"))) return;
    const next = createTagComicProject(currentParams);
    projectRef.current = next;
    setProject(next);
    setBulkText("");
    setSizeText("");
    setReferenceRanges({});
    setActivePanelId("");
    setStep("import");
  }

  function syncParams() {
    setProject((current) => {
      const next = {
        ...current,
        globalStylePrompt: currentParams.stylePrompt,
        globalNegativePrompt: currentParams.negativePrompt,
        globalParams: { ...currentParams, positivePrompt: "" },
      };
      projectRef.current = next;
      return next;
    });
  }

  function addPanel() {
    const panel = {
      ...createTagComicPanel("", panels.length + 1),
      imageSize:
        project.sizeMode === "perPanel"
          ? {
              width: project.globalParams.width,
              height: project.globalParams.height,
            }
          : undefined,
    };
    setProject((current) => ({
      ...current,
      panels: [...current.panels, panel],
    }));
    setActivePanelId(panel.id);
  }

  async function importPreciseReferences(files: FileList | null) {
    if (!files?.length) return;
    const capacity = Math.max(0, 5 - project.preciseReferences.length);
    for (const file of Array.from(files).slice(0, capacity)) {
      const result = await window.naiDesktop.tagComicImportReference({
        projectId: project.id,
        sourcePath: window.naiDesktop.getPathForFile(file),
      });
      if (!result.ok || !result.asset) {
        setToast(
          format(language, "preciseImportFailed", { message: result.message }),
        );
        continue;
      }
      setProject((current) => ({
        ...current,
        preciseReferences: [...current.preciseReferences, result.asset!],
      }));
    }
  }

  function patchPreciseReference(
    referenceId: string,
    patch: Partial<
      Pick<
        TagComicReferenceAsset,
        | "type"
        | "strength"
        | "fidelity"
        | "informationExtracted"
        | "scope"
        | "scopePanelIds"
      >
    >,
  ) {
    setProject((current) => ({
      ...current,
      preciseReferences: current.preciseReferences.map((item) =>
        item.id === referenceId ? { ...item, ...patch } : item,
      ),
    }));
  }

  function referenceRangeMessage(error: unknown) {
    if (!(error instanceof TagComicPanelRangeError)) {
      return error instanceof Error ? error.message : String(error);
    }
    if (error.code === "empty") return text(language, "preciseRangeEmpty");
    return format(
      language,
      error.code === "format" ? "preciseRangeFormat" : "preciseRangeOut",
      { token: error.token ?? "?" },
    );
  }

  function setReferenceScope(
    reference: TagComicReferenceAsset,
    scope: TagComicReferenceAsset["scope"],
  ) {
    patchPreciseReference(reference.id, {
      scope,
      scopePanelIds: scope === "all" ? [] : reference.scopePanelIds,
    });
    setReferenceRanges((current) => ({
      ...current,
      [reference.id]:
        scope === "all"
          ? ""
          : formatTagComicPanelRange(reference.scopePanelIds, panels),
    }));
  }

  function applyReferenceRange(
    reference: TagComicReferenceAsset,
    rawValue?: string,
  ) {
    try {
      const numbers = parseTagComicPanelRange(
        rawValue ??
          referenceRanges[reference.id] ??
          formatTagComicPanelRange(reference.scopePanelIds, panels),
        panels.length,
      );
      const panelIds = numbers.map((number) => panels[number - 1].id);
      patchPreciseReference(reference.id, { scopePanelIds: panelIds });
      setReferenceRanges((current) => ({
        ...current,
        [reference.id]: formatTagComicPanelRange(panelIds, panels),
      }));
    } catch (error) {
      setToast(referenceRangeMessage(error));
    }
  }

  async function removePreciseReference(referenceId: string) {
    await window.naiDesktop.tagComicDeleteReference(project.id, referenceId);
    setProject((current) => ({
      ...current,
      preciseReferences: current.preciseReferences.filter(
        (item) => item.id !== referenceId,
      ),
      panels: current.panels.map((panel) => ({
        ...panel,
        preciseReferences: panel.preciseReferences.filter(
          (item) => item.referenceId !== referenceId,
        ),
      })),
    }));
  }

  function togglePanelReference(
    panelId: string,
    asset: TagComicReferenceAsset,
    enabled: boolean,
  ) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      preciseReferences: [
        ...panel.preciseReferences.filter(
          (item) => item.referenceId !== asset.id,
        ),
        {
          referenceId: asset.id,
          enabled,
          type:
            panel.preciseReferences.find((item) => item.referenceId === asset.id)
              ?.type ?? asset.type,
          strength:
            panel.preciseReferences.find((item) => item.referenceId === asset.id)
              ?.strength ?? asset.strength,
          fidelity:
            panel.preciseReferences.find((item) => item.referenceId === asset.id)
              ?.fidelity ?? asset.fidelity,
          informationExtracted:
            panel.preciseReferences.find((item) => item.referenceId === asset.id)
              ?.informationExtracted ?? asset.informationExtracted,
        },
      ],
    }));
  }

  function patchPanelReference(
    panelId: string,
    referenceId: string,
    patch: Partial<TagComicPanelReference>,
  ) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      preciseReferences: panel.preciseReferences.some(
        (item) => item.referenceId === referenceId,
      )
        ? panel.preciseReferences.map((item) =>
            item.referenceId === referenceId ? { ...item, ...patch } : item,
          )
        : [
            ...panel.preciseReferences,
            {
              referenceId,
              enabled: true,
              type:
                project.preciseReferences.find((item) => item.id === referenceId)
                  ?.type ?? "character",
              strength:
                project.preciseReferences.find((item) => item.id === referenceId)
                  ?.strength ?? 1,
              fidelity:
                project.preciseReferences.find((item) => item.id === referenceId)
                  ?.fidelity ?? 1,
              informationExtracted:
                project.preciseReferences.find((item) => item.id === referenceId)
                  ?.informationExtracted ?? 1,
              ...patch,
            },
          ],
    }));
  }

  function clearPanelReferenceOverride(panelId: string, referenceId: string) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      preciseReferences: panel.preciseReferences.filter(
        (item) => item.referenceId !== referenceId,
      ),
    }));
  }

  function sizeImportMessage(error: unknown) {
    if (!(error instanceof TagComicSizeImportError)) {
      return error instanceof Error ? error.message : String(error);
    }
    if (error.code === "empty") return text(language, "sizeEmpty");
    if (error.code === "count") {
      return format(language, "sizeCount", {
        expected: error.expected ?? panels.length,
        actual: error.actual ?? 0,
      });
    }
    const key = error.code === "blank"
      ? "sizeBlank"
      : error.code === "format"
        ? "sizeFormat"
        : "sizeUnsupported";
    return format(language, key, { line: error.line ?? "?" });
  }

  function setSizeMode(sizeMode: TagComicProject["sizeMode"]) {
    const fallback = {
      width: project.globalParams.width,
      height: project.globalParams.height,
    };
    patchProject({
      sizeMode,
      panels:
        sizeMode === "perPanel"
          ? project.panels.map((panel) => ({
              ...panel,
              imageSize: panel.imageSize ?? fallback,
            }))
          : project.panels,
    });
  }

  function createSizeTemplate() {
    if (!panels.length) {
      setToast(text(language, "noTags"));
      return;
    }
    setSizeText(
      tagComicSizeTemplate(panels.length, {
        width: project.globalParams.width,
        height: project.globalParams.height,
      }),
    );
  }

  function importPanelSizes() {
    try {
      const sizes = parseTagComicSizeImport(sizeText, panels.length);
      patchProject({
        sizeMode: "perPanel",
        panels: project.panels.map((panel, index) => ({
          ...panel,
          imageSize: sizes[index],
        })),
      });
      setToast(format(language, "sizesApplied", { count: sizes.length }));
    } catch (error) {
      setToast(sizeImportMessage(error));
    }
  }

  function movePanel(panelId: string, direction: -1 | 1) {
    const ordered = [...panels];
    const index = ordered.findIndex((panel) => panel.id === panelId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    patchProject({
      panels: ordered.map((panel, panelIndex) => ({
        ...panel,
        index: panelIndex + 1,
      })),
    });
    setReferenceRanges({});
  }

  function movePanelTo(panelId: string, targetId: string) {
    if (!panelId || panelId === targetId) return;
    const ordered = [...panels];
    const from = ordered.findIndex((panel) => panel.id === panelId);
    if (from < 0 || !ordered.some((panel) => panel.id === targetId)) return;
    const [moved] = ordered.splice(from, 1);
    const targetIndex = ordered.findIndex((panel) => panel.id === targetId);
    ordered.splice(targetIndex, 0, moved);
    patchProject({
      panels: ordered.map((panel, index) => ({ ...panel, index: index + 1 })),
    });
    setReferenceRanges({});
  }

  function deletePanel(panelId: string) {
    setProject((current) => ({
      ...current,
      preciseReferences: current.preciseReferences.map((reference) => ({
        ...reference,
        scopePanelIds: reference.scopePanelIds.filter((id) => id !== panelId),
      })),
      panels: current.panels
        .filter((panel) => panel.id !== panelId)
        .map((panel, index) => ({ ...panel, index: index + 1 })),
    }));
  }

  async function quoteTasks(tasks: PreparedQueueTask[]) {
    const cache = new Map<string, number>();
    let amount = 0;
    for (const task of tasks) {
      const { params, preciseReferences } = task.request;
      const key = JSON.stringify({
        model: params.model,
        width: params.width,
        height: params.height,
        steps: params.steps,
        smea: params.smea,
        smeaDyn: params.smeaDyn,
        precise: preciseReferences.length > 0,
      });
      let value = cache.get(key);
      if (value == null) {
        const result = await window.naiDesktop.quoteAnlas({
          feature: "generate",
          params: {
            ...params,
            stylePrompt: "",
            positivePrompt: "quote",
            negativePrompt: "",
          },
          batchCount: 1,
          extras: {
            vibeImages: [],
            charCaptions: [],
            preciseReferences: preciseReferences.length
              ? [
                  {
                    base64: "",
                    type: "character",
                    strength: 1,
                    fidelity: 1,
                    informationExtracted: 1,
                  },
                ]
              : [],
          },
          account,
        });
        if (!result.ok || typeof result.amount !== "number") return null;
        value = result.amount;
        cache.set(key, value);
      }
      amount += value;
    }
    return amount;
  }

  async function generateCandidate(
    task: PreparedQueueTask,
    historyGroupId?: string,
  ): Promise<string | undefined> {
    const request = { ...task.request, historyGroupId };
    patchPanel(request.panelId, (current) => ({
      ...current,
      status: "generating",
      error: undefined,
    }));
    const before = useAppStore.getState().account.anlasBalance;
    const result = await window.naiDesktop.tagComicGenerateCandidate(request);
    const item = result.items[0];
    if (!mountedRef.current) return item?.groupId;
    if (queueRef.current.cancelled && (!result.ok || !item)) {
      patchPanel(request.panelId, (current) => ({
        ...current,
        status: current.candidates.length ? "done" : "ready",
        error: undefined,
      }));
      return item?.groupId;
    }
    const nextAccount = item
      ? await refreshAccount()
      : useAppStore.getState().account;
    const after = nextAccount.anlasBalance;
    const spent =
      typeof before === "number" && typeof after === "number"
        ? Math.max(0, before - after)
        : undefined;
    setProject((current) => ({
      ...current,
      historyGroupId: item?.groupId ?? current.historyGroupId,
      panels: current.panels.map((currentPanel) => {
        if (currentPanel.id !== request.panelId) return currentPanel;
        if (!result.ok || !item) {
          return { ...currentPanel, status: "failed", error: result.message };
        }
        const candidate: TagComicCandidate = {
          id: crypto.randomUUID(),
          historyItemId: item.id,
          outputPath: item.filePath,
          outputUrl: item.fileUrl,
          createdAt: new Date().toISOString(),
          actualAnlas: spent,
        };
        return {
          ...currentPanel,
          status: "done",
          candidates: [...currentPanel.candidates, candidate],
          selectedCandidateId: currentPanel.selectedCandidateId ?? candidate.id,
          error: undefined,
        };
      }),
    }));
    if (item) {
      await refreshHistory(item.date);
      setToast(format(language, "generated", { index: request.panelIndex }));
    }
    return item?.groupId;
  }

  async function startQueue(tasks: QueueTask[]) {
    if (queueRef.current.running || !tasks.length) return;
    const projectSnapshot = projectRef.current;
    const snapshotPanels = [...projectSnapshot.panels].sort(
      (left, right) => left.index - right.index,
    );
    if (
      projectSnapshot.sizeMode === "perPanel" &&
      snapshotPanels.some((panel) => !panel.imageSize)
    ) {
      setToast(text(language, "sizesIncomplete"));
      return;
    }
    const prepared = tasks.flatMap((task) => {
      const panel = snapshotPanels.find((item) => item.id === task.panelId);
      return panel
        ? [{ ...task, request: buildTagComicGenerateRequest(projectSnapshot, panel) }]
        : [];
    });
    if (!prepared.length) return;
    const invalidPreciseModel = prepared.some(
      (task) =>
        task.request.preciseReferences.length > 0 &&
        !task.request.params.model.includes("4-5"),
    );
    if (invalidPreciseModel) {
      setToast(text(language, "preciseV45Only"));
      return;
    }
    const missing = prepared.find((task) => !task.request.panelPrompt.trim());
    if (missing) {
      setToast(
        format(language, "emptyPrompt", { index: missing.request.panelIndex }),
      );
      return;
    }
    const auth = await window.naiDesktop.hasToken();
    if (!auth.hasToken) {
      setToast(text(language, "needToken"));
      return;
    }
    const quote = await quoteTasks(prepared);
    const confirmed = window.confirm(
      quote == null
        ? text(language, "quoteFailed")
        : format(language, "confirmGenerate", {
            count: prepared.length,
            quote,
          }),
    );
    if (!confirmed) return;
    queueRef.current = { running: true, cancelled: false };
    setQueue({ total: prepared.length, done: 0 });
    let historyGroupId = projectSnapshot.historyGroupId;
    for (let index = 0; index < prepared.length; index += 1) {
      if (queueRef.current.cancelled) break;
      const generatedGroupId = await generateCandidate(
        prepared[index],
        historyGroupId,
      );
      historyGroupId = generatedGroupId ?? historyGroupId;
      if (!mountedRef.current) return;
      if (queueRef.current.cancelled) break;
      setQueue({ total: prepared.length, done: index + 1 });
    }
    queueRef.current.running = false;
    if (mountedRef.current) setQueue(null);
  }

  function initialTasks() {
    return panels.flatMap((panel) => {
      const missing = Math.max(
        0,
        project.initialGenerationCount - panel.candidates.length,
      );
      return Array.from({ length: missing }, (_, ordinal) => ({
        panelId: panel.id,
        ordinal,
      }));
    });
  }

  function stopQueue() {
    queueRef.current.cancelled = true;
    void window.naiDesktop.cancel();
    setToast(text(language, "queueStopped"));
  }

  async function exportZip() {
    const result = await window.naiDesktop.tagComicExportSelectedZip({
      project,
    });
    setToast(result.message);
    if (result.ok && result.path) {
      setToast(format(language, "exportDone", { path: result.path }));
    }
  }

  const stepItems: Array<[Step, CopyKey, CopyKey]> = [
    ["import", "stepImport", "stepImportHint"],
    ["global", "stepGlobal", "stepGlobalHint"],
    ["panels", "stepPanels", "stepPanelsHint"],
    ["generate", "stepGenerate", "stepGenerateHint"],
  ];

  return (
    <main className="tag-comic" aria-label={text(language, "title")}>
      <header className="tag-comic-header">
        <div>
          <small>TAG COMIC WORKSPACE</small>
          <h2>{text(language, "title")}</h2>
          <p>{text(language, "subtitle")}</p>
        </div>
        <div className="tag-comic-header-actions">
          {onBack && (
            <Button variant="ghost" onClick={onBack}>
              {text(language, "back")}
            </Button>
          )}
          <Button variant="secondary" onClick={newProject}>
            {text(language, "newProject")}
          </Button>
          <Button variant="secondary" onClick={exportProjectJson}>
            {text(language, "exportJson")}
          </Button>
        </div>
      </header>

      <nav className="tag-comic-steps" aria-label={text(language, "title")}>
        {stepItems.map(([key, label, hint], index) => (
          <button
            key={key}
            type="button"
            className={clsx(step === key && "active")}
            onClick={() => setStep(key)}
          >
            <b>{index + 1}</b>
            <span>{text(language, label)}</span>
            <small>{text(language, hint)}</small>
          </button>
        ))}
      </nav>

      {step === "import" && (
        <section className="tag-comic-card tag-comic-import">
          <div className="tag-comic-section-heading">
            <div>
              <h3>{text(language, "importHeading")}</h3>
              <p>{text(language, "importDescription")}</p>
            </div>
            <span>{text(language, "replaceWarning")}</span>
          </div>
          <textarea
            value={bulkText}
            onChange={(event) => setBulkText(event.target.value)}
            placeholder={text(language, "importPlaceholder")}
            rows={12}
          />
          <div className="tag-comic-actions">
            <Button
              variant="primary"
              onClick={importText}
              disabled={!bulkText.trim()}
            >
              {text(language, "importText")}
            </Button>
            <label className="tag-comic-file-button">
              <Icon name="folderOpen" />
              <span>{text(language, "chooseFile")}</span>
              <input
                type="file"
                accept=".txt,.json,.csv,text/plain,application/json,text/csv"
                onChange={(event) => {
                  void importFile(event.target.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        </section>
      )}

      {step === "global" && (
        <section className="tag-comic-card">
          <div className="tag-comic-section-heading">
            <div>
              <h3>{text(language, "stepGlobal")}</h3>
              <p>{text(language, "initialCountHint")}</p>
            </div>
            <Button variant="secondary" onClick={syncParams}>
              {text(language, "syncParams")}
            </Button>
          </div>
          <div className="tag-comic-global-grid">
            <label>
              <span>{text(language, "projectTitle")}</span>
              <input
                value={project.title}
                onChange={(event) =>
                  patchProject({ title: event.target.value })
                }
              />
            </label>
            <label>
              <span>{text(language, "initialCount")}</span>
              <input
                type="number"
                min={1}
                max={10}
                value={project.initialGenerationCount}
                onChange={(event) =>
                  patchProject({
                    initialGenerationCount: Math.max(
                      1,
                      Math.min(10, Math.round(Number(event.target.value) || 1)),
                    ),
                  })
                }
              />
            </label>
            <label className="wide">
              <span>{text(language, "globalStyle")}</span>
              <textarea
                value={project.globalStylePrompt}
                onChange={(event) =>
                  patchProject({ globalStylePrompt: event.target.value })
                }
              />
            </label>
          </div>
          <div className="tag-comic-size-settings">
            <div className="tag-comic-size-mode" role="group" aria-label={text(language, "sizeMode")}>
              <b>{text(language, "sizeMode")}</b>
              <button
                type="button"
                className={clsx(project.sizeMode === "uniform" && "active")}
                onClick={() => setSizeMode("uniform")}
              >
                {text(language, "sizeUniform")}
              </button>
              <button
                type="button"
                className={clsx(project.sizeMode === "perPanel" && "active")}
                onClick={() => setSizeMode("perPanel")}
              >
                {text(language, "sizePerPanel")}
              </button>
            </div>
            <p>{text(language, "sizeModeHint")}</p>
            {project.sizeMode === "perPanel" && (
              <>
                <label>
                  <span>{text(language, "sizesInput")}</span>
                  <textarea
                    value={sizeText}
                    onChange={(event) => setSizeText(event.target.value)}
                    placeholder={text(language, "sizesPlaceholder")}
                    rows={Math.min(10, Math.max(4, panels.length))}
                  />
                </label>
                <div className="tag-comic-size-presets">
                  {TAG_COMIC_SIZE_PRESETS.map((size) => (
                    <code key={`${size.width}x${size.height}`}>
                      {size.width}×{size.height}
                    </code>
                  ))}
                </div>
                <div className="tag-comic-actions">
                  <Button variant="secondary" onClick={createSizeTemplate}>
                    {text(language, "sizeTemplate")}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={importPanelSizes}
                    disabled={!sizeText.trim() || !panels.length}
                  >
                    {text(language, "importSizes")}
                  </Button>
                </div>
              </>
            )}
          </div>
          <div className="tag-comic-reference-settings">
            <div className="tag-comic-section-heading compact">
              <div>
                <h3>{text(language, "preciseHeading")}</h3>
                <p>{text(language, "preciseHint")}</p>
              </div>
              <label className="tag-comic-file-button">
                <Icon name="folderOpen" />
                <span>{text(language, "preciseUpload")}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  disabled={project.preciseReferences.length >= 5}
                  onChange={(event) => {
                    void importPreciseReferences(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            {!project.preciseReferences.length ? (
              <p>{text(language, "preciseEmpty")}</p>
            ) : (
              <div className="tag-comic-reference-grid">
                {project.preciseReferences.map((reference) => {
                  const coverage = panels.filter((panel) => {
                    const manual = panel.preciseReferences.find(
                      (item) => item.referenceId === reference.id,
                    );
                    return manual?.enabled ??
                      tagComicReferenceApplies(reference, panel.id);
                  }).length;
                  return (
                  <article key={reference.id}>
                    <img src={reference.fileUrl} alt={reference.name} />
                    <div>
                      <b title={reference.name}>{reference.name}</b>
                      <select
                        value={reference.type}
                        onChange={(event) =>
                          patchPreciseReference(reference.id, {
                            type: event.target.value as TagComicReferenceAsset["type"],
                          })
                        }
                      >
                        <option value="character">{text(language, "preciseCharacter")}</option>
                        <option value="style">{text(language, "preciseStyle")}</option>
                        <option value="character&style">{text(language, "preciseBoth")}</option>
                      </select>
                      <label>
                        <span>{text(language, "preciseStrength")} · {reference.strength.toFixed(2)}</span>
                        <input type="range" min={0} max={1} step={0.01} value={reference.strength}
                          onChange={(event) => patchPreciseReference(reference.id, { strength: Number(event.target.value) })} />
                      </label>
                      <label>
                        <span>{text(language, "preciseFidelity")} · {reference.fidelity.toFixed(2)}</span>
                        <input type="range" min={0} max={1} step={0.01} value={reference.fidelity}
                          onChange={(event) => patchPreciseReference(reference.id, { fidelity: Number(event.target.value), informationExtracted: Number(event.target.value) })} />
                      </label>
                      <div className="tag-comic-reference-scope">
                        <span>{text(language, "preciseScope")}</span>
                        <div role="group">
                          {(["all", "include", "exclude"] as const).map((scope) => (
                            <button
                              key={scope}
                              type="button"
                              className={clsx(reference.scope === scope && "active")}
                              onClick={() => setReferenceScope(reference, scope)}
                            >
                              {text(
                                language,
                                scope === "all"
                                  ? "preciseScopeAll"
                                  : scope === "include"
                                    ? "preciseScopeInclude"
                                    : "preciseScopeExclude",
                              )}
                            </button>
                          ))}
                        </div>
                        {reference.scope !== "all" && (
                          <div className="tag-comic-reference-range">
                            <input
                              type="text"
                              inputMode="text"
                              autoComplete="off"
                              spellCheck={false}
                              aria-label={text(language, "preciseRange")}
                              value={
                                referenceRanges[reference.id] ??
                                formatTagComicPanelRange(reference.scopePanelIds, panels)
                              }
                              placeholder={text(language, "preciseRangePlaceholder")}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setReferenceRanges((current) => ({
                                  ...current,
                                  [reference.id]: value,
                                }));
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  applyReferenceRange(
                                    reference,
                                    event.currentTarget.value,
                                  );
                                }
                              }}
                            />
                            <Button variant="secondary" onClick={() => applyReferenceRange(reference)}>
                              {text(language, "preciseApplyRange")}
                            </Button>
                          </div>
                        )}
                        <small>
                          {format(language, "preciseCoverage", {
                            count: coverage,
                            total: panels.length,
                          })}
                        </small>
                      </div>
                      <Button variant="ghost" onClick={() => void removePreciseReference(reference.id)}>
                        {text(language, "preciseRemove")}
                      </Button>
                    </div>
                  </article>
                  );
                })}
              </div>
            )}
          </div>
          <GlobalParams
            language={language}
            params={project.globalParams}
            patch={patchGlobalParam}
            negativePrompt={project.globalNegativePrompt}
            onNegativeChange={(value) =>
              patchProject({ globalNegativePrompt: value })
            }
            expanded={showAdvanced}
            toggle={() => setShowAdvanced((value) => !value)}
          />
        </section>
      )}

      {step === "panels" && (
        <section className="tag-comic-card tag-comic-panels">
          <div className="tag-comic-section-heading">
            <div>
              <h3>{text(language, "panelsHeading")}</h3>
              <p>
                {format(language, "selectedCount", {
                  selected: selectedCount,
                  total: panels.length,
                })}
              </p>
            </div>
            <Button variant="primary" onClick={addPanel}>
              {text(language, "addPanel")}
            </Button>
          </div>
          {!activePanel ? (
            <div className="tag-comic-empty">
              {text(language, "panelsEmpty")}
            </div>
          ) : (
            <div className="tag-comic-panel-workspace">
              <aside>
                {panels.map((panel) => (
                  <button
                    key={panel.id}
                    type="button"
                    draggable
                    title={text(language, "dragPanel")}
                    className={clsx(
                      panel.id === activePanel.id && "active",
                      panel.id === draggedPanelId && "dragging",
                    )}
                    onClick={() => setActivePanelId(panel.id)}
                    onDragStart={() => setDraggedPanelId(panel.id)}
                    onDragEnd={() => setDraggedPanelId("")}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      movePanelTo(draggedPanelId, panel.id);
                      setDraggedPanelId("");
                    }}
                  >
                    <b>#{panel.index}</b>
                    <span>{panel.title}</span>
                    <small>{statusLabel(language, panel)}</small>
                  </button>
                ))}
              </aside>
              <article className="tag-comic-panel-editor">
                <header>
                  <span
                    className={clsx("tag-comic-status", activePanel.status)}
                  >
                    {statusLabel(language, activePanel)}
                  </span>
                  <div className="tag-comic-actions">
                    <Button
                      variant="ghost"
                      onClick={() => movePanel(activePanel.id, -1)}
                      disabled={activePanel.index === 1}
                    >
                      {text(language, "moveUp")}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => movePanel(activePanel.id, 1)}
                      disabled={activePanel.index === panels.length}
                    >
                      {text(language, "moveDown")}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => deletePanel(activePanel.id)}
                    >
                      {text(language, "delete")}
                    </Button>
                  </div>
                </header>
                <label>
                  <span>{text(language, "panelTitle")}</span>
                  <input
                    value={activePanel.title}
                    onChange={(event) =>
                      patchPanel(activePanel.id, (panel) => ({
                        ...panel,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{text(language, "panelPrompt")}</span>
                  <textarea
                    value={activePanel.prompt}
                    onChange={(event) =>
                      patchPanel(activePanel.id, (panel) => ({
                        ...panel,
                        prompt: event.target.value,
                        status: panel.candidates.length
                          ? panel.status
                          : "ready",
                      }))
                    }
                    rows={10}
                  />
                </label>
                {project.sizeMode === "perPanel" && (
                  <label>
                    <span>{text(language, "panelSize")}</span>
                    <select
                      value={
                        activePanel.imageSize
                          ? `${activePanel.imageSize.width}x${activePanel.imageSize.height}`
                          : ""
                      }
                      onChange={(event) => {
                        const size = TAG_COMIC_SIZE_PRESETS.find(
                          (item) => `${item.width}x${item.height}` === event.target.value,
                        );
                        if (!size) return;
                        patchPanel(activePanel.id, (panel) => ({
                          ...panel,
                          imageSize: { ...size },
                        }));
                      }}
                    >
                      {TAG_COMIC_SIZE_PRESETS.map((size) => (
                        <option
                          key={`${size.width}x${size.height}`}
                          value={`${size.width}x${size.height}`}
                        >
                          {size.width}×{size.height}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {project.preciseReferences.length > 0 && (
                  <section className="tag-comic-panel-references">
                    <h4>{text(language, "precisePanelHeading")}</h4>
                    <p>{text(language, "precisePanelHint")}</p>
                    {project.preciseReferences.map((asset) => {
                      const manualOverride = activePanel.preciseReferences.find(
                        (item) => item.referenceId === asset.id,
                      );
                      const inherited = tagComicReferenceApplies(asset, activePanel.id);
                      const enabled = manualOverride?.enabled ?? inherited;
                      const selection = enabled
                        ? manualOverride ?? {
                            referenceId: asset.id,
                            enabled: true,
                            type: asset.type,
                            strength: asset.strength,
                            fidelity: asset.fidelity,
                            informationExtracted: asset.informationExtracted,
                          }
                        : null;
                      return (
                        <article key={asset.id} className={clsx(enabled && "selected")}>
                          <label className="tag-comic-reference-check">
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={(event) =>
                                togglePanelReference(
                                  activePanel.id,
                                  asset,
                                  event.target.checked,
                                )
                              }
                            />
                            <img src={asset.fileUrl} alt={asset.name} />
                            <b>
                              {asset.name}
                              {manualOverride && (
                                <small>{text(language, "preciseManual")}</small>
                              )}
                            </b>
                          </label>
                          {selection && (
                            <div className="tag-comic-reference-tuning">
                              <select
                                value={selection.type}
                                onChange={(event) =>
                                  patchPanelReference(activePanel.id, asset.id, {
                                    type: event.target.value as TagComicPanelReference["type"],
                                  })
                                }
                              >
                                <option value="character">{text(language, "preciseCharacter")}</option>
                                <option value="style">{text(language, "preciseStyle")}</option>
                                <option value="character&style">{text(language, "preciseBoth")}</option>
                              </select>
                              <label>
                                <span>{text(language, "preciseStrength")} · {selection.strength.toFixed(2)}</span>
                                <input type="range" min={0} max={1} step={0.01} value={selection.strength}
                                  onChange={(event) => patchPanelReference(activePanel.id, asset.id, { strength: Number(event.target.value) })} />
                              </label>
                              <label>
                                <span>{text(language, "preciseFidelity")} · {selection.fidelity.toFixed(2)}</span>
                                <input type="range" min={0} max={1} step={0.01} value={selection.fidelity}
                                  onChange={(event) => patchPanelReference(activePanel.id, asset.id, { fidelity: Number(event.target.value), informationExtracted: Number(event.target.value) })} />
                              </label>
                              <Button variant="ghost" onClick={() =>
                                clearPanelReferenceOverride(activePanel.id, asset.id)
                              }>
                                {text(language, "preciseReset")}
                              </Button>
                            </div>
                          )}
                          {manualOverride && !selection && (
                            <Button
                              variant="ghost"
                              onClick={() =>
                                clearPanelReferenceOverride(activePanel.id, asset.id)
                              }
                            >
                              {text(language, "preciseReset")}
                            </Button>
                          )}
                        </article>
                      );
                    })}
                  </section>
                )}
                <Toggle
                  checked={activePanel.paramsOverride.enabled}
                  onChange={(enabled) =>
                    patchPanel(activePanel.id, (panel) => ({
                      ...panel,
                      paramsOverride: { ...panel.paramsOverride, enabled },
                    }))
                  }
                  label={text(language, "override")}
                  description={text(language, "overrideHint")}
                />
                {activePanel.paramsOverride.enabled && (
                  <PanelParams
                    language={language}
                    params={mergeTagComicParams(project, activePanel)}
                    patch={(key, value) =>
                      patchPanelParam(activePanel.id, key, value)
                    }
                  />
                )}
              </article>
            </div>
          )}
        </section>
      )}

      {step === "generate" && (
        <section className="tag-comic-card tag-comic-generate">
          <div className="tag-comic-section-heading">
            <div>
              <h3>{text(language, "generateHeading")}</h3>
              <p>{text(language, "exportHint")}</p>
            </div>
            <div className="tag-comic-balance">
              {format(language, "balance", {
                amount: account.anlasBalance ?? "—",
              })}
            </div>
          </div>
          <div className="tag-comic-generate-toolbar">
            <Button
              variant="primary"
              disabled={Boolean(queue) || !initialTasks().length}
              onClick={() => void startQueue(initialTasks())}
            >
              {text(language, "generateInitial")}
            </Button>
            <Button
              variant="secondary"
              disabled={Boolean(queue) || !panels.length}
              onClick={() =>
                void startQueue(
                  panels.map((panel) => ({ panelId: panel.id, ordinal: 0 })),
                )
              }
            >
              {text(language, "addAll")}
            </Button>
            <Button
              variant="secondary"
              disabled={Boolean(queue) || selectedCount === 0}
              onClick={() => void exportZip()}
            >
              <Icon name="download" /> {text(language, "exportZip")}
            </Button>
            {queue && (
              <Button variant="danger" onClick={stopQueue}>
                {text(language, "stop")}
              </Button>
            )}
          </div>
          {queue && (
            <div className="tag-comic-progress-block">
              <div className="tag-comic-progress">
                <span
                  style={{
                    width: `${queue.total ? (queue.done / queue.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <b>{format(language, "progress", queue)}</b>
            </div>
          )}
          <div className="tag-comic-gallery">
            {panels.map((panel) => {
              const main = selectedCandidate(panel);
              const expanded = expandedCandidates.has(panel.id);
              return (
                <article key={panel.id} className="tag-comic-result-card">
                  <header>
                    <div>
                      <b>#{panel.index}</b>
                      <strong>{panel.title}</strong>
                    </div>
                    <span className={clsx("tag-comic-status", panel.status)}>
                      {statusLabel(language, panel)}
                    </span>
                  </header>
                  {main ? (
                    <button
                      type="button"
                      className="tag-comic-main-image"
                      onDoubleClick={() => setPreview(main.outputUrl)}
                      title={text(language, "previewHint")}
                    >
                      <img
                        src={main.outputUrl}
                        alt={panel.title}
                        loading="lazy"
                      />
                      <span>{text(language, "currentMain")}</span>
                    </button>
                  ) : (
                    <div className="tag-comic-no-image">
                      {text(language, "noCandidate")}
                    </div>
                  )}
                  {panel.error && (
                    <p className="tag-comic-error" role="alert">
                      {panel.error}
                    </p>
                  )}
                  <div className="tag-comic-result-actions">
                    <Button
                      variant="secondary"
                      disabled={Boolean(queue)}
                      onClick={() =>
                        void startQueue([{ panelId: panel.id, ordinal: 0 }])
                      }
                    >
                      {panel.status === "failed"
                        ? text(language, "retry")
                        : text(language, "addOne")}
                    </Button>
                    {panel.candidates.length > 1 && (
                      <Button
                        variant="ghost"
                        aria-expanded={expanded}
                        onClick={() =>
                          setExpandedCandidates((current) => {
                            const next = new Set(current);
                            if (next.has(panel.id)) next.delete(panel.id);
                            else next.add(panel.id);
                            return next;
                          })
                        }
                      >
                        {expanded
                          ? text(language, "hideCandidates")
                          : text(language, "showCandidates")}
                      </Button>
                    )}
                  </div>
                  {expanded && (
                    <div className="tag-comic-candidates">
                      <h4>
                        {format(language, "candidates", {
                          count: panel.candidates.length,
                        })}
                      </h4>
                      <div>
                        {panel.candidates.map((candidate, index) => (
                          <button
                            key={candidate.id}
                            type="button"
                            className={clsx(
                              candidate.id === panel.selectedCandidateId &&
                                "selected",
                            )}
                            onClick={() =>
                              patchPanel(panel.id, (current) => ({
                                ...current,
                                selectedCandidateId: candidate.id,
                              }))
                            }
                            onDoubleClick={() =>
                              setPreview(candidate.outputUrl)
                            }
                            title={text(language, "chooseMain")}
                          >
                            <img
                              src={candidate.outputUrl}
                              alt={`${panel.title} ${index + 1}`}
                              loading="lazy"
                            />
                            <span>{index + 1}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {preview && (
        <div
          className="redraw-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={text(language, "closePreview")}
          onClick={() => setPreview(null)}
        >
          <img
            src={preview}
            alt=""
            onClick={(event) => event.stopPropagation()}
          />
          <button
            type="button"
            className="redraw-lightbox-close"
            aria-label={text(language, "closePreview")}
            onClick={() => setPreview(null)}
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}

function GlobalParams({
  language,
  params,
  patch,
  negativePrompt,
  onNegativeChange,
  expanded,
  toggle,
}: {
  language: unknown;
  params: GenerateParams;
  patch: <K extends keyof GenerateParams>(
    key: K,
    value: GenerateParams[K],
  ) => void;
  negativePrompt: string;
  onNegativeChange: (value: string) => void;
  expanded: boolean;
  toggle: () => void;
}) {
  return (
    <div className="tag-comic-params">
      <div className="tag-comic-param-grid">
        <label className="wide">
          <span>{text(language, "globalNegative")}</span>
          <textarea
            value={negativePrompt}
            onChange={(event) => onNegativeChange(event.target.value)}
          />
        </label>
        <label>
          <span>{text(language, "model")}</span>
          <select
            value={params.model}
            onChange={(event) =>
              patch("model", event.target.value as GenerateParams["model"])
            }
          >
            {NAI_MODELS.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
        <NumberInput
          label={text(language, "width")}
          value={params.width}
          min={64}
          max={2048}
          step={64}
          onChange={(value) => patch("width", value)}
        />
        <NumberInput
          label={text(language, "height")}
          value={params.height}
          min={64}
          max={2048}
          step={64}
          onChange={(value) => patch("height", value)}
        />
        <NumberInput
          label={text(language, "steps")}
          value={params.steps}
          min={1}
          max={50}
          onChange={(value) => patch("steps", value)}
        />
      </div>
      <button
        type="button"
        className="tag-comic-disclosure"
        onClick={toggle}
        aria-expanded={expanded}
      >
        {expanded ? text(language, "collapse") : text(language, "advanced")}
      </button>
      {expanded && (
        <PanelParams
          language={language}
          params={params}
          patch={patch}
          compact
        />
      )}
    </div>
  );
}

function PanelParams({
  language,
  params,
  patch,
  compact = false,
}: {
  language: unknown;
  params: GenerateParams;
  patch: <K extends keyof GenerateParams>(
    key: K,
    value: GenerateParams[K],
  ) => void;
  compact?: boolean;
}) {
  return (
    <div className={clsx("tag-comic-param-grid", compact && "compact")}>
      {!compact && (
        <label>
          <span>{text(language, "model")}</span>
          <select
            value={params.model}
            onChange={(event) =>
              patch("model", event.target.value as GenerateParams["model"])
            }
          >
            {NAI_MODELS.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        <span>{text(language, "sampler")}</span>
        <select
          value={params.sampler}
          onChange={(event) =>
            patch("sampler", event.target.value as GenerateParams["sampler"])
          }
        >
          {NAI_SAMPLERS.map((sampler) => (
            <option key={sampler.value} value={sampler.value}>
              {sampler.label}
            </option>
          ))}
        </select>
      </label>
      {!compact && (
        <NumberInput
          label={text(language, "width")}
          value={params.width}
          min={64}
          max={2048}
          step={64}
          onChange={(value) => patch("width", value)}
        />
      )}
      {!compact && (
        <NumberInput
          label={text(language, "height")}
          value={params.height}
          min={64}
          max={2048}
          step={64}
          onChange={(value) => patch("height", value)}
        />
      )}
      <NumberInput
        label={text(language, "steps")}
        value={params.steps}
        min={1}
        max={50}
        onChange={(value) => patch("steps", value)}
      />
      <NumberInput
        label={text(language, "cfg")}
        value={params.cfgScale}
        min={0}
        max={20}
        step={0.1}
        onChange={(value) => patch("cfgScale", value)}
      />
      <NumberInput
        label={text(language, "seed")}
        value={params.seedMode === "random" ? 0 : params.seed}
        min={0}
        max={2147483647}
        onChange={(value) => {
          patch("seed", value);
          patch("seedMode", value > 0 ? "fixed" : "random");
        }}
      />
    </div>
  );
}
