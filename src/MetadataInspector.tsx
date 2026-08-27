import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Button, IconText, SelectMenu } from "./components/ui";
import { Icon } from "./components/icons";
import { normalizeAppLanguage } from "./i18n";
import { inspectImageMetadata, parseImageMeta, type ImageMetadataReport } from "./png-meta";
import { loadMetadataSnapshot, saveMetadataSnapshot } from "./metadata-snapshot";
import { useAppStore } from "./store";
import type { AppLanguage, HistoryGroup, HistoryItem, ImportedParams } from "./types";

type MetadataText = {
  eyebrow: string;
  title: string;
  subtitle: string;
  back: string;
  dropTitle: string;
  dropHint: string;
  choose: string;
  imageAlt: string;
  detected: string;
  sourceNovelAi: string;
  sourceSd: string;
  sourceComfy: string;
  sourceUnknown: string;
  compatible: string;
  compatibleHint: string;
  apply: string;
  applied: string;
  noCompatible: string;
  params: string;
  noParams: string;
  raw: string;
  copyRaw: string;
  copied: string;
  copyItem: string;
  itemCopied: string;
  localOnly: string;
  replace: string;
  viewOnly: string;
  readFailed: string;
  historyTitle: string;
  historyHint: string;
  historyGroup: string;
  allGroups: string;
  ungrouped: string;
  historyEmpty: string;
  historyLoading: string;
  historyFailed: string;
  historySelected: string;
  historyImageAlt: string;
  collapseHistory: string;
  expandHistory: string;
  loadMore: string;
};

