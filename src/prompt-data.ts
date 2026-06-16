// Tag-autocomplete data: category colors/labels, Chinese tag glosses, and the
// 灵感胶囊 chip pool. Pure data + helpers, extracted from App.tsx for clarity.
import type { TagSuggestion } from "./types";

/** CSS color per Danbooru tag category */
export const CAT_COLOR: Record<number, string> = {
  0: "#4ade80", // general
  1: "#fb923c", // artist
  3: "#a78bfa", // copyright
  4: "#60a5fa", // character
  5: "#94a3b8", // meta
};

export const CAT_LABEL: Record<number, string> = {
  0: "通用",
  1: "画师",
  3: "作品",
  4: "角色",
  5: "元信息",
};

export const TAG_ZH: Record<string, string> = {
  "1girl": "一个女孩 / 单女性角色",
  "1boy": "一个男孩 / 单男性角色",
  solo: "单人画面",
  "long hair": "长发",
  "short hair": "短发",
  "blonde hair": "金发",
  "black hair": "黑发",
  "white hair": "白发",
  "blue hair": "蓝发",
  "red hair": "红发",
  "pink hair": "粉发",
  "green hair": "绿发",
  "blue eyes": "蓝眼睛",
  "green eyes": "绿眼睛",
  "red eyes": "红眼睛",
  "yellow eyes": "黄眼睛 / 金色眼睛",
  gloves: "手套",
  "black gloves": "黑色手套",
  "white gloves": "白色手套",
  dress: "连衣裙",
  "white dress": "白色连衣裙",
  "school uniform": "校服",
  skirt: "裙子",
  smile: "微笑",
  "looking at viewer": "看向观众 / 正视镜头",
  "open mouth": "张嘴",
  "hair ornament": "发饰",
  earrings: "耳环",
  "male focus": "男性为主体",
  "grey eyes": "灰色眼睛",
  "simple background": "简单背景",
  outdoors: "户外",
  night: "夜晚",
  city: "城市",
  masterpiece: "杰作 / 高质量修饰词",
  "best quality": "最佳质量修饰词",
  "very aesthetic": "高审美质量修饰词",
  "artist name": "画师名占位标签",
};

export const TAB_ITEMS = [
  { value: "generate", label: "生成", icon: "✦", title: "文生图 / 图生图", desc: "提示词、参考图、批量生成" },
  { value: "inpaint", label: "重绘", icon: "◌", title: "局部重绘", desc: "涂抹蒙版后重绘指定区域" },
  { value: "upscale", label: "超分", icon: "↗", title: "云端放大", desc: "2× / 4× 云端超分" },
  { value: "postprocess", label: "后期", icon: "◈", title: "导演工具", desc: "移除背景、线稿、上色、表情" },
  { value: "inspect", label: "反推", icon: "◎", title: "AI 反推提示词", desc: "图片分析与提示词反推" },
  { value: "convert", label: "转换", icon: "⇄", title: "中文描述转标签", desc: "自然语言转 Danbooru 标签" },
] as const;

export type PromptChip = {
  tag: string;
  zh: string;
  aliases: string[];
};

