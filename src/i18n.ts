import type { AppLanguage } from "./types";
import { TAB_ITEMS } from "./prompt-data";

/** The UI is Simplified Chinese only; stored or missing language values all resolve to zh-CN. */
export function normalizeAppLanguage(_value: unknown): AppLanguage {
  return "zh-CN";
}

type MainTabValue = (typeof TAB_ITEMS)[number]["value"];

type MainTabLocale = Record<
  MainTabValue,
  { label: string; title: string; desc: string }
>;

const MAIN_TAB_LOCALES: Record<AppLanguage, MainTabLocale> = {
  "zh-CN": {
    works: {label: "作品", title: "作品", desc: "作品"},
    favorites: {label: "收藏夹", title: "收藏夹", desc: "收藏夹"},
    styles: {label: "风格管理", title: "风格管理", desc: "风格管理"},
    generate: {
      label: "生成",
      title: "文生图 / 图生图",
      desc: "提示词、参考图、批量生成",
    },
    inpaint: {
      label: "重绘",
      title: "局部重绘",
      desc: "涂抹蒙版后重绘指定区域",
    },
    postprocess: {
      label: "后期",
      title: "图像后期",
      desc: "增强、超分、移除背景、线稿、上色、表情",
    },
    inspect: {
      label: "反推",
      title: "AI 反推提示词",
      desc: "图片分析与提示词反推",
    },
    convert: {
      label: "转换",
      title: "中文描述转标签",
      desc: "自然语言转 Danbooru 标签",
    },
    metadata: {
      label: "原数据",
      title: "恢复图片原数据",
      desc: "查看并套用 NAI / SD / ComfyUI 图片参数",
    },
    tools: { label: "工具", title: "工具板块", desc: "漫画生成器、批量工作流" },
    referencePresets: {
      label: "参考预设",
      title: "参考图预设",
      desc: "管理氛围迁移与精准参考图片预设",
    },
    onlineGallery: {
      label: "在线画廊",
      title: "在线画廊",
      desc: "浏览公开作品并提取提示词与原参数",
    },
    records: {
      label: "记录",
      title: "AI 调用记录",
      desc: "查看反推/转换/拆分镜每次发送与返回",
    },
  },
};

export function getLocalizedTabItems(language: unknown) {
  const locale = MAIN_TAB_LOCALES[normalizeAppLanguage(language)];
  return TAB_ITEMS.map((item) => ({ ...item, ...locale[item.value] }));
}

const CHROME_TEXT = {
  "zh-CN": { outputDir: "输出目录", settings: "设置", docs: "文档", streamPreview: "流式预览", streamOn: "已开启", streamOff: "已关闭" },
} satisfies Record<
  AppLanguage,
  Record<"outputDir" | "settings" | "docs" | "streamPreview" | "streamOn" | "streamOff", string>
>;

export function getChromeText(language: unknown) {
  return CHROME_TEXT[normalizeAppLanguage(language)];
}

const TOOLS_HUB_TEXT = {
  "zh-CN": {
    eyebrow: "Tools",
    title: "工具板块",
    subtitle: "把复杂流程收进专用工具里。",
    comicTitle: "漫画生成器",
    comicDesc: "直接导入 Tag，逐格生成多张候选图，选择主图并打包 ZIP。",
    batchTitle: "批量图生图",
    batchDesc:
      "导入图片 + 对应提示词，按改图强度逐张图生图，存入分组并打包 ZIP。",
    metadataTitle: "恢复图片原数据",
    metadataDesc:
      "读取 NovelAI、Stable Diffusion WebUI / Forge 与 ComfyUI 图片的完整内嵌参数，并可一键套用兼容项。",
    aitagTitle: "AI绘画咒语图库",
    aitagDesc: "原生搜索 AITag 公开作品，并查看每张图片的生成提示词与原参数。",
    artistLabTitle: "画风实验室",
    artistLabDesc:
      "固定内容与 Seed，自动测试带权画师串，并用本地模型按目标画风排序。仅 Windows。",
    v5ArtistRepairTitle: "V4.5 画师串修复器",
    v5ArtistRepairDesc: "把每个 V4.5 画师权重独立压到原值的 1/3～1/2，并自动规范为 V5 数值格式。",
    artistStringDrawTitle: "输入画师串抽卡",
    artistStringDrawDesc: "粘贴完整画师串，保留全部 Tag，只在自定义范围内重抽画师权重，批量生图并收藏。",
    ready: "已接入",
    foundation: "P0 底座",
  },
} satisfies Record<
  AppLanguage,
  Record<
    | "eyebrow"
    | "title"
    | "subtitle"
    | "comicTitle"
    | "comicDesc"
    | "batchTitle"
    | "batchDesc"
    | "metadataTitle"
    | "metadataDesc"
    | "aitagTitle"
    | "aitagDesc"
    | "artistLabTitle"
    | "artistLabDesc"
    | "v5ArtistRepairTitle"
    | "v5ArtistRepairDesc"
    | "artistStringDrawTitle"
    | "artistStringDrawDesc"
    | "ready"
    | "foundation",
    string
  >
>;

export function getToolsHubText(language: unknown) {
  return TOOLS_HUB_TEXT[normalizeAppLanguage(language)];
}

const TOKEN_GUIDE_TEXT = {
  "zh-CN": {
    title: "获取 NovelAI API Token",
    subtitle: "按 NovelAI 当前网页界面操作，无需打开旧 API 文档。",
    close: "关闭 API Token 教程",
    zoom: "点击查看大图",
    previewAlt: "API Token 教程大图",
    warning:
      "API Token 等同账号凭证，只粘贴到本软件，不要截图、分享或写入项目文件。",
    openNovelAi: "打开 NovelAI 生图页",
    confirm: "我知道了",
    stepAltPrefix: "API Token 获取教程第",
    stepAltSuffix: "步",
    steps: [
      {
        title: "打开左上角菜单",
        description:
          "登录 NovelAI 生图页面后，点击左上角蓝圈标出的三横线菜单。",
      },
      {
        title: "进入 Account Settings",
        description:
          "菜单展开后，在 Account 区域点击蓝圈标出的 Account Settings。",
      },
      {
        title: "获取 Persistent API Token",
        description:
          "在 User Settings 的 Account 页面点击蓝圈标出的 Get Persistent API Token，并复制完整 Token。",
      },
    ],
  },
} satisfies Record<
  AppLanguage,
  {
    title: string;
    subtitle: string;
    close: string;
    zoom: string;
    previewAlt: string;
    warning: string;
    openNovelAi: string;
    confirm: string;
    stepAltPrefix: string;
    stepAltSuffix: string;
    steps: { title: string; description: string }[];
  }
>;

export function getTokenGuideText(language: unknown) {
  return TOKEN_GUIDE_TEXT[normalizeAppLanguage(language)];
}

type GeneratePanelText = {
  modeSwitch: {
    textToImage: string;
    imageToImage: string;
  };
  prompt: {
    model: string;
    animeMode: string;
    furryMode: string;
    stylePrompt: string;
    stylePlaceholder: string;
    stylePresetPlaceholder: string;
    stylePresetSave: string;
    stylePresetDelete: string;
    stylePresetNamePrompt: string;
    stylePresetImages: string;
    stylePresetImageManager: string;
    stylePresetAddImages: string;
    stylePresetReplaceImage: string;
    stylePresetDeleteImage: string;
    stylePresetNoImages: string;
    stylePresetImageHint: string;
    stylePresetDropImages: string;
    stylePresetImagesImported: string;
    stylePresetImageLimit: string;
    locked: string;
    lock: string;
    lockSavedTitle: string;
    lockCurrentTitle: string;
    positivePrompt: string;
    negativePrompt: string;
    positivePlaceholder: string;
    negativePlaceholder: string;
    capsuleTitle: string;
    capsuleHintOpen: string;
    capsuleHintClosed: string;
    capsuleSearchPlaceholder: string;
    relatedTitle: string;
    weightAdjust: string;
    translating: string;
    translate: string;
    restore: string;
    restoreTitle: string;
    normalize: string;
    autocompleteTitle: string;
    autocompleteOn: string;
    autocompleteOff: string;
    weightHint: string;
    decreaseWeight: string;
    increaseWeight: string;
    emptyTag: string;
    helperOn: string;
    helperOff: string;
    tagUnit: string;
    tokenLimitExceeded: string;
    characterPrompt: string;
    vibeTransfer: string;
    preciseReference: string;
    template: string;
    width: string;
    height: string;
    randomSeed: string;
    fixedSeed: string;
    fixedSeedValue: string;
    randomizeSeedTitle: string;
    variety: string;
    advancedParams: string;
  };
};

const GENERATE_PANEL_TEXT = {
  "zh-CN": {
    modeSwitch: {
      textToImage: "文生图",
      imageToImage: "图生图",
    },
    prompt: {
      model: "模型",
      animeMode: "动漫模式",
      furryMode: "Furry 模式",
      stylePrompt: "风格提示词（Style Prompt）",
      stylePlaceholder: "输入风格提示词，如 anime style, watercolor...",
      stylePresetPlaceholder: "选择已保存风格",
      stylePresetSave: "保存风格",
      stylePresetDelete: "删除",
      stylePresetNamePrompt: "给这套风格提示词命名：",
      stylePresetImages: "参考图",
      stylePresetImageManager: "风格参考图",
      stylePresetAddImages: "导入图片",
      stylePresetReplaceImage: "重新导入",
      stylePresetDeleteImage: "删除图片",
      stylePresetNoImages: "尚未导入风格参考图",
      stylePresetImageHint: "点击图片可全屏预览；每个风格最多保存 9 张。",
      stylePresetDropImages: "将图片拖到这里，或点击选择图片",
      stylePresetImagesImported: "已导入 {count} 张风格参考图。",
      stylePresetImageLimit: "该风格已达到 9 张图片上限。",
      locked: "已锁定",
      lock: "锁定",
      lockSavedTitle: "已锁定：重置/模板不会改动，重启保留。点击解锁",
      lockCurrentTitle: "锁定并保存当前提示词，使其固定不变",
      positivePrompt: "正面提示词",
      negativePrompt: "负面提示词",
      positivePlaceholder: "输入正面提示词...",
      negativePlaceholder: "输入不希望出现的内容...",
      capsuleTitle: "灵感胶囊",
      capsuleHintOpen: "本地标签库 · 中/英文搜索 → 点击插入",
      capsuleHintClosed: "点击展开 · 本地 Danbooru 标签库（按热度）",
      capsuleSearchPlaceholder:
        "搜索标签：中文或英文，如 双马尾 / twintails / 夜景",
      relatedTitle: "相关推荐（常一起使用）",
      weightAdjust: "权重微调",
      translating: "翻译中…",
      translate: "翻译预览",
      restore: "还原",
      restoreTitle: "还原翻译前的提示词",
      normalize: "标准化",
      autocompleteTitle: "输入英文时推测候选 tag 的功能",
      autocompleteOn: "提词：开",
      autocompleteOff: "提词：关",
      weightHint: "点击 − / ＋ 调整该标签权重（基于 NovelAI 的 {} / [] 语法）",
      decreaseWeight: "降低权重",
      increaseWeight: "提高权重",
      emptyTag: "(空)",
      helperOn:
        "英文输入 1 个字符即可推测 tag；↑↓ 选择，Tab/Enter 插入，Esc 关闭。",
      helperOff: "Tag 自动补全已关闭，可在设置 › 提示词/补全 中开启。",
      tagUnit: "个标签",
      tokenLimitExceeded: "超出225限制",
      characterPrompt: "角色提示",
      vibeTransfer: "氛围迁移",
      preciseReference: "精准参考",
      template: "模板",
      width: "宽度",
      height: "高度",
      randomSeed: "随机种子",
      fixedSeed: "固定种子",
      fixedSeedValue: "固定种子值",
      randomizeSeedTitle: "随机一个新种子值",
      variety: "多样化（Variety+）",
      advancedParams: "高级参数...",
    },
  },
} satisfies Record<AppLanguage, GeneratePanelText>;