const TEXT: Record<AppLanguage, MetadataText> = {
  "zh-CN": {
    eyebrow: "IMAGE METADATA",
    title: "恢复图片原数据",
    subtitle: "读取 NovelAI、Stable Diffusion WebUI / Forge 与 ComfyUI 图片内嵌参数。",
    back: "返回工具首页",
    dropTitle: "导入原始图片",
    dropHint: "拖入或选择 PNG、JPG、JPEG、WebP；全程只在本机读取，不会上传。",
    choose: "选择图片",
    imageAlt: "待解析图片",
    detected: "识别来源",
    sourceNovelAi: "NovelAI",
    sourceSd: "Stable Diffusion WebUI / Forge",
    sourceComfy: "ComfyUI",
    sourceUnknown: "未知或无可识别参数",
    compatible: "可一键使用的参数",
    compatibleHint: "只套用 NovelAI 支持的兼容项；SD 模型、VAE、LoRA 等原值保留在下方供查看。",
    apply: "一键使用到生成",
    applied: "已套用兼容参数并切换到生成面板",
    noCompatible: "没有可直接套用到 NovelAI 的兼容参数",
    params: "逐项参数",
    noParams: "没有读取到可展示的生成参数。图片可能被平台压缩或导出时关闭了元数据。",
    raw: "完整原始数据",
    copyRaw: "复制原始数据",
    copied: "原始数据已复制",
    copyItem: "复制此项",
    itemCopied: "已复制",
    localOnly: "零积分 · 不调用 AI · 不发送网络请求",
    replace: "更换图片",
    viewOnly: "部分 Stable Diffusion / ComfyUI 专用参数只能查看，无法直接套用到 NovelAI。",
    readFailed: "无法读取该图片，请确认文件未损坏并重新选择原图。",
    historyTitle: "从历史与分组选择",
    historyHint: "直接点击分组中的图片，即可读取并显示其原数据。",
    historyGroup: "图片分组",
    allGroups: "全部分组",
    ungrouped: "未分组",
    historyEmpty: "该分组中没有可读取的图片。",
    historyLoading: "正在读取历史图片…",
    historyFailed: "无法读取历史图片列表。",
    historySelected: "已读取图片原数据",
    historyImageAlt: "历史图片",
    collapseHistory: "收起历史图片",
    expandHistory: "展开历史图片",
    loadMore: "加载更多",
  },
  "zh-TW": {
    eyebrow: "IMAGE METADATA",
    title: "恢復圖片原始資料",
    subtitle: "讀取 NovelAI、Stable Diffusion WebUI / Forge 與 ComfyUI 圖片內嵌參數。",
    back: "返回工具首頁",
    dropTitle: "匯入原始圖片",
    dropHint: "拖入或選擇 PNG、JPG、JPEG、WebP；全程只在本機讀取，不會上傳。",
    choose: "選擇圖片",
    imageAlt: "待解析圖片",
    detected: "辨識來源",
    sourceNovelAi: "NovelAI",
    sourceSd: "Stable Diffusion WebUI / Forge",
    sourceComfy: "ComfyUI",
    sourceUnknown: "未知或無可辨識參數",
    compatible: "可一鍵使用的參數",
    compatibleHint: "只套用 NovelAI 支援的相容項目；SD 模型、VAE、LoRA 等原值保留於下方供查看。",
    apply: "一鍵套用到生成",
    applied: "已套用相容參數並切換到生成面板",
    noCompatible: "沒有可直接套用到 NovelAI 的相容參數",
    params: "逐項參數",
    noParams: "沒有讀取到可顯示的生成參數。圖片可能被平台壓縮或匯出時關閉了中繼資料。",
    raw: "完整原始資料",
    copyRaw: "複製原始資料",
    copied: "原始資料已複製",
    copyItem: "複製此項",
    itemCopied: "已複製",
    localOnly: "零積分 · 不呼叫 AI · 不傳送網路請求",
    replace: "更換圖片",
    viewOnly: "部分 Stable Diffusion / ComfyUI 專用參數只能查看，無法直接套用到 NovelAI。",
    readFailed: "無法讀取該圖片，請確認檔案未損壞並重新選擇原圖。",
    historyTitle: "從歷史與分組選擇",
    historyHint: "直接點擊分組中的圖片，即可讀取並顯示其原始資料。",
    historyGroup: "圖片分組",
    allGroups: "全部分組",
    ungrouped: "未分組",
    historyEmpty: "此分組沒有可讀取的圖片。",
    historyLoading: "正在讀取歷史圖片…",
    historyFailed: "無法讀取歷史圖片列表。",
    historySelected: "已讀取圖片原始資料",
    historyImageAlt: "歷史圖片",
    collapseHistory: "收起歷史圖片",
    expandHistory: "展開歷史圖片",
    loadMore: "載入更多",
  },
  "en-US": {
    eyebrow: "IMAGE METADATA",
    title: "Restore Image Metadata",
    subtitle: "Read embedded NovelAI, Stable Diffusion WebUI / Forge, and ComfyUI generation data.",
    back: "Back to tools",
    dropTitle: "Import the original image",
    dropHint: "Drop or choose a PNG, JPG, JPEG, or WebP. Processing stays on this device.",
    choose: "Choose image",
    imageAlt: "Image being inspected",
    detected: "Detected source",
    sourceNovelAi: "NovelAI",
    sourceSd: "Stable Diffusion WebUI / Forge",
    sourceComfy: "ComfyUI",
    sourceUnknown: "Unknown or no recognized parameters",
    compatible: "Parameters ready to reuse",
    compatibleHint: "Only NovelAI-compatible values are applied. SD model, VAE, and LoRA values remain visible below.",
    apply: "Use in Generate",
    applied: "Compatible parameters applied; opened Generate",
    noCompatible: "No compatible parameters can be applied to NovelAI",
    params: "Parameter details",
    noParams: "No generation parameters were found. The image may have been compressed or exported without metadata.",
    raw: "Complete raw metadata",
    copyRaw: "Copy raw metadata",
    copied: "Raw metadata copied",
    copyItem: "Copy value",
    itemCopied: "Copied",
    localOnly: "0 Anlas · no AI call · no network request",
    replace: "Replace image",
    viewOnly: "Some Stable Diffusion / ComfyUI-only values are view-only and cannot be applied directly to NovelAI.",
    readFailed: "Could not read this image. Check that the file is intact and choose the original again.",
    historyTitle: "Choose from history and groups",
    historyHint: "Click any grouped image to read and display its original metadata.",
    historyGroup: "Image group",
    allGroups: "All groups",
    ungrouped: "Ungrouped",
    historyEmpty: "No readable images are available in this group.",
    historyLoading: "Loading history images…",
    historyFailed: "Could not load the history image list.",
    historySelected: "Image metadata loaded",
    historyImageAlt: "History image",
    collapseHistory: "Collapse history images",
    expandHistory: "Expand history images",
    loadMore: "Load more",
  },
  "ja-JP": {
    eyebrow: "IMAGE METADATA",
    title: "画像の元データを復元",
    subtitle: "NovelAI、Stable Diffusion WebUI / Forge、ComfyUI の埋め込み生成情報を読み取ります。",
    back: "ツールへ戻る",
    dropTitle: "元画像を読み込む",
    dropHint: "PNG、JPG、JPEG、WebP をドロップまたは選択。端末内だけで処理します。",
    choose: "画像を選択",
    imageAlt: "解析する画像",
    detected: "検出元",
    sourceNovelAi: "NovelAI",
    sourceSd: "Stable Diffusion WebUI / Forge",
    sourceComfy: "ComfyUI",
    sourceUnknown: "不明または認識可能な設定なし",
    compatible: "再利用できる設定",
    compatibleHint: "NovelAI と互換性のある項目だけを適用します。SD のモデル、VAE、LoRA は下で確認できます。",
    apply: "生成画面で使用",
    applied: "互換設定を適用し、生成画面を開きました",
    noCompatible: "NovelAI に直接適用できる互換設定がありません",
    params: "設定一覧",
    noParams: "生成設定を読み取れません。圧縮されたか、メタデータなしで保存された可能性があります。",
    raw: "完全な元データ",
    copyRaw: "元データをコピー",
    copied: "元データをコピーしました",
    copyItem: "この値をコピー",
    itemCopied: "コピーしました",
    localOnly: "Anlas 0 · AI 不使用 · ネットワーク送信なし",
    replace: "画像を変更",
    viewOnly: "一部の Stable Diffusion / ComfyUI 専用設定は閲覧のみで、NovelAI へ直接適用できません。",
    readFailed: "画像を読み取れません。ファイルが壊れていないか確認し、元画像を選び直してください。",
    historyTitle: "履歴とグループから選択",
    historyHint: "グループ内の画像をクリックすると、元データを読み取って表示します。",
    historyGroup: "画像グループ",
    allGroups: "すべてのグループ",
    ungrouped: "未分類",
    historyEmpty: "このグループに読み取れる画像はありません。",
    historyLoading: "履歴画像を読み込み中…",
    historyFailed: "履歴画像一覧を読み込めません。",
    historySelected: "画像の元データを読み込みました",
    historyImageAlt: "履歴画像",
    collapseHistory: "履歴画像を折りたたむ",
    expandHistory: "履歴画像を展開",
    loadMore: "さらに読み込む",
  },
  "ko-KR": {
    eyebrow: "IMAGE METADATA",
    title: "이미지 원본 데이터 복원",
    subtitle: "NovelAI, Stable Diffusion WebUI / Forge, ComfyUI 이미지의 내장 생성 정보를 읽습니다.",
    back: "도구로 돌아가기",
    dropTitle: "원본 이미지 가져오기",
    dropHint: "PNG, JPG, JPEG, WebP를 놓거나 선택하세요. 모든 처리는 기기 안에서만 진행됩니다.",
    choose: "이미지 선택",
    imageAlt: "분석할 이미지",
    detected: "감지된 출처",
    sourceNovelAi: "NovelAI",
    sourceSd: "Stable Diffusion WebUI / Forge",
    sourceComfy: "ComfyUI",
    sourceUnknown: "알 수 없거나 인식 가능한 매개변수 없음",
    compatible: "바로 사용할 수 있는 매개변수",
    compatibleHint: "NovelAI와 호환되는 값만 적용합니다. SD 모델, VAE, LoRA 원본 값은 아래에서 확인할 수 있습니다.",
    apply: "생성 화면에서 사용",
    applied: "호환 매개변수를 적용하고 생성 화면을 열었습니다",
    noCompatible: "NovelAI에 바로 적용할 수 있는 호환 매개변수가 없습니다",
    params: "매개변수 상세",
    noParams: "생성 매개변수를 찾지 못했습니다. 이미지가 압축되었거나 메타데이터 없이 저장되었을 수 있습니다.",
    raw: "전체 원본 데이터",
    copyRaw: "원본 데이터 복사",
    copied: "원본 데이터를 복사했습니다",
    copyItem: "이 값 복사",
    itemCopied: "복사했습니다",
    localOnly: "Anlas 0 · AI 호출 없음 · 네트워크 전송 없음",
    replace: "이미지 변경",
    viewOnly: "일부 Stable Diffusion / ComfyUI 전용 값은 보기 전용이며 NovelAI에 직접 적용할 수 없습니다.",
    readFailed: "이미지를 읽을 수 없습니다. 파일이 손상되지 않았는지 확인하고 원본을 다시 선택하세요.",
    historyTitle: "기록 및 그룹에서 선택",
    historyHint: "그룹의 이미지를 클릭하면 원본 데이터를 읽어 표시합니다.",
    historyGroup: "이미지 그룹",
    allGroups: "모든 그룹",
    ungrouped: "미분류",
    historyEmpty: "이 그룹에 읽을 수 있는 이미지가 없습니다.",
    historyLoading: "기록 이미지를 불러오는 중…",
    historyFailed: "기록 이미지 목록을 불러올 수 없습니다.",
    historySelected: "이미지 원본 데이터를 불러왔습니다",
    historyImageAlt: "기록 이미지",
    collapseHistory: "기록 이미지 접기",
    expandHistory: "기록 이미지 펼치기",
    loadMore: "더 불러오기",
  },
};