export const PROMPT_CHIP_POOL: PromptChip[] = [
  { tag: "masterpiece", zh: "杰作/高质量", aliases: ["高质量", "杰作", "质量", "精致"] },
  { tag: "best quality", zh: "最佳质量", aliases: ["高质量", "清晰", "精美"] },
  { tag: "very aesthetic", zh: "高审美", aliases: ["美", "高级", "审美"] },
  { tag: "1girl", zh: "单个女孩", aliases: ["女孩", "少女", "女角色", "女性"] },
  { tag: "solo", zh: "单人构图", aliases: ["单人", "一个人", "独自"] },
  { tag: "looking at viewer", zh: "看向观众", aliases: ["看镜头", "正视", "凝视"] },
  { tag: "detailed eyes", zh: "精细眼睛", aliases: ["眼睛", "眼神", "精细"] },
  { tag: "cinematic lighting", zh: "电影感光照", aliases: ["电影", "光影", "氛围光"] },
  { tag: "dynamic pose", zh: "动态姿势", aliases: ["动作", "姿势", "动感"] },
  { tag: "simple background", zh: "简单背景", aliases: ["纯色", "简洁", "背景简单"] },
  { tag: "watercolor", zh: "水彩风格", aliases: ["水彩", "透明", "柔和"] },
  { tag: "soft shading", zh: "柔和阴影", aliases: ["柔和", "软阴影", "温柔"] },
  { tag: "upper body", zh: "上半身", aliases: ["半身", "胸像", "上身"] },
  { tag: "portrait", zh: "肖像", aliases: ["头像", "肖像", "特写"] },
  { tag: "full body", zh: "全身", aliases: ["全身", "站姿", "整体"] },
  { tag: "floating hair", zh: "飘发", aliases: ["头发飘动", "风吹头发", "飘逸"] },
  { tag: "blue eyes", zh: "蓝眼睛", aliases: ["蓝眼", "蓝色眼睛"] },
  { tag: "white hair", zh: "白发", aliases: ["白头发", "银发"] },
  { tag: "black dress", zh: "黑裙", aliases: ["黑色裙子", "礼服", "裙子"] },
  { tag: "smile", zh: "微笑", aliases: ["笑", "笑容", "开心"] },
  { tag: "open mouth", zh: "张嘴", aliases: ["开口", "说话", "嘴"] },
  { tag: "dramatic lighting", zh: "戏剧光", aliases: ["强光", "强对比", "舞台光"] },
  { tag: "golden hour", zh: "黄金时刻", aliases: ["夕阳", "黄昏", "暖光"] },
  { tag: "backlighting", zh: "逆光", aliases: ["背光", "轮廓光", "逆光"] },
  { tag: "rain", zh: "雨景", aliases: ["雨", "下雨", "雨天"] },
  { tag: "night sky", zh: "夜空", aliases: ["夜晚", "星空", "夜景"] },
  { tag: "city lights", zh: "城市灯光", aliases: ["城市", "霓虹", "街景"] },
  { tag: "flower field", zh: "花田", aliases: ["花", "花海", "草地"] },
  { tag: "transparent background", zh: "透明背景", aliases: ["透明", "抠图", "无背景"] },
  { tag: "high contrast", zh: "高对比", aliases: ["对比", "强烈", "黑白"] },
  { tag: "pastel colors", zh: "粉彩色", aliases: ["粉色", "柔和颜色", "浅色"] },
  { tag: "ink wash", zh: "水墨", aliases: ["水墨", "国风", "墨色"] },
  { tag: "oil painting", zh: "油画", aliases: ["油画", "厚涂", "绘画"] },
  { tag: "comic style", zh: "漫画风", aliases: ["漫画", "分镜", "美漫"] },
  { tag: "depth of field", zh: "景深", aliases: ["虚化", "背景虚化", "镜头"] },
  { tag: "from below", zh: "低角度", aliases: ["仰视", "低机位"] },
  { tag: "from above", zh: "高角度", aliases: ["俯视", "高机位"] },
  { tag: "motion blur", zh: "运动模糊", aliases: ["速度", "动感模糊"] },
  { tag: "wind", zh: "风", aliases: ["风吹", "飘动", "风"] },
  { tag: "water droplets", zh: "水滴", aliases: ["水珠", "雨滴", "湿"] },
  { tag: "ornate costume", zh: "华丽服装", aliases: ["华丽", "服装", "礼服"] },
  { tag: "hair ornament", zh: "发饰", aliases: ["头饰", "发夹", "发饰"] },
  { tag: "gloves", zh: "手套", aliases: ["手套", "戴手套"] },
  { tag: "cape", zh: "披风", aliases: ["披风", "斗篷"] },
  { tag: "throne", zh: "王座", aliases: ["王座", "皇宫", "坐着"] },
  { tag: "library", zh: "图书馆", aliases: ["书房", "图书馆", "书"] },
  { tag: "studio lighting", zh: "棚拍灯光", aliases: ["棚拍", "摄影棚", "打光"] },
];

export function pickPromptChips(count = 12, query = ""): PromptChip[] {
  const normalized = query.trim().toLowerCase().replace(/_/g, " ");
  const pool = normalized
    ? PROMPT_CHIP_POOL.filter((chip) => {
        const haystack = [chip.tag, chip.zh, ...chip.aliases].join(" ").toLowerCase();
        return haystack.includes(normalized) || chip.aliases.some((alias) => normalized.includes(alias.toLowerCase()));
      })
    : PROMPT_CHIP_POOL;
  return [...(pool.length ? pool : PROMPT_CHIP_POOL)]
    .map((chip) => ({ chip, score: normalized ? 0 : Math.random() }))
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map((item) => item.chip);
}

export function tagDescription(s: TagSuggestion): string {
  return s.description ?? TAG_ZH[s.tag.toLowerCase().replace(/_/g, " ")] ?? `${CAT_LABEL[s.category] ?? "标签"}分类`;
}