export function getGeneratePanelText(language: unknown) {
  return GENERATE_PANEL_TEXT[normalizeAppLanguage(language)];
}

const SETTINGS_SHELL_TEXT = {
  "zh-CN": {
    title: "设置",
    nav: {
      api: "API 配置",
      storage: "数据与存储",
      backup: "备份与恢复",
      "ai-reverse": "AI 反推",
      "convert-api": "转换 API",
      templates: "提示词模板",
      prompt: "提示词/补全",
      appearance: "外观",
      performance: "性能",
      about: "关于我们",
    },
  },
} satisfies Record<AppLanguage, { title: string; nav: Record<string, string> }>;

export function getSettingsShellText(language: unknown) {
  return SETTINGS_SHELL_TEXT[normalizeAppLanguage(language)];
}

const SETTINGS_SECTION_TEXT = {
  "zh-CN": {
    appearance: {
      theme: "主题",
      themeLight: "浅色",
      themeDark: "深色",
      themeSystem: "跟随系统",
      reduceMotion: "减少动态效果",
      reduceMotionHint: "减少页面、弹层和反馈动画；系统请求减少动态效果时也会生效。",
      workspaceLayout: "工作台布局",
      resetWorkspace: "恢复默认分栏宽度",
      workspaceHint:
        "把左右两栏宽度恢复默认。也可直接在工作台拖动两栏之间的分隔条调整，双击分隔条或点其上的 ⟲ 也能恢复。",
    },
    performance: {
      strategyTitle: "执行策略",
      strategyDesc:
        "当前版本使用单任务顺序执行：批量生成会逐张调用 API，避免并发导致取消和历史写入异常。",
      superDropLabel: "中央画布拖拽加载",
      superDropDesc: "将图片拖入中央画布即可加载为工作台图片。",
      streamPreviewLabel: "生成时流式预览",
      streamPreviewDesc: "默认开启；生成过程中逐步显示中间图。接口不支持时会在确认未开始生成后安全回退为普通响应。",
      persistSectionTitle: "跨次启动记住参数",
      persistSectionDesc:
        "以下开关默认全部开启，关闭后对应工具在下次打开软件时不再恢复上次使用的参数，改用默认值。",
      persistGenerateLabel: "文生图",
      persistGenerateDesc: "记住上次的提示词、尺寸、采样参数等。",
      persistI2ILabel: "图生图",
      persistI2IDesc: "记住上次的 Strength、Noise 等参数。",
      persistInpaintLabel: "局部重绘",
      persistInpaintDesc: "记住上次的重绘提示词、模型、强度、笔刷设置。",
      persistUpscaleLabel: "超分",
      persistUpscaleDesc: "记住上次选择的放大倍数。",
      persistDirectorLabel: "后期处理",
      persistDirectorDesc: "记住上次选择的工具与参数。",
    },
  },
} satisfies Record<
  AppLanguage,
  {
    appearance: Record<
      | "theme"
      | "themeLight"
      | "themeDark"
      | "themeSystem"
      | "reduceMotion"
      | "reduceMotionHint"
      | "workspaceLayout"
      | "resetWorkspace"
      | "workspaceHint",
      string
    >;
    performance: Record<
      | "strategyTitle"
      | "strategyDesc"
      | "superDropLabel"
      | "superDropDesc"
      | "streamPreviewLabel"
      | "streamPreviewDesc"
      | "persistSectionTitle"
      | "persistSectionDesc"
      | "persistGenerateLabel"
      | "persistGenerateDesc"
      | "persistI2ILabel"
      | "persistI2IDesc"
      | "persistInpaintLabel"
      | "persistInpaintDesc"
      | "persistUpscaleLabel"
      | "persistUpscaleDesc"
      | "persistDirectorLabel"
      | "persistDirectorDesc",
      string
    >;
  }
>;

export function getSettingsSectionText(language: unknown) {
  return SETTINGS_SECTION_TEXT[normalizeAppLanguage(language)];
}

