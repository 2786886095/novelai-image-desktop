import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Button, NumberInput, Toggle } from "./components/ui";
import { createDefaultComicProject } from "./comic-template";
import {
  COMIC_ANALYZE_SYSTEM_PROMPT,
  CONVERT_SYSTEM_PROMPTS,
  SCOPED_REVERSE_SYSTEM_PROMPTS,
} from "./data/prompt-templates";
import {
  parseWeightedTag,
  setTagLevelInPrompt,
  splitPromptTags,
  formatMultiplier,
} from "./prompt-weight";
import {
  desktopUiFormat,
  desktopUiText,
  getToolsHubText,
  localizedDesktopOptionLabel,
} from "./i18n";
import { useAppStore } from "./store";
import { NovelTuiwenStudio } from "./tuiwen/NovelTuiwenStudio";
import {
  createDefaultBatchRedraw,
  NAI_MODELS,
  NAI_SAMPLERS,
  NAI_UC_PRESETS,
  type BatchExportFile,
  type BatchRedrawItem,
  type BatchRedrawProject,
  type ComicPanel,
  type ComicProject,
  type ComicReferenceAsset,
  type ComicReferenceKind,
  type GenerateFailureKind,
  type GenerateParams,
  type NAIModel,
  type NAISampler,
  type PreciseReferenceItem,
  type ReversePromptMode,
  type ReversePromptScope,
  type UcPreset,
  type VibeTransferItem,
} from "./types";

const STORAGE_KEY = "langbai.novelai.comic-project.v1";

