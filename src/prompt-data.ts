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
export interface CapsuleTag {
  en: string; // Danbooru/NovelAI tag inserted into the prompt
  zh: string; // Chinese label shown on the chip
}
export interface CapsuleSubgroup {
  name: string; // Chinese subgroup label (e.g. 对象)
  tags: CapsuleTag[];
}
export interface CapsuleCategory {
  name: string; // Chinese category label (e.g. 人物)
  subgroups: CapsuleSubgroup[];
}

export const CAPSULE_TAXONOMY: CapsuleCategory[] = [
  {
    name: "人物",
    subgroups: [
      {
        name: "对象",
        tags: [
          { en: "1girl", zh: "1女孩" },
          { en: "1boy", zh: "1男孩" },
          { en: "2girls", zh: "2女孩" },
          { en: "solo", zh: "单人" },
          { en: "multiple_girls", zh: "多个女孩" },
          { en: "couple", zh: "情侣" },
        ],
      },
      {
        name: "身份",
        tags: [
          { en: "loli", zh: "萝莉" },
          { en: "shota", zh: "正太" },
          { en: "maid", zh: "女仆" },
          { en: "nun", zh: "修女" },
          { en: "witch", zh: "女巫" },
          { en: "knight", zh: "骑士" },
          { en: "idol", zh: "偶像" },
        ],
      },
      {
        name: "头发",
        tags: [
          { en: "long_hair", zh: "长发" },
          { en: "short_hair", zh: "短发" },
          { en: "twintails", zh: "双马尾" },
          { en: "ponytail", zh: "马尾" },
          { en: "blonde_hair", zh: "金发" },
          { en: "black_hair", zh: "黑发" },
          { en: "blue_hair", zh: "蓝发" },
          { en: "white_hair", zh: "白发" },
        ],
      },
      {
        name: "眼睛",
        tags: [
          { en: "blue_eyes", zh: "蓝眼" },
          { en: "red_eyes", zh: "红眼" },
          { en: "green_eyes", zh: "绿眼" },
          { en: "yellow_eyes", zh: "黄眼" },
          { en: "heterochromia", zh: "异色瞳" },
        ],
      },
    ],
  },
  {
    name: "服饰",
    subgroups: [
      {
        name: "套装",
        tags: [
          { en: "school_uniform", zh: "校服" },
          { en: "dress", zh: "连衣裙" },
          { en: "kimono", zh: "和服" },
          { en: "swimsuit", zh: "泳装" },
          { en: "suit", zh: "西装" },
          { en: "hoodie", zh: "连帽衫" },
        ],
      },
      {
        name: "配饰",
        tags: [
          { en: "glasses", zh: "眼镜" },
          { en: "hair_ornament", zh: "发饰" },
          { en: "ribbon", zh: "丝带" },
          { en: "necklace", zh: "项链" },
          { en: "gloves", zh: "手套" },
        ],
      },
    ],
  },
  {
    name: "表情动作",
    subgroups: [
      {
        name: "表情",
        tags: [
          { en: "smile", zh: "微笑" },
          { en: "open_mouth", zh: "张嘴" },
          { en: "blush", zh: "脸红" },
          { en: "crying", zh: "哭泣" },
          { en: "angry", zh: "生气" },
          { en: "expressionless", zh: "面无表情" },
        ],
      },
      {
        name: "动作",
        tags: [
          { en: "looking_at_viewer", zh: "看向观众" },
          { en: "standing", zh: "站立" },
          { en: "sitting", zh: "坐姿" },
          { en: "lying", zh: "躺卧" },
          { en: "running", zh: "奔跑" },
          { en: "waving", zh: "挥手" },
        ],
      },
    ],
  },
  {
    name: "画面",
    subgroups: [
      {
        // NovelAI docs use these composition terms in their examples.
        name: "构图",
        tags: [
          { en: "full_body", zh: "全身" },
          { en: "upper_body", zh: "上半身" },
          { en: "portrait", zh: "肖像" },
          { en: "close-up", zh: "特写" },
          { en: "from_above", zh: "俯视" },
          { en: "from_below", zh: "仰视" },
          { en: "dutch_angle", zh: "倾斜构图" },
          { en: "wide_shot", zh: "远景" },
        ],
      },
      {
        name: "光影",
        tags: [
          { en: "cinematic_lighting", zh: "电影光" },
          { en: "backlighting", zh: "逆光" },
          { en: "rim_lighting", zh: "轮廓光" },
          { en: "dappled_sunlight", zh: "斑驳阳光" },
          { en: "god_rays", zh: "丁达尔光" },
        ],
      },
    ],
  },
  {
    name: "环境",
    subgroups: [
      {
        name: "时间天气",
        tags: [
          { en: "day", zh: "白天" },
          { en: "night", zh: "夜晚" },
          { en: "sunset", zh: "日落" },
          { en: "rain", zh: "雨" },
          { en: "snow", zh: "雪" },
          { en: "starry_sky", zh: "星空" },
        ],
      },
      {
        name: "场景",
        tags: [
          { en: "outdoors", zh: "户外" },
          { en: "indoors", zh: "室内" },
          { en: "city", zh: "城市" },
          { en: "forest", zh: "森林" },
          { en: "beach", zh: "海滩" },
          { en: "classroom", zh: "教室" },
        ],
      },
    ],
  },
  {
    name: "风格画风",
    subgroups: [
      {
        name: "媒介",
        tags: [
          { en: "watercolor_(medium)", zh: "水彩" },
          { en: "oil_painting_(medium)", zh: "油画" },
          { en: "sketch", zh: "素描" },
          { en: "pixel_art", zh: "像素画" },
          { en: "3d", zh: "3D 渲染" },
          { en: "lineart", zh: "线稿" },
        ],
      },
      {
        name: "流派",
        tags: [
          { en: "anime", zh: "动漫" },
          { en: "realistic", zh: "写实" },
          { en: "cyberpunk", zh: "赛博朋克" },
          { en: "steampunk", zh: "蒸汽朋克" },
          { en: "ukiyo-e", zh: "浮世绘" },
          { en: "art_nouveau", zh: "新艺术" },
          { en: "chibi", zh: "Q版" },
        ],
      },
    ],
  },
  {
    name: "镜头视角",
    subgroups: [
      {
        name: "景别",
        tags: [
          { en: "extreme_closeup", zh: "大特写" },
          { en: "cowboy_shot", zh: "七分身" },
          { en: "full_body", zh: "全身" },
          { en: "wide_shot", zh: "远景" },
          { en: "panorama", zh: "全景" },
        ],
      },
      {
        name: "视角",
        tags: [
          { en: "profile", zh: "侧脸" },
          { en: "three-quarter_view", zh: "四分之三视角" },
          { en: "pov", zh: "第一人称视角" },
          { en: "from_side", zh: "侧面" },
          { en: "looking_back", zh: "回眸" },
        ],
      },
    ],
  },
  {
    name: "色彩",
    subgroups: [
      {
        name: "色调",
        tags: [
          { en: "monochrome", zh: "单色" },
          { en: "pastel_colors", zh: "粉彩色" },
          { en: "vivid_colors", zh: "鲜艳色" },
          { en: "muted_color", zh: "低饱和" },
          { en: "limited_palette", zh: "有限配色" },
          { en: "gradient", zh: "渐变" },
        ],
      },
    ],
  },
  {
    name: "光效特效",
    subgroups: [
      {
        name: "光",
        tags: [
          { en: "lens_flare", zh: "镜头光晕" },
          { en: "volumetric_lighting", zh: "体积光" },
          { en: "bloom", zh: "泛光" },
          { en: "bioluminescence", zh: "生物荧光" },
        ],
      },
      {
        name: "特效",
        tags: [
          { en: "depth_of_field", zh: "景深" },
          { en: "bokeh", zh: "背景虚化" },
          { en: "motion_blur", zh: "动态模糊" },
          { en: "sparkle", zh: "闪光粒子" },
          { en: "glowing", zh: "发光" },
        ],
      },
    ],
  },
  {
    name: "生物",
    subgroups: [
      {
        name: "动物",
        tags: [
          { en: "cat", zh: "猫" },
          { en: "dog", zh: "狗" },
          { en: "bird", zh: "鸟" },
          { en: "fox", zh: "狐狸" },
          { en: "horse", zh: "马" },
        ],
      },
      {
        name: "幻想生物",
        tags: [
          { en: "dragon", zh: "龙" },
          { en: "fairy", zh: "妖精" },
          { en: "mermaid", zh: "美人鱼" },
          { en: "angel", zh: "天使" },
          { en: "demon", zh: "恶魔" },
        ],
      },
    ],
  },
  {
    name: "道具",
    subgroups: [
      {
        name: "武器",
        tags: [
          { en: "sword", zh: "剑" },
          { en: "gun", zh: "枪" },
          { en: "bow_(weapon)", zh: "弓" },
          { en: "katana", zh: "武士刀" },
          { en: "staff", zh: "法杖" },
        ],
      },
      {
        name: "物品",
        tags: [
          { en: "book", zh: "书" },
          { en: "flower", zh: "花" },
          { en: "umbrella", zh: "伞" },
          { en: "cup", zh: "杯子" },
          { en: "smartphone", zh: "手机" },
        ],
      },
    ],
  },
  {
    name: "氛围",
    subgroups: [
      {
        name: "情绪氛围",
        tags: [
          { en: "serene", zh: "宁静" },
          { en: "dramatic", zh: "戏剧化" },
          { en: "melancholic", zh: "忧郁" },
          { en: "cheerful", zh: "欢快" },
          { en: "dreamy", zh: "梦幻" },
          { en: "ethereal", zh: "空灵" },
        ],
      },
    ],
  },
  {
    name: "奇幻科幻",
    subgroups: [
      {
        name: "奇幻",
        tags: [
          { en: "magic", zh: "魔法" },
          { en: "castle", zh: "城堡" },
          { en: "elf", zh: "精灵" },
          { en: "floating_island", zh: "浮空岛" },
          { en: "rune", zh: "符文" },
        ],
      },
      {
        name: "科幻",
        tags: [
          { en: "robot", zh: "机器人" },
          { en: "mecha", zh: "机甲" },
          { en: "spaceship", zh: "飞船" },
          { en: "neon_lights", zh: "霓虹灯" },
          { en: "hologram", zh: "全息投影" },
        ],
      },
    ],
  },
  {
    name: "质量修饰",
    subgroups: [
      {
        // Official NovelAI quality tags (from the docs' quality-tags guidance).
        name: "官方质量词",
        tags: [
          { en: "very aesthetic", zh: "高审美" },
          { en: "masterpiece", zh: "杰作" },
          { en: "best quality", zh: "最佳质量" },
          { en: "absurdres", zh: "超高分辨率" },
          { en: "very detailed", zh: "高细节" },
          { en: "official art", zh: "官方画风" },
        ],
      },
    ],
  },
  {
    name: "反向提示词",
    subgroups: [
      {
        name: "常用负面",
        tags: [
          { en: "lowres", zh: "低分辨率" },
          { en: "bad anatomy", zh: "解剖错误" },
          { en: "bad hands", zh: "畸形手" },
          { en: "extra digits", zh: "多余手指" },
          { en: "jpeg artifacts", zh: "压缩失真" },
          { en: "watermark", zh: "水印" },
          { en: "blurry", zh: "模糊" },
        ],
      },
    ],
  },
];