const DESKTOP_UI_TEXT: Record<AppLanguage, Record<string, string>> = {
  "zh-CN": {
    "common.cancel": "取消",
    "common.close": "关闭",
    "common.unknown": "未知",
    "common.loading": "加载中…",
    "inpaint.dropToLoad": "松开以加载图片",
    "inpaint.empty": "在左侧点击“加载图片”后，即可在这里绘制局部重绘蒙版。",
    "inpaint.undo": "撤回",
    "inpaint.undoTitle": "撤回上一步",
    "inpaint.redo": "重做",
    "inpaint.redoTitle": "返回下一步",
    "inpaint.previewMaskTitle": "预览实际发送给 NovelAI 的二值遮罩",
    "inpaint.backToPaint": "返回涂抹视图",
    "inpaint.previewMask": "预览发送遮罩",
    "inpaint.compareTitle": "拖动中线查看处理前后差异",
    "inpaint.closeCompare": "关闭对比",
    "inpaint.beforeAfter": "前后对比",
    "inpaint.resetZoom": "复位缩放",
    "inpaint.baseAlt": "局部重绘原图",
    "inpaint.beforeAlt": "重绘前图片",
    "inpaint.afterAlt": "重绘后图片",
    "inpaint.dividerLabel": "拖动查看重绘前后差异",
    "inpaint.maskPreviewAlt": "发送给 NovelAI 的二值遮罩预览",
    "inpaint.model": "重绘模型",
    "inpaint.strength": "重绘强度（1=完全按提示词重画，越低越贴近原图）",
    "inpaint.strengthLowHint": "0.10–0.59：更贴近原图，改动可能不明显。",
    "inpaint.strengthHighHint": "0.60–0.90：推荐范围，兼顾明显改动与原图结构。",
    "inpaint.strengthFullHint": "0.91–1.00：NovelAI 官网默认 1，完整重绘蒙版区域，提示词改动最明显。",
    "inpaint.restoreDefaults": "恢复官网默认",
    "inpaint.noise": "重绘噪声（一般保持 0）",
    "inpaint.brushSize": "画笔大小（1 格 = 原图 8×8 像素）",
    "inpaint.gridUnit": "格",
    "inpaint.brushOpacity": "画笔透明度（仅影响画面涂抹显示）",
    "inpaint.brushColor": "蒙版显示颜色",
    "inpaint.paintBrush": "画笔（白=重绘）",
    "inpaint.paintBrushShort": "画笔",
    "inpaint.eraser": "橡皮（黑=保留）",
    "inpaint.eraserShort": "橡皮",
    "inpaint.brushSettings": "精确画笔设置",
    "inpaint.brushShape": "画笔形状",
    "inpaint.roundBrush": "圆形",
    "inpaint.squareBrush": "方形",
    "inpaint.precisionHint": "官方蒙版网格：1 格 = 原图 8×8 像素。滑块 4–50 格；手输方形最小 1 格，圆形最小 2 格并自动取偶数。方形斜线连续补格。",
    "inpaint.sourceSizeLocked": "重绘尺寸跟随原图",
    "inpaint.clearMask": "清空蒙版",
    "inpaint.run": "局部重绘",
    "cost.beforeRun": "生成前扣费",
    "upscale.sizeEstimate": "输出尺寸预估",
    "upscale.preResize": "预缩至",
    "upscale.resizeHint":
      "NovelAI 云端超分只接受约 1024×1024 等效面积以内的输入，程序会自动预缩后再超分。",
    "upscale.run": "云端超分 {scale}×",
    "director.colorizePrompt": "Colorize Prompt（上色提示）",
    "director.colorizePlaceholder": "例如：blue dress, warm sunset light",
    "director.emotion": "Emotion（表情）",
    "director.emotionLevel": "Emotion Level（表情强度）",
    "director.defry": "Defry（去噪强度）",
    "director.sizeProtection": "后期尺寸保护",
    "director.sizeProtectionPath":
      "{source} → 预缩至 {prepared} 处理 → 恢复到原尺寸保存",
    "director.sizeProtectionHint":
      "大图或透明 PNG 直接送入后期接口容易返回 500，程序会自动转换为白底 PNG 并限制输入尺寸。",
    "director.run": "执行后期处理",
    "advanced.title": "高级参数",
    "advanced.steps": "Steps（采样步数）",
    "advanced.cfgScale": "CFG Scale（提示词引导）",
    "advanced.cfgRescale": "CFG Rescale（重缩放）",
    "advanced.sampler": "Sampler（采样器）",
    "advanced.noiseSchedule": "Noise Schedule（噪声计划）",
    "advanced.ucPreset": "UC Preset（负面预设）",
    "advanced.qualityToggle": "Quality Toggle（质量词）",
    "advanced.qualityToggleDesc": "自动追加官方常用质量提示词。",
    "quality.label": "质量词（Quality Tags）",
    "quality.v5Only": "仅 V5",
    "quality.standardLabel": "标准（Standard）",
    "quality.lightLabel": "轻量（Light）",
    "quality.noneLabel": "关闭（None）",
    "quality.standardShort": "标准",
    "quality.lightShort": "轻量",
    "quality.noneShort": "关闭",
    "quality.comparisonHint": "启用后会自动追加到正面提示词末尾；标准强化更明显，轻量仅 V5 可用且干预更少。",
    "quality.standardDesc": "自动追加到正面提示词末尾：very aesthetic、masterpiece、no text。",
    "quality.lightDesc": "仅 V5 可用；自动追加到正面提示词末尾：very aesthetic、amazing quality、no text。",
    "quality.noneDesc": "关闭质量增强，不追加任何质量词。",
    "quality.transparent": "透明背景",
    "quality.transparentDesc": "仅 V5 可用；追加 transparent background，并请求 Alpha 透明通道。",
    "size.commitHint": "请先输入完整数值；失焦或按 Enter 后校准为最接近的 64 倍数，并遵守官方最大总像素限制。",
    "i2i.sizeMode": "图生图输出尺寸",
    "i2i.sizeAdaptive": "自适应原图（默认）",
    "i2i.sizeCustom": "自定义尺寸",
    "i2i.sizeAdaptivePath": "当前：{source} → 最接近的 64 倍数 {output}",
    "i2i.sizeCustomPath": "当前使用自定义输出尺寸：{output}",
    "batch.sizeMode.title": "批量图生图尺寸模式",
    "batch.sizeMode.adaptive": "每张图自适应（默认）",
    "batch.sizeMode.custom": "统一自定义尺寸",
    "batch.sizeMode.adaptiveDesc": "按每张原图分别校准为最接近的 64 倍数。",
    "batch.sizeMode.customDesc": "全部图片使用 {size}；单图高级参数仍可覆盖。",
"batch.sizeMode.current": "当前尺寸",
"batch.sizeMode.perImage": "逐图按行尺寸",
"batch.sizeMode.perImageDesc": "按图片排序逐行对应输出尺寸；每行必须是软件支持的 NovelAI 合法尺寸。",
"batch.sizeMode.perImageInput": "对应图片尺寸（一行一个）",
"batch.sizeMode.perImagePlaceholder": "832×1216\n1024×1024\n1216×832",
"batch.sizeMode.perImageTemplate": "生成尺寸模板",
"batch.sizeMode.perImageApply": "导入并匹配",
"batch.sizeMode.perImageApplied": "已为 {count} 张图片匹配尺寸。",
"batch.sizeMode.perImageEmpty": "请先填写逐图尺寸。",
"batch.sizeMode.perImageCount": "尺寸数量不一致：需要 {expected} 行，实际 {actual} 行。",
"batch.sizeMode.perImageBlank": "尺寸第 {line} 行为空。",
"batch.sizeMode.perImageFormat": "尺寸第 {line} 行格式错误，请使用“宽×高”。",
"batch.sizeMode.perImageUnsupported": "尺寸第 {line} 行不是软件支持的 NovelAI 合法尺寸。",
    "advanced.smea": "SMEA（高级采样）",
    "advanced.smeaDesc": "仅 V3 及更早模型可用。",
    "advanced.smeaDyn": "SMEA Dyn（动态 SMEA）",
    "advanced.smeaDynDesc": "仅在 SMEA 开启时生效。",
    "advanced.reset": "重置为默认",
    "advanced.confirm": "确认",
    "reference.title": "参考图管理（氛围迁移 / 精准参考）",
    "reference.vibeTitle": "氛围迁移（Vibe Transfer）",
    "reference.vibeUnsupportedV5": " · V5 首发暂不支持，请切换到 V4.5 或移除氛围图",
    "reference.emptyVibe": "还没有氛围迁移图。",
    "reference.thumbAlt": "参考图",
    "reference.infoExtracted": "信息提取量（Information Extracted）",
    "reference.infoExtractedHelp": "调低会先减少纹理和高频细节；调高会从参考图提取更多视觉信息。",
    "reference.strength": "参考强度（Reference Strength）",
    "reference.vibeStrengthHelp": "越高越接近参考图的整体氛围与画风，越低越服从文字提示词。",
    "reference.remove": "移除",
    "reference.preciseTitle": "精准参考（Precise Reference）",
    "reference.preciseUnsupported": " · 当前仅 V4.5 模型支持；V5 首发尚未开放",
    "reference.switchV45": "切换到 V4.5",
    "reference.preciseHint":
      "任意尺寸均可：程序会按官方策略等比缩放并白边填充到最接近的官方尺寸（1024×1536 / 1472×1472 / 1536×1024），RGBA 透明图会先以白底拍平。建议参考图比例贴近三者之一以减少留白；想要角色而非画风时把类型选“角色”。",
    "reference.emptyPrecise": "还没有精准参考图。",
    "reference.preciseAlt": "精准参考图",
    "reference.type": "参考类型（Reference Type）",
    "reference.typeHelp": "选择参考角色、画风，或同时参考两者。",
    "reference.type.character": "角色",
    "reference.type.style": "风格",
    "reference.type.character&style": "角色和风格",
    "reference.preciseStrength": "参考强度（Strength）",
    "reference.preciseStrengthHelp": "控制精准参考对结果的影响程度；越高，参考特征越明显。",
    "reference.fidelity": "保真度（Fidelity）",
    "reference.fidelityHelp": "控制对参考图细节的忠实程度；越高，越严格保留参考特征。",
    "reference.recommendedSize": "{source} → 推荐尺寸 {target}",
    "reference.sizeExact": "（已匹配，无留白）",
    "reference.sizePadded":
      "（将缩放并填充约 {pad}% 白边；裁/缩到推荐尺寸可消除白边）",
    "reference.addVibe": "氛围迁移图",
    "reference.addPrecise": "精准参考图（仅 V4.5）",
    "reference.clearAll": "清空所有",
    "reference.done": "完成",
    "reference.preciseReadFailed":
      "无法读取精准参考图，请换用有效的 PNG、JPG 或 WebP 图片。",
    "reference.preciseLoadFailed": "读取精准参考图失败，请重新选择图片。",
    "character.title": "角色提示词（Character Prompt）",
    "character.unsupported":
      "角色提示词仅支持 V4 / V4.5 / V5 模型，当前模型不兼容，生成时将忽略角色设置。",
    "character.label": "角色 {index}",
    "character.delete": "删除",
    "character.expand": "展开",
    "character.collapse": "折叠",
    "character.placeholder":
      "输入该角色的提示词，例如：girl, blue dress, long hair",
    "character.negative": "角色负面提示词",
    "character.negativePlaceholder": "输入该角色不应出现的内容，例如：short hair, smiling",
    "character.useCoords": "指定角色位置（中心点，0 = 左/上，1 = 右/下）",
    "character.positionMode": "角色位置",
    "character.aiChoice": "AI 自动选择",
    "character.customPosition": "自定义拖动",
    "character.positionHint": "切换到自定义后，直接拖动编号标记安排每个角色的位置。",
    "character.positionCanvas": "角色位置编辑画布",
    "character.markerLabel": "拖动角色 {index}",
    "character.exactPosition": "精确坐标",
    "character.x": "X 位置（左→右）",
    "character.y": "Y 位置（上→下）",
    "character.add": "添加角色",
    "character.clear": "清空角色",
    "character.done": "完成",
    "workbench.loadedAlt": "已加载图片",
    "workbench.reload": "重新加载",
    "workbench.clear": "清除",
    "workbench.load": "加载图片...",
    "workbench.dropHint": "拖入图片可直接加载",
    "cost.previewTitle": "费用预览",
    "cost.relaySource": "中转实际计费未知；下方仅供参考",
    "cost.relayUnknown": "实际费用未知",
    "cost.relayReference": "官方无订阅优惠参考 ≈{amount} Anlas（非中转报价）",
    "cost.officialReference": "官方无订阅优惠参考 ≈{amount} Anlas（本地公式）",
    "cost.relayNoOpus": "中转账号不共享官方 Opus 优惠",
    "cost.relayActualHint": "余额与实际收费请查看中转服务；此参考不代表实扣",
    "cost.preQuote": "生成前报价：{amount} Anlas",
    "cost.official": "NovelAI 官方生成前报价（非实际扣费）",
    "cost.estimateFormula": "本地估算（官网前端公式，非实际扣费）",
    "cost.estimateFixed": "本地估算（固定规则，非实际扣费）",
    "cost.readingHint": "读取当前配置对应的扣费估算",
    "cost.zero": "本次 0 Anlas",
    "cost.estimated": "本次约扣 {amount} Anlas（估算）",
    "cost.willSpend": "本次将扣 {amount} Anlas",
    "cost.loading": "正在读取扣费...",
    "cost.unavailable": "暂时无法报价",
    "cost.configureToken": "请先配置 NovelAI API Token",
    "cost.loadImageFirst": "请先加载要放大的图片",
    "cost.invalidParams": "当前参数不完整，暂时无法报价",
    "cost.imageTooLarge": "图片尺寸超出云端超分报价范围",
    "cost.currentSpent": "当前已实扣 {amount} Anlas",
    "cost.waitingActual": "执行中，等待余额校验",
    "cost.lastSpent": "上次实扣 {amount} Anlas",
    "cost.actualHint": "执行后会用余额差再次核对",
    "cost.balance": "当前余额：{balance} Anlas",
    "cost.cached": "（缓存）",
    "cost.insufficient": " · 余额可能不足，但仍可尝试",
    "account.configured": "已配置 API",
    "account.notSet": "未设置 API",
    "account.anlas": "Anlas：{balance}",
    "account.expires": " · 到期 {date}",
    "account.refreshing": "刷新中",
    "account.refresh": "刷新积分",
    "account.setupFirst": "请先设置 API",
    "account.currentSpent": "本次已实扣 {amount} Anlas",
    "account.currentReading": "本次实扣读取中",
    "account.addingQueueCost": "正在读取扣费...",
    "account.addQueueWaiting": "＋ 加入队列（等待 {count}）",
    "account.addQueue": "＋ 加入队列",
    "account.resume": "▶ 继续生成",
    "account.pause": "⏸ 暂停",
    "account.stop": "✕ 停止",
    "account.lastSpent": "上次实扣 {amount} Anlas",
    "generate.batchCount": "批量生成数量",
    "generate.batchInterval": "每张图片生成间隔（秒）",
    "generate.batchIntervalHint": "数量为 1 时可预先设置但不生效；0 秒表示无间隔。",
    "generate.fileNamePrefix": "图片命名（文件名前缀，可留空）",
    "generate.fileNamePlaceholder": "例如：我的角色 → 我的角色_20260617_01.png",
    "generate.historyGroup": "生成到分组",
    "generate.wildcardHint":
      "支持动态提示词通配符 {example}，批量时每张随机取一项；NovelAI 的 {tag} 权重语法不受影响。",
    "generate.run": "生成",
    "generate.batchRun": "批量生成 {count} 张",
    "i2i.strength": "Strength（改图强度）",
    "i2i.noise": "Noise（噪声）",
    "i2i.extraNoiseSeed": "Extra Noise Seed（0 = 随机）",
    "i2i.run": "图生图",
    "prompt.templateApplied": "已应用模板“{name}”",
    "prompt.stylePresetNeedPrompt": "请先输入风格提示词再保存。",
    "prompt.stylePresetSaved": "已保存风格“{name}”。",
    "prompt.stylePresetDeleted": "已删除风格“{name}”。",
    "prompt.stylePresetDeleteConfirm": "确定删除风格“{name}”吗？此操作无法撤销。",
    "prompt.stylePresetApplied": "已切换到风格“{name}”。",
    "prompt.styleGroup": "风格分组",
    "prompt.styleGroupAll": "全部分组",
    "prompt.styleGroupDefault": "默认分组",
    "prompt.styleGroupCreate": "创建分组",
    "prompt.styleGroupName": "分组名称",
    "prompt.styleGroupCreated": "已创建分组“{name}”。",
    "prompt.styleGroupExists": "该分组已经存在。",
    "prompt.styleGroupDelete": "删除分组",
    "prompt.styleGroupDeleteConfirm": "删除分组“{name}”？其中的风格会移动到默认分组。",
    "prompt.styleGroupDeleted": "已删除分组“{name}”，其中的风格已移至默认分组。",
    "prompt.styleMove": "移动风格",
    "prompt.styleMoveTo": "将“{name}”移动到分组",
    "prompt.styleMoved": "已将“{name}”移动到“{group}”。",
    "prompt.autocompleteOnToast": "已开启输入提词",
    "prompt.autocompleteOffToast": "已关闭输入提词",
    "prompt.modeFurryToast": "已切换到 Furry 模式",
    "prompt.modeAnimeToast": "已切换到动漫模式",
    "prompt.lockedToast": "已锁定并保存为默认（重置/模板不会改动）",
    "prompt.unlockedToast": "已解锁",
    "prompt.emptyTranslate": "提示词为空，无需翻译",
    "prompt.alreadyEnglish": "当前提示词已是英文",
    "prompt.translatePartialFailed":
      "部分内容翻译失败，已尽力转为英文；可点还原",
    "prompt.translateDone": "已自动检测并转为英文，可点还原",
    "prompt.translateFailed": "翻译失败，请检查网络",
    "prompt.translateRestored": "已还原翻译前的提示词",
    "prompt.normalizedToast": "提示词已标准化",
    "normalize.title": "提示词标准化",
    "normalize.preview": "预览",
    "normalize.empty": "（结果为空）",
    "normalize.option.lowercase": "转为小写",
    "normalize.option.halfWidthPunct": "使用半角标点",
    "normalize.option.stripDecorative": "移除装饰符号（【】「」）",
    "normalize.option.underscoreToSpace": "下划线转为空格",
    "normalize.option.newlineToComma": "换行转逗号",
    "normalize.option.stripQualityPrefix": "移除常见质量 / artist 前缀",
    "normalize.option.stripNonAscii": "移除非 ASCII 字符",
    "normalize.option.dedupe": "去除重复标签",
    "normalize.option.keepWildcards": "保留 Wildcards 语法",
    "common.apply": "应用",
    "tagLibrary.title": "中文标签库（自动补全 / 灵感胶囊）",
    "tagLibrary.downloadingToast":
      "正在下载中文标签库（约 7MB，每个标签均含中文）…",
    "tagLibrary.downloaded": "已下载",
    "tagLibrary.itemCount": "{count} 条，均含中文",
    "tagLibrary.notDownloaded": "未下载（补全与灵感胶囊将使用内置精简词库）",
    "tagLibrary.hint":
      "来源 DanbooruSearchOnline（GPL-3.0，已固定版本），单独下载、不打包进程序。下载后可用中文或英文补全并显示热度。",
    "tagLibrary.downloading": "下载中…",
    "tagLibrary.redownload": "重新下载",
    "tagLibrary.download": "下载标签库",
    "tagLibrary.downloadFailed": "下载失败：{message}",
  },
};