const STEPS = [
  {
    key: "story",
    labelKey: "comic.step.story",
    hintKey: "comic.step.storyHint",
  },
  {
    key: "global",
    labelKey: "comic.step.global",
    hintKey: "comic.step.globalHint",
  },
  {
    key: "panels",
    labelKey: "comic.step.panels",
    hintKey: "comic.step.panelsHint",
  },
  {
    key: "generate",
    labelKey: "comic.step.generate",
    hintKey: "comic.step.generateHint",
  },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

const REDRAW_STEPS = [
  { key: "import", labelKey: "batch.step.import", hintKey: "batch.step.importHint" },
  { key: "params", labelKey: "batch.step.params", hintKey: "batch.step.paramsHint" },
  { key: "prompts", labelKey: "batch.step.prompts", hintKey: "batch.step.promptsHint" },
  { key: "generate", labelKey: "batch.step.generate", hintKey: "batch.step.generateHint" },
] as const;

const COMIC_UI_TEXT: Record<string, Record<string, string>> = {
  "zh-CN": {
    "comic.step.story": "故事",
    "comic.step.storyHint": "导入剧情，AI 拆分镜",
    "comic.step.global": "全局设定",
    "comic.step.globalHint": "角色 / 风格 / 参数",
    "comic.step.panels": "分镜",
    "comic.step.panelsHint": "转换提示词 / 微调",
    "comic.step.generate": "生成",
    "comic.step.generateHint": "队列出图 / 实扣积分",
    "comic.kind.vibe": "氛围迁移",
    "comic.kind.precise": "精准参考",
    "comic.kind.character": "角色参考",
    "comic.kind.scene": "场景参考",
    "comic.kind.object": "物品参考",
    "comic.scope.character": "角色",
    "comic.scope.object": "物品",
    "comic.scope.scene": "场景",
    "comic.scope.full": "整张图片",
    "comic.status.draft": "草稿",
    "comic.status.converted": "已转换",
    "comic.status.generating": "生成中",
    "comic.status.done": "已出图",
    "comic.status.failed": "失败",
    "comic.mode.natural": "自然语言",
    "comic.mode.tags": "Danbooru 标签",
    "comic.mode.mixed": "混合",
    "comic.template.customAnalyze": "使用设置中的 AI 拆分分镜模板",
    "comic.template.builtinAnalyze": "使用内置 AI 拆分分镜模板",
    "comic.template.custom": "使用自定义模板",
    "comic.template.builtin": "使用内置模板",
    "comic.defaultTitle": "未命名漫画项目",
    "comic.metricSummary":
      "{panels} 分镜 · {converted} 已转换 · {done} 已出图 · {mode}",
    "comic.quoteSelected": "已选 {count} 张",
    "comic.quoteUngenerated": "未生成 {count} 张",
    "comic.backToTools": "返回工具首页",
    "comic.delete": "删除",
    "comic.newProject": "新建项目",
    "comic.clearPanels": "清空分镜",
    "comic.saveJson": "另存项目 JSON",
    "comic.importJson": "导入项目 JSON",
    "comic.storyHeading": "第 1 步 · 导入故事",
    "comic.storySub": "粘贴剧情，让 AI 拆出分镜与全局设定",
    "comic.titleLabel": "标题",
    "comic.reverseStatus": "参考图反推",
    "comic.splitStatus": "AI 拆分镜 / 分镜转换",
    "comic.finalStatus": "最终生图",
    "comic.notSetModel": "未设置模型",
    "comic.notSetApi": "未设置 API",
    "comic.templateMode": "模板模式",
    "comic.targetPanels": "目标分镜数量（0=自动）",
    "comic.templateSummary": "查看当前模板 · {mode}",
    "comic.reverseTemplate": "反推模板",
    "comic.convertTemplate": "转换模板",
    "comic.analyzeTemplate": "AI 拆分分镜模板",
    "comic.storyTextLabel": "剧情 / 全局故事（可含分段说明，例如 1-7、8-15）",
    "comic.storyRefsTitle": "故事参考图",
    "comic.storyRefsDesc":
      "在拆分镜前上传，AI 会结合用户说明生成全局设定；这些图后续默认作为精准参考沿用到每张分镜。",
    "comic.uploadRefs": "上传角色 / 物品 / 场景参考图",
    "comic.foldRefs": "把已反推内容写入全局设定",
    "comic.refsEmpty":
      "可选：上传角色、物品或场景图片，并说明它在故事中对应什么。",
    "comic.kindLabel": "用途",
    "comic.subjectLabel": "对应说明",
    "comic.subjectPlaceholder": "例如：这是主角变身后的角色 / 桌上的皮套盒",
    "comic.useRef": "参与最终生图参考（关闭后仍保留说明和反推结果）",
    "comic.reverseBusy": "反推中...",
    "comic.reverseRef": "反推参考图",
    "comic.analyzeBusy": "拆分中...",
    "comic.analyzeAction": "AI 拆分分镜 →",
    "comic.afterAnalyze": "拆分后会自动跳到“全局设定”。",
    "comic.bulkTagLabel":
      "或：直接导入 Tag 提示词生成漫画（每行一个分镜，跳过 AI 拆分 / 反推）",
    "comic.bulkTagPlaceholder":
      "第 1 个分镜的英文 tag\n第 2 个分镜的英文 tag\n...",
    "comic.importAsPanels": "导入为分镜 →",
    "comic.importTxt": "导入 .txt 文件",
    "comic.bulkTagHint": "每行作为一个分镜的英文提示词，直接进入“分镜”步骤。",
    "comic.globalHeading": "第 2 步 · 全局设定",
    "comic.sharedAll": "所有分镜共享",
    "comic.syncParams": "同步当前生图参数",
    "comic.globalCharacter":
      "全局角色设定（角色/皮套/限制等，会参与每个分镜转换）",
    "comic.globalStyle": "全局风格提示词（拼接到每张正面提示词最前）",
    "comic.globalNegative": "全局负面提示词",
    "comic.model": "模型",
    "comic.advancedCollapse": "▾ 收起高级参数",
    "comic.advancedExpand": "▸ 展开高级参数（尺寸 / 步数 / 采样器 / 开关）",
    "comic.width": "宽度",
    "comic.height": "高度",
    "comic.steps": "步数",
    "comic.sampler": "采样器",
    "comic.noiseSchedule": "噪声计划",
    "comic.native": "Native（原生）",
    "comic.karras": "Karras（常用）",
    "comic.exponential": "Exponential（指数）",
    "comic.ucPreset": "UC 预设",
    "comic.qualityDesc": "使用 NovelAI 质量词增强。",
    "comic.varietyDesc": "开启多样化采样。",
    "comic.smeaDesc": "高分辨率优化（V3）。",
    "comic.smeaDynDesc": "动态 SMEA（V3）。",
    "comic.panelsHeading": "第 3 步 · 分镜",
    "comic.selectedCount": "已选 {count}",
    "comic.appliesAll": "未选择时作用于全部",
    "comic.convertHelp":
      "分镜转换沿用第 1 步模板模式：{mode}。这样全局反推、拆分镜和转换不会互相打架。",
    "comic.converting": "转换中...",
    "comic.convertSelected": "转换选中",
    "comic.convertAll": "转换全部",
    "comic.checking": "检测中...",
    "comic.consistencyCheck": "AI 一致性检测",
    "comic.addPanel": "新增分镜",
    "comic.selectAll": "全选",
    "comic.clearSelection": "清空选择",
    "comic.panelTitle": "分镜 #{index}",
    "comic.convertOne": "转换本张",
    "comic.generating": "生成中...",
    "comic.generateOne": "生成本张",
    "comic.insert": "插入",
    "comic.editorAria": "分镜编辑视图",
    "comic.contentTab": "分镜内容",
    "comic.paramsTab": "独立参数",
    "comic.weightsTab": "提示词权重",
    "comic.outputAlt": "分镜 #{index} 生成结果",
    "comic.dragTitle": "可拖出到桌面 / 其他程序",
    "comic.resultTitle": "分镜 #{index} 成图",
    "comic.resultDesc": "重新生成会替换本分镜当前成图记录。",
    "comic.noResult": "本分镜尚未生成图片",
    "comic.cnDesc": "中文分镜描述",
    "comic.translating": "翻译中...",
    "comic.translateToEn": "直译英文",
    "comic.enPrompt": "英文生图提示词",
    "comic.translateToZh": "回译中文",
    "comic.localNegative": "本分镜负面提示词",
    "comic.localNegativePlaceholder": "留空则只使用全局负面提示词",
    "comic.negativeMode": "负面词组合方式",
    "comic.negativeAppend": "追加到全局负面词",
    "comic.negativeOverride": "覆盖全局负面词",
    "comic.overrideParams": "本分镜独立生图参数",
    "comic.overrideParamsDesc":
      "开启后只覆盖当前分镜；关闭时继续使用第 2 步全局参数。",
    "comic.promptGuidance": "提示词引导",
    "comic.seed": "种子（0=随机）",
    "comic.negativePreset": "负面预设",
    "comic.qualityShortDesc": "质量词增强",
    "comic.varietyShortDesc": "增加采样多样性",
    "comic.smeaShortDesc": "V3 高分辨率优化",
    "comic.smeaDynShortDesc": "V3 动态优化",
    "comic.usingGlobalParams": "当前分镜正在使用第 2 步的全局生图参数。",
    "comic.reset": "重置",
    "comic.noAdjustTags": "当前英文提示词没有可调整的标签。",
    "comic.generateHeading": "第 4 步 · 队列出图",
    "comic.convertedMetric": "{converted}/{total} 已转换",
    "comic.balance": "当前余额",
    "comic.unknown": "未知",
    "comic.quoting": "报价中",
    "comic.unavailable": "不可用",
    "comic.quoteBefore": "{target} · 生成前将扣 Anlas",
    "comic.waiting": "等待",
    "comic.actualSpent": "本次已实扣 Anlas",
    "comic.completedPanels": "已完成分镜",
    "comic.autoZipLabel": "生成全部后自动导出 ZIP",
    "comic.autoZipDesc": "ZIP 包含已生成图片、project.json 和 prompts.md。",
    "comic.generateUngenerated": "生成全部未生成（{count}）",
    "comic.generateUnconverted": "生成未转换分镜（{count}）",
    "comic.generateSelected": "生成 / 重试选中（{count}）",
    "comic.exportZipBusy": "导出中...",
    "comic.exportZip": "导出已生成 ZIP",
    "comic.regenerateHint":
      "勾选已有成图后仍可重新生成；未转换分镜会回退使用中文描述。",
    "comic.quoteFailed": "报价失败：{message}",
    "comic.queuePaused": "已暂停",
    "comic.queueGenerating": "生成中",
    "comic.continue": "继续",
    "comic.pause": "暂停",
    "comic.cancel": "取消",
    "comic.selectPanel": "选择 #{index}",
    "comic.regenerate": "重新生成",
    "comic.retry": "重试",
    "comic.generate": "生成",
    "comic.msg.referenceTooLarge":
      "参考图过大，已只保存项目文本（参考图需重新上传）。建议精简参考图数量或尺寸。",
    "comic.msg.projectTooLarge":
      "项目过大，无法保存到本地缓存，请导出项目 JSON 备份。",
    "comic.msg.syncedParams": "已同步当前生图参数到漫画项目。",
    "comic.msg.confirmNew": "确定新建项目？当前漫画项目内容会被清空。",
    "comic.msg.newProjectLog": "已新建空白漫画项目。",
    "comic.msg.confirmClearPanels":
      "只清空分镜列表？故事、全局设定和参考图会保留。",
    "comic.msg.clearPanelsLog": "已清空分镜列表。",
    "comic.msg.importedProjectLog":
      "已导入漫画项目 JSON（已清除外部文件路径，需重新生成图片）。",
    "comic.msg.importFailed": "导入失败：{message}",
    "comic.msg.noRefToFold": "没有可写入全局设定的角色/场景/物品反推结果。",
    "comic.msg.foldedRefs": "已把 {count} 条参考反推写入全局设定。",
    "comic.msg.splitDone": "已拆分 {count} 个分镜。",
    "comic.msg.needTags": "请粘贴 / 输入 Tag 提示词，每行一个分镜。",
    "comic.msg.confirmReplaceTags":
      "将用这 {lines} 行 Tag 替换现有 {panels} 个分镜，确定？",
    "comic.msg.importedTags":
      "已按 Tag 直接创建 {count} 个分镜，可前往“生成”。",
    "comic.msg.convertAllFailed": "分镜转换全部失败（{count} 个）：{message}",
    "comic.msg.convertDone":
      "分镜转换完成：成功 {ok} 个，失败 {fail} 个{extra}。",
    "comic.msg.retryHint": "（失败的可重试，或在设置改用非推理模型）",
    "comic.msg.needConverted": "请先转换至少一个分镜英文提示词。",
    "comic.msg.noCnPrompt": "当前分镜没有中文描述。",
    "comic.msg.noEnPrompt": "当前分镜没有英文提示词。",
    "comic.msg.translateFailed": "翻译失败，请检查翻译设置和网络。",
    "comic.msg.translatedToEn": "分镜 #{index} 已直译为英文。",
    "comic.msg.translatedToZh": "分镜 #{index} 已回译为中文。",
    "comic.msg.queueCancelled": "已取消漫画生图队列。",
    "comic.msg.zipExported": "ZIP 已导出：{path}",
    "comic.msg.generatingPanel":
      "正在生成第 {index} 张（{current}/{total}）...",
    "comic.msg.queueStopped": "队列已停止：{message}",
    "comic.msg.authFailed": "NovelAI Token 或 Image Endpoint 鉴权失败。",
    "comic.msg.spent": "实扣 {amount} Anlas。",
    "comic.msg.spentFailed": "实扣读取失败，请刷新积分确认。",
    "comic.msg.doneZip": "队列已全部生成完成并导出 ZIP。{spent}",
    "comic.msg.doneZipFailed": "队列已全部生成完成，但 ZIP 导出失败。{spent}",
    "comic.msg.doneCancelled": "队列已取消。{spent}",
    "comic.msg.done": "队列已全部生成完成。{spent}",
    "comic.msg.quotePanel": "分镜 #{index}：{message}",
    "comic.msg.noGeneratable": "没有可生成的分镜。",
    "comic.msg.needToken": "请先在设置中配置 NovelAI API Token。",
    "comic.msg.needEndpoint": "请先在设置中填写 NovelAI Image Endpoint。",
    "comic.msg.emptyPrompt": "分镜 #{index} 缺少可用于生图的提示词。",
    "comic.msg.quoteFailedBefore": "无法读取生成前扣费：{message}",
    "comic.msg.insufficient":
      "漫画队列需要 {need} Anlas，当前余额 {balance} Anlas，已阻止执行。",
    "comic.msg.confirmQueue":
      "将按顺序生成 {count} 个分镜。\n生成前扣费（本地估算，非 NovelAI 官方报价）：约 {quote} Anlas\n当前余额：{balance} Anlas\n生成后会按 NovelAI 账户余额差显示实际扣费，以实际为准。\n\n是否继续？",
    "comic.msg.newPanelDesc": "新分镜描述",
    "comic.msg.imageUnavailable": "本地成图文件不可读取，请重新生成本分镜。",
  },
  "zh-TW": {
    "comic.step.story": "故事",
    "comic.step.storyHint": "匯入劇情，AI 拆分鏡",
    "comic.step.global": "全域設定",
    "comic.step.globalHint": "角色 / 風格 / 參數",
    "comic.step.panels": "分鏡",
    "comic.step.panelsHint": "轉換提示詞 / 微調",
    "comic.step.generate": "生成",
    "comic.step.generateHint": "隊列出圖 / 實扣積分",
    "comic.kind.vibe": "氛圍遷移",
    "comic.kind.precise": "精準參考",
    "comic.kind.character": "角色參考",
    "comic.kind.scene": "場景參考",
    "comic.kind.object": "物品參考",
    "comic.scope.character": "角色",
    "comic.scope.object": "物品",
    "comic.scope.scene": "場景",
    "comic.scope.full": "整張圖片",
    "comic.status.draft": "草稿",
    "comic.status.converted": "已轉換",
    "comic.status.generating": "生成中",
    "comic.status.done": "已出圖",
    "comic.status.failed": "失敗",
    "comic.mode.natural": "自然語言",
    "comic.mode.tags": "Danbooru 標籤",
    "comic.mode.mixed": "混合",
    "comic.template.customAnalyze": "使用設定中的 AI 拆分分鏡範本",
    "comic.template.builtinAnalyze": "使用內置 AI 拆分分鏡範本",
    "comic.template.custom": "使用自訂範本",
    "comic.template.builtin": "使用內置範本",
    "comic.defaultTitle": "未命名漫畫專案",
    "comic.metricSummary":
      "{panels} 分鏡 · {converted} 已轉換 · {done} 已出圖 · {mode}",
    "comic.quoteSelected": "已選 {count} 張",
    "comic.quoteUngenerated": "未生成 {count} 張",
    "comic.backToTools": "返回工具首頁",
    "comic.delete": "刪除",
    "comic.newProject": "新建專案",
    "comic.clearPanels": "清空分鏡",
    "comic.saveJson": "另存專案 JSON",
    "comic.importJson": "匯入專案 JSON",
    "comic.storyHeading": "第 1 步 · 匯入故事",
    "comic.storySub": "貼上劇情，讓 AI 拆出分鏡與全域設定",
    "comic.titleLabel": "標題",
    "comic.reverseStatus": "參考圖反推",
    "comic.splitStatus": "AI 拆分鏡 / 分鏡轉換",
    "comic.finalStatus": "最終生圖",
    "comic.notSetModel": "未設定模型",
    "comic.notSetApi": "未設定 API",
    "comic.templateMode": "範本模式",
    "comic.targetPanels": "目標分鏡數量（0=自動）",
    "comic.templateSummary": "查看目前範本 · {mode}",
    "comic.reverseTemplate": "反推範本",
    "comic.convertTemplate": "轉換範本",
    "comic.analyzeTemplate": "AI 拆分分鏡範本",
    "comic.storyTextLabel": "劇情 / 全域故事（可含分段說明，例如 1-7、8-15）",
    "comic.storyRefsTitle": "故事參考圖",
    "comic.storyRefsDesc":
      "在拆分鏡前上傳，AI 會結合使用者說明生成全域設定；這些圖後續預設作為精準參考沿用到每張分鏡。",
    "comic.uploadRefs": "上傳角色 / 物品 / 場景參考圖",
    "comic.foldRefs": "把已反推內容寫入全域設定",
    "comic.refsEmpty":
      "可選：上傳角色、物品或場景圖片，並說明它在故事中對應什麼。",
    "comic.kindLabel": "用途",
    "comic.subjectLabel": "對應說明",
    "comic.subjectPlaceholder": "例如：這是主角變身後的角色 / 桌上的皮套盒",
    "comic.useRef": "參與最終生圖參考（關閉後仍保留說明和反推結果）",
    "comic.reverseBusy": "反推中...",
    "comic.reverseRef": "反推參考圖",
    "comic.analyzeBusy": "拆分中...",
    "comic.analyzeAction": "AI 拆分分鏡 →",
    "comic.afterAnalyze": "拆分後會自動跳到「全域設定」。",
    "comic.bulkTagLabel":
      "或：直接匯入 Tag 提示詞生成漫畫（每行一個分鏡，跳過 AI 拆分 / 反推）",
    "comic.bulkTagPlaceholder":
      "第 1 個分鏡的英文 tag\n第 2 個分鏡的英文 tag\n...",
    "comic.importAsPanels": "匯入為分鏡 →",
    "comic.importTxt": "匯入 .txt 檔",
    "comic.bulkTagHint": "每行作為一個分鏡的英文提示詞，直接進入「分鏡」步驟。",
    "comic.globalHeading": "第 2 步 · 全域設定",
    "comic.sharedAll": "所有分鏡共享",
    "comic.syncParams": "同步目前生圖參數",
    "comic.globalCharacter":
      "全域角色設定（角色/皮套/限制等，會參與每個分鏡轉換）",
    "comic.globalStyle": "全域風格提示詞（拼接到每張正面提示詞最前）",
    "comic.globalNegative": "全域負面提示詞",
    "comic.model": "模型",
    "comic.advancedCollapse": "▾ 收起進階參數",
    "comic.advancedExpand": "▸ 展開進階參數（尺寸 / 步數 / 採樣器 / 開關）",
    "comic.width": "寬度",
    "comic.height": "高度",
    "comic.steps": "步數",
    "comic.sampler": "採樣器",
    "comic.noiseSchedule": "噪聲計畫",
    "comic.native": "Native（原生）",
    "comic.karras": "Karras（常用）",
    "comic.exponential": "Exponential（指數）",
    "comic.ucPreset": "UC 預設",
    "comic.qualityDesc": "使用 NovelAI 品質詞增強。",
    "comic.varietyDesc": "開啟多樣化採樣。",
    "comic.smeaDesc": "高解析度最佳化（V3）。",
    "comic.smeaDynDesc": "動態 SMEA（V3）。",
    "comic.panelsHeading": "第 3 步 · 分鏡",
    "comic.selectedCount": "已選 {count}",
    "comic.appliesAll": "未選擇時作用於全部",
    "comic.convertHelp":
      "分鏡轉換沿用第 1 步範本模式：{mode}。這樣全域反推、拆分鏡和轉換不會互相打架。",
    "comic.converting": "轉換中...",
    "comic.convertSelected": "轉換選中",
    "comic.convertAll": "轉換全部",
    "comic.checking": "檢測中...",
    "comic.consistencyCheck": "AI 一致性檢測",
    "comic.addPanel": "新增分鏡",
    "comic.selectAll": "全選",
    "comic.clearSelection": "清空選擇",
    "comic.panelTitle": "分鏡 #{index}",
    "comic.convertOne": "轉換本張",
    "comic.generating": "生成中...",
    "comic.generateOne": "生成本張",
    "comic.insert": "插入",
    "comic.editorAria": "分鏡編輯視圖",
    "comic.contentTab": "分鏡內容",
    "comic.paramsTab": "獨立參數",
    "comic.weightsTab": "提示詞權重",
    "comic.outputAlt": "分鏡 #{index} 生成結果",
    "comic.dragTitle": "可拖出到桌面 / 其他程式",
    "comic.resultTitle": "分鏡 #{index} 成圖",
    "comic.resultDesc": "重新生成會替換本分鏡目前成圖記錄。",
    "comic.noResult": "本分鏡尚未生成圖片",
    "comic.cnDesc": "中文分鏡描述",
    "comic.translating": "翻譯中...",
    "comic.translateToEn": "直譯英文",
    "comic.enPrompt": "英文生圖提示詞",
    "comic.translateToZh": "回譯中文",
    "comic.localNegative": "本分鏡負面提示詞",
    "comic.localNegativePlaceholder": "留空則只使用全域負面提示詞",
    "comic.negativeMode": "負面詞組合方式",
    "comic.negativeAppend": "追加到全域負面詞",
    "comic.negativeOverride": "覆蓋全域負面詞",
    "comic.overrideParams": "本分鏡獨立生圖參數",
    "comic.overrideParamsDesc":
      "開啟後只覆蓋目前分鏡；關閉時繼續使用第 2 步全域參數。",
    "comic.promptGuidance": "提示詞引導",
    "comic.seed": "種子（0=隨機）",
    "comic.negativePreset": "負面預設",
    "comic.qualityShortDesc": "品質詞增強",
    "comic.varietyShortDesc": "增加採樣多樣性",
    "comic.smeaShortDesc": "V3 高解析度最佳化",
    "comic.smeaDynShortDesc": "V3 動態最佳化",
    "comic.usingGlobalParams": "目前分鏡正在使用第 2 步的全域生圖參數。",
    "comic.reset": "重置",
    "comic.noAdjustTags": "目前英文提示詞沒有可調整的標籤。",
    "comic.generateHeading": "第 4 步 · 佇列出圖",
    "comic.convertedMetric": "{converted}/{total} 已轉換",
    "comic.balance": "目前餘額",
    "comic.unknown": "未知",
    "comic.quoting": "報價中",
    "comic.unavailable": "不可用",
    "comic.quoteBefore": "{target} · 生成前將扣 Anlas",
    "comic.waiting": "等待",
    "comic.actualSpent": "本次已實扣 Anlas",
    "comic.completedPanels": "已完成分鏡",
    "comic.autoZipLabel": "生成全部後自動匯出 ZIP",
    "comic.autoZipDesc": "ZIP 包含已生成圖片、project.json 和 prompts.md。",
    "comic.generateUngenerated": "生成全部未生成（{count}）",
    "comic.generateUnconverted": "生成未轉換分鏡（{count}）",
    "comic.generateSelected": "生成 / 重試選中（{count}）",
    "comic.exportZipBusy": "匯出中...",
    "comic.exportZip": "匯出已生成 ZIP",
    "comic.regenerateHint":
      "勾選已有成圖後仍可重新生成；未轉換分鏡會回退使用中文描述。",
    "comic.quoteFailed": "報價失敗：{message}",
    "comic.queuePaused": "已暫停",
    "comic.queueGenerating": "生成中",
    "comic.continue": "繼續",
    "comic.pause": "暫停",
    "comic.cancel": "取消",
    "comic.selectPanel": "選擇 #{index}",
    "comic.regenerate": "重新生成",
    "comic.retry": "重試",
    "comic.generate": "生成",
    "comic.msg.authFailed": "NovelAI Token 或 Image Endpoint 驗證失敗。",
    "comic.msg.clearPanelsLog": "分鏡列表已清空。",
    "comic.msg.confirmClearPanels":
      "只清空分鏡列表？故事、全域設定和參考圖會保留。",
    "comic.msg.confirmNew": "建立新專案？目前漫畫專案會被清空。",
    "comic.msg.confirmQueue":
      "按順序生成 {count} 個分鏡？\n生成前扣費（本地估算，非 NovelAI 官方報價）：約 {quote} Anlas\n目前餘額：{balance} Anlas\n生成後會以 NovelAI 餘額差顯示實際消耗。\n\n繼續嗎？",
    "comic.msg.confirmReplaceTags":
      "用這 {lines} 行 tag 取代目前 {panels} 個分鏡？",
    "comic.msg.convertAllFailed": "所有分鏡轉換失敗（{count}）：{message}",
    "comic.msg.convertDone": "分鏡轉換完成：成功 {ok}，失敗 {fail}{extra}。",
    "comic.msg.done": "佇列完成。{spent}",
    "comic.msg.doneCancelled": "佇列已取消。{spent}",
    "comic.msg.doneZip": "佇列完成並已匯出 ZIP。{spent}",
    "comic.msg.doneZipFailed": "佇列完成，但 ZIP 匯出失敗。{spent}",
    "comic.msg.emptyPrompt": "分鏡 #{index} 沒有可用於生圖的提示詞。",
    "comic.msg.foldedRefs": "已將 {count} 條參考圖反推結果寫入全域設定。",
    "comic.msg.generatingPanel": "正在生成分鏡 {index}（{current}/{total}）...",
    "comic.msg.imageUnavailable": "無法讀取本機輸出檔案，請重新生成此分鏡。",
    "comic.msg.importFailed": "匯入失敗：{message}",
    "comic.msg.importedProjectLog":
      "已匯入漫畫專案 JSON；外部檔案路徑已清除，圖片需要重新生成。",
    "comic.msg.importedTags": "已從 tags 建立 {count} 個分鏡，可前往「生成」。",
    "comic.msg.insufficient":
      "漫畫佇列需要 {need} Anlas，目前餘額 {balance}，已阻止執行。",
    "comic.msg.needConverted": "請先轉換至少一個分鏡的英文提示詞。",
    "comic.msg.needEndpoint": "請先在設定中填寫 NovelAI Image Endpoint。",
    "comic.msg.needTags": "請貼上或輸入 tag 提示詞，每行一個分鏡。",
    "comic.msg.needToken": "請先在設定中配置 NovelAI API Token。",
    "comic.msg.newPanelDesc": "新分鏡描述",
    "comic.msg.newProjectLog": "已建立空白漫畫專案。",
    "comic.msg.noCnPrompt": "目前分鏡沒有中文描述。",
    "comic.msg.noEnPrompt": "目前分鏡沒有英文提示詞。",
    "comic.msg.noGeneratable": "沒有可生成的分鏡。",
    "comic.msg.noRefToFold": "沒有可寫入全域設定的角色、場景或物品反推結果。",
    "comic.msg.projectTooLarge":
      "專案太大，無法保存到本機快取。請匯出專案 JSON 備份。",
    "comic.msg.queueCancelled": "漫畫生圖佇列已取消。",
    "comic.msg.queueStopped": "佇列已停止：{message}",
    "comic.msg.quoteFailedBefore": "無法讀取生成前報價：{message}",
    "comic.msg.quotePanel": "分鏡 #{index}：{message}",
    "comic.msg.referenceTooLarge":
      "參考圖過大，因此只保存了專案文本。之後請重新上傳參考圖，或減少數量/大小。",
    "comic.msg.retryHint":
      "（失敗分鏡可重試，或在設定中使用非 reasoning 模型）",
    "comic.msg.spent": "實際消耗 {amount} Anlas。",
    "comic.msg.spentFailed": "無法讀取實際消耗，請刷新餘額確認。",
    "comic.msg.splitDone": "已拆分為 {count} 個分鏡。",
    "comic.msg.syncedParams": "目前生成參數已同步到漫畫專案。",
    "comic.msg.translateFailed": "翻譯失敗，請檢查翻譯設定與網路。",
    "comic.msg.translatedToEn": "分鏡 #{index} 已直譯為英文。",
    "comic.msg.translatedToZh": "分鏡 #{index} 已回譯為中文。",
    "comic.msg.zipExported": "ZIP 已匯出：{path}",
  },
  "en-US": {
    "comic.step.story": "Story",
    "comic.step.storyHint": "Import story, split shots with AI",
    "comic.step.global": "Global setup",
    "comic.step.globalHint": "Character / style / params",
    "comic.step.panels": "Panels",
    "comic.step.panelsHint": "Convert prompts / refine",
    "comic.step.generate": "Generate",
    "comic.step.generateHint": "Queue images / actual cost",
    "comic.kind.vibe": "Vibe transfer",
    "comic.kind.precise": "Precise reference",
    "comic.kind.character": "Character reference",
    "comic.kind.scene": "Scene reference",
    "comic.kind.object": "Object reference",
    "comic.scope.character": "Character",
    "comic.scope.object": "Object",
    "comic.scope.scene": "Scene",
    "comic.scope.full": "Full image",
    "comic.status.draft": "Draft",
    "comic.status.converted": "Converted",
    "comic.status.generating": "Generating",
    "comic.status.done": "Done",
    "comic.status.failed": "Failed",
    "comic.mode.natural": "Natural language",
    "comic.mode.tags": "Danbooru tags",
    "comic.mode.mixed": "Mixed",
    "comic.template.customAnalyze":
      "Using the AI storyboard template from Settings",
    "comic.template.builtinAnalyze":
      "Using the built-in AI storyboard template",
    "comic.template.custom": "Using custom template",
    "comic.template.builtin": "Using built-in template",
    "comic.defaultTitle": "Untitled comic project",
    "comic.metricSummary":
      "{panels} panels · {converted} converted · {done} done · {mode}",
    "comic.quoteSelected": "{count} selected",
    "comic.quoteUngenerated": "{count} ungenerated",
    "comic.backToTools": "Back to Tools",
    "comic.delete": "Delete",
    "comic.newProject": "New project",
    "comic.clearPanels": "Clear panels",
    "comic.saveJson": "Save project JSON",
    "comic.importJson": "Import project JSON",
    "comic.storyHeading": "Step 1 · Import story",
    "comic.storySub":
      "Paste a story and let AI split it into panels and global setup",
    "comic.titleLabel": "Title",
    "comic.reverseStatus": "Reference reverse prompt",
    "comic.splitStatus": "AI storyboard / prompt conversion",
    "comic.finalStatus": "Final image generation",
    "comic.notSetModel": "Model not set",
    "comic.notSetApi": "API not set",
    "comic.templateMode": "Template mode",
    "comic.targetPanels": "Target panel count (0 = auto)",
    "comic.templateSummary": "Current templates · {mode}",
    "comic.reverseTemplate": "Reverse template",
    "comic.convertTemplate": "Conversion template",
    "comic.analyzeTemplate": "AI storyboard template",
    "comic.storyTextLabel":
      "Story / global script (can include ranges, e.g. 1-7, 8-15)",
    "comic.storyRefsTitle": "Story references",
    "comic.storyRefsDesc":
      "Upload before splitting. AI combines them with your notes to create global setup; by default they continue as precise references for each panel.",
    "comic.uploadRefs": "Upload character / object / scene references",
    "comic.foldRefs": "Write reversed content to global setup",
    "comic.refsEmpty":
      "Optional: upload character, object, or scene images and describe what they correspond to in the story.",
    "comic.kindLabel": "Use",
    "comic.subjectLabel": "Subject note",
    "comic.subjectPlaceholder":
      "Example: protagonist after transformation / the belt box on the desk",
    "comic.useRef":
      "Use as final generation reference (keeps notes and reverse result when off)",
    "comic.reverseBusy": "Reversing...",
    "comic.reverseRef": "Reverse reference",
    "comic.analyzeBusy": "Splitting...",
    "comic.analyzeAction": "AI split panels →",
    "comic.afterAnalyze": "After splitting, the page jumps to Global setup.",
    "comic.bulkTagLabel":
      "Or import tag prompts directly (one panel per line; skips AI split / reverse)",
    "comic.bulkTagPlaceholder":
      "English tags for panel 1\nEnglish tags for panel 2\n...",
    "comic.importAsPanels": "Import as panels →",
    "comic.importTxt": "Import .txt",
    "comic.bulkTagHint":
      "Each line becomes one panel's English prompt and goes straight to the Panels step.",
    "comic.globalHeading": "Step 2 · Global setup",
    "comic.sharedAll": "Shared by all panels",
    "comic.syncParams": "Sync current generation params",
    "comic.globalCharacter":
      "Global character setup (characters / suits / limits, used for every panel conversion)",
    "comic.globalStyle":
      "Global style prompt (prepended to every positive prompt)",
    "comic.globalNegative": "Global negative prompt",
    "comic.model": "Model",
    "comic.advancedCollapse": "▾ Collapse advanced params",
    "comic.advancedExpand":
      "▸ Expand advanced params (size / steps / sampler / toggles)",
    "comic.width": "Width",
    "comic.height": "Height",
    "comic.steps": "Steps",
    "comic.sampler": "Sampler",
    "comic.noiseSchedule": "Noise schedule",
    "comic.native": "Native",
    "comic.karras": "Karras",
    "comic.exponential": "Exponential",
    "comic.ucPreset": "UC preset",
    "comic.qualityDesc": "Enhance with NovelAI quality tags.",
    "comic.varietyDesc": "Enable more varied sampling.",
    "comic.smeaDesc": "High-resolution optimization (V3).",
    "comic.smeaDynDesc": "Dynamic SMEA (V3).",
    "comic.panelsHeading": "Step 3 · Panels",
    "comic.selectedCount": "{count} selected",
    "comic.appliesAll": "Applies to all when nothing is selected",
    "comic.convertHelp":
      "Panel conversion uses the Step 1 template mode: {mode}. This keeps global reverse, storyboard splitting, and conversion aligned.",
    "comic.converting": "Converting...",
    "comic.convertSelected": "Convert selected",
    "comic.convertAll": "Convert all",
    "comic.checking": "Checking...",
    "comic.consistencyCheck": "AI consistency check",
    "comic.addPanel": "Add panel",
    "comic.selectAll": "Select all",
    "comic.clearSelection": "Clear selection",
    "comic.panelTitle": "Panel #{index}",
    "comic.convertOne": "Convert this",
    "comic.generating": "Generating...",
    "comic.generateOne": "Generate this",
    "comic.insert": "Insert",
    "comic.editorAria": "Panel editor view",
    "comic.contentTab": "Panel content",
    "comic.paramsTab": "Independent params",
    "comic.weightsTab": "Prompt weights",
    "comic.outputAlt": "Generated result for panel #{index}",
    "comic.dragTitle": "Drag to desktop / other apps",
    "comic.resultTitle": "Panel #{index} output",
    "comic.resultDesc":
      "Regenerating will replace this panel's current output record.",
    "comic.noResult": "This panel has no generated image yet",
    "comic.cnDesc": "Chinese panel description",
    "comic.translating": "Translating...",
    "comic.translateToEn": "Translate to English",
    "comic.enPrompt": "English image prompt",
    "comic.translateToZh": "Back-translate to Chinese",
    "comic.localNegative": "Panel negative prompt",
    "comic.localNegativePlaceholder":
      "Leave empty to use only the global negative prompt",
    "comic.negativeMode": "Negative prompt mode",
    "comic.negativeAppend": "Append to global negative",
    "comic.negativeOverride": "Override global negative",
    "comic.overrideParams": "Independent generation params for this panel",
    "comic.overrideParamsDesc":
      "When enabled, only this panel overrides params; otherwise it uses Step 2 global params.",
    "comic.promptGuidance": "Prompt guidance",
    "comic.seed": "Seed (0 = random)",
    "comic.negativePreset": "Negative preset",
    "comic.qualityShortDesc": "Quality tag boost",
    "comic.varietyShortDesc": "Increase sampling variety",
    "comic.smeaShortDesc": "V3 high-res optimization",
    "comic.smeaDynShortDesc": "V3 dynamic optimization",
    "comic.usingGlobalParams":
      "This panel is using the Step 2 global generation params.",
    "comic.reset": "Reset",
    "comic.noAdjustTags": "The current English prompt has no adjustable tags.",
    "comic.generateHeading": "Step 4 · Queue generation",
    "comic.convertedMetric": "{converted}/{total} converted",
    "comic.balance": "Current balance",
    "comic.unknown": "Unknown",
    "comic.quoting": "Quoting",
    "comic.unavailable": "Unavailable",
    "comic.quoteBefore": "{target} · Anlas charged before generation",
    "comic.waiting": "Waiting",
    "comic.actualSpent": "Actual Anlas spent this run",
    "comic.completedPanels": "Completed panels",
    "comic.autoZipLabel": "Auto-export ZIP after generating all",
    "comic.autoZipDesc":
      "ZIP includes generated images, project.json, and prompts.md.",
    "comic.generateUngenerated": "Generate all ungenerated ({count})",
    "comic.generateUnconverted": "Generate unconverted panels ({count})",
    "comic.generateSelected": "Generate / retry selected ({count})",
    "comic.exportZipBusy": "Exporting...",
    "comic.exportZip": "Export generated ZIP",
    "comic.regenerateHint":
      "Existing outputs can still be regenerated; unconverted panels fall back to their Chinese descriptions.",
    "comic.quoteFailed": "Quote failed: {message}",
    "comic.queuePaused": "Paused",
    "comic.queueGenerating": "Generating",
    "comic.continue": "Continue",
    "comic.pause": "Pause",
    "comic.cancel": "Cancel",
    "comic.selectPanel": "Select #{index}",
    "comic.regenerate": "Regenerate",
    "comic.retry": "Retry",
    "comic.generate": "Generate",
    "comic.msg.referenceTooLarge":
      "Reference images are too large, so only project text was saved. Please re-upload references later, or reduce their number/size.",
    "comic.msg.projectTooLarge":
      "The project is too large to save to local cache. Export a project JSON backup.",
    "comic.msg.syncedParams":
      "Current generation params synced to the comic project.",
    "comic.msg.confirmNew":
      "Create a new project? The current comic project will be cleared.",
    "comic.msg.newProjectLog": "Created a blank comic project.",
    "comic.msg.confirmClearPanels":
      "Clear only the panel list? Story, global setup, and references will be kept.",
    "comic.msg.clearPanelsLog": "Panel list cleared.",
    "comic.msg.importedProjectLog":
      "Imported comic project JSON. External file paths were cleared; images need to be regenerated.",
    "comic.msg.importFailed": "Import failed: {message}",
    "comic.msg.noRefToFold":
      "No character, scene, or object reverse results can be written to global setup.",
    "comic.msg.foldedRefs":
      "Wrote {count} reference reverse results into global setup.",
    "comic.msg.splitDone": "Split into {count} panels.",
    "comic.msg.needTags": "Paste or enter tag prompts, one panel per line.",
    "comic.msg.confirmReplaceTags":
      "Replace the current {panels} panels with these {lines} tag lines?",
    "comic.msg.importedTags":
      "Created {count} panels from tags. You can go to Generate.",
    "comic.msg.convertAllFailed":
      "All panel conversions failed ({count}): {message}",
    "comic.msg.convertDone":
      "Panel conversion complete: {ok} succeeded, {fail} failed{extra}.",
    "comic.msg.retryHint":
      " (failed panels can be retried, or use a non-reasoning model in Settings)",
    "comic.msg.needConverted":
      "Convert at least one panel's English prompt first.",
    "comic.msg.noCnPrompt": "The current panel has no Chinese description.",
    "comic.msg.noEnPrompt": "The current panel has no English prompt.",
    "comic.msg.translateFailed":
      "Translation failed. Check translation settings and network.",
    "comic.msg.translatedToEn":
      "Panel #{index} translated directly to English.",
    "comic.msg.translatedToZh": "Panel #{index} back-translated to Chinese.",
    "comic.msg.queueCancelled": "Comic generation queue cancelled.",
    "comic.msg.zipExported": "ZIP exported: {path}",
    "comic.msg.generatingPanel":
      "Generating panel {index} ({current}/{total})...",
    "comic.msg.queueStopped": "Queue stopped: {message}",
    "comic.msg.authFailed":
      "NovelAI Token or Image Endpoint authentication failed.",
    "comic.msg.spent": "Actually spent {amount} Anlas.",
    "comic.msg.spentFailed":
      "Could not read actual spending. Refresh balance to confirm.",
    "comic.msg.doneZip": "Queue finished and exported ZIP. {spent}",
    "comic.msg.doneZipFailed": "Queue finished, but ZIP export failed. {spent}",
    "comic.msg.doneCancelled": "Queue cancelled. {spent}",
    "comic.msg.done": "Queue finished. {spent}",
    "comic.msg.quotePanel": "Panel #{index}: {message}",
    "comic.msg.noGeneratable": "No panels can be generated.",
    "comic.msg.needToken": "Configure NovelAI API Token in Settings first.",
    "comic.msg.needEndpoint": "Fill NovelAI Image Endpoint in Settings first.",
    "comic.msg.emptyPrompt":
      "Panel #{index} has no prompt for image generation.",
    "comic.msg.quoteFailedBefore":
      "Could not read pre-generation quote: {message}",
    "comic.msg.insufficient":
      "The comic queue needs {need} Anlas, but the current balance is {balance}. Execution was blocked.",
    "comic.msg.confirmQueue":
      "Generate {count} panels in order?\nPre-generation charge (local estimate, not NovelAI official quote): about {quote} Anlas\nCurrent balance: {balance} Anlas\nAfter generation, actual spending is shown from the NovelAI balance difference.\n\nContinue?",
    "comic.msg.newPanelDesc": "New panel description",
    "comic.msg.imageUnavailable":
      "The local output file cannot be read. Regenerate this panel.",
  },
  "ja-JP": {
    "comic.step.story": "ストーリー",
    "comic.step.storyHint": "物語を読み込み、AI でカット分割",
    "comic.step.global": "全体設定",
    "comic.step.globalHint": "キャラ / スタイル / パラメータ",
    "comic.step.panels": "カット",
    "comic.step.panelsHint": "プロンプト変換 / 調整",
    "comic.step.generate": "生成",
    "comic.step.generateHint": "キュー生成 / 実コスト",
    "comic.kind.vibe": "雰囲気転送",
    "comic.kind.precise": "精密参照",
    "comic.kind.character": "キャラ参照",
    "comic.kind.scene": "シーン参照",
    "comic.kind.object": "物品参照",
    "comic.scope.character": "キャラ",
    "comic.scope.object": "物品",
    "comic.scope.scene": "シーン",
    "comic.scope.full": "画像全体",
    "comic.status.draft": "草稿",
    "comic.status.converted": "変換済み",
    "comic.status.generating": "生成中",
    "comic.status.done": "生成済み",
    "comic.status.failed": "失敗",
    "comic.mode.natural": "自然言語",
    "comic.mode.tags": "Danbooru タグ",
    "comic.mode.mixed": "混合",
    "comic.template.customAnalyze": "設定の AI 分割テンプレートを使用",
    "comic.template.builtinAnalyze": "内蔵 AI 分割テンプレートを使用",
    "comic.template.custom": "カスタムテンプレートを使用",
    "comic.template.builtin": "内蔵テンプレートを使用",
    "comic.defaultTitle": "無題の漫画プロジェクト",
    "comic.metricSummary":
      "{panels} カット · {converted} 変換済み · {done} 生成済み · {mode}",
    "comic.quoteSelected": "{count} 枚選択",
    "comic.quoteUngenerated": "{count} 枚未生成",
    "comic.backToTools": "ツールへ戻る",
    "comic.delete": "削除",
    "comic.newProject": "新規プロジェクト",
    "comic.clearPanels": "カットを消去",
    "comic.saveJson": "JSON として保存",
    "comic.importJson": "JSON を読み込み",
    "comic.storyHeading": "ステップ 1 · ストーリー読込",
    "comic.storySub": "物語を貼り付け、AI にカットと全体設定を作らせます",
    "comic.titleLabel": "タイトル",
    "comic.reverseStatus": "参照画像解析",
    "comic.splitStatus": "AI 分割 / プロンプト変換",
    "comic.finalStatus": "最終画像生成",
    "comic.notSetModel": "モデル未設定",
    "comic.notSetApi": "API 未設定",
    "comic.templateMode": "テンプレートモード",
    "comic.targetPanels": "目標カット数（0=自動）",
    "comic.templateSummary": "現在のテンプレート · {mode}",
    "comic.reverseTemplate": "解析テンプレート",
    "comic.convertTemplate": "変換テンプレート",
    "comic.analyzeTemplate": "AI 分割テンプレート",
    "comic.storyTextLabel":
      "物語 / 全体ストーリー（1-7、8-15 などの範囲指定可）",
    "comic.storyRefsTitle": "ストーリー参照画像",
    "comic.storyRefsDesc":
      "分割前にアップロードすると、AI が説明と合わせて全体設定を生成します。以降は各カットの精密参照として使われます。",
    "comic.uploadRefs": "キャラ / 物品 / シーン参照をアップロード",
    "comic.foldRefs": "解析内容を全体設定に書き込む",
    "comic.refsEmpty":
      "任意：キャラ、物品、シーン画像をアップロードし、物語内での対応を説明します。",
    "comic.kindLabel": "用途",
    "comic.subjectLabel": "対応説明",
    "comic.subjectPlaceholder": "例：変身後の主人公 / 机上のベルト箱",
    "comic.useRef": "最終生成の参照に使う（オフでも説明と解析結果は保持）",
    "comic.reverseBusy": "解析中...",
    "comic.reverseRef": "参照を解析",
    "comic.analyzeBusy": "分割中...",
    "comic.analyzeAction": "AI でカット分割 →",
    "comic.afterAnalyze": "分割後は「全体設定」へ自動移動します。",
    "comic.bulkTagLabel":
      "または Tag プロンプトを直接読み込み（一行一カット、AI 分割 / 解析をスキップ）",
    "comic.bulkTagPlaceholder":
      "1 カット目の英語 tag\n2 カット目の英語 tag\n...",
    "comic.importAsPanels": "カットとして読み込み →",
    "comic.importTxt": ".txt を読み込み",
    "comic.bulkTagHint":
      "各行を一つのカットの英語プロンプトとして扱い、「カット」へ進みます。",
    "comic.globalHeading": "ステップ 2 · 全体設定",
    "comic.sharedAll": "全カットで共有",
    "comic.syncParams": "現在の生成パラメータを同期",
    "comic.globalCharacter":
      "全体キャラ設定（キャラ / スーツ / 制限など。各カット変換に使用）",
    "comic.globalStyle":
      "全体スタイルプロンプト（各正面プロンプトの先頭に追加）",
    "comic.globalNegative": "全体ネガティブプロンプト",
    "comic.model": "モデル",
    "comic.advancedCollapse": "▾ 詳細パラメータを閉じる",
    "comic.advancedExpand":
      "▸ 詳細パラメータを開く（サイズ / ステップ / サンプラー / スイッチ）",
    "comic.width": "幅",
    "comic.height": "高さ",
    "comic.steps": "ステップ",
    "comic.sampler": "サンプラー",
    "comic.noiseSchedule": "ノイズスケジュール",
    "comic.native": "Native",
    "comic.karras": "Karras",
    "comic.exponential": "Exponential",
    "comic.ucPreset": "UC プリセット",
    "comic.qualityDesc": "NovelAI 品質タグで強化します。",
    "comic.varietyDesc": "多様なサンプリングを有効化します。",
    "comic.smeaDesc": "高解像度最適化（V3）。",
    "comic.smeaDynDesc": "動的 SMEA（V3）。",
    "comic.panelsHeading": "ステップ 3 · カット",
    "comic.selectedCount": "{count} 件選択",
    "comic.appliesAll": "未選択時はすべてに適用",
    "comic.convertHelp":
      "カット変換はステップ 1 のテンプレートモードを使用します：{mode}。全体解析、分割、変換のズレを防ぎます。",
    "comic.converting": "変換中...",
    "comic.convertSelected": "選択を変換",
    "comic.convertAll": "すべて変換",
    "comic.checking": "検査中...",
    "comic.consistencyCheck": "AI 一貫性チェック",
    "comic.addPanel": "カット追加",
    "comic.selectAll": "すべて選択",
    "comic.clearSelection": "選択解除",
    "comic.panelTitle": "カット #{index}",
    "comic.convertOne": "このカットを変換",
    "comic.generating": "生成中...",
    "comic.generateOne": "このカットを生成",
    "comic.insert": "挿入",
    "comic.editorAria": "カット編集ビュー",
    "comic.contentTab": "カット内容",
    "comic.paramsTab": "個別パラメータ",
    "comic.weightsTab": "プロンプト重み",
    "comic.outputAlt": "カット #{index} の生成結果",
    "comic.dragTitle": "デスクトップ / 他アプリへドラッグできます",
    "comic.resultTitle": "カット #{index} 生成画像",
    "comic.resultDesc":
      "再生成するとこのカットの現在の出力記録を置き換えます。",
    "comic.noResult": "このカットはまだ画像未生成です",
    "comic.cnDesc": "中国語カット説明",
    "comic.translating": "翻訳中...",
    "comic.translateToEn": "英語へ直訳",
    "comic.enPrompt": "英語画像プロンプト",
    "comic.translateToZh": "中国語へ逆翻訳",
    "comic.localNegative": "このカットのネガティブプロンプト",
    "comic.localNegativePlaceholder": "空欄なら全体ネガティブのみ使用",
    "comic.negativeMode": "ネガティブ結合方式",
    "comic.negativeAppend": "全体ネガティブに追加",
    "comic.negativeOverride": "全体ネガティブを上書き",
    "comic.overrideParams": "このカットの個別生成パラメータ",
    "comic.overrideParamsDesc":
      "オンの場合はこのカットのみ上書きし、オフならステップ 2 の全体パラメータを使います。",
    "comic.promptGuidance": "プロンプト誘導",
    "comic.seed": "シード（0=ランダム）",
    "comic.negativePreset": "ネガティブプリセット",
    "comic.qualityShortDesc": "品質タグ強化",
    "comic.varietyShortDesc": "サンプリング多様性を追加",
    "comic.smeaShortDesc": "V3 高解像度最適化",
    "comic.smeaDynShortDesc": "V3 動的最適化",
    "comic.usingGlobalParams":
      "このカットはステップ 2 の全体生成パラメータを使用中です。",
    "comic.reset": "リセット",
    "comic.noAdjustTags": "現在の英語プロンプトに調整可能なタグはありません。",
    "comic.generateHeading": "ステップ 4 · キュー生成",
    "comic.convertedMetric": "{converted}/{total} 変換済み",
    "comic.balance": "現在の残高",
    "comic.unknown": "不明",
    "comic.quoting": "見積中",
    "comic.unavailable": "利用不可",
    "comic.quoteBefore": "{target} · 生成前に Anlas を消費",
    "comic.waiting": "待機",
    "comic.actualSpent": "今回の実消費 Anlas",
    "comic.completedPanels": "完了カット",
    "comic.autoZipLabel": "すべて生成後に ZIP を自動書き出し",
    "comic.autoZipDesc":
      "ZIP には生成画像、project.json、prompts.md が含まれます。",
    "comic.generateUngenerated": "未生成をすべて生成（{count}）",
    "comic.generateUnconverted": "未変換カットを生成（{count}）",
    "comic.generateSelected": "選択を生成 / 再試行（{count}）",
    "comic.exportZipBusy": "書き出し中...",
    "comic.exportZip": "生成済み ZIP を書き出し",
    "comic.regenerateHint":
      "既存画像も再生成できます。未変換カットは中国語説明を使用します。",
    "comic.quoteFailed": "見積失敗：{message}",
    "comic.queuePaused": "一時停止中",
    "comic.queueGenerating": "生成中",
    "comic.continue": "続行",
    "comic.pause": "一時停止",
    "comic.cancel": "キャンセル",
    "comic.selectPanel": "#{index} を選択",
    "comic.regenerate": "再生成",
    "comic.retry": "再試行",
    "comic.generate": "生成",
    "comic.msg.authFailed":
      "NovelAI Token または Image Endpoint の認証に失敗しました。",
    "comic.msg.clearPanelsLog": "パネル一覧をクリアしました。",
    "comic.msg.confirmClearPanels":
      "パネル一覧だけをクリアしますか？ストーリー、全体設定、参照は保持されます。",
    "comic.msg.confirmNew":
      "新しいプロジェクトを作成しますか？現在の漫画プロジェクトはクリアされます。",
    "comic.msg.confirmQueue":
      "{count} パネルを順番に生成しますか？\n生成前消費（ローカル推定、NovelAI 公式見積もりではありません）：約 {quote} Anlas\n現在の残高：{balance} Anlas\n生成後、NovelAI 残高差から実消費を表示します。\n\n続行しますか？",
    "comic.msg.confirmReplaceTags":
      "現在の {panels} パネルを、この {lines} 行の tag で置き換えますか？",
    "comic.msg.convertAllFailed":
      "すべてのパネル変換に失敗しました（{count}）：{message}",
    "comic.msg.convertDone": "パネル変換完了：成功 {ok}、失敗 {fail}{extra}。",
    "comic.msg.done": "キュー完了。{spent}",
    "comic.msg.doneCancelled": "キューをキャンセルしました。{spent}",
    "comic.msg.doneZip": "キュー完了、ZIP を書き出しました。{spent}",
    "comic.msg.doneZipFailed":
      "キューは完了しましたが、ZIP 書き出しに失敗しました。{spent}",
    "comic.msg.emptyPrompt":
      "パネル #{index} には画像生成用プロンプトがありません。",
    "comic.msg.foldedRefs":
      "{count} 件の参照解析結果を全体設定へ書き込みました。",
    "comic.msg.generatingPanel":
      "パネル {index} を生成中（{current}/{total}）...",
    "comic.msg.imageUnavailable":
      "ローカル出力ファイルを読み取れません。このパネルを再生成してください。",
    "comic.msg.importFailed": "読み込みに失敗しました：{message}",
    "comic.msg.importedProjectLog":
      "漫画プロジェクト JSON を読み込みました。外部ファイルパスはクリアされ、画像は再生成が必要です。",
    "comic.msg.importedTags":
      "tags から {count} パネルを作成しました。「生成」へ進めます。",
    "comic.msg.insufficient":
      "漫画キューには {need} Anlas が必要ですが、現在の残高は {balance} です。実行を停止しました。",
    "comic.msg.needConverted":
      "先に少なくとも 1 つのパネルの英語プロンプトを変換してください。",
    "comic.msg.needEndpoint":
      "先に設定で NovelAI Image Endpoint を入力してください。",
    "comic.msg.needTags":
      "tag プロンプトを貼り付け/入力してください。1 行につき 1 パネルです。",
    "comic.msg.needToken": "先に設定で NovelAI API Token を設定してください。",
    "comic.msg.newPanelDesc": "新しいパネル説明",
    "comic.msg.newProjectLog": "空の漫画プロジェクトを作成しました。",
    "comic.msg.noCnPrompt": "現在のパネルには中国語説明がありません。",
    "comic.msg.noEnPrompt": "現在のパネルには英語プロンプトがありません。",
    "comic.msg.noGeneratable": "生成できるパネルがありません。",
    "comic.msg.noRefToFold":
      "全体設定へ書き込めるキャラクター、シーン、オブジェクトの解析結果がありません。",
    "comic.msg.projectTooLarge":
      "プロジェクトが大きすぎてローカルキャッシュに保存できません。プロジェクト JSON を書き出してバックアップしてください。",
    "comic.msg.queueCancelled": "漫画生成キューをキャンセルしました。",
    "comic.msg.queueStopped": "キュー停止：{message}",
    "comic.msg.quoteFailedBefore":
      "生成前見積もりを読み取れませんでした：{message}",
    "comic.msg.quotePanel": "パネル #{index}：{message}",
    "comic.msg.referenceTooLarge":
      "参照画像が大きすぎるため、プロジェクトテキストのみ保存しました。後で参照画像を再アップロードするか、数/サイズを減らしてください。",
    "comic.msg.retryHint":
      "（失敗パネルは再試行できます。設定で非 reasoning モデルを使うこともできます）",
    "comic.msg.spent": "実消費 {amount} Anlas。",
    "comic.msg.spentFailed":
      "実消費を読み取れませんでした。残高を更新して確認してください。",
    "comic.msg.splitDone": "{count} パネルに分割しました。",
    "comic.msg.syncedParams":
      "現在の生成パラメータを漫画プロジェクトへ同期しました。",
    "comic.msg.translateFailed":
      "翻訳に失敗しました。翻訳設定とネットワークを確認してください。",
    "comic.msg.translatedToEn": "パネル #{index} を英語へ直訳しました。",
    "comic.msg.translatedToZh": "パネル #{index} を中国語へ逆翻訳しました。",
    "comic.msg.zipExported": "ZIP を書き出しました：{path}",
  },
  "ko-KR": {
    "comic.step.story": "스토리",
    "comic.step.storyHint": "이야기 가져오기, AI 컷 분할",
    "comic.step.global": "전역 설정",
    "comic.step.globalHint": "캐릭터 / 스타일 / 파라미터",
    "comic.step.panels": "컷",
    "comic.step.panelsHint": "프롬프트 변환 / 조정",
    "comic.step.generate": "생성",
    "comic.step.generateHint": "큐 이미지 / 실제 비용",
    "comic.kind.vibe": "분위기 전송",
    "comic.kind.precise": "정밀 참조",
    "comic.kind.character": "캐릭터 참조",
    "comic.kind.scene": "장면 참조",
    "comic.kind.object": "물품 참조",
    "comic.scope.character": "캐릭터",
    "comic.scope.object": "물품",
    "comic.scope.scene": "장면",
    "comic.scope.full": "전체 이미지",
    "comic.status.draft": "초안",
    "comic.status.converted": "변환됨",
    "comic.status.generating": "생성 중",
    "comic.status.done": "완료",
    "comic.status.failed": "실패",
    "comic.mode.natural": "자연어",
    "comic.mode.tags": "Danbooru 태그",
    "comic.mode.mixed": "혼합",
    "comic.template.customAnalyze": "설정의 AI 컷 분할 템플릿 사용",
    "comic.template.builtinAnalyze": "내장 AI 컷 분할 템플릿 사용",
    "comic.template.custom": "사용자 템플릿 사용",
    "comic.template.builtin": "내장 템플릿 사용",
    "comic.defaultTitle": "제목 없는 만화 프로젝트",
    "comic.metricSummary":
      "{panels}컷 · {converted} 변환됨 · {done} 완료 · {mode}",
    "comic.quoteSelected": "{count}장 선택",
    "comic.quoteUngenerated": "{count}장 미생성",
    "comic.backToTools": "도구로 돌아가기",
    "comic.delete": "삭제",
    "comic.newProject": "새 프로젝트",
    "comic.clearPanels": "컷 비우기",
    "comic.saveJson": "프로젝트 JSON 저장",
    "comic.importJson": "프로젝트 JSON 가져오기",
    "comic.storyHeading": "1단계 · 스토리 가져오기",
    "comic.storySub": "이야기를 붙여넣고 AI가 컷과 전역 설정을 나누게 합니다",
    "comic.titleLabel": "제목",
    "comic.reverseStatus": "참조 이미지 역추론",
    "comic.splitStatus": "AI 컷 분할 / 프롬프트 변환",
    "comic.finalStatus": "최종 이미지 생성",
    "comic.notSetModel": "모델 미설정",
    "comic.notSetApi": "API 미설정",
    "comic.templateMode": "템플릿 모드",
    "comic.targetPanels": "목표 컷 수(0=자동)",
    "comic.templateSummary": "현재 템플릿 · {mode}",
    "comic.reverseTemplate": "역추론 템플릿",
    "comic.convertTemplate": "변환 템플릿",
    "comic.analyzeTemplate": "AI 컷 분할 템플릿",
    "comic.storyTextLabel":
      "스토리 / 전역 이야기(예: 1-7, 8-15 범위 설명 가능)",
    "comic.storyRefsTitle": "스토리 참조 이미지",
    "comic.storyRefsDesc":
      "분할 전에 업로드하면 AI가 사용자 설명과 함께 전역 설정을 생성합니다. 이후 각 컷의 정밀 참조로 이어집니다.",
    "comic.uploadRefs": "캐릭터 / 물품 / 장면 참조 업로드",
    "comic.foldRefs": "역추론 내용을 전역 설정에 쓰기",
    "comic.refsEmpty":
      "선택: 캐릭터, 물품, 장면 이미지를 업로드하고 이야기에서 무엇에 해당하는지 설명하세요.",
    "comic.kindLabel": "용도",
    "comic.subjectLabel": "대응 설명",
    "comic.subjectPlaceholder": "예: 변신 후 주인공 / 책상 위 벨트 상자",
    "comic.useRef": "최종 생성 참조에 사용(꺼도 설명과 역추론 결과는 유지)",
    "comic.reverseBusy": "역추론 중...",
    "comic.reverseRef": "참조 역추론",
    "comic.analyzeBusy": "분할 중...",
    "comic.analyzeAction": "AI 컷 분할 →",
    "comic.afterAnalyze": "분할 후 자동으로 전역 설정으로 이동합니다.",
    "comic.bulkTagLabel":
      "또는 Tag 프롬프트를 직접 가져오기(한 줄 한 컷, AI 분할 / 역추론 건너뛰기)",
    "comic.bulkTagPlaceholder": "1번째 컷의 영어 tag\n2번째 컷의 영어 tag\n...",
    "comic.importAsPanels": "컷으로 가져오기 →",
    "comic.importTxt": ".txt 가져오기",
    "comic.bulkTagHint":
      "각 줄을 한 컷의 영어 프롬프트로 사용하고 바로 컷 단계로 이동합니다.",
    "comic.globalHeading": "2단계 · 전역 설정",
    "comic.sharedAll": "모든 컷 공유",
    "comic.syncParams": "현재 생성 파라미터 동기화",
    "comic.globalCharacter":
      "전역 캐릭터 설정(캐릭터 / 슈트 / 제한 등, 모든 컷 변환에 사용)",
    "comic.globalStyle": "전역 스타일 프롬프트(각 긍정 프롬프트 앞에 추가)",
    "comic.globalNegative": "전역 네거티브 프롬프트",
    "comic.model": "모델",
    "comic.advancedCollapse": "▾ 고급 파라미터 접기",
    "comic.advancedExpand":
      "▸ 고급 파라미터 펼치기(크기 / 스텝 / 샘플러 / 토글)",
    "comic.width": "너비",
    "comic.height": "높이",
    "comic.steps": "스텝",
    "comic.sampler": "샘플러",
    "comic.noiseSchedule": "노이즈 스케줄",
    "comic.native": "Native",
    "comic.karras": "Karras",
    "comic.exponential": "Exponential",
    "comic.ucPreset": "UC 프리셋",
    "comic.qualityDesc": "NovelAI 품질 태그로 강화합니다.",
    "comic.varietyDesc": "다양한 샘플링을 활성화합니다.",
    "comic.smeaDesc": "고해상도 최적화(V3).",
    "comic.smeaDynDesc": "동적 SMEA(V3).",
    "comic.panelsHeading": "3단계 · 컷",
    "comic.selectedCount": "{count}개 선택",
    "comic.appliesAll": "선택하지 않으면 전체에 적용",
    "comic.convertHelp":
      "컷 변환은 1단계 템플릿 모드를 사용합니다: {mode}. 전역 역추론, 컷 분할, 변환이 어긋나지 않게 합니다.",
    "comic.converting": "변환 중...",
    "comic.convertSelected": "선택 변환",
    "comic.convertAll": "전체 변환",
    "comic.checking": "검사 중...",
    "comic.consistencyCheck": "AI 일관성 검사",
    "comic.addPanel": "컷 추가",
    "comic.selectAll": "전체 선택",
    "comic.clearSelection": "선택 비우기",
    "comic.panelTitle": "컷 #{index}",
    "comic.convertOne": "이 컷 변환",
    "comic.generating": "생성 중...",
    "comic.generateOne": "이 컷 생성",
    "comic.insert": "삽입",
    "comic.editorAria": "컷 편집 보기",
    "comic.contentTab": "컷 내용",
    "comic.paramsTab": "독립 파라미터",
    "comic.weightsTab": "프롬프트 가중치",
    "comic.outputAlt": "컷 #{index} 생성 결과",
    "comic.dragTitle": "데스크톱 / 다른 앱으로 드래그 가능",
    "comic.resultTitle": "컷 #{index} 결과",
    "comic.resultDesc": "재생성하면 현재 컷 결과 기록이 교체됩니다.",
    "comic.noResult": "이 컷은 아직 이미지가 생성되지 않았습니다",
    "comic.cnDesc": "중국어 컷 설명",
    "comic.translating": "번역 중...",
    "comic.translateToEn": "영어로 직역",
    "comic.enPrompt": "영어 이미지 프롬프트",
    "comic.translateToZh": "중국어로 역번역",
    "comic.localNegative": "이 컷 네거티브 프롬프트",
    "comic.localNegativePlaceholder": "비우면 전역 네거티브만 사용",
    "comic.negativeMode": "네거티브 조합 방식",
    "comic.negativeAppend": "전역 네거티브에 추가",
    "comic.negativeOverride": "전역 네거티브 덮어쓰기",
    "comic.overrideParams": "이 컷 독립 생성 파라미터",
    "comic.overrideParamsDesc":
      "켜면 현재 컷만 덮어쓰고, 끄면 2단계 전역 파라미터를 사용합니다.",
    "comic.promptGuidance": "프롬프트 가이던스",
    "comic.seed": "시드(0=랜덤)",
    "comic.negativePreset": "네거티브 프리셋",
    "comic.qualityShortDesc": "품질 태그 강화",
    "comic.varietyShortDesc": "샘플링 다양성 증가",
    "comic.smeaShortDesc": "V3 고해상도 최적화",
    "comic.smeaDynShortDesc": "V3 동적 최적화",
    "comic.usingGlobalParams":
      "현재 컷은 2단계 전역 생성 파라미터를 사용 중입니다.",
    "comic.reset": "초기화",
    "comic.noAdjustTags": "현재 영어 프롬프트에 조정 가능한 태그가 없습니다.",
    "comic.generateHeading": "4단계 · 큐 생성",
    "comic.convertedMetric": "{converted}/{total} 변환됨",
    "comic.balance": "현재 잔액",
    "comic.unknown": "알 수 없음",
    "comic.quoting": "견적 중",
    "comic.unavailable": "사용 불가",
    "comic.quoteBefore": "{target} · 생성 전 Anlas 차감",
    "comic.waiting": "대기",
    "comic.actualSpent": "이번 실제 사용 Anlas",
    "comic.completedPanels": "완료 컷",
    "comic.autoZipLabel": "전체 생성 후 ZIP 자동 내보내기",
    "comic.autoZipDesc":
      "ZIP에는 생성 이미지, project.json, prompts.md가 포함됩니다.",
    "comic.generateUngenerated": "미생성 전체 생성({count})",
    "comic.generateUnconverted": "미변환 컷 생성({count})",
    "comic.generateSelected": "선택 생성 / 재시도({count})",
    "comic.exportZipBusy": "내보내는 중...",
    "comic.exportZip": "생성된 ZIP 내보내기",
    "comic.regenerateHint":
      "기존 결과도 재생성할 수 있습니다. 미변환 컷은 중국어 설명을 사용합니다.",
    "comic.quoteFailed": "견적 실패: {message}",
    "comic.queuePaused": "일시정지됨",
    "comic.queueGenerating": "생성 중",
    "comic.continue": "계속",
    "comic.pause": "일시정지",
    "comic.cancel": "취소",
    "comic.selectPanel": "#{index} 선택",
    "comic.regenerate": "재생성",
    "comic.retry": "재시도",
    "comic.generate": "생성",
    "comic.msg.authFailed":
      "NovelAI Token 또는 Image Endpoint 인증에 실패했습니다.",
    "comic.msg.clearPanelsLog": "패널 목록을 비웠습니다.",
    "comic.msg.confirmClearPanels":
      "패널 목록만 비울까요? 스토리, 전역 설정, 참조는 유지됩니다.",
    "comic.msg.confirmNew":
      "새 프로젝트를 만들까요? 현재 만화 프로젝트가 비워집니다.",
    "comic.msg.confirmQueue":
      "{count}개 패널을 순서대로 생성할까요?\n생성 전 비용(로컬 추정, NovelAI 공식 견적 아님): 약 {quote} Anlas\n현재 잔액: {balance} Anlas\n생성 후 NovelAI 잔액 차이로 실제 사용량을 표시합니다.\n\n계속할까요?",
    "comic.msg.confirmReplaceTags":
      "현재 {panels}개 패널을 이 {lines}줄 tag로 교체할까요?",
    "comic.msg.convertAllFailed": "모든 패널 변환 실패({count}): {message}",
    "comic.msg.convertDone": "패널 변환 완료: 성공 {ok}, 실패 {fail}{extra}.",
    "comic.msg.done": "대기열 완료. {spent}",
    "comic.msg.doneCancelled": "대기열 취소됨. {spent}",
    "comic.msg.doneZip": "대기열 완료 및 ZIP 내보내기 완료. {spent}",
    "comic.msg.doneZipFailed":
      "대기열은 완료되었지만 ZIP 내보내기에 실패했습니다. {spent}",
    "comic.msg.emptyPrompt":
      "패널 #{index}에는 이미지 생성용 프롬프트가 없습니다.",
    "comic.msg.foldedRefs": "참조 분석 결과 {count}개를 전역 설정에 썼습니다.",
    "comic.msg.generatingPanel": "패널 {index} 생성 중({current}/{total})...",
    "comic.msg.imageUnavailable":
      "로컬 출력 파일을 읽을 수 없습니다. 이 패널을 다시 생성하세요.",
    "comic.msg.importFailed": "가져오기 실패: {message}",
    "comic.msg.importedProjectLog":
      "만화 프로젝트 JSON을 가져왔습니다. 외부 파일 경로를 비웠으며 이미지는 다시 생성해야 합니다.",
    "comic.msg.importedTags":
      "tags에서 {count}개 패널을 만들었습니다. 생성 단계로 이동할 수 있습니다.",
    "comic.msg.insufficient":
      "만화 대기열에는 {need} Anlas가 필요하지만 현재 잔액은 {balance}입니다. 실행을 차단했습니다.",
    "comic.msg.needConverted":
      "먼저 하나 이상의 패널 영어 프롬프트를 변환하세요.",
    "comic.msg.needEndpoint":
      "먼저 설정에서 NovelAI Image Endpoint를 입력하세요.",
    "comic.msg.needTags":
      "tag 프롬프트를 붙여넣거나 입력하세요. 한 줄에 패널 하나입니다.",
    "comic.msg.needToken": "먼저 설정에서 NovelAI API Token을 설정하세요.",
    "comic.msg.newPanelDesc": "새 패널 설명",
    "comic.msg.newProjectLog": "빈 만화 프로젝트를 만들었습니다.",
    "comic.msg.noCnPrompt": "현재 패널에는 중국어 설명이 없습니다.",
    "comic.msg.noEnPrompt": "현재 패널에는 영어 프롬프트가 없습니다.",
    "comic.msg.noGeneratable": "생성할 수 있는 패널이 없습니다.",
    "comic.msg.noRefToFold":
      "전역 설정에 쓸 수 있는 캐릭터, 장면 또는 물체 분석 결과가 없습니다.",
    "comic.msg.projectTooLarge":
      "프로젝트가 너무 커서 로컬 캐시에 저장할 수 없습니다. 프로젝트 JSON 백업을 내보내세요.",
    "comic.msg.queueCancelled": "만화 생성 대기열을 취소했습니다.",
    "comic.msg.queueStopped": "대기열 중지: {message}",
    "comic.msg.quoteFailedBefore": "생성 전 견적을 읽을 수 없습니다: {message}",
    "comic.msg.quotePanel": "패널 #{index}: {message}",
    "comic.msg.referenceTooLarge":
      "참조 이미지가 너무 커서 프로젝트 텍스트만 저장했습니다. 나중에 참조 이미지를 다시 업로드하거나 수/크기를 줄이세요.",
    "comic.msg.retryHint":
      " (실패 패널은 재시도하거나 설정에서 non-reasoning 모델을 사용할 수 있습니다)",
    "comic.msg.spent": "실제 사용 {amount} Anlas.",
    "comic.msg.spentFailed":
      "실제 사용량을 읽을 수 없습니다. 잔액을 새로고침해 확인하세요.",
    "comic.msg.splitDone": "{count}개 패널로 분할했습니다.",
    "comic.msg.syncedParams":
      "현재 생성 매개변수를 만화 프로젝트에 동기화했습니다.",
    "comic.msg.translateFailed":
      "번역 실패. 번역 설정과 네트워크를 확인하세요.",
    "comic.msg.translatedToEn": "패널 #{index}을(를) 영어로 직역했습니다.",
    "comic.msg.translatedToZh": "패널 #{index}을(를) 중국어로 역번역했습니다.",
    "comic.msg.zipExported": "ZIP 내보내기 완료: {path}",
  },
};

function comicText(language: unknown, key: string) {
  const code =
    typeof language === "string" && COMIC_UI_TEXT[language]
      ? language
      : "zh-CN";
  if (code === "zh-TW")
    return (
      COMIC_UI_TEXT[code]?.[key] ??
      COMIC_UI_TEXT["zh-CN"][key] ??
      COMIC_UI_TEXT["en-US"]?.[key] ??
      key
    );
  return (
    COMIC_UI_TEXT[code]?.[key] ??
    COMIC_UI_TEXT["en-US"]?.[key] ??
    COMIC_UI_TEXT["zh-CN"][key] ??
    key
  );
}

function comicFormat(
  language: unknown,
  key: string,
  values: Record<string, unknown>,
) {
  return comicText(language, key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values[name] ?? ""),
  );
}