export const IMPORT_LABELS: Record<keyof ImportedParams, string> = {
  positivePrompt: "Positive prompt",
  negativePrompt: "Negative prompt",
  stylePrompt: "Style prompt",
  model: "Model",
  steps: "Steps",
  cfgScale: "CFG scale",
  cfgRescale: "CFG rescale",
  sampler: "Sampler",
  noiseSchedule: "Noise schedule",
  seed: "Seed",
  seedMode: "Seed mode",
  width: "Width",
  height: "Height",
  smea: "SMEA",
  smeaDyn: "SMEA Dyn",
  ucPreset: "UC preset",
  qualityToggle: "Quality toggle",
  variety: "Variety+",
};

const PARAMETER_ENGLISH: Record<string, string> = {
  "positive prompt": "Positive prompt",
  "negative prompt": "Negative prompt",
  "style prompt": "Style prompt",
  description: "Description",
  prompt: "Prompt",
  uc: "Undesired content",
  steps: "Steps",
  "cfg scale": "CFG scale",
  scale: "CFG scale",
  "cfg rescale": "CFG rescale",
  cfg_rescale: "CFG rescale",
  sampler: "Sampler",
  scheduler: "Scheduler",
  "schedule type": "Schedule type",
  "noise schedule": "Noise schedule",
  noise_schedule: "Noise schedule",
  seed: "Seed",
  "seed mode": "Seed mode",
  width: "Width",
  height: "Height",
  size: "Size",
  model: "Model",
  source: "Source",
  software: "Software",
  "model hash": "Model hash",
  vae: "VAE",
  "vae hash": "VAE hash",
  lora: "LoRA",
  checkpoint: "Checkpoint",
  denoise: "Denoise",
  "denoising strength": "Denoising strength",
  "clip skip": "Clip skip",
  version: "Version",
  smea: "SMEA",
  sm: "SMEA",
  "smea dyn": "SMEA Dyn",
  sm_dyn: "SMEA Dyn",
  dynamic_thresholding: "Dynamic thresholding",
  qualitytoggle: "Quality toggle",
  "quality toggle": "Quality toggle",
  "uc preset": "UC preset",
  "variety+": "Variety+",
  params_version: "Parameters version",
  "hires steps": "Hires steps",
  "hires upscale": "Hires upscale",
  "hires upscaler": "Hires upscaler",
  "hires prompt": "Hires prompt",
  "hires negative prompt": "Hires negative prompt",
  "lora hashes": "LoRA hashes",
  "adetailer model": "ADetailer model",
  "adetailer prompt": "ADetailer prompt",
  "adetailer negative prompt": "ADetailer negative prompt",
  "adetailer confidence": "ADetailer confidence",
  "adetailer dilate erode": "ADetailer dilate/erode",
  "adetailer mask blur": "ADetailer mask blur",
  "adetailer denoising strength": "ADetailer denoising strength",
  "adetailer inpaint only masked": "ADetailer inpaint only masked",
  "adetailer inpaint padding": "ADetailer inpaint padding",
  "adetailer version": "ADetailer version",
  "skip_cfg_above_sigma": "Skip CFG above sigma",
  "controlnet_strength": "ControlNet strength",
  "reference_strength_multiple": "Reference strengths",
  "reference_information_extracted_multiple": "Reference information extracted",
  "director_reference_strength_values": "Director reference strengths",
  "director_reference_information_extracted": "Director reference information extracted",
};