const DESKTOP_EXTRA_UI_TEXT: Record<AppLanguage, Record<string, string>> = {
  "zh-CN": {
    "common.confirm": "确定",
    "template.editorTitle": "提示词模板",
    "template.modeSeparated": "提示词模板（三种模式各自独立，绝不混用）",
    "template.custom": "已自定义",
    "template.default": "默认",
    "template.restoreModeTitle": "把当前模式恢复为内置默认模板",
    "template.restoreMode": "↺ 恢复默认（{mode}）",
    "template.restoreTitle": "恢复为内置默认模板",
    "template.restore": "↺ 恢复默认",
    "template.modeHint":
      "标签 / 自然语言 / 混合三种输出各用独立系统提示词，互不混用。直接编辑即生效；点“恢复默认”可随时还原为内置模板。",
    "template.comicHint":
      "漫画拆分分镜只使用这一套模板；反推和转换仍按三种模式分别读取上方模板。",
    "mode.tags": "Danbooru 标签",
    "mode.natural": "自然语言",
    "mode.mixed": "混合模式",
    "variant.nameTitle": "角色名版",
    "variant.nameHint": "适合模型库认识该角色时使用。",
    "variant.featureTitle": "特征版",
    "variant.featureHint": "适合模型库不认识该角色时使用。",
    "variant.use": "使用这一版",
    "inspect.noMeta": "该图片不含可识别的 NovelAI 参数。",
    "inspect.metaRestored": "已从图片元数据还原参数。",
    "inspect.dropHint": "拖入图片到此处，或点击下方按钮打开",
    "inspect.openFile": "打开文件",
    "inspect.imageAlt": "检视图",
    "inspect.costTitle": "积分说明",
    "inspect.costDesc":
      "AI 反推不消耗 NovelAI Anlas；只会调用“AI 反推”中配置的视觉模型 API。",
    "inspect.restoreParams": "↩ 从图片还原参数",
    "inspect.restoreMetaOk":
      "读取 NovelAI PNG 内嵌的提示词、种子、采样器等参数并填入生成面板。",
    "inspect.restoreMetaMissing":
      "未检测到 NovelAI 参数（图片可能被压缩或来自其它来源）。",
    "inspect.mode.tagsTip": "输出标准 Danbooru tag 格式",
    "inspect.mode.naturalTip": "输出流畅的描述性文字",
    "inspect.mode.mixedTip": "Tag + 自然语言结合",
    "inspect.templateVersionTitle": "反推模板版本",
    "inspect.templateVersion.v45": "V4.5 模板",
    "inspect.templateVersion.v5": "V5 模板（最新）",
    "inspect.templateVersionHint": "只切换 AI 反推规则，不会改变当前 NovelAI 生图模型。",
    "inspect.scopeTitle": "反推范围选择",
    "inspect.scope.full": "整张图片",
    "inspect.scope.fullTip": "反推完整画面、人物、场景和构图",
    "inspect.scope.character": "角色",
    "inspect.scope.characterTip": "只反推指定角色的外观、服装、姿态",
    "inspect.scope.object": "物品",
    "inspect.scope.objectTip": "只反推指定物品或道具",
    "inspect.scope.scene": "场景",
    "inspect.scope.sceneTip": "只反推背景、光照、空间和氛围",
    "inspect.subjectHint": "目标/角色提示（可选）",
    "inspect.subjectPlaceholder":
      "例如：这是芙宁娜 / 只反推右侧角色 / 只反推桌上的盒子",
    "inspect.knownCharacter": "这是网络/游戏/动漫角色，生成角色名版和特征版",
    "promptCodex.enabled": "所长个人法典增强（nai4.top）",
    "promptCodex.reverseHint": "内部合并为一次任务：先识别图片，再按草稿检索法典并进行第二阶段精修。会多调用一次外部 AI API，不消耗 NovelAI Anlas。",
    "promptCodex.convertHint": "根据输入从本地法典检索相关规范和 Tag，并同时约束普通结果、角色名版与特征版。",
    "promptCodex.autoRepair": "规则校验失败时自动调用 AI 修复",
    "promptCodex.autoRepairHint": "默认关闭。仅作用于 Danbooru 标签和混合模式；程序检测到格式、重复、互斥或成熟 Tag 拆解问题时，可能额外调用一次外部 AI。界面与调用记录仍合并为一个任务。",
    "promptCodex.adult": "允许相关分级条目参与检索",
    "promptCodex.adultHint": "仅在输入或图片语义明确相关时召回，不会自动混入普通场景。",
    "promptCodex.matches": "本次命中的法典来源",
    "promptCodex.noMatches": "运行后可在这里查看命中的规范与法典条目。",
    "promptCodex.classified": "分级",
    "inspect.run": "AI 反推提示词",
    "textTool.queueTitle": "任务列表",
    "textTool.historyTitle": "历史记录",
    "textTool.historyClear": "清空记录",
    "textTool.historyClearConfirm": "确定清空全部历史记录吗？此操作无法撤销。",
    "inspect.result": "反推结果",
    "inspect.applyTemplate": "应用模板",
    "inspect.emptyHint1":
      "上传图片后，点击“AI 反推提示词”按钮，将使用视觉模型分析图片内容，自动生成适合 NovelAI 的提示词。",
    "inspect.emptyHint2":
      "需要在 设置 › AI 反推 中填写视觉模型 API 地址和 Key（支持 OpenAI / 兼容接口）。",
    "inspect.reuse": "复用至生成面板",
    "inspect.clearImage": "清除图片",
    "inspect.canvasTitle": "AI 反推提示词",
    "inspect.canvasHint":
      "在左侧上传图片，选择输出模式（Danbooru 标签 / 自然语言 / 混合），然后点击反推按钮。",
    "inspect.canvasAlt": "反推图片",
    "convert.title": "提示词转换",
    "convert.subtitle": "输入中文或自然语言描述，AI 将转换为 Danbooru 风格标签",
    "convert.costTitle": "积分说明",
    "convert.costDesc":
      "转换不消耗 NovelAI Anlas；只会调用“转换 API”中配置的文本模型。",
    "convert.input": "描述输入",
    "convert.templateVersionTitle": "转换模板版本",
    "convert.templateVersionHint": "选择本次转换遵循 V4.5 或最新 V5 规则；不会改变生成页选择的模型。",
    "convert.placeholder":
      "例如：\n一个短发蓝眼睛的女孩，穿白色连衣裙，站在樱花树下，阳光照射，动漫风格",
    "convert.knownCharacter": "这是网络/游戏/动漫角色，生成角色名版和特征版",
    "convert.knownCharacterHint": "开启后严格生成同一画面的两个版本：角色名版使用规范角色 Tag；特征版删除角色名/作品名，并逐人改用高置信度标志性外貌、服装与配饰。用户指定的换装优先。",
    "convert.run.tags": "转换为 Danbooru 标签",
    "convert.run.natural": "转换为自然语言",
    "convert.run.mixed": "转换为混合提示词",
    "convert.result": "转换结果（可编辑）",
    "convert.applyTemplate": "叠加模板",
    "convert.emptyHint1":
      "输入任意语言的图像描述，AI 将分析语义并输出符合 NovelAI 风格的 Danbooru 标签组合。",
    "convert.emptyHint2": "需要在 设置 › 转换 API 中配置文本模型 API。",
    "convert.reuse": "复用至生成面板",
    "convert.copied": "已复制到剪贴板",
    "convert.copy": "复制结果",
    "shared.reusedToGenerate": "提示词已复用至生成面板。",
    "aiLog.title": "AI 调用记录",
    "aiLog.subtitle":
      "反推 / 转换 / 拆分镜 / 一致性检测每次发送给 AI 的内容与原始返回（最多保留最近 200 条，重启后清空）。",
    "aiLog.refreshing": "刷新中...",
    "aiLog.refresh": "刷新",
    "aiLog.clear": "清空",
    "aiLog.empty":
      "暂无记录。进行一次 AI 反推 / 转换 / 漫画拆分镜后，这里会显示发送与返回内容。",
    "aiLog.ok": "成功",
    "aiLog.fail": "失败",
    "aiLog.visionApi": "反推API",
    "aiLog.textApi": "转换API",
    "aiLog.systemPrompt": "System Prompt（系统指令）",
    "aiLog.user": "User（发送内容）",
    "aiLog.responseOk": "返回（原始输出）",
    "aiLog.responseFail": "返回（错误信息）",
    "aiLog.copy": "复制",
    "aiLog.emptyValue": "（空）",
    "viewer.reset": "复位",
    "viewer.compare": "对比",
    "viewer.dragTitle": "可拖出到桌面 / 资源管理器 / 其他程序",
    "viewer.beforeAlt": "处理前图片",
    "viewer.afterAlt": "处理后图片",
    "viewer.compareDividerLabel": "拖动查看处理前后差异",
    "canvas.resultAlt": "生成结果",
    "canvas.dropToLoad": "放开以加载图片",
    "canvas.generatingTitle": "正在处理图片...",
    "canvas.generatingHint": "请求 NovelAI API，完成后会自动保存并写入历史。",
    "canvas.preparingTitle": "正在准备生成",
    "canvas.preparingHint": "正在读取余额并核对本次报价，尚未开始采样。",
    "canvas.requestingTitle": "请求已发送",
    "canvas.requestingHint": "正在等待 NovelAI 返回首张预览或最终图片。",
    "canvas.streamingTitle": "正在生成预览",
    "canvas.streamingProgress": "第 {current}/{total} 步 · {percent}%",
    "canvas.savingTitle": "正在保存图片",
    "canvas.savingHint": "最终图已收到，正在写入输出目录与历史记录。",
    "canvas.emptyTitle": "准备开始创作",
    "canvas.emptyHint":
      "在左侧输入英文 tag 或自然提示词，点击下方生成按钮；结果会自动保存并进入右侧历史。",
    "postprocess.emptyTitle": "加载图片开始后期处理",
    "postprocess.emptyHint": "从左侧加载或拖入图片，再选择增强、超分或导演工具。处理结果会自动保存到历史。",
    "canvas.shortcutAutocomplete": "Tag 自动补全",
    "canvas.shortcutDrop": "支持拖入图片到工作台",
    "canvas.shortcutApiOnly": "API-only 生成",
    "canvas.shortcutReuse": "历史一键复用",
    "proxy.label": "代理连接方式",
    "proxy.auto": "自动跟随系统代理 / VPN（推荐）",
    "proxy.http": "手动 HTTP 本地代理 · 127.0.0.1:7890",
    "proxy.direct": "直连（不使用代理）",
    "proxy.socks": "SOCKS5 本地代理 · 127.0.0.1:10808",
    "proxy.custom": "自定义代理地址",
    "proxy.customLabel": "自定义代理地址",
    "proxy.placeholder": "例如 http://127.0.0.1:7890",
    "proxy.currentDirect": "当前为直连",
    "proxy.currentAuto": "当前为自动网络",
    "proxy.currentProxy": "当前代理",
    "proxy.autoValue": "自动读取系统代理、PAC；TUN / 虚拟网卡自动直连",
    "proxy.directValue": "不经过本地代理",
    "proxy.empty": "尚未填写",
  },
};