function uid() {
  return (
    crypto.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function anlasSpent(before?: number, after?: number) {
  if (typeof before !== "number" || typeof after !== "number") return null;
  return Math.max(0, before - after);
}

function normalizeComicReference(
  ref: Partial<ComicReferenceAsset>,
): ComicReferenceAsset {
  const base64 = ref.base64 ?? "";
  return {
    id: ref.id || uid(),
    name: ref.name ?? "Reference",
    kind: ref.kind ?? "precise",
    scope: ref.scope ?? "full",
    subjectHint: ref.subjectHint ?? "",
    base64,
    previewUrl: ref.previewUrl ?? (base64 ? dataUrlFromBase64(base64) : ""),
    reversePrompt: ref.reversePrompt ?? "",
    infoExtracted:
      typeof ref.infoExtracted === "number" ? ref.infoExtracted : 0.7,
    strength: typeof ref.strength === "number" ? ref.strength : 0.45,
    useForGeneration: ref.useForGeneration ?? true,
  };
}

function normalizeComicPanelData(
  panel: Partial<ComicPanel>,
  index: number,
  trustOutputs: boolean,
): ComicPanel {
  const override = panel.paramsOverride;
  return {
    id: panel.id || uid(),
    index:
      typeof panel.index === "number" && panel.index > 0
        ? panel.index
        : index + 1,
    cnPrompt: panel.cnPrompt ?? "",
    contextSummary: panel.contextSummary ?? "",
    enPrompt: panel.enPrompt ?? "",
    localNegativePrompt: panel.localNegativePrompt ?? "",
    negativeMode: panel.negativeMode === "override" ? "override" : "append",
    paramsOverride:
      override && typeof override === "object"
        ? { enabled: !!override.enabled, params: override.params ?? {} }
        : { enabled: false, params: {} },
    status: panel.status ?? "draft",
    actualAnlas: panel.actualAnlas,
    // Output references point at machine-local files; only trust them from our own
    // localStorage, never from an imported (untrusted) project JSON.
    historyItemId: trustOutputs ? panel.historyItemId : undefined,
    outputPath: trustOutputs ? panel.outputPath : undefined,
    outputUrl: trustOutputs ? panel.outputUrl : undefined,
    error: trustOutputs ? panel.error : undefined,
  };
}

// Single source of truth for turning a raw/old/untrusted project blob into a
// fully-populated ComicProject. Shared by localStorage hydration and JSON import
// so both stay robust against missing fields (paramsOverride / negativeMode / …).
function normalizeComicProject(
  parsed: Partial<ComicProject> | null | undefined,
  params: GenerateParams,
  options: { trustOutputs: boolean },
): ComicProject {
  const source = parsed ?? {};
  return {
    ...createDefaultComicProject(params),
    ...source,
    historyGroupId: options.trustOutputs ? source.historyGroupId : undefined,
    mode: source.mode ?? "natural",
    desiredPanelCount: source.desiredPanelCount ?? "auto",
    autoExportZip: source.autoExportZip ?? false,
    adultBranch: false,
    inheritPreviousFrame: false,
    continuityBible: "",
    globalParams: {
      ...params,
      ...(source.globalParams ?? {}),
      positivePrompt: "",
    },
    references: (source.references ?? []).map((ref) =>
      normalizeComicReference(ref),
    ),
    panels: (source.panels ?? []).map((panel, index) =>
      normalizeComicPanelData(panel, index, options.trustOutputs),
    ),
  };
}

function makeStoredComicProject(project: ComicProject): ComicProject {
  return {
    ...project,
    references: project.references.map((ref) => ({
      ...ref,
      // previewUrl duplicates base64 as a data URL and can double localStorage work.
      // normalizeComicReference rebuilds it from base64 when the project is loaded.
      previewUrl: "",
    })),
  };
}

function readStoredProject(params: GenerateParams): ComicProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultComicProject(params);
    return normalizeComicProject(
      JSON.parse(raw) as Partial<ComicProject>,
      params,
      { trustOutputs: true },
    );
  } catch {
    return createDefaultComicProject(params);
  }
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.readAsDataURL(file);
  });
}

