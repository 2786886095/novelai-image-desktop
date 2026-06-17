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
  // ── 质量 / 修饰 ───────────────────────────────────────────────
  { tag: "masterpiece", zh: "杰作/高质量", aliases: ["高质量", "杰作", "质量", "精致"] },
  { tag: "best quality", zh: "最佳质量", aliases: ["高质量", "清晰", "精美"] },
  { tag: "very aesthetic", zh: "高审美", aliases: ["美", "高级", "审美"] },
  { tag: "highly detailed", zh: "高细节", aliases: ["细节", "精细", "高细节", "细致"] },
  { tag: "ultra-detailed", zh: "超精细", aliases: ["超细节", "极致细节"] },
  { tag: "official art", zh: "官方画风", aliases: ["官方", "官图"] },
  { tag: "absurdres", zh: "超高分辨率", aliases: ["高清", "高分辨率", "超清"] },

  // ── 主体 / 人数 ───────────────────────────────────────────────
  { tag: "1girl", zh: "单个女孩", aliases: ["女孩", "少女", "女角色", "女性", "妹子", "一个女孩"] },
  { tag: "1boy", zh: "单个男孩", aliases: ["男孩", "少年", "男角色", "男性", "一个男孩"] },
  { tag: "2girls", zh: "两个女孩", aliases: ["两个女孩", "双女"] },
  { tag: "multiple girls", zh: "多个女孩", aliases: ["多个女孩", "群女", "一群女生"] },
  { tag: "solo", zh: "单人构图", aliases: ["单人", "一个人", "独自"] },
  { tag: "couple", zh: "情侣", aliases: ["情侣", "一对", "两人"] },
  { tag: "child", zh: "小孩", aliases: ["小孩", "儿童", "孩子"] },
  { tag: "mature female", zh: "成熟女性", aliases: ["成熟", "御姐", "熟女"] },

  // ── 发型 / 发色 ───────────────────────────────────────────────
  { tag: "long hair", zh: "长发", aliases: ["长发", "长头发"] },
  { tag: "short hair", zh: "短发", aliases: ["短发", "短头发"] },
  { tag: "twintails", zh: "双马尾", aliases: ["双马尾", "双尾"] },
  { tag: "ponytail", zh: "马尾", aliases: ["马尾", "马尾辫", "单马尾"] },
  { tag: "braid", zh: "辫子", aliases: ["辫子", "麻花辫", "编发"] },
  { tag: "bob cut", zh: "波波头", aliases: ["波波头", "短鲍勃"] },
  { tag: "messy hair", zh: "凌乱头发", aliases: ["凌乱", "乱发", "蓬松"] },
  { tag: "floating hair", zh: "飘发", aliases: ["头发飘动", "风吹头发", "飘逸"] },
  { tag: "blonde hair", zh: "金发", aliases: ["金发", "金色头发", "黄发"] },
  { tag: "black hair", zh: "黑发", aliases: ["黑发", "黑色头发"] },
  { tag: "white hair", zh: "白发", aliases: ["白头发", "白发"] },
  { tag: "silver hair", zh: "银发", aliases: ["银发", "银色头发"] },
  { tag: "blue hair", zh: "蓝发", aliases: ["蓝发", "蓝色头发"] },
  { tag: "red hair", zh: "红发", aliases: ["红发", "红色头发"] },
  { tag: "pink hair", zh: "粉发", aliases: ["粉发", "粉色头发", "粉红头发"] },
  { tag: "purple hair", zh: "紫发", aliases: ["紫发", "紫色头发"] },
  { tag: "green hair", zh: "绿发", aliases: ["绿发", "绿色头发"] },
  { tag: "brown hair", zh: "棕发", aliases: ["棕发", "棕色头发", "褐发"] },
  { tag: "gradient hair", zh: "渐变发色", aliases: ["渐变发", "挑染", "渐变头发"] },

  // ── 眼睛 ─────────────────────────────────────────────────────
  { tag: "detailed eyes", zh: "精细眼睛", aliases: ["眼睛", "眼神", "精细眼睛"] },
  { tag: "blue eyes", zh: "蓝眼睛", aliases: ["蓝眼", "蓝色眼睛"] },
  { tag: "red eyes", zh: "红眼睛", aliases: ["红眼", "红色眼睛"] },
  { tag: "green eyes", zh: "绿眼睛", aliases: ["绿眼", "绿色眼睛"] },
  { tag: "purple eyes", zh: "紫眼睛", aliases: ["紫眼", "紫瞳"] },
  { tag: "yellow eyes", zh: "金色眼睛", aliases: ["黄眼", "金瞳", "金色眼睛"] },
  { tag: "heterochromia", zh: "异色瞳", aliases: ["异色瞳", "异瞳", "鸳鸯眼"] },

  // ── 表情 ─────────────────────────────────────────────────────
  { tag: "smile", zh: "微笑", aliases: ["笑", "笑容", "开心", "微笑"] },
  { tag: "open mouth", zh: "张嘴", aliases: ["开口", "说话", "张嘴"] },
  { tag: "blush", zh: "脸红", aliases: ["脸红", "害羞", "红脸"] },
  { tag: "crying", zh: "哭泣", aliases: ["哭", "哭泣", "流泪"] },
  { tag: "angry", zh: "生气", aliases: ["生气", "愤怒", "发怒"] },
  { tag: "expressionless", zh: "面无表情", aliases: ["面无表情", "无表情", "冷漠"] },
  { tag: "seductive smile", zh: "魅惑微笑", aliases: ["魅惑", "妩媚", "诱惑"] },
  { tag: "closed eyes", zh: "闭眼", aliases: ["闭眼", "闭着眼"] },

  // ── 服装 ─────────────────────────────────────────────────────
  { tag: "dress", zh: "连衣裙", aliases: ["连衣裙", "裙子"] },
  { tag: "white dress", zh: "白色连衣裙", aliases: ["白裙", "白色连衣裙"] },
  { tag: "black dress", zh: "黑裙", aliases: ["黑色裙子", "黑裙", "礼服"] },
  { tag: "school uniform", zh: "校服", aliases: ["校服", "制服", "学生服"] },
  { tag: "sailor uniform", zh: "水手服", aliases: ["水手服", "JK"] },
  { tag: "kimono", zh: "和服", aliases: ["和服", "浴衣", "日式服装"] },
  { tag: "hanfu", zh: "汉服", aliases: ["汉服", "古装", "国风服装"] },
  { tag: "maid", zh: "女仆装", aliases: ["女仆", "女仆装"] },
  { tag: "bikini", zh: "比基尼", aliases: ["比基尼", "泳装", "泳衣"] },
  { tag: "swimsuit", zh: "泳装", aliases: ["泳装", "泳衣"] },
  { tag: "suit", zh: "西装", aliases: ["西装", "正装"] },
  { tag: "hoodie", zh: "卫衣", aliases: ["卫衣", "连帽衫"] },
  { tag: "armor", zh: "盔甲", aliases: ["盔甲", "铠甲", "护甲"] },
  { tag: "ornate costume", zh: "华丽服装", aliases: ["华丽", "服装", "礼服"] },
  { tag: "gothic lolita", zh: "哥特萝莉", aliases: ["哥特", "洛丽塔", "lolita"] },

  // ── 配饰 ─────────────────────────────────────────────────────
  { tag: "hair ornament", zh: "发饰", aliases: ["头饰", "发夹", "发饰"] },
  { tag: "gloves", zh: "手套", aliases: ["手套", "戴手套"] },
  { tag: "cape", zh: "披风", aliases: ["披风", "斗篷"] },
  { tag: "glasses", zh: "眼镜", aliases: ["眼镜", "戴眼镜"] },
  { tag: "hat", zh: "帽子", aliases: ["帽子", "礼帽"] },
  { tag: "ribbon", zh: "丝带", aliases: ["丝带", "蝴蝶结", "缎带"] },
  { tag: "earrings", zh: "耳环", aliases: ["耳环", "耳饰"] },
  { tag: "necklace", zh: "项链", aliases: ["项链", "颈饰"] },
  { tag: "cat ears", zh: "猫耳", aliases: ["猫耳", "兽耳", "猫娘"] },
  { tag: "wings", zh: "翅膀", aliases: ["翅膀", "羽翼", "天使翼"] },
  { tag: "halo", zh: "光环", aliases: ["光环", "光圈", "天使光环"] },
  { tag: "horns", zh: "角", aliases: ["角", "犄角", "恶魔角"] },

  // ── 构图 / 视角 ───────────────────────────────────────────────
  { tag: "looking at viewer", zh: "看向观众", aliases: ["看镜头", "正视", "凝视"] },
  { tag: "upper body", zh: "上半身", aliases: ["半身", "胸像", "上身"] },
  { tag: "portrait", zh: "肖像", aliases: ["头像", "肖像", "特写"] },
  { tag: "full body", zh: "全身", aliases: ["全身", "站姿", "整体"] },
  { tag: "cowboy shot", zh: "七分身", aliases: ["七分身", "膝上"] },
  { tag: "close-up", zh: "特写", aliases: ["特写", "近景", "脸部特写"] },
  { tag: "from below", zh: "低角度", aliases: ["仰视", "低机位", "低角度"] },
  { tag: "from above", zh: "高角度", aliases: ["俯视", "高机位", "高角度"] },
  { tag: "from side", zh: "侧面", aliases: ["侧面", "侧视"] },
  { tag: "dutch angle", zh: "倾斜构图", aliases: ["倾斜", "斜角"] },
  { tag: "wide shot", zh: "远景", aliases: ["远景", "全景"] },

  // ── 姿势 / 动作 ───────────────────────────────────────────────
  { tag: "dynamic pose", zh: "动态姿势", aliases: ["动作", "姿势", "动感"] },
  { tag: "sitting", zh: "坐姿", aliases: ["坐", "坐着", "坐姿"] },
  { tag: "lying", zh: "躺着", aliases: ["躺", "躺着", "平躺"] },
  { tag: "standing", zh: "站立", aliases: ["站", "站着", "站立"] },
  { tag: "running", zh: "奔跑", aliases: ["跑", "奔跑", "跑步"] },
  { tag: "jumping", zh: "跳跃", aliases: ["跳", "跳跃"] },
  { tag: "arms up", zh: "举起手臂", aliases: ["举手", "抬手", "举起手"] },
  { tag: "hand on hip", zh: "叉腰", aliases: ["叉腰", "手放腰上"] },

  // ── 场景 / 背景 ───────────────────────────────────────────────
  { tag: "simple background", zh: "简单背景", aliases: ["纯色", "简洁", "背景简单"] },
  { tag: "transparent background", zh: "透明背景", aliases: ["透明", "抠图", "无背景"] },
  { tag: "white background", zh: "白色背景", aliases: ["白底", "白色背景"] },
  { tag: "outdoors", zh: "户外", aliases: ["户外", "室外", "野外"] },
  { tag: "indoors", zh: "室内", aliases: ["室内", "房间"] },
  { tag: "cityscape", zh: "城市景观", aliases: ["城市", "都市", "街景"] },
  { tag: "city lights", zh: "城市灯光", aliases: ["城市灯光", "霓虹", "夜景灯光"] },
  { tag: "forest", zh: "森林", aliases: ["森林", "树林"] },
  { tag: "beach", zh: "海滩", aliases: ["海滩", "沙滩", "海边"] },
  { tag: "ocean", zh: "海洋", aliases: ["海", "海洋", "大海"] },
  { tag: "mountains", zh: "群山", aliases: ["山", "群山", "山脉"] },
  { tag: "flower field", zh: "花田", aliases: ["花", "花海", "花田", "草地"] },
  { tag: "starry sky", zh: "星空", aliases: ["星空", "繁星", "满天星"] },
  { tag: "night sky", zh: "夜空", aliases: ["夜空", "夜晚", "夜景"] },
  { tag: "classroom", zh: "教室", aliases: ["教室", "学校"] },
  { tag: "bedroom", zh: "卧室", aliases: ["卧室", "房间", "床"] },
  { tag: "library", zh: "图书馆", aliases: ["书房", "图书馆", "书"] },
  { tag: "throne", zh: "王座", aliases: ["王座", "皇宫", "宝座"] },
  { tag: "cyberpunk city", zh: "赛博朋克城市", aliases: ["赛博朋克", "未来城市", "科幻城市"] },
  { tag: "fantasy", zh: "奇幻", aliases: ["奇幻", "魔幻", "幻想"] },
  { tag: "ruins", zh: "废墟", aliases: ["废墟", "遗迹"] },

  // ── 光照 / 氛围 ───────────────────────────────────────────────
  { tag: "cinematic lighting", zh: "电影感光照", aliases: ["电影", "光影", "氛围光"] },
  { tag: "dramatic lighting", zh: "戏剧光", aliases: ["强光", "强对比", "舞台光"] },
  { tag: "soft lighting", zh: "柔光", aliases: ["柔光", "柔和光线"] },
  { tag: "studio lighting", zh: "棚拍灯光", aliases: ["棚拍", "摄影棚", "打光"] },
  { tag: "backlighting", zh: "逆光", aliases: ["背光", "轮廓光", "逆光"] },
  { tag: "rim light", zh: "边缘光", aliases: ["边缘光", "轮廓光"] },
  { tag: "golden hour", zh: "黄金时刻", aliases: ["夕阳", "黄昏", "暖光", "黄金时刻"] },
  { tag: "sunlight", zh: "阳光", aliases: ["阳光", "日光"] },
  { tag: "moonlight", zh: "月光", aliases: ["月光", "月色"] },
  { tag: "neon lights", zh: "霓虹灯", aliases: ["霓虹", "霓虹灯"] },
  { tag: "god rays", zh: "丁达尔光", aliases: ["丁达尔", "耶稣光", "光束"] },
  { tag: "bioluminescence", zh: "生物荧光", aliases: ["荧光", "发光", "夜光"] },

  // ── 天气 / 特效 ───────────────────────────────────────────────
  { tag: "rain", zh: "雨景", aliases: ["雨", "下雨", "雨天"] },
  { tag: "snow", zh: "雪景", aliases: ["雪", "下雪", "雪天"] },
  { tag: "fog", zh: "雾", aliases: ["雾", "薄雾", "雾气"] },
  { tag: "wind", zh: "风", aliases: ["风", "风吹", "微风"] },
  { tag: "water droplets", zh: "水滴", aliases: ["水珠", "雨滴", "水滴"] },
  { tag: "falling petals", zh: "落花瓣", aliases: ["花瓣", "落樱", "飘落花瓣"] },
  { tag: "sparkle", zh: "闪光粒子", aliases: ["闪光", "星光", "粒子"] },
  { tag: "fire", zh: "火焰", aliases: ["火", "火焰", "烈焰"] },
  { tag: "lightning", zh: "闪电", aliases: ["闪电", "雷电"] },
  { tag: "motion blur", zh: "运动模糊", aliases: ["速度", "动感模糊", "运动模糊"] },
  { tag: "depth of field", zh: "景深", aliases: ["虚化", "背景虚化", "景深"] },
  { tag: "bokeh", zh: "焦外光斑", aliases: ["光斑", "散景", "焦外"] },

  // ── 画风 / 媒材 ───────────────────────────────────────────────
  { tag: "watercolor", zh: "水彩风格", aliases: ["水彩", "透明感"] },
  { tag: "oil painting", zh: "油画", aliases: ["油画", "厚涂", "绘画"] },
  { tag: "ink wash", zh: "水墨", aliases: ["水墨", "国风", "墨色"] },
  { tag: "comic style", zh: "漫画风", aliases: ["漫画", "分镜", "美漫"] },
  { tag: "sketch", zh: "素描", aliases: ["素描", "线稿", "草图"] },
  { tag: "flat color", zh: "平涂", aliases: ["平涂", "扁平色"] },
  { tag: "cel shading", zh: "赛璐璐", aliases: ["赛璐璐", "动画上色"] },
  { tag: "soft shading", zh: "柔和阴影", aliases: ["柔和", "软阴影", "温柔"] },
  { tag: "pixel art", zh: "像素风", aliases: ["像素", "像素风", "8位"] },
  { tag: "chibi", zh: "Q版", aliases: ["Q版", "二头身", "迷你"] },
  { tag: "realistic", zh: "写实", aliases: ["写实", "真实感", "拟真"] },
  { tag: "3d", zh: "三维渲染", aliases: ["3D", "三维", "立体"] },

  // ── 色彩 ─────────────────────────────────────────────────────
  { tag: "high contrast", zh: "高对比", aliases: ["对比", "强烈对比", "高对比"] },
  { tag: "pastel colors", zh: "粉彩色", aliases: ["粉色", "柔和颜色", "浅色"] },
  { tag: "vibrant colors", zh: "鲜艳色彩", aliases: ["鲜艳", "饱和", "艳丽"] },
  { tag: "monochrome", zh: "单色", aliases: ["单色", "黑白", "灰度"] },
  { tag: "muted colors", zh: "低饱和", aliases: ["低饱和", "灰调", "莫兰迪"] },
  { tag: "colorful", zh: "多彩", aliases: ["多彩", "彩色", "五彩"] },
];