const DESKTOP_BATCH_UI_TEXT: Record<AppLanguage, Record<string, string>> = {
  "zh-CN": {
    "batch.step.import": "导入",
    "batch.step.importHint": "分组名 · 选图 · 项目",
    "batch.step.params": "参数",
    "batch.step.paramsHint": "全模型 · 精准参考 · 氛围",
    "batch.step.prompts": "提示词",
    "batch.step.promptsHint": "导入 · AI 反推 · 逐张",
    "batch.step.generate": "生成",
    "batch.step.generateHint": "逐张图生图 · 重试 · 打包",
    "batch.status.done": "已生成",
    "batch.status.generating": "生成中…",
    "batch.status.failed": "失败",
    "batch.status.prompted": "已配词",
    "batch.status.pending": "待配词",
    "batch.size.portrait": "竖图 832×1216",
    "batch.size.square": "方图 1024×1024",
    "batch.size.landscape": "横图 1216×832",
    "batch.size.tall": "高竖 1024×1536",
    "batch.size.wide": "宽横 1536×1024",
    "batch.size.largeSquare": "大方 1472×1472",
    "batch.param.model": "模型（全模型可选）",
    "batch.param.sampler": "采样器",
    "batch.param.width": "宽度",
    "batch.param.height": "高度",
    "batch.param.steps": "步数",
    "batch.param.cfg": "提示词引导",
    "batch.param.noiseSchedule": "噪声计划",
    "batch.param.seed": "种子（0=随机）",
    "batch.param.ucPreset": "负面预设",
    "batch.param.qualityDesc": "质量词增强",
    "batch.param.varietyDesc": "增加采样多样性",
    "batch.param.smeaDesc": "V3 高分辨率优化",
    "batch.param.smeaDynDesc": "V3 动态优化",
    "batch.ref.preciseTitle": "全局精准参考 · 仅 V4.5（每图 +5 Anlas）",
    "batch.ref.vibeTitle": "全局氛围迁移 · Vibe Transfer（首次编码会扣 Anlas）",
    "batch.ref.add": "＋ 添加",
    "batch.ref.preciseEmpty": "未添加。用于在每张重绘中保持角色 / 画风一致。",
    "batch.ref.vibeEmpty": "未添加。把参考图的整体氛围迁移到每张重绘。",
    "batch.ref.style": "画风",
    "batch.ref.characterStyle": "角色+画风",
    "batch.ref.strength": "强度",
    "batch.ref.fidelity": "保真",
    "batch.ref.info": "信息量",
    "batch.titleEyebrow": "工具 / 批量图生图",
    "batch.unnamedTask": "未命名批量任务",
    "batch.subtitle": "导入图片 → 统一参数 → 逐张提示词 → 队列生成 / 打包",
    "batch.metric.images": "图片",
    "batch.metric.prompted": "已配词",
    "batch.metric.generated": "已生成",
    "batch.metric.strength": "强度",
    "batch.back": "返回工具首页",
    "batch.flowHint":
      "流程：导入 → 参数 → 提示词 → 生成（项目自动保存，切换不丢失）",
    "batch.import.groupName":
      "分组名称（最终图片全部存入此分组，并作为打包来源）",
    "batch.import.groupPlaceholder": "例如：重绘_0622",
    "batch.import.imagesTitle": "导入需要批量重绘的图片",
    "batch.import.imagesDesc":
      "支持 PNG / JPG / WEBP，会按文件名自然升序排列，项目会自动保存。",
    "batch.import.pickImages": "选择图片",
    "batch.import.projectTitle": "项目管理",
    "batch.import.projectDesc": "适合长队列：导出 JSON 后可跨重启继续。",
    "batch.import.exportProject": "导出项目",
    "batch.import.importProject": "导入项目",
    "batch.import.clear": "清除",
    "batch.import.hint":
      "默认按文件名升序（1 / 2 / 10 正确顺序）。项目（图片+提示词+参数+参考）会自动保存，切换工具/标签不会丢失；“导出项目”可跨重启备份/迁移。",
    "batch.import.emptyTitle": "还没有导入图片",
    "batch.import.emptyHint": "先放进一批原图，再进入参数和提示词步骤。",
    "batch.import.thumbTitle": "双击放大",
    "batch.import.remove": "移除",
    "batch.import.footerReady": "已导入 {count} 张，可以继续设置统一参数。",
    "batch.import.footerEmpty": "导入后会在这里显示缩略图，可随时移除单张。",
    "batch.prev.import": "返回导入",
    "batch.next.params": "下一步：参数",
    "batch.params.title": "全局参数 · 默认取自主界面“生成”，可自行修改",
    "batch.params.sync": "同步主界面参数",
    "batch.params.strength": "全局改图强度：{value}（越低越保留原图）",
    "batch.params.candidateCount": "每张原图候选数",
    "batch.params.candidateCountHint":
      "统一应用到所有原图；候选全部保留在项目与历史中，导出时每张原图只取你选中的一张。",
    "batch.params.candidateCountUnit": "张 / 原图",
    "batch.params.style": "全局风格提示词（拼在每张图提示词前）",
    "batch.params.stylePlaceholder": "如 masterpiece, best quality, anime",
    "batch.params.negative": "全局负面提示词（留空用模型默认负面词）",
    "batch.params.negativePlaceholder": "如 lowres, bad anatomy",
    "batch.params.footer": "参数会作为每张图的默认值；单张覆盖可在下一步细调。",
    "batch.prev.params": "返回参数",
    "batch.next.prompts": "下一步：提示词",
    "batch.prompts.bulkLabel":
      "批量输入提示词（每行一条，按顺序对应图片）→ 点“导入文本”",
    "batch.prompts.bulkPlaceholder":
      "第 1 张的提示词\n第 2 张的提示词\n第 3 张的提示词\n...",
    "batch.prompts.importText": "导入文本",
    "batch.prompts.importTxt": "导入 .txt 文件",
    "batch.prompts.reverseMode": "反推模式",
    "batch.prompts.aiRunning": "AI 反推中…",
    "batch.prompts.aiFill": "AI 反推填充空缺",
    "batch.prompts.hint":
      "导入优先（每行对应一张）；空缺可用所选模式 AI 反推补全。左侧选择图片，右侧编辑该图的提示词 / 改图强度 / 单独高级参数，可单张“生成 / 重试”。双击大图放大。",
    "batch.prompts.importFirst": "请先在“导入”步骤导入图片。",
    "batch.prompts.generateOne": "生成此张",
    "batch.prompts.regenerate": "重新生成",
    "batch.prompts.retry": "重试",
    "batch.prompts.dragOutput": "可拖出到桌面 / 其他程序",
    "batch.prompts.currentOutput": "当前成图",
    "batch.prompts.sourceImage": "待重绘原图",
    "batch.prompts.outputHint": "再次生成会新增候选，不会覆盖已有成图。",
    "batch.prompts.sourceHint": "双击放大查看；生成后这里显示成图。",
    "batch.prompts.itemPrompt": "该图片的提示词（导入 / AI 反推 / 手动编辑）",
    "batch.prompts.itemPromptPlaceholder": "该图片的提示词",
    "batch.prompts.itemStrength": "改图强度（留空用全局 {value}）",
    "batch.prompts.advanced": "单独高级参数",
    "batch.prompts.override": "覆盖全局参数（可逐项修改）",
    "batch.prompts.footerReady": "{ready}/{total} 张已有提示词。",
    "batch.prompts.footerEmpty": "每张图至少需要一条提示词才能进入生成队列。",
    "batch.next.generate": "下一步：生成",
    "batch.results.eyebrow": "Batch output",
    "batch.results.title": "批量生成结果",
    "batch.results.group": "分组：{name}",
    "batch.results.unnamed": "未命名",
    "batch.results.progress": "生成进度 {percent}%",
    "batch.results.done": "完成",
    "batch.results.running": "生成中",
    "batch.results.failed": "失败",
    "batch.results.pending": "待处理",
    "batch.results.perSourceCandidates": "每张候选",
    "batch.results.candidates": "候选图",
    "batch.results.selectedCandidate": "已选 {current}/{total}",
    "batch.results.chooseCandidate": "选择候选 {index} 作为导出图；双击放大",
    "batch.results.candidateAlt": "候选图 {index}",
    "batch.results.candidateBadge": "{count} 张候选",
    "batch.results.stop": "✕ 停止任务",
    "batch.results.start": "▶ 开始批量（{count}）",
    "batch.results.continue": "继续未完成（{count}）",
    "batch.results.retryFailed": "重试失败（{count}）",
    "batch.results.zip": "打包 ZIP（{count}）",
    "batch.results.editParams": "修改参数",
    "batch.results.editPrompts": "修改提示词",
    "batch.results.clearGenerated": "清空当前生成",
    "batch.results.clearConfirm":
      "将删除本轮全部生成图片及对应历史记录，并返回参数步骤。此操作无法撤销，是否继续？",
    "batch.results.filterAria": "筛选生成结果",
    "batch.results.all": "全部",
    "batch.results.completed": "已完成",
    "batch.results.tip": "点击缩略图查看大图；成图可直接拖到桌面或其他程序。",
    "batch.results.emptyTitle": "还没有待生成图片",
    "batch.results.emptyHint": "请先回到“导入”和“提示词”步骤完成配置。",
    "batch.results.filteredEmpty": "当前筛选没有图片",
    "batch.results.viewAll": "查看全部",
    "batch.results.previewTitle": "点击查看大图",
    "batch.results.output": "成图",
    "batch.results.source": "原图",
    "batch.results.cardStrength": "强度 {value}",
    "batch.results.noPrompt": "（无提示词，将被跳过）",
    "batch.results.zoom": "放大",
    "batch.results.previewAlt": "预览",
    "batch.toast.synced": "已同步主界面的模型 / 参数 / 风格 / 负面词",
    "batch.toast.importedImages": "已导入 {count} 张图片（按名称升序）",
    "batch.toast.importedPrompts": "已按顺序导入 {count} 条提示词",
    "batch.toast.needPromptBulk": "请先在文本框粘贴/输入提示词（每行一条）",
    "batch.toast.needImages": "请先在“导入”步骤导入图片",
    "batch.toast.allPrompted": "所有图片都已有提示词",
    "batch.toast.aiDone": "AI 反推填充完成",
    "batch.toast.aiFailed": "AI 填充失败：{message}",
    "batch.toast.needGroup": "请先填写分组名称",
    "batch.toast.noReady": "没有可生成的图片（每张需要提示词）",
    "batch.toast.unknownFailure": "生成未返回图片",
    "batch.toast.stopped": "已停止（完成 {done} 张）",
    "batch.toast.failed": "完成 {done} 张，失败 {failed} 张：{message}",
    "batch.toast.allDone": "全部完成，共 {done} 张，已存入分组“{name}”",
    "batch.toast.needGenerated": "请先生成本批图片后再打包",
    "batch.toast.zipDone": "导出成功，已打包 ZIP：{path}",
    "batch.toast.zipDoneFallback": "完成",
    "batch.toast.projectExported": "已导出项目（含图片与参数）",
    "batch.toast.projectImported": "已导入项目（{count} 张图片）",
    "batch.toast.importFailed": "导入失败：{message}",
    "batch.toast.cleared": "已清除当前项目",
    "batch.toast.resultsCleared":
      "已删除本轮生成图片和历史记录，可以修改参数后重新生成",
    "batch.toast.resultsClearFailed":
      "有 {count} 张图片删除失败，未清除对应结果",
    "batch.exportDefault": "{name}_本次图生图结果",
    "batch.projectDefaultName": "批量图生图",
  },
};

