// Tag-autocomplete data: category colors/labels, Chinese tag glosses, and the
// 灵感胶囊 chip pool. Pure data + helpers, extracted from App.tsx for clarity.
import type { TagSuggestion } from "./types";
import { CAPSULE_EXTRA, CAPSULE_EXTRA2, CAPSULE_EXTRA3, mergeCapsules, type CapsuleCategory } from "./capsule-data";

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
  { value: "tools", label: "工具", icon: "▣", title: "工具板块", desc: "漫画生成器、批量工作流" },
  { value: "records", label: "记录", icon: "▤", title: "AI 调用记录", desc: "查看反推/转换/拆分镜每次发送与返回" },
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

  // ── 发型补充 ──────────────────────────────────────────────────
  { tag: "very long hair", zh: "超长发", aliases: ["超长发", "及腰长发"] },
  { tag: "wavy hair", zh: "波浪卷发", aliases: ["卷发", "波浪发", "大波浪"] },
  { tag: "curly hair", zh: "卷发", aliases: ["卷发", "蓬卷"] },
  { tag: "hime cut", zh: "公主切", aliases: ["公主切", "姬发式"] },
  { tag: "side ponytail", zh: "侧马尾", aliases: ["侧马尾"] },
  { tag: "drill hair", zh: "钻头卷", aliases: ["钻头", "麻花卷", "螺旋卷"] },
  { tag: "ahoge", zh: "呆毛", aliases: ["呆毛", "翘毛"] },
  { tag: "bangs", zh: "刘海", aliases: ["刘海", "齐刘海"] },
  { tag: "two-tone hair", zh: "双色发", aliases: ["双色发", "撞色发"] },

  // ── 五官 / 身体 ───────────────────────────────────────────────
  { tag: "freckles", zh: "雀斑", aliases: ["雀斑", "斑点"] },
  { tag: "fang", zh: "虎牙", aliases: ["虎牙", "尖牙"] },
  { tag: "mole under eye", zh: "泪痣", aliases: ["泪痣", "眼下痣"] },
  { tag: "pointy ears", zh: "尖耳朵", aliases: ["尖耳", "精灵耳"] },
  { tag: "large breasts", zh: "大胸", aliases: ["大胸", "丰满"] },
  { tag: "small breasts", zh: "小胸", aliases: ["小胸", "平胸"] },
  { tag: "thighs", zh: "大腿", aliases: ["大腿", "腿"] },
  { tag: "collarbone", zh: "锁骨", aliases: ["锁骨"] },
  { tag: "muscular", zh: "肌肉", aliases: ["肌肉", "健壮", "强壮"] },
  { tag: "tail", zh: "尾巴", aliases: ["尾巴", "兽尾"] },

  // ── 服饰补充 ──────────────────────────────────────────────────
  { tag: "thighhighs", zh: "过膝袜", aliases: ["过膝袜", "大腿袜", "黑丝"] },
  { tag: "pantyhose", zh: "连裤袜", aliases: ["连裤袜", "丝袜"] },
  { tag: "shirt", zh: "衬衫", aliases: ["衬衫", "上衣"] },
  { tag: "t-shirt", zh: "T恤", aliases: ["T恤", "短袖"] },
  { tag: "jacket", zh: "夹克", aliases: ["夹克", "外套"] },
  { tag: "coat", zh: "大衣", aliases: ["大衣", "风衣"] },
  { tag: "sweater", zh: "毛衣", aliases: ["毛衣", "针织衫"] },
  { tag: "shorts", zh: "短裤", aliases: ["短裤"] },
  { tag: "pants", zh: "长裤", aliases: ["长裤", "裤子"] },
  { tag: "jeans", zh: "牛仔裤", aliases: ["牛仔裤"] },
  { tag: "miniskirt", zh: "迷你裙", aliases: ["迷你裙", "短裙"] },
  { tag: "pleated skirt", zh: "百褶裙", aliases: ["百褶裙", "JK裙"] },
  { tag: "necktie", zh: "领带", aliases: ["领带"] },
  { tag: "scarf", zh: "围巾", aliases: ["围巾"] },
  { tag: "boots", zh: "靴子", aliases: ["靴子", "长靴"] },
  { tag: "high heels", zh: "高跟鞋", aliases: ["高跟鞋", "高跟"] },
  { tag: "crop top", zh: "短上衣", aliases: ["短上衣", "露脐装"] },
  { tag: "off shoulder", zh: "露肩", aliases: ["露肩", "一字肩"] },
  { tag: "garter belt", zh: "吊袜带", aliases: ["吊袜带", "吊带"] },
  { tag: "witch hat", zh: "女巫帽", aliases: ["女巫帽", "巫师帽", "尖帽"] },
  { tag: "crown", zh: "皇冠", aliases: ["皇冠", "王冠"] },
  { tag: "veil", zh: "面纱", aliases: ["面纱", "头纱"] },
  { tag: "mask", zh: "面具", aliases: ["面具", "口罩"] },

  // ── 配饰补充 ──────────────────────────────────────────────────
  { tag: "fox ears", zh: "狐耳", aliases: ["狐耳", "狐狸耳朵"] },
  { tag: "animal ears", zh: "兽耳", aliases: ["兽耳", "动物耳朵"] },
  { tag: "demon horns", zh: "恶魔角", aliases: ["恶魔角"] },
  { tag: "angel wings", zh: "天使翅膀", aliases: ["天使翼", "白翼"] },
  { tag: "tattoo", zh: "纹身", aliases: ["纹身", "刺青"] },
  { tag: "choker", zh: "项圈", aliases: ["项圈", "颈环"] },
  { tag: "headphones", zh: "耳机", aliases: ["耳机", "头戴耳机"] },
  { tag: "bag", zh: "包", aliases: ["包", "背包", "书包"] },
  { tag: "umbrella", zh: "雨伞", aliases: ["伞", "雨伞", "油纸伞"] },

  // ── 道具 / 物件 ───────────────────────────────────────────────
  { tag: "sword", zh: "剑", aliases: ["剑", "刀剑", "武器"] },
  { tag: "katana", zh: "武士刀", aliases: ["武士刀", "日本刀"] },
  { tag: "gun", zh: "枪", aliases: ["枪", "手枪"] },
  { tag: "staff", zh: "法杖", aliases: ["法杖", "魔杖"] },
  { tag: "book", zh: "书", aliases: ["书", "书本"] },
  { tag: "flower", zh: "花朵", aliases: ["花", "花朵"] },
  { tag: "cherry blossoms", zh: "樱花", aliases: ["樱花", "樱"] },
  { tag: "rose", zh: "玫瑰", aliases: ["玫瑰", "蔷薇"] },
  { tag: "sword and shield", zh: "剑与盾", aliases: ["盾牌", "剑盾"] },
  { tag: "cup", zh: "杯子", aliases: ["杯子", "茶杯", "咖啡杯"] },
  { tag: "food", zh: "食物", aliases: ["食物", "美食"] },
  { tag: "phone", zh: "手机", aliases: ["手机", "电话"] },
  { tag: "guitar", zh: "吉他", aliases: ["吉他", "乐器"] },
  { tag: "balloon", zh: "气球", aliases: ["气球"] },
  { tag: "lantern", zh: "灯笼", aliases: ["灯笼", "纸灯"] },

  // ── 场景补充 ──────────────────────────────────────────────────
  { tag: "cafe", zh: "咖啡厅", aliases: ["咖啡厅", "咖啡馆"] },
  { tag: "street", zh: "街道", aliases: ["街道", "马路", "街头"] },
  { tag: "rooftop", zh: "屋顶", aliases: ["屋顶", "天台"] },
  { tag: "shrine", zh: "神社", aliases: ["神社", "鸟居"] },
  { tag: "temple", zh: "寺庙", aliases: ["寺庙", "庙宇"] },
  { tag: "castle", zh: "城堡", aliases: ["城堡", "宫殿"] },
  { tag: "garden", zh: "花园", aliases: ["花园", "庭院"] },
  { tag: "park", zh: "公园", aliases: ["公园"] },
  { tag: "snowfield", zh: "雪原", aliases: ["雪原", "雪地"] },
  { tag: "desert", zh: "沙漠", aliases: ["沙漠", "荒漠"] },
  { tag: "underwater", zh: "水下", aliases: ["水下", "海底"] },
  { tag: "space", zh: "太空", aliases: ["太空", "宇宙", "星际"] },
  { tag: "waterfall", zh: "瀑布", aliases: ["瀑布"] },
  { tag: "lake", zh: "湖", aliases: ["湖", "湖泊"] },
  { tag: "bridge", zh: "桥", aliases: ["桥", "桥梁"] },
  { tag: "train interior", zh: "车厢内", aliases: ["车厢", "电车内"] },
  { tag: "autumn leaves", zh: "秋叶", aliases: ["秋叶", "红叶", "枫叶"] },
  { tag: "snowing", zh: "下雪", aliases: ["下雪", "飘雪"] },

  // ── 氛围 / 主题 ───────────────────────────────────────────────
  { tag: "steampunk", zh: "蒸汽朋克", aliases: ["蒸汽朋克"] },
  { tag: "post-apocalyptic", zh: "末世", aliases: ["末世", "废土"] },
  { tag: "magical girl", zh: "魔法少女", aliases: ["魔法少女", "魔女"] },
  { tag: "mecha", zh: "机甲", aliases: ["机甲", "机器人"] },
  { tag: "gothic", zh: "哥特", aliases: ["哥特", "暗黑"] },
  { tag: "horror", zh: "恐怖", aliases: ["恐怖", "惊悚"] },
  { tag: "dreamy", zh: "梦幻", aliases: ["梦幻", "梦境", "唯美"] },
  { tag: "ethereal", zh: "空灵", aliases: ["空灵", "缥缈"] },
];

