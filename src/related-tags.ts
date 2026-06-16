// Curated Danbooru tag co-occurrence ("people who used X also used...") to power
// the 灵感胶囊 related-tag recommendations. Keys are normalized (lowercase,
// spaces) anchor tags; values are tags that frequently appear alongside them.

export interface RelatedTag {
  tag: string;
  zh: string;
}

const CO_OCCURRENCE: Record<string, RelatedTag[]> = {
  maid: [
    { tag: "apron", zh: "围裙" },
    { tag: "maid headdress", zh: "女仆头饰" },
    { tag: "frills", zh: "褶边" },
    { tag: "white thighhighs", zh: "白色过膝袜" },
    { tag: "wrist cuffs", zh: "腕饰" },
  ],
  "cat ears": [
    { tag: "cat tail", zh: "猫尾" },
    { tag: "animal ear fluff", zh: "兽耳绒毛" },
    { tag: "cat girl", zh: "猫娘" },
    { tag: "paw pose", zh: "爪子手势" },
    { tag: "fang", zh: "虎牙" },
  ],
  "school uniform": [
    { tag: "serafuku", zh: "水手服" },
    { tag: "pleated skirt", zh: "百褶裙" },
    { tag: "classroom", zh: "教室" },
    { tag: "necktie", zh: "领带" },
    { tag: "kneehighs", zh: "及膝袜" },
  ],
  kimono: [
    { tag: "obi", zh: "腰带" },
    { tag: "floral print", zh: "花纹" },
    { tag: "hair flower", zh: "发花" },
    { tag: "wide sleeves", zh: "宽袖" },
    { tag: "sandals", zh: "木屐" },
  ],
  swimsuit: [
    { tag: "bikini", zh: "比基尼" },
    { tag: "beach", zh: "海滩" },
    { tag: "ocean", zh: "海洋" },
    { tag: "wet", zh: "湿身" },
    { tag: "navel", zh: "肚脐" },
  ],
  armor: [
    { tag: "sword", zh: "剑" },
    { tag: "knight", zh: "骑士" },
    { tag: "cape", zh: "披风" },
    { tag: "gauntlets", zh: "护手" },
    { tag: "pauldrons", zh: "肩甲" },
  ],
  "long hair": [
    { tag: "floating hair", zh: "飘发" },
    { tag: "hair between eyes", zh: "碎发" },
    { tag: "very long hair", zh: "超长发" },
    { tag: "bangs", zh: "刘海" },
  ],
  "twintails": [
    { tag: "hair ribbon", zh: "发带" },
    { tag: "ribbon", zh: "丝带" },
    { tag: "bangs", zh: "刘海" },
    { tag: "hair bow", zh: "蝴蝶结" },
  ],
  smile: [
    { tag: "blush", zh: "脸红" },
    { tag: "open mouth", zh: "张嘴" },
    { tag: "closed eyes", zh: "闭眼" },
    { tag: "happy", zh: "开心" },
  ],
  blush: [
    { tag: "embarrassed", zh: "害羞" },
    { tag: "looking away", zh: "撇视" },
    { tag: "nervous", zh: "紧张" },
    { tag: "half-closed eyes", zh: "半睁眼" },
  ],
  night: [
    { tag: "night sky", zh: "夜空" },
    { tag: "star (sky)", zh: "星星" },
    { tag: "moon", zh: "月亮" },
    { tag: "city lights", zh: "城市灯光" },
    { tag: "lantern", zh: "灯笼" },
  ],
  "cherry blossoms": [
    { tag: "petals", zh: "花瓣" },
    { tag: "spring (season)", zh: "春天" },
    { tag: "tree", zh: "树" },
    { tag: "wind", zh: "风" },
  ],
  rain: [
    { tag: "umbrella", zh: "雨伞" },
    { tag: "wet", zh: "潮湿" },
    { tag: "puddle", zh: "水洼" },
    { tag: "water drop", zh: "水滴" },
  ],
  ocean: [
    { tag: "beach", zh: "海滩" },
    { tag: "sky", zh: "天空" },
    { tag: "cloud", zh: "云" },
    { tag: "horizon", zh: "地平线" },
  ],
  sword: [
    { tag: "holding sword", zh: "持剑" },
    { tag: "weapon", zh: "武器" },
    { tag: "armor", zh: "盔甲" },
    { tag: "serious", zh: "严肃" },
  ],
  wings: [
    { tag: "feathers", zh: "羽毛" },
    { tag: "angel", zh: "天使" },
    { tag: "halo", zh: "光环" },
    { tag: "feathered wings", zh: "羽翼" },
  ],
  "1girl": [
    { tag: "solo", zh: "单人" },
    { tag: "looking at viewer", zh: "看向观众" },
    { tag: "detailed eyes", zh: "精细眼睛" },
    { tag: "upper body", zh: "上半身" },
  ],
  "blue eyes": [
    { tag: "detailed eyes", zh: "精细眼睛" },
    { tag: "long eyelashes", zh: "长睫毛" },
    { tag: "sparkle", zh: "闪光" },
  ],
};

function normalize(tag: string) {
  return tag.trim().toLowerCase().replace(/_/g, " ");
}

/**
 * Given the current prompt, return co-occurring tag suggestions for the tags
 * already present (most-recent tags first), excluding ones already used.
 */
export function relatedTags(prompt: string, limit = 8): RelatedTag[] {
  const present = prompt
    .split(",")
    .map((t) => normalize(t).replace(/[{}[\]]/g, "").replace(/-?\d*(\.\d+)?::/g, "").replace(/::/g, "").trim())
    .filter(Boolean);
  if (present.length === 0) return [];
  const presentSet = new Set(present);

  const out: RelatedTag[] = [];
  const seen = new Set<string>();
  // Walk from the last tag backwards so recent context dominates.
  for (let i = present.length - 1; i >= 0; i--) {
    const related = CO_OCCURRENCE[present[i]];
    if (!related) continue;
    for (const r of related) {
      const key = normalize(r.tag);
      if (presentSet.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(r);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
