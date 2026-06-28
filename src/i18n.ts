import type { AppLanguage } from "./types";
import { TAB_ITEMS } from "./prompt-data";

export interface AppLanguageInfo {
  code: AppLanguage;
  nativeName: string;
  englishName: string;
  menuLabel: string;
}

export const SUPPORTED_APP_LANGUAGES: readonly AppLanguageInfo[] = [
  { code: "zh-CN", nativeName: "简体中文", englishName: "Simplified Chinese", menuLabel: "简体中文" },
  { code: "zh-TW", nativeName: "繁體中文", englishName: "Traditional Chinese", menuLabel: "繁體中文" },
  { code: "en-US", nativeName: "English", englishName: "English", menuLabel: "English" },
  { code: "ja-JP", nativeName: "日本語", englishName: "Japanese", menuLabel: "日本語" },
  { code: "ko-KR", nativeName: "한국어", englishName: "Korean", menuLabel: "한국어" },
] as const;

const APP_LANGUAGE_CODES = new Set<AppLanguage>(SUPPORTED_APP_LANGUAGES.map((item) => item.code));

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === "string" && APP_LANGUAGE_CODES.has(value as AppLanguage);
}

export function normalizeAppLanguage(value: unknown): AppLanguage {
  return isAppLanguage(value) ? value : "zh-CN";
}

type MainTabValue = (typeof TAB_ITEMS)[number]["value"];

type MainTabLocale = Record<MainTabValue, { label: string; title: string; desc: string }>;

const MAIN_TAB_LOCALES: Record<AppLanguage, MainTabLocale> = {
  "zh-CN": {
    generate: { label: "生成", title: "文生图 / 图生图", desc: "提示词、参考图、批量生成" },
    inpaint: { label: "重绘", title: "局部重绘", desc: "涂抹蒙版后重绘指定区域" },
    upscale: { label: "超分", title: "云端放大", desc: "2× / 4× 云端超分" },
    postprocess: { label: "后期", title: "导演工具", desc: "移除背景、线稿、上色、表情" },
    inspect: { label: "反推", title: "AI 反推提示词", desc: "图片分析与提示词反推" },
    convert: { label: "转换", title: "中文描述转标签", desc: "自然语言转 Danbooru 标签" },
    tools: { label: "工具", title: "工具板块", desc: "漫画生成器、批量工作流" },
    records: { label: "记录", title: "AI 调用记录", desc: "查看反推/转换/拆分镜每次发送与返回" },
  },
  "zh-TW": {
    generate: { label: "生成", title: "文生圖 / 圖生圖", desc: "提示詞、參考圖、批次生成" },
    inpaint: { label: "重繪", title: "局部重繪", desc: "塗抹蒙版後重繪指定區域" },
    upscale: { label: "超分", title: "雲端放大", desc: "2× / 4× 雲端超分" },
    postprocess: { label: "後期", title: "導演工具", desc: "移除背景、線稿、上色、表情" },
    inspect: { label: "反推", title: "AI 反推提示詞", desc: "圖片分析與提示詞反推" },
    convert: { label: "轉換", title: "中文描述轉標籤", desc: "自然語言轉 Danbooru 標籤" },
    tools: { label: "工具", title: "工具板塊", desc: "漫畫生成器、批次工作流" },
    records: { label: "記錄", title: "AI 呼叫記錄", desc: "查看反推/轉換/拆分鏡每次送出與返回" },
  },
  "en-US": {
    generate: { label: "Generate", title: "Text / Image to Image", desc: "Prompts, references, and batch generation" },
    inpaint: { label: "Inpaint", title: "Local Inpainting", desc: "Paint a mask and redraw the selected area" },
    upscale: { label: "Upscale", title: "Cloud Upscale", desc: "2× / 4× NovelAI cloud upscaling" },
    postprocess: { label: "Director", title: "Director Tools", desc: "Background removal, lineart, colorize, emotions" },
    inspect: { label: "Inspect", title: "AI Prompt Inspector", desc: "Analyze images and reverse prompts" },
    convert: { label: "Convert", title: "Description to Tags", desc: "Natural language to Danbooru-style tags" },
    tools: { label: "Tools", title: "Tool Hub", desc: "Comic generator and batch workflows" },
    records: { label: "Logs", title: "AI Call Logs", desc: "Inspect every reverse / convert / storyboard request" },
  },
  "ja-JP": {
    generate: { label: "生成", title: "テキスト / 画像生成", desc: "プロンプト、参照画像、バッチ生成" },
    inpaint: { label: "再描画", title: "部分再描画", desc: "マスクを塗って指定範囲を再生成" },
    upscale: { label: "高解像", title: "クラウド拡大", desc: "2× / 4× クラウドアップスケール" },
    postprocess: { label: "後処理", title: "Director ツール", desc: "背景除去、線画化、彩色、表情変更" },
    inspect: { label: "解析", title: "AI プロンプト解析", desc: "画像を分析してプロンプトを逆生成" },
    convert: { label: "変換", title: "説明文をタグへ", desc: "自然文を Danbooru 風タグへ変換" },
    tools: { label: "ツール", title: "ツールハブ", desc: "漫画生成器とバッチワークフロー" },
    records: { label: "履歴", title: "AI 呼び出し履歴", desc: "解析/変換/絵コンテの送受信を確認" },
  },
  "ko-KR": {
    generate: { label: "생성", title: "텍스트 / 이미지 생성", desc: "프롬프트, 참고 이미지, 배치 생성" },
    inpaint: { label: "리드로우", title: "부분 리드로우", desc: "마스크를 칠한 영역만 다시 생성" },
    upscale: { label: "업스케일", title: "클라우드 업스케일", desc: "2× / 4× NovelAI 클라우드 확대" },
    postprocess: { label: "후처리", title: "Director 도구", desc: "배경 제거, 선화, 채색, 표정 변경" },
    inspect: { label: "분석", title: "AI 프롬프트 분석", desc: "이미지를 분석하고 프롬프트를 역추출" },
    convert: { label: "변환", title: "설명을 태그로", desc: "자연어를 Danbooru 스타일 태그로 변환" },
    tools: { label: "도구", title: "도구 허브", desc: "만화 생성기와 배치 워크플로" },
    records: { label: "기록", title: "AI 호출 기록", desc: "분석/변환/스토리보드 요청과 응답 확인" },
  },
};

