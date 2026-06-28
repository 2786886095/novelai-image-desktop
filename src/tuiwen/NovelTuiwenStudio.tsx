import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Button, NumberInput } from "../components/ui";
import { getTuiwenStudioText, normalizeAppLanguage } from "../i18n";
import { useAppStore } from "../store";
import type {
  AnlasQuoteResult,
  AppLanguage,
  ComicReferenceAsset,
  ComicReferenceKind,
  ReversePromptScope,
  TuiwenAspectRatio,
  TuiwenKeyframePreset,
  TuiwenProject,
  TuiwenShot,
  TuiwenTransition,
  TuiwenExportJianYingResult,
  TuiwenTtsProviderId,
  TuiwenTtsProviderInfo,
  TuiwenTtsVoice,
} from "../types";
import {
  applyTuiwenAspectToParams,
  buildTuiwenAspectPlan,
  TUIWEN_CANVAS_PRESETS,
} from "./aspect";
import {
  analyzeTuiwenNarrationPacing,
  encodeTuiwenPcm16Wav,
  estimateTuiwenNarrationDurationMs,
  sliceTuiwenPcm,
  splitTuiwenNarration,
} from "./audio";
import { parseTuiwenTextFile } from "./import";
import {
  insertTuiwenShotAfter,
  mergeTuiwenShotWithNext,
  moveTuiwenShot,
  reindexTuiwenShots,
  removeTuiwenShot,
} from "./edit";
import {
  createDefaultTuiwenProject,
  createTuiwenShot,
  DEFAULT_TUIWEN_KEYFRAME,
  DEFAULT_TUIWEN_TITLE,
  normalizeTuiwenProject,
  shouldRestoreTuiwenSnapshot,
  splitNovelTextToNarration,
  TUIWEN_STEPS,
  type TuiwenStepKey,
} from "./project";
import {
  applyTuiwenGenerationResultToShot,
  buildTuiwenQuoteGroups,
  distributeTuiwenGroupAnlas,
  getTuiwenPendingGenerationShots,
  resolveTuiwenActualAnlas,
} from "./generation";

type TuiwenGenerationQuoteResult = AnlasQuoteResult & {
  perShotAnlas?: Record<string, number>;
};