const DESKTOP_MAIN_UI_TEXT: Record<AppLanguage, Record<string, string>> = {
  "zh-CN": {
    "splash.subtitle": "NovelAI API 图像创作工作台",
    "splash.retry": "重试",
    "title.connected": "已连接",
    "title.notConnected": "未连接 API",
    "title.cached": "（缓存）",
    "opusUsage.open": "查看 V5 Opus 生成额度",
    "opusUsage.title": "Opus 生成使用限制",
    "opusUsage.explanation": "你的 Opus 订阅包含普通分辨率、最多 28 步的免费 NovelAI Diffusion V5 生成。额度会随时间自动补充；用完后仍可消耗 Anlas 继续生成。",
    "opusUsage.remaining": "剩余 {percent}%（约 {images} 张图片）",
    "opusUsage.compactImages": "约 {images} 张",
    "opusUsage.compactRule": "普通分辨率 · 最多 28 步 · 有限额度自动补充，用完后消耗 Anlas",
    "opusUsage.compactExplanation": "普通分辨率 · 最多 28 步 · 有限额度自动补充 · 用完后消耗 Anlas · 每日补充 {percent}%（约 {images} 张）",
    "opusUsage.refill": "目前每天恢复 {percent}%（约 {images} 张图片）。",
    "opusUsage.empty": "免费额度已用完，V5 生成将消耗 Anlas。",
    "opusUsage.unavailable": "官网暂未返回 V5 Opus 额度数据。",
    "opusUsage.updated": "已从 NovelAI 官方接口实时同步",
    "opusUsage.stale": "官网同步失败，当前显示上次成功数据",
    "opusUsage.refresh": "刷新",
    "opusUsage.close": "关闭",
    "account.expandDetails": "展开账号信息",
    "account.allowanceNotAvailable": "当前账号／模型没有可展示的 V5 Opus 额度；Anlas 积分另行显示。",
    "account.allowanceSignIn": "请先配置 NovelAI 账号，再查看积分与额度。",
    "account.balanceTitle": "Anlas 积分",
    "account.collapseDetails": "折叠账号信息",
    "queue.title": "队列 · 1 运行",
    "queue.queued": " / {count} 排队",
    "queue.clear": "清空排队",
    "queue.expand": "展开队列",
    "queue.collapse": "折叠队列",
    "queue.paused": "已暂停",
    "queue.adding": "正在加入排队…",
    "queue.running": "正在执行…",
    "queue.remove": "移出队列",
    "queue.batchPending": "批量待生成 · {count} 张",
    "history.title": "历史与素材",
    "history.count": "{count} 张可复用图片",
    "history.emptySubtitle": "生成后自动出现在这里",
    "history.dateAria": "选择历史日期",
    "history.allDates": "全部日期",
    "history.groupAria": "选择素材分组",
    "history.allGroups": "全部分组",
    "history.ungrouped": "未分组",
    "history.newGroup": "新建分组名",
    "history.create": "创建",
    "history.exportTitle": "打包当前分组为 ZIP",
    "history.export": "导出ZIP",
    "history.renameGroupTitle": "重命名当前分组",
    "history.rename": "重命名",
    "history.deleteGroupTitle": "删除当前分组",
    "history.delete": "删除",
    "history.emptyTitle": "暂无历史记录",
    "history.emptyHint": "生成、重绘、超分、后期处理完成后会自动保存到这里。",
    "history.thumbAlt": "历史缩略图",
    "history.moreActions": "图片操作",
    "history.viewFilePath": "查看文件路径",
    "history.pathUnavailable": "文件路径不可用",
    "history.menuMetadata": "查看原数据",
    "history.menuDelete": "删除图片",
    "history.dragTitle": "可拖出到桌面 / 资源管理器 / 其他程序",
    "history.itemGroupTitle": "设置素材分组",
    "history.renameImageTitle": "重命名图片（同步本地文件）",
    "history.deleteImageTitle": "删除记录和本地文件",
    "history.deleteImageDone": "图片和历史记录已删除",
    "history.metadataTitle": "查看并恢复图片原数据",
    "history.metadataFailed": "无法读取这张图片的原数据，请确认本地文件仍然存在。",
    "history.deleteImageConfirm": "确定删除“{name}”吗？历史记录和本地文件都会被删除，此操作无法撤销。",
    "history.renameImageModal": "重命名图片",
    "history.renameImageLabel": "新文件名（不含扩展名，会同步重命名本地文件）",
    "history.renameGroupModal": "重命名分组",
    "history.renameGroupLabel": "分组名称",
    "history.renameConfirm": "重命名",
    "history.deleteGroupConfirm":
      "删除分组“{name}”？组内图片会转为未分组（文件保留）。",
  },
};

const DESKTOP_ONBOARDING_UI_TEXT: Record<
  AppLanguage,
  Record<string, string>
> = {
  "zh-CN": {
    "onboarding.skip": "跳过向导",
    "onboarding.step": "第 {current}/{total} 步",
    "onboarding.prev": "上一步",
    "onboarding.next": "下一步",
    "onboarding.start": "开始使用",
    "onboarding.card0.badge": "介绍",
    "onboarding.card0.title": "欢迎使用 Langbai NovelAI Studio",
    "onboarding.card0.desc":
      "中文 API-only 的 NovelAI 图像创作工作台：文生图 / 图生图 / 局部重绘 / 云端超分 / 导演工具 / 漫画生成，本地中文标签补全与灵感胶囊。",
    "onboarding.card1.badge": "网络",
    "onboarding.card1.title": "自动跟随系统代理与 VPN",
    "onboarding.card1.desc":
      "默认自动读取系统代理和 PAC；VPN 的 TUN / 虚拟网卡模式自动使用直连路由，不再要求软件端口与代理端口一致。",
    "onboarding.card2.badge": "API",
    "onboarding.card2.title": "配置 NovelAI API Token",
    "onboarding.card2.desc":
      "Token 只保存在本机主进程存储中，渲染层不会直接持有。",
    "onboarding.card3.badge": "选填",
    "onboarding.card3.title": "可选的第三方 AI 服务",
    "onboarding.card3.desc":
      "反推（图→提示词）、转换（中文→标签）、翻译都依赖你自备的第三方接口，不填也能正常生成图片，之后可在设置中再配置。",
    "onboarding.card4.badge": "保存",
    "onboarding.card4.title": "选择图片保存位置",
    "onboarding.card4.desc":
      "生成图片会自动保存到此目录并写入右侧历史。可选择是否在图片中保留生成元数据：保留便于日后反查，关闭则导出“干净”图片便于分享。",
    "onboarding.card5.badge": "标签库",
    "onboarding.card5.title": "下载中文标签库（可选）",
    "onboarding.card5.desc":
      "下载后，提示词补全与灵感胶囊将使用上万条带中文的 Danbooru 标签（按热度）。不下载则使用内置精简词库。",
    "onboarding.card6.badge": "界面",
    "onboarding.card6.title": "了解主界面",
    "onboarding.card6.desc":
      "左侧参数、中间画布、右侧历史；英文输入会自动推测 tag。",
    "onboarding.card7.badge": "完成",
    "onboarding.card7.title": "一切就绪",
    "onboarding.card7.desc":
      "之后可随时在设置中修改 API、输出目录和偏好，也能重新查看本向导。",
    "onboarding.text2imgTitle": "文生图 / 图生图",
    "onboarding.text2imgDesc": "提示词、参考图、批量与队列",
    "onboarding.redrawTitle": "重绘 / 超分",
    "onboarding.redrawDesc": "局部重绘、2×/4× 云端放大",
    "onboarding.directorTitle": "导演工具 / 漫画",
    "onboarding.directorDesc": "去背景、线稿、上色、表情、漫画生成",
    "onboarding.tagsTitle": "中文标签",
    "onboarding.tagsDesc": "本地中文补全与灵感胶囊",
    "onboarding.github": "GitHub 项目主页",
    "onboarding.networkWarning":
      "推荐保持“自动跟随系统代理 / VPN”。规则模式会读取系统实际端口，TUN / 虚拟网卡模式无需填写端口。",
    "onboarding.verifySave": "验证并保存",
    "onboarding.tokenConfigured":
      "已配置 Token（留空保持不变，或输入新 Token 替换）。",
    "onboarding.tokenKeep": "已配置，留空保持不变",
    "onboarding.optionalHint":
      "以下全部可选，可直接“下一步”跳过，稍后在设置中配置。",
    "onboarding.visionKeyLabel": "反推（图→提示词）Vision API Key",
    "onboarding.visionKeyPlaceholder":
      "选填：用于“AI 反推”，默认 OpenAI 兼容接口",
    "onboarding.convertKeyLabel": "转换（中文→标签）API Key",
    "onboarding.convertKeyPlaceholder": "选填：用于“中文描述转标签”",
    "onboarding.currentOutputDir": "当前输出目录",
    "onboarding.leftTitle": "左侧",
    "onboarding.leftDesc": "提示词、模型、图片输入、功能参数",
    "onboarding.centerTitle": "中间",
    "onboarding.centerDesc": "生成预览、重绘画布、定位文件",
    "onboarding.rightTitle": "右侧",
    "onboarding.rightDesc": "按日期查看历史、删除记录",
    "onboarding.completeTitle": "补全",
    "onboarding.completeDesc": "输入 g / glo 等英文片段，Tab 或 Enter 插入 tag",
    "workspace.resizeTitle": "拖动调整宽度 · 双击恢复默认",
    "workspace.resetTitle": "恢复默认布局宽度",
    "tool.loadingTools": "正在加载工具…",
    "tool.loadingInpaint": "正在加载重绘…",
  },
};