export function getLocalizedTabItems(language: unknown) {
  const locale = MAIN_TAB_LOCALES[normalizeAppLanguage(language)];
  return TAB_ITEMS.map((item) => ({ ...item, ...locale[item.value] }));
}

const CHROME_TEXT = {
  "zh-CN": { outputDir: "输出目录", settings: "设置", docs: "文档" },
  "zh-TW": { outputDir: "輸出目錄", settings: "設定", docs: "文件" },
  "en-US": { outputDir: "Output Folder", settings: "Settings", docs: "Docs" },
  "ja-JP": { outputDir: "出力フォルダ", settings: "設定", docs: "ドキュメント" },
  "ko-KR": { outputDir: "출력 폴더", settings: "설정", docs: "문서" },
} satisfies Record<AppLanguage, Record<"outputDir" | "settings" | "docs", string>>;

export function getChromeText(language: unknown) {
  return CHROME_TEXT[normalizeAppLanguage(language)];
}

const TOOLS_HUB_TEXT = {
  "zh-CN": {
    eyebrow: "Tools",
    title: "工具板块",
    subtitle: "把复杂流程收进专用工具里。",
    comicTitle: "漫画生成器",
    comicDesc: "故事拆分、参考图反推、分镜转换、队列出图与 ZIP 打包。",
    batchTitle: "批量图生图",
    batchDesc: "导入图片 + 对应提示词，按改图强度逐张图生图，存入分组并打包 ZIP。",
    tuiwenTitle: "小说推文",
    tuiwenDesc: "桌面专属：小说/字幕转分镜旁白，叠加全局精准参考，最终导出剪映草稿。",
    ready: "已接入",
    foundation: "P0 底座",
  },
  "zh-TW": {
    eyebrow: "Tools",
    title: "工具板塊",
    subtitle: "把複雜流程收進專用工具裡。",
    comicTitle: "漫畫生成器",
    comicDesc: "故事拆分、參考圖反推、分鏡轉換、佇列出圖與 ZIP 打包。",
    batchTitle: "批次圖生圖",
    batchDesc: "匯入圖片與對應提示詞，依改圖強度逐張圖生圖，存入分組並打包 ZIP。",
    tuiwenTitle: "小說推文",
    tuiwenDesc: "桌面專屬：小說/字幕轉分鏡旁白，疊加全域精準參考，最後匯出剪映草稿。",
    ready: "已接入",
    foundation: "P0 底座",
  },
  "en-US": {
    eyebrow: "Tools",
    title: "Tool Hub",
    subtitle: "Dedicated workspaces for the complex flows.",
    comicTitle: "Comic Generator",
    comicDesc: "Split stories, inspect references, convert panels, queue images, and export ZIPs.",
    batchTitle: "Batch Img2Img",
    batchDesc: "Import images with matching prompts, redraw them one by one, group results, and export a ZIP.",
    tuiwenTitle: "Novel Shorts",
    tuiwenDesc: "Desktop-only: turn novels/subtitles into narrated shots, keep global precise references, and export Jianying drafts.",
    ready: "Ready",
    foundation: "P0 Base",
  },
  "ja-JP": {
    eyebrow: "Tools",
    title: "ツールハブ",
    subtitle: "複雑なワークフローを専用ツールにまとめます。",
    comicTitle: "漫画生成器",
    comicDesc: "物語分割、参照画像解析、コマ変換、画像キュー生成、ZIP 書き出し。",
    batchTitle: "一括 Img2Img",
    batchDesc: "画像と対応プロンプトを読み込み、強度に応じて一枚ずつ再生成し ZIP 化します。",
    tuiwenTitle: "小説ショート",
    tuiwenDesc: "デスクトップ専用：小説/字幕をナレーション付きカットに変換し、精密参照を重ねて剪映ドラフトへ書き出します。",
    ready: "接続済み",
    foundation: "P0 基盤",
  },
  "ko-KR": {
    eyebrow: "Tools",
    title: "도구 허브",
    subtitle: "복잡한 흐름을 전용 도구로 정리합니다.",
    comicTitle: "만화 생성기",
    comicDesc: "스토리 분할, 참고 이미지 분석, 컷 변환, 이미지 큐 생성, ZIP 내보내기.",
    batchTitle: "배치 Img2Img",
    batchDesc: "이미지와 프롬프트를 가져와 강도에 따라 한 장씩 다시 생성하고 ZIP으로 묶습니다.",
    tuiwenTitle: "소설 숏폼",
    tuiwenDesc: "데스크톱 전용: 소설/자막을 내레이션 컷으로 바꾸고 전역 정밀 참조를 더해 Jianying 초안으로 내보냅니다.",
    ready: "연결됨",
    foundation: "P0 기반",
  },
} satisfies Record<AppLanguage, Record<
  | "eyebrow"
  | "title"
  | "subtitle"
  | "comicTitle"
  | "comicDesc"
  | "batchTitle"
  | "batchDesc"
  | "tuiwenTitle"
  | "tuiwenDesc"
  | "ready"
  | "foundation",
  string
