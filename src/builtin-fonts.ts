/** Offline font catalog. IDs and original font bytes are identical on desktop and mobile.
 * No system-font aliases, network URLs or user-import slots are used for these entries. */
export const BUILTIN_FONTS = [
  {
    "id": "builtin-wenkai",
    "name": "霞鹜文楷 轻便版",
    "english": "LXGW WenKai Lite",
    "style": "文雅楷书",
    "englishStyle": "Elegant Kai",
    "file": "LXGWWenKaiLite-Regular.ttf"
  },
  {
    "id": "builtin-xiaolai",
    "name": "小赖字体",
    "english": "Xiaolai",
    "style": "圆润手写",
    "englishStyle": "Rounded handwriting",
    "file": "Xiaolai-Regular.ttf"
  },
  {
    "id": "builtin-yozai",
    "name": "悠哉字体",
    "english": "Yozai",
    "style": "随性手写",
    "englishStyle": "Casual handwriting",
    "file": "Yozai-Regular.ttf"
  },
  {
    "id": "builtin-marker",
    "name": "霞鹜漫黑",
    "english": "LXGW Marker Gothic",
    "style": "漫画马克笔",
    "englishStyle": "Comic marker",
    "file": "LXGWMarkerGothic-Regular.ttf"
  },
  {
    "id": "builtin-smiley",
    "name": "得意黑",
    "english": "Smiley Sans",
    "style": "倾斜美术黑体",
    "englishStyle": "Slanted display",
    "file": "SmileySans-Oblique.ttf"
  },
  {
    "id": "builtin-source-serif",
    "name": "思源宋体 CN",
    "english": "Source Han Serif CN",
    "style": "文艺宋体",
    "englishStyle": "Literary serif",
    "file": "SourceHanSerifCN-Regular.otf"
  }
] as const;
export function builtinFont(id:string) { return BUILTIN_FONTS.find(font=>font.id===id); }
export function builtinFontLabel(id:string,language?:string):string {
  const font=builtinFont(id);if(!font)return id;
  return language?.startsWith('zh') ? `${font.name} · ${font.style}` : `${font.english} · ${font.englishStyle}`;
}
export function builtinFontHint(language?:string):string {
  switch(language) {
    case 'zh-TW':return '內建風格字型可離線使用，不佔匯入名額；缺字使用系統字型。得意黑偏美術風格，長篇閱讀建議文楷或宋體。';
    case 'en-US':return 'Bundled style fonts work offline and do not use import slots. Missing glyphs use system fallback. Smiley Sans is a display face; WenKai or Source Han Serif is easier for long reading.';
    case 'ja-JP':return '内蔵フォントはオフラインで使用でき、インポート枠を消費しません。未収録文字はシステムフォントで表示します。Smiley Sans は装飾的なので、長文には WenKai または Source Han Serif をおすすめします。';
    case 'ko-KR':return '내장 글꼴은 오프라인으로 사용하며 가져오기 슬롯을 쓰지 않습니다. 없는 문자는 시스템 글꼴로 표시됩니다. Smiley Sans는 장식용이며 긴 글에는 WenKai 또는 Source Han Serif가 편합니다.';
    default:return '内置风格字体可离线使用，不占导入名额；缺字使用系统字体。得意黑偏美术风格，长篇阅读建议文楷或宋体。';
  }
}