const DESKTOP_SETTINGS_UI_TEXT: Record<AppLanguage, Record<string, string>> = {
  "zh-CN": {
    "log.updatedPath": "已更新日志路径",
    "log.openFileFailed": "无法打开日志文件",
    "log.openDirFailed": "无法打开日志文件夹",
    "log.enabled": "已开启运行日志",
    "log.disabled": "已关闭运行日志",
    "log.label": "运行日志",
    "log.desc":
      "记录软件的各类调用信息与错误（生成 / 图生图 / 超分 / 导演工具 / 异常等），写入 app.log，便于排查问题。",
    "log.path": "日志存放路径",
    "log.placeholder": "默认：用户数据目录 / logs",
    "log.currentWithSize": "当前：{path}（{size} KB）",
    "log.currentEmpty": "当前：{path}（暂无日志）",
    "log.chooseFolder": "选择文件夹...",
    "log.openFile": "打开日志文件",
    "log.openDir": "打开日志文件夹",
    "log.reset": "恢复默认",
    "settings.accountTitle": "当前账号",
    "settings.verified": "已验证",
    "settings.noToken": "未配置 API Token",
    "settings.apiTokenLabel": "API Token",
    "settings.apiTokenPlaceholder": "粘贴 NovelAI API Token",
    "settings.showKey": "显示",
    "settings.hideKey": "隐藏",
    "settings.verifying": "验证中...",
    "settings.verifySave": "验证并保存 API Token",
    "settings.tokenGuide": "如何获取 API Token",
    "settings.logout": "退出 API 登录",
    "settings.accountEndpoint": "API Endpoint（账户接口）",
    "settings.imageEndpoint": "图片接口（NovelAI 官方 / 兼容中转）",
    "settings.imageEndpointHint": "使用 NovelAI 协议的图片接口；沿用上方 API Token，不使用 OpenAI Images 协议。",
    "settings.allowCustomEndpoint": "允许使用非官方接口（默认开启）",
    "settings.allowCustomEndpointHint": "开启后，将上方 API Token 发给你填写的非官方接口。关闭后使用官方地址。请只填写你信任的中转地址。",
    "settings.allowCustomEndpointFallback": "中转鉴权失败后改用官方重试（默认关闭）",
    "settings.allowCustomEndpointFallbackHint": "仅在中转返回 401/403 时，用同一个 API Token 向官方重试。官方 API Token 可能消耗 Anlas；仅适用于中转的密钥通常不能用于官方。",
    "settings.proxyHint":
      "自动模式会读取系统代理和 PAC；若启用 TUN / 虚拟网卡则自动直连交给 VPN 路由。只有手动代理模式需要填写正确端口。",
    "settings.proxyScopeTitle": "走代理的请求（关掉则该项直连）",
    "settings.proxyForNai": "NovelAI API（验证 / 生图 / 超分等）",
    "settings.proxyForAi": "AI 反推 / 转换（OpenAI 兼容）",
    "settings.proxyForMcp": "MCP / Tag 服务",
    "settings.proxyForTranslate": "翻译（谷歌 / 百度）",
    "settings.proxyForUpdate": "资源下载与在线画廊（GitHub / Danbooru 等）",
    "settings.outputDir": "输出目录",
    "settings.galleryDownloadDir": "在线画廊下载目录",
    "settings.galleryDownloadDirFirstUse": "首次下载时选择，之后自动保存到此目录",
    "settings.openGalleryDownloadDir": "打开画廊下载目录",
    "settings.browse": "浏览...",
    "settings.openOutputDir": "打开输出目录",
    "settings.keepMetadata": "保留图片元数据（提示词 / 种子 / 参数）",
    "settings.keepMetadataDesc":
      "开启：保留 PNG 生成信息。关闭：清除文本、EXIF 等元数据及像素隐写载体后，整图重新编码为 PNG；保留尺寸和透明通道，像素可能有轻微变化，不是像素无损。仅影响之后保存的图片，不追溯历史图片或备份。",
    "settings.onboarding": "重新查看新手引导",
    "settings.imageNameTemplate": "图片命名模板",
    "settings.imageNameHint":
      "可用占位符：{placeholders}。同样应用于分组 ZIP 导出。",
    "settings.historyRetentionDays": "历史记录保留天数",
    "settings.aitagCacheTitle": "AI绘画咒语图库图片缓存",
    "settings.aitagCacheDesc":
      "图库预览图首次加载后保存到本地，之后打开无需重复下载。",
    "settings.aitagCacheSize": "{files} 个文件 · {size}",
    "settings.clearAitagCache": "清除缓存",
    "settings.aitagCacheRetention": "自动清理周期",
    "settings.aitagCacheDays": "{days} 天未使用后清理",
    "settings.aitagCacheNever": "永不自动清理",
    "settings.historyRetentionHint":
      "启动时自动清理超过该天数的应用内历史记录；仅清理列表，不会删除已保存到本地的图片文件。",
    "settings.aiReverseHint":
      "配置视觉 AI 模型接口，用于反推面板的“反推提示词”功能。支持 OpenAI 及兼容接口（Gemini、本地 Ollama 等）。",
    "settings.convertHint":
      "转换 API 只处理文本：把中文或自然语言描述转换为 NovelAI 可用的 Danbooru 英文 tag。它与“AI 反推”的视觉模型 API 分离，可使用更便宜的文本模型。",
    "settings.apiUrl": "API 地址",
    "settings.modelName": "模型名称",
    "settings.detecting": "检测中...",
    "settings.detectReverseModels": "检测反推接口模型",
    "settings.detectConvertModels": "检测转换接口模型",
    "settings.detectedModelLabel": "选择模型（检测到 {count} 个）",
    "settings.chooseDetected": "— 从检测结果选择 —",
    "settings.sharedPromptPreset": "反推 / 转换共用预设",
    "settings.sharedPromptPresetHint": "导入 SillyTavern JSON 预设后，AI 反推与提示词转换会共同使用当前选择。",
    "settings.activePromptPreset": "当前预设",
    "settings.noPromptPresets": "当前没有预设；仍会保留结构化输出规则，但不会追加预设正文。",
    "settings.importJsonPreset": "导入 JSON 预设",
    "settings.renamePromptPreset": "重命名",
    "settings.deletePromptPreset": "删除预设",
    "settings.promptPresetName": "预设名称",
    "settings.promptPresetImported": "已导入预设",
    "settings.promptPresetImportFailed": "导入失败",
    "settings.promptPresetRenamed": "预设已重命名",
    "settings.promptPresetDeleted": "预设已删除",
    "settings.reverseTemplate": "反推模板",
    "settings.convertTemplate": "转换模板",
    "settings.templateMoved":
      "已集中到“提示词模板”版块，避免同一模板在多个页面重复维护。",
    "settings.unifiedTemplate": "统一提示词模板",
    "settings.unifiedTemplateDesc":
      "AI 反推和提示词转换各自读取三套模式模板；漫画 AI 拆分分镜读取下方单模板，漫画生成器不再维护隐藏模板。",
    "settings.reverseTemplateTitle": "AI 反推模板",
    "settings.convertTemplateTitle": "提示词转换模板",
    "settings.comicAnalyzeTemplateTitle": "AI 拆分分镜模板",
    "settings.singleTemplateShared": "单模板，全模式共用",
    "settings.autoComplete": "标签自动补全",
    "settings.autoCompleteDesc":
      "输入英文单词时推测可能需要的 NovelAI / Danbooru tag。",
    "settings.tagServerEnabled": "启用 Tag/MCP 服务",
    "settings.tagServerEnabledDesc":
      "用于中文灵感、Tag 补全、反推和转换提示词的 Danbooru 标签增强。",
    "settings.tagServerType": "服务类型 / MCP 传输",
    "settings.transportRest": "普通 HTTP 接口（REST /search /tags）",
    "settings.transportHttp":
      "MCP · Streamable HTTP（推荐，如 DanbooruSearchOnline）",
    "settings.transportSse": "MCP · SSE（旧版 HTTP+SSE）",
    "settings.transportStdio": "MCP · stdio（本地启动子进程）",
    "settings.command": "启动命令",
    "settings.commandPlaceholder": "例如：npx 或 mcp-remote 的绝对路径",
    "settings.args": "命令参数（空格分隔）",
    "settings.argsPlaceholder":
      "例如：-y mcp-remote https://sakizuki-danboorusearch.hf.space/mcp/mcp",
    "settings.serviceUrl": "服务地址",
    "settings.mcpUrl": "MCP 服务地址",
    "settings.serviceUrlPlaceholder": "例如：http://127.0.0.1:8765",
    "settings.mcpUrlPlaceholder":
      "例如：https://sakizuki-danboorusearch.hf.space/mcp/mcp",
    "settings.serviceKey": "服务 Key（可选）",
    "settings.serviceKeyPlaceholder": "Bearer Token，可留空",
    "settings.mcpTool": "MCP 工具名",
    "settings.testSearchPlaceholder": "测试搜索，例如：蓝眼白发少女",
    "settings.testing": "检测中",
    "settings.test": "检测",
    "settings.mcpForCapsule": "用于灵感胶囊",
    "settings.mcpForCapsuleDesc":
      "配置并启用服务后默认开启：在灵感胶囊中按中文搜索返回 MCP 标签。",
    "settings.mcpForReverse": "用于 AI 反推",
    "settings.mcpForReverseDesc":
      "反推图片后，用 MCP 标签补强结果（默认关闭）。",
    "settings.mcpForConvert": "用于提示词转换",
    "settings.mcpForConvertDesc":
      "转换中文描述时，用 MCP 标签补强结果（默认关闭）。",
    "settings.translateHint": "翻译预览使用的引擎。目标语言默认跟随软件，也可手动选择。",
    "settings.translateEngine": "翻译引擎",
    "settings.googleTranslate": "谷歌翻译（免费，可能需要代理）",
    "settings.baiduTranslate": "百度翻译（需 APP ID 与密钥）",
    "settings.aiTranslate": "AI 翻译（兼容 OpenAI API）",
    "settings.detectTranslateModels": "检测 AI 翻译模型",
    "settings.baiduAppId": "百度翻译 APP ID",
    "settings.baiduAppIdPlaceholder": "在 fanyi-api.baidu.com 申请",
    "settings.baiduSecret": "百度翻译密钥",
    "settings.baiduSecretPlaceholder": "开发者密钥",
    "settings.promptTemplateHint":
      "提示词模板可以为提示词快速添加前缀/后缀/负面词。在生成面板的提示词区或检视面板可一键应用。",
    "settings.noTemplates": "还没有模板，使用下方表单添加。",
    "settings.delete": "删除",
    "settings.prefix": "前缀：{value}",
    "settings.suffix": "后缀：{value}",
    "settings.negative": "负面：{value}",
    "settings.newTemplate": "新建模板",
    "settings.templateName": "模板名称 *",
    "settings.templateNamePlaceholder": "例如：写实质量词",
    "settings.prefixLabel": "前缀（Prefix）",
    "settings.suffixLabel": "后缀（Suffix）",
    "settings.negativePromptOptional": "负面提示词（可选）",
    "settings.addTemplate": "添加模板",
    "settings.close": "关闭",
    "settings.detectModelsToast": "正在检测模型...",
    "settings.detectTagToast": "正在检测 Tag/MCP 服务...",
    "settings.aboutVersion": "当前版本 v{version}",
    "settings.aboutProjectTitle": "项目地址",
    "settings.aboutProjectDesc":
      "GitHub 开源项目地址，点击即可在浏览器中打开。",
    "settings.aboutAuthorTitle": "作者",
    "settings.aboutAuthorDesc": "软件作者与维护者，欢迎反馈问题与建议。",
    "settings.aboutAuthorQq": "作者 QQ",
    "settings.aboutNovelAiGroup": "NovelAI QQ交流群",
    "settings.aboutSupportTitle": "赞赏支持",
    "settings.aboutSupportMessage":
      "如果软件帮到了你，可以请我喝杯奶茶（doge），或者随手赞赏支持一下，十分感谢。",
    "settings.aboutWechatReward": "微信赞赏码",
    "settings.aboutAlipayReward": "支付宝赞赏码",
  },
};