const PARAMETER_TRANSLATIONS: Record<Exclude<AppLanguage, "en-US">, Record<string, string>> = {
  "zh-CN": {
    "Positive prompt": "正面提示词", "Negative prompt": "负面提示词", Description: "提示词描述",
    Prompt: "提示词", "Undesired content": "不希望出现的内容", Steps: "采样步数", "CFG scale": "提示词引导强度",
    "CFG rescale": "CFG 重缩放", Sampler: "采样器", Scheduler: "调度器", "Schedule type": "调度类型",
    "Noise schedule": "噪声调度", Seed: "种子", "Seed mode": "种子模式", Width: "宽度", Height: "高度",
    Size: "尺寸", Model: "模型", Source: "来源模型", Software: "生成软件", "Model hash": "模型哈希",
    VAE: "VAE 模型", "VAE hash": "VAE 哈希", LoRA: "LoRA 模型", Checkpoint: "基础模型",
    Denoise: "降噪强度", "Denoising strength": "重绘强度", "Clip skip": "CLIP 跳过层数", Version: "版本",
    SMEA: "SMEA 平滑", "SMEA Dyn": "动态 SMEA", "Dynamic thresholding": "动态阈值",
    "Quality toggle": "质量增强", "Style prompt": "风格提示词", "UC preset": "负面预设", "Variety+": "多样化", "Parameters version": "参数版本", "Hires steps": "高清修复步数",
    "Hires upscale": "高清放大倍数", "Hires upscaler": "高清放大算法",
    "Hires prompt": "高清修复提示词", "Hires negative prompt": "高清修复负面提示词", "LoRA hashes": "LoRA 哈希",
    "ADetailer model": "细节修复模型", "ADetailer prompt": "细节修复提示词", "ADetailer negative prompt": "细节修复负面提示词",
    "ADetailer confidence": "细节检测置信度", "ADetailer dilate/erode": "细节遮罩扩张/侵蚀", "ADetailer mask blur": "细节遮罩模糊",
    "ADetailer denoising strength": "细节修复重绘强度", "ADetailer inpaint only masked": "仅重绘细节遮罩", "ADetailer inpaint padding": "细节重绘边距", "ADetailer version": "细节修复版本",
    "Skip CFG above sigma": "高噪声阶段跳过 CFG", "ControlNet strength": "ControlNet 强度", "Reference strengths": "参考图强度组",
    "Reference information extracted": "参考图信息提取组", "Director reference strengths": "精准参考强度组", "Director reference information extracted": "精准参考信息提取组",
  },
  "zh-TW": {
    "Positive prompt": "正面提示詞", "Negative prompt": "負面提示詞", Description: "提示詞描述",
    Prompt: "提示詞", "Undesired content": "不希望出現的內容", Steps: "取樣步數", "CFG scale": "提示詞引導強度",
    "CFG rescale": "CFG 重新縮放", Sampler: "取樣器", Scheduler: "排程器", "Schedule type": "排程類型",
    "Noise schedule": "雜訊排程", Seed: "種子", "Seed mode": "種子模式", Width: "寬度", Height: "高度",
    Size: "尺寸", Model: "模型", Source: "來源模型", Software: "生成軟體", "Model hash": "模型雜湊",
    VAE: "VAE 模型", "VAE hash": "VAE 雜湊", LoRA: "LoRA 模型", Checkpoint: "基礎模型",
    Denoise: "降噪強度", "Denoising strength": "重繪強度", "Clip skip": "CLIP 跳過層數", Version: "版本",
    SMEA: "SMEA 平滑", "SMEA Dyn": "動態 SMEA", "Dynamic thresholding": "動態閾值",
    "Quality toggle": "品質增強", "Style prompt": "風格提示詞", "UC preset": "負面預設", "Variety+": "多樣化", "Parameters version": "參數版本", "Hires steps": "高解析修復步數",
    "Hires upscale": "高解析放大倍數", "Hires upscaler": "高解析放大演算法",
    "Hires prompt": "高解析修復提示詞", "Hires negative prompt": "高解析修復負面提示詞", "LoRA hashes": "LoRA 雜湊",
    "ADetailer model": "細節修復模型", "ADetailer prompt": "細節修復提示詞", "ADetailer negative prompt": "細節修復負面提示詞",
    "ADetailer confidence": "細節偵測信賴度", "ADetailer dilate/erode": "細節遮罩擴張/侵蝕", "ADetailer mask blur": "細節遮罩模糊",
    "ADetailer denoising strength": "細節修復重繪強度", "ADetailer inpaint only masked": "僅重繪細節遮罩", "ADetailer inpaint padding": "細節重繪邊距", "ADetailer version": "細節修復版本",
    "Skip CFG above sigma": "高雜訊階段略過 CFG", "ControlNet strength": "ControlNet 強度", "Reference strengths": "參考圖強度組",
    "Reference information extracted": "參考圖資訊擷取組", "Director reference strengths": "精準參考強度組", "Director reference information extracted": "精準參考資訊擷取組",
  },
  "ja-JP": {
    "Positive prompt": "ポジティブプロンプト", "Negative prompt": "ネガティブプロンプト", Description: "プロンプト記述",
    Prompt: "プロンプト", "Undesired content": "除外内容", Steps: "ステップ数", "CFG scale": "CFG スケール",
    "CFG rescale": "CFG リスケール", Sampler: "サンプラー", Scheduler: "スケジューラー", "Schedule type": "スケジュール方式",
    "Noise schedule": "ノイズスケジュール", Seed: "シード", "Seed mode": "シード方式", Width: "幅", Height: "高さ",
    Size: "サイズ", Model: "モデル", Source: "生成元", Software: "生成ソフト", "Model hash": "モデルハッシュ",
    VAE: "VAE", "VAE hash": "VAE ハッシュ", LoRA: "LoRA", Checkpoint: "チェックポイント",
    Denoise: "ノイズ除去", "Denoising strength": "ノイズ除去強度", "Clip skip": "CLIP スキップ", Version: "バージョン",
    SMEA: "SMEA", "SMEA Dyn": "動的 SMEA", "Dynamic thresholding": "動的しきい値",
    "Quality toggle": "品質向上", "Style prompt": "スタイルプロンプト", "UC preset": "ネガティブプリセット", "Variety+": "多様化", "Parameters version": "パラメータ版", "Hires steps": "高解像度ステップ",
    "Hires upscale": "高解像度倍率", "Hires upscaler": "高解像度アップスケーラー",
    "Hires prompt": "高解像度プロンプト", "Hires negative prompt": "高解像度ネガティブプロンプト", "LoRA hashes": "LoRA ハッシュ",
    "ADetailer model": "ディテール修正モデル", "ADetailer prompt": "ディテール修正プロンプト", "ADetailer negative prompt": "ディテール修正ネガティブプロンプト",
    "ADetailer confidence": "ディテール検出信頼度", "ADetailer dilate/erode": "マスク膨張/収縮", "ADetailer mask blur": "マスクぼかし",
    "ADetailer denoising strength": "ディテール修正強度", "ADetailer inpaint only masked": "マスク部分のみ修正", "ADetailer inpaint padding": "修正余白", "ADetailer version": "ADetailer バージョン",
    "Skip CFG above sigma": "高ノイズ時の CFG スキップ", "ControlNet strength": "ControlNet 強度", "Reference strengths": "参照強度一覧",
    "Reference information extracted": "参照情報抽出一覧", "Director reference strengths": "精密参照強度一覧", "Director reference information extracted": "精密参照情報抽出一覧",
  },
  "ko-KR": {
    "Positive prompt": "긍정 프롬프트", "Negative prompt": "부정 프롬프트", Description: "프롬프트 설명",
    Prompt: "프롬프트", "Undesired content": "제외할 내용", Steps: "샘플링 단계", "CFG scale": "CFG 강도",
    "CFG rescale": "CFG 재조정", Sampler: "샘플러", Scheduler: "스케줄러", "Schedule type": "스케줄 유형",
    "Noise schedule": "노이즈 스케줄", Seed: "시드", "Seed mode": "시드 모드", Width: "너비", Height: "높이",
    Size: "크기", Model: "모델", Source: "출처 모델", Software: "생성 소프트웨어", "Model hash": "모델 해시",
    VAE: "VAE 모델", "VAE hash": "VAE 해시", LoRA: "LoRA 모델", Checkpoint: "체크포인트",
    Denoise: "노이즈 제거", "Denoising strength": "노이즈 제거 강도", "Clip skip": "CLIP 건너뛰기", Version: "버전",
    SMEA: "SMEA", "SMEA Dyn": "동적 SMEA", "Dynamic thresholding": "동적 임계값",
    "Quality toggle": "품질 향상", "Style prompt": "스타일 프롬프트", "UC preset": "네거티브 프리셋", "Variety+": "다양화", "Parameters version": "매개변수 버전", "Hires steps": "고해상도 단계",
    "Hires upscale": "고해상도 배율", "Hires upscaler": "고해상도 업스케일러",
    "Hires prompt": "고해상도 프롬프트", "Hires negative prompt": "고해상도 부정 프롬프트", "LoRA hashes": "LoRA 해시",
    "ADetailer model": "세부 보정 모델", "ADetailer prompt": "세부 보정 프롬프트", "ADetailer negative prompt": "세부 보정 부정 프롬프트",
    "ADetailer confidence": "세부 감지 신뢰도", "ADetailer dilate/erode": "마스크 팽창/침식", "ADetailer mask blur": "마스크 흐림",
    "ADetailer denoising strength": "세부 보정 강도", "ADetailer inpaint only masked": "마스크 부분만 보정", "ADetailer inpaint padding": "보정 여백", "ADetailer version": "ADetailer 버전",
    "Skip CFG above sigma": "고노이즈 CFG 건너뛰기", "ControlNet strength": "ControlNet 강도", "Reference strengths": "참조 강도 목록",
    "Reference information extracted": "참조 정보 추출 목록", "Director reference strengths": "정밀 참조 강도 목록", "Director reference information extracted": "정밀 참조 정보 추출 목록",
  },
};