function uid() {
  return (
    crypto.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
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

function dataUrlFromBase64(base64: string) {
  return base64.startsWith("data:")
    ? base64
    : `data:image/png;base64,${base64}`;
}

const TUIWEN_UI_TEXT: Record<AppLanguage, Record<string, string>> = {
  "zh-CN": {
    "status.done": "已生图",
    "status.converted": "已转提示词",
    "status.failed": "失败",
    "status.generating": "生成中",
    "status.pending": "待生图",
    "status.draft": "草稿",
    "ref.kind.precise": "精准参考",
    "ref.kind.character": "角色参考",
    "ref.kind.scene": "场景参考",
    "ref.kind.object": "物品参考",
    "ref.kind.vibe": "氛围迁移",
    "ref.scope.full": "整张图片",
    "ref.scope.character": "角色",
    "ref.scope.object": "物品",
    "ref.scope.scene": "场景",
    "story.title": "分镜 & 旁白",
    "story.hint": "旁白负责配音/字幕，中文画面描述负责生成 NovelAI tags。",
    "story.convertBusy": "转换中...",
    "story.convertAll": "批量生成提示词",
    "story.correctBusy": "校正中...",
    "story.consistency": "一致性校正",
    "story.emptyTitle": "还没有分镜",
    "story.emptyDesc": "先回到“导入”粘贴文本并创建草稿。",
    "story.editorTitle": "#{index} · 旁白与画面",
    "story.moveUp": "上移",
    "story.moveDown": "下移",
    "story.split": "拆分",
    "story.mergeNext": "合并下一镜",
    "story.addNext": "新增下一镜",
    "common.delete": "删除",
    "story.narration": "旁白 / 字幕原文",
    "story.cnPrompt": "中文画面描述（批量生成提示词时转换为 NovelAI tags）",
    "story.enPrompt": "NovelAI 提示词（可批量生成，也可手动精修）",
    "story.durationMs": "时长(ms)",
    "story.subtitle": "字幕",
    "story.subtitleOn": "显示字幕",
    "story.subtitleOff": "隐藏字幕",
    "refs.title": "角色库 / 全局精准参考",
    "refs.hint":
      "上传一次，后续每个分镜都会沿用；V4.5 模型走精准参考，其他模型自动回退为氛围迁移。",
    "refs.upload": "上传参考图",
    "refs.fold": "反推写入全局设定",
    "refs.count": "参考图 {count} 张",
    "refs.enabledCount": "参与生成 {count} 张",
    "refs.preciseCount": "精准/角色 {count} 张",
    "refs.sampleTip": "建议先用 3–5 镜小样验证角色一致性，再放量长队列。",
    "refs.globalSetting": "全局角色 / 场景 / 道具设定",
    "refs.globalPlaceholder":
      "参考图反推、角色固定设定、服装道具、场景规则都可以写在这里；生成提示词与一致性校正会一起参考。",
    "refs.emptyTitle": "还没有参考图",
    "refs.emptyDesc":
      "上传角色立绘、场景图或关键道具图后，可以先视觉反推，再叠加到每个分镜生成。",
    "refs.useForGeneration": "参与每镜生成",
    "refs.kindLabel": "用途",
    "refs.scopeLabel": "反推范围",
    "refs.preciseOption": "精准参考（角色+风格）",
    "refs.strength": "强度",
    "refs.infoExtracted": "信息量",
    "refs.subjectHint": "用户说明 / 固定提示",
    "refs.subjectPlaceholder":
      "例如：这是主角蓝白服装立绘；只提取{scope}，不要描述背景。",
    "refs.reverseResult": "视觉反推结果",
    "refs.reversePlaceholder":
      "点击视觉反推后会写入这里，也可手动整理成稳定角色设定。",
    "refs.reversing": "反推中...",
    "refs.reverse": "视觉反推",
    "gen.title": "批量生图",
    "gen.hint": "复用漫画生图管线；只生成未完成镜头，失败镜头可再次点击继续。",
    "gen.currentBusy": "生成当前镜...",
    "gen.generateOne": "只生成 #{index}",
    "gen.busy": "生成中...",
    "gen.pending": "生成未完成分镜",
    "gen.stop": "停止队列",
    "gen.pendingCount": "本批 {count} 镜待生成",
    "gen.size": "尺寸 {width}×{height}",
    "gen.steps": "步数 {steps}",
    "gen.progress": "进度 {done}/{total}，当前 #{current}",
    "gen.waiting": "等待开始生成。",
    "gen.alt": "分镜 {index}",
    "audio.title": "配音 / 时长",
    "audio.hint":
      "默认 Edge 在线朗读；每镜独立落盘，失败镜头可重试或直接导入音频。",
    "audio.total": "总时长 {seconds} 秒",
    "audio.pendingProvider": "（待配置）",
    "audio.voice": "中文音色",
    "audio.rate": "语速(%)",
    "audio.volume": "音量(%)",
    "audio.splitBusy": "长音频切片中…",
    "audio.splitLong": "按字幕切分长音频",
    "audio.currentBusy": "本镜合成中…",
    "audio.current": "合成当前镜",
    "audio.batchBusy": "批量合成中…",
    "audio.missing": "合成未配音镜头",
    "audio.endpointTitle": "非官方端点提示",
    "audio.endpointDesc":
      "Edge Read Aloud 无 SLA，可能改鉴权、限流或临时断开；成功镜头会保留，失败镜头不会让整批重来。",
    "audio.longDesc":
      "字幕项目可导入一条长配音，程序按 SRT / ASS / LRC 绝对时间码切成 WAV 并逐镜落盘；无需安装 FFmpeg。",
    "audio.audioSuffix": "{seconds}s 音频",
    "audio.defaultSuffix": "{seconds}s 默认",
    "audio.editorTitle": "#{index} · 配音",
    "audio.importShotAudio": "导入本镜音频",
    "audio.narrationText": "旁白文本",
    "audio.estimatedRead": "预计朗读 {seconds} 秒",
    "audio.units": "约 {count} 个朗读单位",
    "audio.tooLong": "单镜过长，建议拆成 {count} 镜，避免画面停留十几秒。",
    "audio.splitSemantic": "一键按语义拆镜",
    "audio.goodPacing": "节奏适合单镜朗读。",
    "audio.shotDuration": "镜头时长(ms)",
    "audio.importedSource": "导入",
    "audio.importedAudio": "{source}音频：{path}",
    "audio.noAudio": "尚未配音；可用 TTS，也可随时导入本镜音频作为可靠回退。",
    "motion.title": "关键帧 / 转场",
    "motion.hint":
      "用统一中间表示保存，后续剪映导出时映射到 common_keyframes。",
    "motion.kenBurns": "Ken Burns 过扫描建议 ×{scale}",
    "motion.replay": "重播预览",
    "motion.preset": "运镜预设",
    "motion.none": "无",
    "motion.zoomIn": "缓慢推近",
    "motion.zoomOut": "缓慢拉远",
    "motion.panLeft": "向左横移",
    "motion.panRight": "向右横移",
    "motion.panUp": "向上移动",
    "motion.panDown": "向下移动",
    "motion.transition": "转场",
    "motion.fade": "淡入淡出",
    "motion.slideLeft": "左滑",
    "motion.slideRight": "右滑",
    "motion.zoom": "缩放",
    "motion.wipe": "擦除",
    "motion.transitionDuration": "转场时长(ms)",
    "motion.previewHint":
      "预览会在末段切到下一镜，是 CSS 近似；真正导出以剪映关键帧与转场格式为准。",
    "motion.emptyTitle": "还没有可设置的分镜",
    "motion.emptyDesc": "先完成导入和分镜。",
    "export.desc":
      "导出会自动探测本机剪映草稿目录，生成 draft_content.json / draft_meta_info.json / draft_virtual_store.json，并把图像、配音和 BGM 一并复制进草稿。",
    "export.draftDir": "剪映草稿目录（可留空）",
    "export.draftPlaceholder":
      "留空时自动探测 JianyingPro 的 com.lveditor.draft 目录",
    "export.introText": "片头文字",
    "export.outroText": "片尾文字",
    "export.introDuration": "片头时长(ms)",
    "export.outroDuration": "片尾时长(ms)",
    "export.chooseBgm": "选择 BGM",
    "export.bgmVolume": "BGM 音量",
    "export.noBgm": "尚未选择 BGM。导出阶段会复制素材进草稿目录。",
    "export.video": "视频 {width}×{height}",
    "export.total": "总时长 {seconds} 秒",
    "export.shots": "分镜 {count} 个",
    "export.target":
      "目标结构：剪映 10.9.0.14196 · draft version 400000 / 164.0.0",
    "export.busy": "导出中...",
    "export.write": "写入剪映草稿",
    "export.openDraft": "打开草稿目录",
    "export.resultDone": "导出完成",
    "export.resultFailed": "导出失败",
    "export.validation": "导入前自检",
    "export.validationPass": "通过",
    "export.validationErrors": "{count} 项错误",
    "export.validationWarnings": "{count} 项警告",
  },
  "zh-TW": {
    "status.done": "已生圖",
    "status.converted": "已轉提示詞",
    "status.failed": "失敗",
    "status.generating": "生成中",
    "status.pending": "待生圖",
    "status.draft": "草稿",
    "ref.kind.precise": "精準參考",
    "ref.kind.character": "角色參考",
    "ref.kind.scene": "場景參考",
    "ref.kind.object": "物品參考",
    "ref.kind.vibe": "氛圍遷移",
    "ref.scope.full": "整張圖片",
    "ref.scope.character": "角色",
    "ref.scope.object": "物品",
    "ref.scope.scene": "場景",
    "story.title": "分鏡 & 旁白",
    "story.hint": "旁白負責配音/字幕，中文畫面描述負責生成 NovelAI tags。",
    "story.convertBusy": "轉換中...",
    "story.convertAll": "批量生成提示詞",
    "story.correctBusy": "校正中...",
    "story.consistency": "一致性校正",
    "story.emptyTitle": "還沒有分鏡",
    "story.emptyDesc": "先回到「匯入」貼上文本並建立草稿。",
    "story.editorTitle": "#{index} · 旁白與畫面",
    "story.moveUp": "上移",
    "story.moveDown": "下移",
    "story.split": "拆分",
    "story.mergeNext": "合併下一鏡",
    "story.addNext": "新增下一鏡",
    "common.delete": "刪除",
    "story.narration": "旁白 / 字幕原文",
    "story.cnPrompt": "中文畫面描述（批量生成提示詞時轉換為 NovelAI tags）",
    "story.enPrompt": "NovelAI 提示詞（可批量生成，也可手動精修）",
    "story.durationMs": "時長(ms)",
    "story.subtitle": "字幕",
    "story.subtitleOn": "顯示字幕",
    "story.subtitleOff": "隱藏字幕",
    "refs.title": "角色庫 / 全域精準參考",
    "refs.hint":
      "上傳一次，後續每個分鏡都會沿用；V4.5 模型走精準參考，其他模型自動回退為氛圍遷移。",
    "refs.upload": "上傳參考圖",
    "refs.fold": "反推寫入全域設定",
    "refs.count": "參考圖 {count} 張",
    "refs.enabledCount": "參與生成 {count} 張",
    "refs.preciseCount": "精準/角色 {count} 張",
    "refs.sampleTip": "建議先用 3–5 鏡小樣驗證角色一致性，再放量長隊列。",
    "refs.globalSetting": "全域角色 / 場景 / 道具設定",
    "refs.globalPlaceholder":
      "參考圖反推、角色固定設定、服裝道具、場景規則都可以寫在這裡；生成提示詞與一致性校正會一起參考。",
    "refs.emptyTitle": "還沒有參考圖",
    "refs.emptyDesc":
      "上傳角色立繪、場景圖或關鍵道具圖後，可以先視覺反推，再疊加到每個分鏡生成。",
    "refs.useForGeneration": "參與每鏡生成",
    "refs.kindLabel": "用途",
    "refs.scopeLabel": "反推範圍",
    "refs.preciseOption": "精準參考（角色+風格）",
    "refs.strength": "強度",
    "refs.infoExtracted": "資訊量",
    "refs.subjectHint": "使用者說明 / 固定提示",
    "refs.subjectPlaceholder":
      "例如：這是主角藍白服裝立繪；只提取{scope}，不要描述背景。",
    "refs.reverseResult": "視覺反推結果",
    "refs.reversePlaceholder":
      "點擊視覺反推後會寫入這裡，也可手動整理成穩定角色設定。",
    "refs.reversing": "反推中...",
    "refs.reverse": "視覺反推",
    "gen.title": "批量生圖",
    "gen.hint": "複用漫畫生圖管線；只生成未完成鏡頭，失敗鏡頭可再次點擊繼續。",
    "gen.currentBusy": "生成目前鏡...",
    "gen.generateOne": "只生成 #{index}",
    "gen.busy": "生成中...",
    "gen.pending": "生成未完成分鏡",
    "gen.stop": "停止隊列",
    "gen.pendingCount": "本批 {count} 鏡待生成",
    "gen.size": "尺寸 {width}×{height}",
    "gen.steps": "步數 {steps}",
    "gen.progress": "進度 {done}/{total}，目前 #{current}",
    "gen.waiting": "等待開始生成。",
    "gen.alt": "分鏡 {index}",
    "audio.title": "配音 / 時長",
    "audio.hint":
      "預設 Edge 線上朗讀；每鏡獨立落盤，失敗鏡頭可重試或直接匯入音訊。",
    "audio.total": "總時長 {seconds} 秒",
    "audio.pendingProvider": "（待配置）",
    "audio.voice": "中文音色",
    "audio.rate": "語速(%)",
    "audio.volume": "音量(%)",
    "audio.splitBusy": "長音訊切片中…",
    "audio.splitLong": "按字幕切分長音訊",
    "audio.currentBusy": "本鏡合成中…",
    "audio.current": "合成目前鏡",
    "audio.batchBusy": "批量合成中…",
    "audio.missing": "合成未配音鏡頭",
    "audio.endpointTitle": "非官方端點提示",
    "audio.endpointDesc":
      "Edge Read Aloud 無 SLA，可能改鑑權、限流或臨時斷開；成功鏡頭會保留，失敗鏡頭不會讓整批重來。",
    "audio.longDesc":
      "字幕專案可匯入一條長配音，程式按 SRT / ASS / LRC 絕對時間碼切成 WAV 並逐鏡落盤；無需安裝 FFmpeg。",
    "audio.audioSuffix": "{seconds}s 音訊",
    "audio.defaultSuffix": "{seconds}s 預設",
    "audio.editorTitle": "#{index} · 配音",
    "audio.importShotAudio": "匯入本鏡音訊",
    "audio.narrationText": "旁白文本",
    "audio.estimatedRead": "預計朗讀 {seconds} 秒",
    "audio.units": "約 {count} 個朗讀單位",
    "audio.tooLong": "單鏡過長，建議拆成 {count} 鏡，避免畫面停留十幾秒。",
    "audio.splitSemantic": "一鍵按語義拆鏡",
    "audio.goodPacing": "節奏適合單鏡朗讀。",
    "audio.shotDuration": "鏡頭時長(ms)",
    "audio.importedSource": "匯入",
    "audio.importedAudio": "{source}音訊：{path}",
    "audio.noAudio": "尚未配音；可用 TTS，也可隨時匯入本鏡音訊作為可靠回退。",
    "motion.title": "關鍵幀 / 轉場",
    "motion.hint":
      "用統一中間表示保存，後續剪映匯出時映射到 common_keyframes。",
    "motion.kenBurns": "Ken Burns 過掃描建議 ×{scale}",
    "motion.replay": "重播預覽",
    "motion.preset": "運鏡預設",
    "motion.none": "無",
    "motion.zoomIn": "緩慢推近",
    "motion.zoomOut": "緩慢拉遠",
    "motion.panLeft": "向左橫移",
    "motion.panRight": "向右橫移",
    "motion.panUp": "向上移動",
    "motion.panDown": "向下移動",
    "motion.transition": "轉場",
    "motion.fade": "淡入淡出",
    "motion.slideLeft": "左滑",
    "motion.slideRight": "右滑",
    "motion.zoom": "縮放",
    "motion.wipe": "擦除",
    "motion.transitionDuration": "轉場時長(ms)",
    "motion.previewHint":
      "預覽會在末段切到下一鏡，是 CSS 近似；真正匯出以剪映關鍵幀與轉場格式為準。",
    "motion.emptyTitle": "還沒有可設定的分鏡",
    "motion.emptyDesc": "先完成匯入和分鏡。",
    "export.desc":
      "匯出會自動探測本機剪映草稿目錄，生成 draft_content.json / draft_meta_info.json / draft_virtual_store.json，並把圖像、配音和 BGM 一併複製進草稿。",
    "export.draftDir": "剪映草稿目錄（可留空）",
    "export.draftPlaceholder":
      "留空時自動探測 JianyingPro 的 com.lveditor.draft 目錄",
    "export.introText": "片頭文字",
    "export.outroText": "片尾文字",
    "export.introDuration": "片頭時長(ms)",
    "export.outroDuration": "片尾時長(ms)",
    "export.chooseBgm": "選擇 BGM",
    "export.bgmVolume": "BGM 音量",
    "export.noBgm": "尚未選擇 BGM。匯出階段會複製素材進草稿目錄。",
    "export.video": "影片 {width}×{height}",
    "export.total": "總時長 {seconds} 秒",
    "export.shots": "分鏡 {count} 個",
    "export.target":
      "目標結構：剪映 10.9.0.14196 · draft version 400000 / 164.0.0",
    "export.busy": "匯出中...",
    "export.write": "寫入剪映草稿",
    "export.openDraft": "開啟草稿目錄",
    "export.resultDone": "匯出完成",
    "export.resultFailed": "匯出失敗",
    "export.validation": "匯入前自檢",
    "export.validationPass": "通過",
    "export.validationErrors": "{count} 項錯誤",
    "export.validationWarnings": "{count} 項警告",
  },
  "en-US": {
    "status.done": "Generated",
    "status.converted": "Prompt ready",
    "status.failed": "Failed",
    "status.generating": "Generating",
    "status.pending": "Pending",
    "status.draft": "Draft",
    "ref.kind.precise": "Precise reference",
    "ref.kind.character": "Character reference",
    "ref.kind.scene": "Scene reference",
    "ref.kind.object": "Object reference",
    "ref.kind.vibe": "Vibe transfer",
    "ref.scope.full": "Full image",
    "ref.scope.character": "Character",
    "ref.scope.object": "Object",
    "ref.scope.scene": "Scene",
    "story.title": "Storyboard & narration",
    "story.hint":
      "Narration drives voice/subtitles; scene descriptions are converted into NovelAI tags.",
    "story.convertBusy": "Converting...",
    "story.convertAll": "Batch-generate prompts",
    "story.correctBusy": "Correcting...",
    "story.consistency": "Consistency pass",
    "story.emptyTitle": "No shots yet",
    "story.emptyDesc": "Go back to Import, paste text, and create a draft.",
    "story.editorTitle": "#{index} · Narration & scene",
    "story.moveUp": "Move up",
    "story.moveDown": "Move down",
    "story.split": "Split",
    "story.mergeNext": "Merge next",
    "story.addNext": "Add next shot",
    "common.delete": "Delete",
    "story.narration": "Narration / subtitle text",
    "story.cnPrompt":
      "Scene description (converted to NovelAI tags during batch prompt generation)",
    "story.enPrompt": "NovelAI prompt (batch-generated or manually refined)",
    "story.durationMs": "Duration (ms)",
    "story.subtitle": "Subtitles",
    "story.subtitleOn": "Show subtitles",
    "story.subtitleOff": "Hide subtitles",
    "refs.title": "Character library / global precise references",
    "refs.hint":
      "Upload once and reuse across shots. V4.5 models use precise reference; other models fall back to vibe transfer.",
    "refs.upload": "Upload reference",
    "refs.fold": "Write reverse prompts to global setup",
    "refs.count": "{count} references",
    "refs.enabledCount": "{count} used for generation",
    "refs.preciseCount": "{count} precise/character refs",
    "refs.sampleTip":
      "Run a 3–5 shot sample first to verify character consistency before a long queue.",
    "refs.globalSetting": "Global character / scene / prop setup",
    "refs.globalPlaceholder":
      "Reference reverse prompts, fixed character settings, outfits, props, and scene rules can live here. Prompt generation and consistency checks will use them.",
    "refs.emptyTitle": "No references yet",
    "refs.emptyDesc":
      "Upload character art, scene images, or key props, reverse them visually, then reuse them for every shot.",
    "refs.useForGeneration": "Use for every shot",
    "refs.kindLabel": "Use",
    "refs.scopeLabel": "Reverse scope",
    "refs.preciseOption": "Precise reference (character + style)",
    "refs.strength": "Strength",
    "refs.infoExtracted": "Info extracted",
    "refs.subjectHint": "User note / fixed hint",
    "refs.subjectPlaceholder":
      "Example: this is the protagonist's blue-white outfit; extract only {scope}, do not describe the background.",
    "refs.reverseResult": "Visual reverse result",
    "refs.reversePlaceholder":
      "Visual reverse output appears here. You can edit it into a stable character setup.",
    "refs.reversing": "Reversing...",
    "refs.reverse": "Visual reverse",
    "gen.title": "Batch image generation",
    "gen.hint":
      "Uses the comic generation pipeline; only unfinished shots are generated, and failed shots can be resumed.",
    "gen.currentBusy": "Generating current shot...",
    "gen.generateOne": "Generate #{index} only",
    "gen.busy": "Generating...",
    "gen.pending": "Generate unfinished shots",
    "gen.stop": "Stop queue",
    "gen.pendingCount": "{count} shots pending",
    "gen.size": "Size {width}×{height}",
    "gen.steps": "{steps} steps",
    "gen.progress": "Progress {done}/{total}, current #{current}",
    "gen.waiting": "Waiting to start.",
    "gen.alt": "Shot {index}",
    "audio.title": "Voice / timing",
    "audio.hint":
      "Edge online read-aloud by default. Each shot is saved separately; failed shots can be retried or replaced with imported audio.",
    "audio.total": "Total {seconds}s",
    "audio.pendingProvider": " (not configured)",
    "audio.voice": "Chinese voice",
    "audio.rate": "Rate (%)",
    "audio.volume": "Volume (%)",
    "audio.splitBusy": "Slicing long audio…",
    "audio.splitLong": "Slice long audio by subtitles",
    "audio.currentBusy": "Synthesizing this shot…",
    "audio.current": "Synthesize current shot",
    "audio.batchBusy": "Batch synthesizing…",
    "audio.missing": "Synthesize missing voice",
    "audio.endpointTitle": "Unofficial endpoint note",
    "audio.endpointDesc":
      "Edge Read Aloud has no SLA and may change auth, throttle, or disconnect. Successful shots are kept; failures will not force the whole batch to restart.",
    "audio.longDesc":
      "Subtitle projects can import one long voice track. The app slices WAV by absolute SRT / ASS / LRC timecodes per shot; FFmpeg is not required.",
    "audio.audioSuffix": "{seconds}s audio",
    "audio.defaultSuffix": "{seconds}s default",
    "audio.editorTitle": "#{index} · Voice",
    "audio.importShotAudio": "Import audio for this shot",
    "audio.narrationText": "Narration text",
    "audio.estimatedRead": "Estimated read {seconds}s",
    "audio.units": "About {count} read units",
    "audio.tooLong":
      "This shot is too long. Split into about {count} shots to avoid a long static frame.",
    "audio.splitSemantic": "Split by meaning",
    "audio.goodPacing": "The pacing fits one shot.",
    "audio.shotDuration": "Shot duration (ms)",
    "audio.importedSource": "Imported",
    "audio.importedAudio": "{source} audio: {path}",
    "audio.noAudio":
      "No voice yet. Use TTS or import audio for this shot as a reliable fallback.",
    "motion.title": "Keyframes / transitions",
    "motion.hint":
      "Stored in a unified intermediate format, then mapped to common_keyframes during Jianying export.",
    "motion.kenBurns": "Ken Burns overscan suggestion ×{scale}",
    "motion.replay": "Replay preview",
    "motion.preset": "Motion preset",
    "motion.none": "None",
    "motion.zoomIn": "Slow zoom in",
    "motion.zoomOut": "Slow zoom out",
    "motion.panLeft": "Pan left",
    "motion.panRight": "Pan right",
    "motion.panUp": "Pan up",
    "motion.panDown": "Pan down",
    "motion.transition": "Transition",
    "motion.fade": "Fade",
    "motion.slideLeft": "Slide left",
    "motion.slideRight": "Slide right",
    "motion.zoom": "Zoom",
    "motion.wipe": "Wipe",
    "motion.transitionDuration": "Transition duration (ms)",
    "motion.previewHint":
      "The preview switches near the end as a CSS approximation. Final export uses Jianying keyframe and transition data.",
    "motion.emptyTitle": "No editable shots yet",
    "motion.emptyDesc": "Finish import and storyboard first.",
    "export.desc":
      "Export auto-detects the local Jianying draft folder, writes draft_content.json / draft_meta_info.json / draft_virtual_store.json, and copies images, voice, and BGM into the draft.",
    "export.draftDir": "Jianying draft folder (optional)",
    "export.draftPlaceholder":
      "Leave empty to auto-detect JianyingPro com.lveditor.draft",
    "export.introText": "Intro text",
    "export.outroText": "Outro text",
    "export.introDuration": "Intro duration (ms)",
    "export.outroDuration": "Outro duration (ms)",
    "export.chooseBgm": "Choose BGM",
    "export.bgmVolume": "BGM volume",
    "export.noBgm":
      "No BGM selected. Export will copy media into the draft folder.",
    "export.video": "Video {width}×{height}",
    "export.total": "Total {seconds}s",
    "export.shots": "{count} shots",
    "export.target":
      "Target: Jianying 10.9.0.14196 · draft version 400000 / 164.0.0",
    "export.busy": "Exporting...",
    "export.write": "Write Jianying draft",
    "export.openDraft": "Open draft folder",
    "export.resultDone": "Export complete",
    "export.resultFailed": "Export failed",
    "export.validation": "Pre-import validation",
    "export.validationPass": "passed",
    "export.validationErrors": "{count} errors",
    "export.validationWarnings": "{count} warnings",
  },
  "ja-JP": {},
  "ko-KR": {},
};

TUIWEN_UI_TEXT["ja-JP"] = {
  ...TUIWEN_UI_TEXT["en-US"],
  "status.done": "生成済み",
  "status.converted": "プロンプト済み",
  "status.failed": "失敗",
  "status.generating": "生成中",
  "status.pending": "生成待ち",
  "status.draft": "下書き",
  "ref.kind.precise": "精密参照",
  "ref.kind.character": "キャラクター参照",
  "ref.kind.scene": "シーン参照",
  "ref.kind.object": "オブジェクト参照",
  "ref.kind.vibe": "Vibe 転送",
  "ref.scope.full": "画像全体",
  "ref.scope.character": "キャラクター",
  "ref.scope.object": "オブジェクト",
  "ref.scope.scene": "シーン",
  "story.title": "絵コンテ & ナレーション",
  "story.hint":
    "ナレーションは音声/字幕に使い、シーン説明は NovelAI tags に変換します。",
  "story.convertBusy": "変換中...",
  "story.convertAll": "プロンプトを一括生成",
  "story.correctBusy": "補正中...",
  "story.consistency": "一貫性チェック",
  "story.emptyTitle": "カットがありません",
  "story.emptyDesc":
    "「読込」に戻り、テキストを貼り付けて草稿を作成してください。",
  "story.editorTitle": "#{index} · ナレーションとシーン",
  "story.moveUp": "上へ移動",
  "story.moveDown": "下へ移動",
  "story.split": "分割",
  "story.mergeNext": "次と結合",
  "story.addNext": "次のカットを追加",
  "common.delete": "削除",
  "story.narration": "ナレーション / 字幕テキスト",
  "story.cnPrompt": "シーン説明（一括生成時に NovelAI tags へ変換）",
  "story.enPrompt": "NovelAI プロンプト（一括生成または手動調整）",
  "story.durationMs": "長さ(ms)",
  "story.subtitle": "字幕",
  "story.subtitleOn": "字幕を表示",
  "story.subtitleOff": "字幕を隠す",
  "refs.title": "キャラクターライブラリ / 全体精密参照",
  "refs.hint":
    "一度アップロードすれば全カットで再利用できます。V4.5 は精密参照、他モデルは Vibe 転送へフォールバックします。",
  "refs.upload": "参照画像をアップロード",
  "refs.fold": "解析結果を全体設定へ書き込む",
  "refs.count": "参照 {count} 件",
  "refs.enabledCount": "生成に使用 {count} 件",
  "refs.preciseCount": "精密/キャラ参照 {count} 件",
  "refs.sampleTip":
    "長いキューに入る前に、まず 3–5 カットでキャラクター一貫性を確認してください。",
  "refs.globalSetting": "全体キャラクター / シーン / 小物設定",
  "refs.globalPlaceholder":
    "参照画像の解析、固定キャラ設定、衣装、小物、シーン規則をここに書けます。プロンプト生成と一貫性チェックが参照します。",
  "refs.emptyTitle": "参照がありません",
  "refs.emptyDesc":
    "キャラクター立ち絵、シーン画像、重要な小物をアップロードし、視覚解析して各カットで再利用できます。",
  "refs.useForGeneration": "各カットで使用",
  "refs.kindLabel": "用途",
  "refs.scopeLabel": "解析範囲",
  "refs.preciseOption": "精密参照（キャラ+スタイル）",
  "refs.strength": "強度",
  "refs.infoExtracted": "情報量",
  "refs.subjectHint": "ユーザーメモ / 固定ヒント",
  "refs.subjectPlaceholder":
    "例: 主人公の青白い衣装の立ち絵。{scope} だけ抽出し、背景は説明しない。",
  "refs.reverseResult": "視覚解析結果",
  "refs.reversePlaceholder":
    "視覚解析の出力がここに入ります。安定したキャラ設定として編集できます。",
  "refs.reversing": "解析中...",
  "refs.reverse": "視覚解析",
  "gen.title": "一括画像生成",
  "gen.hint":
    "漫画生成パイプラインを使用します。未完了カットのみ生成し、失敗カットは再開できます。",
  "gen.currentBusy": "現在のカットを生成中...",
  "gen.generateOne": "#{index} だけ生成",
  "gen.busy": "生成中...",
  "gen.pending": "未完了カットを生成",
  "gen.stop": "キュー停止",
  "gen.pendingCount": "{count} カット待機中",
  "gen.size": "サイズ {width}×{height}",
  "gen.steps": "{steps} ステップ",
  "gen.progress": "進捗 {done}/{total}、現在 #{current}",
  "gen.waiting": "開始待ちです。",
  "gen.alt": "カット {index}",
  "audio.title": "音声 / 長さ",
  "audio.hint":
    "既定では Edge のオンライン読み上げを使用します。各カットは個別保存され、失敗カットは再試行または音声差し替えできます。",
  "audio.total": "合計 {seconds} 秒",
  "audio.pendingProvider": "（未設定）",
  "audio.voice": "中国語音声",
  "audio.rate": "速度 (%)",
  "audio.volume": "音量 (%)",
  "audio.splitBusy": "長音声を切り出し中…",
  "audio.splitLong": "字幕で長音声を切り出す",
  "audio.currentBusy": "このカットを合成中…",
  "audio.current": "現在カットを合成",
  "audio.batchBusy": "一括合成中…",
  "audio.missing": "未音声カットを合成",
  "audio.endpointTitle": "非公式エンドポイントについて",
  "audio.endpointDesc":
    "Edge Read Aloud は SLA がなく、認証変更、制限、一時切断の可能性があります。成功済みカットは保持され、失敗で全体をやり直す必要はありません。",
  "audio.longDesc":
    "字幕プロジェクトでは 1 本の長い音声を読み込めます。アプリが SRT / ASS / LRC の絶対タイムコードで WAV をカットごとに切り出します。FFmpeg は不要です。",
  "audio.audioSuffix": "{seconds}s 音声",
  "audio.defaultSuffix": "{seconds}s 既定",
  "audio.editorTitle": "#{index} · 音声",
  "audio.importShotAudio": "このカットに音声を読み込み",
  "audio.narrationText": "ナレーションテキスト",
  "audio.estimatedRead": "推定読み上げ {seconds} 秒",
  "audio.units": "約 {count} 読み上げ単位",
  "audio.tooLong":
    "このカットは長すぎます。静止画面が続かないよう、約 {count} カットに分割してください。",
  "audio.splitSemantic": "意味で分割",
  "audio.goodPacing": "このカットに適したテンポです。",
  "audio.shotDuration": "カット長(ms)",
  "audio.importedSource": "読み込み",
  "audio.importedAudio": "{source}音声: {path}",
  "audio.noAudio":
    "音声はまだありません。TTS を使うか、このカットに音声を読み込んで確実な代替にできます。",
  "motion.title": "キーフレーム / トランジション",
  "motion.hint":
    "統一された中間形式で保存し、剪映書き出し時に common_keyframes へマッピングします。",
  "motion.kenBurns": "Ken Burns オーバースキャン推奨 ×{scale}",
  "motion.replay": "プレビュー再生",
  "motion.preset": "モーションプリセット",
  "motion.none": "なし",
  "motion.zoomIn": "ゆっくり寄る",
  "motion.zoomOut": "ゆっくり引く",
  "motion.panLeft": "左へパン",
  "motion.panRight": "右へパン",
  "motion.panUp": "上へパン",
  "motion.panDown": "下へパン",
  "motion.transition": "トランジション",
  "motion.fade": "フェード",
  "motion.slideLeft": "左スライド",
  "motion.slideRight": "右スライド",
  "motion.zoom": "ズーム",
  "motion.wipe": "ワイプ",
  "motion.transitionDuration": "トランジション長(ms)",
  "motion.previewHint":
    "プレビューは CSS 近似として終盤に次カットへ切り替わります。実際の書き出しは剪映のキーフレーム/トランジションデータを使用します。",
  "motion.emptyTitle": "編集できるカットがありません",
  "motion.emptyDesc": "先に読み込みと絵コンテを完了してください。",
  "export.desc":
    "書き出しではローカルの剪映草稿フォルダを自動検出し、draft_content.json / draft_meta_info.json / draft_virtual_store.json を作成して、画像・音声・BGM を草稿へコピーします。",
  "export.draftDir": "剪映草稿フォルダ（任意）",
  "export.draftPlaceholder":
    "空欄なら JianyingPro の com.lveditor.draft を自動検出",
  "export.introText": "冒頭テキスト",
  "export.outroText": "末尾テキスト",
  "export.introDuration": "冒頭長(ms)",
  "export.outroDuration": "末尾長(ms)",
  "export.chooseBgm": "BGM を選択",
  "export.bgmVolume": "BGM 音量",
  "export.noBgm":
    "BGM は未選択です。書き出し時に素材を草稿フォルダへコピーします。",
  "export.video": "動画 {width}×{height}",
  "export.total": "合計 {seconds} 秒",
  "export.shots": "{count} カット",
  "export.target": "対象: 剪映 10.9.0.14196 · draft version 400000 / 164.0.0",
  "export.busy": "書き出し中...",
  "export.write": "剪映ドラフトを書き出し",
  "export.openDraft": "草稿フォルダを開く",
  "export.resultDone": "書き出し完了",
  "export.resultFailed": "書き出し失敗",
  "export.validation": "読み込み前チェック",
  "export.validationPass": "合格",
  "export.validationErrors": "{count} 件のエラー",
  "export.validationWarnings": "{count} 件の警告",
};
TUIWEN_UI_TEXT["ko-KR"] = {
  ...TUIWEN_UI_TEXT["en-US"],
  "status.done": "생성됨",
  "status.converted": "프롬프트 완료",
  "status.failed": "실패",
  "status.generating": "생성 중",
  "status.pending": "생성 대기",
  "status.draft": "초안",
  "ref.kind.precise": "정밀 참조",
  "ref.kind.character": "캐릭터 참조",
  "ref.kind.scene": "장면 참조",
  "ref.kind.object": "물체 참조",
  "ref.kind.vibe": "Vibe 전송",
  "ref.scope.full": "전체 이미지",
  "ref.scope.character": "캐릭터",
  "ref.scope.object": "물체",
  "ref.scope.scene": "장면",
  "story.title": "스토리보드 & 내레이션",
  "story.hint":
    "내레이션은 음성/자막에 사용하고, 장면 설명은 NovelAI tags로 변환합니다.",
  "story.convertBusy": "변환 중...",
  "story.convertAll": "프롬프트 일괄 생성",
  "story.correctBusy": "보정 중...",
  "story.consistency": "일관성 보정",
  "story.emptyTitle": "아직 컷이 없습니다",
  "story.emptyDesc": "가져오기로 돌아가 텍스트를 붙여넣고 초안을 만드세요.",
  "story.editorTitle": "#{index} · 내레이션과 장면",
  "story.moveUp": "위로 이동",
  "story.moveDown": "아래로 이동",
  "story.split": "분할",
  "story.mergeNext": "다음 컷 병합",
  "story.addNext": "다음 컷 추가",
  "common.delete": "삭제",
  "story.narration": "내레이션 / 자막 원문",
  "story.cnPrompt": "장면 설명(일괄 생성 시 NovelAI tags로 변환)",
  "story.enPrompt": "NovelAI 프롬프트(일괄 생성 또는 수동 보정)",
  "story.durationMs": "길이(ms)",
  "story.subtitle": "자막",
  "story.subtitleOn": "자막 표시",
  "story.subtitleOff": "자막 숨김",
  "refs.title": "캐릭터 라이브러리 / 전역 정밀 참조",
  "refs.hint":
    "한 번 업로드하면 모든 컷에서 재사용됩니다. V4.5 모델은 정밀 참조를 사용하고, 다른 모델은 Vibe 전송으로 되돌아갑니다.",
  "refs.upload": "참조 이미지 업로드",
  "refs.fold": "분석 결과를 전역 설정에 쓰기",
  "refs.count": "참조 {count}개",
  "refs.enabledCount": "생성에 사용 {count}개",
  "refs.preciseCount": "정밀/캐릭터 참조 {count}개",
  "refs.sampleTip":
    "긴 대기열 전에 먼저 3–5컷 샘플로 캐릭터 일관성을 확인하세요.",
  "refs.globalSetting": "전역 캐릭터 / 장면 / 소품 설정",
  "refs.globalPlaceholder":
    "참조 이미지 분석, 고정 캐릭터 설정, 의상, 소품, 장면 규칙을 여기에 적을 수 있습니다. 프롬프트 생성과 일관성 보정에서 함께 참조합니다.",
  "refs.emptyTitle": "참조가 없습니다",
  "refs.emptyDesc":
    "캐릭터 일러스트, 장면 이미지, 핵심 소품을 업로드하고 시각 분석한 뒤 모든 컷에서 재사용할 수 있습니다.",
  "refs.useForGeneration": "각 컷에 사용",
  "refs.kindLabel": "용도",
  "refs.scopeLabel": "분석 범위",
  "refs.preciseOption": "정밀 참조(캐릭터+스타일)",
  "refs.strength": "강도",
  "refs.infoExtracted": "정보량",
  "refs.subjectHint": "사용자 메모 / 고정 힌트",
  "refs.subjectPlaceholder":
    "예: 주인공의 파란색/흰색 의상 일러스트입니다. {scope}만 추출하고 배경은 설명하지 마세요.",
  "refs.reverseResult": "시각 분석 결과",
  "refs.reversePlaceholder":
    "시각 분석 출력이 여기에 표시됩니다. 안정적인 캐릭터 설정으로 편집할 수 있습니다.",
  "refs.reversing": "분석 중...",
  "refs.reverse": "시각 분석",
  "gen.title": "일괄 이미지 생성",
  "gen.hint":
    "만화 생성 파이프라인을 사용합니다. 미완료 컷만 생성하며 실패 컷은 이어서 재시도할 수 있습니다.",
  "gen.currentBusy": "현재 컷 생성 중...",
  "gen.generateOne": "#{index}만 생성",
  "gen.busy": "생성 중...",
  "gen.pending": "미완료 컷 생성",
  "gen.stop": "대기열 중지",
  "gen.pendingCount": "{count}컷 대기 중",
  "gen.size": "크기 {width}×{height}",
  "gen.steps": "{steps} 스텝",
  "gen.progress": "진행 {done}/{total}, 현재 #{current}",
  "gen.waiting": "시작 대기 중입니다.",
  "gen.alt": "컷 {index}",
  "audio.title": "음성 / 길이",
  "audio.hint":
    "기본은 Edge 온라인 읽기입니다. 각 컷은 별도로 저장되며 실패 컷은 재시도하거나 가져온 오디오로 교체할 수 있습니다.",
  "audio.total": "총 {seconds}초",
  "audio.pendingProvider": " (미설정)",
  "audio.voice": "중국어 음성",
  "audio.rate": "속도 (%)",
  "audio.volume": "볼륨 (%)",
  "audio.splitBusy": "긴 오디오 자르는 중…",
  "audio.splitLong": "자막 기준으로 긴 오디오 자르기",
  "audio.currentBusy": "이 컷 합성 중…",
  "audio.current": "현재 컷 합성",
  "audio.batchBusy": "일괄 합성 중…",
  "audio.missing": "음성 없는 컷 합성",
  "audio.endpointTitle": "비공식 엔드포인트 안내",
  "audio.endpointDesc":
    "Edge Read Aloud는 SLA가 없으며 인증 변경, 제한, 일시 연결 해제가 있을 수 있습니다. 성공한 컷은 유지되고, 실패해도 전체 배치를 다시 시작하지 않습니다.",
  "audio.longDesc":
    "자막 프로젝트는 긴 음성 트랙 하나를 가져올 수 있습니다. 앱이 SRT / ASS / LRC 절대 타임코드에 맞춰 WAV를 컷별로 자르며 FFmpeg는 필요 없습니다.",
  "audio.audioSuffix": "{seconds}s 오디오",
  "audio.defaultSuffix": "{seconds}s 기본",
  "audio.editorTitle": "#{index} · 음성",
  "audio.importShotAudio": "이 컷에 오디오 가져오기",
  "audio.narrationText": "내레이션 텍스트",
  "audio.estimatedRead": "예상 읽기 {seconds}초",
  "audio.units": "약 {count} 읽기 단위",
  "audio.tooLong":
    "이 컷은 너무 깁니다. 긴 정지 화면을 피하려면 약 {count}컷으로 나누세요.",
  "audio.splitSemantic": "의미 기준 분할",
  "audio.goodPacing": "한 컷에 적합한 리듬입니다.",
  "audio.shotDuration": "컷 길이(ms)",
  "audio.importedSource": "가져오기",
  "audio.importedAudio": "{source} 오디오: {path}",
  "audio.noAudio":
    "아직 음성이 없습니다. TTS를 사용하거나 이 컷에 오디오를 가져와 안정적인 대체로 사용할 수 있습니다.",
  "motion.title": "키프레임 / 전환",
  "motion.hint":
    "통합 중간 형식으로 저장한 뒤 Jianying 내보내기 때 common_keyframes로 매핑합니다.",
  "motion.kenBurns": "Ken Burns 오버스캔 권장 ×{scale}",
  "motion.replay": "미리보기 다시 재생",
  "motion.preset": "모션 프리셋",
  "motion.none": "없음",
  "motion.zoomIn": "천천히 확대",
  "motion.zoomOut": "천천히 축소",
  "motion.panLeft": "왼쪽으로 이동",
  "motion.panRight": "오른쪽으로 이동",
  "motion.panUp": "위로 이동",
  "motion.panDown": "아래로 이동",
  "motion.transition": "전환",
  "motion.fade": "페이드",
  "motion.slideLeft": "왼쪽 슬라이드",
  "motion.slideRight": "오른쪽 슬라이드",
  "motion.zoom": "줌",
  "motion.wipe": "와이프",
  "motion.transitionDuration": "전환 길이(ms)",
  "motion.previewHint":
    "미리보기는 CSS 근사로 마지막 부분에서 다음 컷으로 전환됩니다. 실제 내보내기는 Jianying 키프레임/전환 데이터를 사용합니다.",
  "motion.emptyTitle": "편집할 수 있는 컷이 없습니다",
  "motion.emptyDesc": "먼저 가져오기와 스토리보드를 완료하세요.",
  "export.desc":
    "내보내기는 로컬 Jianying 초안 폴더를 자동 감지하고 draft_content.json / draft_meta_info.json / draft_virtual_store.json을 작성하며 이미지, 음성, BGM을 초안에 복사합니다.",
  "export.draftDir": "Jianying 초안 폴더(선택)",
  "export.draftPlaceholder":
    "비워두면 JianyingPro의 com.lveditor.draft를 자동 감지",
  "export.introText": "인트로 텍스트",
  "export.outroText": "아웃트로 텍스트",
  "export.introDuration": "인트로 길이(ms)",
  "export.outroDuration": "아웃트로 길이(ms)",
  "export.chooseBgm": "BGM 선택",
  "export.bgmVolume": "BGM 볼륨",
  "export.noBgm":
    "BGM을 선택하지 않았습니다. 내보내기 단계에서 미디어를 초안 폴더로 복사합니다.",
  "export.video": "영상 {width}×{height}",
  "export.total": "총 {seconds}초",
  "export.shots": "{count}컷",
  "export.target":
    "대상: Jianying 10.9.0.14196 · draft version 400000 / 164.0.0",
  "export.busy": "내보내는 중...",
  "export.write": "Jianying 초안 쓰기",
  "export.openDraft": "초안 폴더 열기",
  "export.resultDone": "내보내기 완료",
  "export.resultFailed": "내보내기 실패",
  "export.validation": "가져오기 전 검사",
  "export.validationPass": "통과",
  "export.validationErrors": "{count}개 오류",
  "export.validationWarnings": "{count}개 경고",
};

const TUIWEN_RUNTIME_TEXT: Record<AppLanguage, Record<string, string>> = {
  "zh-CN": {
    "msg.projectDefault": "小说推文项目",
    "msg.unknown": "未知",
    "msg.snapshotRestored": "已恢复上次小说推文快照：{time}。",
    "msg.ttsProviderReadFailed": "读取 TTS Provider 失败：{message}",
    "msg.shotAdded": "已新增空白分镜。",
    "msg.shotMovedUp": "分镜已上移。",
    "msg.shotMovedDown": "分镜已下移。",
    "msg.lastShotNoMerge": "当前已经是最后一镜，无法向后合并。",
    "msg.confirmMerge":
      "合并会清除这两镜已生成的图片/音频绑定，但不会删除磁盘文件。继续吗？",
    "msg.mergedNext":
      "已合并 #{index} 与下一镜；请复核画面提示词并重新生图/配音。",
    "msg.confirmDeleteShot":
      "删除分镜会移除项目内的图片/音频绑定，但不会删除磁盘文件。继续吗？",
    "msg.shotRemoved": "分镜已从项目中移除。",
    "msg.refsAdded": "已加入 {count} 张全局参考图。",
    "msg.refsReadFailed": "读取参考图失败：{message}",
    "msg.reverseFailed": "参考图反推失败：{message}",
    "msg.noRefsToFold": "没有可写入全局设定的角色、场景或物品反推结果。",
    "msg.refsFolded": "已把 {count} 条参考设定写入全局角色设定。",
    "msg.pasteFirst": "请先粘贴小说正文或字幕文本。",
    "msg.pastedText": "粘贴文本",
    "msg.draftCreated": "已创建 {count} 个旁白分镜草稿。",
    "msg.projectImported": "已导入小说推文项目：{count} 镜。",
    "msg.importFailed": "导入失败：{message}",
    "msg.unknownFileType": "未能识别导入文件类型。",
    "msg.textImported": "已导入 {file}，创建 {count} 个{unit}分镜。",
    "msg.unitSubtitle": "字幕",
    "msg.unitNarration": "旁白",
    "msg.textImportFailed": "导入文本失败：{message}",
    "msg.importOrPasteFirst": "请先导入或粘贴小说正文。",
    "msg.llmSplitDone": "LLM 分镜完成：{count} 镜。",
    "msg.llmSplitFailed": "LLM 分镜失败：{message}",
    "msg.noConvertible": "没有可转换的分镜。",
    "msg.convertDone": "提示词转换完成：成功 {ok}/{total}{message}",
    "msg.convertFailed": "提示词转换失败：{message}",
    "msg.convertFirst": "请先批量转换 NovelAI 提示词。",
    "msg.consistencyFailed": "一致性校正失败：{message}",
    "msg.quotedGroups": "已按 {groups} 组参数报价 {count} 镜。",
    "msg.noGeneratable": "没有可生成的分镜。",
    "msg.needToken": "请先在设置里配置 NovelAI Token。",
    "msg.quoteFailed": "生成报价失败：{message}",
    "msg.confirmInsufficient":
      "预计消耗 {amount} Anlas，余额 {balance}。仍要继续吗？",
    "msg.queueCancelled": "已取消小说推文生图队列。",
    "msg.queueStart":
      "预计消耗 {amount} Anlas（{source}），开始生成 {count} 镜。",
    "msg.queuePaused":
      "队列已暂停：已处理 {done}/{total} 镜，点击“生成未完成分镜”可续跑。",
    "msg.generatingShot": "正在生成 #{index}（{current}/{total}）...",
    "msg.queueStopped": "队列已停止：{message}",
    "msg.queueDone": "小说推文生图队列已结束；失败镜头可保留状态后单独重试。",
    "msg.queueDoneToast": "小说推文生图队列已结束。",
    "msg.generationFailed": "小说推文生图失败：{message}",
    "msg.stoppingQueue": "正在停止队列：当前请求结束后不会继续下一镜。",
    "msg.stopRequested": "已请求停止队列；当前镜头结束后可直接续跑未完成分镜。",
    "msg.noShotPrompt": "当前分镜没有可生成的提示词。",
    "msg.singleQuoteFailed": "当前镜头报价失败：{message}",
    "msg.confirmSingleInsufficient":
      "当前镜头预计消耗 {amount} Anlas，余额 {balance}。仍要继续吗？",
    "msg.singleDone": "#{index} 已生成。",
    "msg.singleFailed": "#{index} 生成失败：{message}",
    "msg.currentFailed": "当前镜头生成失败：{message}",
    "msg.audioDurationError": "无法读取音频时长",
    "msg.shotAudioImported": "已为 #{index} 导入音频，时长 {seconds} 秒。",
    "msg.audioReadFailed": "读取音频失败：{message}",
    "msg.needTimedSubtitle":
      "长音频切片需要先导入带时间码的 SRT / ASS / LRC 字幕。",
    "msg.audioTooLarge": "长音频超过 500MB，请先压缩或拆分后再导入。",
    "msg.decodingAudio": "正在解码 {file}…",
    "msg.slicingAudio": "正在按字幕切分 {file}：{current}/{total}（#{index}）",
    "msg.audioSliceSummary": "长音频切片完成：成功 {ok}/{total} 镜。",
    "msg.audioSliceRetry": "{summary} {fail} 镜可单独导入或重试。",
    "msg.audioDecodeFailed": "长音频解码失败：{message}",
    "msg.audioDecodeRecovery":
      "{message}\n可改用 WAV/MP3/M4A，或继续逐镜导入音频。",
    "msg.noNarrationActive": "当前镜头没有可合成的旁白。",
    "msg.noNarrationPending": "没有待配音的镜头。",
    "msg.providerNotConfigured":
      "{provider}尚未配置，请使用 Edge TTS 或导入配音。",
    "msg.ttsSynthesizing": "正在合成 {count} 镜配音…",
    "msg.ttsFallbackFailure": "合成失败",
    "msg.ttsCallFailed": "TTS 调用失败：{message}",
    "msg.ttsRecovery": "{message}\n可继续使用“导入本镜音频”，项目不会丢失。",
    "msg.noSplitNeeded": "当前旁白不需要拆分。",
    "msg.splitNarrationDone":
      "已把当前长旁白拆成 {count} 镜；新增镜头需要补图或复用画面。",
    "msg.noExportable": "没有可导出的分镜。",
    "msg.jianyingExportFailed": "剪映草稿导出失败：{message}",
  },
  "zh-TW": {},
  "en-US": {
    "msg.projectDefault": "Novel video project",
    "msg.unknown": "Unknown",
    "msg.snapshotRestored":
      "Restored the previous novel-video snapshot: {time}.",
    "msg.ttsProviderReadFailed": "Failed to read TTS providers: {message}",
    "msg.shotAdded": "Added a blank shot.",
    "msg.shotMovedUp": "Shot moved up.",
    "msg.shotMovedDown": "Shot moved down.",
    "msg.lastShotNoMerge":
      "This is already the last shot and cannot be merged forward.",
    "msg.confirmMerge":
      "Merging will clear the image/audio bindings for these two shots, but will not delete disk files. Continue?",
    "msg.mergedNext":
      "Merged #{index} with the next shot. Please review prompts and regenerate image/voice.",
    "msg.confirmDeleteShot":
      "Deleting this shot removes image/audio bindings from the project, but will not delete disk files. Continue?",
    "msg.shotRemoved": "Shot removed from the project.",
    "msg.refsAdded": "Added {count} global references.",
    "msg.refsReadFailed": "Failed to read reference images: {message}",
    "msg.reverseFailed": "Reference reverse failed: {message}",
    "msg.noRefsToFold":
      "No character, scene, or object reverse results can be written to the global setup.",
    "msg.refsFolded":
      "Wrote {count} reference notes into the global character setup.",
    "msg.pasteFirst": "Paste novel or subtitle text first.",
    "msg.pastedText": "Pasted text",
    "msg.draftCreated": "Created {count} narration-shot drafts.",
    "msg.projectImported": "Imported novel-video project: {count} shots.",
    "msg.importFailed": "Import failed: {message}",
    "msg.unknownFileType": "Could not identify the imported file type.",
    "msg.textImported": "Imported {file}; created {count} {unit} shots.",
    "msg.unitSubtitle": "subtitle",
    "msg.unitNarration": "narration",
    "msg.textImportFailed": "Text import failed: {message}",
    "msg.importOrPasteFirst": "Import or paste novel text first.",
    "msg.llmSplitDone": "LLM storyboard complete: {count} shots.",
    "msg.llmSplitFailed": "LLM storyboard failed: {message}",
    "msg.noConvertible": "No shots are ready to convert.",
    "msg.convertDone":
      "Prompt conversion complete: {ok}/{total} succeeded{message}",
    "msg.convertFailed": "Prompt conversion failed: {message}",
    "msg.convertFirst": "Batch-convert NovelAI prompts first.",
    "msg.consistencyFailed": "Consistency correction failed: {message}",
    "msg.quotedGroups":
      "Quoted {count} shots across {groups} parameter groups.",
    "msg.noGeneratable": "No shots can be generated.",
    "msg.needToken": "Configure your NovelAI Token in Settings first.",
    "msg.quoteFailed": "Generation quote failed: {message}",
    "msg.confirmInsufficient":
      "Estimated cost is {amount} Anlas; balance is {balance}. Continue anyway?",
    "msg.queueCancelled": "Novel-video generation queue cancelled.",
    "msg.queueStart":
      "Estimated cost {amount} Anlas ({source}); starting {count} shots.",
    "msg.queuePaused":
      "Queue paused: processed {done}/{total} shots. Click “Generate unfinished shots” to resume.",
    "msg.generatingShot": "Generating #{index} ({current}/{total})...",
    "msg.queueStopped": "Queue stopped: {message}",
    "msg.queueDone":
      "Novel-video image queue finished; failed shots can be retried individually.",
    "msg.queueDoneToast": "Novel-video image queue finished.",
    "msg.generationFailed": "Novel-video generation failed: {message}",
    "msg.stoppingQueue":
      "Stopping queue: no new shot will start after the current request finishes.",
    "msg.stopRequested":
      "Stop requested; resume unfinished shots after the current shot finishes.",
    "msg.noShotPrompt": "This shot has no prompt to generate.",
    "msg.singleQuoteFailed": "Current-shot quote failed: {message}",
    "msg.confirmSingleInsufficient":
      "This shot is estimated to cost {amount} Anlas; balance is {balance}. Continue anyway?",
    "msg.singleDone": "#{index} generated.",
    "msg.singleFailed": "#{index} failed: {message}",
    "msg.currentFailed": "Current-shot generation failed: {message}",
    "msg.audioDurationError": "Unable to read audio duration",
    "msg.shotAudioImported":
      "Imported audio for #{index}; duration {seconds}s.",
    "msg.audioReadFailed": "Failed to read audio: {message}",
    "msg.needTimedSubtitle":
      "Import SRT / ASS / LRC subtitles with timecodes before slicing long audio.",
    "msg.audioTooLarge":
      "Long audio exceeds 500 MB. Compress or split it before importing.",
    "msg.decodingAudio": "Decoding {file}…",
    "msg.slicingAudio":
      "Slicing {file} by subtitles: {current}/{total} (#{index})",
    "msg.audioSliceSummary":
      "Long audio slicing complete: {ok}/{total} shots succeeded.",
    "msg.audioSliceRetry":
      "{summary} {fail} shots can be imported or retried individually.",
    "msg.audioDecodeFailed": "Long audio decode failed: {message}",
    "msg.audioDecodeRecovery":
      "{message}\nTry WAV/MP3/M4A, or continue importing audio per shot.",
    "msg.noNarrationActive": "The current shot has no narration to synthesize.",
    "msg.noNarrationPending": "No shots need voice synthesis.",
    "msg.providerNotConfigured":
      "{provider} is not configured. Use Edge TTS or import audio.",
    "msg.ttsSynthesizing": "Synthesizing voice for {count} shots…",
    "msg.ttsFallbackFailure": "Synthesis failed",
    "msg.ttsCallFailed": "TTS call failed: {message}",
    "msg.ttsRecovery":
      "{message}\nYou can still use “Import audio for this shot”; the project will not be lost.",
    "msg.noSplitNeeded": "The current narration does not need splitting.",
    "msg.splitNarrationDone":
      "Split the long narration into {count} shots; new shots need images or reused frames.",
    "msg.noExportable": "No shots are available to export.",
    "msg.jianyingExportFailed": "Jianying draft export failed: {message}",
  },
  "ja-JP": {},
  "ko-KR": {},
};

TUIWEN_RUNTIME_TEXT["zh-TW"] = {
  "msg.projectDefault": "小說推文專案",
  "msg.unknown": "未知",
  "msg.snapshotRestored": "已恢復上次小說推文快照：{time}。",
  "msg.ttsProviderReadFailed": "讀取 TTS Provider 失敗：{message}",
  "msg.shotAdded": "已新增空白分鏡。",
  "msg.shotMovedUp": "分鏡已上移。",
  "msg.shotMovedDown": "分鏡已下移。",
  "msg.lastShotNoMerge": "目前已經是最後一鏡，無法向後合併。",
  "msg.confirmMerge":
    "合併會清除這兩鏡已生成的圖片/音訊綁定，但不會刪除磁碟檔案。繼續嗎？",
  "msg.mergedNext":
    "已合併 #{index} 與下一鏡；請複核畫面提示詞並重新生圖/配音。",
  "msg.confirmDeleteShot":
    "刪除分鏡會移除專案內的圖片/音訊綁定，但不會刪除磁碟檔案。繼續嗎？",
  "msg.shotRemoved": "分鏡已從專案中移除。",
  "msg.refsAdded": "已加入 {count} 張全域參考圖。",
  "msg.refsReadFailed": "讀取參考圖失敗：{message}",
  "msg.reverseFailed": "參考圖反推失敗：{message}",
  "msg.noRefsToFold": "沒有可寫入全域設定的角色、場景或物品反推結果。",
  "msg.refsFolded": "已把 {count} 條參考設定寫入全域角色設定。",
  "msg.pasteFirst": "請先貼上小說正文或字幕文本。",
  "msg.pastedText": "貼上文本",
  "msg.draftCreated": "已建立 {count} 個旁白分鏡草稿。",
  "msg.projectImported": "已匯入小說推文專案：{count} 鏡。",
  "msg.importFailed": "匯入失敗：{message}",
  "msg.unknownFileType": "未能識別匯入檔案類型。",
  "msg.textImported": "已匯入 {file}，建立 {count} 個{unit}分鏡。",
  "msg.unitSubtitle": "字幕",
  "msg.unitNarration": "旁白",
  "msg.textImportFailed": "匯入文本失敗：{message}",
  "msg.importOrPasteFirst": "請先匯入或貼上小說正文。",
  "msg.llmSplitDone": "LLM 分鏡完成：{count} 鏡。",
  "msg.llmSplitFailed": "LLM 分鏡失敗：{message}",
  "msg.noConvertible": "沒有可轉換的分鏡。",
  "msg.convertDone": "提示詞轉換完成：成功 {ok}/{total}{message}",
  "msg.convertFailed": "提示詞轉換失敗：{message}",
  "msg.convertFirst": "請先批量轉換 NovelAI 提示詞。",
  "msg.consistencyFailed": "一致性校正失敗：{message}",
  "msg.quotedGroups": "已按 {groups} 組參數報價 {count} 鏡。",
  "msg.noGeneratable": "沒有可生成的分鏡。",
  "msg.needToken": "請先在設定裡配置 NovelAI Token。",
  "msg.quoteFailed": "生成報價失敗：{message}",
  "msg.confirmInsufficient":
    "預計消耗 {amount} Anlas，餘額 {balance}。仍要繼續嗎？",
  "msg.queueCancelled": "已取消小說推文生圖佇列。",
  "msg.queueStart":
    "預計消耗 {amount} Anlas（{source}），開始生成 {count} 鏡。",
  "msg.queuePaused":
    "佇列已暫停：已處理 {done}/{total} 鏡，點擊「生成未完成分鏡」可續跑。",
  "msg.generatingShot": "正在生成 #{index}（{current}/{total}）...",
  "msg.queueStopped": "佇列已停止：{message}",
  "msg.queueDone": "小說推文生圖佇列已結束；失敗鏡頭可保留狀態後單獨重試。",
  "msg.queueDoneToast": "小說推文生圖佇列已結束。",
  "msg.generationFailed": "小說推文生圖失敗：{message}",
  "msg.stoppingQueue": "正在停止佇列：目前請求結束後不會繼續下一鏡。",
  "msg.stopRequested": "已請求停止佇列；目前鏡頭結束後可直接續跑未完成分鏡。",
  "msg.noShotPrompt": "目前分鏡沒有可生成的提示詞。",
  "msg.singleQuoteFailed": "目前鏡頭報價失敗：{message}",
  "msg.confirmSingleInsufficient":
    "目前鏡頭預計消耗 {amount} Anlas，餘額 {balance}。仍要繼續嗎？",
  "msg.singleDone": "#{index} 已生成。",
  "msg.singleFailed": "#{index} 生成失敗：{message}",
  "msg.currentFailed": "目前鏡頭生成失敗：{message}",
  "msg.audioDurationError": "無法讀取音訊時長",
  "msg.shotAudioImported": "已為 #{index} 匯入音訊，時長 {seconds} 秒。",
  "msg.audioReadFailed": "讀取音訊失敗：{message}",
  "msg.needTimedSubtitle":
    "長音訊切片需要先匯入帶時間碼的 SRT / ASS / LRC 字幕。",
  "msg.audioTooLarge": "長音訊超過 500MB，請先壓縮或拆分後再匯入。",
  "msg.decodingAudio": "正在解碼 {file}…",
  "msg.slicingAudio": "正在按字幕切分 {file}：{current}/{total}（#{index}）",
  "msg.audioSliceSummary": "長音訊切片完成：成功 {ok}/{total} 鏡。",
  "msg.audioSliceRetry": "{summary} {fail} 鏡可單獨匯入或重試。",
  "msg.audioDecodeFailed": "長音訊解碼失敗：{message}",
  "msg.audioDecodeRecovery":
    "{message}\n可改用 WAV/MP3/M4A，或繼續逐鏡匯入音訊。",
  "msg.noNarrationActive": "目前鏡頭沒有可合成的旁白。",
  "msg.noNarrationPending": "沒有待配音的鏡頭。",
  "msg.providerNotConfigured":
    "{provider}尚未配置，請使用 Edge TTS 或匯入配音。",
  "msg.ttsSynthesizing": "正在合成 {count} 鏡配音…",
  "msg.ttsFallbackFailure": "合成失敗",
  "msg.ttsCallFailed": "TTS 呼叫失敗：{message}",
  "msg.ttsRecovery": "{message}\n可繼續使用「匯入本鏡音訊」，專案不會遺失。",
  "msg.noSplitNeeded": "目前旁白不需要拆分。",
  "msg.splitNarrationDone":
    "已把目前長旁白拆成 {count} 鏡；新增鏡頭需要補圖或複用畫面。",
  "msg.noExportable": "沒有可匯出的分鏡。",
  "msg.jianyingExportFailed": "剪映草稿匯出失敗：{message}",
};
TUIWEN_RUNTIME_TEXT["ja-JP"] = {
  "msg.projectDefault": "小説ショートプロジェクト",
  "msg.unknown": "不明",
  "msg.snapshotRestored":
    "前回の小説ショートスナップショットを復元しました: {time}。",
  "msg.ttsProviderReadFailed":
    "TTS Provider の読み込みに失敗しました: {message}",
  "msg.shotAdded": "空のカットを追加しました。",
  "msg.shotMovedUp": "カットを上へ移動しました。",
  "msg.shotMovedDown": "カットを下へ移動しました。",
  "msg.lastShotNoMerge":
    "現在のカットは最後のため、次のカットと結合できません。",
  "msg.confirmMerge":
    "結合すると、この 2 カットの画像/音声バインドは解除されますが、ディスク上のファイルは削除されません。続行しますか？",
  "msg.mergedNext":
    "#{index} と次のカットを結合しました。画面プロンプトを確認し、画像/音声を再生成してください。",
  "msg.confirmDeleteShot":
    "このカットを削除すると、プロジェクト内の画像/音声バインドは削除されますが、ディスク上のファイルは削除されません。続行しますか？",
  "msg.shotRemoved": "カットをプロジェクトから削除しました。",
  "msg.refsAdded": "{count} 件の全体参照を追加しました。",
  "msg.refsReadFailed": "参照画像の読み込みに失敗しました: {message}",
  "msg.reverseFailed": "参照画像の解析に失敗しました: {message}",
  "msg.noRefsToFold":
    "全体設定へ書き込めるキャラクター、シーン、オブジェクトの解析結果がありません。",
  "msg.refsFolded":
    "{count} 件の参照メモを全体キャラクター設定へ書き込みました。",
  "msg.pasteFirst": "先に小説本文または字幕テキストを貼り付けてください。",
  "msg.pastedText": "貼り付けテキスト",
  "msg.draftCreated": "{count} 個のナレーションカット草稿を作成しました。",
  "msg.projectImported":
    "小説ショートプロジェクトを読み込みました: {count} カット。",
  "msg.importFailed": "読み込みに失敗しました: {message}",
  "msg.unknownFileType": "読み込んだファイル形式を識別できませんでした。",
  "msg.textImported":
    "{file} を読み込み、{count} 個の{unit}カットを作成しました。",
  "msg.unitSubtitle": "字幕",
  "msg.unitNarration": "ナレーション",
  "msg.textImportFailed": "テキストの読み込みに失敗しました: {message}",
  "msg.importOrPasteFirst": "先に小説本文を読み込むか貼り付けてください。",
  "msg.llmSplitDone": "LLM 絵コンテ完了: {count} カット。",
  "msg.llmSplitFailed": "LLM 絵コンテ失敗: {message}",
  "msg.noConvertible": "変換できるカットがありません。",
  "msg.convertDone": "プロンプト変換完了: 成功 {ok}/{total}{message}",
  "msg.convertFailed": "プロンプト変換に失敗しました: {message}",
  "msg.convertFirst": "先に NovelAI プロンプトを一括変換してください。",
  "msg.consistencyFailed": "一貫性補正に失敗しました: {message}",
  "msg.quotedGroups":
    "{groups} 個のパラメータグループで {count} カットを見積もりました。",
  "msg.noGeneratable": "生成できるカットがありません。",
  "msg.needToken": "先に設定で NovelAI Token を設定してください。",
  "msg.quoteFailed": "生成見積もりに失敗しました: {message}",
  "msg.confirmInsufficient":
    "推定消費は {amount} Anlas、残高は {balance} です。それでも続行しますか？",
  "msg.queueCancelled": "小説ショート画像生成キューをキャンセルしました。",
  "msg.queueStart":
    "推定消費 {amount} Anlas（{source}）。{count} カットの生成を開始します。",
  "msg.queuePaused":
    "キューを一時停止しました: {done}/{total} カット処理済み。「未完了カットを生成」で再開できます。",
  "msg.generatingShot": "#{index} を生成中（{current}/{total}）...",
  "msg.queueStopped": "キュー停止: {message}",
  "msg.queueDone":
    "小説ショート画像生成キューが終了しました。失敗カットは個別に再試行できます。",
  "msg.queueDoneToast": "小説ショート画像生成キューが終了しました。",
  "msg.generationFailed": "小説ショート画像生成に失敗しました: {message}",
  "msg.stoppingQueue":
    "キューを停止中: 現在のリクエスト終了後、次のカットは開始しません。",
  "msg.stopRequested":
    "停止をリクエストしました。現在のカット終了後、未完了カットを再開できます。",
  "msg.noShotPrompt": "このカットには生成用プロンプトがありません。",
  "msg.singleQuoteFailed": "現在のカットの見積もりに失敗しました: {message}",
  "msg.confirmSingleInsufficient":
    "このカットの推定消費は {amount} Anlas、残高は {balance} です。それでも続行しますか？",
  "msg.singleDone": "#{index} を生成しました。",
  "msg.singleFailed": "#{index} の生成に失敗しました: {message}",
  "msg.currentFailed": "現在のカット生成に失敗しました: {message}",
  "msg.audioDurationError": "音声の長さを読み取れません",
  "msg.shotAudioImported":
    "#{index} に音声を読み込みました。長さ {seconds} 秒。",
  "msg.audioReadFailed": "音声の読み込みに失敗しました: {message}",
  "msg.needTimedSubtitle":
    "長音声を切り出すには、先にタイムコード付き SRT / ASS / LRC 字幕を読み込んでください。",
  "msg.audioTooLarge":
    "長音声が 500MB を超えています。圧縮または分割してから読み込んでください。",
  "msg.decodingAudio": "{file} をデコード中…",
  "msg.slicingAudio":
    "字幕に沿って {file} を切り出し中: {current}/{total}（#{index}）",
  "msg.audioSliceSummary": "長音声の切り出し完了: 成功 {ok}/{total} カット。",
  "msg.audioSliceRetry":
    "{summary} {fail} カットは個別に読み込み、または再試行できます。",
  "msg.audioDecodeFailed": "長音声のデコードに失敗しました: {message}",
  "msg.audioDecodeRecovery":
    "{message}\nWAV/MP3/M4A を試すか、カットごとに音声を読み込んでください。",
  "msg.noNarrationActive":
    "現在のカットには合成できるナレーションがありません。",
  "msg.noNarrationPending": "音声合成が必要なカットはありません。",
  "msg.providerNotConfigured":
    "{provider} は未設定です。Edge TTS を使うか音声を読み込んでください。",
  "msg.ttsSynthesizing": "{count} カットの音声を合成中…",
  "msg.ttsFallbackFailure": "合成に失敗しました",
  "msg.ttsCallFailed": "TTS 呼び出しに失敗しました: {message}",
  "msg.ttsRecovery":
    "{message}\n「このカットに音声を読み込み」を使えます。プロジェクトは失われません。",
  "msg.noSplitNeeded": "現在のナレーションは分割不要です。",
  "msg.splitNarrationDone":
    "現在の長いナレーションを {count} カットに分割しました。新しいカットには画像の補完または再利用が必要です。",
  "msg.noExportable": "書き出せるカットがありません。",
  "msg.jianyingExportFailed": "剪映ドラフトの書き出しに失敗しました: {message}",
};
TUIWEN_RUNTIME_TEXT["ko-KR"] = {
  "msg.projectDefault": "소설 숏폼 프로젝트",
  "msg.unknown": "알 수 없음",
  "msg.snapshotRestored": "이전 소설 숏폼 스냅샷을 복원했습니다: {time}.",
  "msg.ttsProviderReadFailed": "TTS Provider 읽기 실패: {message}",
  "msg.shotAdded": "빈 컷을 추가했습니다.",
  "msg.shotMovedUp": "컷을 위로 이동했습니다.",
  "msg.shotMovedDown": "컷을 아래로 이동했습니다.",
  "msg.lastShotNoMerge":
    "현재 컷이 이미 마지막 컷이라 뒤로 병합할 수 없습니다.",
  "msg.confirmMerge":
    "병합하면 두 컷의 이미지/음성 연결은 해제되지만 디스크 파일은 삭제되지 않습니다. 계속할까요?",
  "msg.mergedNext":
    "#{index} 컷을 다음 컷과 병합했습니다. 화면 프롬프트를 확인하고 이미지/음성을 다시 생성하세요.",
  "msg.confirmDeleteShot":
    "이 컷을 삭제하면 프로젝트 안의 이미지/음성 연결은 제거되지만 디스크 파일은 삭제되지 않습니다. 계속할까요?",
  "msg.shotRemoved": "컷을 프로젝트에서 제거했습니다.",
  "msg.refsAdded": "전역 참조 {count}개를 추가했습니다.",
  "msg.refsReadFailed": "참조 이미지 읽기 실패: {message}",
  "msg.reverseFailed": "참조 이미지 분석 실패: {message}",
  "msg.noRefsToFold":
    "전역 설정에 쓸 수 있는 캐릭터, 장면 또는 물체 분석 결과가 없습니다.",
  "msg.refsFolded": "참조 메모 {count}개를 전역 캐릭터 설정에 썼습니다.",
  "msg.pasteFirst": "먼저 소설 본문이나 자막 텍스트를 붙여넣으세요.",
  "msg.pastedText": "붙여넣은 텍스트",
  "msg.draftCreated": "내레이션 컷 초안 {count}개를 만들었습니다.",
  "msg.projectImported": "소설 숏폼 프로젝트를 가져왔습니다: {count}컷.",
  "msg.importFailed": "가져오기 실패: {message}",
  "msg.unknownFileType": "가져온 파일 유형을 식별할 수 없습니다.",
  "msg.textImported":
    "{file}을(를) 가져와 {count}개의 {unit} 컷을 만들었습니다.",
  "msg.unitSubtitle": "자막",
  "msg.unitNarration": "내레이션",
  "msg.textImportFailed": "텍스트 가져오기 실패: {message}",
  "msg.importOrPasteFirst": "먼저 소설 본문을 가져오거나 붙여넣으세요.",
  "msg.llmSplitDone": "LLM 스토리보드 완료: {count}컷.",
  "msg.llmSplitFailed": "LLM 스토리보드 실패: {message}",
  "msg.noConvertible": "변환할 수 있는 컷이 없습니다.",
  "msg.convertDone": "프롬프트 변환 완료: 성공 {ok}/{total}{message}",
  "msg.convertFailed": "프롬프트 변환 실패: {message}",
  "msg.convertFirst": "먼저 NovelAI 프롬프트를 일괄 변환하세요.",
  "msg.consistencyFailed": "일관성 보정 실패: {message}",
  "msg.quotedGroups": "{groups}개 매개변수 그룹으로 {count}컷 견적을 냈습니다.",
  "msg.noGeneratable": "생성할 수 있는 컷이 없습니다.",
  "msg.needToken": "먼저 설정에서 NovelAI Token을 설정하세요.",
  "msg.quoteFailed": "생성 견적 실패: {message}",
  "msg.confirmInsufficient":
    "예상 소비 {amount} Anlas, 잔액 {balance}. 그래도 계속할까요?",
  "msg.queueCancelled": "소설 숏폼 이미지 생성 대기열을 취소했습니다.",
  "msg.queueStart":
    "예상 소비 {amount} Anlas({source}); {count}컷 생성을 시작합니다.",
  "msg.queuePaused":
    "대기열 일시 중지: {done}/{total}컷 처리됨. “미완료 컷 생성”을 눌러 이어갈 수 있습니다.",
  "msg.generatingShot": "#{index} 생성 중({current}/{total})...",
  "msg.queueStopped": "대기열 중지: {message}",
  "msg.queueDone":
    "소설 숏폼 이미지 대기열이 끝났습니다. 실패한 컷은 개별 재시도할 수 있습니다.",
  "msg.queueDoneToast": "소설 숏폼 이미지 대기열이 끝났습니다.",
  "msg.generationFailed": "소설 숏폼 이미지 생성 실패: {message}",
  "msg.stoppingQueue":
    "대기열 중지 중: 현재 요청이 끝난 뒤 다음 컷은 시작하지 않습니다.",
  "msg.stopRequested":
    "중지를 요청했습니다. 현재 컷이 끝나면 미완료 컷을 바로 이어갈 수 있습니다.",
  "msg.noShotPrompt": "현재 컷에는 생성할 프롬프트가 없습니다.",
  "msg.singleQuoteFailed": "현재 컷 견적 실패: {message}",
  "msg.confirmSingleInsufficient":
    "현재 컷 예상 소비 {amount} Anlas, 잔액 {balance}. 그래도 계속할까요?",
  "msg.singleDone": "#{index} 생성 완료.",
  "msg.singleFailed": "#{index} 생성 실패: {message}",
  "msg.currentFailed": "현재 컷 생성 실패: {message}",
  "msg.audioDurationError": "오디오 길이를 읽을 수 없습니다",
  "msg.shotAudioImported":
    "#{index}에 오디오를 가져왔습니다. 길이 {seconds}초.",
  "msg.audioReadFailed": "오디오 읽기 실패: {message}",
  "msg.needTimedSubtitle":
    "긴 오디오를 자르려면 먼저 타임코드가 있는 SRT / ASS / LRC 자막을 가져오세요.",
  "msg.audioTooLarge":
    "긴 오디오가 500MB를 초과합니다. 압축하거나 분할한 뒤 가져오세요.",
  "msg.decodingAudio": "{file} 디코딩 중…",
  "msg.slicingAudio":
    "자막 기준으로 {file} 자르는 중: {current}/{total}(#{index})",
  "msg.audioSliceSummary": "긴 오디오 자르기 완료: 성공 {ok}/{total}컷.",
  "msg.audioSliceRetry":
    "{summary} {fail}컷은 개별로 가져오거나 재시도할 수 있습니다.",
  "msg.audioDecodeFailed": "긴 오디오 디코딩 실패: {message}",
  "msg.audioDecodeRecovery":
    "{message}\nWAV/MP3/M4A를 사용하거나 컷별 오디오 가져오기를 계속하세요.",
  "msg.noNarrationActive": "현재 컷에는 합성할 내레이션이 없습니다.",
  "msg.noNarrationPending": "음성 합성이 필요한 컷이 없습니다.",
  "msg.providerNotConfigured":
    "{provider}이(가) 설정되지 않았습니다. Edge TTS를 사용하거나 오디오를 가져오세요.",
  "msg.ttsSynthesizing": "{count}컷 음성 합성 중…",
  "msg.ttsFallbackFailure": "합성 실패",
  "msg.ttsCallFailed": "TTS 호출 실패: {message}",
  "msg.ttsRecovery":
    "{message}\n“이 컷에 오디오 가져오기”를 계속 사용할 수 있으며 프로젝트는 손실되지 않습니다.",
  "msg.noSplitNeeded": "현재 내레이션은 분할할 필요가 없습니다.",
  "msg.splitNarrationDone":
    "현재 긴 내레이션을 {count}컷으로 나눴습니다. 새 컷은 이미지를 보완하거나 재사용해야 합니다.",
  "msg.noExportable": "내보낼 수 있는 컷이 없습니다.",
  "msg.jianyingExportFailed": "Jianying 초안 내보내기 실패: {message}",
};
for (const code of Object.keys(TUIWEN_RUNTIME_TEXT) as AppLanguage[]) {
  Object.assign(TUIWEN_UI_TEXT[code], TUIWEN_RUNTIME_TEXT[code]);
}

function tuiwenUiText(language: unknown, key: string) {
  const code = normalizeAppLanguage(language);
  return (
    TUIWEN_UI_TEXT[code][key] ??
    TUIWEN_UI_TEXT["en-US"][key] ??
    TUIWEN_UI_TEXT["zh-CN"][key] ??
    key
  );
}

function tuiwenUiFormat(
  language: unknown,
  key: string,
  values: Record<string, unknown>,
) {
  return tuiwenUiText(language, key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values[name] ?? ""),
  );
}

function labelForReferenceKind(kind: ComicReferenceKind, language?: unknown) {
  const labels: Record<ComicReferenceKind, string> = {
    precise: tuiwenUiText(language, "ref.kind.precise"),
    character: tuiwenUiText(language, "ref.kind.character"),
    scene: tuiwenUiText(language, "ref.kind.scene"),
    object: tuiwenUiText(language, "ref.kind.object"),
    vibe: tuiwenUiText(language, "ref.kind.vibe"),
  };
  return labels[kind];
}

function labelForReferenceScope(scope: ReversePromptScope, language?: unknown) {
  const labels: Record<ReversePromptScope, string> = {
    full: tuiwenUiText(language, "ref.scope.full"),
    character: tuiwenUiText(language, "ref.scope.character"),
    object: tuiwenUiText(language, "ref.scope.object"),
    scene: tuiwenUiText(language, "ref.scope.scene"),
  };
  return labels[scope];
}

function downloadProject(project: TuiwenProject, language?: unknown) {
  const data = JSON.stringify(project, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const title =
    project.title.trim() && project.title.trim() !== DEFAULT_TUIWEN_TITLE
      ? project.title.trim()
      : tuiwenUiText(language, "msg.projectDefault");
  a.download = `${title}.tuiwen.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function statusText(shot: TuiwenShot, language?: unknown) {
  if (shot.status === "done") return tuiwenUiText(language, "status.done");
  if (shot.status === "converted")
    return tuiwenUiText(language, "status.converted");
  if (shot.status === "failed") return tuiwenUiText(language, "status.failed");
  if (shot.status === "generating")
    return tuiwenUiText(language, "status.generating");
  return shot.enPrompt.trim()
    ? tuiwenUiText(language, "status.pending")
    : tuiwenUiText(language, "status.draft");
}

function sortedShots(project: TuiwenProject) {
  return [...project.panels].sort((a, b) => a.index - b.index);
}

function referenceContextLines(project: TuiwenProject) {
  const kindLabel = {
    precise: "Precise reference",
    character: "Character",
    vibe: "Vibe",
    scene: "Scene",
    object: "Object",
  };
  return project.references
    .map((ref) => {
      const parts = [
        `【${kindLabel[ref.kind]}·${ref.name}】`,
        ref.subjectHint?.trim() ? `User note: ${ref.subjectHint.trim()}` : "",
        ref.reversePrompt?.trim()
          ? `Reverse result: ${ref.reversePrompt.trim()}`
          : "",
      ].filter(Boolean);
      return parts.join(" ");
    })
    .filter(Boolean);
}

function mergeShotParams(project: TuiwenProject, shot: TuiwenShot) {
  return shot.paramsOverride.enabled
    ? { ...project.globalParams, ...shot.paramsOverride.params }
    : project.globalParams;
}

function keyframeForPreset(preset: TuiwenKeyframePreset) {
  const base = {
    preset,
    keys: DEFAULT_TUIWEN_KEYFRAME.keys.map((key) => ({ ...key })),
  };
  if (preset === "none") {
    return {
      preset,
      keys: [{ timeRatio: 0, scale: 1, x: 0, y: 0, alpha: 1, rotation: 0 }],
    };
  }
  if (preset === "zoomIn") {
    return {
      preset,
      keys: [
        { timeRatio: 0, scale: 1.02, x: 0, y: 0, alpha: 1, rotation: 0 },
        { timeRatio: 1, scale: 1.16, x: 0, y: 0, alpha: 1, rotation: 0 },
      ],
    };
  }
  if (preset === "zoomOut") {
    return {
      preset,
      keys: [
        { timeRatio: 0, scale: 1.16, x: 0, y: 0, alpha: 1, rotation: 0 },
        { timeRatio: 1, scale: 1.02, x: 0, y: 0, alpha: 1, rotation: 0 },
      ],
    };
  }
  if (preset === "panLeft" || preset === "panRight") {
    const sign = preset === "panLeft" ? 1 : -1;
    return {
      preset,
      keys: [
        {
          timeRatio: 0,
          scale: 1.12,
          x: sign * -0.03,
          y: 0,
          alpha: 1,
          rotation: 0,
        },
        {
          timeRatio: 1,
          scale: 1.12,
          x: sign * 0.03,
          y: 0,
          alpha: 1,
          rotation: 0,
        },
      ],
    };
  }
  if (preset === "panUp" || preset === "panDown") {
    const sign = preset === "panUp" ? 1 : -1;
    return {
      preset,
      keys: [
        {
          timeRatio: 0,
          scale: 1.12,
          x: 0,
          y: sign * 0.03,
          alpha: 1,
          rotation: 0,
        },
        {
          timeRatio: 1,
          scale: 1.12,
          x: 0,
          y: sign * -0.03,
          alpha: 1,
          rotation: 0,
        },
      ],
    };
  }
  return base;
}

async function readAudioDurationMs(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const audio = new Audio(url);
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error("Unable to read audio duration"));
    });
    return Math.max(500, Math.round((audio.duration || 0) * 1000));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function NovelTuiwenStudio({ onBack }: { onBack?: () => void }) {
  const params = useAppStore((state) => state.params);
  const language = useAppStore((state) => state.settings?.language);
  const setToast = useAppStore((state) => state.setToast);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const tuiwenText = useMemo(() => getTuiwenStudioText(language), [language]);
  const tw = (key: string) => tuiwenUiText(language, key);
  const twf = (key: string, values: Record<string, unknown>) =>
    tuiwenUiFormat(language, key, values);
  const [project, setProject] = useState<TuiwenProject>(() =>
    createDefaultTuiwenProject(params),
  );
  const [step, setStep] = useState<TuiwenStepKey>("import");
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [generationLog, setGenerationLog] = useState("");
  const [queue, setQueue] = useState<{
    total: number;
    done: number;
    current: number;
  } | null>(null);
  const [exportResult, setExportResult] =
    useState<TuiwenExportJianYingResult | null>(null);
  const [ttsCatalog, setTtsCatalog] = useState<{
    providers: TuiwenTtsProviderInfo[];
    voices: TuiwenTtsVoice[];
  }>({
    providers: [],
    voices: [],
  });
  const [ttsProvider, setTtsProvider] = useState<TuiwenTtsProviderId>("edge");
  const [ttsVoice, setTtsVoice] = useState("zh-CN-XiaoxiaoNeural");
  const [ttsRatePercent, setTtsRatePercent] = useState(0);
  const [ttsVolumePercent, setTtsVolumePercent] = useState(0);
  const [ttsLog, setTtsLog] = useState("");
  const [motionReplay, setMotionReplay] = useState(0);
  const generationStopRef = useRef(false);
  const projectRef = useRef(project);
  const activeShot =
    project.panels.find((panel) => panel.id === activeShotId) ??
    project.panels[0] ??
    null;
  const nextShot = useMemo(() => {
    if (!activeShot) return null;
    const shots = sortedShots(project);
    const index = shots.findIndex((shot) => shot.id === activeShot.id);
    return shots[index + 1] ?? null;
  }, [activeShot, project]);
  const aspectPlan = useMemo(
    () => buildTuiwenAspectPlan(project.exportSettings, project.globalParams),
    [project.exportSettings, project.globalParams],
  );
  const projectDisplayTitle =
    project.title.trim() && project.title.trim() !== DEFAULT_TUIWEN_TITLE
      ? project.title
      : tuiwenText.page.defaultTitle;
  const totalDurationMs = useMemo(
    () => project.panels.reduce((sum, shot) => sum + shot.durationMs, 0),
    [project.panels],
  );
  const activeNarrationPacing = useMemo(
    () =>
      analyzeTuiwenNarrationPacing(activeShot?.narration ?? "", ttsRatePercent),
    [activeShot?.narration, ttsRatePercent],
  );

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    void window.naiDesktop
      .tuiwenTtsProviders()
      .then(setTtsCatalog)
      .catch((error) =>
        setTtsLog(
          twf("msg.ttsProviderReadFailed", {
            message: error instanceof Error ? error.message : String(error),
          }),
        ),
      );
  }, [language]);

  useEffect(() => {
    let mounted = true;
    void window.naiDesktop
      .tuiwenLoadProjectSnapshot()
      .then((snapshot) => {
        if (!mounted || !snapshot.ok || !snapshot.project) return;
        const next = normalizeTuiwenProject(snapshot.project, params);
        if (
          !next.panels.length &&
          !next.rawScript.trim() &&
          !next.references.length
        )
          return;
        if (!shouldRestoreTuiwenSnapshot(projectRef.current, next)) return;
        setProject(next);
        projectRef.current = next;
        setActiveShotId(next.panels[0]?.id ?? null);
        if (snapshot.savedAt) {
          setGenerationLog(
            twf("msg.snapshotRestored", {
              time: new Date(snapshot.savedAt).toLocaleString(),
            }),
          );
        }
      })
      .catch(() => {
        // Snapshot recovery is best-effort; manual JSON import remains available.
      });
    return () => {
      mounted = false;
    };
  }, [params, language]);

  useEffect(() => {
    const hasWork = Boolean(
      project.rawScript.trim() ||
      project.panels.length ||
      project.references.length,
    );
    if (!hasWork) return;
    const timer = window.setTimeout(() => {
      void window.naiDesktop.tuiwenSaveProjectSnapshot(project).catch(() => {
        // Avoid interrupting long-running queues for a background persistence error.
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [project]);

  function patchProject(patch: Partial<TuiwenProject>) {
    setProject((prev) => ({ ...prev, ...patch }));
  }

  function patchShot(id: string, patch: Partial<TuiwenShot>) {
    setProject((prev) => ({
      ...prev,
      panels: prev.panels.map((shot) =>
        shot.id === id ? { ...shot, ...patch } : shot,
      ),
    }));
  }

  function addShotAfterActive() {
    const sourceId = activeShot?.id;
    const nextShot = createTuiwenShot(
      "",
      1,
      project.exportSettings.defaultShotDurationMs,
    );
    setProject((prev) => {
      return {
        ...prev,
        panels: insertTuiwenShotAfter(prev.panels, sourceId ?? null, nextShot),
      };
    });
    setActiveShotId(nextShot.id);
    setToast(tw("msg.shotAdded"));
  }

  function moveActiveShot(direction: -1 | 1) {
    if (!activeShot) return;
    const sourceId = activeShot.id;
    setProject((prev) => {
      return {
        ...prev,
        panels: moveTuiwenShot(prev.panels, sourceId, direction),
      };
    });
    setToast(tw(direction < 0 ? "msg.shotMovedUp" : "msg.shotMovedDown"));
  }

  function mergeActiveWithNext() {
    if (!activeShot) return;
    const sourceId = activeShot.id;
    const shots = sortedShots(project);
    const sourceIndex = shots.findIndex((shot) => shot.id === sourceId);
    const next = shots[sourceIndex + 1];
    if (!next) {
      setToast(tw("msg.lastShotNoMerge"));
      return;
    }
    if (
      (activeShot.outputPath ||
        activeShot.audio ||
        next.outputPath ||
        next.audio) &&
      !window.confirm(tw("msg.confirmMerge"))
    )
      return;

    setProject((prev) => {
      return {
        ...prev,
        panels: mergeTuiwenShotWithNext(prev.panels, sourceId),
      };
    });
    setToast(twf("msg.mergedNext", { index: activeShot.index }));
  }

  function deleteActiveShot() {
    if (!activeShot) return;
    if (
      (activeShot.outputPath || activeShot.audio) &&
      !window.confirm(tw("msg.confirmDeleteShot"))
    )
      return;
    const sourceId = activeShot.id;
    const shots = sortedShots(project);
    const sourceIndex = shots.findIndex((shot) => shot.id === sourceId);
    const nextActiveId =
      shots[sourceIndex + 1]?.id ?? shots[sourceIndex - 1]?.id ?? null;
    setProject((prev) => ({
      ...prev,
      panels: removeTuiwenShot(prev.panels, sourceId),
    }));
    setActiveShotId(nextActiveId);
    setToast(tw("msg.shotRemoved"));
  }

  function updateReference(
    id: string,
    updater: (reference: ComicReferenceAsset) => ComicReferenceAsset,
  ) {
    setProject((prev) => ({
      ...prev,
      references: prev.references.map((reference) =>
        reference.id === id ? updater(reference) : reference,
      ),
    }));
  }

  async function addReferences(files: FileList | null) {
    if (!files?.length) return;
    try {
      const references: ComicReferenceAsset[] = [];
      for (const file of Array.from(files)) {
        const base64 = await toBase64(file);
        references.push({
          id: uid(),
          name: file.name,
          kind: "precise",
          scope: "character",
          subjectHint: "",
          base64,
          previewUrl: dataUrlFromBase64(base64),
          reversePrompt: "",
          infoExtracted: 1,
          strength: 0.65,
          useForGeneration: true,
        });
      }
      setProject((prev) => ({
        ...prev,
        references: [...prev.references, ...references],
      }));
      setToast(twf("msg.refsAdded", { count: references.length }));
    } catch (error) {
      setToast(
        twf("msg.refsReadFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async function reverseReference(reference: ComicReferenceAsset) {
    setBusy(`reverse:${reference.id}`);
    try {
      const result = await window.naiDesktop.comicReverseAsset(
        reference.base64,
        project.mode,
        reference.scope ?? "full",
        reference.subjectHint ?? "",
      );
      if (result.ok && result.prompt) {
        updateReference(reference.id, (current) => ({
          ...current,
          reversePrompt: result.prompt ?? "",
        }));
      }
      setToast(result.message);
    } catch (error) {
      setToast(
        twf("msg.reverseFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setBusy("");
    }
  }

  function foldReferencesIntoGlobal() {
    const lines = project.references
      .filter(
        (reference) =>
          ["character", "scene", "object"].includes(reference.kind) &&
          reference.reversePrompt.trim(),
      )
      .map(
        (reference) =>
          `【${labelForReferenceKind(reference.kind, language)}·${reference.name}】${reference.reversePrompt.trim()}`,
      );
    if (!lines.length) {
      setToast(tw("msg.noRefsToFold"));
      return;
    }
    setProject((prev) => ({
      ...prev,
      globalCharacterSetting: [prev.globalCharacterSetting.trim(), ...lines]
        .filter(Boolean)
        .join("\n"),
    }));
    setToast(twf("msg.refsFolded", { count: lines.length }));
  }

  function rebuildDraftShots() {
    const lines = splitNovelTextToNarration(project.rawScript);
    if (lines.length === 0) {
      setToast(tw("msg.pasteFirst"));
      return;
    }
    const panels = lines.map((line, index) =>
      createTuiwenShot(
        line,
        index + 1,
        project.exportSettings.defaultShotDurationMs,
      ),
    );
    setProject((prev) => ({
      ...prev,
      source: {
        type: "novel",
        fileName: prev.source.fileName || tw("msg.pastedText"),
      },
      globalPrompt: prev.rawScript,
      panels,
    }));
    setActiveShotId(panels[0]?.id ?? null);
    setStep("storyboard");
    setToast(twf("msg.draftCreated", { count: panels.length }));
  }

  async function importProject(file: File | null) {
    if (!file) return;
    try {
      const next = normalizeTuiwenProject(
        JSON.parse(await file.text()),
        params,
      );
      setProject(next);
      setActiveShotId(next.panels[0]?.id ?? null);
      setToast(twf("msg.projectImported", { count: next.panels.length }));
    } catch (error) {
      setToast(
        twf("msg.importFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async function importSourceFile(file: File | null) {
    if (!file) return;
    try {
      const filePath = window.naiDesktop.getPathForFile(file);
      const imported = filePath
        ? await window.naiDesktop
            .tuiwenImportFile({
              filePath,
              fileName: file.name,
              defaultShotDurationMs:
                project.exportSettings.defaultShotDurationMs,
            })
            .catch(() => null)
        : null;

      let rawScript = imported?.ok ? (imported.rawScript ?? "") : "";
      let source = imported?.ok ? imported.source : undefined;
      let panels = imported?.ok ? (imported.shots ?? []) : [];

      if (!rawScript || !source || !panels.length) {
        const text = await file.text();
        const result = parseTuiwenTextFile(
          file.name,
          text,
          project.exportSettings.defaultShotDurationMs,
        );
        const lines = result.cues.length
          ? result.cues.map((cue) => cue.text)
          : splitNovelTextToNarration(text);
        panels = result.cues.length
          ? result.cues.map((cue, index) => ({
              ...createTuiwenShot(
                cue.text,
                index + 1,
                cue.durationMs ?? project.exportSettings.defaultShotDurationMs,
              ),
              startMs: cue.startMs,
            }))
          : lines.map((line, index) =>
              createTuiwenShot(
                line,
                index + 1,
                project.exportSettings.defaultShotDurationMs,
              ),
            );
        rawScript = result.rawScript;
        source = result.source;
      }
      if (!source) throw new Error(tw("msg.unknownFileType"));

      setProject((prev) => ({
        ...prev,
        rawScript,
        globalPrompt: rawScript,
        source,
        panels,
      }));
      setActiveShotId(panels[0]?.id ?? null);
      setStep("storyboard");
      setToast(
        twf("msg.textImported", {
          file: file.name,
          count: panels.length,
          unit:
            source.type === "subtitle"
              ? tw("msg.unitSubtitle")
              : tw("msg.unitNarration"),
        }),
      );
    } catch (error) {
      setToast(
        twf("msg.textImportFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async function analyzeWithLlm() {
    if (!project.rawScript.trim()) {
      setToast(tw("msg.importOrPasteFirst"));
      return;
    }
    setBusy("analyze");
    try {
      const result = await window.naiDesktop.comicAnalyzeScript({
        script: project.rawScript,
        adultBranch: project.adultBranch,
        mode: project.mode,
        desiredPanelCount: project.desiredPanelCount,
        referencePrompts: referenceContextLines(project),
      });
      if (!result.ok) {
        setToast(result.message);
        return;
      }
      const panels = (result.panels ?? []).map((panel, index) => {
        const narration = panel.narration?.trim() || panel.cnPrompt;
        return {
          ...createTuiwenShot(
            narration,
            index + 1,
            project.exportSettings.defaultShotDurationMs,
          ),
          cnPrompt: panel.cnPrompt,
          contextSummary: panel.contextSummary || panel.cnPrompt.slice(0, 120),
        };
      });
      setProject((prev) => ({
        ...prev,
        title: result.title || prev.title,
        globalPrompt: result.globalPrompt || prev.globalPrompt,
        globalCharacterSetting:
          result.globalCharacterSetting ||
          referenceContextLines(prev).join("\n") ||
          prev.globalCharacterSetting,
        continuityBible: result.continuityBible || prev.continuityBible,
        panels,
      }));
      setActiveShotId(panels[0]?.id ?? null);
      setStep("storyboard");
      setToast(twf("msg.llmSplitDone", { count: panels.length }));
    } catch (error) {
      setToast(
        twf("msg.llmSplitFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setBusy("");
    }
  }

  async function convertAllPanels() {
    const allPanels = sortedShots(project);
    const targets = allPanels.filter(
      (shot) => shot.cnPrompt.trim() && shot.status !== "done",
    );
    if (!targets.length) {
      setToast(tw("msg.noConvertible"));
      return;
    }
    setBusy("convert");
    try {
      const result = await window.naiDesktop.comicConvertPanels({
        mode: project.mode,
        globalPrompt: project.globalPrompt,
        globalCharacterSetting: project.globalCharacterSetting,
        continuityBible: project.continuityBible,
        globalStylePrompt: project.globalStylePrompt,
        referencePrompts: referenceContextLines(project),
        adultBranch: project.adultBranch,
        panels: targets.map((shot) => {
          const index = allPanels.findIndex((item) => item.id === shot.id);
          return {
            panelId: shot.id,
            index: shot.index,
            cnPrompt: shot.cnPrompt,
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
        }),
      });
      setProject((prev) => ({
        ...prev,
        panels: prev.panels.map((shot) => {
          const converted = result.panels.find(
            (item) => item.panelId === shot.id,
          );
          if (!converted) return shot;
          return {
            ...shot,
            enPrompt: converted.enPrompt || shot.enPrompt,
            contextSummary: converted.contextSummary || shot.contextSummary,
            status: converted.error ? "failed" : "converted",
            error: converted.error,
          };
        }),
      }));
      const okCount = result.panels.filter(
        (item) => !item.error && item.enPrompt.trim(),
      ).length;
      setToast(
        twf("msg.convertDone", {
          ok: okCount,
          total: targets.length,
          message: result.message ? `; ${result.message}` : "",
        }),
      );
    } catch (error) {
      setToast(
        twf("msg.convertFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setBusy("");
    }
  }

  async function checkConsistency() {
    const panels = sortedShots(project).filter((shot) => shot.enPrompt.trim());
    if (!panels.length) {
      setToast(tw("msg.convertFirst"));
      return;
    }
    setBusy("consistency");
    try {
      const result = await window.naiDesktop.comicCheckConsistency({
        mode: project.mode,
        globalPrompt: project.globalPrompt,
        globalCharacterSetting: project.globalCharacterSetting,
        referencePrompts: referenceContextLines(project),
        panels: panels.map((shot) => ({
          id: shot.id,
          index: shot.index,
          cnPrompt: shot.cnPrompt,
          enPrompt: shot.enPrompt,
        })),
      });
      if (!result.ok) {
        setToast(result.message);
        return;
      }
      setProject((prev) => ({
        ...prev,
        panels: prev.panels.map((shot) => {
          const fixed = result.panels.find((item) => item.panelId === shot.id);
          return fixed?.enPrompt
            ? { ...shot, enPrompt: fixed.enPrompt, status: "converted" }
            : shot;
        }),
      }));
      setToast(result.message);
    } catch (error) {
      setToast(
        twf("msg.consistencyFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setBusy("");
    }
  }

  async function quoteGenerationTargets(
    targets: TuiwenShot[],
  ): Promise<TuiwenGenerationQuoteResult> {
    const account = await refreshAccount();
    const groups = buildTuiwenQuoteGroups(project, targets, (shot) =>
      mergeShotParams(project, shot),
    );

    let amount = 0;
    let balance = account.anlasBalance;
    const perShotAnlas: Record<string, number> = {};
    const sources = new Set<AnlasQuoteResult["source"]>();
    for (const group of groups) {
      const quoteParams = group.params;
      const quote = await window.naiDesktop.quoteAnlas({
        feature: "generate",
        params: {
          ...quoteParams,
          stylePrompt: "",
          positivePrompt: "quote",
          negativePrompt: "",
        },
        extras: {
          vibeImages: Array.from({ length: group.vibeCount }, () => ({
            base64: "",
            infoExtracted: 0.7,
            strength: 0.5,
          })),
          charCaptions: [],
          preciseReferences: Array.from({ length: group.preciseCount }, () => ({
            base64: "",
            type: "character" as const,
            strength: 1,
            fidelity: 1,
          })),
        },
        batchCount: group.shotIds.length,
        account,
      });
      if (!quote.ok || typeof quote.amount !== "number") return quote;
      amount += quote.amount;
      Object.assign(
        perShotAnlas,
        distributeTuiwenGroupAnlas(quote.amount, group.shotIds),
      );
      balance = quote.balance ?? balance;
      if (quote.source) sources.add(quote.source);
    }
    return {
      ok: true,
      amount,
      balance,
      insufficient: typeof balance === "number" ? amount > balance : false,
      source: sources.size === 1 ? [...sources][0] : "official-api",
      perShotAnlas,
      message: twf("msg.quotedGroups", {
        groups: groups.length,
        count: targets.length,
      }),
    };
  }

  async function generateShot(
    shot: TuiwenShot,
    previousImagePath?: string,
    quotedAnlas?: number,
  ) {
    const requestShot = { ...shot };
    setProject((prev) => ({
      ...prev,
      panels: prev.panels.map((item) =>
        item.id === shot.id
          ? { ...item, status: "generating", error: undefined }
          : item,
      ),
    }));

    let balanceBefore: number | undefined;
    try {
      balanceBefore = (await refreshAccount()).anlasBalance;
    } catch {
      balanceBefore = undefined;
    }

    const result = await window.naiDesktop.comicGeneratePanel({
      projectId: project.id,
      projectTitle: project.title,
      historyGroupId: project.historyGroupId,
      panelId: requestShot.id,
      panelIndex: requestShot.index,
      params: mergeShotParams(project, requestShot),
      globalStylePrompt: project.globalStylePrompt,
      panelPrompt: requestShot.enPrompt || requestShot.cnPrompt,
      globalNegativePrompt: project.globalNegativePrompt,
      localNegativePrompt: requestShot.localNegativePrompt,
      negativeMode: requestShot.negativeMode,
      references: project.references,
      previousImagePath,
      inheritPreviousFrame: Boolean(
        project.inheritPreviousFrame && previousImagePath,
      ),
    });

    const item = result.items[0];
    let actualAnlas = quotedAnlas;
    if (result.ok && item) {
      try {
        const accountAfter = await refreshAccount();
        actualAnlas = resolveTuiwenActualAnlas(
          balanceBefore,
          accountAfter.anlasBalance,
          quotedAnlas,
        );
      } catch {
        actualAnlas = quotedAnlas;
      }
    }
    setProject((prev) => ({
      ...prev,
      historyGroupId: item?.groupId ?? prev.historyGroupId,
      panels: prev.panels.map((old) =>
        old.id === shot.id
          ? applyTuiwenGenerationResultToShot(old, result, item, actualAnlas)
          : old,
      ),
    }));

    return { result, outputPath: item?.filePath };
  }

  async function generatePendingShots() {
    const targets = getTuiwenPendingGenerationShots(project);
    if (!targets.length) {
      setToast(tw("msg.noGeneratable"));
      return;
    }
    const account = await refreshAccount();
    if (!account.hasToken) {
      setToast(tw("msg.needToken"));
      return;
    }

    generationStopRef.current = false;
    setBusy("generate");
    setQueue({ total: targets.length, done: 0, current: 0 });
    let processed = 0;
    try {
      const quote = await quoteGenerationTargets(targets);
      if (!quote.ok) {
        setToast(twf("msg.quoteFailed", { message: quote.message }));
        return;
      }
      if (
        quote.insufficient &&
        !window.confirm(
          twf("msg.confirmInsufficient", {
            amount: quote.amount ?? tw("msg.unknown"),
            balance: quote.balance ?? tw("msg.unknown"),
          }),
        )
      ) {
        setToast(tw("msg.queueCancelled"));
        return;
      }
      setGenerationLog(
        twf("msg.queueStart", {
          amount: quote.amount ?? tw("msg.unknown"),
          source: quote.source ?? "estimate",
          count: targets.length,
        }),
      );

      let previousImagePath: string | undefined;
      for (let index = 0; index < targets.length; index += 1) {
        if (generationStopRef.current) {
          setGenerationLog(
            twf("msg.queuePaused", { done: processed, total: targets.length }),
          );
          break;
        }
        const shot = targets[index];
        setQueue({ total: targets.length, done: index, current: index + 1 });
        setGenerationLog(
          twf("msg.generatingShot", {
            index: shot.index,
            current: index + 1,
            total: targets.length,
          }),
        );
        const { result, outputPath } = await generateShot(
          shot,
          previousImagePath,
          quote.perShotAnlas?.[shot.id],
        );
        processed = index + 1;
        if (outputPath) previousImagePath = outputPath;
        if (!result.ok && result.failureKind === "auth") {
          setGenerationLog(
            twf("msg.queueStopped", { message: result.message }),
          );
          setToast(twf("msg.queueStopped", { message: result.message }));
          break;
        }
        if (generationStopRef.current) {
          setGenerationLog(
            twf("msg.queuePaused", { done: processed, total: targets.length }),
          );
          break;
        }
      }
      setQueue({
        total: targets.length,
        done: generationStopRef.current ? processed : targets.length,
        current: processed,
      });
      if (!generationStopRef.current) {
        setGenerationLog(tw("msg.queueDone"));
        setToast(tw("msg.queueDoneToast"));
      }
    } catch (error) {
      setToast(
        twf("msg.generationFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setBusy("");
      setQueue(null);
    }
  }

  function stopGenerationQueue() {
    generationStopRef.current = true;
    setGenerationLog(tw("msg.stoppingQueue"));
    setToast(tw("msg.stopRequested"));
    void window.naiDesktop.cancel();
  }

  async function generateOneShot(shot: TuiwenShot) {
    if (!shot.enPrompt.trim() && !shot.cnPrompt.trim()) {
      setToast(tw("msg.noShotPrompt"));
      return;
    }
    const account = await refreshAccount();
    if (!account.hasToken) {
      setToast(tw("msg.needToken"));
      return;
    }
    setBusy(`generate:${shot.id}`);
    try {
      const quote = await quoteGenerationTargets([shot]);
      if (!quote.ok) {
        setToast(twf("msg.singleQuoteFailed", { message: quote.message }));
        return;
      }
      if (
        quote.insufficient &&
        !window.confirm(
          twf("msg.confirmSingleInsufficient", {
            amount: quote.amount ?? tw("msg.unknown"),
            balance: quote.balance ?? tw("msg.unknown"),
          }),
        )
      ) {
        return;
      }
      const previousImagePath = project.inheritPreviousFrame
        ? sortedShots(project)
            .filter((item) => item.index < shot.index && item.outputPath)
            .at(-1)?.outputPath
        : undefined;
      const { result } = await generateShot(
        shot,
        previousImagePath,
        quote.perShotAnlas?.[shot.id],
      );
      setToast(
        result.ok
          ? twf("msg.singleDone", { index: shot.index })
          : twf("msg.singleFailed", {
              index: shot.index,
              message: result.message,
            }),
      );
    } catch (error) {
      setToast(
        twf("msg.currentFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setBusy("");
    }
  }

  function setAspect(aspectRatio: TuiwenAspectRatio) {
    const canvas = TUIWEN_CANVAS_PRESETS[aspectRatio];
    setProject((prev) => ({
      ...prev,
      globalParams: applyTuiwenAspectToParams(prev.globalParams, aspectRatio),
      exportSettings: {
        ...prev.exportSettings,
        aspectRatio,
        width: canvas.width,
        height: canvas.height,
      },
    }));
  }

  function pickBgm(file: File | null) {
    if (!file) return;
    const filePath = window.naiDesktop.getPathForFile(file);
    setProject((prev) => ({
      ...prev,
      exportSettings: {
        ...prev.exportSettings,
        bgm: {
          filePath,
          volume: prev.exportSettings.bgm?.volume ?? 0.22,
          loop: true,
          fadeMs: 1200,
        },
      },
    }));
  }

  async function importAudioForActiveShot(file: File | null) {
    if (!file || !activeShot) return;
    try {
      const durationMs = await readAudioDurationMs(file);
      const filePath = window.naiDesktop.getPathForFile(file);
      patchShot(activeShot.id, {
        durationMs,
        audio: {
          filePath,
          fileUrl: filePath,
          durationMs,
          source: "import",
        },
      });
      setToast(
        twf("msg.shotAudioImported", {
          index: activeShot.index,
          seconds: (durationMs / 1000).toFixed(1),
        }),
      );
    } catch (error) {
      setToast(
        twf("msg.audioReadFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async function importLongAudioBySubtitle(file: File | null) {
    if (!file) return;
    const targets = sortedShots(project).filter(
      (shot) => Number.isFinite(shot.startMs) && (shot.startMs ?? -1) >= 0,
    );
    if (project.source.type !== "subtitle" || !targets.length) {
      setToast(tw("msg.needTimedSubtitle"));
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      setToast(tw("msg.audioTooLarge"));
      return;
    }

    setBusy("splitAudio");
    setTtsLog(twf("msg.decodingAudio", { file: file.name }));
    const audioContext = new AudioContext();
    try {
      const decoded = await audioContext.decodeAudioData(
        await file.arrayBuffer(),
      );
      const channels = Array.from(
        { length: decoded.numberOfChannels },
        (_value, channel) => decoded.getChannelData(channel),
      );
      let succeeded = 0;
      const failures: string[] = [];

      for (let index = 0; index < targets.length; index += 1) {
        const shot = targets[index];
        setTtsLog(
          twf("msg.slicingAudio", {
            file: file.name,
            current: index + 1,
            total: targets.length,
            index: shot.index,
          }),
        );
        try {
          const slice = sliceTuiwenPcm(
            channels,
            decoded.sampleRate,
            shot.startMs ?? 0,
            shot.durationMs,
          );
          const wavData = encodeTuiwenPcm16Wav(
            slice.channels,
            slice.sampleRate,
          );
          const saved = await window.naiDesktop.tuiwenSaveImportedAudio({
            projectId: project.id,
            projectTitle: project.title,
            shotId: shot.id,
            index: shot.index,
            durationMs: slice.durationMs,
            sourceName: file.name,
            wavData,
          });
          if (!saved.ok || !saved.audio) throw new Error(saved.message);
          const audio = saved.audio;
          setProject((prev) => ({
            ...prev,
            panels: prev.panels.map((item) =>
              item.id === shot.id
                ? { ...item, audio, durationMs: audio.durationMs }
                : item,
            ),
          }));
          succeeded += 1;
        } catch (error) {
          failures.push(
            `#${shot.index} ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      const summary = twf("msg.audioSliceSummary", {
        ok: succeeded,
        total: targets.length,
      });
      setTtsLog([summary, ...failures].join("\n"));
      setToast(
        failures.length
          ? twf("msg.audioSliceRetry", { summary, fail: failures.length })
          : summary,
      );
    } catch (error) {
      const message = twf("msg.audioDecodeFailed", {
        message: error instanceof Error ? error.message : String(error),
      });
      setTtsLog(twf("msg.audioDecodeRecovery", { message }));
      setToast(message);
    } finally {
      await audioContext.close().catch(() => undefined);
      setBusy("");
    }
  }

  async function runTts(target: "active" | "missing") {
    const candidates =
      target === "active"
        ? activeShot
          ? [activeShot]
          : []
        : sortedShots(project).filter((shot) => !shot.audio);
    const shots = candidates.filter((shot) => shot.narration.trim());
    if (!shots.length) {
      setToast(
        tw(
          target === "active"
            ? "msg.noNarrationActive"
            : "msg.noNarrationPending",
        ),
      );
      return;
    }
    const providerInfo = ttsCatalog.providers.find(
      (provider) => provider.id === ttsProvider,
    );
    if (providerInfo && !providerInfo.available) {
      setToast(
        twf("msg.providerNotConfigured", { provider: providerInfo.label }),
      );
      return;
    }

    setBusy(target === "active" ? `tts:${shots[0].id}` : "tts");
    setTtsLog(twf("msg.ttsSynthesizing", { count: shots.length }));
    try {
      const result = await window.naiDesktop.tuiwenTts({
        projectId: project.id,
        projectTitle: project.title,
        provider: ttsProvider,
        voice: ttsVoice,
        ratePercent: ttsRatePercent,
        volumePercent: ttsVolumePercent,
        shots: shots.map((shot) => ({
          shotId: shot.id,
          index: shot.index,
          narration: shot.narration,
        })),
      });
      const completed = new Map(
        result.items
          .filter((item) => item.ok && item.audio)
          .map((item) => [item.shotId, item.audio!]),
      );
      setProject((prev) => ({
        ...prev,
        panels: prev.panels.map((shot) => {
          const audio = completed.get(shot.id);
          return audio
            ? { ...shot, audio, durationMs: audio.durationMs }
            : shot;
        }),
      }));
      const failures = result.items
        .filter((item) => !item.ok)
        .map(
          (item) =>
            `#${item.index} ${item.error || tw("msg.ttsFallbackFailure")}`,
        );
      setTtsLog(
        [result.message, ...(result.warnings ?? []), ...failures].join("\n"),
      );
      setToast(result.message);
    } catch (error) {
      const message = twf("msg.ttsCallFailed", {
        message: error instanceof Error ? error.message : String(error),
      });
      setTtsLog(twf("msg.ttsRecovery", { message }));
      setToast(message);
    } finally {
      setBusy("");
    }
  }

  function splitActiveNarration() {
    if (!activeShot) return;
    const segments = splitTuiwenNarration(activeShot.narration);
    if (segments.length <= 1) {
      setToast(tw("msg.noSplitNeeded"));
      return;
    }
    const sourceId = activeShot.id;
    setProject((prev) => {
      const sourceIndex = prev.panels.findIndex((shot) => shot.id === sourceId);
      if (sourceIndex < 0) return prev;
      const source = prev.panels[sourceIndex];
      const replacements = segments.map((narration, index) => {
        const fresh = createTuiwenShot(
          narration,
          source.index + index,
          estimateTuiwenNarrationDurationMs(narration, ttsRatePercent),
        );
        return {
          ...fresh,
          id: index === 0 ? source.id : fresh.id,
          cnPrompt: source.cnPrompt,
          contextSummary: source.contextSummary,
          enPrompt: source.enPrompt,
          localNegativePrompt: source.localNegativePrompt,
          negativeMode: source.negativeMode,
          paramsOverride: {
            enabled: source.paramsOverride.enabled,
            params: { ...source.paramsOverride.params },
          },
          status:
            index === 0 && source.outputPath
              ? source.status
              : source.enPrompt.trim()
                ? ("converted" as const)
                : ("draft" as const),
          historyItemId: index === 0 ? source.historyItemId : undefined,
          outputPath: index === 0 ? source.outputPath : undefined,
          outputUrl: index === 0 ? source.outputUrl : undefined,
          actualAnlas: index === 0 ? source.actualAnlas : undefined,
          keyframe: {
            ...source.keyframe,
            keys: source.keyframe.keys.map((key) => ({ ...key })),
          },
          transition: source.transition ? { ...source.transition } : undefined,
          subtitle: { ...source.subtitle, text: narration },
          audio: undefined,
          error: undefined,
        };
      });
      const mergedPanels = [
        ...prev.panels.slice(0, sourceIndex),
        ...replacements,
        ...prev.panels.slice(sourceIndex + 1),
      ];
      const panels = reindexTuiwenShots(mergedPanels);
      return { ...prev, panels };
    });
    setActiveShotId(sourceId);
    setToast(twf("msg.splitNarrationDone", { count: segments.length }));
  }

  async function exportJianYingDraft() {
    if (!project.panels.length) {
      setToast(tw("msg.noExportable"));
      return;
    }
    setBusy("exportJianYing");
    setExportResult(null);
    try {
      const result = await window.naiDesktop.tuiwenExportJianYing({
        project,
        outDir: project.exportSettings.jianyingDraftDir?.trim() || undefined,
      });
      setExportResult(result);
      setToast(result.message);
    } catch (error) {
      const result: TuiwenExportJianYingResult = {
        ok: false,
        message: twf("msg.jianyingExportFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      };
      setExportResult(result);
      setToast(result.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="comic-generator tuiwen-studio">
      <div className="comic-page-title tuiwen-page-title">
        <div>
          <span className="eyebrow">{tuiwenText.page.eyebrow}</span>
          <strong>{projectDisplayTitle}</strong>
          <small>{tuiwenText.page.subtitle}</small>
        </div>
        <div className="redraw-page-metrics">
          <span>
            <b>{project.panels.length}</b> {tuiwenText.page.shotsMetric}
          </span>
          <span>
            <b>
              {aspectPlan.nai.width}×{aspectPlan.nai.height}
            </b>{" "}
            NAI
          </span>
        </div>
      </div>

      <nav className="comic-steps tuiwen-steps">
        {TUIWEN_STEPS.map((item, index) => (
          <button
            key={item.key}
            type="button"
            className={clsx("comic-step-btn", step === item.key && "active")}
            onClick={() => setStep(item.key)}
          >
            <b>{index + 1}</b>
            <span>{tuiwenText.steps[item.key].label}</span>
            <small>{tuiwenText.steps[item.key].hint}</small>
          </button>
        ))}
      </nav>

      <div className="comic-step-actions tuiwen-actions">
        {onBack ? (
          <Button onClick={onBack} variant="ghost">
            {tuiwenText.page.backToTools}
          </Button>
        ) : null}
        <Button
          onClick={() => downloadProject(project, language)}
          variant="secondary"
        >
          {tuiwenText.page.exportProjectJson}
        </Button>
        <label className="btn btn-secondary redraw-file-btn">
          {tuiwenText.page.importProjectJson}
          <input
            type="file"
            hidden
            accept=".json,application/json"
            onChange={(event) => {
              void importProject(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
        </label>
        <label className="btn btn-secondary redraw-file-btn">
          {tuiwenText.page.importNovelSubtitle}
          <input
            type="file"
            hidden
            accept=".txt,.srt,.ass,.lrc,text/plain"
            onChange={(event) => {
              void importSourceFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
        </label>
        <span className="redraw-flow-hint">{tuiwenText.page.flowHint}</span>
      </div>

      {step === "import" && (
        <section className="redraw-card tuiwen-import-stage">
          <div className="redraw-global-prompts">
            <label className="comic-field">
              <span>{tuiwenText.importStage.projectTitle}</span>
              <input
                value={projectDisplayTitle}
                onChange={(event) =>
                  patchProject({ title: event.target.value })
                }
              />
            </label>
            <label className="comic-field">
              <span>{tuiwenText.importStage.sourceType}</span>
              <select
                value={project.source.type}
                onChange={(event) =>
                  setProject((prev) => ({
                    ...prev,
                    source: {
                      ...prev.source,
                      type: event.target
                        .value as TuiwenProject["source"]["type"],
                    },
                  }))
                }
              >
                <option value="novel">
                  {tuiwenText.importStage.sourceNovel}
                </option>
                <option value="subtitle">
                  {tuiwenText.importStage.sourceSubtitle}
                </option>
              </select>
            </label>
          </div>
          <div className="tuiwen-aspect-grid">
            <label className="comic-field">
              <span>{tuiwenText.importStage.aspectRatio}</span>
              <select
                value={project.exportSettings.aspectRatio}
                onChange={(event) =>
                  setAspect(event.target.value as TuiwenAspectRatio)
                }
              >
                {Object.entries(TUIWEN_CANVAS_PRESETS).map(([key, value]) => (
                  <option value={key} key={key}>
                    {tuiwenText.importStage.aspectLabels[
                      key as TuiwenAspectRatio
                    ] ?? value.label}
                  </option>
                ))}
              </select>
            </label>
            <NumberInput
              label={tuiwenText.importStage.defaultShotDuration}
              value={project.exportSettings.defaultShotDurationMs}
              min={1000}
              max={20000}
              step={100}
              onChange={(value) =>
                setProject((prev) => ({
                  ...prev,
                  exportSettings: {
                    ...prev.exportSettings,
                    defaultShotDurationMs: value,
                  },
                }))
              }
            />
            <NumberInput
              label="FPS"
              value={project.exportSettings.fps}
              min={24}
              max={60}
              onChange={(value) =>
                setProject((prev) => ({
                  ...prev,
                  exportSettings: { ...prev.exportSettings, fps: value },
                }))
              }
            />
          </div>
          <div className="tuiwen-aspect-plan">
            <span>
              {tuiwenText.importStage.canvas} {aspectPlan.canvas.width}×
              {aspectPlan.canvas.height}
            </span>
            <span>
              NAI {aspectPlan.nai.width}×{aspectPlan.nai.height}
            </span>
            <span>Scale-to-cover ×{aspectPlan.cover.scaleToCover}</span>
            <span>
              {tuiwenText.importStage.kenBurnsSuggestion} ×
              {aspectPlan.cover.recommendedKenBurnsScale}
            </span>
            {aspectPlan.opusFreeWarning ? (
              <b>
                {tuiwenText.importStage.opusFreeExceeded}：
                {aspectPlan.nai.width}×{aspectPlan.nai.height}，
                {project.globalParams.steps} {tuiwenText.importStage.stepsUnit}
                。
              </b>
            ) : (
              <em>{tuiwenText.importStage.opusFreeOk}</em>
            )}
          </div>
          <label className="comic-field">
            <span>{tuiwenText.importStage.scriptLabel}</span>
            <textarea
              value={project.rawScript}
              onChange={(event) =>
                patchProject({
                  rawScript: event.target.value,
                  globalPrompt: event.target.value,
                })
              }
              placeholder={tuiwenText.importStage.scriptPlaceholder}
              style={{ minHeight: 220 }}
            />
          </label>
          <div className="redraw-step-footer">
            <span>{tuiwenText.importStage.footerHint}</span>
            <div className="comic-inline-actions">
              <Button
                variant="secondary"
                onClick={rebuildDraftShots}
                disabled={Boolean(busy)}
              >
                {tuiwenText.importStage.createDraft}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  void analyzeWithLlm();
                }}
                disabled={Boolean(busy)}
              >
                {busy === "analyze"
                  ? tuiwenText.importStage.llmAnalyzing
                  : tuiwenText.importStage.llmAnalyze}
              </Button>
            </div>
          </div>
        </section>
      )}

      {step === "storyboard" && (
        <section className="redraw-card tuiwen-storyboard-stage">
          <div className="redraw-globals-head">
            <div>
              <strong>{tw("story.title")}</strong>
              <span className="redraw-flow-hint">{tw("story.hint")}</span>
            </div>
            <div className="comic-inline-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  void convertAllPanels();
                }}
                disabled={Boolean(busy) || project.panels.length === 0}
              >
                {busy === "convert"
                  ? tw("story.convertBusy")
                  : tw("story.convertAll")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  void checkConsistency();
                }}
                disabled={Boolean(busy) || project.panels.length === 0}
              >
                {busy === "consistency"
                  ? tw("story.correctBusy")
                  : tw("story.consistency")}
              </Button>
            </div>
          </div>
          {project.panels.length === 0 ? (
            <div className="redraw-results-empty">
              <b>{tw("story.emptyTitle")}</b>
              <span>{tw("story.emptyDesc")}</span>
            </div>
          ) : (
            <div className="comic-panel-workspace tuiwen-shot-workspace">
              <aside className="comic-panel-sidebar">
                {project.panels.map((shot) => (
                  <button
                    type="button"
                    className={clsx(
                      "comic-panel-nav-item",
                      activeShot?.id === shot.id && "active",
                      shot.status === "done" && "selected",
                    )}
                    key={shot.id}
                    onClick={() => setActiveShotId(shot.id)}
                  >
                    <span>#{shot.index}</span>
                    <small>{statusText(shot, language)}</small>
                  </button>
                ))}
              </aside>
              {activeShot && (
                <article className="comic-panel-editor">
                  <header>
                    <strong>
                      {twf("story.editorTitle", { index: activeShot.index })}
                    </strong>
                    <div className="comic-inline-actions">
                      <Button
                        variant="secondary"
                        onClick={() => moveActiveShot(-1)}
                        disabled={activeShot.index <= 1}
                      >
                        {tw("story.moveUp")}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => moveActiveShot(1)}
                        disabled={activeShot.index >= project.panels.length}
                      >
                        {tw("story.moveDown")}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={splitActiveNarration}
                        disabled={!activeShot.narration.trim()}
                      >
                        {tw("story.split")}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={mergeActiveWithNext}
                        disabled={activeShot.index >= project.panels.length}
                      >
                        {tw("story.mergeNext")}
                      </Button>
                      <Button variant="secondary" onClick={addShotAfterActive}>
                        {tw("story.addNext")}
                      </Button>
                      <Button variant="secondary" onClick={deleteActiveShot}>
                        {tw("common.delete")}
                      </Button>
                      <span className={clsx("comic-status", activeShot.status)}>
                        {statusText(activeShot, language)}
                      </span>
                    </div>
                  </header>
                  <div className="comic-panel-editor-body">
                    <label className="comic-field">
                      <span>{tw("story.narration")}</span>
                      <textarea
                        value={activeShot.narration}
                        onChange={(event) =>
                          patchShot(activeShot.id, {
                            narration: event.target.value,
                            subtitle: {
                              ...activeShot.subtitle,
                              text: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                    <label className="comic-field">
                      <span>{tw("story.cnPrompt")}</span>
                      <textarea
                        value={activeShot.cnPrompt}
                        onChange={(event) =>
                          patchShot(activeShot.id, {
                            cnPrompt: event.target.value,
                            contextSummary: event.target.value.slice(0, 120),
                          })
                        }
                      />
                    </label>
                    <label className="comic-field">
                      <span>{tw("story.enPrompt")}</span>
                      <textarea
                        value={activeShot.enPrompt}
                        onChange={(event) =>
                          patchShot(activeShot.id, {
                            enPrompt: event.target.value,
                            status: event.target.value.trim()
                              ? "converted"
                              : "draft",
                          })
                        }
                      />
                    </label>
                    <div className="comic-panel-negative-row">
                      <NumberInput
                        label={tw("story.durationMs")}
                        value={activeShot.durationMs}
                        min={800}
                        max={30000}
                        step={100}
                        onChange={(value) =>
                          patchShot(activeShot.id, { durationMs: value })
                        }
                      />
                      <label className="comic-field">
                        <span>{tw("story.subtitle")}</span>
                        <select
                          value={activeShot.subtitle.enabled ? "on" : "off"}
                          onChange={(event) =>
                            patchShot(activeShot.id, {
                              subtitle: {
                                ...activeShot.subtitle,
                                enabled: event.target.value === "on",
                              },
                            })
                          }
                        >
                          <option value="on">{tw("story.subtitleOn")}</option>
                          <option value="off">{tw("story.subtitleOff")}</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </article>
              )}
            </div>
          )}
        </section>
      )}

      {step === "references" && (
        <section className="redraw-card tuiwen-references-stage">
          <div className="redraw-globals-head">
            <div>
              <strong>{tw("refs.title")}</strong>
              <span className="redraw-flow-hint">{tw("refs.hint")}</span>
            </div>
            <div className="comic-inline-actions">
              <label className="btn btn-secondary redraw-file-btn">
                {tw("refs.upload")}
                <input
                  type="file"
                  hidden
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    void addReferences(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
              <Button
                variant="secondary"
                onClick={foldReferencesIntoGlobal}
                disabled={!project.references.length || Boolean(busy)}
              >
                {tw("refs.fold")}
              </Button>
            </div>
          </div>

          <div className="tuiwen-aspect-plan">
            <span>
              {twf("refs.count", { count: project.references.length })}
            </span>
            <span>
              {twf("refs.enabledCount", {
                count: project.references.filter(
                  (ref) => ref.useForGeneration !== false,
                ).length,
              })}
            </span>
            <span>
              {twf("refs.preciseCount", {
                count: project.references.filter((ref) => ref.kind !== "vibe")
                  .length,
              })}
            </span>
            <b>{tw("refs.sampleTip")}</b>
          </div>

          <label className="comic-field">
            <span>{tw("refs.globalSetting")}</span>
            <textarea
              value={project.globalCharacterSetting}
              onChange={(event) =>
                patchProject({ globalCharacterSetting: event.target.value })
              }
              placeholder={tw("refs.globalPlaceholder")}
              style={{ minHeight: 110 }}
            />
          </label>

          {project.references.length === 0 ? (
            <div className="redraw-results-empty">
              <b>{tw("refs.emptyTitle")}</b>
              <span>{tw("refs.emptyDesc")}</span>
            </div>
          ) : (
            <div className="comic-reference-list tuiwen-reference-list">
              {project.references.map((reference) => (
                <article
                  className="comic-reference tuiwen-reference-card"
                  key={reference.id}
                >
                  <img
                    src={
                      reference.previewUrl ||
                      dataUrlFromBase64(reference.base64)
                    }
                    alt={reference.name}
                  />
                  <div>
                    <div className="tuiwen-reference-title">
                      <strong>{reference.name}</strong>
                      <label className="checkbox-line comic-reference-generate-toggle">
                        <input
                          type="checkbox"
                          checked={reference.useForGeneration !== false}
                          onChange={(event) =>
                            updateReference(reference.id, (current) => ({
                              ...current,
                              useForGeneration: event.target.checked,
                            }))
                          }
                        />
                        {tw("refs.useForGeneration")}
                      </label>
                    </div>

                    <div className="comic-reference-controls tuiwen-reference-controls">
                      <label>
                        <span>{tw("refs.kindLabel")}</span>
                        <select
                          value={reference.kind}
                          onChange={(event) =>
                            updateReference(reference.id, (current) => ({
                              ...current,
                              kind: event.target.value as ComicReferenceKind,
                            }))
                          }
                        >
                          <option value="precise">
                            {tw("refs.preciseOption")}
                          </option>
                          <option value="character">
                            {labelForReferenceKind("character", language)}
                          </option>
                          <option value="scene">
                            {labelForReferenceKind("scene", language)}
                          </option>
                          <option value="object">
                            {labelForReferenceKind("object", language)}
                          </option>
                          <option value="vibe">
                            {labelForReferenceKind("vibe", language)}
                          </option>
                        </select>
                      </label>
                      <label>
                        <span>{tw("refs.scopeLabel")}</span>
                        <select
                          value={reference.scope ?? "character"}
                          onChange={(event) =>
                            updateReference(reference.id, (current) => ({
                              ...current,
                              scope: event.target.value as ReversePromptScope,
                            }))
                          }
                        >
                          <option value="full">
                            {labelForReferenceScope("full", language)}
                          </option>
                          <option value="character">
                            {labelForReferenceScope("character", language)}
                          </option>
                          <option value="scene">
                            {labelForReferenceScope("scene", language)}
                          </option>
                          <option value="object">
                            {labelForReferenceScope("object", language)}
                          </option>
                        </select>
                      </label>
                      <NumberInput
                        label={tw("refs.strength")}
                        value={reference.strength}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(value) =>
                          updateReference(reference.id, (current) => ({
                            ...current,
                            strength: value,
                          }))
                        }
                      />
                      <NumberInput
                        label={tw("refs.infoExtracted")}
                        value={reference.infoExtracted}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(value) =>
                          updateReference(reference.id, (current) => ({
                            ...current,
                            infoExtracted: value,
                          }))
                        }
                      />
                    </div>

                    <label className="comic-field">
                      <span>{tw("refs.subjectHint")}</span>
                      <textarea
                        value={reference.subjectHint ?? ""}
                        onChange={(event) =>
                          updateReference(reference.id, (current) => ({
                            ...current,
                            subjectHint: event.target.value,
                          }))
                        }
                        placeholder={twf("refs.subjectPlaceholder", {
                          scope: labelForReferenceScope(
                            reference.scope ?? "character",
                            language,
                          ),
                        })}
                      />
                    </label>
                    <label className="comic-field">
                      <span>{tw("refs.reverseResult")}</span>
                      <textarea
                        value={reference.reversePrompt}
                        onChange={(event) =>
                          updateReference(reference.id, (current) => ({
                            ...current,
                            reversePrompt: event.target.value,
                          }))
                        }
                        placeholder={tw("refs.reversePlaceholder")}
                      />
                    </label>
                    <div className="comic-inline-actions">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          void reverseReference(reference);
                        }}
                        disabled={Boolean(busy)}
                      >
                        {busy === `reverse:${reference.id}`
                          ? tw("refs.reversing")
                          : tw("refs.reverse")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setProject((prev) => ({
                            ...prev,
                            references: prev.references.filter(
                              (item) => item.id !== reference.id,
                            ),
                          }))
                        }
                        disabled={Boolean(busy)}
                      >
                        {tw("common.delete")}
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {step === "generate" && (
        <section className="redraw-card tuiwen-generate-stage">
          <div className="redraw-globals-head">
            <div>
              <strong>{tw("gen.title")}</strong>
              <span className="redraw-flow-hint">{tw("gen.hint")}</span>
            </div>
            <div className="comic-inline-actions">
              {activeShot ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    void generateOneShot(activeShot);
                  }}
                  disabled={Boolean(busy)}
                >
                  {busy === `generate:${activeShot.id}`
                    ? tw("gen.currentBusy")
                    : twf("gen.generateOne", { index: activeShot.index })}
                </Button>
              ) : null}
              <Button
                variant="primary"
                onClick={() => {
                  void generatePendingShots();
                }}
                disabled={Boolean(busy) || project.panels.length === 0}
              >
                {busy === "generate" ? tw("gen.busy") : tw("gen.pending")}
              </Button>
              {busy === "generate" ? (
                <Button variant="danger" onClick={stopGenerationQueue}>
                  {tw("gen.stop")}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="tuiwen-aspect-plan">
            <span>
              {twf("gen.pendingCount", {
                count: project.panels.filter((shot) => shot.status !== "done")
                  .length,
              })}
            </span>
            <span>
              {twf("gen.size", {
                width: project.globalParams.width,
                height: project.globalParams.height,
              })}
            </span>
            <span>
              {twf("gen.steps", { steps: project.globalParams.steps })}
            </span>
            {queue ? (
              <b>
                {twf("gen.progress", {
                  done: queue.done,
                  total: queue.total,
                  current: queue.current,
                })}
              </b>
            ) : (
              <em>{generationLog || tw("gen.waiting")}</em>
            )}
          </div>
          <div className="tuiwen-shot-grid">
            {sortedShots(project).map((shot) => (
              <button
                key={shot.id}
                type="button"
                className={clsx("tuiwen-shot-card", shot.status)}
                onClick={() => {
                  setActiveShotId(shot.id);
                  setStep("storyboard");
                }}
              >
                {shot.outputUrl ? (
                  <img
                    src={shot.outputUrl}
                    alt={twf("gen.alt", { index: shot.index })}
                  />
                ) : (
                  <span className="tuiwen-shot-placeholder">#{shot.index}</span>
                )}
                <b>
                  #{shot.index} · {statusText(shot, language)}
                </b>
                <small>{shot.error || shot.enPrompt || shot.cnPrompt}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === "audio" && (
        <section className="redraw-card tuiwen-audio-stage">
          <div className="redraw-globals-head">
            <div>
              <strong>{tw("audio.title")}</strong>
              <span className="redraw-flow-hint">{tw("audio.hint")}</span>
            </div>
            <span className="settings-hint">
              {twf("audio.total", {
                seconds: (totalDurationMs / 1000).toFixed(1),
              })}
            </span>
          </div>
          <div className="tuiwen-tts-toolbar">
            <label className="comic-field">
              <span>TTS Provider</span>
              <select
                value={ttsProvider}
                onChange={(event) =>
                  setTtsProvider(event.target.value as TuiwenTtsProviderId)
                }
              >
                {ttsCatalog.providers.map((provider) => (
                  <option
                    key={provider.id}
                    value={provider.id}
                    disabled={!provider.available}
                  >
                    {provider.label}
                    {provider.available ? "" : tw("audio.pendingProvider")}
                  </option>
                ))}
              </select>
            </label>
            <label className="comic-field">
              <span>{tw("audio.voice")}</span>
              <select
                value={ttsVoice}
                onChange={(event) => setTtsVoice(event.target.value)}
              >
                {ttsCatalog.voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label}
                  </option>
                ))}
              </select>
            </label>
            <NumberInput
              label={tw("audio.rate")}
              value={ttsRatePercent}
              min={-50}
              max={100}
              step={5}
              onChange={setTtsRatePercent}
            />
            <NumberInput
              label={tw("audio.volume")}
              value={ttsVolumePercent}
              min={-100}
              max={100}
              step={5}
              onChange={setTtsVolumePercent}
            />
            <div className="tuiwen-tts-actions">
              <label
                className={clsx(
                  "btn btn-secondary redraw-file-btn",
                  (Boolean(busy) || project.source.type !== "subtitle") &&
                    "disabled",
                )}
              >
                {busy === "splitAudio"
                  ? tw("audio.splitBusy")
                  : tw("audio.splitLong")}
                <input
                  type="file"
                  hidden
                  accept="audio/*"
                  disabled={Boolean(busy) || project.source.type !== "subtitle"}
                  onChange={(event) => {
                    void importLongAudioBySubtitle(
                      event.target.files?.[0] ?? null,
                    );
                    event.target.value = "";
                  }}
                />
              </label>
              <Button
                variant="secondary"
                onClick={() => {
                  void runTts("active");
                }}
                disabled={!activeShot || Boolean(busy)}
              >
                {activeShot && busy === `tts:${activeShot.id}`
                  ? tw("audio.currentBusy")
                  : tw("audio.current")}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  void runTts("missing");
                }}
                disabled={!project.panels.length || Boolean(busy)}
              >
                {busy === "tts" ? tw("audio.batchBusy") : tw("audio.missing")}
              </Button>
            </div>
          </div>
          <div className="tuiwen-tts-notice">
            <b>{tw("audio.endpointTitle")}</b>
            <span>{tw("audio.endpointDesc")}</span>
            <span>{tw("audio.longDesc")}</span>
            {ttsLog ? <pre>{ttsLog}</pre> : null}
          </div>
          <div className="comic-panel-workspace tuiwen-shot-workspace">
            <aside className="comic-panel-sidebar">
              {project.panels.map((shot) => (
                <button
                  type="button"
                  className={clsx(
                    "comic-panel-nav-item",
                    activeShot?.id === shot.id && "active",
                    shot.audio && "selected",
                  )}
                  key={shot.id}
                  onClick={() => setActiveShotId(shot.id)}
                >
                  <span>#{shot.index}</span>
                  <small>
                    {shot.audio
                      ? twf("audio.audioSuffix", {
                          seconds: (shot.audio.durationMs / 1000).toFixed(1),
                        })
                      : twf("audio.defaultSuffix", {
                          seconds: (shot.durationMs / 1000).toFixed(1),
                        })}
                  </small>
                </button>
              ))}
            </aside>
            {activeShot ? (
              <article className="comic-panel-editor">
                <header>
                  <strong>
                    {twf("audio.editorTitle", { index: activeShot.index })}
                  </strong>
                  <label className="btn btn-secondary redraw-file-btn">
                    {tw("audio.importShotAudio")}
                    <input
                      type="file"
                      hidden
                      accept="audio/*"
                      onChange={(event) => {
                        void importAudioForActiveShot(
                          event.target.files?.[0] ?? null,
                        );
                        event.target.value = "";
                      }}
                    />
                  </label>
                </header>
                <div className="comic-panel-editor-body">
                  <label className="comic-field">
                    <span>{tw("audio.narrationText")}</span>
                    <textarea
                      value={activeShot.narration}
                      onChange={(event) =>
                        patchShot(activeShot.id, {
                          narration: event.target.value,
                          subtitle: {
                            ...activeShot.subtitle,
                            text: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <div
                    className={clsx(
                      "tuiwen-pacing-card",
                      activeNarrationPacing.tooLong && "warning",
                    )}
                  >
                    <span>
                      {twf("audio.estimatedRead", {
                        seconds: (
                          activeNarrationPacing.estimatedDurationMs / 1000
                        ).toFixed(1),
                      })}
                    </span>
                    <span>
                      {twf("audio.units", {
                        count: activeNarrationPacing.readableUnits,
                      })}
                    </span>
                    {activeNarrationPacing.tooLong ? (
                      <>
                        <b>
                          {twf("audio.tooLong", {
                            count: activeNarrationPacing.suggestedShotCount,
                          })}
                        </b>
                        <Button
                          variant="secondary"
                          onClick={splitActiveNarration}
                        >
                          {tw("audio.splitSemantic")}
                        </Button>
                      </>
                    ) : (
                      <em>{tw("audio.goodPacing")}</em>
                    )}
                  </div>
                  <NumberInput
                    label={tw("audio.shotDuration")}
                    value={activeShot.durationMs}
                    min={500}
                    max={60000}
                    step={100}
                    onChange={(value) =>
                      patchShot(activeShot.id, { durationMs: value })
                    }
                  />
                  <p className="settings-hint">
                    {activeShot.audio
                      ? twf("audio.importedAudio", {
                          source:
                            activeShot.audio.source === "tts"
                              ? "TTS"
                              : tw("audio.importedSource"),
                          path: activeShot.audio.filePath,
                        })
                      : tw("audio.noAudio")}
                  </p>
                </div>
              </article>
            ) : null}
          </div>
        </section>
      )}

      {step === "motion" && (
        <section className="redraw-card tuiwen-motion-stage">
          <div className="redraw-globals-head">
            <div>
              <strong>{tw("motion.title")}</strong>
              <span className="redraw-flow-hint">{tw("motion.hint")}</span>
            </div>
            <div className="comic-inline-actions">
              <span className="settings-hint">
                {twf("motion.kenBurns", {
                  scale: aspectPlan.cover.recommendedKenBurnsScale,
                })}
              </span>
              <Button
                variant="secondary"
                onClick={() => setMotionReplay((value) => value + 1)}
                disabled={!activeShot}
              >
                {tw("motion.replay")}
              </Button>
            </div>
          </div>
          {activeShot ? (
            <div className="tuiwen-motion-layout">
              <div
                className="tuiwen-motion-preview"
                key={`${activeShot.id}-${activeShot.keyframe.preset}-${activeShot.transition?.preset}-${motionReplay}`}
              >
                <div
                  className={clsx(
                    "tuiwen-motion-frame",
                    `preset-${activeShot.keyframe.preset}`,
                  )}
                  style={{
                    backgroundImage: activeShot.outputUrl
                      ? `url(${activeShot.outputUrl})`
                      : undefined,
                    aspectRatio: `${project.exportSettings.width} / ${project.exportSettings.height}`,
                  }}
                >
                  {!activeShot.outputUrl ? (
                    <span>#{activeShot.index}</span>
                  ) : null}
                </div>
                {nextShot && activeShot.transition?.preset !== "none" ? (
                  <div
                    className={clsx(
                      "tuiwen-motion-next",
                      `transition-${activeShot.transition?.preset ?? "fade"}`,
                    )}
                    style={{
                      backgroundImage: nextShot.outputUrl
                        ? `url(${nextShot.outputUrl})`
                        : undefined,
                      aspectRatio: `${project.exportSettings.width} / ${project.exportSettings.height}`,
                    }}
                  >
                    {!nextShot.outputUrl ? (
                      <span>#{nextShot.index}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="redraw-global-prompts">
                <label className="comic-field">
                  <span>{tw("motion.preset")}</span>
                  <select
                    value={activeShot.keyframe.preset}
                    onChange={(event) =>
                      patchShot(activeShot.id, {
                        keyframe: keyframeForPreset(
                          event.target.value as TuiwenKeyframePreset,
                        ),
                      })
                    }
                  >
                    <option value="none">{tw("motion.none")}</option>
                    <option value="kenBurns">Ken Burns</option>
                    <option value="zoomIn">{tw("motion.zoomIn")}</option>
                    <option value="zoomOut">{tw("motion.zoomOut")}</option>
                    <option value="panLeft">{tw("motion.panLeft")}</option>
                    <option value="panRight">{tw("motion.panRight")}</option>
                    <option value="panUp">{tw("motion.panUp")}</option>
                    <option value="panDown">{tw("motion.panDown")}</option>
                  </select>
                </label>
                <label className="comic-field">
                  <span>{tw("motion.transition")}</span>
                  <select
                    value={activeShot.transition?.preset ?? "fade"}
                    onChange={(event) =>
                      patchShot(activeShot.id, {
                        transition: {
                          ...(activeShot.transition ?? { durationMs: 250 }),
                          preset: event.target
                            .value as TuiwenTransition["preset"],
                        },
                      })
                    }
                  >
                    <option value="none">{tw("motion.none")}</option>
                    <option value="fade">{tw("motion.fade")}</option>
                    <option value="slideLeft">{tw("motion.slideLeft")}</option>
                    <option value="slideRight">
                      {tw("motion.slideRight")}
                    </option>
                    <option value="zoom">{tw("motion.zoom")}</option>
                    <option value="wipe">{tw("motion.wipe")}</option>
                  </select>
                </label>
                <NumberInput
                  label={tw("motion.transitionDuration")}
                  value={activeShot.transition?.durationMs ?? 250}
                  min={0}
                  max={2000}
                  step={50}
                  onChange={(value) =>
                    patchShot(activeShot.id, {
                      transition: {
                        ...(activeShot.transition ?? { preset: "fade" }),
                        durationMs: value,
                      },
                    })
                  }
                />
                <p className="settings-hint">{tw("motion.previewHint")}</p>
              </div>
            </div>
          ) : (
            <div className="redraw-results-empty">
              <b>{tw("motion.emptyTitle")}</b>
              <span>{tw("motion.emptyDesc")}</span>
            </div>
          )}
        </section>
      )}

      {step !== "import" &&
        step !== "storyboard" &&
        step !== "references" &&
        step !== "generate" &&
        step !== "audio" &&
        step !== "motion" && (
          <section className="redraw-card tuiwen-placeholder-stage">
            <strong>{tuiwenText.steps[step].label}</strong>
            {step === "export" && (
              <>
                <p>{tw("export.desc")}</p>
                <div className="redraw-global-prompts">
                  <label className="comic-field">
                    <span>{tw("export.draftDir")}</span>
                    <input
                      value={project.exportSettings.jianyingDraftDir ?? ""}
                      placeholder={tw("export.draftPlaceholder")}
                      onChange={(event) =>
                        setProject((prev) => ({
                          ...prev,
                          exportSettings: {
                            ...prev.exportSettings,
                            jianyingDraftDir: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="comic-field">
                    <span>{tw("export.introText")}</span>
                    <input
                      value={project.exportSettings.intro?.text ?? ""}
                      onChange={(event) =>
                        setProject((prev) => ({
                          ...prev,
                          exportSettings: {
                            ...prev.exportSettings,
                            intro: {
                              ...(prev.exportSettings.intro ?? {
                                durationMs: 1600,
                              }),
                              text: event.target.value,
                            },
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="comic-field">
                    <span>{tw("export.outroText")}</span>
                    <input
                      value={project.exportSettings.outro?.text ?? ""}
                      onChange={(event) =>
                        setProject((prev) => ({
                          ...prev,
                          exportSettings: {
                            ...prev.exportSettings,
                            outro: {
                              ...(prev.exportSettings.outro ?? {
                                durationMs: 1800,
                              }),
                              text: event.target.value,
                            },
                          },
                        }))
                      }
                    />
                  </label>
                  <NumberInput
                    label={tw("export.introDuration")}
                    value={project.exportSettings.intro?.durationMs ?? 1600}
                    min={0}
                    max={10000}
                    step={100}
                    onChange={(value) =>
                      setProject((prev) => ({
                        ...prev,
                        exportSettings: {
                          ...prev.exportSettings,
                          intro: {
                            ...(prev.exportSettings.intro ?? { text: "" }),
                            durationMs: value,
                          },
                        },
                      }))
                    }
                  />
                  <NumberInput
                    label={tw("export.outroDuration")}
                    value={project.exportSettings.outro?.durationMs ?? 1800}
                    min={0}
                    max={10000}
                    step={100}
                    onChange={(value) =>
                      setProject((prev) => ({
                        ...prev,
                        exportSettings: {
                          ...prev.exportSettings,
                          outro: {
                            ...(prev.exportSettings.outro ?? { text: "" }),
                            durationMs: value,
                          },
                        },
                      }))
                    }
                  />
                  <label className="btn btn-secondary redraw-file-btn">
                    {tw("export.chooseBgm")}
                    <input
                      type="file"
                      hidden
                      accept="audio/*"
                      onChange={(event) => {
                        pickBgm(event.target.files?.[0] ?? null);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <NumberInput
                    label={tw("export.bgmVolume")}
                    value={Math.round(
                      (project.exportSettings.bgm?.volume ?? 0.22) * 100,
                    )}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(value) =>
                      setProject((prev) => ({
                        ...prev,
                        exportSettings: {
                          ...prev.exportSettings,
                          bgm: prev.exportSettings.bgm
                            ? {
                                ...prev.exportSettings.bgm,
                                volume: value / 100,
                              }
                            : {
                                filePath: "",
                                volume: value / 100,
                                loop: true,
                                fadeMs: 1200,
                              },
                        },
                      }))
                    }
                  />
                  <span className="settings-hint">
                    {project.exportSettings.bgm?.filePath || tw("export.noBgm")}
                  </span>
                </div>
                <div className="tuiwen-aspect-plan">
                  <span>
                    {twf("export.video", {
                      width: project.exportSettings.width,
                      height: project.exportSettings.height,
                    })}
                  </span>
                  <span>
                    {twf("export.total", {
                      seconds: (totalDurationMs / 1000).toFixed(1),
                    })}
                  </span>
                  <span>
                    {twf("export.shots", { count: project.panels.length })}
                  </span>
                  <b>{tw("export.target")}</b>
                </div>
                <div className="comic-inline-actions">
                  <Button
                    variant="primary"
                    onClick={() => {
                      void exportJianYingDraft();
                    }}
                    disabled={Boolean(busy) || project.panels.length === 0}
                  >
                    {busy === "exportJianYing"
                      ? tw("export.busy")
                      : tw("export.write")}
                  </Button>
                  {exportResult?.draftPath ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void window.naiDesktop.openInExplorer(
                          exportResult.draftPath!,
                        );
                      }}
                    >
                      {tw("export.openDraft")}
                    </Button>
                  ) : null}
                </div>
                {exportResult ? (
                  <div
                    className={clsx(
                      "tuiwen-export-result",
                      exportResult.ok ? "ok" : "failed",
                    )}
                  >
                    <b>
                      {exportResult.ok
                        ? tw("export.resultDone")
                        : tw("export.resultFailed")}
                    </b>
                    <span>{exportResult.message}</span>
                    {exportResult.contentPath ? (
                      <small>content: {exportResult.contentPath}</small>
                    ) : null}
                    {exportResult.metaPath ? (
                      <small>meta: {exportResult.metaPath}</small>
                    ) : null}
                    {exportResult.validation ? (
                      <div className="tuiwen-draft-validation">
                        <b>
                          {tw("export.validation")}：
                          {exportResult.validation.errorCount === 0
                            ? tw("export.validationPass")
                            : twf("export.validationErrors", {
                                count: exportResult.validation.errorCount,
                              })}
                          {exportResult.validation.warningCount > 0
                            ? ` · ${twf("export.validationWarnings", { count: exportResult.validation.warningCount })}`
                            : ""}
                        </b>
                        <small>{exportResult.validation.targetVersion}</small>
                        <ul>
                          {exportResult.validation.checks.map((check) => (
                            <li key={check.id} className={check.status}>
                              <span>
                                {check.status === "pass"
                                  ? "✓"
                                  : check.status === "warning"
                                    ? "!"
                                    : "×"}
                              </span>
                              <div>
                                <strong>{check.label}</strong>
                                <small>{check.detail}</small>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {exportResult.warnings?.length ? (
                      <ul>
                        {exportResult.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </section>
        )}
    </main>
  );
}