const DESKTOP_FIX_UI_TEXT: Record<AppLanguage, Record<string, string>> = {
  "zh-CN": {
    "inpaint.nextSource": "生成后下次重绘使用",
    "inpaint.nextSourceLabel": "下次局部重绘来源",
    "inpaint.sourceOriginal": "始终使用原图",
    "inpaint.sourceLatest": "使用最新结果",
    "i2i.sourceHint": "生成后自动打开原图/结果对比；选择原图可连续尝试而无需重复加载。",
    "inpaint.sourceHint": "默认保留最初加载的图片连续重绘；切换来源时会清空旧蒙版，完成后自动打开前后对比。",
    "upscale.explain": "超分只负责扩大输出并补足清晰度，不进行第二次创意扩散；画面变化通常小于“增强”。2×/4×会直接改变分辨率。NovelAI 官方超分每次固定放大 2×（4× 与 MAX 由多次 2× 组成）；需要官方的 1.5× 放大请使用「生成 → 增强 → 1.5×」。",
    "upscale.outputLimit": "超分后尺寸将达到 {output}，超过允许的最大尺寸 {limit}。请选择 2× 或换用更小的原图。",
    "enhance.magnitude": "增强幅度 {value}",
    "enhance.explain": "增强会使用当前正面、风格与负面提示词。默认采用保守强度以保留姿势和构图；提高幅度仍可能改变局部结构。",
    "enhance.scale": "输出倍率",
    "enhance.keepResolution": "1× 保持分辨率",
    "enhance.oneAndHalfResolution": "1.5× 同时放大",
    "enhance.outputSize": "输出尺寸",
    "enhance.outputHint": "1×只做二次扩散增强；2×会改变分辨率。尺寸会按 NovelAI 支持范围自动对齐。",
    "enhance.outputLimit": "增强并放大后的目标尺寸 {size}（{pixels} 像素）超过 NovelAI 允许的 {limit} 像素上限。请选择 1×、MAX 或换用更小的原图；未发送请求。",
    "enhance.run": "增强图像 {scale}×",
    "postprocess.tools": "后期工具",
    "postprocess.upscale": "超分",
    "postprocess.director": "导演工具",
    "postprocess.enhance": "增强",
    "errorBoundary.title": "这个界面暂时出了问题",
    "errorBoundary.root": "应用外壳已保留，请重试或重新载入。",
    "errorBoundary.tab": "其他页签仍可使用；切换页签或点击重试即可恢复。",
    "errorBoundary.retry": "重试",
    "errorBoundary.copy": "复制错误",
    "errorBoundary.reload": "重新载入"
  }
};

export function desktopUiText(language: unknown, key: string) {
  const code = normalizeAppLanguage(language);
  return (
    DESKTOP_FIX_UI_TEXT[code][key] ??
    DESKTOP_SETTINGS_UI_TEXT[code][key] ??
    DESKTOP_ONBOARDING_UI_TEXT[code][key] ??
    DESKTOP_MAIN_UI_TEXT[code][key] ??
    DESKTOP_BATCH_UI_TEXT[code][key] ??
    DESKTOP_EXTRA_UI_TEXT[code][key] ??
    DESKTOP_UI_TEXT[code][key] ??
    key
  );
}

export function desktopUiFormat(
  language: unknown,
  key: string,
  values: Record<string, unknown>,
) {
  return desktopUiText(language, key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values[name] ?? ""),
  );
}

const DESKTOP_OPTION_LABELS: Record<
  string,
  Partial<Record<AppLanguage, string>>
> = {
  "nai-diffusion-5-full": {
    "zh-CN": "NAI Diffusion V5 Full（最新完整模型）",
  },
  "nai-diffusion-5-curated": {
    "zh-CN": "NAI Diffusion V5 Curated（最新精选模型）",
  },
  "nai-diffusion-4-5-full": {
    "zh-CN": "NAI Diffusion 4.5 Full（完整模型）",
  },
  "nai-diffusion-4-5-curated": {
    "zh-CN": "NAI Diffusion 4.5 Curated（精选模型）",
  },
  "nai-diffusion-4-full": {
    "zh-CN": "NAI Diffusion 4 Full（完整模型）",
  },
  "nai-diffusion-4-curated": {
    "zh-CN": "NAI Diffusion 4 Curated（精选模型）",
  },
  "nai-diffusion-3": {
    "zh-CN": "NAI Diffusion 3（旧版通用）",
  },
  "nai-diffusion-furry-3": {
    "zh-CN": "NAI Diffusion Furry 3（兽人模型）",
  },
  "nai-diffusion-4-5-full-inpainting": {
    "zh-CN": "NAI Diffusion 4.5 Full Inpaint（推荐）",
  },
  "nai-diffusion-5-full-inpainting": {
    "zh-CN": "NAI Diffusion V5 Full Inpaint（推荐）",
  },
  "nai-diffusion-5-curated-inpainting": {
    "zh-CN": "NAI Diffusion V5 Curated Inpaint",
  },
  k_euler_ancestral: {
    "zh-CN": "Euler Ancestral（欧拉祖先，推荐）",
  },
  k_euler: {
    "zh-CN": "Euler（欧拉）",
  },
  k_dpmpp_2m: {
    "zh-CN": "DPM++ 2M（稳定采样）",
  },
  k_dpmpp_2m_sde: {
    "zh-CN": "DPM++ 2M SDE（随机微分）",
  },
  k_dpmpp_sde: {
    "zh-CN": "DPM++ SDE（高质量随机微分）",
  },
  k_dpmpp_2s_ancestral: {
    "zh-CN": "DPM++ 2S Ancestral（祖先采样）",
  },
  ddim_v3: {
    "zh-CN": "DDIM（快速采样）",
  },
  native: {
    "zh-CN": "Native（原生）",
  },
  karras: {
    "zh-CN": "Karras（常用）",
  },
  exponential: {
    "zh-CN": "Exponential（指数）",
  },
  "0": {
    "zh-CN": "Heavy（强负面）",
  },
  "1": {
    "zh-CN": "Light（轻负面）",
  },
  "2": {
    "zh-CN": "Human Focus（人物优先）",
  },
  "3": {
    "zh-CN": "None（不使用预设）",
  },
  "bg-removal": {
    "zh-CN": "移除背景",
  },
  lineart: {
    "zh-CN": "线稿提取",
  },
  sketch: {
    "zh-CN": "草图化",
  },
  colorize: {
    "zh-CN": "上色",
  },
  emotion: {
    "zh-CN": "表情迁移",
  },
  declutter: {
    "zh-CN": "去除杂乱",
  },
  neutral: {
    "zh-CN": "中性（Neutral）",
  },
  happy: {
    "zh-CN": "开心（Happy）",
  },
  sad: {
    "zh-CN": "悲伤（Sad）",
  },
  angry: {
    "zh-CN": "愤怒（Angry）",
  },
  surprised: {
    "zh-CN": "惊讶（Surprised）",
  },
  scared: {
    "zh-CN": "害怕（Scared）",
  },
  disgusted: {
    "zh-CN": "厌恶（Disgusted）",
  },
  amazed: {
    "zh-CN": "惊叹（Amazed）",
  },
};

export function localizedDesktopOptionLabel(
  language: unknown,
  value: string | number,
  fallback: string,
) {
  const code = normalizeAppLanguage(language);
  return DESKTOP_OPTION_LABELS[String(value)]?.[code] ?? fallback;
}