const GROUP_LABELS: Record<ImageMetadataReport["entries"][number]["group"], string> = {
  generation: "Generation",
  model: "Model",
  image: "Image",
  raw: "Raw",
};

export function parameterLabel(language: AppLanguage, key: string) {
  const english = PARAMETER_ENGLISH[key.trim().toLowerCase()] ?? key;
  if (language === "en-US") return english;
  const fallback = {
    "zh-CN": "其他参数",
    "zh-TW": "其他參數",
    "ja-JP": "その他の設定",
    "ko-KR": "기타 매개변수",
  }[language];
  const translated = PARAMETER_TRANSLATIONS[language][english] ?? fallback;
  return `${translated} (${english})`;
}

export function groupLabel(language: AppLanguage, group: keyof typeof GROUP_LABELS) {
  const english = GROUP_LABELS[group];
  if (language === "en-US") return english;
  const translated = ({
    "zh-CN": { Generation: "生成参数", Model: "模型参数", Image: "图像参数", Raw: "原始数据" },
    "zh-TW": { Generation: "生成參數", Model: "模型參數", Image: "圖片參數", Raw: "原始資料" },
    "ja-JP": { Generation: "生成設定", Model: "モデル設定", Image: "画像設定", Raw: "元データ" },
    "ko-KR": { Generation: "생성 매개변수", Model: "모델 매개변수", Image: "이미지 매개변수", Raw: "원본 데이터" },
  }[language] as Record<string, string>)[english] ?? english;
  return `${translated} (${english})`;
}

