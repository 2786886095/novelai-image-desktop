// Offline Chinese -> Danbooru tag dictionary powering the 灵感胶囊 (inspiration
// capsule) autocomplete when no semantic tag server is configured. Each entry
// carries Chinese keywords so typing 中文 (e.g. "蓝眼") resolves to the English
// Danbooru tag. category: 0=general 1=artist 3=copyright 4=character 5=meta.

export interface DictEntry {
  tag: string;
  count: number;
  category: number;
  zh: string; // primary Chinese label (shown as description)
  keywords?: string[]; // extra Chinese synonyms to match against
  aliases?: string[]; // extra English synonyms to match against
}

export const TAG_DICTIONARY: DictEntry[] = [
  // ── 人数 / 主体 ───────────────────────────────────────────────
  { tag: "1girl", count: 19_000_000, category: 0, zh: "一个女孩", keywords: ["女孩", "少女", "单女", "一个女生", "妹子"], aliases: ["girl"] },
  { tag: "2girls", count: 1_500_000, category: 0, zh: "两个女孩", keywords: ["两个女孩", "双女"] },
  { tag: "1boy", count: 8_000_000, category: 0, zh: "一个男孩", keywords: ["男孩", "少年", "单男", "一个男生"], aliases: ["boy"] },
  { tag: "solo", count: 13_000_000, category: 0, zh: "单人画面", keywords: ["单人", "一个人", "独自"] },
  { tag: "multiple girls", count: 1_900_000, category: 0, zh: "多个女孩", keywords: ["多个女孩", "群女"], aliases: ["multiple_girls"] },
  { tag: "couple", count: 180_000, category: 0, zh: "情侣", keywords: ["情侣", "一对"] },

  // ── 发型 / 发色 ───────────────────────────────────────────────
  { tag: "long hair", count: 6_800_000, category: 0, zh: "长发", keywords: ["长发", "长头发"], aliases: ["long_hair"] },
  { tag: "short hair", count: 5_400_000, category: 0, zh: "短发", keywords: ["短发", "短头发"], aliases: ["short_hair"] },
  { tag: "twintails", count: 1_300_000, category: 0, zh: "双马尾", keywords: ["双马尾", "双尾"] },
  { tag: "ponytail", count: 900_000, category: 0, zh: "马尾", keywords: ["马尾", "单马尾"] },
  { tag: "ponytail", count: 900_000, category: 0, zh: "马尾辫", keywords: ["马尾辫"] },
  { tag: "braid", count: 700_000, category: 0, zh: "辫子", keywords: ["辫子", "麻花辫"] },
  { tag: "blonde hair", count: 1_100_000, category: 0, zh: "金发", keywords: ["金发", "金色头发", "黄发"], aliases: ["blonde_hair", "golden hair"] },
  { tag: "black hair", count: 3_600_000, category: 0, zh: "黑发", keywords: ["黑发", "黑色头发"], aliases: ["black_hair"] },
  { tag: "white hair", count: 2_100_000, category: 0, zh: "白发", keywords: ["白发", "白色头发", "银白发"], aliases: ["white_hair"] },
  { tag: "silver hair", count: 500_000, category: 0, zh: "银发", keywords: ["银发", "银色头发"], aliases: ["silver_hair"] },
  { tag: "blue hair", count: 1_800_000, category: 0, zh: "蓝发", keywords: ["蓝发", "蓝色头发"], aliases: ["blue_hair"] },
  { tag: "red hair", count: 1_200_000, category: 0, zh: "红发", keywords: ["红发", "红色头发"], aliases: ["red_hair"] },
  { tag: "pink hair", count: 1_200_000, category: 0, zh: "粉发", keywords: ["粉发", "粉色头发", "粉红头发"], aliases: ["pink_hair"] },
  { tag: "green hair", count: 820_000, category: 0, zh: "绿发", keywords: ["绿发", "绿色头发"], aliases: ["green_hair"] },
  { tag: "purple hair", count: 800_000, category: 0, zh: "紫发", keywords: ["紫发", "紫色头发"], aliases: ["purple_hair"] },
  { tag: "brown hair", count: 3_000_000, category: 0, zh: "棕发", keywords: ["棕发", "棕色头发", "褐发"], aliases: ["brown_hair"] },

  // ── 眼睛 ─────────────────────────────────────────────────────
  { tag: "blue eyes", count: 3_900_000, category: 0, zh: "蓝眼睛", keywords: ["蓝眼", "蓝眼睛", "蓝色眼睛"], aliases: ["blue_eyes"] },
  { tag: "red eyes", count: 1_700_000, category: 0, zh: "红眼睛", keywords: ["红眼", "红眼睛", "红色眼睛"], aliases: ["red_eyes"] },
  { tag: "green eyes", count: 622_800, category: 0, zh: "绿眼睛", keywords: ["绿眼", "绿眼睛"], aliases: ["green_eyes"] },
  { tag: "yellow eyes", count: 496_800, category: 0, zh: "黄眼睛", keywords: ["黄眼", "金色眼睛", "金瞳"], aliases: ["yellow_eyes"] },
  { tag: "purple eyes", count: 700_000, category: 0, zh: "紫眼睛", keywords: ["紫眼", "紫瞳"], aliases: ["purple_eyes"] },
  { tag: "heterochromia", count: 250_000, category: 0, zh: "异色瞳", keywords: ["异色瞳", "异瞳", "鸳鸯眼"] },

  // ── 表情 ─────────────────────────────────────────────────────
  { tag: "smile", count: 3_200_000, category: 0, zh: "微笑", keywords: ["微笑", "笑", "笑容"] },
  { tag: "open mouth", count: 2_200_000, category: 0, zh: "张嘴", keywords: ["张嘴", "张开嘴"], aliases: ["open_mouth"] },
  { tag: "blush", count: 2_400_000, category: 0, zh: "脸红", keywords: ["脸红", "害羞", "红脸"] },
  { tag: "crying", count: 200_000, category: 0, zh: "哭泣", keywords: ["哭", "哭泣", "流泪"] },
  { tag: "angry", count: 120_000, category: 0, zh: "生气", keywords: ["生气", "愤怒", "发怒"] },
  { tag: "expressionless", count: 200_000, category: 0, zh: "面无表情", keywords: ["面无表情", "无表情", "冷漠"] },

  // ── 服装 ─────────────────────────────────────────────────────
  { tag: "dress", count: 2_600_000, category: 0, zh: "连衣裙", keywords: ["连衣裙", "裙子", "礼服"] },
  { tag: "white dress", count: 410_000, category: 0, zh: "白色连衣裙", keywords: ["白色连衣裙", "白裙"], aliases: ["white_dress"] },
  { tag: "school uniform", count: 1_500_000, category: 0, zh: "校服", keywords: ["校服", "学生制服"], aliases: ["school_uniform"] },
  { tag: "serafuku", count: 600_000, category: 0, zh: "水手服", keywords: ["水手服", "海军服"], aliases: ["sailor uniform"] },
  { tag: "skirt", count: 2_300_000, category: 0, zh: "裙子", keywords: ["裙子", "短裙"] },
  { tag: "thighhighs", count: 1_900_000, category: 0, zh: "过膝袜", keywords: ["过膝袜", "大腿袜", "长筒袜"] },
  { tag: "swimsuit", count: 900_000, category: 0, zh: "泳装", keywords: ["泳装", "泳衣"] },
  { tag: "bikini", count: 800_000, category: 0, zh: "比基尼", keywords: ["比基尼"] },
  { tag: "kimono", count: 400_000, category: 0, zh: "和服", keywords: ["和服", "浴衣"] },
  { tag: "hoodie", count: 300_000, category: 0, zh: "卫衣", keywords: ["卫衣", "连帽衫"] },
  { tag: "gloves", count: 959_100, category: 0, zh: "手套", keywords: ["手套"] },
  { tag: "maid", count: 500_000, category: 0, zh: "女仆", keywords: ["女仆", "女仆装"] },
  { tag: "armor", count: 350_000, category: 0, zh: "盔甲", keywords: ["盔甲", "铠甲", "护甲"] },

  // ── 配饰 ─────────────────────────────────────────────────────
  { tag: "hair ornament", count: 1_200_000, category: 0, zh: "发饰", keywords: ["发饰", "发夹", "发卡"], aliases: ["hair_ornament"] },
  { tag: "ribbon", count: 1_000_000, category: 0, zh: "丝带", keywords: ["丝带", "缎带", "蝴蝶结"] },
  { tag: "glasses", count: 700_000, category: 0, zh: "眼镜", keywords: ["眼镜"] },
  { tag: "hat", count: 1_100_000, category: 0, zh: "帽子", keywords: ["帽子"] },
  { tag: "earrings", count: 378_700, category: 0, zh: "耳环", keywords: ["耳环", "耳钉"] },
  { tag: "cat ears", count: 700_000, category: 0, zh: "猫耳", keywords: ["猫耳", "猫耳朵"], aliases: ["cat_ears", "nekomimi"] },
  { tag: "animal ears", count: 1_300_000, category: 0, zh: "兽耳", keywords: ["兽耳", "动物耳朵"], aliases: ["animal_ears"] },
  { tag: "halo", count: 250_000, category: 0, zh: "光环", keywords: ["光环", "头环"] },
  { tag: "wings", count: 600_000, category: 0, zh: "翅膀", keywords: ["翅膀", "羽翼"] },

  // ── 姿势 / 构图 ───────────────────────────────────────────────
  { tag: "looking at viewer", count: 4_400_000, category: 0, zh: "看向观众", keywords: ["看向镜头", "看镜头", "正视", "看向观众"], aliases: ["looking_at_viewer"] },
  { tag: "sitting", count: 1_500_000, category: 0, zh: "坐着", keywords: ["坐", "坐着", "坐姿"] },
  { tag: "standing", count: 1_200_000, category: 0, zh: "站立", keywords: ["站", "站立", "站姿"] },
  { tag: "lying", count: 500_000, category: 0, zh: "躺着", keywords: ["躺", "躺着", "卧"] },
  { tag: "full body", count: 1_400_000, category: 0, zh: "全身", keywords: ["全身", "全身像"], aliases: ["full_body"] },
  { tag: "upper body", count: 2_000_000, category: 0, zh: "上半身", keywords: ["上半身", "半身"], aliases: ["upper_body"] },
  { tag: "portrait", count: 400_000, category: 0, zh: "肖像", keywords: ["肖像", "头像", "特写"] },
  { tag: "from above", count: 400_000, category: 0, zh: "俯视", keywords: ["俯视", "从上往下"], aliases: ["from_above"] },
  { tag: "from below", count: 350_000, category: 0, zh: "仰视", keywords: ["仰视", "从下往上"], aliases: ["from_below"] },
  { tag: "cowboy shot", count: 600_000, category: 0, zh: "七分身", keywords: ["七分身", "及膝构图"], aliases: ["cowboy_shot"] },

  // ── 背景 / 场景 ───────────────────────────────────────────────
  { tag: "simple background", count: 1_100_000, category: 0, zh: "简单背景", keywords: ["简单背景", "纯色背景"], aliases: ["simple_background"] },
  { tag: "white background", count: 1_400_000, category: 0, zh: "白色背景", keywords: ["白色背景", "白底"], aliases: ["white_background"] },
  { tag: "outdoors", count: 1_600_000, category: 0, zh: "户外", keywords: ["户外", "室外"] },
  { tag: "indoors", count: 500_000, category: 0, zh: "室内", keywords: ["室内", "屋内"] },
  { tag: "night", count: 780_000, category: 0, zh: "夜晚", keywords: ["夜晚", "夜里", "晚上", "黑夜"] },
  { tag: "sky", count: 1_200_000, category: 0, zh: "天空", keywords: ["天空"] },
  { tag: "cloud", count: 700_000, category: 0, zh: "云", keywords: ["云", "云朵"] },
  { tag: "city", count: 710_000, category: 0, zh: "城市", keywords: ["城市", "都市"] },
  { tag: "cherry blossoms", count: 350_000, category: 0, zh: "樱花", keywords: ["樱花", "樱花树"], aliases: ["cherry_blossoms"] },
  { tag: "ocean", count: 400_000, category: 0, zh: "海洋", keywords: ["海", "海洋", "大海"] },
  { tag: "forest", count: 300_000, category: 0, zh: "森林", keywords: ["森林", "树林"] },
  { tag: "rain", count: 250_000, category: 0, zh: "雨", keywords: ["雨", "下雨", "雨天"] },
  { tag: "snow", count: 300_000, category: 0, zh: "雪", keywords: ["雪", "下雪", "雪天"] },

  // ── 光照 / 风格 ───────────────────────────────────────────────
  { tag: "sunlight", count: 300_000, category: 0, zh: "阳光", keywords: ["阳光", "日光", "光照"] },
  { tag: "backlighting", count: 150_000, category: 0, zh: "逆光", keywords: ["逆光", "背光"] },
  { tag: "depth of field", count: 400_000, category: 0, zh: "景深", keywords: ["景深", "虚化"], aliases: ["depth_of_field"] },
  { tag: "chibi", count: 350_000, category: 0, zh: "Q版", keywords: ["q版", "Q版", "迷你", "可爱版"] },

  // ── 质量 / Meta ───────────────────────────────────────────────
  { tag: "masterpiece", count: 5_000_000, category: 5, zh: "杰作（质量词）", keywords: ["杰作", "高质量", "精品"] },
  { tag: "best quality", count: 4_800_000, category: 5, zh: "最佳质量", keywords: ["最佳质量", "高画质"], aliases: ["best_quality"] },
  { tag: "very aesthetic", count: 900_000, category: 5, zh: "高审美", keywords: ["高审美", "美感"], aliases: ["very_aesthetic"] },
  { tag: "absurdres", count: 1_200_000, category: 5, zh: "超高分辨率", keywords: ["超高分辨率", "高清"] },
  { tag: "official art", count: 200_000, category: 5, zh: "官方插画", keywords: ["官方插画", "官图"], aliases: ["official_art"] },

  // ── 扩充：发型细节 ───────────────────────────────────────────────
  { tag: "bangs", count: 2_000_000, category: 0, zh: "刘海", keywords: ["刘海", "齐刘海"] },
  { tag: "hair between eyes", count: 1_500_000, category: 0, zh: "碎发", keywords: ["碎发", "中分碎发"], aliases: ["hair_between_eyes"] },
  { tag: "very long hair", count: 1_600_000, category: 0, zh: "超长发", keywords: ["超长发", "极长发"], aliases: ["very_long_hair"] },
  { tag: "messy hair", count: 300_000, category: 0, zh: "凌乱头发", keywords: ["凌乱头发", "乱发"], aliases: ["messy_hair"] },
  { tag: "wavy hair", count: 250_000, category: 0, zh: "波浪发", keywords: ["波浪发", "卷发"], aliases: ["wavy_hair"] },
  { tag: "double bun", count: 200_000, category: 0, zh: "双丸子头", keywords: ["双丸子头", "包包头"], aliases: ["double_bun"] },
  { tag: "hime cut", count: 120_000, category: 0, zh: "公主切", keywords: ["公主切"], aliases: ["hime_cut"] },

  // ── 扩充：身体 / 特征 ─────────────────────────────────────────────
  { tag: "fang", count: 500_000, category: 0, zh: "虎牙", keywords: ["虎牙", "尖牙"] },
  { tag: "pointy ears", count: 400_000, category: 0, zh: "尖耳朵", keywords: ["尖耳朵", "精灵耳"], aliases: ["pointy_ears"] },
  { tag: "tail", count: 1_200_000, category: 0, zh: "尾巴", keywords: ["尾巴"] },
  { tag: "horns", count: 600_000, category: 0, zh: "角", keywords: ["角", "犄角"] },
  { tag: "freckles", count: 150_000, category: 0, zh: "雀斑", keywords: ["雀斑"] },
  { tag: "mole under eye", count: 200_000, category: 0, zh: "泪痣", keywords: ["泪痣", "眼下痣"], aliases: ["mole_under_eye"] },

  // ── 扩充：服装细节 ───────────────────────────────────────────────
  { tag: "necktie", count: 700_000, category: 0, zh: "领带", keywords: ["领带"] },
  { tag: "pleated skirt", count: 800_000, category: 0, zh: "百褶裙", keywords: ["百褶裙"], aliases: ["pleated_skirt"] },
  { tag: "apron", count: 300_000, category: 0, zh: "围裙", keywords: ["围裙"] },
  { tag: "frills", count: 600_000, category: 0, zh: "褶边", keywords: ["褶边", "荷叶边"] },
  { tag: "jacket", count: 1_000_000, category: 0, zh: "夹克", keywords: ["夹克", "外套"] },
  { tag: "coat", count: 500_000, category: 0, zh: "大衣", keywords: ["大衣", "风衣"] },
  { tag: "sweater", count: 400_000, category: 0, zh: "毛衣", keywords: ["毛衣", "针织衫"] },
  { tag: "shorts", count: 600_000, category: 0, zh: "短裤", keywords: ["短裤"] },
  { tag: "pantyhose", count: 700_000, category: 0, zh: "连裤袜", keywords: ["连裤袜", "丝袜"] },
  { tag: "bare shoulders", count: 1_100_000, category: 0, zh: "露肩", keywords: ["露肩", "裸肩"], aliases: ["bare_shoulders"] },
  { tag: "off shoulder", count: 500_000, category: 0, zh: "一字肩", keywords: ["一字肩", "落肩"], aliases: ["off_shoulder"] },

  // ── 扩充：姿势 / 动作 ─────────────────────────────────────────────
  { tag: "arms up", count: 250_000, category: 0, zh: "举手", keywords: ["举手", "双手举起"], aliases: ["arms_up"] },
  { tag: "hand on hip", count: 200_000, category: 0, zh: "叉腰", keywords: ["叉腰", "手扶腰"], aliases: ["hand_on_hip"] },
  { tag: "kneeling", count: 200_000, category: 0, zh: "跪姿", keywords: ["跪", "跪着", "跪姿"] },
  { tag: "running", count: 120_000, category: 0, zh: "奔跑", keywords: ["跑", "奔跑"] },
  { tag: "looking back", count: 400_000, category: 0, zh: "回眸", keywords: ["回眸", "回头看"], aliases: ["looking_back"] },
  { tag: "outstretched hand", count: 150_000, category: 0, zh: "伸手", keywords: ["伸手", "伸出手"], aliases: ["outstretched_hand"] },

  // ── 扩充：场景 / 氛围 ─────────────────────────────────────────────
  { tag: "sunset", count: 350_000, category: 0, zh: "日落", keywords: ["日落", "夕阳", "黄昏"] },
  { tag: "starry sky", count: 300_000, category: 0, zh: "星空", keywords: ["星空", "繁星"], aliases: ["starry_sky"] },
  { tag: "moon", count: 500_000, category: 0, zh: "月亮", keywords: ["月亮", "月"] },
  { tag: "fireworks", count: 100_000, category: 0, zh: "烟花", keywords: ["烟花", "烟火"] },
  { tag: "petals", count: 400_000, category: 0, zh: "花瓣", keywords: ["花瓣", "飘落花瓣"] },
  { tag: "underwater", count: 150_000, category: 0, zh: "水下", keywords: ["水下", "水中"] },
  { tag: "classroom", count: 200_000, category: 0, zh: "教室", keywords: ["教室", "课室"] },
  { tag: "cafe", count: 80_000, category: 0, zh: "咖啡馆", keywords: ["咖啡馆", "咖啡厅"] },
  { tag: "bedroom", count: 200_000, category: 0, zh: "卧室", keywords: ["卧室", "房间"] },
  { tag: "neon lights", count: 120_000, category: 0, zh: "霓虹灯", keywords: ["霓虹灯", "霓虹"], aliases: ["neon_lights"] },

  // ── 扩充：光影 / 画风 ─────────────────────────────────────────────
  { tag: "cinematic lighting", count: 200_000, category: 0, zh: "电影感光照", keywords: ["电影感光照", "电影光"], aliases: ["cinematic_lighting"] },
  { tag: "rim lighting", count: 100_000, category: 0, zh: "轮廓光", keywords: ["轮廓光", "边缘光"], aliases: ["rim_lighting"] },
  { tag: "bloom", count: 150_000, category: 0, zh: "泛光", keywords: ["泛光", "辉光"] },
  { tag: "watercolor (medium)", count: 200_000, category: 0, zh: "水彩", keywords: ["水彩", "水彩画"], aliases: ["watercolor"] },
  { tag: "monochrome", count: 900_000, category: 0, zh: "单色", keywords: ["单色", "黑白"] },
  { tag: "lineart", count: 200_000, category: 0, zh: "线稿", keywords: ["线稿", "线条画"] },
];