// English-tag -> Chinese lookup, used to give MCP/server tags a 中文 label.
const EN_TO_ZH = new Map<string, string>();
for (const chip of PROMPT_CHIP_POOL) {
  EN_TO_ZH.set(chip.tag.toLowerCase(), chip.zh);
  for (const a of chip.aliases) if (/[一-鿿]/.test(a) && !EN_TO_ZH.has(chip.tag.toLowerCase())) EN_TO_ZH.set(chip.tag.toLowerCase(), a);
}
for (const [k, v] of Object.entries(TAG_ZH)) {
  const key = k.toLowerCase();
  if (!EN_TO_ZH.has(key)) EN_TO_ZH.set(key, v);
}

/** Best-effort Chinese gloss for an English Danbooru tag ("" if unknown). */
export function zhForTag(tag: string): string {
  const norm = tag.toLowerCase().trim().replace(/_/g, " ");
  return EN_TO_ZH.get(norm) ?? "";
}

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

// ── 灵感胶囊分类法 (Inspiration Capsule taxonomy) ──────────────────────────────
// A two-level palette: top category → subgroup → bilingual tag chips, matching
// the reference layout (人物 → 对象/身份/… → chips). Bilingual labels are inline
// so the capsule works WITHOUT the optional Danbooru download; tags are seeded
// from official NovelAI documentation examples (quality tags, view/angle terms,
// lighting) plus common Danbooru tags. Extend freely — it is plain data.
// Capsule data types live in ./capsule-data (where the large authored library is).
export type { CapsuleTag, CapsuleSubgroup, CapsuleCategory } from "./capsule-data";