function sourceLabel(report: ImageMetadataReport, text: MetadataText) {
  if (report.kind === "novelai") return text.sourceNovelAi;
  if (report.kind === "stable-diffusion") return text.sourceSd;
  if (report.kind === "comfyui") return text.sourceComfy;
  return text.sourceUnknown;
}

export default function MetadataInspector({ onBack }: { onBack: () => void }) {
  const language = normalizeAppLanguage(useAppStore((state) => state.settings?.language));
  const restoreImportedMetadata = useAppStore((state) => state.restoreImportedMetadata);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setToast = useAppStore((state) => state.setToast);
  const text = TEXT[language];
  const [report, setReport] = useState<ImageMetadataReport | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyGroups, setHistoryGroups] = useState<HistoryGroup[]>([]);
  const [historyGroupId, setHistoryGroupId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyReadingId, setHistoryReadingId] = useState("");
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const [historyDisplayLimit, setHistoryDisplayLimit] = useState(60);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const compatibleEntries = useMemo(
    () =>
      report
        ? (Object.entries(report.imported) as [keyof ImportedParams, ImportedParams[keyof ImportedParams]][])
            .filter(([, value]) => value !== undefined)
        : [],
    [report],
  );
  const visibleHistoryItems = useMemo(() => historyItems.filter((item) => {
    if (!historyGroupId) return true;
    if (historyGroupId === "__ungrouped") return !item.groupId;
    return item.groupId === historyGroupId;
  }), [historyGroupId, historyItems]);
  const renderedHistoryItems = useMemo(
    () => visibleHistoryItems.slice(0, historyDisplayLimit),
    [historyDisplayLimit, visibleHistoryItems],
  );

  useEffect(() => setHistoryDisplayLimit(60), [historyGroupId]);

  const readFile = useCallback(async (file: File, persist = true) => {
    try {
      const buffer = await file.arrayBuffer();
      const next = inspectImageMetadata(parseImageMeta(buffer));
      setReport(next);
      setFileName(file.name);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(file);
      });
      if (persist) void saveMetadataSnapshot(file).catch(() => undefined);
    } catch {
      setToast(text.readFailed);
    }
  }, [setToast, text.readFailed]);

  useEffect(() => {
    let cancelled = false;
    void loadMetadataSnapshot()
      .then((file) => {
        if (!cancelled && file) return readFile(file, false);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [readFile]);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    void Promise.all([
      window.naiDesktop.getHistory(),
      window.naiDesktop.getHistoryGroups(),
    ]).then(([items, groups]) => {
      if (cancelled) return;
      setHistoryItems(items);
      setHistoryGroups(groups);
    }).catch(() => {
      if (!cancelled) setToast(text.historyFailed);
    }).finally(() => {
      if (!cancelled) setHistoryLoading(false);
    });
    return () => { cancelled = true; };
  }, [setToast, text.historyFailed]);

  async function readHistoryItem(item: HistoryItem) {
    if (historyReadingId) return;
    setHistoryReadingId(item.id);
    try {
      const saved = await window.naiDesktop.saveMetadataSnapshotFromPath(item.filePath);
      if (!saved.ok) throw new Error(saved.message);
      const file = await loadMetadataSnapshot();
      if (!file) throw new Error(text.readFailed);
      await readFile(file, false);
      setSelectedHistoryId(item.id);
      setToast(text.historySelected);
    } catch {
      setToast(text.readFailed);
    } finally {
      setHistoryReadingId("");
    }
  }

  function applyCompatible() {
    if (!report || !compatibleEntries.length) {
      setToast(text.noCompatible);
      return;
    }
    restoreImportedMetadata(
      report.imported,
      report.characterCaptions,
      { preserveMissing: true },
    );
    setActiveTab("generate");
    setToast(text.applied);
  }

  async function copyRaw() {
    if (!report?.rawText) return;
    await navigator.clipboard.writeText(report.rawText);
    setToast(text.copied);
  }

  async function copyItem(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setToast(`${text.itemCopied}: ${label}`);
  }

  return (
    <main className="metadata-inspector">
      <header className="metadata-header">
        <div>
          <span className="eyebrow">{text.eyebrow}</span>
          <h2>{text.title}</h2>
          <p>{text.subtitle}</p>
        </div>
        <Button onClick={onBack} variant="secondary">{text.back}</Button>
      </header>

      <section className={clsx("metadata-history-picker", historyOpen && "open")}>
        <button
          type="button"
          className="metadata-history-summary"
          onClick={() => setHistoryOpen((open) => !open)}
          aria-expanded={historyOpen}
          aria-label={historyOpen ? text.collapseHistory : text.expandHistory}
        >
          <span className="metadata-history-summary-icon"><Icon name="folderOpen" /></span>
          <span>
            <strong>{text.historyTitle}</strong>
            <small>{text.historyHint}</small>
          </span>
          <em>{visibleHistoryItems.length}</em>
          <Icon name="chevronRight" className={clsx("disclosure-chevron", historyOpen && "open")} />
        </button>
        {historyOpen && (
          <div className="metadata-history-content">
            <div className="metadata-history-filter">
              <SelectMenu
                value={historyGroupId}
                ariaLabel={text.historyGroup}
                label={text.historyGroup}
                options={[
                  { value: "", label: text.allGroups },
                  { value: "__ungrouped", label: text.ungrouped },
                  ...historyGroups.map((group) => ({ value: group.id, label: group.name })),
                ]}
                onChange={setHistoryGroupId}
              />
            </div>
            {historyLoading ? (
              <p className="metadata-history-empty">{text.historyLoading}</p>
            ) : visibleHistoryItems.length === 0 ? (
              <p className="metadata-history-empty">{text.historyEmpty}</p>
            ) : (
              <div className="metadata-history-grid">
                {renderedHistoryItems.map((item) => {
                  const name = item.filePath.split(/[\\/]/).pop() || item.filePath;
                  const selected = item.id === selectedHistoryId;
                  return (
                    <button
                      type="button"
                      className={clsx("metadata-history-item", selected && "selected")}
                      key={item.id}
                      disabled={Boolean(historyReadingId)}
                      onClick={() => void readHistoryItem(item)}
                      title={name}
                    >
                      <span className="metadata-history-thumb">
                        <img src={item.fileUrl} alt={`${text.historyImageAlt}: ${name}`} loading="lazy" decoding="async" />
                        {historyReadingId === item.id && <i className="metadata-history-spinner" aria-hidden="true" />}
                      </span>
                      <strong>{name}</strong>
                      <small>{item.width} × {item.height}</small>
                    </button>
                  );
                })}
              </div>
            )}
            {visibleHistoryItems.length > renderedHistoryItems.length && (
              <Button
                className="metadata-history-more"
                variant="secondary"
                onClick={() => setHistoryDisplayLimit((limit) => limit + 60)}
              >
                {text.loadMore} · {renderedHistoryItems.length}/{visibleHistoryItems.length}
              </Button>
            )}
          </div>
        )}
      </section>

      <section
        className={clsx("metadata-drop", dragging && "dragging", report && "has-image")}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void readFile(file);
        }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={text.imageAlt} />
        ) : (
          <div className="metadata-drop-icon"><Icon name="eye" /></div>
        )}
        <div className="metadata-drop-copy">
          <strong>{fileName || text.dropTitle}</strong>
          <span>{text.dropHint}</span>
          <small>{text.localOnly}</small>
        </div>
        <Button onClick={() => inputRef.current?.click()} variant={report ? "secondary" : "primary"}>
          <IconText icon={<Icon name="folderOpen" />}>{report ? text.replace : text.choose}</IconText>
        </Button>
        <input
          ref={inputRef}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
            event.target.value = "";
          }}
        />
      </section>

      {report && (
        <>
          <section className="metadata-summary">
            <div>
              <span>{text.detected}</span>
              <strong>{sourceLabel(report, text)}</strong>
              <small>{report.software}</small>
            </div>
            <div>
              <span>{text.compatible}</span>
              <strong>{compatibleEntries.length}</strong>
              <small>{text.compatibleHint}</small>
            </div>
            <Button
              variant="primary"
              disabled={!compatibleEntries.length}
              onClick={applyCompatible}
            >
              {text.apply}
            </Button>
          </section>

          {compatibleEntries.length > 0 && (
            <section className="metadata-section">
              <h3>{text.compatible}</h3>
              <div className="metadata-compatible-grid">
                {compatibleEntries.map(([key, value]) => (
                  <div key={key}>
                    <span>{parameterLabel(language, IMPORT_LABELS[key])}</span>
                    <strong>{String(value)}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="metadata-section">
            <h3>{text.params}</h3>
            {report.entries.length ? (
              <div className="metadata-param-list">
                {report.entries.map((entry, index) => (
                  <article key={entry.group + "-" + entry.key + "-" + index}>
                    <div>
                      <span>{groupLabel(language, entry.group)}</span>
                      <strong>{parameterLabel(language, entry.key)}</strong>
                    </div>
                    <pre>{entry.value}</pre>
                    <button
                      type="button"
                      className="metadata-copy-item"
                      title={`${text.copyItem}: ${parameterLabel(language, entry.key)}`}
                      aria-label={`${text.copyItem}: ${parameterLabel(language, entry.key)}`}
                      onClick={() => void copyItem(entry.value, parameterLabel(language, entry.key))}
                    >
                      <Icon name="copy" />
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="metadata-empty">{text.noParams}</p>
            )}
          </section>

          {(report.kind === "stable-diffusion" || report.kind === "comfyui") && (
            <section className="metadata-warnings" aria-live="polite">
              <Icon name="warning" />
              <div><p>{text.viewOnly}</p></div>
            </section>
          )}

          <details className="metadata-raw">
            <summary>{text.raw}</summary>
            <div className="metadata-raw-actions">
              <Button onClick={() => void copyRaw()} variant="secondary">{text.copyRaw}</Button>
            </div>
            <pre>{report.rawText || text.noParams}</pre>
          </details>
        </>
      )}
    </main>
  );
}