// ── 灵感胶囊精细分类（seed → 本地标签库）────────────────────────────────────────
// Fine-grained capsule taxonomy modelled on the reference UI: each category has
// many subgroups, and each subgroup carries English "seed" keywords. The capsule
// substring-searches the LOCAL Danbooru library for those seeds and shows every
// matching tag (with Chinese) sorted by post-count — so a single 头发 subgroup
// yields hundreds of real hair tags instead of a handful of hardcoded ones.
export interface CapsuleSeedGroup {
  name: string;        // Chinese subgroup label
  seeds: string[];     // English substring seeds matched against danbooru tag names
}
export interface CapsuleSeedCategory {
  name: string;
  subgroups: CapsuleSeedGroup[];
}

export const CAPSULE_GROUPS: CapsuleSeedCategory[] = [
  {
    name: "人物",
    subgroups: [
      { name: "对象", seeds: ["1girl", "2girls", "1boy", "solo", "multiple_girls", "multiple_boys", "couple"] },
      { name: "身份", seeds: ["maid", "nun", "witch", "idol", "nurse", "police", "knight", "samurai", "ninja", "teacher", "student"] },
      { name: "二次元角色", seeds: ["girl", "boy", "loli", "shota", "kemonomimi", "monster_girl"] },
      { name: "年龄", seeds: ["loli", "shota", "mature", "milf", "old", "child", "aged", "teenage"] },
      { name: "皮肤", seeds: ["skin", "tan", "dark_skin", "pale", "freckles"] },
      { name: "身材", seeds: ["breasts", "muscular", "curvy", "plump", "thin", "tall", "petite", "abs", "wide_hips"] },
      { name: "脸型", seeds: ["face", "cheek", "jaw", "chin", "facial"] },
      { name: "头发", seeds: ["hair", "bangs", "ponytail", "twintails", "braid", "bun"] },
      { name: "眼睛", seeds: ["eyes", "eyelashes", "eyeshadow", "heterochromia"] },
      { name: "瞳孔", seeds: ["pupils", "pupil"] },
      { name: "耳朵", seeds: ["ears", "earrings"] },
      { name: "眉毛", seeds: ["eyebrows", "eyebrow"] },
      { name: "鼻子", seeds: ["nose"] },
      { name: "嘴巴", seeds: ["mouth", "lips", "teeth", "tongue", "fang"] },
      { name: "指甲", seeds: ["nails", "nail_polish"] },
      { name: "胸部", seeds: ["breasts", "cleavage", "chest"] },
      { name: "腰腹", seeds: ["waist", "navel", "stomach", "hips"] },
      { name: "翅膀尾巴", seeds: ["wings", "tail", "halo", "horns"] },
    ],
  },
  {
    name: "服饰",
    subgroups: [
      { name: "上衣", seeds: ["shirt", "jacket", "coat", "sweater", "hoodie", "blouse", "vest", "top"] },
      { name: "下装", seeds: ["skirt", "pants", "shorts", "trousers", "jeans"] },
      { name: "连衣裙", seeds: ["dress", "gown"] },
      { name: "制服", seeds: ["uniform", "school_uniform", "military_uniform", "serafuku"] },
      { name: "泳装内衣", seeds: ["swimsuit", "bikini", "underwear", "bra", "panties", "lingerie", "leotard"] },
      { name: "鞋袜", seeds: ["shoes", "boots", "socks", "thighhighs", "sandals", "heels", "pantyhose"] },
      { name: "头饰", seeds: ["hat", "headwear", "hair_ornament", "ribbon", "headband", "helmet", "hairclip", "crown"] },
      { name: "配饰", seeds: ["glasses", "gloves", "necklace", "earrings", "scarf", "jewelry", "choker", "bracelet", "belt"] },
      { name: "和风汉服", seeds: ["kimono", "yukata", "hakama", "japanese_clothes", "hanfu", "qipao"] },
    ],
  },
  {
    name: "表情动作",
    subgroups: [
      { name: "表情", seeds: ["smile", "blush", "crying", "angry", "surprised", "grin", "pout", "expressionless", "smug"] },
      { name: "视线", seeds: ["looking_at_viewer", "looking_back", "looking_away", "eye_contact"] },
      { name: "姿势", seeds: ["standing", "sitting", "lying", "kneeling", "squatting", "pose", "crossed_legs", "arms_up"] },
      { name: "手势", seeds: ["hand", "fingers", "peace_sign", "waving", "pointing", "thumbs_up"] },
      { name: "动作", seeds: ["holding", "running", "jumping", "dancing", "walking", "hugging"] },
    ],
  },
  {
    name: "画面",
    subgroups: [
      { name: "构图", seeds: ["close-up", "portrait", "full_body", "upper_body", "cowboy_shot", "wide_shot", "cropped"] },
      { name: "视角", seeds: ["from_above", "from_below", "from_side", "from_behind", "dutch_angle", "pov", "profile"] },
      { name: "光影", seeds: ["lighting", "backlighting", "shadow", "sunlight", "rim_light", "bloom"] },
      { name: "画质", seeds: ["highres", "detailed", "masterpiece", "absurdres", "quality"] },
    ],
  },
  {
    name: "环境",
    subgroups: [
      { name: "天气", seeds: ["rain", "snow", "cloud", "sunny", "fog", "storm", "rainbow"] },
      { name: "时间", seeds: ["day", "night", "sunset", "morning", "evening", "dusk", "twilight"] },
      { name: "自然", seeds: ["sky", "tree", "flower", "mountain", "ocean", "forest", "grass", "water", "star"] },
    ],
  },
  {
    name: "场景",
    subgroups: [
      { name: "室内", seeds: ["room", "indoors", "classroom", "kitchen", "bedroom", "bathroom", "cafe", "library"] },
      { name: "室外", seeds: ["outdoors", "city", "street", "building", "park", "beach", "garden", "rooftop"] },
      { name: "幻想", seeds: ["castle", "ruins", "fantasy", "temple", "shrine", "dungeon"] },
    ],
  },
  {
    name: "物品",
    subgroups: [
      { name: "武器", seeds: ["sword", "gun", "weapon", "bow", "knife", "staff", "spear", "shield", "katana"] },
      { name: "食物", seeds: ["food", "cake", "fruit", "drink", "candy", "ice_cream", "coffee"] },
      { name: "日常", seeds: ["book", "phone", "umbrella", "bag", "cup", "flower", "balloon", "stuffed_toy"] },
      { name: "乐器", seeds: ["instrument", "guitar", "piano", "violin", "drum"] },
    ],
  },
  {
    name: "镜头特效",
    subgroups: [
      { name: "景别", seeds: ["close-up", "wide_shot", "full_body", "portrait", "panorama"] },
      { name: "特效", seeds: ["depth_of_field", "blurry", "bokeh", "motion_blur", "lens_flare", "chromatic_aberration"] },
    ],
  },
  {
    name: "魔法系",
    subgroups: [
      { name: "魔法", seeds: ["magic", "spell", "glowing", "aura", "rune", "summoning", "energy"] },
      { name: "生物", seeds: ["dragon", "fairy", "angel", "demon", "mermaid", "elf", "monster", "slime"] },
    ],
  },
];