// Cache data-URLs by their source bytes so the same image always yields the
// SAME string instance. Without this, every re-render builds a fresh data-URL
// → the <img src> identity changes → the browser re-decodes the (full-size)
// image. During a batch run, patchItem re-renders the whole grid on every
// status change, so that re-decode storm froze the UI. Bounded to avoid growing
// without limit across repeated imports.
const dataUrlCache = new Map<string, string>();
function dataUrlFromBase64(base64: string) {
  if (base64.startsWith("data:")) return base64;
  const cached = dataUrlCache.get(base64);
  if (cached) return cached;
  const url = `data:image/png;base64,${base64}`;
  if (dataUrlCache.size > 300) dataUrlCache.clear();
  dataUrlCache.set(base64, url);
  return url;
}

function sortedPanels(project: ComicProject) {
  return [...project.panels].sort((a, b) => a.index - b.index);
}

function mergePanelParams(
  project: ComicProject,
  panel: ComicPanel,
): GenerateParams {
  const base = { ...project.globalParams, positivePrompt: "" };
  if (!panel.paramsOverride.enabled) return base;
  return { ...base, ...panel.paramsOverride.params, positivePrompt: "" };
}

function setPanelTagLevel(
  panel: ComicPanel,
  tagIndex: number,
  level: number,
): ComicPanel {
  return {
    ...panel,
    enPrompt: setTagLevelInPrompt(panel.enPrompt, tagIndex, level),
  };
}

function labelForKind(kind: ComicReferenceKind, language?: unknown) {
  switch (kind) {
    case "vibe":
      return comicText(language, "comic.kind.vibe");
    case "precise":
      return comicText(language, "comic.kind.precise");
    case "character":
      return comicText(language, "comic.kind.character");
    case "scene":
      return comicText(language, "comic.kind.scene");
    case "object":
      return comicText(language, "comic.kind.object");
    default:
      return kind;
  }
}

function labelForScope(scope: ReversePromptScope, language?: unknown) {
  switch (scope) {
    case "character":
      return comicText(language, "comic.scope.character");
    case "object":
      return comicText(language, "comic.scope.object");
    case "scene":
      return comicText(language, "comic.scope.scene");
    default:
      return comicText(language, "comic.scope.full");
  }
}

function labelForPanelStatus(status: ComicPanel["status"], language?: unknown) {
  switch (status) {
    case "draft":
      return comicText(language, "comic.status.draft");
    case "converted":
      return comicText(language, "comic.status.converted");
    case "generating":
      return comicText(language, "comic.status.generating");
    case "done":
      return comicText(language, "comic.status.done");
    case "failed":
      return comicText(language, "comic.status.failed");
    default:
      return status;
  }
}

// Character / scene / object references describe persistent subjects, so their
// reverse-engineered prompts belong in the global setting (they should appear in
// every panel). Vibe / precise references are visual-only and are not folded in.
function isGlobalPromptKind(kind: ComicReferenceKind) {
  return kind === "character" || kind === "scene" || kind === "object";
}

function referenceContextLines(project: ComicProject) {
  return project.references
    .map((ref) => {
      const parts = [
        `【${labelForKind(ref.kind)}·${ref.name}】`,
        ref.subjectHint?.trim() ? `User note: ${ref.subjectHint.trim()}` : "",
        ref.scope ? `Reverse scope: ${labelForScope(ref.scope)}` : "",
        ref.reversePrompt?.trim()
          ? `Reverse result: ${ref.reversePrompt.trim()}`
          : "",
      ].filter(Boolean);
      return parts.join(" ");
    })
    .filter(Boolean);
}

function updatePanel(
  project: ComicProject,
  panelId: string,
  updater: (panel: ComicPanel) => ComicPanel,
): ComicProject {
  return {
    ...project,
    panels: project.panels.map((panel) =>
      panel.id === panelId ? updater(panel) : panel,
    ),
  };
}

function updateReference(
  project: ComicProject,
  refId: string,
  updater: (ref: ComicReferenceAsset) => ComicReferenceAsset,
): ComicProject {
  return {
    ...project,
    references: project.references.map((ref) =>
      ref.id === refId ? updater(ref) : ref,
    ),
  };
}

type QueueState = {
  total: number;
  done: number;
  current: number;
  paused: boolean;
} | null;
type PanelOutput = {
  ok: boolean;
  historyItemId?: string;
  outputPath?: string;
  outputUrl?: string;
  failureKind?: GenerateFailureKind;
  message?: string;
};

export function ToolsHub() {
  const language = useAppStore((state) => state.settings?.language);
  const text = useMemo(() => getToolsHubText(language), [language]);
  const [activeTool, setActiveTool] = useState<
    "hub" | "comic" | "redraw" | "tuiwen"
  >("hub");
  if (activeTool === "comic")
    return <ComicGenerator onBack={() => setActiveTool("hub")} />;
  if (activeTool === "redraw")
    return <BatchRedraw onBack={() => setActiveTool("hub")} />;
  if (activeTool === "tuiwen")
    return <NovelTuiwenStudio onBack={() => setActiveTool("hub")} />;

  return (
    <main className="tools-hub">
      <section className="tools-hero">
        <div>
          <span className="eyebrow">{text.eyebrow}</span>
          <h2>{text.title}</h2>
          <p>{text.subtitle}</p>
        </div>
      </section>
      <section className="tool-card-grid">
        <button
          type="button"
          className="tool-card ready"
          onClick={() => setActiveTool("comic")}
        >
          <b>{text.comicTitle}</b>
          <span>{text.comicDesc}</span>
          <small>{text.ready}</small>
        </button>
        <button
          type="button"
          className="tool-card ready"
          onClick={() => setActiveTool("redraw")}
        >
          <b>{text.batchTitle}</b>
          <span>{text.batchDesc}</span>
          <small>{text.ready}</small>
        </button>
        <button
          type="button"
          className="tool-card ready"
          onClick={() => setActiveTool("tuiwen")}
        >
          <b>{text.tuiwenTitle}</b>
          <span>{text.tuiwenDesc}</span>
          <small>{text.foundation}</small>
        </button>
      </section>
    </main>
  );
}

// ── 批量图生图 (batch img2img) ────────────────────────────────────────────────
// The whole project lives in the store (state.batchRedraw) so switching tools or
// tabs never loses imported images / prompts / params / references. 导出/导入项目
// give durable file-based save-restore (localStorage would overflow on many imgs).

const LEGACY_BATCH_GROUP_NAME = "批量图生图";

function useBatchLocale() {
  const language = useAppStore((state) => state.settings?.language);
  return {
    language,
    t: (key: string) => desktopUiText(language, key),
    f: (key: string, values: Record<string, unknown>) =>
      desktopUiFormat(language, key, values),
  };
}

function localizedBatchGroupName(name: string, t: (key: string) => string) {
  const trimmed = name.trim();
  return trimmed === LEGACY_BATCH_GROUP_NAME
    ? t("batch.projectDefaultName")
    : trimmed;
}

function batchItemParams(
  project: BatchRedrawProject,
  item: BatchRedrawItem,
): GenerateParams {
  const base = item.overrideParams
    ? { ...project.globalParams, ...item.params }
    : project.globalParams;
  const positive = [project.globalStyle.trim(), item.prompt.trim()]
    .filter(Boolean)
    .join(", ");
  return {
    ...base,
    positivePrompt: positive,
    negativePrompt: project.globalNegative.trim() || base.negativePrompt,
    fileNamePrefix: item.name,
  };
}

function normalizeBatchItem(
  raw: Partial<BatchRedrawItem>,
  index: number,
): BatchRedrawItem {
  return {
    id: raw.id ?? uid(),
    name: String(raw.name ?? `image_${index + 1}`),
    base64: String(raw.base64 ?? ""),
    prompt: String(raw.prompt ?? ""),
    strength: raw.strength == null ? null : Number(raw.strength),
    overrideParams: Boolean(raw.overrideParams),
    params: raw.params ?? {},
    status: raw.status === "done" ? "done" : "pending",
    resultUrl: raw.resultUrl,
    resultPath: raw.resultPath,
    historyItemId: raw.historyItemId,
  };
}

function normalizeBatchProject(
  parsed: unknown,
  fallback: BatchRedrawProject,
): BatchRedrawProject {
  if (!parsed || typeof parsed !== "object") return fallback;
  const p = parsed as Partial<BatchRedrawProject>;
  return {
    ...fallback,
    ...p,
    globalParams: { ...fallback.globalParams, ...(p.globalParams ?? {}) },
    items: Array.isArray(p.items)
      ? p.items
          .map((it, i) => normalizeBatchItem(it, i))
          .filter((it) => it.base64)
      : [],
    preciseReferences: Array.isArray(p.preciseReferences)
      ? p.preciseReferences
      : [],
    vibeImages: Array.isArray(p.vibeImages) ? p.vibeImages : [],
    seededFromMain: true,
  };
}

function BatchStatusBadge({ status }: { status: BatchRedrawItem["status"] }) {
  const { t } = useBatchLocale();
  if (status === "done")
    return <span className="redraw-badge done">{t("batch.status.done")}</span>;
  if (status === "generating")
    return (
      <span className="redraw-badge run">{t("batch.status.generating")}</span>
    );
  if (status === "failed")
    return (
      <span className="redraw-badge fail">{t("batch.status.failed")}</span>
    );
  return null;
}

