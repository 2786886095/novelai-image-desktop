/** Offline font catalog. IDs and original font bytes are identical on desktop and mobile.
 * No system-font aliases, network URLs or user-import slots are used for these entries. */
export const BUILTIN_FONTS = [
  {
    "id": "builtin-wenkai",
    "name": "霞鹜文楷 轻便版",
    "style": "文雅楷书",
    "file": "LXGWWenKaiLite-Regular.ttf"
  },
  {
    "id": "builtin-xiaolai",
    "name": "小赖字体",
    "style": "圆润手写",
    "file": "Xiaolai-Regular.ttf"
  },
  {
    "id": "builtin-yozai",
    "name": "悠哉字体",
    "style": "随性手写",
    "file": "Yozai-Regular.ttf"
  },
  {
    "id": "builtin-marker",
    "name": "霞鹜漫黑",
    "style": "漫画马克笔",
    "file": "LXGWMarkerGothic-Regular.ttf"
  },
  {
    "id": "builtin-smiley",
    "name": "得意黑",
    "style": "倾斜美术黑体",
    "file": "SmileySans-Oblique.ttf"
  },
  {
    "id": "builtin-source-serif",
    "name": "思源宋体 CN",
    "style": "文艺宋体",
    "file": "SourceHanSerifCN-Regular.otf"
  }
] as const;
export function builtinFont(id:string) { return BUILTIN_FONTS.find(font=>font.id===id); }
export function builtinFontLabel(id:string,_language?:string):string {
  const font=builtinFont(id);if(!font)return id;
  return `${font.name} · ${font.style}`;
}
export function builtinFontHint(_language?:string):string {
  return '内置风格字体可离线使用，不占导入名额；缺字使用系统字体。得意黑偏美术风格，长篇阅读建议文楷或宋体。';
}