/**
 * Pick chips for the inspiration capsule. With a query, score every chip against
 * the query so compound Chinese input like "蓝眼白发夜景" surfaces all matching
 * concepts (blue eyes + white hair + night). Without a query, return a random set.
 */
export function pickPromptChips(count = 24, query = ""): PromptChip[] {
  const q = query.trim().toLowerCase().replace(/[_,，、/]+/g, " ").trim();
  if (!q) {
    return [...PROMPT_CHIP_POOL]
      .map((chip) => ({ chip, score: Math.random() }))
      .sort((a, b) => a.score - b.score)
      .slice(0, count)
      .map((item) => item.chip);
  }
  const terms = q.split(/\s+/).filter(Boolean);
  const scored = PROMPT_CHIP_POOL.map((chip) => {
    const zh = chip.zh.toLowerCase();
    const en = chip.tag.toLowerCase();
    const allAliases = chip.aliases.map((a) => a.toLowerCase());
    let score = 0;
    // Compound match: a chip's label/alias appears anywhere in the whole query.
    if (q.includes(zh)) score += 4;
    for (const a of allAliases) if (a && q.includes(a)) score += 3;
    if (en && q.includes(en)) score += 3;
    // Per-term match: each query word hits the chip's text.
    for (const t of terms) {
      if (!t) continue;
      if (zh.includes(t) || en.includes(t)) score += 2;
      else if (allAliases.some((a) => a.includes(t) || t.includes(a))) score += 1;
    }
    return { chip, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((x) => x.chip);
}

export function tagDescription(s: TagSuggestion): string {
  return s.description ?? TAG_ZH[s.tag.toLowerCase().replace(/_/g, " ")] ?? `${CAT_LABEL[s.category] ?? "标签"}分类`;
}