>>;

export function getToolsHubText(language: unknown) {
  return TOOLS_HUB_TEXT[normalizeAppLanguage(language)];
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
      capsuleSearchPlaceholder: "搜索标签：中文或英文，如 双马尾 / twintails / 夜景",
      relatedTitle: "相关推荐（常一起使用）",
      weightAdjust: "权重微调",
      translating: "翻译中…",
      translate: "中→英翻译",
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
      helperOn: "英文输入 1 个字符即可推测 tag；↑↓ 选择，Tab/Enter 插入，Esc 关闭。",
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
  "zh-TW": {
    modeSwitch: {
      textToImage: "文生圖",
      imageToImage: "圖生圖",
    },
    prompt: {
      model: "模型",
      animeMode: "動漫模式",
      furryMode: "Furry 模式",
      stylePrompt: "風格提示詞（Style Prompt）",
      stylePlaceholder: "輸入風格提示詞，例如 anime style, watercolor...",
      locked: "已鎖定",
      lock: "鎖定",
      lockSavedTitle: "已鎖定：重置/範本不會改動，重啟保留。點擊解鎖",
      lockCurrentTitle: "鎖定並保存目前提示詞，使其固定不變",
      positivePrompt: "正面提示詞",
      negativePrompt: "負面提示詞",
      positivePlaceholder: "輸入正面提示詞...",
      negativePlaceholder: "輸入不希望出現的內容...",
      capsuleTitle: "靈感膠囊",
      capsuleHintOpen: "本地標籤庫 · 中/英文搜尋 → 點擊插入",
      capsuleHintClosed: "點擊展開 · 本地 Danbooru 標籤庫（按熱度）",
      capsuleSearchPlaceholder: "搜尋標籤：中文或英文，例如 雙馬尾 / twintails / 夜景",
      relatedTitle: "相關推薦（常一起使用）",
      weightAdjust: "權重微調",
      translating: "翻譯中…",
      translate: "中→英翻譯",
      restore: "還原",
      restoreTitle: "還原翻譯前的提示詞",
      normalize: "標準化",
      autocompleteTitle: "輸入英文時推測候選 tag 的功能",
      autocompleteOn: "提詞：開",
      autocompleteOff: "提詞：關",
      weightHint: "點擊 − / ＋ 調整該標籤權重（基於 NovelAI 的 {} / [] 語法）",
      decreaseWeight: "降低權重",
      increaseWeight: "提高權重",
      emptyTag: "(空)",
      helperOn: "英文輸入 1 個字元即可推測 tag；↑↓ 選擇，Tab/Enter 插入，Esc 關閉。",
      helperOff: "Tag 自動補全已關閉，可在設定 › 提示詞/補全 中開啟。",
      tagUnit: "個標籤",
      tokenLimitExceeded: "超出225限制",
      characterPrompt: "角色提示",
      vibeTransfer: "氛圍遷移",
      preciseReference: "精準參考",
      template: "範本",
      width: "寬度",
      height: "高度",
      randomSeed: "隨機種子",
      fixedSeed: "固定種子",
      fixedSeedValue: "固定種子值",
      randomizeSeedTitle: "隨機一個新種子值",
      variety: "多樣化（Variety+）",
      advancedParams: "進階參數...",
    },
  },
  "en-US": {
    modeSwitch: {
      textToImage: "Text to Image",
      imageToImage: "Image to Image",
    },
    prompt: {
      model: "Model",
      animeMode: "Anime",
      furryMode: "Furry",
      stylePrompt: "Style Prompt",
      stylePlaceholder: "Enter a style prompt, e.g. anime style, watercolor...",
      locked: "Locked",
      lock: "Lock",
      lockSavedTitle: "Locked: resets/templates will not change it, and it persists after restart. Click to unlock.",
      lockCurrentTitle: "Lock and save the current prompt so it stays fixed.",
      positivePrompt: "Positive Prompt",
      negativePrompt: "Negative Prompt",
      positivePlaceholder: "Enter positive prompt...",
      negativePlaceholder: "Enter what you want to avoid...",
      capsuleTitle: "Inspiration Capsules",
      capsuleHintOpen: "Local tag library · Search CN/EN → click to insert",
      capsuleHintClosed: "Click to expand · Local Danbooru tag library by popularity",
      capsuleSearchPlaceholder: "Search tags: Chinese or English, e.g. twintails / night scenery",
      relatedTitle: "Related recommendations",
      weightAdjust: "Weight tuning",
      translating: "Translating…",
      translate: "CN→EN Translate",
      restore: "Restore",
      restoreTitle: "Restore the prompt before translation",
      normalize: "Normalize",
      autocompleteTitle: "Suggest candidate tags while typing English",
      autocompleteOn: "Tags: On",
      autocompleteOff: "Tags: Off",
      weightHint: "Click − / ＋ to adjust tag weight using NovelAI {} / [] syntax.",
      decreaseWeight: "Decrease weight",
      increaseWeight: "Increase weight",
      emptyTag: "(empty)",
      helperOn: "Type 1 English character to suggest tags; ↑↓ select, Tab/Enter insert, Esc close.",
      helperOff: "Tag autocomplete is off. Enable it in Settings › Prompt / Tags.",
      tagUnit: "tags",
      tokenLimitExceeded: "over 225 limit",
      characterPrompt: "Character Prompt",
      vibeTransfer: "Vibe Transfer",
      preciseReference: "Precise Reference",
      template: "Template",
      width: "Width",
      height: "Height",
      randomSeed: "Random Seed",
      fixedSeed: "Fixed Seed",
      fixedSeedValue: "Fixed seed value",
      randomizeSeedTitle: "Randomize a new seed",
      variety: "Variety+",
      advancedParams: "Advanced params...",
    },
  },
  "ja-JP": {
    modeSwitch: {
      textToImage: "テキスト生成",
      imageToImage: "画像から生成",
    },
    prompt: {
      model: "モデル",
      animeMode: "アニメ",
      furryMode: "Furry",
      stylePrompt: "スタイルプロンプト",
      stylePlaceholder: "例：anime style, watercolor などのスタイルを入力...",
      locked: "ロック中",
      lock: "ロック",
      lockSavedTitle: "ロック中：リセット/テンプレートで変更されず、再起動後も保持されます。クリックで解除。",
      lockCurrentTitle: "現在のプロンプトをロックして固定します。",
      positivePrompt: "ポジティブプロンプト",
      negativePrompt: "ネガティブプロンプト",
      positivePlaceholder: "ポジティブプロンプトを入力...",
      negativePlaceholder: "出したくない内容を入力...",
      capsuleTitle: "インスピレーション",
      capsuleHintOpen: "ローカルタグ集 · 中/英検索 → クリックで挿入",
      capsuleHintClosed: "クリックで展開 · 人気順のローカル Danbooru タグ集",
      capsuleSearchPlaceholder: "タグ検索：中国語/英語、例 twintails / 夜景",
      relatedTitle: "関連おすすめ（よく併用）",
      weightAdjust: "重み調整",
      translating: "翻訳中…",
      translate: "中→英翻訳",
      restore: "元に戻す",
      restoreTitle: "翻訳前のプロンプトに戻す",
      normalize: "正規化",
      autocompleteTitle: "英字入力中に候補 tag を推測します",
      autocompleteOn: "補完：ON",
      autocompleteOff: "補完：OFF",
      weightHint: "− / ＋ でタグの重みを調整します（NovelAI の {} / [] 構文）。",
      decreaseWeight: "重みを下げる",
      increaseWeight: "重みを上げる",
      emptyTag: "(空)",
      helperOn: "英字を 1 文字入力すると tag を推測します。↑↓ 選択、Tab/Enter 挿入、Esc 閉じる。",
      helperOff: "Tag 自動補完はオフです。設定 › プロンプト/補完 でオンにできます。",
      tagUnit: "タグ",
      tokenLimitExceeded: "225制限超過",
      characterPrompt: "キャラプロンプト",
      vibeTransfer: "雰囲気転送",
      preciseReference: "精密参照",
      template: "テンプレート",
      width: "幅",
      height: "高さ",
      randomSeed: "ランダムシード",
      fixedSeed: "固定シード",
      fixedSeedValue: "固定シード値",
      randomizeSeedTitle: "新しいシードをランダム生成",
      variety: "多様化（Variety+）",
      advancedParams: "詳細パラメータ...",
    },
  },
  "ko-KR": {
    modeSwitch: {
      textToImage: "텍스트 생성",
      imageToImage: "이미지 생성",
    },
    prompt: {
      model: "모델",
      animeMode: "애니메",
      furryMode: "Furry",
      stylePrompt: "스타일 프롬프트",
      stylePlaceholder: "예: anime style, watercolor 같은 스타일 프롬프트 입력...",
      locked: "잠김",
      lock: "잠금",
      lockSavedTitle: "잠김: 초기화/템플릿으로 바뀌지 않고 재시작 후에도 유지됩니다. 클릭하면 해제됩니다.",
      lockCurrentTitle: "현재 프롬프트를 잠그고 저장해 고정합니다.",
      positivePrompt: "긍정 프롬프트",
      negativePrompt: "부정 프롬프트",
      positivePlaceholder: "긍정 프롬프트 입력...",
      negativePlaceholder: "나오지 않았으면 하는 내용을 입력...",
      capsuleTitle: "영감 캡슐",
      capsuleHintOpen: "로컬 태그 라이브러리 · 중/영 검색 → 클릭해 삽입",
      capsuleHintClosed: "클릭해 펼치기 · 인기순 로컬 Danbooru 태그",
      capsuleSearchPlaceholder: "태그 검색: 중국어/영어, 예 twintails / 야경",
      relatedTitle: "관련 추천(자주 함께 사용)",
      weightAdjust: "가중치 조정",
      translating: "번역 중…",
      translate: "중→영 번역",
      restore: "복원",
      restoreTitle: "번역 전 프롬프트로 복원",
      normalize: "정규화",
      autocompleteTitle: "영어 입력 중 후보 tag를 추정합니다",
      autocompleteOn: "태그: 켬",
      autocompleteOff: "태그: 끔",
      weightHint: "− / ＋ 를 눌러 NovelAI {} / [] 문법 기반 태그 가중치를 조정합니다.",
      decreaseWeight: "가중치 낮추기",
      increaseWeight: "가중치 높이기",
      emptyTag: "(비어 있음)",
      helperOn: "영문 1자를 입력하면 tag를 추정합니다. ↑↓ 선택, Tab/Enter 삽입, Esc 닫기.",
      helperOff: "Tag 자동완성이 꺼져 있습니다. 설정 › 프롬프트/자동완성에서 켤 수 있습니다.",
      tagUnit: "개 태그",
      tokenLimitExceeded: "225 제한 초과",
      characterPrompt: "캐릭터 프롬프트",
      vibeTransfer: "분위기 전송",
      preciseReference: "정밀 참조",
      template: "템플릿",
      width: "너비",
      height: "높이",
      randomSeed: "랜덤 시드",
      fixedSeed: "고정 시드",
      fixedSeedValue: "고정 시드값",
      randomizeSeedTitle: "새 시드 무작위 생성",
      variety: "다양화(Variety+)",
      advancedParams: "고급 매개변수...",
    },
  },
} satisfies Record<AppLanguage, GeneratePanelText>;