// Curated builtin capsule — kept small and hand-verified so every tag sits in the
// right category; merged with the big authored CAPSULE_EXTRA below.
const CAPSULE_BUILTIN: CapsuleCategory[] = [
  {
    name: "人物",
    subgroups: [
      { name: "对象", tags: [
        { en: "1girl", zh: "1女孩" }, { en: "2girls", zh: "2女孩" }, { en: "3girls", zh: "3女孩" },
        { en: "1boy", zh: "1男孩" }, { en: "2boys", zh: "2男孩" }, { en: "solo", zh: "单人" },
        { en: "multiple_girls", zh: "多个女孩" }, { en: "multiple_boys", zh: "多个男孩" },
        { en: "1other", zh: "1其他" }, { en: "couple", zh: "情侣" }, { en: "group", zh: "群像" } ] },
      { name: "身份", tags: [
        { en: "maid", zh: "女仆" }, { en: "nun", zh: "修女" }, { en: "witch", zh: "女巫" },
        { en: "idol", zh: "偶像" }, { en: "nurse", zh: "护士" }, { en: "police", zh: "警察" },
        { en: "knight", zh: "骑士" }, { en: "samurai", zh: "武士" }, { en: "ninja", zh: "忍者" },
        { en: "schoolgirl", zh: "女学生" }, { en: "teacher", zh: "教师" }, { en: "office_lady", zh: "OL" },
        { en: "princess", zh: "公主" }, { en: "queen", zh: "女王" }, { en: "angel", zh: "天使" }, { en: "demon_girl", zh: "恶魔娘" } ] },
      { name: "年龄", tags: [
        { en: "loli", zh: "萝莉" }, { en: "shota", zh: "正太" }, { en: "child", zh: "儿童" },
        { en: "teenage_girl", zh: "少女" }, { en: "mature_female", zh: "成熟女性" }, { en: "milf", zh: "御姐/熟女" },
        { en: "old_woman", zh: "老妇" }, { en: "old_man", zh: "老人" }, { en: "aged_down", zh: "幼年化" } ] },
      { name: "体型", tags: [
        { en: "petite", zh: "娇小" }, { en: "slim", zh: "纤细" }, { en: "curvy", zh: "丰满曲线" },
        { en: "muscular_female", zh: "肌肉女性" }, { en: "plump", zh: "丰腴" }, { en: "tall_female", zh: "高个女性" },
        { en: "wide_hips", zh: "宽臀" }, { en: "thick_thighs", zh: "粗腿" }, { en: "toned", zh: "结实" } ] },
      { name: "肤色", tags: [
        { en: "pale_skin", zh: "白皙皮肤" }, { en: "dark_skin", zh: "深色皮肤" }, { en: "tan", zh: "小麦色" },
        { en: "dark-skinned_female", zh: "深肤色女性" }, { en: "freckles", zh: "雀斑" }, { en: "shiny_skin", zh: "光泽皮肤" } ] },
      { name: "发型", tags: [
        { en: "long_hair", zh: "长发" }, { en: "short_hair", zh: "短发" }, { en: "very_long_hair", zh: "超长发" },
        { en: "twintails", zh: "双马尾" }, { en: "ponytail", zh: "马尾" }, { en: "braid", zh: "辫子" },
        { en: "twin_braids", zh: "双辫" }, { en: "hair_bun", zh: "丸子头" }, { en: "bob_cut", zh: "波波头" },
        { en: "ahoge", zh: "呆毛" }, { en: "drill_hair", zh: "钻头卷" }, { en: "messy_hair", zh: "凌乱发" },
        { en: "wavy_hair", zh: "波浪发" }, { en: "curly_hair", zh: "卷发" }, { en: "hime_cut", zh: "公主切" } ] },
      { name: "发色", tags: [
        { en: "blonde_hair", zh: "金发" }, { en: "black_hair", zh: "黑发" }, { en: "brown_hair", zh: "棕发" },
        { en: "white_hair", zh: "白发" }, { en: "silver_hair", zh: "银发" }, { en: "blue_hair", zh: "蓝发" },
        { en: "red_hair", zh: "红发" }, { en: "pink_hair", zh: "粉发" }, { en: "purple_hair", zh: "紫发" },
        { en: "green_hair", zh: "绿发" }, { en: "grey_hair", zh: "灰发" }, { en: "orange_hair", zh: "橙发" },
        { en: "multicolored_hair", zh: "多色发" }, { en: "gradient_hair", zh: "渐变发" }, { en: "two-tone_hair", zh: "双色发" } ] },
      { name: "眼睛", tags: [
        { en: "blue_eyes", zh: "蓝眼" }, { en: "red_eyes", zh: "红眼" }, { en: "green_eyes", zh: "绿眼" },
        { en: "yellow_eyes", zh: "黄眼" }, { en: "purple_eyes", zh: "紫眼" }, { en: "pink_eyes", zh: "粉眼" },
        { en: "brown_eyes", zh: "棕眼" }, { en: "black_eyes", zh: "黑眼" }, { en: "heterochromia", zh: "异色瞳" },
        { en: "closed_eyes", zh: "闭眼" }, { en: "half-closed_eyes", zh: "半闭眼" }, { en: "glowing_eyes", zh: "发光眼" } ] },
      { name: "瞳孔", tags: [
        { en: "slit_pupils", zh: "竖瞳" }, { en: "heart-shaped_pupils", zh: "心形瞳" }, { en: "star-shaped_pupils", zh: "星形瞳" },
        { en: "sparkling_eyes", zh: "闪亮眼" }, { en: "ringed_eyes", zh: "环状瞳" } ] },
      { name: "耳朵", tags: [
        { en: "pointy_ears", zh: "尖耳" }, { en: "animal_ears", zh: "兽耳" }, { en: "cat_ears", zh: "猫耳" },
        { en: "fox_ears", zh: "狐耳" }, { en: "rabbit_ears", zh: "兔耳" }, { en: "dog_ears", zh: "狗耳" } ] },
      { name: "口齿", tags: [
        { en: "open_mouth", zh: "张嘴" }, { en: "closed_mouth", zh: "闭嘴" }, { en: "lips", zh: "嘴唇" },
        { en: "fang", zh: "虎牙" }, { en: "tongue_out", zh: "吐舌" }, { en: "teeth", zh: "牙齿" }, { en: "lipstick", zh: "口红" } ] },
      { name: "胸部", tags: [
        { en: "small_breasts", zh: "小胸" }, { en: "medium_breasts", zh: "中胸" }, { en: "large_breasts", zh: "大胸" },
        { en: "huge_breasts", zh: "巨乳" }, { en: "flat_chest", zh: "平胸" }, { en: "cleavage", zh: "事业线" } ] },
      { name: "翅膀尾角", tags: [
        { en: "wings", zh: "翅膀" }, { en: "angel_wings", zh: "天使翼" }, { en: "demon_wings", zh: "恶魔翼" },
        { en: "tail", zh: "尾巴" }, { en: "cat_tail", zh: "猫尾" }, { en: "horns", zh: "角" }, { en: "halo", zh: "光环" } ] },
    ],
  },
  {
    name: "服饰",
    subgroups: [
      { name: "上衣", tags: [
        { en: "shirt", zh: "衬衫" }, { en: "t-shirt", zh: "T恤" }, { en: "blouse", zh: "女衬衫" },
        { en: "sweater", zh: "毛衣" }, { en: "hoodie", zh: "连帽衫" }, { en: "jacket", zh: "夹克" },
        { en: "coat", zh: "外套" }, { en: "cardigan", zh: "开衫" }, { en: "vest", zh: "马甲" }, { en: "crop_top", zh: "露脐上衣" } ] },
      { name: "下装", tags: [
        { en: "skirt", zh: "裙子" }, { en: "pleated_skirt", zh: "百褶裙" }, { en: "miniskirt", zh: "迷你裙" },
        { en: "long_skirt", zh: "长裙" }, { en: "shorts", zh: "短裤" }, { en: "pants", zh: "长裤" }, { en: "jeans", zh: "牛仔裤" } ] },
      { name: "连衣裙", tags: [
        { en: "dress", zh: "连衣裙" }, { en: "sundress", zh: "吊带裙" }, { en: "evening_gown", zh: "晚礼服" },
        { en: "wedding_dress", zh: "婚纱" }, { en: "china_dress", zh: "旗袍" }, { en: "frilled_dress", zh: "荷叶边裙" } ] },
      { name: "制服", tags: [
        { en: "school_uniform", zh: "校服" }, { en: "serafuku", zh: "水手服" }, { en: "sailor_collar", zh: "水手领" },
        { en: "military_uniform", zh: "军装" }, { en: "maid_apron", zh: "女仆围裙" }, { en: "gym_uniform", zh: "体操服" } ] },
      { name: "泳装内衣", tags: [
        { en: "swimsuit", zh: "泳装" }, { en: "bikini", zh: "比基尼" }, { en: "school_swimsuit", zh: "学校泳装" },
        { en: "one-piece_swimsuit", zh: "连体泳装" }, { en: "underwear", zh: "内衣" }, { en: "bra", zh: "胸罩" },
        { en: "panties", zh: "内裤" }, { en: "lingerie", zh: "情趣内衣" }, { en: "leotard", zh: "紧身衣" } ] },
      { name: "腿袜鞋", tags: [
        { en: "thighhighs", zh: "过膝袜" }, { en: "pantyhose", zh: "连裤袜" }, { en: "socks", zh: "袜子" },
        { en: "kneehighs", zh: "及膝袜" }, { en: "boots", zh: "靴子" }, { en: "high_heels", zh: "高跟鞋" },
        { en: "sneakers", zh: "运动鞋" }, { en: "sandals", zh: "凉鞋" }, { en: "mary_janes", zh: "玛丽珍鞋" } ] },
      { name: "头饰", tags: [
        { en: "hat", zh: "帽子" }, { en: "hair_ribbon", zh: "发带" }, { en: "hair_ornament", zh: "发饰" },
        { en: "hairband", zh: "发箍" }, { en: "hairclip", zh: "发夹" }, { en: "headband", zh: "头带" },
        { en: "beret", zh: "贝雷帽" }, { en: "witch_hat", zh: "女巫帽" }, { en: "crown", zh: "皇冠" }, { en: "maid_headdress", zh: "女仆头饰" } ] },
      { name: "配饰", tags: [
        { en: "glasses", zh: "眼镜" }, { en: "gloves", zh: "手套" }, { en: "necklace", zh: "项链" },
        { en: "earrings", zh: "耳环" }, { en: "choker", zh: "颈圈" }, { en: "scarf", zh: "围巾" },
        { en: "bracelet", zh: "手镯" }, { en: "belt", zh: "腰带" }, { en: "bag", zh: "包" }, { en: "ribbon", zh: "丝带" } ] },
      { name: "和风汉服", tags: [
        { en: "kimono", zh: "和服" }, { en: "yukata", zh: "浴衣" }, { en: "hakama", zh: "袴" },
        { en: "japanese_clothes", zh: "和风服饰" }, { en: "hanfu", zh: "汉服" }, { en: "chinese_clothes", zh: "中式服装" } ] },
    ],
  },
  {
    name: "表情",
    subgroups: [
      { name: "情绪", tags: [
        { en: "smile", zh: "微笑" }, { en: "grin", zh: "咧嘴笑" }, { en: "laughing", zh: "大笑" },
        { en: "blush", zh: "脸红" }, { en: "crying", zh: "哭泣" }, { en: "tears", zh: "泪水" },
        { en: "angry", zh: "生气" }, { en: "pout", zh: "嘟嘴" }, { en: "surprised", zh: "惊讶" },
        { en: "expressionless", zh: "面无表情" }, { en: "smug", zh: "得意" }, { en: "embarrassed", zh: "害羞" },
        { en: "sad", zh: "悲伤" }, { en: "serious", zh: "严肃" }, { en: "seductive_smile", zh: "魅惑笑" } ] },
      { name: "视线", tags: [
        { en: "looking_at_viewer", zh: "看向观众" }, { en: "looking_away", zh: "看向别处" }, { en: "looking_back", zh: "回眸" },
        { en: "looking_up", zh: "向上看" }, { en: "looking_down", zh: "向下看" }, { en: "eye_contact", zh: "对视" } ] },
    ],
  },
  {
    name: "动作姿势",
    subgroups: [
      { name: "姿势", tags: [
        { en: "standing", zh: "站立" }, { en: "sitting", zh: "坐姿" }, { en: "lying", zh: "躺卧" },
        { en: "kneeling", zh: "跪姿" }, { en: "squatting", zh: "蹲姿" }, { en: "crossed_legs", zh: "翘腿" },
        { en: "on_back", zh: "仰卧" }, { en: "on_stomach", zh: "俯卧" }, { en: "leaning_forward", zh: "前倾" },
        { en: "arched_back", zh: "弓背" } ] },
      { name: "手部", tags: [
        { en: "hand_up", zh: "举手" }, { en: "hands_on_hips", zh: "叉腰" }, { en: "peace_sign", zh: "比耶" },
        { en: "waving", zh: "挥手" }, { en: "pointing", zh: "指向" }, { en: "thumbs_up", zh: "点赞" },
        { en: "hand_on_own_cheek", zh: "托腮" }, { en: "covering_mouth", zh: "捂嘴" } ] },
      { name: "动作", tags: [
        { en: "holding", zh: "持物" }, { en: "running", zh: "奔跑" }, { en: "jumping", zh: "跳跃" },
        { en: "walking", zh: "行走" }, { en: "dancing", zh: "跳舞" }, { en: "hug", zh: "拥抱" },
        { en: "sleeping", zh: "睡觉" }, { en: "stretching", zh: "伸展" }, { en: "falling", zh: "坠落" } ] },
    ],
  },
  {
    name: "画面构图",
    subgroups: [
      { name: "景别", tags: [
        { en: "portrait", zh: "肖像" }, { en: "close-up", zh: "特写" }, { en: "upper_body", zh: "上半身" },
        { en: "cowboy_shot", zh: "七分身" }, { en: "full_body", zh: "全身" }, { en: "wide_shot", zh: "远景" },
        { en: "feet_out_of_frame", zh: "脚出框" } ] },
      { name: "视角", tags: [
        { en: "from_above", zh: "俯视" }, { en: "from_below", zh: "仰视" }, { en: "from_side", zh: "侧面" },
        { en: "from_behind", zh: "背后视角" }, { en: "dutch_angle", zh: "倾斜构图" }, { en: "pov", zh: "第一人称" },
        { en: "profile", zh: "侧脸" }, { en: "three-quarter_view", zh: "四分之三视角" } ] },
      { name: "构图", tags: [
        { en: "rule_of_thirds", zh: "三分构图" }, { en: "depth_of_field", zh: "景深" }, { en: "scenery", zh: "风景构图" },
        { en: "symmetry", zh: "对称" }, { en: "silhouette", zh: "剪影" }, { en: "backlighting", zh: "逆光" } ] },
    ],
  },
  {
    name: "光影画质",
    subgroups: [
      { name: "光照", tags: [
        { en: "cinematic_lighting", zh: "电影光" }, { en: "rim_lighting", zh: "轮廓光" }, { en: "volumetric_lighting", zh: "体积光" },
        { en: "sunlight", zh: "阳光" }, { en: "dappled_sunlight", zh: "斑驳阳光" }, { en: "god_rays", zh: "丁达尔光" },
        { en: "lens_flare", zh: "镜头光晕" }, { en: "bloom", zh: "泛光" }, { en: "soft_lighting", zh: "柔光" } ] },
      { name: "质量词", tags: [
        { en: "masterpiece", zh: "杰作" }, { en: "best_quality", zh: "最佳质量" }, { en: "very_aesthetic", zh: "高审美" },
        { en: "absurdres", zh: "超高分辨率" }, { en: "highres", zh: "高分辨率" }, { en: "very_detailed", zh: "高细节" },
        { en: "official_art", zh: "官方画风" }, { en: "extremely_detailed", zh: "极致细节" } ] },
    ],
  },
  {
    name: "环境天气",
    subgroups: [
      { name: "天气", tags: [
        { en: "rain", zh: "雨" }, { en: "snow", zh: "雪" }, { en: "clouds", zh: "云" },
        { en: "fog", zh: "雾" }, { en: "thunderstorm", zh: "雷暴" }, { en: "rainbow", zh: "彩虹" }, { en: "wind", zh: "风" } ] },
      { name: "时间", tags: [
        { en: "day", zh: "白天" }, { en: "night", zh: "夜晚" }, { en: "sunset", zh: "日落" },
        { en: "sunrise", zh: "日出" }, { en: "dusk", zh: "黄昏" }, { en: "morning", zh: "清晨" } ] },
      { name: "天空", tags: [
        { en: "sky", zh: "天空" }, { en: "blue_sky", zh: "蓝天" }, { en: "starry_sky", zh: "星空" },
        { en: "night_sky", zh: "夜空" }, { en: "cloudy_sky", zh: "多云天空" }, { en: "moon", zh: "月亮" }, { en: "full_moon", zh: "满月" } ] },
    ],
  },
  {
    name: "场景",
    subgroups: [
      { name: "室内", tags: [
        { en: "indoors", zh: "室内" }, { en: "classroom", zh: "教室" }, { en: "bedroom", zh: "卧室" },
        { en: "kitchen", zh: "厨房" }, { en: "bathroom", zh: "浴室" }, { en: "cafe", zh: "咖啡馆" },
        { en: "library", zh: "图书馆" }, { en: "office", zh: "办公室" }, { en: "living_room", zh: "客厅" } ] },
      { name: "室外", tags: [
        { en: "outdoors", zh: "户外" }, { en: "cityscape", zh: "城市景观" }, { en: "street", zh: "街道" },
        { en: "rooftop", zh: "屋顶" }, { en: "park", zh: "公园" }, { en: "beach", zh: "海滩" },
        { en: "garden", zh: "花园" }, { en: "alley", zh: "小巷" }, { en: "shopping_district", zh: "商业街" } ] },
      { name: "自然", tags: [
        { en: "forest", zh: "森林" }, { en: "mountain", zh: "山" }, { en: "ocean", zh: "海洋" },
        { en: "lake", zh: "湖" }, { en: "river", zh: "河流" }, { en: "field", zh: "田野" },
        { en: "flower_field", zh: "花田" }, { en: "waterfall", zh: "瀑布" }, { en: "cherry_blossoms", zh: "樱花" } ] },
      { name: "幻想场景", tags: [
        { en: "castle", zh: "城堡" }, { en: "ruins", zh: "废墟" }, { en: "temple", zh: "神殿" },
        { en: "shrine", zh: "神社" }, { en: "dungeon", zh: "地牢" }, { en: "floating_island", zh: "浮空岛" }, { en: "fantasy", zh: "幻想世界" } ] },
    ],
  },
  {
    name: "物品道具",
    subgroups: [
      { name: "武器", tags: [
        { en: "sword", zh: "剑" }, { en: "katana", zh: "武士刀" }, { en: "gun", zh: "枪" },
        { en: "rifle", zh: "步枪" }, { en: "bow_(weapon)", zh: "弓" }, { en: "knife", zh: "刀" },
        { en: "staff", zh: "法杖" }, { en: "polearm", zh: "长柄武器" }, { en: "shield", zh: "盾" }, { en: "scythe", zh: "镰刀" } ] },
      { name: "食物", tags: [
        { en: "food", zh: "食物" }, { en: "cake", zh: "蛋糕" }, { en: "ice_cream", zh: "冰淇淋" },
        { en: "fruit", zh: "水果" }, { en: "candy", zh: "糖果" }, { en: "coffee", zh: "咖啡" },
        { en: "bento", zh: "便当" }, { en: "ramen", zh: "拉面" }, { en: "drink", zh: "饮料" } ] },
      { name: "日常", tags: [
        { en: "book", zh: "书" }, { en: "smartphone", zh: "手机" }, { en: "umbrella", zh: "伞" },
        { en: "cup", zh: "杯子" }, { en: "bag", zh: "包" }, { en: "balloon", zh: "气球" },
        { en: "stuffed_toy", zh: "玩偶" }, { en: "headphones", zh: "耳机" }, { en: "camera", zh: "相机" } ] },
      { name: "植物乐器", tags: [
        { en: "flower", zh: "花" }, { en: "rose", zh: "玫瑰" }, { en: "petals", zh: "花瓣" },
        { en: "leaf", zh: "叶子" }, { en: "guitar", zh: "吉他" }, { en: "piano", zh: "钢琴" }, { en: "violin", zh: "小提琴" } ] },
    ],
  },
  {
    name: "色彩特效",
    subgroups: [
      { name: "色调", tags: [
        { en: "monochrome", zh: "单色" }, { en: "greyscale", zh: "灰阶" }, { en: "pastel_colors", zh: "粉彩色" },
        { en: "vivid_colors", zh: "鲜艳色" }, { en: "muted_color", zh: "低饱和" }, { en: "limited_palette", zh: "有限配色" },
        { en: "gradient", zh: "渐变" }, { en: "colorful", zh: "多彩" } ] },
      { name: "特效", tags: [
        { en: "bokeh", zh: "背景虚化" }, { en: "motion_blur", zh: "动态模糊" }, { en: "chromatic_aberration", zh: "色差" },
        { en: "sparkle", zh: "闪光粒子" }, { en: "glowing", zh: "发光" }, { en: "film_grain", zh: "胶片颗粒" }, { en: "light_particles", zh: "光粒子" } ] },
    ],
  },
  {
    name: "生物",
    subgroups: [
      { name: "动物", tags: [
        { en: "cat", zh: "猫" }, { en: "dog", zh: "狗" }, { en: "bird", zh: "鸟" },
        { en: "fox", zh: "狐狸" }, { en: "rabbit", zh: "兔子" }, { en: "horse", zh: "马" },
        { en: "wolf", zh: "狼" }, { en: "fish", zh: "鱼" }, { en: "butterfly", zh: "蝴蝶" } ] },
      { name: "幻想生物", tags: [
        { en: "dragon", zh: "龙" }, { en: "fairy", zh: "妖精" }, { en: "mermaid", zh: "美人鱼" },
        { en: "elf", zh: "精灵" }, { en: "slime_(creature)", zh: "史莱姆" }, { en: "phoenix", zh: "凤凰" }, { en: "monster", zh: "怪物" } ] },
    ],
  },
  {
    name: "风格画风",
    subgroups: [
      { name: "媒介", tags: [
        { en: "watercolor_(medium)", zh: "水彩" }, { en: "oil_painting_(medium)", zh: "油画" }, { en: "sketch", zh: "素描" },
        { en: "lineart", zh: "线稿" }, { en: "pixel_art", zh: "像素画" }, { en: "3d", zh: "3D渲染" }, { en: "traditional_media", zh: "传统媒介" } ] },
      { name: "流派", tags: [
        { en: "anime", zh: "动漫" }, { en: "realistic", zh: "写实" }, { en: "cyberpunk", zh: "赛博朋克" },
        { en: "steampunk", zh: "蒸汽朋克" }, { en: "ukiyo-e", zh: "浮世绘" }, { en: "art_nouveau", zh: "新艺术" },
        { en: "chibi", zh: "Q版" }, { en: "retro_artstyle", zh: "复古画风" } ] },
    ],
  },
  {
    name: "魔法奇幻",
    subgroups: [
      { name: "魔法", tags: [
        { en: "magic", zh: "魔法" }, { en: "magic_circle", zh: "魔法阵" }, { en: "aura", zh: "气场" },
        { en: "energy", zh: "能量" }, { en: "rune", zh: "符文" }, { en: "summoning", zh: "召唤" }, { en: "spell", zh: "法术" } ] },
      { name: "科幻", tags: [
        { en: "robot", zh: "机器人" }, { en: "mecha", zh: "机甲" }, { en: "spaceship", zh: "飞船" },
        { en: "neon_lights", zh: "霓虹灯" }, { en: "hologram", zh: "全息投影" }, { en: "cyborg", zh: "改造人" } ] },
    ],
  },
  {
    name: "反向提示词",
    subgroups: [
      { name: "常用负面", tags: [
        { en: "lowres", zh: "低分辨率" }, { en: "bad_anatomy", zh: "解剖错误" }, { en: "bad_hands", zh: "畸形手" },
        { en: "extra_digits", zh: "多余手指" }, { en: "fewer_digits", zh: "缺少手指" }, { en: "missing_fingers", zh: "缺指" },
        { en: "jpeg_artifacts", zh: "压缩失真" }, { en: "watermark", zh: "水印" }, { en: "signature", zh: "签名" },
        { en: "blurry", zh: "模糊" }, { en: "worst_quality", zh: "最差质量" }, { en: "low_quality", zh: "低质量" },
        { en: "bad_proportions", zh: "比例错误" }, { en: "extra_limbs", zh: "多余肢体" }, { en: "text", zh: "文字乱入" } ] },
    ],
  },
];

// Final 灵感胶囊 taxonomy = curated builtin (accurate categories) + the large
// authored library, merged by category/subgroup and de-duplicated by tag.
export const CAPSULE_TAXONOMY: CapsuleCategory[] = [CAPSULE_EXTRA, CAPSULE_EXTRA2, CAPSULE_EXTRA3].reduce(
  (acc, batch) => mergeCapsules(acc, batch),
  CAPSULE_BUILTIN,
);