// Reusable parameter editor — drives both the global params and per-image overrides.
function BatchParamFields({
  value,
  onPatch,
}: {
  value: GenerateParams;
  onPatch: (patch: Partial<GenerateParams>) => void;
}) {
  const { language, t } = useBatchLocale();
  const SIZE_PRESETS = [
    { label: t("batch.size.portrait"), w: 832, h: 1216 },
    { label: t("batch.size.square"), w: 1024, h: 1024 },
    { label: t("batch.size.landscape"), w: 1216, h: 832 },
    { label: t("batch.size.tall"), w: 1024, h: 1536 },
    { label: t("batch.size.wide"), w: 1536, h: 1024 },
    { label: t("batch.size.largeSquare"), w: 1472, h: 1472 },
  ];
  return (
    <div className="batch-params">
      <div className="batch-size-presets">
        {SIZE_PRESETS.map((s) => (
          <button
            type="button"
            key={s.label}
            className={clsx(
              "batch-chip",
              value.width === s.w && value.height === s.h && "active",
            )}
            onClick={() => onPatch({ width: s.w, height: s.h })}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="comic-panel-param-controls">
        <label className="comic-field">
          <span>{t("batch.param.model")}</span>
          <select
            value={value.model}
            onChange={(e) => onPatch({ model: e.target.value as NAIModel })}
          >
            {NAI_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {localizedDesktopOptionLabel(language, m.value, m.label)}
              </option>
            ))}
          </select>
        </label>
        <label className="comic-field">
          <span>{t("batch.param.sampler")}</span>
          <select
            value={value.sampler}
            onChange={(e) => onPatch({ sampler: e.target.value as NAISampler })}
          >
            {NAI_SAMPLERS.map((s) => (
              <option key={s.value} value={s.value}>
                {localizedDesktopOptionLabel(language, s.value, s.label)}
              </option>
            ))}
          </select>
        </label>
        <NumberInput
          label={t("batch.param.width")}
          value={value.width}
          min={64}
          max={1600}
          step={64}
          onChange={(v) => onPatch({ width: v })}
        />
        <NumberInput
          label={t("batch.param.height")}
          value={value.height}
          min={64}
          max={1600}
          step={64}
          onChange={(v) => onPatch({ height: v })}
        />
        <NumberInput
          label={t("batch.param.steps")}
          value={value.steps}
          min={1}
          max={50}
          onChange={(v) => onPatch({ steps: v })}
        />
        <NumberInput
          label={t("batch.param.cfg")}
          value={value.cfgScale}
          min={1}
          max={10}
          step={0.1}
          onChange={(v) => onPatch({ cfgScale: v })}
        />
        <NumberInput
          label="CFG Rescale"
          value={value.cfgRescale}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onPatch({ cfgRescale: v })}
        />
        <label className="comic-field">
          <span>{t("batch.param.noiseSchedule")}</span>
          <select
            value={value.noiseSchedule}
            onChange={(e) => onPatch({ noiseSchedule: e.target.value })}
          >
            <option value="native">
              {localizedDesktopOptionLabel(language, "native", "Native")}
            </option>
            <option value="karras">
              {localizedDesktopOptionLabel(language, "karras", "Karras")}
            </option>
            <option value="exponential">
              {localizedDesktopOptionLabel(
                language,
                "exponential",
                "Exponential",
              )}
            </option>
          </select>
        </label>
        <NumberInput
          label={t("batch.param.seed")}
          value={value.seed}
          min={0}
          max={4294967295}
          onChange={(v) =>
            onPatch({ seed: v, seedMode: v > 0 ? "fixed" : "random" })
          }
        />
        <label className="comic-field">
          <span>{t("batch.param.ucPreset")}</span>
          <select
            value={value.ucPreset}
            onChange={(e) =>
              onPatch({ ucPreset: Number(e.target.value) as UcPreset })
            }
          >
            {NAI_UC_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {localizedDesktopOptionLabel(language, p.value, p.label)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="comic-panel-param-toggles">
        <Toggle
          checked={value.qualityToggle}
          onChange={(v) => onPatch({ qualityToggle: v })}
          label="Quality Tags"
          description={t("batch.param.qualityDesc")}
        />
        <Toggle
          checked={value.variety}
          onChange={(v) => onPatch({ variety: v })}
          label="Variety+"
          description={t("batch.param.varietyDesc")}
        />
        <Toggle
          checked={value.smea}
          onChange={(v) => onPatch({ smea: v })}
          label="SMEA"
          description={t("batch.param.smeaDesc")}
        />
        <Toggle
          checked={value.smeaDyn}
          onChange={(v) => onPatch({ smeaDyn: v })}
          label="SMEA Dyn"
          description={t("batch.param.smeaDynDesc")}
        />
      </div>
    </div>
  );
}

function BatchPrecisePicker({
  refs,
  onChange,
}: {
  refs: PreciseReferenceItem[];
  onChange: (next: PreciseReferenceItem[]) => void;
}) {
  const { t } = useBatchLocale();
  async function add(files: FileList | null) {
    if (!files) return;
    const next = [...refs];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      next.push({
        base64: await toBase64(f),
        type: "character",
        strength: 1,
        fidelity: 1,
        informationExtracted: 1,
      });
    }
    onChange(next);
  }
  return (
    <div className="batch-ref-block">
      <div className="batch-ref-head">
        <span>{t("batch.ref.preciseTitle")}</span>
        <label className="btn btn-secondary btn-sm">
          {t("batch.ref.add")}
          <input
            type="file"
            hidden
            multiple
            accept="image/*"
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {refs.length === 0 ? (
        <p className="settings-hint" style={{ margin: 0 }}>
          {t("batch.ref.preciseEmpty")}
        </p>
      ) : (
        <div className="batch-ref-list">
          {refs.map((r, i) => (
            <div className="batch-ref-row" key={i}>
              <img src={dataUrlFromBase64(r.base64)} alt={`precise-${i}`} />
              <select
                value={r.type}
                onChange={(e) =>
                  onChange(
                    refs.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            type: e.target
                              .value as PreciseReferenceItem["type"],
                          }
                        : x,
                    ),
                  )
                }
              >
                <option value="character">
                  {t("reference.type.character")}
                </option>
                <option value="style">{t("batch.ref.style")}</option>
                <option value="character&style">
                  {t("batch.ref.characterStyle")}
                </option>
              </select>
              <label>
                {t("batch.ref.strength")}
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={r.strength}
                  onChange={(e) =>
                    onChange(
                      refs.map((x, j) =>
                        j === i
                          ? { ...x, strength: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                {t("batch.ref.fidelity")}
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={r.fidelity}
                  onChange={(e) =>
                    onChange(
                      refs.map((x, j) =>
                        j === i
                          ? { ...x, fidelity: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <button
                className="vibe-remove"
                onClick={() => onChange(refs.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BatchVibePicker({
  vibes,
  onChange,
}: {
  vibes: VibeTransferItem[];
  onChange: (next: VibeTransferItem[]) => void;
}) {
  const { t } = useBatchLocale();
  async function add(files: FileList | null) {
    if (!files) return;
    const next = [...vibes];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      next.push({ base64: await toBase64(f), infoExtracted: 1, strength: 0.6 });
    }
    onChange(next);
  }
  return (
    <div className="batch-ref-block">
      <div className="batch-ref-head">
        <span>{t("batch.ref.vibeTitle")}</span>
        <label className="btn btn-secondary btn-sm">
          {t("batch.ref.add")}
          <input
            type="file"
            hidden
            multiple
            accept="image/*"
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {vibes.length === 0 ? (
        <p className="settings-hint" style={{ margin: 0 }}>
          {t("batch.ref.vibeEmpty")}
        </p>
      ) : (
        <div className="batch-ref-list">
          {vibes.map((v, i) => (
            <div className="batch-ref-row" key={i}>
              <img src={dataUrlFromBase64(v.base64)} alt={`vibe-${i}`} />
              <label>
                {t("batch.ref.info")}
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={v.infoExtracted}
                  onChange={(e) =>
                    onChange(
                      vibes.map((x, j) =>
                        j === i
                          ? { ...x, infoExtracted: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                {t("batch.ref.strength")}
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={v.strength}
                  onChange={(e) =>
                    onChange(
                      vibes.map((x, j) =>
                        j === i
                          ? { ...x, strength: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <button
                className="vibe-remove"
                onClick={() => onChange(vibes.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BatchRedraw({ onBack }: { onBack?: () => void }) {
  const params = useAppStore((state) => state.params);
  const project = useAppStore((state) => state.batchRedraw);
  const setBatchRedraw = useAppStore((state) => state.setBatchRedraw);
  const resetBatchRedraw = useAppStore((state) => state.resetBatchRedraw);
  const running = useAppStore((state) => state.batchRunning);
  const progress = useAppStore((state) => state.batchProgress);
  const setBatchRunning = useAppStore((state) => state.setBatchRunning);
  const setToast = useAppStore((state) => state.setToast);
  const refreshHistory = useAppStore((state) => state.refreshHistory);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const { t, f } = useBatchLocale();

  const [aiFilling, setAiFilling] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState<
    "all" | "done" | "failed" | "pending"
  >("all");
  const cancelRef = useRef(false);

  const { items, globalStrength, step } = project;
  const globalParams = project.globalParams;
  const readyCount = items.filter((it) => it.prompt.trim()).length;
  const doneCount = items.filter((it) => it.status === "done").length;
  const failedCount = items.filter((it) => it.status === "failed").length;
  const failedReady = items.filter(
    (it) => it.status === "failed" && it.prompt.trim(),
  ).length;
  const generatingCount = items.filter(
    (it) => it.status === "generating",
  ).length;
  const pendingReady = items.filter(
    (it) => it.status !== "done" && it.prompt.trim(),
  ).length;
  const pendingCount = items.filter(
    (it) => it.status !== "done" && it.status !== "failed",
  ).length;
  const displayGroupName = localizedBatchGroupName(project.groupName, t);
  const progressDone = progress?.done ?? doneCount;
  const progressTotal = progress?.total ?? readyCount;
  const progressPercent =
    progressTotal > 0
      ? Math.min(100, Math.round((progressDone / progressTotal) * 100))
      : 0;
  const visibleGenerationItems = useMemo(
    () =>
      items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => {
          if (resultFilter === "done") return item.status === "done";
          if (resultFilter === "failed") return item.status === "failed";
          if (resultFilter === "pending")
            return item.status !== "done" && item.status !== "failed";
          return true;
        }),
    [items, resultFilter],
  );
  // Master-detail editing in the prompts step (like the comic generator): the
  // left sidebar selects an image, the editor on the right edits that one.
  // Falls back to the first image when nothing (or a removed item) is selected.
  const activeItem =
    items.find((it) => it.id === activeItemId) ?? items[0] ?? null;
  const activeItemIndex = activeItem
    ? items.findIndex((it) => it.id === activeItem.id)
    : -1;
  const batchStatusLabel = (it: BatchRedrawItem) =>
    it.status === "done"
      ? t("batch.status.done")
      : it.status === "generating"
        ? t("batch.status.generating")
        : it.status === "failed"
          ? t("batch.status.failed")
          : it.prompt.trim()
            ? t("batch.status.prompted")
            : t("batch.status.pending");

  // Seed global style / negative / params from the main 生成 screen the first time
  // the tool is opened with an empty project ("默认为生成中锁定的，可自行修改").
  useEffect(() => {
    if (project.seededFromMain || project.items.length > 0) return;
    setBatchRedraw((prev) => ({
      ...prev,
      globalParams: { ...params, fileNamePrefix: "" },
      globalStyle: params.stylePrompt,
      globalNegative: params.negativePrompt,
      seededFromMain: true,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(p: Partial<BatchRedrawProject>) {
    setBatchRedraw((prev) => ({ ...prev, ...p }));
  }
  function setStep(next: BatchRedrawProject["step"]) {
    patch({ step: next });
  }
  function patchItem(id: string, p: Partial<BatchRedrawItem>) {
    setBatchRedraw((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, ...p } : it)),
    }));
  }
  function syncFromMain() {
    patch({
      globalParams: { ...params, fileNamePrefix: "" },
      globalStyle: params.stylePrompt,
      globalNegative: params.negativePrompt,
      seededFromMain: true,
    });
    setToast(t("batch.toast.synced"));
  }

  async function importImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    arr.sort((a, b) =>
      a.name.localeCompare(b.name, "zh-CN", { numeric: true }),
    );
    const next: BatchRedrawItem[] = [];
    for (const f of arr) {
      next.push({
        id: uid(),
        name: f.name.replace(/\.[^.]+$/, ""),
        base64: await toBase64(f),
        prompt: "",
        strength: null,
        overrideParams: false,
        params: {},
        status: "pending",
      });
    }
    setBatchRedraw((prev) => ({ ...prev, items: [...prev.items, ...next] }));
    setToast(f("batch.toast.importedImages", { count: next.length }));
  }

  function assignPromptLines(lines: string[]): number {
    const clean = lines.map((l) => l.trim()).filter(Boolean);
    let n = 0;
    setBatchRedraw((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => {
        if (clean[i] == null) return it;
        n += 1;
        return { ...it, prompt: clean[i] };
      }),
    }));
    return Math.min(clean.length, items.length);
  }

  async function importPromptsFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    const n = assignPromptLines(text.split(/\r?\n/));
    setToast(f("batch.toast.importedPrompts", { count: n }));
  }

  function importBulkPrompts() {
    if (!project.promptBulk.trim()) {
      setToast(t("batch.toast.needPromptBulk"));
      return;
    }
    if (items.length === 0) {
      setToast(t("batch.toast.needImages"));
      return;
    }
    const n = assignPromptLines(project.promptBulk.split(/\r?\n/));
    setToast(f("batch.toast.importedPrompts", { count: n }));
  }

  async function aiFill() {
    if (aiFilling || running) return;
    const targets = useAppStore
      .getState()
      .batchRedraw.items.filter((it) => !it.prompt.trim());
    if (targets.length === 0) {
      setToast(t("batch.toast.allPrompted"));
      return;
    }
    setAiFilling(true);
    cancelRef.current = false;
    const mode = useAppStore.getState().batchRedraw.aiMode;
    try {
      for (const it of targets) {
        if (cancelRef.current) break;
        const res = await window.naiDesktop.reversePrompt(it.base64, mode);
        if (res.ok && res.prompt)
          patchItem(it.id, { prompt: res.prompt.trim() });
      }
      setToast(t("batch.toast.aiDone"));
    } catch (error) {
      setToast(
        f("batch.toast.aiFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setAiFilling(false);
    }
  }

  // Run img2img serially over the given items. Regenerating an item first deletes
  // its previous output (磁盘 + 历史记录) so 重试 never leaves the old image behind.
  async function runTargets(targets: BatchRedrawItem[]) {
    // Read the live store flag, not the captured `running` closure: a fast
    // double-click would otherwise start a second concurrent run, and because
    // each redrawImage call aborts the previous in-flight request, the two runs
    // cancel each other → every panel "fails". The store flag is set
    // synchronously below before the first await, so this guard is race-free.
    if (useAppStore.getState().batchRunning) return;
    const proj = useAppStore.getState().batchRedraw;
    if (!proj.groupName.trim()) {
      setToast(t("batch.toast.needGroup"));
      setStep("import");
      return;
    }
    const runGroupName = localizedBatchGroupName(proj.groupName, t);
    const ready = targets.filter((it) => it.prompt.trim());
    if (ready.length === 0) {
      setToast(t("batch.toast.noReady"));
      return;
    }
    cancelRef.current = false;
    setBatchRunning(true, { done: 0, total: ready.length });

    let done = 0;
    let failed = 0;
    let lastError = "";
    // Everything below runs inside try/finally: a throw anywhere (IPC, network,
    // history/account refresh) must never leave the UI stuck in "running" with
    // every button disabled — finally always clears the running flag.
    try {
      try {
        await window.naiDesktop.createHistoryGroup(runGroupName);
      } catch {
        /* group ensured by the main process anyway */
      }

      const extras = {
        vibeImages: proj.vibeImages,
        charCaptions: [],
        preciseReferences: proj.preciseReferences,
      };

      for (const it of ready) {
        if (cancelRef.current) break;
        if (it.historyItemId) {
          try {
            await window.naiDesktop.deleteHistory(it.historyItemId);
          } catch {
            /* previous output already gone */
          }
        }
        patchItem(it.id, {
          status: "generating",
          error: undefined,
          resultUrl: undefined,
          resultPath: undefined,
          historyItemId: undefined,
        });
        const res = await window.naiDesktop.redrawImage({
          imageBase64: it.base64,
          params: batchItemParams(proj, it),
          strength: it.strength ?? proj.globalStrength,
          extras,
          groupName: runGroupName,
          fileNamePrefix: it.name,
        });
        const out = res.ok ? res.items[0] : undefined;
        if (res.ok && out) {
          patchItem(it.id, {
            status: "done",
            resultUrl: out.fileUrl,
            resultPath: out.filePath,
            historyItemId: out.id,
            error: undefined,
          });
          done += 1;
        } else {
          patchItem(it.id, { status: "failed", error: res.message });
          failed += 1;
          lastError = res.message;
        }
        setBatchRunning(true, { done: done + failed, total: ready.length });
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      failed = Math.max(failed, ready.length - done);
    } finally {
      try {
        await refreshHistory();
      } catch {
        /* keep going — never strand the running flag */
      }
      try {
        await refreshAccount();
      } catch {
        /* ignore */
      }
      setBatchRunning(false, null);
    }
    setToast(
      cancelRef.current
        ? f("batch.toast.stopped", { done })
        : failed > 0
          ? f("batch.toast.failed", { done, failed, message: lastError })
          : f("batch.toast.allDone", { done, name: runGroupName }),
    );
  }

  function stop() {
    cancelRef.current = true;
    void window.naiDesktop.cancel();
  }

  async function exportZip() {
    const name = localizedBatchGroupName(project.groupName, t);
    if (!name) {
      setToast(t("batch.toast.needGroup"));
      return;
    }
    const doneFiles: BatchExportFile[] = useAppStore
      .getState()
      .batchRedraw.items.filter((it) => it.status === "done" && it.resultPath)
      .map((it, index) => ({
        filePath: it.resultPath!,
        name: `${String(index + 1).padStart(3, "0")}_${it.name}`,
      }));
    if (doneFiles.length === 0) {
      setToast(t("batch.toast.needGenerated"));
      return;
    }
    const res = await window.naiDesktop.exportFiles(
      doneFiles,
      f("batch.exportDefault", { name }),
    );
    setToast(
      res.ok
        ? f("batch.toast.zipDone", {
            path: res.path ?? t("batch.toast.zipDoneFallback"),
          })
        : res.message,
    );
  }

  function exportProject() {
    const data = JSON.stringify(useAppStore.getState().batchRedraw, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${displayGroupName || t("batch.projectDefaultName")}.batch.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast(t("batch.toast.projectExported"));
  }

  async function importProject(file: File | null) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const next = normalizeBatchProject(
        parsed,
        createDefaultBatchRedraw(params),
      );
      setBatchRedraw(() => next);
      setToast(f("batch.toast.projectImported", { count: next.items.length }));
    } catch (error) {
      setToast(
        f("batch.toast.importFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  function clearProject() {
    if (running) return;
    resetBatchRedraw();
    setToast(t("batch.toast.cleared"));
  }

  return (
    <main className="comic-generator redraw-wizard">
      <div className="comic-page-title redraw-page-title">
        <div>
          <span className="eyebrow">{t("batch.titleEyebrow")}</span>
          <strong>{displayGroupName || t("batch.unnamedTask")}</strong>
        </div>
        <div className="redraw-page-metrics" aria-label={t("batch.titleEyebrow")}>
          <span>
            <b>{items.length}</b>
            {t("batch.metric.images")}
          </span>
          <span>
            <b>{readyCount}</b>
            {t("batch.metric.prompted")}
          </span>
          <span>
            <b>{doneCount}</b>
            {t("batch.metric.generated")}
          </span>
          <span>
            <b>{globalStrength.toFixed(2)}</b>
            {t("batch.metric.strength")}
          </span>
        </div>
      </div>

      <nav className="comic-steps" aria-label={t("batch.titleEyebrow")}>
        {REDRAW_STEPS.map((meta, index) => (
          <button
            type="button"
            key={meta.key}
            className={clsx("comic-step-btn", step === meta.key && "active")}
            onClick={() => setStep(meta.key)}
            disabled={running && meta.key !== "generate"}
            aria-current={step === meta.key ? "step" : undefined}
          >
            <b>{index + 1}</b>
            <span>{t(meta.labelKey)}</span>
            <small>{t(meta.hintKey)}</small>
          </button>
        ))}
      </nav>

      <div className="comic-step-actions redraw-header-actions">
        {onBack ? (
          <Button onClick={onBack} variant="ghost">
            {t("batch.back")}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          onClick={exportProject}
          disabled={items.length === 0}
        >
          {t("batch.import.exportProject")}
        </Button>
        <label className="btn btn-secondary redraw-file-btn">
          {t("batch.import.importProject")}
          <input
            type="file"
            hidden
            accept=".json,application/json"
            onChange={(e) => {
              void importProject(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
        <Button
          variant="ghost"
          onClick={clearProject}
          disabled={running || items.length === 0}
        >
          {t("batch.import.clear")}
        </Button>
      </div>

      {step === "import" && (
        <section className="redraw-card redraw-import-stage">
          <label className="field">
            <span>{t("batch.import.groupName")}</span>
            <input
              value={displayGroupName}
              onChange={(e) => patch({ groupName: e.target.value })}
              placeholder={t("batch.import.groupPlaceholder")}
            />
          </label>
          <div className="redraw-import-hero">
            <label className="redraw-dropzone">
              <span>＋</span>
              <strong>{t("batch.import.imagesTitle")}</strong>
              <small>{t("batch.import.imagesDesc")}</small>
              <input
                type="file"
                hidden
                multiple
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  void importImages(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="redraw-import-side">
              <strong>{t("batch.import.projectTitle")}</strong>
              <small>{t("batch.import.projectDesc")}</small>
              <div className="redraw-actions">
                <Button
                  variant="secondary"
                  onClick={exportProject}
                  disabled={items.length === 0}
                >
                  {t("batch.import.exportProject")}
                </Button>
                <label className="btn btn-secondary redraw-file-btn">
                  {t("batch.import.importProject")}
                  <input
                    type="file"
                    hidden
                    accept=".json,application/json"
                    onChange={(e) => {
                      void importProject(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
                <Button
                  variant="ghost"
                  onClick={clearProject}
                  disabled={running || items.length === 0}
                >
                  {t("batch.import.clear")}
                </Button>
              </div>
            </div>
          </div>
          <p className="settings-hint" style={{ margin: 0 }}>
            {t("batch.import.hint")}
          </p>
          <div className="redraw-grid">
            {items.length === 0 && (
              <div className="redraw-empty-state">
                <b>{t("batch.import.emptyTitle")}</b>
                <span>{t("batch.import.emptyHint")}</span>
              </div>
            )}
            {items.map((it, idx) => (
              <div className="redraw-thumb-card" key={it.id}>
                <img
                  src={dataUrlFromBase64(it.base64)}
                  alt={it.name}
                  loading="lazy"
                  decoding="async"
                  title={t("batch.import.thumbTitle")}
                  onDoubleClick={() =>
                    setLightbox(dataUrlFromBase64(it.base64))
                  }
                />
                <span className="redraw-thumb-name" title={it.name}>
                  #{idx + 1} {it.name}
                </span>
                <button
                  className="vibe-remove"
                  title={t("batch.import.remove")}
                  onClick={() =>
                    setBatchRedraw((prev) => ({
                      ...prev,
                      items: prev.items.filter((p) => p.id !== it.id),
                    }))
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="redraw-step-footer">
            <span>
              {items.length > 0
                ? f("batch.import.footerReady", { count: items.length })
                : t("batch.import.footerEmpty")}
            </span>
            <div className="redraw-step-footer-actions">
              <Button
                variant="primary"
                onClick={() => setStep("params")}
                disabled={items.length === 0}
              >
                {t("batch.next.params")}
              </Button>
            </div>
          </div>
        </section>
      )}

      {step === "params" && (
        <section className="redraw-card redraw-globals redraw-params-stage">
          <div className="redraw-globals-head">
            <strong>{t("batch.params.title")}</strong>
            <Button variant="ghost" onClick={syncFromMain}>
              {t("batch.params.sync")}
            </Button>
          </div>
          <label className="field">
            <span>
              {f("batch.params.strength", { value: globalStrength.toFixed(2) })}
            </span>
            <input
              type="range"
              min={0.1}
              max={0.99}
              step={0.01}
              value={globalStrength}
              onChange={(e) =>
                patch({ globalStrength: Number(e.target.value) })
              }
            />
          </label>
          <div className="redraw-global-prompts">
            <label className="field">
              <span>{t("batch.params.style")}</span>
              <textarea
                className="redraw-global-text"
                value={project.globalStyle}
                onChange={(e) => patch({ globalStyle: e.target.value })}
                placeholder={t("batch.params.stylePlaceholder")}
              />
            </label>
            <label className="field">
              <span>{t("batch.params.negative")}</span>
              <textarea
                className="redraw-global-text"
                value={project.globalNegative}
                onChange={(e) => patch({ globalNegative: e.target.value })}
                placeholder={t("batch.params.negativePlaceholder")}
              />
            </label>
          </div>
          <BatchParamFields
            value={globalParams}
            onPatch={(p) => patch({ globalParams: { ...globalParams, ...p } })}
          />
          <BatchPrecisePicker
            refs={project.preciseReferences}
            onChange={(next) => patch({ preciseReferences: next })}
          />
          <BatchVibePicker
            vibes={project.vibeImages}
            onChange={(next) => patch({ vibeImages: next })}
          />
          <div className="redraw-step-footer">
            <span>{t("batch.params.footer")}</span>
            <div className="redraw-step-footer-actions">
              <Button variant="ghost" onClick={() => setStep("import")}>
                {t("batch.prev.import")}
              </Button>
              <Button
                variant="primary"
                onClick={() => setStep("prompts")}
                disabled={items.length === 0}
              >
                {t("batch.next.prompts")}
              </Button>
            </div>
          </div>
        </section>
      )}

      {step === "prompts" && (
        <section className="redraw-card redraw-prompts-stage">
          <label className="field">
            <span>{t("batch.prompts.bulkLabel")}</span>
            <textarea
              className="redraw-bulk"
              value={project.promptBulk}
              placeholder={t("batch.prompts.bulkPlaceholder")}
              onChange={(e) => patch({ promptBulk: e.target.value })}
            />
          </label>
          <div className="redraw-actions">
            <Button
              variant="primary"
              onClick={importBulkPrompts}
              disabled={running || items.length === 0}
            >
              {t("batch.prompts.importText")}
            </Button>
            <label className="btn btn-secondary redraw-file-btn">
              {t("batch.prompts.importTxt")}
              <input
                type="file"
                hidden
                accept=".txt,text/plain"
                onChange={(e) => {
                  void importPromptsFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="redraw-ai-mode">
              {t("batch.prompts.reverseMode")}
              <select
                value={project.aiMode}
                onChange={(e) =>
                  patch({ aiMode: e.target.value as ReversePromptMode })
                }
              >
                <option value="tags">{t("mode.tags")}</option>
                <option value="natural">{t("mode.natural")}</option>
                <option value="mixed">{t("mode.mixed")}</option>
              </select>
            </span>
            <Button
              variant="secondary"
              onClick={() => void aiFill()}
              disabled={aiFilling || running || items.length === 0}
            >
              {aiFilling
                ? t("batch.prompts.aiRunning")
                : t("batch.prompts.aiFill")}
            </Button>
          </div>
          <p className="settings-hint" style={{ margin: 0 }}>
            {t("batch.prompts.hint")}
          </p>
          {items.length === 0 ? (
            <p className="vibe-empty">{t("batch.prompts.importFirst")}</p>
          ) : activeItem ? (
            <div className="comic-panel-workspace">
              <aside className="comic-panel-sidebar">
                {items.map((it, idx) => (
                  <button
                    key={it.id}
                    type="button"
                    className={clsx(
                      "comic-panel-nav-item",
                      activeItem.id === it.id && "active",
                      it.status === "done" && "selected",
                    )}
                    onClick={() => setActiveItemId(it.id)}
                    title={it.name}
                  >
                    <span>#{idx + 1}</span>
                    <small>{batchStatusLabel(it)}</small>
                  </button>
                ))}
              </aside>
              <article className="comic-panel-editor">
                <header>
                  <strong>
                    #{activeItemIndex + 1} · {activeItem.name}
                  </strong>
                  <span className={clsx("comic-status", activeItem.status)}>
                    {batchStatusLabel(activeItem)}
                  </span>
                  <div className="comic-actions">
                    <Button
                      variant="primary"
                      onClick={() => void runTargets([activeItem])}
                      disabled={running || !activeItem.prompt.trim()}
                    >
                      {activeItem.status === "done"
                        ? t("batch.prompts.regenerate")
                        : activeItem.status === "failed"
                          ? t("batch.prompts.retry")
                          : t("batch.prompts.generateOne")}
                    </Button>
                  </div>
                </header>
                <div className="comic-panel-editor-body">
                  {activeItem.error ? (
                    <div className="comic-panel-error">{activeItem.error}</div>
                  ) : null}
                  <div
                    className="comic-panel-result"
                    title={t("batch.import.thumbTitle")}
                    onDoubleClick={() =>
                      setLightbox(
                        activeItem.resultUrl ||
                          dataUrlFromBase64(activeItem.base64),
                      )
                    }
                  >
                    <img
                      src={
                        activeItem.resultUrl ||
                        dataUrlFromBase64(activeItem.base64)
                      }
                      alt={activeItem.name}
                      loading="lazy"
                      decoding="async"
                      draggable={Boolean(activeItem.resultUrl)}
                      title={
                        activeItem.resultUrl
                          ? t("batch.prompts.dragOutput")
                          : t("batch.import.thumbTitle")
                      }
                      onDragStart={(e) => {
                        if (!activeItem.resultUrl) return;
                        e.preventDefault();
                        window.naiDesktop.startImageDrag(activeItem.resultUrl);
                      }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          dataUrlFromBase64(activeItem.base64);
                      }}
                    />
                    <div>
                      <strong>
                        {activeItem.resultUrl
                          ? t("batch.prompts.currentOutput")
                          : t("batch.prompts.sourceImage")}
                      </strong>
                      <span>
                        {activeItem.resultUrl
                          ? t("batch.prompts.outputHint")
                          : t("batch.prompts.sourceHint")}
                      </span>
                    </div>
                  </div>
                  <label className="comic-field">
                    <span>{t("batch.prompts.itemPrompt")}</span>
                    <textarea
                      style={{ minHeight: 120 }}
                      value={activeItem.prompt}
                      placeholder={t("batch.prompts.itemPromptPlaceholder")}
                      onChange={(e) =>
                        patchItem(activeItem.id, { prompt: e.target.value })
                      }
                    />
                  </label>
                  <div className="comic-panel-negative-row">
                    <label className="comic-field">
                      <span>
                        {f("batch.prompts.itemStrength", {
                          value: globalStrength.toFixed(2),
                        })}
                      </span>
                      <input
                        type="number"
                        min={0.1}
                        max={0.99}
                        step={0.01}
                        value={activeItem.strength ?? ""}
                        placeholder={globalStrength.toFixed(2)}
                        onChange={(e) =>
                          patchItem(activeItem.id, {
                            strength:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <div className="comic-field">
                      <span>{t("batch.prompts.advanced")}</span>
                      <label className="redraw-override-toggle">
                        <input
                          type="checkbox"
                          checked={activeItem.overrideParams}
                          onChange={(e) =>
                            patchItem(activeItem.id, {
                              overrideParams: e.target.checked,
                              params:
                                e.target.checked &&
                                Object.keys(activeItem.params).length === 0
                                  ? { ...globalParams }
                                  : activeItem.params,
                            })
                          }
                        />
                        {t("batch.prompts.override")}
                      </label>
                    </div>
                  </div>
                  {activeItem.overrideParams && (
                    <BatchParamFields
                      value={{ ...globalParams, ...activeItem.params }}
                      onPatch={(p) =>
                        patchItem(activeItem.id, {
                          params: { ...activeItem.params, ...p },
                        })
                      }
                    />
                  )}
                </div>
              </article>
            </div>
          ) : null}
          <div className="redraw-step-footer">
            <span>
              {readyCount > 0
                ? f("batch.prompts.footerReady", {
                    ready: readyCount,
                    total: items.length,
                  })
                : t("batch.prompts.footerEmpty")}
            </span>
            <div className="redraw-step-footer-actions">
              <Button variant="ghost" onClick={() => setStep("params")}>
                {t("batch.prev.params")}
              </Button>
              <Button
                variant="primary"
                onClick={() => setStep("generate")}
                disabled={readyCount === 0}
              >
                {t("batch.next.generate")}
              </Button>
            </div>
          </div>
        </section>
      )}

      {step === "generate" && (
        <section className="redraw-card redraw-results-stage">
          <header className="redraw-results-toolbar">
            <div className="redraw-results-overview">
              <div className="redraw-results-title-row">
                <div>
                  <span className="eyebrow">{t("batch.results.eyebrow")}</span>
                  <strong>{t("batch.results.title")}</strong>
                  <small>
                    {f("batch.results.group", {
                      name: displayGroupName || t("batch.results.unnamed"),
                    })}
                  </small>
                </div>
                <b>
                  {progressDone}
                  <i>/</i>
                  {progressTotal}
                </b>
              </div>
              <div
                className="redraw-results-progress"
                aria-label={f("batch.results.progress", {
                  percent: progressPercent,
                })}
              >
                <i style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="redraw-results-stats">
                <span className="done">
                  {t("batch.results.done")} <b>{doneCount}</b>
                </span>
                <span className="running">
                  {t("batch.results.running")} <b>{generatingCount}</b>
                </span>
                <span className="failed">
                  {t("batch.results.failed")} <b>{failedCount}</b>
                </span>
                <span>
                  {t("batch.results.pending")}{" "}
                  <b>
                    {Math.max(
                      0,
                      readyCount - doneCount - failedCount - generatingCount,
                    )}
                  </b>
                </span>
              </div>
            </div>
            <div className="redraw-results-actions">
              {running ? (
                <Button variant="danger" onClick={stop}>
                  {t("batch.results.stop")}
                </Button>
              ) : (
                <>
                  <Button
                    variant="primary"
                    onClick={() => void runTargets(items)}
                    disabled={readyCount === 0}
                  >
                    {f("batch.results.start", { count: readyCount })}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void runTargets(
                        items.filter((it) => it.status !== "done"),
                      )
                    }
                    disabled={pendingReady === 0}
                  >
                    {f("batch.results.continue", { count: pendingReady })}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() =>
                      void runTargets(
                        useAppStore
                          .getState()
                          .batchRedraw.items.filter(
                            (it) => it.status === "failed" && it.prompt.trim(),
                          ),
                      )
                    }
                    disabled={failedReady === 0}
                  >
                    {f("batch.results.retryFailed", { count: failedReady })}
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                onClick={() => setStep("params")}
                disabled={running}
              >
                {t("batch.results.editParams")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setStep("prompts")}
                disabled={running}
              >
                {t("batch.results.editPrompts")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void exportZip()}
                disabled={running || doneCount === 0}
              >
                {f("batch.results.zip", { count: doneCount })}
              </Button>
            </div>
          </header>

          <div
            className="redraw-result-filters"
            role="tablist"
            aria-label={t("batch.results.filterAria")}
          >
            {(
              [
                ["all", t("batch.results.all"), items.length],
                ["done", t("batch.results.completed"), doneCount],
                ["failed", t("batch.results.failed"), failedCount],
                ["pending", t("batch.results.pending"), pendingCount],
              ] as const
            ).map(([key, label, count]) => (
              <button
                type="button"
                role="tab"
                aria-selected={resultFilter === key}
                className={clsx(resultFilter === key && "active", key)}
                key={key}
                onClick={() => setResultFilter(key)}
              >
                {label}
                <b>{count}</b>
              </button>
            ))}
            <span>{t("batch.results.tip")}</span>
          </div>

          <div className="redraw-results-scroll">
            {items.length === 0 ? (
              <div className="redraw-results-empty">
                <b>{t("batch.results.emptyTitle")}</b>
                <span>{t("batch.results.emptyHint")}</span>
              </div>
            ) : visibleGenerationItems.length === 0 ? (
              <div className="redraw-results-empty">
                <b>{t("batch.results.filteredEmpty")}</b>
                <button type="button" onClick={() => setResultFilter("all")}>
                  {t("batch.results.viewAll")}
                </button>
              </div>
            ) : (
              <div className="redraw-results-grid">
                {visibleGenerationItems.map(({ item: it, index: idx }) => (
                  <article
                    className={clsx(
                      "redraw-result-card",
                      `status-${it.status}`,
                    )}
                    key={it.id}
                    aria-busy={it.status === "generating"}
                  >
                    <button
                      type="button"
                      className="redraw-result-preview"
                      title={t("batch.results.previewTitle")}
                      onClick={() =>
                        setLightbox(
                          it.resultUrl || dataUrlFromBase64(it.base64),
                        )
                      }
                    >
                      <img
                        src={it.resultUrl || dataUrlFromBase64(it.base64)}
                        alt={it.name}
                        loading="lazy"
                        decoding="async"
                        draggable={Boolean(it.resultUrl)}
                        onDragStart={(e) => {
                          if (!it.resultUrl) return;
                          e.preventDefault();
                          window.naiDesktop.startImageDrag(it.resultUrl);
                        }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            dataUrlFromBase64(it.base64);
                        }}
                      />
                      <span className="redraw-result-index">#{idx + 1}</span>
                      <span className="redraw-result-origin">
                        {it.resultUrl
                          ? t("batch.results.output")
                          : t("batch.results.source")}
                      </span>
                      <BatchStatusBadge status={it.status} />
                      {it.status === "generating" && (
                        <i className="redraw-result-shimmer" />
                      )}
                    </button>
                    <div className="redraw-result-body">
                      <div className="redraw-result-name">
                        <strong title={it.name}>{it.name}</strong>
                        <span>
                          {f("batch.results.cardStrength", {
                            value: (it.strength ?? globalStrength).toFixed(2),
                          })}
                        </span>
                      </div>
                      {it.error ? (
                        <p className="redraw-card-error" title={it.error}>
                          {it.error}
                        </p>
                      ) : (
                        <p className="redraw-card-prompt" title={it.prompt}>
                          {it.prompt || t("batch.results.noPrompt")}
                        </p>
                      )}
                      <div className="redraw-result-card-actions">
                        <Button
                          variant={
                            it.status === "failed" ? "danger" : "secondary"
                          }
                          onClick={() => void runTargets([it])}
                          disabled={running || !it.prompt.trim()}
                        >
                          {it.status === "done"
                            ? t("batch.prompts.regenerate")
                            : it.status === "failed"
                              ? t("batch.prompts.retry")
                              : t("batch.prompts.generateOne")}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setLightbox(
                              it.resultUrl || dataUrlFromBase64(it.base64),
                            )
                          }
                        >
                          {t("batch.results.zoom")}
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {lightbox && (
        <div
          className="redraw-lightbox"
          role="presentation"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt={t("batch.results.previewAlt")} />
          <button
            className="redraw-lightbox-close"
            onClick={() => setLightbox(null)}
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}

export function ComicGenerator({ onBack }: { onBack?: () => void }) {
  const currentParams = useAppStore((state) => state.params);
  const account = useAppStore((state) => state.account);
  const settings = useAppStore((state) => state.settings);
  const language = settings?.language;
  const refreshHistory = useAppStore((state) => state.refreshHistory);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const setToast = useAppStore((state) => state.setToast);
  const [project, setProject] = useState<ComicProject>(() =>
    readStoredProject(currentParams),
  );
  const [step, setStep] = useState<StepKey>("story");
  const [busy, setBusy] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [activePanelId, setActivePanelId] = useState("");
  const [generationLog, setGenerationLog] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [panelEditorTab, setPanelEditorTab] = useState<
    "content" | "params" | "weights"
  >("content");
  // Direct tag-prompt import: each line becomes one panel's English prompt
  // (status "converted"), skipping AI script-splitting + reverse — same idea as
  // the batch img2img bulk-prompt import.
  const [tagBulk, setTagBulk] = useState("");
  const [translatingPanel, setTranslatingPanel] = useState("");
  const [queue, setQueue] = useState<QueueState>(null);
  const [queueAnlasQuote, setQueueAnlasQuote] = useState<number | null>(null);
  const [queueQuoteError, setQueueQuoteError] = useState("");
  const [queueQuoteLoading, setQueueQuoteLoading] = useState(false);
  const [queueAnlasSpent, setQueueAnlasSpent] = useState<number | null>(null);
  const queueRef = useRef({ paused: false, cancelled: false });
  const mountedRef = useRef(true);
  const comicRootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      const wasRunning = !queueRef.current.cancelled;
      queueRef.current.cancelled = true;
      // Leaving the comic tab mid-queue must abort the in-flight paid request,
      // otherwise it keeps generating, billing, and saving in the background.
      if (wasRunning) void window.naiDesktop.cancel();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      // Reference images are stored as base64; a few large ones can blow past the
      // localStorage quota. Guard the write and fall back to persisting references
      // without their image data rather than letting the page state go unstable.
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(makeStoredComicProject(project)),
        );
      } catch {
        try {
          const slim = makeStoredComicProject({
            ...project,
            references: project.references.map((ref) => ({
              ...ref,
              base64: "",
              previewUrl: "",
            })),
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
          setToast(comicText(language, "comic.msg.referenceTooLarge"));
        } catch {
          setToast(comicText(language, "comic.msg.projectTooLarge"));
        }
      }
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [project, setToast]);

  useEffect(() => {
    comicRootRef.current?.scrollTo({ top: 0 });
  }, [step]);

  useEffect(() => {
    let cancelled = false;
    void window.naiDesktop.getHistory().then((history) => {
      if (cancelled) return;
      const byId = new Map(history.map((item) => [item.id, item]));
      const byPanel = new Map<number, (typeof history)[number]>();
      for (const item of history) {
        if (
          item.comicProjectId === project.id &&
          typeof item.comicPanelNo === "number" &&
          !byPanel.has(item.comicPanelNo)
        ) {
          byPanel.set(item.comicPanelNo, item);
        }
      }
      setProject((prev) => {
        let changed = false;
        const nextPanels = prev.panels.map((panel) => {
          const item =
            (panel.historyItemId ? byId.get(panel.historyItemId) : undefined) ??
            byPanel.get(panel.index);
          if (
            !item ||
            (panel.outputUrl === item.fileUrl &&
              panel.historyItemId === item.id)
          )
            return panel;
          changed = true;
          return {
            ...panel,
            status: "done" as const,
            historyItemId: item.id,
            outputPath: item.filePath,
            outputUrl: item.fileUrl,
            error: undefined,
          };
        });
        return changed ? { ...prev, panels: nextPanels } : prev;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const panels = useMemo(() => sortedPanels(project), [project]);
  const activePanel = useMemo(
    () => panels.find((panel) => panel.id === activePanelId) ?? panels[0],
    [panels, activePanelId],
  );
  const activePanelTags = useMemo(
    () =>
      activePanel ? splitPromptTags(activePanel.enPrompt).slice(0, 48) : [],
    [activePanel],
  );
  const selectedPanels = useMemo(
    () =>
      selectedIds.size
        ? panels.filter((panel) => selectedIds.has(panel.id))
        : panels,
    [panels, selectedIds],
  );
  const explicitlySelectedPanels = useMemo(
    () => panels.filter((panel) => selectedIds.has(panel.id)),
    [panels, selectedIds],
  );
  const ungeneratedPanels = useMemo(
    () => panels.filter((panel) => !panel.outputUrl),
    [panels],
  );
  // Panels that have no English prompt yet (conversion failed/skipped) and aren't
  // generated — generated directly from their Chinese description.
  const unconvertedPanels = useMemo(
    () => panels.filter((panel) => !panel.outputUrl && !panel.enPrompt.trim()),
    [panels],
  );
  const quotePreviewTargets = explicitlySelectedPanels.length
    ? explicitlySelectedPanels
    : ungeneratedPanels;
  const quoteTargetLabel = explicitlySelectedPanels.length
    ? comicFormat(language, "comic.quoteSelected", {
        count: explicitlySelectedPanels.length,
      })
    : comicFormat(language, "comic.quoteUngenerated", {
        count: ungeneratedPanels.length,
      });
  const convertedCount = panels.filter((panel) => panel.enPrompt.trim()).length;
  const doneCount = panels.filter((panel) => panel.status === "done").length;
  const queueRunning = Boolean(queue);
  const quotePreviewKey = JSON.stringify({
    step,
    queueRunning,
    account: {
      hasToken: account.hasToken,
      tierLevel: account.tierLevel,
      active: account.hasActiveSubscription,
      balance: account.anlasBalance,
    },
    references: project.references.filter(
      (ref) => ref.base64 && ref.useForGeneration !== false,
    ).length,
    panels: quotePreviewTargets.map((panel) => {
      const params = mergePanelParams(project, panel);
      return {
        id: panel.id,
        model: params.model,
        width: params.width,
        height: params.height,
        steps: params.steps,
        smea: params.smea,
        smeaDyn: params.smeaDyn,
      };
    }),
  });

  useEffect(() => {
    if (
      panels.length > 0 &&
      !panels.some((panel) => panel.id === activePanelId)
    ) {
      setActivePanelId(panels[0].id);
    }
  }, [activePanelId, panels]);

  useEffect(() => {
    let cancelled = false;
    if (step !== "generate" || !account.hasToken) {
      setQueueAnlasQuote(null);
      setQueueQuoteError("");
      setQueueQuoteLoading(false);
      return;
    }
    if (queueRunning) return;
    if (!quotePreviewTargets.length) {
      setQueueAnlasQuote(0);
      setQueueQuoteError("");
      setQueueQuoteLoading(false);
      return;
    }
    setQueueAnlasQuote(null);
    setQueueQuoteError("");
    setQueueQuoteLoading(true);
    const timer = window.setTimeout(() => {
      void quotePanelTargets(quotePreviewTargets, account)
        .then((result) => {
          if (cancelled) return;
          if (result.ok) setQueueAnlasQuote(result.amount);
          else setQueueQuoteError(result.message);
        })
        .finally(() => {
          if (!cancelled) setQueueQuoteLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [quotePreviewKey]);

  function patchProject(patch: Partial<ComicProject>) {
    setProject((prev) => ({ ...prev, ...patch }));
  }

  function patchGlobalParam<K extends keyof GenerateParams>(
    key: K,
    value: GenerateParams[K],
  ) {
    setProject((prev) => ({
      ...prev,
      globalParams: { ...prev.globalParams, [key]: value, positivePrompt: "" },
    }));
  }

  function patchPanelParam<K extends keyof GenerateParams>(
    panelId: string,
    key: K,
    value: GenerateParams[K],
  ) {
    setProject((prev) =>
      updatePanel(prev, panelId, (panel) => ({
        ...panel,
        paramsOverride: {
          ...panel.paramsOverride,
          params: { ...panel.paramsOverride.params, [key]: value },
        },
      })),
    );
  }

  function setDesiredPanelCount(value: number) {
    patchProject({ desiredPanelCount: value > 0 ? Math.round(value) : "auto" });
  }

  function modeLabel(mode: ReversePromptMode) {
    return mode === "natural"
      ? comicText(language, "comic.mode.natural")
      : mode === "tags"
        ? comicText(language, "comic.mode.tags")
        : comicText(language, "comic.mode.mixed");
  }

  function templateStatus(kind: "reverse" | "convert" | "comic") {
    if (kind === "comic") {
      const custom = settings?.comicAnalyzePromptTemplate?.trim();
      return {
        label: custom
          ? comicText(language, "comic.template.customAnalyze")
          : comicText(language, "comic.template.builtinAnalyze"),
        text: custom || COMIC_ANALYZE_SYSTEM_PROMPT,
      };
    }
    const map =
      kind === "reverse"
        ? settings?.reversePromptTemplates
        : settings?.convertPromptTemplates;
    const legacy =
      kind === "reverse"
        ? settings?.visionSystemPrompt
        : kind === "convert"
          ? settings?.convertSystemPrompt
          : "";
    const builtIn =
      kind === "reverse"
        ? SCOPED_REVERSE_SYSTEM_PROMPTS[project.mode]
        : CONVERT_SYSTEM_PROMPTS[project.mode];
    const custom = map?.[project.mode]?.trim() || legacy?.trim();
    return {
      label: custom
        ? comicText(language, "comic.template.custom")
        : comicText(language, "comic.template.builtin"),
      text: custom || builtIn,
    };
  }

  function syncCurrentParams() {
    setProject((prev) => ({
      ...prev,
      globalParams: { ...currentParams, positivePrompt: "" },
      globalStylePrompt: currentParams.stylePrompt,
      globalNegativePrompt: currentParams.negativePrompt,
    }));
    setToast(comicText(language, "comic.msg.syncedParams"));
  }

  function createNewProject() {
    if (!window.confirm(comicText(language, "comic.msg.confirmNew"))) return;
    const base = createDefaultComicProject(currentParams);
    setProject({
      ...base,
      title: comicText(language, "comic.defaultTitle"),
      rawScript: "",
      globalPrompt: "",
      globalCharacterSetting: "",
      continuityBible: "",
      globalStylePrompt: currentParams.stylePrompt,
      globalNegativePrompt: currentParams.negativePrompt,
      mode: project.mode,
      desiredPanelCount: project.desiredPanelCount,
      adultBranch: false,
      inheritPreviousFrame: false,
      references: [],
      panels: [],
    });
    setSelectedIds(new Set());
    setStep("story");
    setGenerationLog(comicText(language, "comic.msg.newProjectLog"));
  }

  function clearPanels() {
    if (
      !project.panels.length ||
      !window.confirm(comicText(language, "comic.msg.confirmClearPanels"))
    )
      return;
    patchProject({ panels: [], continuityBible: "" });
    setSelectedIds(new Set());
    setGenerationLog(comicText(language, "comic.msg.clearPanelsLog"));
  }

  function exportProjectJson() {
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title || "comic-project"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importProjectJson(file: File | null) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<ComicProject>;
      // trustOutputs: false — strip outputPath/outputUrl/historyItemId from the
      // imported (untrusted) JSON so a malicious project can't point the exporter
      // at arbitrary local files.
      setProject(
        normalizeComicProject(parsed, currentParams, { trustOutputs: false }),
      );
      setSelectedIds(new Set());
      setGenerationLog(comicText(language, "comic.msg.importedProjectLog"));
    } catch (error) {
      setToast(
        comicFormat(language, "comic.msg.importFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async function addReferences(files: FileList | null) {
    if (!files?.length) return;
    const refs: ComicReferenceAsset[] = [];
    for (const file of Array.from(files)) {
      const base64 = await toBase64(file);
      refs.push({
        id: uid(),
        name: file.name,
        kind: "precise",
        base64,
        previewUrl: dataUrlFromBase64(base64),
        reversePrompt: "",
        scope: "full",
        subjectHint: "",
        infoExtracted: 1,
        strength: 0.65,
        useForGeneration: true,
      });
    }
    setProject((prev) => ({
      ...prev,
      references: [...prev.references, ...refs],
    }));
  }

  async function reverseReference(ref: ComicReferenceAsset) {
    setBusy(`reverse:${ref.id}`);
    try {
      const result = await window.naiDesktop.comicReverseAsset(
        ref.base64,
        project.mode,
        ref.scope ?? "full",
        ref.subjectHint ?? "",
      );
      setProject((prev) =>
        updateReference(prev, ref.id, (item) => ({
          ...item,
          reversePrompt: result.ok ? (result.prompt ?? "") : item.reversePrompt,
        })),
      );
      setToast(result.message);
    } finally {
      setBusy("");
    }
  }

  // Fold every character/scene/object reverse-prompt into the global character
  // setting so it is carried through analyze + convert for all panels.
  function foldReferencesIntoGlobal() {
    const lines = project.references
      .filter((ref) => isGlobalPromptKind(ref.kind) && ref.reversePrompt.trim())
      .map(
        (ref) =>
          `【${labelForKind(ref.kind)}·${ref.name}】${ref.reversePrompt.trim()}`,
      );
    if (!lines.length) {
      setToast(comicText(language, "comic.msg.noRefToFold"));
      return;
    }
    setProject((prev) => ({
      ...prev,
      globalCharacterSetting: [prev.globalCharacterSetting.trim(), ...lines]
        .filter(Boolean)
        .join("\n"),
    }));
    setToast(
      comicFormat(language, "comic.msg.foldedRefs", { count: lines.length }),
    );
  }

  async function analyzeScript() {
    setBusy("analyze");
    try {
      const result = await window.naiDesktop.comicAnalyzeScript({
        script: project.rawScript,
        adultBranch: false,
        mode: project.mode,
        desiredPanelCount: project.desiredPanelCount,
        referencePrompts: referenceContextLines(project),
      });
      if (!result.ok) {
        setToast(result.message);
        return;
      }
      setProject((prev) => ({
        ...prev,
        title: result.title || prev.title,
        globalPrompt: result.globalPrompt || prev.globalPrompt,
        globalCharacterSetting:
          result.globalCharacterSetting ||
          referenceContextLines(prev).join("\n") ||
          prev.globalCharacterSetting,
        continuityBible: "",
        panels: (result.panels ?? []).map((panel, index) => ({
          id: uid(),
          index: index + 1,
          cnPrompt: panel.cnPrompt,
          contextSummary: panel.contextSummary || panel.cnPrompt.slice(0, 120),
          enPrompt: "",
          localNegativePrompt: "",
          negativeMode: "append",
          paramsOverride: { enabled: false, params: {} },
          status: "draft",
        })),
      }));
      setSelectedIds(new Set());
      setToast(
        comicFormat(language, "comic.msg.splitDone", {
          count: result.panels?.length ?? 0,
        }),
      );
      setStep("global");
    } finally {
      setBusy("");
    }
  }

  // Create panels straight from imported tag prompts (one per line). Each line
  // is the panel's English prompt and is marked "converted", so the user can go
  // straight to generating without the story → split → reverse flow.
  function importTagPanels(text: string) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setToast(comicText(language, "comic.msg.needTags"));
      return;
    }
    if (
      panels.length > 0 &&
      !window.confirm(
        comicFormat(language, "comic.msg.confirmReplaceTags", {
          lines: lines.length,
          panels: panels.length,
        }),
      )
    ) {
      return;
    }
    setProject((prev) => ({
      ...prev,
      panels: lines.map((line, index) => ({
        id: uid(),
        index: index + 1,
        cnPrompt: "",
        contextSummary: "",
        enPrompt: line,
        localNegativePrompt: "",
        negativeMode: "append",
        paramsOverride: { enabled: false, params: {} },
        status: "converted",
      })),
    }));
    setSelectedIds(new Set());
    setActivePanelId("");
    setTagBulk("");
    setToast(
      comicFormat(language, "comic.msg.importedTags", { count: lines.length }),
    );
    setStep("panels");
  }

  async function importTagFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    importTagPanels(text);
  }

  async function convertPanels(targets = selectedPanels) {
    if (!targets.length) return;
    setBusy("convert");
    try {
      const allPanels = sortedPanels(project);
      const requestPanels = targets.map((panel) => {
        const index = allPanels.findIndex((item) => item.id === panel.id);
        return {
          panelId: panel.id,
          index: panel.index,
          cnPrompt: panel.cnPrompt,
          previousCnPrompt: allPanels[index - 1]?.cnPrompt ?? "",
          nextCnPrompt: allPanels[index + 1]?.cnPrompt ?? "",
          previousPrompts: allPanels
            .slice(Math.max(0, index - 2), index)
            .map((item) => item.enPrompt || item.cnPrompt),
          previousSummaries: allPanels
            .slice(Math.max(0, index - 2), index)
            .map((item) => item.contextSummary || item.cnPrompt),
          nextSummaries: allPanels
            .slice(index + 1, index + 2)
            .map((item) => item.contextSummary || item.cnPrompt),
        };
      });
      const result = await window.naiDesktop.comicConvertPanels({
        mode: project.mode,
        globalPrompt: project.globalPrompt,
        globalCharacterSetting: project.globalCharacterSetting,
        continuityBible: "",
        globalStylePrompt: project.globalStylePrompt,
        referencePrompts: referenceContextLines(project),
        adultBranch: false,
        panels: requestPanels,
      });
      setProject((prev) => ({
        ...prev,
        panels: prev.panels.map((panel) => {
          const converted = result.panels.find(
            (item) => item.panelId === panel.id,
          );
          if (!converted) return panel;
          return {
            ...panel,
            enPrompt: converted.enPrompt || panel.enPrompt,
            contextSummary: converted.contextSummary || panel.contextSummary,
            status: converted.error ? "failed" : "converted",
            error: converted.error,
          };
        }),
      }));
      const okCount = result.panels.filter(
        (item) => !item.error && (item.enPrompt ?? "").trim(),
      ).length;
      const failCount = Math.max(0, targets.length - okCount);
      setToast(
        okCount === 0
          ? comicFormat(language, "comic.msg.convertAllFailed", {
              count: failCount,
              message: result.message,
            })
          : comicFormat(language, "comic.msg.convertDone", {
              ok: okCount,
              fail: failCount,
              extra: failCount
                ? comicText(language, "comic.msg.retryHint")
                : "",
            }),
      );
    } finally {
      setBusy("");
    }
  }

  async function checkConsistency() {
    if (!panels.some((panel) => panel.enPrompt.trim())) {
      setToast(comicText(language, "comic.msg.needConverted"));
      return;
    }
    setBusy("consistency");
    try {
      const result = await window.naiDesktop.comicCheckConsistency({
        mode: project.mode,
        globalPrompt: project.globalPrompt,
        globalCharacterSetting: project.globalCharacterSetting,
        referencePrompts: referenceContextLines(project),
        panels: panels.map((panel) => ({
          id: panel.id,
          index: panel.index,
          cnPrompt: panel.cnPrompt,
          enPrompt: panel.enPrompt,
        })),
      });
      if (!result.ok) {
        setToast(result.message);
        return;
      }
      setProject((prev) => ({
        ...prev,
        panels: prev.panels.map((panel) => {
          const fixed = result.panels.find((item) => item.panelId === panel.id);
          return fixed?.enPrompt
            ? { ...panel, enPrompt: fixed.enPrompt, status: "converted" }
            : panel;
        }),
      }));
      setToast(result.message);
    } finally {
      setBusy("");
    }
  }

  async function translatePanelText(
    panel: ComicPanel,
    direction: "to-en" | "to-zh",
  ) {
    const source =
      direction === "to-en" ? panel.cnPrompt.trim() : panel.enPrompt.trim();
    if (!source) {
      setToast(
        comicText(
          language,
          direction === "to-en"
            ? "comic.msg.noCnPrompt"
            : "comic.msg.noEnPrompt",
        ),
      );
      return;
    }
    setTranslatingPanel(`${panel.id}:${direction}`);
    try {
      const result = await window.naiDesktop.translate(
        source,
        direction === "to-en" ? "en" : "zh",
      );
      if (!result.ok || !result.text?.trim()) {
        setToast(
          result.error ?? comicText(language, "comic.msg.translateFailed"),
        );
        return;
      }
      setProject((prev) =>
        updatePanel(prev, panel.id, (old) =>
          direction === "to-en"
            ? {
                ...old,
                enPrompt: result.text!.trim(),
                status: "converted",
                error: undefined,
              }
            : { ...old, cnPrompt: result.text!.trim(), error: undefined },
        ),
      );
      setToast(
        comicFormat(
          language,
          direction === "to-en"
            ? "comic.msg.translatedToEn"
            : "comic.msg.translatedToZh",
          { index: panel.index },
        ),
      );
    } finally {
      setTranslatingPanel("");
    }
  }

  async function generatePanel(panel: ComicPanel): Promise<PanelOutput> {
    setBusy(`generate:${panel.id}`);
    setProject((prev) =>
      updatePanel(prev, panel.id, (old) => ({
        ...old,
        status: "generating",
        error: undefined,
      })),
    );
    try {
      const result = await window.naiDesktop.comicGeneratePanel({
        projectId: project.id,
        projectTitle: project.title,
        historyGroupId: project.historyGroupId,
        panelId: panel.id,
        panelIndex: panel.index,
        params: mergePanelParams(project, panel),
        globalStylePrompt: project.globalStylePrompt,
        panelPrompt: panel.enPrompt || panel.cnPrompt,
        globalNegativePrompt: project.globalNegativePrompt,
        localNegativePrompt: panel.localNegativePrompt,
        negativeMode: panel.negativeMode,
        references: project.references,
        previousImagePath: undefined,
        inheritPreviousFrame: false,
      });
      if (!mountedRef.current || queueRef.current.cancelled) {
        return {
          ok: false,
          failureKind: "cancelled",
          message: comicText(language, "comic.msg.queueCancelled"),
        };
      }
      const item = result.items[0];
      setProject((prev) => ({
        ...updatePanel(prev, panel.id, (old) => ({
          ...old,
          status: result.ok && item ? "done" : "failed",
          historyItemId: item?.id ?? old.historyItemId,
          outputPath: item?.filePath ?? old.outputPath,
          outputUrl: item?.fileUrl ?? old.outputUrl,
          error: result.ok ? undefined : result.message,
        })),
        historyGroupId: item?.groupId ?? prev.historyGroupId,
      }));
      if (item && mountedRef.current) {
        await refreshHistory(item.date);
        await refreshAccount();
      }
      if (result.ok && item) {
        return {
          ok: true,
          historyItemId: item.id,
          outputPath: item.filePath,
          outputUrl: item.fileUrl,
        };
      }
      return {
        ok: false,
        failureKind: result.failureKind,
        message: result.message,
      };
    } finally {
      if (mountedRef.current) setBusy("");
    }
  }

  async function exportProjectZip(target: ComicProject = project) {
    setBusy("exportZip");
    try {
      const result = await window.naiDesktop.comicExportProjectZip(target);
      setToast(result.message);
      if (result.ok && result.path)
        setGenerationLog(
          comicFormat(language, "comic.msg.zipExported", { path: result.path }),
        );
      return result.ok;
    } finally {
      if (mountedRef.current) setBusy("");
    }
  }

  async function runQueue(targets: ComicPanel[], anlasBefore?: number) {
    if (!targets.length) return;
    queueRef.current = { paused: false, cancelled: false };
    setQueue({ total: targets.length, done: 0, current: 0, paused: false });
    setQueueAnlasSpent(null);
    // Collect each panel's freshly-generated output here. React state updates are
    // async, so the closure `project` is stale by the time the loop ends — we must
    // build the export target from these collected results, not from `project`.
    const generatedOutputs = new Map<string, PanelOutput>();
    for (let i = 0; i < targets.length; i += 1) {
      if (queueRef.current.cancelled) break;
      while (queueRef.current.paused && !queueRef.current.cancelled) {
        await sleep(220);
      }
      if (queueRef.current.cancelled) break;
      setQueue((q) => (q ? { ...q, current: i + 1 } : q));
      setGenerationLog(
        comicFormat(language, "comic.msg.generatingPanel", {
          index: targets[i].index,
          current: i + 1,
          total: targets.length,
        }),
      );
      const output = await generatePanel(targets[i]);
      if (!mountedRef.current || output.failureKind === "cancelled") break;
      if (output.ok) {
        generatedOutputs.set(targets[i].id, output);
        const currentAccount = await refreshAccount();
        const spent = anlasSpent(anlasBefore, currentAccount.anlasBalance);
        if (spent != null) setQueueAnlasSpent(spent);
      } else if (output.failureKind === "auth") {
        queueRef.current.cancelled = true;
        const message = comicFormat(language, "comic.msg.queueStopped", {
          message:
            output.message ?? comicText(language, "comic.msg.authFailed"),
        });
        setGenerationLog(message);
        setToast(message);
      }
      setQueue((q) => (q ? { ...q, done: i + 1 } : q));
    }
    if (!mountedRef.current) return;
    const finalAccount = await refreshAccount();
    const spent = anlasSpent(anlasBefore, finalAccount.anlasBalance);
    if (spent != null) setQueueAnlasSpent(spent);
    const cancelled = queueRef.current.cancelled;
    setQueue(null);
    const spentText =
      spent != null
        ? comicFormat(language, "comic.msg.spent", { amount: spent })
        : comicText(language, "comic.msg.spentFailed");
    if (!cancelled && project.autoExportZip) {
      const exportTarget: ComicProject = {
        ...project,
        panels: project.panels.map((panel) => {
          const output = generatedOutputs.get(panel.id);
          return output
            ? {
                ...panel,
                status: "done",
                historyItemId: output.historyItemId,
                outputPath: output.outputPath,
                outputUrl: output.outputUrl,
              }
            : panel;
        }),
      };
      const exported = await exportProjectZip(exportTarget);
      setGenerationLog(
        comicFormat(
          language,
          exported ? "comic.msg.doneZip" : "comic.msg.doneZipFailed",
          { spent: spentText },
        ),
      );
    } else {
      setGenerationLog(
        comicFormat(
          language,
          cancelled ? "comic.msg.doneCancelled" : "comic.msg.done",
          { spent: spentText },
        ),
      );
    }
  }

  async function quotePanelTargets(
    targets: ComicPanel[],
    quoteAccount = account,
  ) {
    const quoteCache = new Map<string, number>();
    const usableRefs = project.references.filter(
      (ref) => ref.base64 && ref.useForGeneration !== false,
    );
    const vibeKindCount = usableRefs.filter(
      (ref) => ref.kind === "vibe",
    ).length;
    const preciseKindCount = usableRefs.length - vibeKindCount;
    let amount = 0;
    for (const panel of targets) {
      const params = mergePanelParams(project, panel);
      // Precise (director) references only bill on V4.5; on other models they
      // fall back to Vibe Transfer, so count them as vibe there.
      const supportsPrecise = params.model.includes("4-5");
      const vibeCount = supportsPrecise
        ? vibeKindCount
        : vibeKindCount + preciseKindCount;
      const preciseCount = supportsPrecise ? preciseKindCount : 0;
      const key = JSON.stringify({
        model: params.model,
        width: params.width,
        height: params.height,
        steps: params.steps,
        smea: params.smea,
        smeaDyn: params.smeaDyn,
        vibeCount,
        preciseCount,
      });
      let panelAmount = quoteCache.get(key);
      if (panelAmount == null) {
        const quote = await window.naiDesktop.quoteAnlas({
          feature: "generate",
          params: {
            ...params,
            stylePrompt: "",
            positivePrompt: "quote",
            negativePrompt: "",
          },
          extras: {
            vibeImages: Array.from({ length: vibeCount }, () => ({
              base64: "",
              infoExtracted: 0.7,
              strength: 0.5,
            })),
            charCaptions: [],
            preciseReferences: Array.from({ length: preciseCount }, () => ({
              base64: "",
              type: "character" as const,
              strength: 1,
              fidelity: 1,
            })),
          },
          batchCount: 1,
          account: quoteAccount,
        });
        if (!quote.ok || typeof quote.amount !== "number") {
          return {
            ok: false as const,
            amount: 0,
            message: comicFormat(language, "comic.msg.quotePanel", {
              index: panel.index,
              message: quote.message,
            }),
          };
        }
        panelAmount = quote.amount;
        quoteCache.set(key, panelAmount);
      }
      amount += panelAmount;
    }
    return { ok: true as const, amount, message: "" };
  }

  async function startQueue(targets: ComicPanel[]) {
    if (!targets.length) {
      setToast(comicText(language, "comic.msg.noGeneratable"));
      return;
    }
    const freshAccount = await window.naiDesktop.hasToken();
    if (!freshAccount.hasToken) {
      setToast(comicText(language, "comic.msg.needToken"));
      await refreshAccount();
      return;
    }
    if (!settings?.imageBaseUrl?.trim()) {
      setToast(comicText(language, "comic.msg.needEndpoint"));
      return;
    }
    const emptyPrompt = targets.find(
      (panel) => !(panel.enPrompt || panel.cnPrompt).trim(),
    );
    if (emptyPrompt) {
      setToast(
        comicFormat(language, "comic.msg.emptyPrompt", {
          index: emptyPrompt.index,
        }),
      );
      return;
    }
    const quoted = await quotePanelTargets(targets, freshAccount);
    if (!quoted.ok) {
      setToast(
        comicFormat(language, "comic.msg.quoteFailedBefore", {
          message: quoted.message,
        }),
      );
      return;
    }
    const totalQuote = quoted.amount;
    setQueueAnlasQuote(totalQuote);
    if (
      typeof freshAccount.anlasBalance === "number" &&
      totalQuote > freshAccount.anlasBalance
    ) {
      setToast(
        comicFormat(language, "comic.msg.insufficient", {
          need: totalQuote,
          balance: freshAccount.anlasBalance,
        }),
      );
      return;
    }
    const ok = window.confirm(
      comicFormat(language, "comic.msg.confirmQueue", {
        count: targets.length,
        quote: totalQuote,
        balance:
          freshAccount.anlasBalance ?? comicText(language, "comic.unknown"),
      }),
    );
    if (!ok) return;
    void runQueue(targets, freshAccount.anlasBalance);
  }

  function addPanel(afterIndex?: number) {
    setProject((prev) => {
      const nextIndex = afterIndex ?? prev.panels.length;
      const next = [...prev.panels];
      next.splice(nextIndex, 0, {
        id: uid(),
        index: nextIndex + 1,
        cnPrompt: comicText(language, "comic.msg.newPanelDesc"),
        contextSummary: "",
        enPrompt: "",
        localNegativePrompt: "",
        negativeMode: "append",
        paramsOverride: { enabled: false, params: {} },
        status: "draft",
      });
      return {
        ...prev,
        panels: next.map((panel, index) => ({ ...panel, index: index + 1 })),
      };
    });
  }

  function removePanel(panelId: string) {
    setProject((prev) => ({
      ...prev,
      panels: prev.panels
        .filter((panel) => panel.id !== panelId)
        .map((panel, index) => ({ ...panel, index: index + 1 })),
    }));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(panelId);
      return next;
    });
  }

  function markPanelImageUnavailable(panelId: string) {
    setProject((prev) =>
      updatePanel(prev, panelId, (panel) => ({
        ...panel,
        status: "failed",
        historyItemId: undefined,
        outputPath: undefined,
        outputUrl: undefined,
        error: comicText(language, "comic.msg.imageUnavailable"),
      })),
    );
  }

  function toggleSelected(panelId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(panelId)) next.delete(panelId);
      else next.add(panelId);
      return next;
    });
  }

  return (
    <main
      ref={comicRootRef}
      className={clsx(
        "comic-generator",
        step === "panels" && "comic-generator-panels",
      )}
    >
      <div className="comic-page-title">
        <span className="eyebrow">{getToolsHubText(language).comicTitle}</span>
        <strong>
          {project.title || comicText(language, "comic.defaultTitle")}
        </strong>
        <small>
          {comicFormat(language, "comic.metricSummary", {
            panels: panels.length,
            converted: convertedCount,
            done: doneCount,
            mode: modeLabel(project.mode),
          })}
        </small>
      </div>

      <nav className="comic-steps">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className={clsx("comic-step-btn", step === s.key && "active")}
            onClick={() => setStep(s.key)}
          >
            <b>{i + 1}</b>
            <span>{comicText(language, s.labelKey)}</span>
            <small>{comicText(language, s.hintKey)}</small>
          </button>
        ))}
      </nav>

      {step === "story" && (
        <div className="comic-step-actions">
          {onBack ? (
            <Button onClick={onBack} variant="ghost">
              {comicText(language, "comic.backToTools")}
            </Button>
          ) : null}
          <Button onClick={createNewProject} variant="ghost">
            {comicText(language, "comic.newProject")}
          </Button>
          <Button
            onClick={clearPanels}
            variant="ghost"
            disabled={!panels.length}
          >
            {comicText(language, "comic.clearPanels")}
          </Button>
          <Button onClick={exportProjectJson} variant="ghost">
            {comicText(language, "comic.saveJson")}
          </Button>
          <label className="comic-upload-btn">
            {comicText(language, "comic.importJson")}
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) =>
                void importProjectJson(event.currentTarget.files?.[0] ?? null)
              }
            />
          </label>
        </div>
      )}

      {step === "story" && (
        <section className="comic-card">
          <div className="comic-section-title">
            <strong>{comicText(language, "comic.storyHeading")}</strong>
            <span>{comicText(language, "comic.storySub")}</span>
          </div>
          <label className="comic-field">
            <span>{comicText(language, "comic.titleLabel")}</span>
            <input
              value={project.title}
              onChange={(event) => patchProject({ title: event.target.value })}
            />
          </label>
          <div className="comic-api-info">
            <div>
              <b>{comicText(language, "comic.reverseStatus")}</b>
              <span>
                {settings?.visionApiModel ||
                  comicText(language, "comic.notSetModel")}{" "}
                ·{" "}
                {settings?.visionApiUrl ||
                  comicText(language, "comic.notSetApi")}
              </span>
            </div>
            <div>
              <b>{comicText(language, "comic.splitStatus")}</b>
              <span>
                {settings?.convertApiModel ||
                  comicText(language, "comic.notSetModel")}{" "}
                ·{" "}
                {settings?.convertApiUrl ||
                  comicText(language, "comic.notSetApi")}
              </span>
            </div>
            <div>
              <b>{comicText(language, "comic.finalStatus")}</b>
              <span>
                NovelAI API ·{" "}
                {settings?.imageBaseUrl || "https://image.novelai.net"}
              </span>
            </div>
          </div>
          <div className="comic-mode-row">
            <label>
              {comicText(language, "comic.templateMode")}
              <select
                value={project.mode}
                onChange={(event) =>
                  patchProject({
                    mode: event.target.value as ReversePromptMode,
                  })
                }
              >
                <option value="natural">
                  {comicText(language, "comic.mode.natural")}
                </option>
                <option value="tags">
                  {comicText(language, "comic.mode.tags")}
                </option>
                <option value="mixed">
                  {comicText(language, "comic.mode.mixed")}
                </option>
              </select>
            </label>
            <label>
              {comicText(language, "comic.targetPanels")}
              <NumberInput
                label=""
                value={
                  typeof project.desiredPanelCount === "number"
                    ? project.desiredPanelCount
                    : 0
                }
                min={0}
                max={500}
                onChange={setDesiredPanelCount}
              />
            </label>
          </div>
          <details className="comic-template-preview">
            <summary>
              {comicFormat(language, "comic.templateSummary", {
                mode: modeLabel(project.mode),
              })}
            </summary>
            <div>
              <strong>
                {comicText(language, "comic.reverseTemplate")}：
                {templateStatus("reverse").label}
              </strong>
              <pre>{templateStatus("reverse").text}</pre>
              <strong>
                {comicText(language, "comic.convertTemplate")}：
                {templateStatus("convert").label}
              </strong>
              <pre>{templateStatus("convert").text}</pre>
              <strong>
                {comicText(language, "comic.analyzeTemplate")}：
                {templateStatus("comic").label}
              </strong>
              <pre>{templateStatus("comic").text}</pre>
            </div>
          </details>
          <label className="comic-field">
            <span>{comicText(language, "comic.storyTextLabel")}</span>
            <textarea
              value={project.rawScript}
              onChange={(event) =>
                patchProject({
                  rawScript: event.target.value,
                  globalPrompt: event.target.value,
                })
              }
            />
          </label>
          <div className="comic-story-references">
            <div className="comic-section-title">
              <strong>{comicText(language, "comic.storyRefsTitle")}</strong>
              <span>{comicText(language, "comic.storyRefsDesc")}</span>
            </div>
            <div className="comic-mode-row">
              <label className="comic-upload-btn">
                {comicText(language, "comic.uploadRefs")}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => addReferences(event.target.files)}
                />
              </label>
              <Button onClick={foldReferencesIntoGlobal} variant="secondary">
                {comicText(language, "comic.foldRefs")}
              </Button>
            </div>
            <div className="comic-reference-list compact">
              {project.references.length === 0 && (
                <p className="comic-empty">
                  {comicText(language, "comic.refsEmpty")}
                </p>
              )}
              {project.references.map((ref) => (
                <div className="comic-reference" key={`story-${ref.id}`}>
                  <img src={ref.previewUrl} alt="" />
                  <div>
                    <strong>{ref.name}</strong>
                    <div className="comic-reference-controls">
                      <label>
                        {comicText(language, "comic.kindLabel")}
                        <select
                          value={ref.kind}
                          onChange={(event) =>
                            setProject((prev) =>
                              updateReference(prev, ref.id, (item) => ({
                                ...item,
                                kind: event.target.value as ComicReferenceKind,
                              })),
                            )
                          }
                        >
                          {(
                            [
                              "precise",
                              "character",
                              "scene",
                              "object",
                              "vibe",
                            ] as ComicReferenceKind[]
                          ).map((kind) => (
                            <option key={kind} value={kind}>
                              {labelForKind(kind, language)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {comicText(language, "comic.subjectLabel")}
                        <input
                          value={ref.subjectHint ?? ""}
                          placeholder={comicText(
                            language,
                            "comic.subjectPlaceholder",
                          )}
                          onChange={(event) =>
                            setProject((prev) =>
                              updateReference(prev, ref.id, (item) => ({
                                ...item,
                                subjectHint: event.target.value,
                              })),
                            )
                          }
                        />
                      </label>
                    </div>
                    <label className="checkbox-line comic-reference-generate-toggle">
                      <input
                        type="checkbox"
                        checked={ref.useForGeneration !== false}
                        onChange={(event) =>
                          setProject((prev) =>
                            updateReference(prev, ref.id, (item) => ({
                              ...item,
                              useForGeneration: event.target.checked,
                            })),
                          )
                        }
                      />
                      <span>{comicText(language, "comic.useRef")}</span>
                    </label>
                    <div className="comic-actions">
                      <Button
                        onClick={() => reverseReference(ref)}
                        disabled={busy === `reverse:${ref.id}`}
                      >
                        {busy === `reverse:${ref.id}`
                          ? comicText(language, "comic.reverseBusy")
                          : comicText(language, "comic.reverseRef")}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() =>
                          setProject((prev) => ({
                            ...prev,
                            references: prev.references.filter(
                              (item) => item.id !== ref.id,
                            ),
                          }))
                        }
                      >
                        {comicText(language, "comic.delete")}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="comic-actions">
            <Button
              onClick={analyzeScript}
              disabled={busy === "analyze"}
              variant="primary"
            >
              {busy === "analyze"
                ? comicText(language, "comic.analyzeBusy")
                : comicText(language, "comic.analyzeAction")}
            </Button>
            <span className="comic-empty">
              {comicText(language, "comic.afterAnalyze")}
            </span>
          </div>
          <div className="comic-field" style={{ marginTop: 14 }}>
            <div className="comic-field-heading">
              <span>{comicText(language, "comic.bulkTagLabel")}</span>
            </div>
            <textarea
              value={tagBulk}
              placeholder={comicText(language, "comic.bulkTagPlaceholder")}
              onChange={(event) => setTagBulk(event.target.value)}
            />
            <div className="comic-actions">
              <Button
                onClick={() => importTagPanels(tagBulk)}
                disabled={!tagBulk.trim()}
              >
                {comicText(language, "comic.importAsPanels")}
              </Button>
              <label className="btn btn-secondary redraw-file-btn">
                {comicText(language, "comic.importTxt")}
                <input
                  type="file"
                  hidden
                  accept=".txt,text/plain"
                  onChange={(event) => {
                    void importTagFile(event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                />
              </label>
              <span className="comic-empty">
                {comicText(language, "comic.bulkTagHint")}
              </span>
            </div>
          </div>
        </section>
      )}

      {step === "global" && (
        <section className="comic-card">
          <div className="comic-section-title">
            <strong>{comicText(language, "comic.globalHeading")}</strong>
            <div className="comic-actions">
              <span>{comicText(language, "comic.sharedAll")}</span>
              <Button onClick={syncCurrentParams} variant="ghost">
                {comicText(language, "comic.syncParams")}
              </Button>
            </div>
          </div>
          <label className="comic-field">
            <span>{comicText(language, "comic.globalCharacter")}</span>
            <textarea
              value={project.globalCharacterSetting}
              onChange={(event) =>
                patchProject({ globalCharacterSetting: event.target.value })
              }
            />
          </label>
          <label className="comic-field">
            <span>{comicText(language, "comic.globalStyle")}</span>
            <textarea
              value={project.globalStylePrompt}
              onChange={(event) =>
                patchProject({ globalStylePrompt: event.target.value })
              }
            />
          </label>
          <label className="comic-field">
            <span>{comicText(language, "comic.globalNegative")}</span>
            <textarea
              value={project.globalNegativePrompt}
              onChange={(event) =>
                patchProject({ globalNegativePrompt: event.target.value })
              }
            />
          </label>
          <label className="comic-field">
            <span>{comicText(language, "comic.model")}</span>
            <select
              value={project.globalParams.model}
              onChange={(event) =>
                patchGlobalParam("model", event.target.value as NAIModel)
              }
            >
              {NAI_MODELS.map((model) => (
                <option key={model.value} value={model.value}>
                  {localizedDesktopOptionLabel(
                    language,
                    model.value,
                    model.label,
                  )}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="comic-disclosure"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced
              ? comicText(language, "comic.advancedCollapse")
              : comicText(language, "comic.advancedExpand")}
          </button>
          {showAdvanced && (
            <>
              <div className="comic-param-grid">
                <NumberInput
                  label={comicText(language, "comic.width")}
                  value={project.globalParams.width}
                  min={64}
                  max={1600}
                  step={64}
                  onChange={(v) => patchGlobalParam("width", v)}
                />
                <NumberInput
                  label={comicText(language, "comic.height")}
                  value={project.globalParams.height}
                  min={64}
                  max={1600}
                  step={64}
                  onChange={(v) => patchGlobalParam("height", v)}
                />
                <NumberInput
                  label={comicText(language, "comic.steps")}
                  value={project.globalParams.steps}
                  min={1}
                  max={50}
                  onChange={(v) => patchGlobalParam("steps", v)}
                />
                <NumberInput
                  label="CFG"
                  value={project.globalParams.cfgScale}
                  min={1}
                  max={10}
                  step={0.5}
                  onChange={(v) => patchGlobalParam("cfgScale", v)}
                />
              </div>
              <label className="comic-field">
                <span>{comicText(language, "comic.sampler")}</span>
                <select
                  value={project.globalParams.sampler}
                  onChange={(event) =>
                    patchGlobalParam(
                      "sampler",
                      event.target.value as NAISampler,
                    )
                  }
                >
                  {NAI_SAMPLERS.map((sampler) => (
                    <option key={sampler.value} value={sampler.value}>
                      {localizedDesktopOptionLabel(
                        language,
                        sampler.value,
                        sampler.label,
                      )}
                    </option>
                  ))}
                </select>
              </label>
              <label className="comic-field">
                <span>{comicText(language, "comic.noiseSchedule")}</span>
                <select
                  value={project.globalParams.noiseSchedule}
                  onChange={(event) =>
                    patchGlobalParam("noiseSchedule", event.target.value)
                  }
                >
                  <option value="native">
                    {comicText(language, "comic.native")}
                  </option>
                  <option value="karras">
                    {comicText(language, "comic.karras")}
                  </option>
                  <option value="exponential">
                    {comicText(language, "comic.exponential")}
                  </option>
                </select>
              </label>
              <label className="comic-field">
                <span>{comicText(language, "comic.ucPreset")}</span>
                <select
                  value={project.globalParams.ucPreset}
                  onChange={(event) =>
                    patchGlobalParam(
                      "ucPreset",
                      Number(event.target.value) as UcPreset,
                    )
                  }
                >
                  {NAI_UC_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {localizedDesktopOptionLabel(
                        language,
                        preset.value,
                        preset.label,
                      )}
                    </option>
                  ))}
                </select>
              </label>
              <div className="comic-toggle-row">
                <Toggle
                  checked={project.globalParams.qualityToggle}
                  onChange={(v) => patchGlobalParam("qualityToggle", v)}
                  label="Quality Tags"
                  description={comicText(language, "comic.qualityDesc")}
                />
                <Toggle
                  checked={project.globalParams.variety}
                  onChange={(v) => patchGlobalParam("variety", v)}
                  label="Variety+"
                  description={comicText(language, "comic.varietyDesc")}
                />
                <Toggle
                  checked={project.globalParams.smea}
                  onChange={(v) => patchGlobalParam("smea", v)}
                  label="SMEA"
                  description={comicText(language, "comic.smeaDesc")}
                />
                <Toggle
                  checked={project.globalParams.smeaDyn}
                  onChange={(v) => patchGlobalParam("smeaDyn", v)}
                  label="SMEA Dyn"
                  description={comicText(language, "comic.smeaDynDesc")}
                />
              </div>
            </>
          )}
        </section>
      )}

      {step === "panels" && (
        <section className="comic-card comic-panels-card">
          <div className="comic-section-title">
            <strong>{comicText(language, "comic.panelsHeading")}</strong>
            <span>
              {selectedIds.size
                ? comicFormat(language, "comic.selectedCount", {
                    count: selectedIds.size,
                  })
                : comicText(language, "comic.appliesAll")}
            </span>
          </div>
          <div className="comic-mode-row">
            <div className="comic-inline-help">
              {comicFormat(language, "comic.convertHelp", {
                mode: modeLabel(project.mode),
              })}
            </div>
            <Button
              onClick={() => convertPanels()}
              disabled={busy === "convert"}
              variant="primary"
            >
              {busy === "convert"
                ? comicText(language, "comic.converting")
                : selectedIds.size
                  ? comicText(language, "comic.convertSelected")
                  : comicText(language, "comic.convertAll")}
            </Button>
            <Button
              onClick={() => void checkConsistency()}
              disabled={busy === "consistency"}
            >
              {busy === "consistency"
                ? comicText(language, "comic.checking")
                : comicText(language, "comic.consistencyCheck")}
            </Button>
            <Button onClick={() => addPanel()}>
              {comicText(language, "comic.addPanel")}
            </Button>
            <Button
              onClick={() =>
                setSelectedIds(new Set(panels.map((panel) => panel.id)))
              }
            >
              {comicText(language, "comic.selectAll")}
            </Button>
            <Button onClick={() => setSelectedIds(new Set())}>
              {comicText(language, "comic.clearSelection")}
            </Button>
          </div>
          {activePanel && (
            <div className="comic-panel-workspace">
              <aside className="comic-panel-sidebar">
                {panels.map((panel) => (
                  <button
                    key={panel.id}
                    type="button"
                    className={clsx(
                      "comic-panel-nav-item",
                      activePanel.id === panel.id && "active",
                      selectedIds.has(panel.id) && "selected",
                    )}
                    onClick={() => setActivePanelId(panel.id)}
                  >
                    <span>#{panel.index}</span>
                    <small>{labelForPanelStatus(panel.status, language)}</small>
                  </button>
                ))}
              </aside>
              <article className="comic-panel-editor">
                <header>
                  <label className="comic-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(activePanel.id)}
                      onChange={() => toggleSelected(activePanel.id)}
                    />
                    <strong>
                      {comicFormat(language, "comic.panelTitle", {
                        index: activePanel.index,
                      })}
                    </strong>
                  </label>
                  <span className={clsx("comic-status", activePanel.status)}>
                    {labelForPanelStatus(activePanel.status, language)}
                  </span>
                  <div className="comic-actions">
                    <Button
                      onClick={() => convertPanels([activePanel])}
                      disabled={busy === "convert"}
                    >
                      {comicText(language, "comic.convertOne")}
                    </Button>
                    <Button
                      onClick={() => void startQueue([activePanel])}
                      disabled={Boolean(busy) || queueRunning}
                      variant="primary"
                    >
                      {busy === `generate:${activePanel.id}`
                        ? comicText(language, "comic.generating")
                        : comicText(language, "comic.generateOne")}
                    </Button>
                    <Button onClick={() => addPanel(activePanel.index)}>
                      {comicText(language, "comic.insert")}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => removePanel(activePanel.id)}
                    >
                      {comicText(language, "comic.delete")}
                    </Button>
                  </div>
                </header>
                <div
                  className="comic-panel-editor-tabs"
                  role="tablist"
                  aria-label={comicText(language, "comic.editorAria")}
                >
                  <button
                    type="button"
                    className={panelEditorTab === "content" ? "active" : ""}
                    onClick={() => setPanelEditorTab("content")}
                  >
                    {comicText(language, "comic.contentTab")}
                  </button>
                  <button
                    type="button"
                    className={panelEditorTab === "params" ? "active" : ""}
                    onClick={() => setPanelEditorTab("params")}
                  >
                    {comicText(language, "comic.paramsTab")}
                  </button>
                  <button
                    type="button"
                    className={panelEditorTab === "weights" ? "active" : ""}
                    onClick={() => setPanelEditorTab("weights")}
                  >
                    {comicText(language, "comic.weightsTab")}
                  </button>
                </div>
                <div className="comic-panel-editor-body">
                  {activePanel.error ? (
                    <div className="comic-panel-error">{activePanel.error}</div>
                  ) : null}
                  {panelEditorTab === "content" ? (
                    <>
                      {activePanel.outputUrl ? (
                        <div className="comic-panel-result">
                          <img
                            src={activePanel.outputUrl}
                            alt={comicFormat(language, "comic.outputAlt", {
                              index: activePanel.index,
                            })}
                            draggable
                            title={comicText(language, "comic.dragTitle")}
                            onDragStart={(e) => {
                              e.preventDefault();
                              if (activePanel.outputUrl)
                                window.naiDesktop.startImageDrag(
                                  activePanel.outputUrl,
                                );
                            }}
                            onError={() =>
                              markPanelImageUnavailable(activePanel.id)
                            }
                          />
                          <div>
                            <strong>
                              {comicFormat(language, "comic.resultTitle", {
                                index: activePanel.index,
                              })}
                            </strong>
                            <span>
                              {comicText(language, "comic.resultDesc")}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="comic-panel-no-result">
                          {comicText(language, "comic.noResult")}
                        </div>
                      )}
                      <div className="comic-panel-grid">
                        <div className="comic-field">
                          <div className="comic-field-heading">
                            <span>{comicText(language, "comic.cnDesc")}</span>
                            <Button
                              variant="ghost"
                              onClick={() =>
                                void translatePanelText(activePanel, "to-en")
                              }
                              disabled={Boolean(translatingPanel)}
                            >
                              {translatingPanel === `${activePanel.id}:to-en`
                                ? comicText(language, "comic.translating")
                                : comicText(language, "comic.translateToEn")}
                            </Button>
                          </div>
                          <textarea
                            value={activePanel.cnPrompt}
                            onChange={(event) =>
                              setProject((prev) =>
                                updatePanel(prev, activePanel.id, (old) => ({
                                  ...old,
                                  cnPrompt: event.target.value,
                                })),
                              )
                            }
                          />
                        </div>
                        <div className="comic-field">
                          <div className="comic-field-heading">
                            <span>{comicText(language, "comic.enPrompt")}</span>
                            <Button
                              variant="ghost"
                              onClick={() =>
                                void translatePanelText(activePanel, "to-zh")
                              }
                              disabled={Boolean(translatingPanel)}
                            >
                              {translatingPanel === `${activePanel.id}:to-zh`
                                ? comicText(language, "comic.translating")
                                : comicText(language, "comic.translateToZh")}
                            </Button>
                          </div>
                          <textarea
                            value={activePanel.enPrompt}
                            onChange={(event) =>
                              setProject((prev) =>
                                updatePanel(prev, activePanel.id, (old) => ({
                                  ...old,
                                  enPrompt: event.target.value,
                                  status: "converted",
                                })),
                              )
                            }
                          />
                        </div>
                      </div>
                      <div className="comic-panel-negative-row">
                        <label className="comic-field">
                          <span>
                            {comicText(language, "comic.localNegative")}
                          </span>
                          <textarea
                            value={activePanel.localNegativePrompt}
                            placeholder={comicText(
                              language,
                              "comic.localNegativePlaceholder",
                            )}
                            onChange={(event) =>
                              setProject((prev) =>
                                updatePanel(prev, activePanel.id, (old) => ({
                                  ...old,
                                  localNegativePrompt: event.target.value,
                                })),
                              )
                            }
                          />
                        </label>
                        <label className="comic-field">
                          <span>
                            {comicText(language, "comic.negativeMode")}
                          </span>
                          <select
                            value={activePanel.negativeMode}
                            onChange={(event) =>
                              setProject((prev) =>
                                updatePanel(prev, activePanel.id, (old) => ({
                                  ...old,
                                  negativeMode: event.target
                                    .value as ComicPanel["negativeMode"],
                                })),
                              )
                            }
                          >
                            <option value="append">
                              {comicText(language, "comic.negativeAppend")}
                            </option>
                            <option value="override">
                              {comicText(language, "comic.negativeOverride")}
                            </option>
                          </select>
                        </label>
                      </div>
                    </>
                  ) : null}
                  {panelEditorTab === "params" ? (
                    <section className="comic-panel-params">
                      <Toggle
                        checked={activePanel.paramsOverride.enabled}
                        onChange={(enabled) =>
                          setProject((prev) =>
                            updatePanel(prev, activePanel.id, (old) => ({
                              ...old,
                              paramsOverride: {
                                ...old.paramsOverride,
                                enabled,
                              },
                            })),
                          )
                        }
                        label={comicText(language, "comic.overrideParams")}
                        description={comicText(
                          language,
                          "comic.overrideParamsDesc",
                        )}
                      />
                      {activePanel.paramsOverride.enabled ? (
                        <div className="comic-panel-param-controls">
                          <label className="comic-field">
                            <span>{comicText(language, "comic.model")}</span>
                            <select
                              value={
                                activePanel.paramsOverride.params.model ??
                                project.globalParams.model
                              }
                              onChange={(event) =>
                                patchPanelParam(
                                  activePanel.id,
                                  "model",
                                  event.target.value as NAIModel,
                                )
                              }
                            >
                              {NAI_MODELS.map((model) => (
                                <option key={model.value} value={model.value}>
                                  {localizedDesktopOptionLabel(
                                    language,
                                    model.value,
                                    model.label,
                                  )}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="comic-field">
                            <span>{comicText(language, "comic.sampler")}</span>
                            <select
                              value={
                                activePanel.paramsOverride.params.sampler ??
                                project.globalParams.sampler
                              }
                              onChange={(event) =>
                                patchPanelParam(
                                  activePanel.id,
                                  "sampler",
                                  event.target.value as NAISampler,
                                )
                              }
                            >
                              {NAI_SAMPLERS.map((sampler) => (
                                <option
                                  key={sampler.value}
                                  value={sampler.value}
                                >
                                  {localizedDesktopOptionLabel(
                                    language,
                                    sampler.value,
                                    sampler.label,
                                  )}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="comic-field">
                            <span>
                              {comicText(language, "comic.noiseSchedule")}
                            </span>
                            <select
                              value={
                                activePanel.paramsOverride.params
                                  .noiseSchedule ??
                                project.globalParams.noiseSchedule
                              }
                              onChange={(event) =>
                                patchPanelParam(
                                  activePanel.id,
                                  "noiseSchedule",
                                  event.target.value,
                                )
                              }
                            >
                              <option value="native">
                                {comicText(language, "comic.native")}
                              </option>
                              <option value="karras">
                                {comicText(language, "comic.karras")}
                              </option>
                              <option value="exponential">
                                {comicText(language, "comic.exponential")}
                              </option>
                            </select>
                          </label>
                          <NumberInput
                            label={comicText(language, "comic.width")}
                            value={
                              activePanel.paramsOverride.params.width ??
                              project.globalParams.width
                            }
                            min={64}
                            max={1600}
                            step={64}
                            onChange={(value) =>
                              patchPanelParam(activePanel.id, "width", value)
                            }
                          />
                          <NumberInput
                            label={comicText(language, "comic.height")}
                            value={
                              activePanel.paramsOverride.params.height ??
                              project.globalParams.height
                            }
                            min={64}
                            max={1600}
                            step={64}
                            onChange={(value) =>
                              patchPanelParam(activePanel.id, "height", value)
                            }
                          />
                          <NumberInput
                            label={comicText(language, "comic.steps")}
                            value={
                              activePanel.paramsOverride.params.steps ??
                              project.globalParams.steps
                            }
                            min={1}
                            max={50}
                            onChange={(value) =>
                              patchPanelParam(activePanel.id, "steps", value)
                            }
                          />
                          <NumberInput
                            label={comicText(language, "comic.promptGuidance")}
                            value={
                              activePanel.paramsOverride.params.cfgScale ??
                              project.globalParams.cfgScale
                            }
                            min={1}
                            max={10}
                            step={0.1}
                            onChange={(value) =>
                              patchPanelParam(activePanel.id, "cfgScale", value)
                            }
                          />
                          <NumberInput
                            label="CFG Rescale"
                            value={
                              activePanel.paramsOverride.params.cfgRescale ??
                              project.globalParams.cfgRescale
                            }
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(value) =>
                              patchPanelParam(
                                activePanel.id,
                                "cfgRescale",
                                value,
                              )
                            }
                          />
                          <NumberInput
                            label={comicText(language, "comic.seed")}
                            value={
                              activePanel.paramsOverride.params.seed ??
                              project.globalParams.seed
                            }
                            min={0}
                            max={4294967295}
                            onChange={(value) =>
                              patchPanelParam(activePanel.id, "seed", value)
                            }
                          />
                          <label className="comic-field">
                            <span>
                              {comicText(language, "comic.negativePreset")}
                            </span>
                            <select
                              value={
                                activePanel.paramsOverride.params.ucPreset ??
                                project.globalParams.ucPreset
                              }
                              onChange={(event) =>
                                patchPanelParam(
                                  activePanel.id,
                                  "ucPreset",
                                  Number(event.target.value) as UcPreset,
                                )
                              }
                            >
                              {NAI_UC_PRESETS.map((preset) => (
                                <option key={preset.value} value={preset.value}>
                                  {localizedDesktopOptionLabel(
                                    language,
                                    preset.value,
                                    preset.label,
                                  )}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="comic-panel-param-toggles">
                            <Toggle
                              checked={
                                activePanel.paramsOverride.params
                                  .qualityToggle ??
                                project.globalParams.qualityToggle
                              }
                              onChange={(value) =>
                                patchPanelParam(
                                  activePanel.id,
                                  "qualityToggle",
                                  value,
                                )
                              }
                              label="Quality Tags"
                              description={comicText(
                                language,
                                "comic.qualityShortDesc",
                              )}
                            />
                            <Toggle
                              checked={
                                activePanel.paramsOverride.params.variety ??
                                project.globalParams.variety
                              }
                              onChange={(value) =>
                                patchPanelParam(
                                  activePanel.id,
                                  "variety",
                                  value,
                                )
                              }
                              label="Variety+"
                              description={comicText(
                                language,
                                "comic.varietyShortDesc",
                              )}
                            />
                            <Toggle
                              checked={
                                activePanel.paramsOverride.params.smea ??
                                project.globalParams.smea
                              }
                              onChange={(value) =>
                                patchPanelParam(activePanel.id, "smea", value)
                              }
                              label="SMEA"
                              description={comicText(
                                language,
                                "comic.smeaShortDesc",
                              )}
                            />
                            <Toggle
                              checked={
                                activePanel.paramsOverride.params.smeaDyn ??
                                project.globalParams.smeaDyn
                              }
                              onChange={(value) =>
                                patchPanelParam(
                                  activePanel.id,
                                  "smeaDyn",
                                  value,
                                )
                              }
                              label="SMEA Dyn"
                              description={comicText(
                                language,
                                "comic.smeaDynShortDesc",
                              )}
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="comic-empty">
                          {comicText(language, "comic.usingGlobalParams")}
                        </p>
                      )}
                    </section>
                  ) : null}
                  {panelEditorTab === "weights" ? (
                    activePanelTags.length > 0 ? (
                      <div className="comic-weight-tags">
                        {activePanelTags.map((tag, index) => {
                          const parsed = parseWeightedTag(tag);
                          return (
                            <span
                              className="comic-weight-tag"
                              key={`${activePanel.id}-${index}-${tag}`}
                            >
                              <b>{parsed.core}</b>
                              <small>
                                {formatMultiplier(parsed.level) || "x1.00"}
                              </small>
                              <button
                                onClick={() =>
                                  setProject((prev) =>
                                    updatePanel(prev, activePanel.id, (old) =>
                                      setPanelTagLevel(
                                        old,
                                        index,
                                        parsed.level + 1,
                                      ),
                                    ),
                                  )
                                }
                              >
                                +
                              </button>
                              <button
                                onClick={() =>
                                  setProject((prev) =>
                                    updatePanel(prev, activePanel.id, (old) =>
                                      setPanelTagLevel(
                                        old,
                                        index,
                                        parsed.level - 1,
                                      ),
                                    ),
                                  )
                                }
                              >
                                -
                              </button>
                              <button
                                onClick={() =>
                                  setProject((prev) =>
                                    updatePanel(prev, activePanel.id, (old) =>
                                      setPanelTagLevel(old, index, 0),
                                    ),
                                  )
                                }
                              >
                                {comicText(language, "comic.reset")}
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="comic-empty">
                        {comicText(language, "comic.noAdjustTags")}
                      </p>
                    )
                  ) : null}
                </div>
              </article>
            </div>
          )}
        </section>
      )}

      {step === "generate" && (
        <section className="comic-card">
          <div className="comic-section-title">
            <strong>{comicText(language, "comic.generateHeading")}</strong>
            <span>
              {comicFormat(language, "comic.convertedMetric", {
                converted: convertedCount,
                total: panels.length,
              })}
            </span>
          </div>
          <div className="comic-cost-row">
            <div className="comic-cost-card">
              <strong>
                {account.anlasBalance ?? comicText(language, "comic.unknown")}
              </strong>
              <span>{comicText(language, "comic.balance")}</span>
            </div>
            <div className="comic-cost-card">
              <strong>
                {queueQuoteLoading
                  ? comicText(language, "comic.quoting")
                  : queueAnlasQuote != null
                    ? queueAnlasQuote
                    : comicText(language, "comic.unavailable")}
              </strong>
              <span>
                {comicFormat(language, "comic.quoteBefore", {
                  target: quoteTargetLabel,
                })}
              </span>
            </div>
            <div className="comic-cost-card">
              <strong>
                {queueAnlasSpent != null
                  ? queueAnlasSpent
                  : comicText(language, "comic.waiting")}
              </strong>
              <span>{comicText(language, "comic.actualSpent")}</span>
            </div>
            <div className="comic-cost-card">
              <strong>
                {doneCount}/{panels.length}
              </strong>
              <span>{comicText(language, "comic.completedPanels")}</span>
            </div>
          </div>

          {!queueRunning ? (
            <>
              <div className="comic-toggle-row" style={{ marginBottom: 12 }}>
                <Toggle
                  checked={project.autoExportZip}
                  onChange={(value) => patchProject({ autoExportZip: value })}
                  label={comicText(language, "comic.autoZipLabel")}
                  description={comicText(language, "comic.autoZipDesc")}
                />
              </div>
              <div className="comic-actions" style={{ marginTop: 4 }}>
                <Button
                  onClick={() => void startQueue(ungeneratedPanels)}
                  variant="primary"
                  disabled={!ungeneratedPanels.length}
                >
                  {comicFormat(language, "comic.generateUngenerated", {
                    count: ungeneratedPanels.length,
                  })}
                </Button>
                <Button
                  onClick={() => void startQueue(unconvertedPanels)}
                  disabled={!unconvertedPanels.length}
                >
                  {comicFormat(language, "comic.generateUnconverted", {
                    count: unconvertedPanels.length,
                  })}
                </Button>
                <Button
                  onClick={() => void startQueue(explicitlySelectedPanels)}
                  disabled={!explicitlySelectedPanels.length}
                >
                  {comicFormat(language, "comic.generateSelected", {
                    count: explicitlySelectedPanels.length,
                  })}
                </Button>
                <Button
                  onClick={() =>
                    setSelectedIds(new Set(panels.map((panel) => panel.id)))
                  }
                >
                  {comicText(language, "comic.selectAll")}
                </Button>
                <Button
                  onClick={() => setSelectedIds(new Set())}
                  disabled={!selectedIds.size}
                >
                  {comicText(language, "comic.clearSelection")}
                </Button>
                <Button
                  onClick={() => void exportProjectZip()}
                  disabled={!doneCount || busy === "exportZip"}
                >
                  {busy === "exportZip"
                    ? comicText(language, "comic.exportZipBusy")
                    : comicText(language, "comic.exportZip")}
                </Button>
                <span className="comic-empty">
                  {comicText(language, "comic.regenerateHint")}
                </span>
              </div>
              {queueQuoteError ? (
                <div className="comic-quote-error">
                  {comicFormat(language, "comic.quoteFailed", {
                    message: queueQuoteError,
                  })}
                </div>
              ) : null}
            </>
          ) : (
            <div className="comic-queue">
              <div className="comic-progress">
                <div
                  className="comic-progress-fill"
                  style={{
                    width: `${queue ? Math.round((queue.done / Math.max(1, queue.total)) * 100) : 0}%`,
                  }}
                />
              </div>
              <div className="comic-queue-status">
                {queue?.paused
                  ? comicText(language, "comic.queuePaused")
                  : comicText(language, "comic.queueGenerating")}{" "}
                · {queue?.done}/{queue?.total}
              </div>
              <div className="comic-queue-controls">
                {queue?.paused ? (
                  <Button
                    onClick={() => {
                      queueRef.current.paused = false;
                      setQueue((q) => (q ? { ...q, paused: false } : q));
                    }}
                    variant="primary"
                  >
                    {comicText(language, "comic.continue")}
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      queueRef.current.paused = true;
                      setQueue((q) => (q ? { ...q, paused: true } : q));
                    }}
                  >
                    {comicText(language, "comic.pause")}
                  </Button>
                )}
                <Button
                  variant="danger"
                  onClick={() => {
                    queueRef.current.cancelled = true;
                    queueRef.current.paused = false;
                    // Abort the panel that is mid-flight, not just the queue —
                    // otherwise the current paid request keeps running and bills.
                    void window.naiDesktop.cancel();
                  }}
                >
                  {comicText(language, "comic.cancel")}
                </Button>
              </div>
            </div>
          )}

          <div className="comic-thumbs">
            {panels.map((panel) => (
              <div
                className={clsx(
                  "comic-thumb",
                  panel.status,
                  selectedIds.has(panel.id) && "selected",
                )}
                key={panel.id}
                title={panel.error || panel.cnPrompt}
              >
                <label className="comic-thumb-select">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(panel.id)}
                    onChange={() => toggleSelected(panel.id)}
                  />
                  <span>
                    {comicFormat(language, "comic.selectPanel", {
                      index: panel.index,
                    })}
                  </span>
                </label>
                {panel.outputUrl ? (
                  <img
                    src={panel.outputUrl}
                    alt={`#${panel.index}`}
                    loading="lazy"
                    decoding="async"
                    onError={() => markPanelImageUnavailable(panel.id)}
                  />
                ) : (
                  <div className="comic-thumb-empty">#{panel.index}</div>
                )}
                <span>#{panel.index}</span>
                <Button
                  variant={
                    panel.outputUrl
                      ? "secondary"
                      : panel.status === "failed"
                        ? "danger"
                        : "secondary"
                  }
                  onClick={() => void startQueue([panel])}
                  disabled={queueRunning}
                >
                  {panel.outputUrl
                    ? comicText(language, "comic.regenerate")
                    : panel.status === "failed"
                      ? comicText(language, "comic.retry")
                      : comicText(language, "comic.generate")}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {generationLog && <div className="comic-log">{generationLog}</div>}
    </main>
  );
}