export function getGeneratePanelText(language: unknown) {
  return GENERATE_PANEL_TEXT[normalizeAppLanguage(language)];
}

export type TuiwenStudioStepKey = "import" | "storyboard" | "references" | "generate" | "audio" | "motion" | "export";

type TuiwenStudioText = {
  page: {
    eyebrow: string;
    subtitle: string;
    shotsMetric: string;
    backToTools: string;
    exportProjectJson: string;
    importProjectJson: string;
    importNovelSubtitle: string;
    flowHint: string;
  };
  steps: Record<TuiwenStudioStepKey, { label: string; hint: string }>;
  importStage: {
    projectTitle: string;
    sourceType: string;
    sourceNovel: string;
    sourceSubtitle: string;
    aspectRatio: string;
    aspectLabels: Record<"9:16" | "16:9" | "1:1" | "4:3" | "3:4", string>;
    defaultShotDuration: string;
    canvas: string;
    kenBurnsSuggestion: string;
    opusFreeOk: string;
    opusFreeExceeded: string;
    stepsUnit: string;
    scriptLabel: string;
    scriptPlaceholder: string;
    footerHint: string;
    createDraft: string;
    llmAnalyze: string;
    llmAnalyzing: string;
  };
};

const TUIWEN_STUDIO_TEXT = {
  "zh-CN": {
    page: {
      eyebrow: "工具 / 小说推文",
      subtitle: "桌面专属 · 小说/字幕 → 分镜旁白 → 生图/配音 → 剪映草稿",
      shotsMetric: "分镜",
      backToTools: "返回工具首页",
      exportProjectJson: "导出项目 JSON",
      importProjectJson: "导入项目 JSON",
      importNovelSubtitle: "导入小说/字幕",
      flowHint: "当前可导入文本/字幕、复用漫画 LLM 管线，并直接进入生图、配音与剪映导出流程。",
    },
    steps: {
      import: { label: "导入", hint: "小说 / 字幕 / 画幅" },
      storyboard: { label: "分镜旁白", hint: "旁白 · 画面 · 提示词" },
      references: { label: "角色参考", hint: "精准参考 · 角色库" },
      generate: { label: "生图", hint: "续跑 · 成本 · 重试" },
      audio: { label: "配音", hint: "导入 · TTS · 时长" },
      motion: { label: "运镜转场", hint: "Ken Burns · 转场" },
      export: { label: "剪映导出", hint: "BGM · 首尾卡 · 草稿" },
    },
    importStage: {
      projectTitle: "项目标题",
      sourceType: "源类型",
      sourceNovel: "小说 / 推文文案",
      sourceSubtitle: "字幕（SRT / ASS / LRC）",
      aspectRatio: "视频画幅",
      aspectLabels: {
        "9:16": "竖屏 9:16",
        "16:9": "横屏 16:9",
        "1:1": "方屏 1:1",
        "4:3": "横版 4:3",
        "3:4": "竖版 3:4",
      },
      defaultShotDuration: "默认镜头时长(ms)",
      canvas: "画布",
      kenBurnsSuggestion: "Ken Burns 建议",
      opusFreeOk: "当前默认尺寸/步数未越过 Opus 免费线。",
      opusFreeExceeded: "当前尺寸/步数会越过 Opus 免费线",
      stepsUnit: "步",
      scriptLabel: "粘贴小说 / 字幕文本（可本地快速拆段，也可交给 LLM 智能分镜）",
      scriptPlaceholder: "把小说正文、推文文案或字幕文本粘贴到这里。",
      footerHint: "本地草稿适合快速拆段；LLM 分镜会复用漫画分析接口，额外生成全局设定与连续性信息。",
      createDraft: "创建旁白分镜草稿",
      llmAnalyze: "LLM 智能分镜",
      llmAnalyzing: "LLM 分镜中...",
    },
  },
  "zh-TW": {
    page: {
      eyebrow: "工具 / 小說推文",
      subtitle: "桌面專屬 · 小說/字幕 → 分鏡旁白 → 生圖/配音 → 剪映草稿",
      shotsMetric: "分鏡",
      backToTools: "返回工具首頁",
      exportProjectJson: "匯出專案 JSON",
      importProjectJson: "匯入專案 JSON",
      importNovelSubtitle: "匯入小說/字幕",
      flowHint: "目前可匯入文本/字幕、複用漫畫 LLM 管線，並直接進入生圖、配音與剪映匯出流程。",
    },
    steps: {
      import: { label: "匯入", hint: "小說 / 字幕 / 畫幅" },
      storyboard: { label: "分鏡旁白", hint: "旁白 · 畫面 · 提示詞" },
      references: { label: "角色參考", hint: "精準參考 · 角色庫" },
      generate: { label: "生圖", hint: "續跑 · 成本 · 重試" },
      audio: { label: "配音", hint: "匯入 · TTS · 時長" },
      motion: { label: "運鏡轉場", hint: "Ken Burns · 轉場" },
      export: { label: "剪映匯出", hint: "BGM · 首尾卡 · 草稿" },
    },
    importStage: {
      projectTitle: "專案標題",
      sourceType: "來源類型",
      sourceNovel: "小說 / 推文文案",
      sourceSubtitle: "字幕（SRT / ASS / LRC）",
      aspectRatio: "影片畫幅",
      aspectLabels: {
        "9:16": "直式 9:16",
        "16:9": "橫式 16:9",
        "1:1": "方形 1:1",
        "4:3": "橫式 4:3",
        "3:4": "直式 3:4",
      },
      defaultShotDuration: "預設鏡頭時長(ms)",
      canvas: "畫布",
      kenBurnsSuggestion: "Ken Burns 建議",
      opusFreeOk: "目前預設尺寸/步數未超過 Opus 免費線。",
      opusFreeExceeded: "目前尺寸/步數會超過 Opus 免費線",
      stepsUnit: "步",
      scriptLabel: "貼上小說 / 字幕文本（可本地快速拆段，也可交給 LLM 智慧分鏡）",
      scriptPlaceholder: "把小說正文、推文文案或字幕文本貼到這裡。",
      footerHint: "本地草稿適合快速拆段；LLM 分鏡會複用漫畫分析介面，額外產生全域設定與連續性資訊。",
      createDraft: "建立旁白分鏡草稿",
      llmAnalyze: "LLM 智慧分鏡",
      llmAnalyzing: "LLM 分鏡中...",
    },
  },
  "en-US": {
    page: {
      eyebrow: "Tools / Novel Shorts",
      subtitle: "Desktop only · Novel/subtitles → narrated shots → image/voice → Jianying draft",
      shotsMetric: "shots",
      backToTools: "Back to Tools",
      exportProjectJson: "Export Project JSON",
      importProjectJson: "Import Project JSON",
      importNovelSubtitle: "Import Novel/Subtitles",
      flowHint: "Import text or subtitles, reuse the comic LLM pipeline, then continue into image generation, voice, and Jianying export.",
    },
    steps: {
      import: { label: "Import", hint: "Novel / Subtitles / Canvas" },
      storyboard: { label: "Storyboard", hint: "Narration · Scene · Prompt" },
      references: { label: "Character Ref", hint: "Precise ref · Library" },
      generate: { label: "Generate", hint: "Resume · Cost · Retry" },
      audio: { label: "Voice", hint: "Import · TTS · Timing" },
      motion: { label: "Motion", hint: "Ken Burns · Transition" },
      export: { label: "Export", hint: "BGM · Cards · Draft" },
    },
    importStage: {
      projectTitle: "Project title",
      sourceType: "Source type",
      sourceNovel: "Novel / short-form copy",
      sourceSubtitle: "Subtitles (SRT / ASS / LRC)",
      aspectRatio: "Video aspect",
      aspectLabels: {
        "9:16": "Portrait 9:16",
        "16:9": "Landscape 16:9",
        "1:1": "Square 1:1",
        "4:3": "Landscape 4:3",
        "3:4": "Portrait 3:4",
      },
      defaultShotDuration: "Default shot duration (ms)",
      canvas: "Canvas",
      kenBurnsSuggestion: "Ken Burns suggestion",
      opusFreeOk: "The current default size/steps stay within the Opus free tier.",
      opusFreeExceeded: "The current size/steps exceed the Opus free tier",
      stepsUnit: "steps",
      scriptLabel: "Paste novel / subtitle text (split locally, or let the LLM storyboard it)",
      scriptPlaceholder: "Paste the novel, short-form copy, or subtitle text here.",
      footerHint: "Local drafts are best for quick splitting; LLM storyboarding reuses the comic analysis API and adds global setup plus continuity notes.",
      createDraft: "Create narration draft",
      llmAnalyze: "LLM storyboard",
      llmAnalyzing: "Storyboarding...",
    },
  },
  "ja-JP": {
    page: {
      eyebrow: "ツール / 小説ショート",
      subtitle: "デスクトップ専用 · 小説/字幕 → ナレーションカット → 画像/音声 → 剪映ドラフト",
      shotsMetric: "カット",
      backToTools: "ツール一覧へ戻る",
      exportProjectJson: "プロジェクト JSON を書き出し",
      importProjectJson: "プロジェクト JSON を読み込み",
      importNovelSubtitle: "小説/字幕を読み込み",
      flowHint: "テキスト/字幕を読み込み、漫画用 LLM パイプラインを再利用して、画像生成・音声・剪映書き出しへ進みます。",
    },
    steps: {
      import: { label: "読込", hint: "小説 / 字幕 / 画角" },
      storyboard: { label: "絵コンテ", hint: "ナレーション · 画面 · プロンプト" },
      references: { label: "キャラ参照", hint: "精密参照 · ライブラリ" },
      generate: { label: "生成", hint: "再開 · コスト · 再試行" },
      audio: { label: "音声", hint: "読み込み · TTS · 長さ" },
      motion: { label: "カメラ", hint: "Ken Burns · トランジション" },
      export: { label: "書き出し", hint: "BGM · 前後カード · 草稿" },
    },
    importStage: {
      projectTitle: "プロジェクト名",
      sourceType: "ソース種別",
      sourceNovel: "小説 / ショート文案",
      sourceSubtitle: "字幕（SRT / ASS / LRC）",
      aspectRatio: "動画の画角",
      aspectLabels: {
        "9:16": "縦長 9:16",
        "16:9": "横長 16:9",
        "1:1": "正方形 1:1",
        "4:3": "横長 4:3",
        "3:4": "縦長 3:4",
      },
      defaultShotDuration: "既定カット長(ms)",
      canvas: "キャンバス",
      kenBurnsSuggestion: "Ken Burns 推奨",
      opusFreeOk: "現在の既定サイズ/ステップ数は Opus 無料枠内です。",
      opusFreeExceeded: "現在のサイズ/ステップ数は Opus 無料枠を超えます",
      stepsUnit: "ステップ",
      scriptLabel: "小説 / 字幕テキストを貼り付け（ローカル分割または LLM 絵コンテ）",
      scriptPlaceholder: "小説本文、ショート文案、字幕テキストをここに貼り付けます。",
      footerHint: "ローカル草稿は素早い分割向きです。LLM 絵コンテは漫画分析 API を再利用し、全体設定と連続性メモも生成します。",
      createDraft: "ナレーション草稿を作成",
      llmAnalyze: "LLM 絵コンテ",
      llmAnalyzing: "絵コンテ生成中...",
    },
  },
  "ko-KR": {
    page: {
      eyebrow: "도구 / 소설 숏폼",
      subtitle: "데스크톱 전용 · 소설/자막 → 내레이션 컷 → 이미지/음성 → Jianying 초안",
      shotsMetric: "컷",
      backToTools: "도구 홈으로",
      exportProjectJson: "프로젝트 JSON 내보내기",
      importProjectJson: "프로젝트 JSON 가져오기",
      importNovelSubtitle: "소설/자막 가져오기",
      flowHint: "텍스트나 자막을 가져오고 만화 LLM 파이프라인을 재사용한 뒤 이미지 생성, 음성, Jianying 내보내기로 이어집니다.",
    },
    steps: {
      import: { label: "가져오기", hint: "소설 / 자막 / 화면비" },
      storyboard: { label: "스토리보드", hint: "내레이션 · 장면 · 프롬프트" },
      references: { label: "캐릭터 참조", hint: "정밀 참조 · 라이브러리" },
      generate: { label: "생성", hint: "이어하기 · 비용 · 재시도" },
      audio: { label: "음성", hint: "가져오기 · TTS · 길이" },
      motion: { label: "모션", hint: "Ken Burns · 전환" },
      export: { label: "내보내기", hint: "BGM · 카드 · 초안" },
    },
    importStage: {
      projectTitle: "프로젝트 제목",
      sourceType: "소스 유형",
      sourceNovel: "소설 / 숏폼 문안",
      sourceSubtitle: "자막(SRT / ASS / LRC)",
      aspectRatio: "영상 화면비",
      aspectLabels: {
        "9:16": "세로 9:16",
        "16:9": "가로 16:9",
        "1:1": "정사각 1:1",
        "4:3": "가로 4:3",
        "3:4": "세로 3:4",
      },
      defaultShotDuration: "기본 컷 길이(ms)",
      canvas: "캔버스",
      kenBurnsSuggestion: "Ken Burns 권장",
      opusFreeOk: "현재 기본 크기/스텝은 Opus 무료 기준 안에 있습니다.",
      opusFreeExceeded: "현재 크기/스텝은 Opus 무료 기준을 초과합니다",
      stepsUnit: "스텝",
      scriptLabel: "소설 / 자막 텍스트 붙여넣기(로컬 분할 또는 LLM 스토리보드)",
      scriptPlaceholder: "소설 본문, 숏폼 문안, 자막 텍스트를 여기에 붙여넣으세요.",
      footerHint: "로컬 초안은 빠른 분할에 좋습니다. LLM 스토리보드는 만화 분석 API를 재사용하고 전역 설정과 연속성 메모도 만듭니다.",
      createDraft: "내레이션 초안 만들기",
      llmAnalyze: "LLM 스토리보드",
      llmAnalyzing: "스토리보드 생성 중...",
    },
  },
} satisfies Record<AppLanguage, TuiwenStudioText>;

export function getTuiwenStudioText(language: unknown) {
  return TUIWEN_STUDIO_TEXT[normalizeAppLanguage(language)];
}

const SETTINGS_SHELL_TEXT = {
  "zh-CN": {
    title: "设置",
    nav: {
      api: "API 配置",
      storage: "存储",
      "ai-reverse": "AI 反推",
      "convert-api": "转换 API",
      templates: "提示词模板",
      prompt: "提示词/补全",
      appearance: "外观",
      performance: "性能",
    },
  },
  "zh-TW": {
    title: "設定",
    nav: {
      api: "API 設定",
      storage: "儲存",
      "ai-reverse": "AI 反推",
      "convert-api": "轉換 API",
      templates: "提示詞範本",
      prompt: "提示詞/補全",
      appearance: "外觀",
      performance: "效能",
    },
  },
  "en-US": {
    title: "Settings",
    nav: {
      api: "API",
      storage: "Storage",
      "ai-reverse": "AI Inspect",
      "convert-api": "Convert API",
      templates: "Prompt Templates",
      prompt: "Prompt / Tags",
      appearance: "Appearance",
      performance: "Performance",
    },
  },
  "ja-JP": {
    title: "設定",
    nav: {
      api: "API 設定",
      storage: "保存",
      "ai-reverse": "AI 解析",
      "convert-api": "変換 API",
      templates: "プロンプトテンプレート",
      prompt: "プロンプト/補完",
      appearance: "外観",
      performance: "性能",
    },
  },
  "ko-KR": {
    title: "설정",
    nav: {
      api: "API 설정",
      storage: "저장소",
      "ai-reverse": "AI 분석",
      "convert-api": "변환 API",
      templates: "프롬프트 템플릿",
      prompt: "프롬프트/자동완성",
      appearance: "외관",
      performance: "성능",
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
      language: "语言",
      workspaceLayout: "工作台布局",
      resetWorkspace: "恢复默认分栏宽度",
      workspaceHint: "把左右两栏宽度恢复默认。也可直接在工作台拖动两栏之间的分隔条调整，双击分隔条或点其上的 ⟲ 也能恢复。",
    },
    performance: {
      strategyTitle: "执行策略",
      strategyDesc: "当前版本使用单任务顺序执行：批量生成会逐张调用 API，避免并发导致取消和历史写入异常。",
      superDropLabel: "中央画布拖拽加载",
      superDropDesc: "将图片拖入中央画布即可加载为工作台图片。",
    },
  },
  "zh-TW": {
    appearance: {
      theme: "主題",
      themeLight: "淺色",
      themeDark: "深色",
      themeSystem: "跟隨系統",
      language: "語言",
      workspaceLayout: "工作台版面",
      resetWorkspace: "恢復預設分欄寬度",
      workspaceHint: "把左右兩欄寬度恢復預設。也可直接在工作台拖動兩欄之間的分隔條調整，雙擊分隔條或點其上的 ⟲ 也能恢復。",
    },
    performance: {
      strategyTitle: "執行策略",
      strategyDesc: "目前版本使用單任務循序執行：批次生成會逐張呼叫 API，避免並行造成取消與歷史寫入異常。",
      superDropLabel: "中央畫布拖曳載入",
      superDropDesc: "將圖片拖入中央畫布即可載入為工作台圖片。",
    },
  },
  "en-US": {
    appearance: {
      theme: "Theme",
      themeLight: "Light",
      themeDark: "Dark",
      themeSystem: "System",
      language: "Language",
      workspaceLayout: "Workspace Layout",
      resetWorkspace: "Reset column widths",
      workspaceHint: "Restore the left and right workspace columns to their defaults. You can also drag the splitters directly, double-click a splitter, or click its ⟲ control.",
    },
    performance: {
      strategyTitle: "Execution Strategy",
      strategyDesc: "This version runs one task at a time: batch generation calls the API image by image to avoid cancellation and history-write races.",
      superDropLabel: "Drop to center canvas",
      superDropDesc: "Drop an image onto the center canvas to load it as the workspace image.",
    },
  },
  "ja-JP": {
    appearance: {
      theme: "テーマ",
      themeLight: "ライト",
      themeDark: "ダーク",
      themeSystem: "システムに合わせる",
      language: "言語",
      workspaceLayout: "ワークスペース配置",
      resetWorkspace: "列幅を初期値に戻す",
      workspaceHint: "左右の列幅を初期値に戻します。ワークスペースの区切り線をドラッグ、ダブルクリック、または ⟲ ボタンでも復元できます。",
    },
    performance: {
      strategyTitle: "実行方式",
      strategyDesc: "現在のバージョンは単一タスクを順番に実行します。バッチ生成は 1 枚ずつ API を呼び出し、キャンセルや履歴書き込みの競合を避けます。",
      superDropLabel: "中央キャンバスへドロップ",
      superDropDesc: "画像を中央キャンバスへドロップすると、ワークスペース画像として読み込みます。",
    },
  },
  "ko-KR": {
    appearance: {
      theme: "테마",
      themeLight: "라이트",
      themeDark: "다크",
      themeSystem: "시스템 설정",
      language: "언어",
      workspaceLayout: "작업공간 레이아웃",
      resetWorkspace: "열 너비 초기화",
      workspaceHint: "왼쪽/오른쪽 작업공간 열 너비를 기본값으로 되돌립니다. 구분선을 드래그하거나 더블 클릭하거나 ⟲ 버튼을 눌러도 복원할 수 있습니다.",
    },
    performance: {
      strategyTitle: "실행 방식",
      strategyDesc: "현재 버전은 단일 작업을 순차 실행합니다. 배치 생성은 이미지를 한 장씩 API로 호출해 취소와 기록 저장 충돌을 피합니다.",
      superDropLabel: "중앙 캔버스 드롭 로드",
      superDropDesc: "이미지를 중앙 캔버스에 드롭하면 작업공간 이미지로 불러옵니다.",
    },
  },
} satisfies Record<AppLanguage, {
  appearance: Record<
    | "theme"
    | "themeLight"
    | "themeDark"
    | "themeSystem"
    | "language"
    | "workspaceLayout"
    | "resetWorkspace"
    | "workspaceHint",
    string
  >;
  performance: Record<"strategyTitle" | "strategyDesc" | "superDropLabel" | "superDropDesc", string>;
}>;

export function getSettingsSectionText(language: unknown) {
  return SETTINGS_SECTION_TEXT[normalizeAppLanguage(language)];
}
