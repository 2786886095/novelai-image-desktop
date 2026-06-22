// Expanded 灵感胶囊 (inspiration capsule) library — independently authored (MIT),
// NOT derived from the GPL Danbooru CSV. Every tag is placed in the category it
// genuinely belongs to (the user's hard requirement: tag 必须与所分类别匹配).
//
// Data is stored in a compact packed form ("en=zh|en2=zh2|…") and parsed at load,
// so several thousand tags stay readable and easy to extend. `mergeCapsules`
// folds this set into the small curated builtin set (prompt-data) by category +
// subgroup name, de-duplicating by English tag within each category.

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

/** Parse a packed "en=zh|en2=zh2" string into a subgroup. */
function sg(name: string, packed: string): CapsuleSubgroup {
  const tags: CapsuleTag[] = [];
  for (const raw of packed.split("|")) {
    const piece = raw.trim();
    if (!piece) continue;
    const i = piece.indexOf("=");
    const en = (i === -1 ? piece : piece.slice(0, i)).trim();
    const zh = (i === -1 ? piece : piece.slice(i + 1)).trim();
    if (en) tags.push({ en, zh: zh || en });
  }
  return { name, tags };
}

function cat(name: string, ...subgroups: CapsuleSubgroup[]): CapsuleCategory {
  return { name, subgroups };
}

/**
 * Merge a base (curated) taxonomy with an extra one by category + subgroup name.
 * Tags are de-duplicated by English value within each category so the curated
 * entries always win and nothing appears twice in the same category.
 */
export function mergeCapsules(base: CapsuleCategory[], extra: CapsuleCategory[]): CapsuleCategory[] {
  const out: CapsuleCategory[] = base.map((c) => ({
    name: c.name,
    subgroups: c.subgroups.map((s) => ({ name: s.name, tags: [...s.tags] })),
  }));
  const seenByCat = new Map<string, Set<string>>();
  for (const c of out) {
    const seen = new Set<string>();
    c.subgroups.forEach((s) => s.tags.forEach((t) => seen.add(t.en)));
    seenByCat.set(c.name, seen);
  }
  for (const ec of extra) {
    let target = out.find((c) => c.name === ec.name);
    if (!target) {
      target = { name: ec.name, subgroups: [] };
      out.push(target);
      seenByCat.set(target.name, new Set<string>());
    }
    const seen = seenByCat.get(target.name)!;
    for (const es of ec.subgroups) {
      let subgroup = target.subgroups.find((s) => s.name === es.name);
      if (!subgroup) {
        subgroup = { name: es.name, tags: [] };
        target.subgroups.push(subgroup);
      }
      for (const t of es.tags) {
        if (seen.has(t.en)) continue;
        seen.add(t.en);
        subgroup.tags.push(t);
      }
    }
  }
  return out;
}

export const CAPSULE_EXTRA: CapsuleCategory[] = [
  cat(
    "人物",
    sg("对象", "1girl=1女孩|2girls=2女孩|3girls=3女孩|4girls=4女孩|5girls=5女孩|6+girls=6+女孩|multiple_girls=多名女孩|1boy=1男孩|2boys=2男孩|3boys=3男孩|multiple_boys=多名男孩|solo=单人|solo_focus=单人焦点|1other=1其他|2others=2其他|couple=情侣|yuri=百合|yaoi=耽美|group=群像|crowd=人群|everyone=全员|male_focus=男性焦点|female_focus=女性焦点|duo=两人|trio=三人|harem=后宫|age_difference=年龄差|size_difference=体型差|hetero=异性"),
    sg("身份", "maid=女仆|nun=修女|witch=女巫|idol=偶像|nurse=护士|doctor=医生|police=警察|policewoman=女警|knight=骑士|samurai=武士|ninja=忍者|schoolgirl=女学生|schoolboy=男学生|student=学生|teacher=教师|professor=教授|office_lady=职业女性|businessman=商务男士|secretary=秘书|waitress=女服务员|waiter=服务员|chef=厨师|maid_(profession)=女仆职业|princess=公主|prince=王子|queen=女王|king=国王|empress=皇后|angel=天使|demon=恶魔|demon_girl=恶魔娘|priestess=女祭司|priest=祭司|monk=僧侣|shrine_maiden=巫女|miko=巫女|magical_girl=魔法少女|mahou_shoujo=魔法少女|pirate=海盗|cowboy=牛仔|cowgirl=牛仔女|gladiator=角斗士|assassin=刺客|thief=盗贼|bandit=强盗|mercenary=佣兵|soldier=士兵|general=将军|captain=队长|sailor=水手|adventurer=冒险者|hero=英雄|heroine=女主角|villain=反派|scientist=科学家|engineer=工程师|mechanic=机械师|hacker=黑客|detective=侦探|spy=间谍|bodyguard=保镖|hunter=猎人|farmer=农夫|fisherman=渔夫|blacksmith=铁匠|merchant=商人|noble=贵族|maid_cafe=女仆咖啡|gyaru=辣妹|delinquent=不良少年|yandere=病娇|tsundere=傲娇|kuudere=冷娇|dandere=腼腆娇|bartender=调酒师|dancer=舞者|singer=歌手|musician=音乐家|artist=艺术家|model=模特|stewardess=空姐|race_queen=赛车女郎|cheerleader=啦啦队员|athlete=运动员|swimmer=游泳运动员|boxer=拳击手|gamer=游戏玩家|streamer=主播|maid_dress=女仆装"),
    sg("种族", "human=人类|elf=精灵|dark_elf=暗精灵|high_elf=高等精灵|half-elf=半精灵|dwarf=矮人|orc=兽人|goblin=哥布林|vampire=吸血鬼|werewolf=狼人|zombie=丧尸|ghost=幽灵|skeleton=骷髅|dragon_girl=龙娘|dragon_boy=龙男|lamia=拉米亚|harpy=哈比|centaur=半人马|mermaid=人鱼|merman=男人鱼|oni=鬼|tengu=天狗|kitsune=狐妖|nekomata=猫又|kobold=狗头人|fairy=妖精|angel=天使|fallen_angel=堕天使|succubus=魅魔|incubus=梦魔|android=仿生人|robot=机器人|cyborg=改造人|golem=魔像|slime_girl=史莱姆娘|plant_girl=植物娘|monster_girl=魔物娘|beastman=兽人族|catgirl=猫娘|foxgirl=狐娘|wolfgirl=狼娘|bunny_girl=兔女郎|cowgirl_(animal)=牛娘|fish_girl=鱼人娘|insect_girl=虫娘"),
    sg("年龄", "loli=萝莉|shota=正太|child=儿童|toddler=幼儿|baby=婴儿|kid=小孩|teenage_girl=少女|teenage_boy=少年|young_adult=青年|adult=成人|mature_female=成熟女性|mature_male=成熟男性|milf=熟女|dilf=熟男|older_woman=年长女性|older_man=年长男性|old_woman=老妇|old_man=老人|elderly=年迈|aged_down=幼年化|aged_up=成年化"),
    sg("体型", "petite=娇小|slim=纤细|slender=苗条|thin=瘦|skinny=骨感|curvy=曲线丰满|voluptuous=丰腴妖娆|plump=丰满|chubby=圆润|fat=胖|muscular=肌肉|muscular_female=肌肉女性|muscular_male=肌肉男性|toned=结实|abs=腹肌|toned_stomach=结实腹部|six_pack=六块腹肌|tall=高个|tall_female=高个女性|short=矮个|wide_hips=宽臀|narrow_waist=细腰|thick_thighs=粗大腿|thigh_gap=大腿缝|long_legs=长腿|broad_shoulders=宽肩|small_waist=小蛮腰|hourglass_figure=沙漏身材|busty=丰胸|petite_body=娇小身材"),
    sg("肤色", "pale_skin=白皙皮肤|fair_skin=白净皮肤|light_skin=浅肤色|dark_skin=深色皮肤|dark-skinned_female=深肤色女性|dark-skinned_male=深肤色男性|tan=小麦色|tanned=晒黑|sun_tan=日晒肤色|olive_skin=橄榄肤色|brown_skin=棕色皮肤|black_skin=黑色皮肤|very_dark_skin=极深肤色|shiny_skin=光泽皮肤|wet_skin=湿润皮肤|freckles=雀斑|skin_fang=皮肤白皙|goth_makeup=哥特妆|pale=苍白"),
    sg("发长", "bald=光头|buzz_cut=寸头|very_short_hair=极短发|short_hair=短发|ear_length_hair=齐耳发|chin-length_hair=齐下巴发|neck_length_hair=齐颈发|shoulder-length_hair=齐肩发|medium_hair=中长发|long_hair=长发|very_long_hair=超长发|waist-length_hair=及腰长发|absurdly_long_hair=夸张长发|big_hair=蓬松大发|voluminous_hair=丰盈发量"),
    sg("发型", "twintails=双马尾|low_twintails=低双马尾|short_twintails=短双马尾|side_ponytail=侧马尾|ponytail=马尾|high_ponytail=高马尾|low_ponytail=低马尾|folded_ponytail=折叠马尾|braid=辫子|twin_braids=双辫|single_braid=单辫|side_braid=侧辫|crown_braid=环冠辫|french_braid=法式辫|fishtail_braid=鱼骨辫|braided_bun=辫子丸子|hair_bun=丸子头|double_bun=双丸子|single_hair_bun=单丸子|cone_hair_bun=锥形丸子|topknot=发髻|bob_cut=波波头|pixie_cut=精灵短发|hime_cut=公主切|bowl_cut=锅盖头|undercut=底切发|sidecut=侧剃发|mohawk=莫西干|afro=爆炸头|dreadlocks=脏辫|ringlets=卷垂发|drill_hair=钻头卷|twin_drills=双钻头|wavy_hair=波浪发|curly_hair=卷发|straight_hair=直发|messy_hair=凌乱发|spiked_hair=刺猬头|slicked-back_hair=后梳油头|flipped_hair=外翻发尾|hair_flaps=发瓣|wolf_cut=狼尾发|asymmetrical_hair=不对称发型"),
    sg("刘海", "blunt_bangs=齐刘海|swept_bangs=斜刘海|side-swept_bangs=侧分刘海|parted_bangs=中分刘海|crossed_bangs=交叉刘海|diagonal_bangs=斜向刘海|asymmetrical_bangs=不对称刘海|hair_over_one_eye=遮一只眼|hair_over_eyes=遮双眼|hair_between_eyes=眼间碎发|hair_intakes=进气口发型|sidelocks=鬓发|long_sidelocks=长鬓发|drill_sidelocks=钻头鬓发|short_bangs=短刘海|curtained_hair=窗帘式刘海|hair_pulled_back=后梳发|forehead=露额头|widow's_peak=美人尖"),
    sg("发色", "blonde_hair=金发|platinum_blonde_hair=铂金发|strawberry_blonde_hair=草莓金发|brown_hair=棕发|light_brown_hair=浅棕发|dark_brown_hair=深棕发|black_hair=黑发|white_hair=白发|silver_hair=银发|grey_hair=灰发|blue_hair=蓝发|light_blue_hair=浅蓝发|dark_blue_hair=深蓝发|aqua_hair=水蓝发|red_hair=红发|crimson_hair=深红发|pink_hair=粉发|light_pink_hair=浅粉发|purple_hair=紫发|light_purple_hair=浅紫发|green_hair=绿发|light_green_hair=浅绿发|dark_green_hair=深绿发|orange_hair=橙发|ginger_hair=姜黄发|multicolored_hair=多色发|two-tone_hair=双色发|gradient_hair=渐变发|streaked_hair=挑染发|colored_inner_hair=内层染色|colored_tips=发梢染色|rainbow_hair=彩虹发|split-color_hair=分色发"),
    sg("发饰特征", "ahoge=呆毛|huge_ahoge=巨大呆毛|antenna_hair=触角发|cowlick=翘发|hair_flaps=发瓣|mature_hair=成熟发型|hair_bow=发蝴蝶结|wet_hair=湿发|floating_hair=飘动头发|hair_spread_out=散开头发|hair_censor=头发遮挡|hair_over_shoulder=发搭肩|hair_pulled_back=后拢发|hair_strand=发丝|glowing_hair=发光头发"),
    sg("眼睛颜色", "blue_eyes=蓝眼|red_eyes=红眼|green_eyes=绿眼|yellow_eyes=黄眼|golden_eyes=金眼|orange_eyes=橙眼|purple_eyes=紫眼|pink_eyes=粉眼|brown_eyes=棕眼|black_eyes=黑眼|grey_eyes=灰眼|aqua_eyes=水蓝眼|white_eyes=白眼|silver_eyes=银眼|multicolored_eyes=多色眼|two-tone_eyes=双色眼|gradient_eyes=渐变眼|heterochromia=异色瞳|glowing_eyes=发光眼"),
    sg("眼型眼神", "tsurime=吊眼|tareme=垂眼|jitome=三白眼直视|sanpaku=三白眼|closed_eyes=闭眼|one_eye_closed=闭一只眼|wink=眨眼|half-closed_eyes=半闭眼|narrowed_eyes=眯眼|wide-eyed=睁大眼|crazy_eyes=疯狂眼神|empty_eyes=空洞眼神|rolling_eyes=翻白眼|cross-eyed=斗鸡眼|upturned_eyes=上扬眼|downturned_eyes=下垂眼|bedroom_eyes=媚眼|puffy_eyes=肿眼|teary_eyes=含泪眼|sleepy_eyes=惺忪睡眼|sparkling_eyes=闪亮眼神|aegyo_sal=卧蚕"),
    sg("瞳孔", "slit_pupils=竖瞳|heart-shaped_pupils=心形瞳|star-shaped_pupils=星形瞳|flower-shaped_pupils=花形瞳|x-shaped_pupils=X形瞳|diamond-shaped_pupils=菱形瞳|horizontal_pupils=横瞳|no_pupils=无瞳|dilated_pupils=扩张瞳孔|constricted_pupils=收缩瞳孔|sparkle=瞳孔闪光|symbol-shaped_pupils=符号瞳|ringed_eyes=环纹瞳|mismatched_pupils=异瞳孔"),
    sg("眉睫妆", "thick_eyebrows=浓眉|thin_eyebrows=细眉|arched_eyebrows=拱形眉|long_eyelashes=长睫毛|eyelashes=睫毛|colored_eyelashes=彩色睫毛|eyeshadow=眼影|eyeliner=眼线|mascara=睫毛膏|red_eyeshadow=红眼影|blue_eyeshadow=蓝眼影|purple_eyeshadow=紫眼影|makeup=妆容|blush=腮红|heavy_makeup=浓妆|gyaru_makeup=辣妹妆"),
    sg("耳朵", "pointy_ears=尖耳|elf_ears=精灵耳|long_pointy_ears=长尖耳|animal_ears=兽耳|cat_ears=猫耳|fox_ears=狐耳|wolf_ears=狼耳|dog_ears=狗耳|rabbit_ears=兔耳|mouse_ears=鼠耳|horse_ears=马耳|cow_ears=牛耳|bear_ears=熊耳|raccoon_ears=浣熊耳|fennec_fox_ears=耳廓狐耳|deer_ears=鹿耳|sheep_ears=羊耳|tiger_ears=虎耳|lion_ears=狮耳|fake_animal_ears=假兽耳|ear_piercing=耳钉|ear_ornament=耳饰|ear_blush=耳朵泛红"),
    sg("口齿", "open_mouth=张嘴|closed_mouth=闭嘴|parted_lips=微张唇|lips=嘴唇|puckered_lips=噘唇|lip_biting=咬唇|fang=虎牙|fangs=尖牙|sharp_teeth=利齿|snaggletooth=小虎牙|teeth=牙齿|clenched_teeth=咬紧牙|tongue=舌头|tongue_out=吐舌|licking_lips=舔唇|drooling=流口水|saliva=唾液|food_in_mouth=口含食物|mouth_hold=嘴叼物|lipstick=口红|red_lipstick=红唇|black_lipstick=黑唇|gradient_lips=渐变唇"),
    sg("面部特征", "facial_mark=面部纹|mole=痣|mole_under_eye=眼下痣|mole_under_mouth=嘴下痣|beauty_mark=美人痣|freckles=雀斑|scar=伤疤|scar_on_face=脸上伤疤|scar_across_eye=过眼伤疤|scar_on_cheek=脸颊伤疤|tattoo=纹身|facial_tattoo=面部纹身|whisker_markings=胡须纹|blush_stickers=腮红贴|heart_in_eye=眼中爱心|symbol_in_eye=眼中符号|nose_blush=鼻头泛红|empty_eyes=空洞眼|forehead_mark=额间印记|third_eye=第三只眼|bindi=额心痣"),
    sg("胸部腰腹", "flat_chest=平胸|small_breasts=小胸|medium_breasts=中胸|large_breasts=大胸|huge_breasts=巨乳|cleavage=事业线|sideboob=侧乳|underboob=下乳|navel=肚脐|stomach=腹部|midriff=露腹|taut_stomach=紧实腹部|belly=肚子|spine=脊背|collarbone=锁骨|shoulder_blades=肩胛骨|back=背部|bare_back=裸背|bare_shoulders=裸肩"),
    sg("腰臀腿手", "wide_hips=宽臀|ass=臀部|thick_thighs=粗腿|thigh_gap=腿缝|thighs=大腿|legs=腿|long_legs=长腿|knees=膝盖|feet=脚|barefoot=赤脚|soles=脚底|toes=脚趾|toenail_polish=脚趾甲油|nail_polish=指甲油|long_fingernails=长指甲|fingernails=指甲|hands=手|veiny_hands=青筋手|hand_focus=手部特写"),
    sg("兽人部位", "tail=尾巴|cat_tail=猫尾|fox_tail=狐尾|wolf_tail=狼尾|dog_tail=狗尾|rabbit_tail=兔尾|multiple_tails=多尾|fox_girl_tail=狐娘尾|paws=爪垫|claws=爪|fur=毛皮|body_fur=体毛|fur_collar=毛领|animal_nose=兽鼻|snout=口鼻|furry=兽人|furry_female=兽人女性|whiskers=胡须|fang_out=露虎牙|fluffy_tail=蓬松尾巴|tail_raised=翘尾"),
    sg("翅角光环", "wings=翅膀|feathered_wings=羽翼|angel_wings=天使翼|fairy_wings=妖精翼|butterfly_wings=蝶翼|dragon_wings=龙翼|demon_wings=恶魔翼|bat_wings=蝙蝠翼|mechanical_wings=机械翼|energy_wings=能量翼|multiple_wings=多翼|low_wings=低位翼|horns=角|single_horn=独角|curved_horns=弯角|dragon_horns=龙角|demon_horns=恶魔角|antlers=鹿角|cone_horns=锥形角|halo=光环|broken_halo=破碎光环|glowing_halo=发光光环"),
  ),
  cat(
    "服饰",
    sg("上衣", "shirt=衬衫|t-shirt=T恤|blouse=女衬衫|collared_shirt=有领衬衫|dress_shirt=正装衬衫|sleeveless_shirt=无袖衫|crop_top=露脐上衣|tube_top=抹胸上衣|tank_top=背心|camisole=吊带背心|halterneck=挂脖上衣|off-shoulder=露肩|sweater=毛衣|turtleneck=高领毛衣|turtleneck_sweater=高领毛衣|ribbed_sweater=罗纹毛衣|sweater_vest=毛衣马甲|sleeveless_turtleneck=无袖高领|hoodie=连帽衫|sweatshirt=卫衣|cardigan=开衫|vest=马甲|waistcoat=西装马甲|jacket=夹克|blazer=西装外套|suit_jacket=西服|bomber_jacket=飞行夹克|leather_jacket=皮夹克|denim_jacket=牛仔夹克|track_jacket=运动夹克|coat=外套|trench_coat=风衣|fur_coat=毛皮大衣|winter_coat=冬季外套|raincoat=雨衣|overcoat=大衣|poncho=斗篷衣|cape=披风|cloak=斗篷|shrug_(clothing)=小披肩|tabard=罩袍"),
    sg("下装", "skirt=裙子|pleated_skirt=百褶裙|miniskirt=迷你裙|microskirt=超短裙|long_skirt=长裙|high-waist_skirt=高腰裙|suspender_skirt=背带裙|pencil_skirt=铅笔裙|skirt_set=裙套装|shorts=短裤|short_shorts=超短裤|denim_shorts=牛仔短裤|bike_shorts=骑行短裤|hot_pants=热裤|pants=长裤|jeans=牛仔裤|cargo_pants=工装裤|sweatpants=运动裤|leggings=打底裤|yoga_pants=瑜伽裤|capri_pants=七分裤|harem_pants=哈伦裤|wide-leg_pants=阔腿裤|overalls=背带裤|overall_shorts=背带短裤|bloomers=灯笼裤|buruma=运动短裤|hakama_pants=袴裤|culottes=裤裙"),
    sg("连衣裙", "dress=连衣裙|sundress=吊带连衣裙|evening_gown=晚礼服|ballgown=舞会礼服|cocktail_dress=鸡尾酒裙|wedding_dress=婚纱|china_dress=旗袍|frilled_dress=荷叶边裙|halter_dress=挂脖裙|backless_dress=露背裙|off-shoulder_dress=露肩裙|fur-trimmed_dress=毛边裙|layered_dress=多层裙|pinafore_dress=围裙裙|sweater_dress=毛衣裙|pencil_dress=紧身裙|gothic_lolita=哥特洛丽塔|lolita_fashion=洛丽塔时尚|dirndl=巴伐利亚裙|maxi_dress=长摆裙|slip_dress=吊带裙|sailor_dress=水手裙"),
    sg("制服", "school_uniform=校服|serafuku=水手服|sailor_collar=水手领|sailor_uniform=水手制服|blazer_uniform=西装校服|gym_uniform=体操服|track_suit=运动服|military_uniform=军装|naval_uniform=海军制服|police_uniform=警服|nurse_uniform=护士服|maid_apron=女仆围裙|cheerleader_uniform=啦啦队服|band_uniform=乐队制服|business_suit=商务套装|pant_suit=裤装套装|lab_coat=实验服|chef_uniform=厨师服|kunoichi=女忍服|miko_outfit=巫女装|santa_costume=圣诞装|bunny_suit=兔女郎装|race_queen=赛车女郎装|flight_attendant=空乘制服|waitress_uniform=女服务员制服"),
    sg("泳装内衣", "swimsuit=泳装|bikini=比基尼|string_bikini=系带比基尼|micro_bikini=微型比基尼|frilled_bikini=荷叶边比基尼|side-tie_bikini=侧系比基尼|sport_bikini=运动比基尼|tankini=坦基尼|one-piece_swimsuit=连体泳装|school_swimsuit=学校泳装|competition_swimsuit=竞速泳装|rash_guard=防晒泳衣|wetsuit=潜水服|underwear=内衣|bra=胸罩|sports_bra=运动内衣|panties=内裤|thong=丁字裤|boyshorts=平角内裤|lingerie=情趣内衣|garter_belt=吊袜带|corset=束身衣|bustier=无肩束胸|babydoll=娃娃装|chemise=吊带睡裙|leotard=紧身连体衣|playboy_bunny=兔女郎|highleg=高叉|underwear_only=仅内衣"),
    sg("睡衣家居", "pajamas=睡衣|nightgown=睡裙|negligee=薄纱睡衣|bathrobe=浴袍|robe=长袍|towel=毛巾|naked_towel=裹浴巾|apron=围裙|naked_apron=裸体围裙|kigurumi=连体睡衣|loungewear=家居服|nightcap=睡帽|house_slippers=居家拖鞋|oversized_shirt=超大衬衫|off-shoulder_sweater=露肩毛衣"),
    sg("腿袜", "thighhighs=过膝袜|over-knee_socks=过膝长袜|kneehighs=及膝袜|socks=袜子|ankle_socks=船袜|bobby_socks=短筒袜|loose_socks=泡泡袜|pantyhose=连裤袜|tights=紧身裤袜|fishnets=渔网袜|fishnet_legwear=渔网腿袜|striped_legwear=条纹腿袜|polka_dot_legwear=圆点腿袜|single_thighhigh=单只过膝袜|garter_straps=吊袜带|leg_warmers=腿套|knee_pads=护膝|black_thighhighs=黑过膝袜|white_thighhighs=白过膝袜|lace-trimmed_legwear=蕾丝边腿袜"),
    sg("鞋靴", "boots=靴子|ankle_boots=踝靴|knee_boots=及膝靴|thigh_boots=过膝靴|combat_boots=军靴|rain_boots=雨靴|high_heels=高跟鞋|pumps=浅口高跟|platform_heels=厚底高跟|stiletto_heels=细高跟|sneakers=运动鞋|loafers=乐福鞋|mary_janes=玛丽珍鞋|ballet_flats=芭蕾平底|sandals=凉鞋|flip-flops=人字拖|slippers=拖鞋|geta=木屐|z/ori=草履|uwabaki=室内鞋|cross-laced_footwear=系带鞋|ice_skates=冰刀鞋|roller_skates=轮滑鞋|school_shoes=校鞋"),
    sg("手套臂饰", "gloves=手套|fingerless_gloves=露指手套|elbow_gloves=过肘手套|half_gloves=半指手套|mittens=连指手套|arm_warmers=臂套|detached_sleeves=分离袖|wide_sleeves=宽袖|long_sleeves=长袖|short_sleeves=短袖|puffy_sleeves=泡泡袖|armband=臂章|wristband=腕带|bracer=护腕|vambrace=前臂甲|gauntlets=护手甲|bandaged_arm=绷带手臂|bridal_gauntlets=新娘长手套|arm_strap=臂带"),
    sg("头饰帽子", "hat=帽子|baseball_cap=棒球帽|beanie=毛线帽|sun_hat=遮阳帽|straw_hat=草帽|top_hat=礼帽|fedora=费多拉帽|cowboy_hat=牛仔帽|bucket_hat=渔夫帽|beret=贝雷帽|nurse_cap=护士帽|chef_hat=厨师帽|peaked_cap=大檐帽|santa_hat=圣诞帽|party_hat=派对帽|witch_hat=女巫帽|wizard_hat=巫师帽|animal_hat=动物帽|mob_cap=室内软帽|bonnet=软帽|hood=兜帽|hood_up=戴兜帽|headscarf=头巾|veil=面纱|tiara=头冠|crown=皇冠|circlet=头环|head_wreath=花环|flower_wreath=花冠|maid_headdress=女仆头饰|hat_flower=帽花|hat_ribbon=帽带"),
    sg("发饰", "hair_ornament=发饰|hairclip=发夹|hairpin=发簪|hairband=发箍|headband=发带|hair_ribbon=发丝带|hair_bow=发蝴蝶结|hair_flower=发花|hair_bobbles=发球|scrunchie=发圈|hair_scrunchie=发圈|hair_tie=发带|hair_stick=发针|kanzashi=簪子|hair_bell=发铃|x_hair_ornament=X发饰|star_hair_ornament=星形发饰|heart_hair_ornament=心形发饰|bat_hair_ornament=蝙蝠发饰|snowflake_hair_ornament=雪花发饰|food-themed_hair_ornament=食物主题发饰|frog_hair_ornament=青蛙发饰|cross_hair_ornament=十字发饰|hairpods=发耳机"),
    sg("颈饰", "necktie=领带|bowtie=领结|ascot=阿斯科特领巾|cravat=领巾|neckerchief=领巾|scarf=围巾|muffler=厚围巾|neck_ribbon=颈带|collar=颈圈|choker=项圈|frilled_choker=荷叶边项圈|lace_choker=蕾丝项圈|detached_collar=分离衣领|neck_bell=颈铃|pendant=吊坠|sailor_collar=水手领|fur_collar=毛领|collarbone=锁骨"),
    sg("首饰", "jewelry=首饰|necklace=项链|pendant_necklace=吊坠项链|pearl_necklace=珍珠项链|earrings=耳环|single_earring=单耳环|stud_earrings=耳钉|hoop_earrings=圈形耳环|ear_piercing=耳洞|ring=戒指|wedding_ring=婚戒|bracelet=手镯|bangle=手环|anklet=脚链|brooch=胸针|gem=宝石|crystal=水晶|crystal_earrings=水晶耳环|jewel_brooch=珠宝胸针|nose_piercing=鼻钉|navel_piercing=肚脐钉"),
    sg("包袋", "bag=包|handbag=手提包|backpack=背包|school_bag=书包|randoseru=日式书包|satchel=单肩包|messenger_bag=邮差包|shoulder_bag=斜挎包|duffel_bag=旅行袋|pouch=小包|fanny_pack=腰包|suitcase=行李箱|basket=篮子|picnic_basket=野餐篮|drawstring_bag=束口袋|tote_bag=托特包|coin_purse=零钱包"),
    sg("眼镜面具", "glasses=眼镜|sunglasses=墨镜|round_eyewear=圆框眼镜|semi-rimless_eyewear=半框眼镜|rimless_eyewear=无框眼镜|red-framed_eyewear=红框眼镜|goggles=护目镜|monocle=单片眼镜|eyepatch=眼罩|blindfold=蒙眼布|mask=面具|surgical_mask=口罩|mouth_mask=遮口罩|gas_mask=防毒面具|domino_mask=蝙蝠侠眼罩|fox_mask=狐狸面具|oni_mask=鬼面具|kitsune_mask=狐面|hannya_mask=般若面|respirator=呼吸面罩"),
    sg("装饰元素", "frills=荷叶边|lace=蕾丝|lace_trim=蕾丝边|ribbon=丝带|bow=蝴蝶结|ribbon_trim=丝带饰边|fur_trim=毛边|ruffle=褶边|pleats=褶裥|buttons=纽扣|zipper=拉链|belt=腰带|double_belt=双腰带|sash=腰封|obi=和服腰带|suspenders=背带|chains=链条|studs=铆钉|tassel=流苏|embroidery=刺绣|bandages=绷带|corset_lacing=束身系带|side_slit=侧开衩|cutout=镂空|see-through=透视|sheer=薄透"),
    sg("图案材质", "plaid=格纹|striped=条纹|vertical_stripes=竖条纹|horizontal_stripes=横条纹|polka_dot=圆点|checkered=棋盘格|floral_print=花卉印花|argyle=菱形格|gingham=方格纹|camouflage=迷彩|leopard_print=豹纹|star_print=星星图案|heart_print=爱心图案|leather=皮革|latex=乳胶|denim=牛仔布|silk=丝绸|satin=缎面|velvet=天鹅绒|knit=针织|wool=羊毛|fishnet=渔网|mesh=网眼|metallic=金属质感|glitter=亮片|sequins=亮片饰"),
    sg("民族风格", "kimono=和服|yukata=浴衣|hakama=袴|furisode=振袖|japanese_clothes=和风服饰|hanfu=汉服|chinese_clothes=中式服装|cheongsam=旗袍|tangzhuang=唐装|hanbok=韩服|korean_clothes=韩式服装|sari=纱丽|ao_dai=奥黛|dirndl=巴伐利亚裙|lederhosen=皮短裤|tribal=部落风|folk_costume=民族服饰|qing_dynasty_clothes=清代服饰|traditional_clothes=传统服饰"),
    sg("风格服饰", "gothic=哥特风|goth=暗黑哥特|lolita=洛丽塔|punk=朋克|casual=休闲|formal=正式|vintage=复古|streetwear=街头|sportswear=运动风|business_casual=商务休闲|elegant=优雅|cyberpunk_clothes=赛博服饰|steampunk_clothes=蒸汽朋克服饰|fantasy_armor=幻想盔甲|armor=盔甲|plate_armor=板甲|power_armor=动力装甲|mecha_clothes=机甲服|kemonomimi_mode=兽耳模式"),
  ),
  cat(
    "表情",
    sg("情绪", "smile=微笑|grin=咧嘴笑|light_smile=浅笑|big_smile=大笑容|laughing=大笑|giggling=咯咯笑|happy=开心|joy=喜悦|blush=脸红|full-face_blush=满脸通红|embarrassed=害羞|nervous=紧张|crying=哭泣|tears=泪水|crying_with_eyes_open=睁眼哭|streaming_tears=泪流满面|teardrop=泪珠|sad=悲伤|depressed=沮丧|lonely=孤独|angry=生气|annoyed=恼怒|pout=噘嘴|furrowed_brow=皱眉|scowl=怒容|serious=严肃|determined=坚定|surprised=惊讶|shocked=震惊|scared=害怕|fear=恐惧|worried=担忧|confused=困惑|expressionless=面无表情|bored=无聊|sleepy=困倦|tired=疲惫|smug=得意|smirk=坏笑|seductive_smile=魅惑笑|evil_smile=邪笑|sadistic=施虐笑|crazy_smile=疯狂笑|nervous_smile=尴尬笑|forced_smile=强颜欢笑|wry_smile=苦笑|ahegao=阿黑颜|naughty_face=坏笑脸|embarrassed_smile=羞涩微笑|excited=兴奋|disgust=厌恶|disappointed=失望|smug_face=傲然脸"),
    sg("脸颊嘴部", "blush=脸红|nose_blush=鼻头红|cheek_blush=脸颊红|puffy_cheeks=鼓腮|cheek_bulge=腮帮鼓起|open_mouth=张嘴|closed_mouth=闭嘴|parted_lips=微张|wide_open_mouth=大张嘴|gritted_teeth=咬牙|biting_lip=咬唇|tongue_out=吐舌|:d=笑脸:d|:3=猫嘴:3|:o=惊讶:o|:p=吐舌:p|;)=眨眼笑|^_^=眯眼笑|>:(=生气脸|covering_mouth=捂嘴|hand_over_mouth=手掩口"),
    sg("视线", "looking_at_viewer=看向观众|looking_away=看向别处|looking_back=回眸|looking_up=向上看|looking_down=向下看|looking_to_the_side=看向侧面|looking_afar=远望|eye_contact=对视|averting_eyes=移开视线|looking_at_another=看向他人|staring=凝视|glaring=怒视|peeking=偷看|downcast_eyes=低垂目光|side_glance=侧目"),
    sg("情感氛围", "happy_tears=喜极而泣|melancholy=忧郁|serene=宁静|peaceful=平和|gentle=温柔|cold_expression=冷漠|stoic=淡漠|confident=自信|shy=羞涩|flustered=慌乱|yandere=病娇神情|dreamy=梦幻|longing=渴望|mischievous=顽皮|playful=俏皮|proud=骄傲|tender=柔情|surprised_expression=惊讶神情|sleepy_expression=睡眼惺忪"),
  ),
  cat(
    "动作姿势",
    sg("站立", "standing=站立|standing_on_one_leg=单脚站|contrapposto=对立式|tiptoes=踮脚|leaning_forward=前倾|leaning_back=后仰|leaning_to_the_side=侧倾|leaning_on_object=倚靠|wall_lean=靠墙|against_wall=贴墙|hand_on_hip=手叉腰|hands_on_hips=双手叉腰|arms_crossed=抱臂|arms_behind_back=背手|arms_up=举双臂|stretching=伸展|back_arch=弓背|crossed_legs_standing=站姿交叉腿"),
    sg("坐卧", "sitting=坐|seiza=正坐|wariza=鸭子坐|yokozuwari=横坐|indian_style=盘腿坐|kneeling=跪|squatting=蹲|crouching=蜷蹲|on_one_knee=单膝跪|sitting_on_floor=坐地上|sitting_on_chair=坐椅子|sitting_on_bed=坐床上|legs_crossed=翘二郎腿|knees_up=屈膝|hugging_own_legs=抱膝|lying=躺|on_back=仰躺|on_stomach=俯躺|on_side=侧躺|fetal_position=蜷缩|spread_legs=张腿|reclining=斜躺|prone=趴卧|all_fours=四肢着地"),
    sg("动态", "running=奔跑|walking=行走|jumping=跳跃|falling=坠落|flying=飞行|floating=漂浮|dancing=跳舞|spinning=旋转|swimming=游泳|diving=跳水|climbing=攀爬|crawling=爬行|skipping=蹦跳|leaping=腾跃|kicking=踢|punching=出拳|fighting_stance=战斗姿态|action_pose=动作姿势|dynamic_pose=动感姿势|mid-air=半空中|motion_lines=动态线"),
    sg("手部动作", "hand_up=举手|hand_on_own_cheek=托腮|hand_on_own_chin=托下巴|hand_on_own_face=手扶脸|head_rest=手撑头|peace_sign=比耶|double_peace=双比耶|v_over_eye=指眼V|waving=挥手|pointing=指向|pointing_at_viewer=指向观众|thumbs_up=点赞|finger_to_mouth=食指抵唇|shushing=嘘手势|salute=敬礼|fist=握拳|open_hand=张开手|reaching=伸手|reaching_towards_viewer=向镜头伸手|clenched_hands=紧握双手|spread_fingers=张开手指|heart_hands=比心|finger_heart=手指比心|claw_pose=爪子手势|paw_pose=爪手势|outstretched_arms=张开双臂|outstretched_hand=伸出手"),
    sg("头颈姿态", "head_tilt=歪头|head_down=低头|looking_over_shoulder=回头看|chin_up=抬下巴|nodding=点头|turning_head=转头|leaning_head=靠头|resting_head=枕头部"),
    sg("互动接触", "hug=拥抱|hugging=相拥|hug_from_behind=背后抱|holding_hands=牵手|carrying=抱起|princess_carry=公主抱|piggyback=背负|headpat=摸头|patting=轻拍|holding_hand=握手|arm_around_shoulder=搭肩|arm_around_waist=搂腰|leaning_on_person=靠在身上|back-to-back=背靠背|cheek-to-cheek=贴脸|kiss=接吻|cheek_kiss=吻脸颊|forehead_kiss=吻额头|holding=持物|holding_weapon=持武器|holding_cup=端杯|holding_flower=持花|holding_umbrella=撑伞|holding_book=拿书|holding_phone=拿手机|holding_food=拿食物|holding_hands_together=双手交握"),
    sg("日常行为", "sleeping=睡觉|eating=吃东西|drinking=喝水|reading=阅读|writing=书写|cooking=烹饪|cleaning=打扫|shopping=购物|singing=唱歌|playing_instrument=演奏|painting=绘画|gaming=打游戏|phone_call=打电话|texting=发消息|stretching_arms=伸懒腰|yawning=打哈欠|waking_up=刚醒|bathing=洗澡|brushing_hair=梳头|applying_makeup=化妆|exercising=运动"),
  ),
  cat(
    "画面构图",
    sg("景别", "portrait=肖像|close-up=特写|extreme_close-up=极特写|face_focus=面部焦点|head_shot=头部特写|bust_shot=半胸像|upper_body=上半身|cowboy_shot=七分身|lower_body=下半身|full_body=全身|wide_shot=远景|extreme_wide_shot=超远景|feet_out_of_frame=脚出框|cropped_legs=截腿|cropped_torso=截躯干|cut_in=插入特写"),
    sg("视角", "from_above=俯视|from_below=仰视|from_side=侧视|from_behind=背后视角|from_front=正面视角|dutch_angle=斜角|pov=主观视角|first-person_view=第一人称|profile=侧脸|three-quarter_view=四分之三视角|straight-on=正对|bird's-eye_view=鸟瞰|worm's-eye_view=虫视|overhead_shot=顶视|looking_up_at=向上看视角|fisheye=鱼眼"),
    sg("构图技法", "rule_of_thirds=三分构图|symmetry=对称|asymmetry=非对称|centered_composition=居中构图|diagonal_composition=对角构图|leading_lines=引导线|framing=框架构图|negative_space=留白|golden_ratio=黄金比例|depth_of_field=景深|bokeh=背景虚化|foreground=前景|background_focus=背景焦点|silhouette=剪影|reflection=倒影|vignette=暗角|panorama=全景|wide_angle=广角|telephoto=长焦|forced_perspective=强迫透视"),
    sg("焦点裁切", "blurry_background=背景虚化|blurry_foreground=前景虚化|sharp_focus=锐利对焦|soft_focus=柔焦|out_of_frame=出框|cropped=裁切|close_to_viewer=贴近镜头|distant=远处|partially_visible=部分可见|cut_off=截断|zoom_layer=变焦层"),
  ),
  cat(
    "光影画质",
    sg("光照", "cinematic_lighting=电影光|dramatic_lighting=戏剧光|rim_lighting=轮廓光|backlighting=逆光|volumetric_lighting=体积光|god_rays=丁达尔光|sunlight=阳光|dappled_sunlight=斑驳阳光|sidelighting=侧光|top-down_lighting=顶光|underlighting=底光|soft_lighting=柔光|hard_lighting=硬光|ambient_occlusion=环境光遮蔽|global_illumination=全局光照|studio_lighting=影棚光|natural_lighting=自然光|moonlight=月光|candlelight=烛光|firelight=火光|neon_lighting=霓虹光|colored_lighting=彩色光照|two-tone_lighting=双色光|lens_flare=镜头光晕|light_rays=光线|bloom=泛光|glow=辉光|sparkle=闪光|caustics=焦散|specular_highlights=高光"),
    sg("质量词", "masterpiece=杰作|best_quality=最佳质量|high_quality=高质量|very_aesthetic=高审美|aesthetic=审美佳|absurdres=超高分辨率|highres=高分辨率|ultra-detailed=超精细|extremely_detailed=极致细节|very_detailed=非常精细|highly_detailed=高细节|intricate_details=精密细节|official_art=官方画风|professional=专业级|8k=8K画质|4k=4K画质|sharp=锐利|detailed_background=精细背景|detailed_face=精致面部|perfect_anatomy=完美解剖|beautiful_detailed_eyes=精致眼睛"),
    sg("渲染氛围", "photorealistic=照片级真实|realistic=写实|hyperrealistic=超写实|cinematic=电影感|film_grain=胶片颗粒|chromatic_aberration=色差|depth_of_field=景深|motion_blur=动态模糊|hdr=高动态范围|ray_tracing=光线追踪|subsurface_scattering=次表面散射|glossy=光泽感|matte=哑光|atmospheric=氛围感|dreamy_atmosphere=梦幻氛围|ethereal=空灵|misty=朦胧|glowing=发光"),
  ),
  cat(
    "环境天气",
    sg("天气", "rain=雨|heavy_rain=暴雨|drizzle=细雨|snow=雪|snowing=下雪|blizzard=暴风雪|fog=雾|mist=薄雾|haze=霾|clouds=云|cloudy=多云|overcast=阴天|storm=风暴|thunderstorm=雷暴|lightning=闪电|rainbow=彩虹|wind=风|windy=有风|sandstorm=沙暴|hail=冰雹|sunshower=太阳雨|aurora=极光|sunny=晴朗|clear_sky=晴空"),
    sg("时间", "day=白天|daytime=白昼|morning=清晨|noon=正午|afternoon=午后|evening=傍晚|sunset=日落|sunrise=日出|dusk=黄昏|twilight=暮光|golden_hour=黄金时刻|blue_hour=蓝调时刻|night=夜晚|midnight=午夜|late_at_night=深夜"),
    sg("天空", "sky=天空|blue_sky=蓝天|cloudy_sky=多云天空|night_sky=夜空|starry_sky=星空|starlit_sky=繁星天空|sunset_sky=日落天空|gradient_sky=渐变天空|orange_sky=橙色天空|red_sky=红色天空|purple_sky=紫色天空|moon=月亮|full_moon=满月|crescent_moon=新月|harvest_moon=丰收月|stars=星星|shooting_star=流星|milky_way=银河|sun=太阳|cloud=云朵|nebula=星云"),
    sg("季节氛围", "spring=春|summer=夏|autumn=秋|winter=冬|cherry_blossoms=樱花|falling_petals=飘落花瓣|falling_leaves=落叶|autumn_leaves=秋叶|snowflakes=雪花|falling_snow=飘雪|heat_haze=热浪|humid=潮湿|cold=寒冷|warm_colors=暖色调|cozy=温馨|nostalgic=怀旧氛围"),
  ),
  cat(
    "场景",
    sg("室内", "indoors=室内|classroom=教室|bedroom=卧室|kitchen=厨房|bathroom=浴室|living_room=客厅|dining_room=餐厅|cafe=咖啡馆|restaurant=餐厅|library=图书馆|office=办公室|hospital=医院|hospital_room=病房|school_hallway=学校走廊|gym=体育馆|locker_room=更衣室|laboratory=实验室|workshop=工坊|art_studio=画室|bar=酒吧|nightclub=夜店|hotel_room=酒店房间|dormitory=宿舍|attic=阁楼|basement=地下室|greenhouse=温室|store=商店|bookstore=书店|train_interior=车厢内|elevator=电梯|stairwell=楼梯间|shrine_interior=神社内|throne_room=王座厅|dungeon_interior=地牢内"),
    sg("城市", "cityscape=城市景观|city=城市|street=街道|alley=小巷|crosswalk=人行横道|sidewalk=人行道|rooftop=屋顶|skyscraper=摩天楼|downtown=市中心|shopping_district=商业街|shopping_mall=商场|market=市集|train_station=火车站|subway_station=地铁站|bus_stop=公交站|bridge=桥|highway=高速路|parking_lot=停车场|construction_site=工地|industrial=工业区|harbor=港口|pier=码头|plaza=广场|fountain=喷泉|neon_city=霓虹都市|cyberpunk_city=赛博都市"),
    sg("自然", "outdoors=户外|nature=自然|forest=森林|bamboo_forest=竹林|jungle=丛林|woods=树林|mountain=山|mountainous_horizon=山峦|hill=丘陵|cliff=悬崖|valley=山谷|cave=洞穴|ocean=海洋|sea=大海|beach=海滩|coast=海岸|island=岛屿|lake=湖|pond=池塘|river=河流|stream=溪流|waterfall=瀑布|field=田野|grassland=草原|meadow=草甸|flower_field=花田|rice_paddy=稻田|wheat_field=麦田|desert=沙漠|oasis=绿洲|canyon=峡谷|glacier=冰川|volcano=火山|swamp=沼泽|garden=花园|park=公园|cherry_blossom_tree=樱花树"),
    sg("校园生活", "school=学校|schoolyard=校园|playground=操场|sports_field=运动场|school_rooftop=学校屋顶|cafeteria=食堂|infirmary=保健室|club_room=社团室|music_room=音乐室|science_room=理科室|chalkboard=黑板|school_desk=课桌|locker=储物柜"),
    sg("幻想场景", "fantasy=幻想世界|castle=城堡|palace=宫殿|ruins=废墟|ancient_ruins=远古遗迹|temple=神殿|shrine=神社|church=教堂|cathedral=大教堂|tower=塔|dungeon=地牢|crypt=地下墓室|floating_island=浮空岛|sky_city=天空之城|enchanted_forest=魔法森林|magic_academy=魔法学院|fairy_tale=童话场景|underworld=冥界|heaven=天界|wonderland=仙境|dreamscape=梦境"),
    sg("科幻场景", "sci-fi=科幻|spaceship_interior=飞船内部|space_station=太空站|space=太空|outer_space=外太空|planet=行星|alien_planet=外星球|futuristic_city=未来都市|laboratory_sci-fi=科幻实验室|cyberspace=赛博空间|server_room=机房|control_room=控制室|hangar=机库|wasteland=废土|post-apocalypse=末世|ruined_city=废墟都市|dystopia=反乌托邦"),
  ),
  cat(
    "物品道具",
    sg("武器", "weapon=武器|sword=剑|greatsword=巨剑|katana=武士刀|rapier=刺剑|dagger=匕首|knife=刀|axe=斧|battle_axe=战斧|spear=矛|lance=长枪|polearm=长柄武器|halberd=戟|scythe=镰刀|hammer=锤|war_hammer=战锤|mace=钉头锤|club=棍棒|staff=法杖|wand=魔杖|bow_(weapon)=弓|crossbow=弩|arrow=箭|gun=枪|handgun=手枪|pistol=手枪|revolver=左轮|rifle=步枪|sniper_rifle=狙击枪|assault_rifle=突击步枪|shotgun=霰弹枪|machine_gun=机枪|cannon=加农炮|shield=盾|buckler=圆盾|whip=鞭|chain_weapon=链锤|nunchaku=双截棍|kunai=苦无|shuriken=手里剑|energy_sword=能量剑|laser_gun=激光枪|gauntlet_weapon=拳套"),
    sg("食物", "food=食物|cake=蛋糕|cupcake=纸杯蛋糕|cookie=曲奇|chocolate=巧克力|candy=糖果|lollipop=棒棒糖|ice_cream=冰淇淋|ice_cream_cone=甜筒|parfait=芭菲|pudding=布丁|donut=甜甜圈|macaron=马卡龙|pancake=松饼|waffle=华夫饼|crepe=可丽饼|bread=面包|sandwich=三明治|hamburger=汉堡|pizza=披萨|sushi=寿司|sashimi=刺身|onigiri=饭团|rice=米饭|ramen=拉面|noodles=面条|udon=乌冬|bento=便当|dango=团子|takoyaki=章鱼烧|taiyaki=鲷鱼烧|fruit=水果|apple=苹果|strawberry=草莓|watermelon=西瓜|orange_(fruit)=橙子|banana=香蕉|cherry=樱桃|grapes=葡萄|peach=桃子|vegetables=蔬菜|egg=鸡蛋|meat=肉|fish_(food)=鱼"),
    sg("饮品", "drink=饮料|coffee=咖啡|tea=茶|teacup=茶杯|bubble_tea=珍珠奶茶|milk=牛奶|juice=果汁|soda=汽水|cocktail=鸡尾酒|wine=葡萄酒|wine_glass=红酒杯|beer=啤酒|sake=清酒|water_bottle=水瓶|can=易拉罐|mug=马克杯|coffee_cup=咖啡杯|smoothie=冰沙|milkshake=奶昔"),
    sg("乐器", "instrument=乐器|guitar=吉他|electric_guitar=电吉他|acoustic_guitar=木吉他|bass_guitar=贝斯|piano=钢琴|grand_piano=三角钢琴|keyboard_(instrument)=电子琴|violin=小提琴|cello=大提琴|flute=长笛|clarinet=单簧管|saxophone=萨克斯|trumpet=小号|drum=鼓|drum_set=架子鼓|harp=竖琴|ukulele=尤克里里|microphone=麦克风|headphones=耳机|shamisen=三味线|koto=古筝|erhu=二胡"),
    sg("电子科技", "smartphone=智能手机|phone=手机|cellphone=手机|laptop=笔记本电脑|computer=电脑|tablet=平板|monitor=显示器|television=电视|camera=相机|video_camera=摄像机|game_controller=游戏手柄|handheld_game_console=掌机|vr_headset=VR头显|drone=无人机|robot_companion=机器人伙伴|earphones=入耳耳机|smartwatch=智能手表|speaker=音箱|console=游戏机"),
    sg("文具学习", "book=书|open_book=翻开的书|notebook=笔记本|pencil=铅笔|pen=钢笔|brush=画笔|paintbrush=毛笔|paper=纸|scroll=卷轴|map=地图|letter=信|envelope=信封|backpack_school=书包|ruler=尺|eraser=橡皮|chalk=粉笔|easel=画架|sketchbook=速写本|diary=日记本"),
    sg("日常道具", "umbrella=伞|parasol=阳伞|cup=杯子|plate=盘子|bottle=瓶子|basket=篮子|box=盒子|gift=礼物|gift_box=礼盒|balloon=气球|teddy_bear=泰迪熊|stuffed_animal=玩偶|stuffed_toy=毛绒玩具|doll=娃娃|pillow=枕头|cushion=靠垫|blanket=毯子|clock=时钟|pocket_watch=怀表|key=钥匙|lantern=灯笼|candle=蜡烛|mirror=镜子|fan=扇子|folding_fan=折扇|paper_fan=团扇|rope=绳子|chain=链子|flag=旗帜|coin=硬币|jewelry_box=首饰盒|perfume=香水|cigarette=香烟|lighter=打火机|keychain=钥匙扣"),
    sg("体育交通", "ball=球|soccer_ball=足球|basketball=篮球|baseball=棒球|tennis_racket=网球拍|skateboard=滑板|bicycle=自行车|motorcycle=摩托车|car=汽车|sports_car=跑车|train=火车|bus=公交车|airplane=飞机|boat=船|sailboat=帆船|ship=轮船|scooter=踏板车|helmet=头盔|surfboard=冲浪板|skis=滑雪板"),
    sg("植物花卉", "flower=花|rose=玫瑰|red_rose=红玫瑰|blue_rose=蓝玫瑰|sunflower=向日葵|tulip=郁金香|lily=百合花|lotus=莲花|sakura=樱花|cherry_blossom=樱花|plum_blossom=梅花|chrysanthemum=菊花|hibiscus=扶桑花|daisy=雏菊|lavender=薰衣草|hydrangea=绣球花|spider_lily=彼岸花|wisteria=紫藤|morning_glory=牵牛花|carnation=康乃馨|petals=花瓣|flower_petals=花瓣|leaf=叶子|leaves=树叶|ivy=常春藤|fern=蕨类|bamboo=竹|tree=树|palm_tree=棕榈树|pine_tree=松树|mushroom=蘑菇|cactus=仙人掌|bouquet=花束|potted_plant=盆栽|vines=藤蔓"),
    sg("节日道具", "fireworks=烟花|sparkler=仙女棒|lantern_festival=灯笼节|jack-o'-lantern=南瓜灯|christmas_tree=圣诞树|christmas_ornaments=圣诞饰品|gift_wrapping=礼品包装|confetti=彩纸屑|party_popper=拉炮|new_year=新年|valentine=情人节|chocolate_heart=巧克力心|wind_chime=风铃|paper_lantern=纸灯笼|kadomatsu=门松|streamers=彩带"),
  ),
  cat(
    "色彩特效",
    sg("色调", "monochrome=单色|greyscale=灰阶|sepia=棕褐色|pastel_colors=粉彩色|vivid_colors=鲜艳色|muted_colors=低饱和色|limited_palette=有限配色|gradient=渐变|colorful=多彩|high_contrast=高对比|low_contrast=低对比|warm_colors=暖色调|cool_colors=冷色调|neon_palette=霓虹配色|earth_tones=大地色|monochromatic=单色调|duotone=双色调|saturated=高饱和|desaturated=去饱和|color_splash=局部彩色"),
    sg("特效", "bokeh=焦外光斑|motion_blur=动态模糊|chromatic_aberration=色差|sparkle=闪光粒子|glowing=发光|glitter=亮粉|light_particles=光粒子|floating_particles=漂浮粒子|magic_particles=魔法粒子|film_grain=胶片颗粒|lens_flare=镜头光晕|light_leak=漏光|glitch=故障效果|hologram_effect=全息效果|smoke=烟雾|fog_effect=雾效|fire=火焰|flames=火苗|explosion=爆炸|electricity=电流|magic_aura=魔法气场|energy_glow=能量辉光|water_splash=水花|bubbles=气泡|ripples=涟漪|shattered_glass=碎玻璃|petals_falling=飘落花瓣"),
    sg("后期", "vignette=暗角|grain=颗粒|vintage_filter=复古滤镜|cross_processing=交叉冲印|bloom_effect=泛光效果|tilt-shift=移轴|double_exposure=双重曝光|light_rays=光束|sunbeam=阳光束|volumetric_fog=体积雾|depth_haze=景深雾|color_grading=调色|cinematic_color=电影调色"),
  ),
  cat(
    "生物",
    sg("动物", "cat=猫|black_cat=黑猫|kitten=小猫|dog=狗|puppy=小狗|fox=狐狸|wolf=狼|rabbit=兔子|bunny=兔|hamster=仓鼠|squirrel=松鼠|mouse=老鼠|horse=马|deer=鹿|sheep=羊|goat=山羊|cow=牛|pig=猪|panda=熊猫|bear=熊|tiger=虎|lion=狮|leopard=豹|elephant=象|monkey=猴|raccoon=浣熊|hedgehog=刺猬|otter=水獭|seal=海豹|penguin=企鹅|bird=鸟|owl=猫头鹰|crow=乌鸦|eagle=鹰|parrot=鹦鹉|swan=天鹅|duck=鸭|chicken=鸡|peacock=孔雀|fish=鱼|koi=锦鲤|goldfish=金鱼|shark=鲨鱼|dolphin=海豚|whale=鲸|octopus=章鱼|jellyfish=水母|turtle=乌龟|frog=青蛙|snake=蛇|lizard=蜥蜴|crab=螃蟹"),
    sg("昆虫", "butterfly=蝴蝶|moth=飞蛾|dragonfly=蜻蜓|bee=蜜蜂|ladybug=瓢虫|firefly=萤火虫|beetle=甲虫|spider=蜘蛛|ant=蚂蚁|cicada=蝉|grasshopper=蚱蜢|caterpillar=毛毛虫"),
    sg("幻想生物", "dragon=龙|eastern_dragon=东方龙|wyvern=飞龙|fairy=妖精|pixie=小精灵|mermaid=人鱼|unicorn=独角兽|pegasus=飞马|phoenix=凤凰|griffin=狮鹫|kirin=麒麟|slime_(creature)=史莱姆|golem=魔像|chimera=奇美拉|hydra=九头蛇|kraken=海妖|demon_(creature)=恶魔|angel_(creature)=天使|spirit=精灵体|familiar=使魔|monster=怪物|elemental=元素生物|will-o'-the-wisp=鬼火|nine-tailed_fox=九尾狐"),
  ),
  cat(
    "风格画风",
    sg("媒介", "watercolor_(medium)=水彩|oil_painting_(medium)=油画|acrylic_paint=丙烯|gouache=水粉|ink_(medium)=水墨|sumi-e=水墨画|sketch=素描|pencil_drawing=铅笔画|charcoal_(medium)=炭笔|lineart=线稿|colored_pencil=彩铅|pastel_(medium)=色粉|crayon=蜡笔|marker_(medium)=马克笔|digital_painting=数字绘画|pixel_art=像素画|vector_art=矢量画|papercraft=剪纸|collage=拼贴|traditional_media=传统媒介|cg=电脑绘图|3d=3D渲染|claymation=黏土动画"),
    sg("流派画风", "anime=动漫风|manga=漫画风|realistic=写实|semi-realistic=半写实|chibi=Q版|moe=萌系|retro_artstyle=复古画风|1980s_(style)=80年代风|1990s_(style)=90年代风|ukiyo-e=浮世绘|art_nouveau=新艺术|art_deco=装饰艺术|impressionism=印象派|surrealism=超现实主义|minimalism=极简主义|pop_art=波普艺术|gothic_art=哥特艺术|fantasy_art=奇幻画风|concept_art=概念美术|cel_shading=赛璐璐|flat_color=平涂|painterly=绘画感|sketchy=速写感|lineless=无线条|cartoon=卡通|comic=美式漫画|webtoon=条漫"),
    sg("风格氛围", "cyberpunk=赛博朋克|steampunk=蒸汽朋克|dieselpunk=柴油朋克|solarpunk=太阳朋克|vaporwave=蒸汽波|synthwave=合成波|dark_fantasy=黑暗奇幻|high_fantasy=高奇幻|fairy_tale_style=童话风|horror=恐怖风|noir=黑色电影|whimsical=奇思妙想|ethereal_style=空灵风|dreamcore=梦核|cottagecore=田园核|kawaii=可爱风|y2k=千禧风"),
  ),
  cat(
    "魔法奇幻",
    sg("魔法", "magic=魔法|magic_circle=魔法阵|spell=法术|spellcasting=施法|aura=气场|magical_aura=魔法气场|rune=符文|runes=符文阵|summoning=召唤|enchantment=附魔|curse=诅咒|potion=药水|spellbook=魔法书|grimoire=魔典|crystal_ball=水晶球|magic_staff=法杖|magic_wand=魔杖|elemental_magic=元素魔法|fire_magic=火魔法|ice_magic=冰魔法|lightning_magic=雷魔法|holy_magic=圣光魔法|dark_magic=黑魔法|teleportation=瞬移|levitation=悬浮"),
    sg("元素能量", "fire=火元素|flames=火焰|ice=冰元素|frost=霜冻|lightning=闪电|electricity=电|water_element=水元素|wind_element=风元素|earth_element=土元素|light_element=光元素|darkness=黑暗|energy=能量|energy_ball=能量球|glowing_energy=能量辉光|plasma=等离子|stardust=星尘|cosmic=宇宙能量"),
    sg("科幻设定", "robot=机器人|mecha=机甲|humanoid_robot=人形机器人|android=仿生人|cyborg=改造人|spaceship=飞船|spacesuit=宇航服|laser=激光|hologram=全息投影|neon_lights=霓虹灯|circuit_board=电路板|cybernetics=义体|power_armor=动力装甲|forcefield=力场|portal=传送门|wormhole=虫洞|ai_core=AI核心|drone=无人机|exoskeleton=外骨骼"),
  ),
  cat(
    "反向提示词",
    sg("画质负面", "lowres=低分辨率|low_quality=低质量|worst_quality=最差质量|normal_quality=普通质量|jpeg_artifacts=压缩失真|blurry=模糊|out_of_focus=失焦|pixelated=马赛克|noise=噪点|grainy=颗粒过多|compression_artifacts=压缩伪影|aliasing=锯齿|oversaturated=过饱和|overexposed=过曝|underexposed=欠曝|washed_out=褪色|banding=色阶断层"),
    sg("结构负面", "bad_anatomy=解剖错误|bad_hands=畸形手|bad_proportions=比例错误|bad_feet=畸形脚|extra_digits=多余手指|fewer_digits=缺少手指|missing_fingers=缺指|extra_fingers=多指|fused_fingers=手指粘连|extra_arms=多臂|extra_legs=多腿|extra_limbs=多余肢体|missing_limbs=缺肢|malformed_limbs=肢体畸形|disfigured=畸形|deformed=变形|mutated=异变|mutation=突变|fused_limbs=肢体粘连|long_neck=长脖|extra_heads=多头|asymmetrical_eyes=不对称眼|crossed_eyes=斗鸡眼|misaligned_eyes=眼睛错位|cloned_face=克隆脸"),
    sg("内容负面", "watermark=水印|signature=签名|username=用户名|artist_name=画师名|text=文字乱入|english_text=英文乱入|logo=标志|stamp=印章|border=边框|frame=画框|cropped=被裁切|jpeg=JPEG痕迹|error=错误|duplicate=重复|multiple_views=多视图|monochrome_unwanted=非预期单色|censored=和谐马赛克|bar_censor=黑条遮挡|extra_background_people=多余路人|messy=杂乱|cluttered=拥挤"),
  ),
];

// Second authored batch — fresh tags folded into the same categories/subgroups.
export const CAPSULE_EXTRA2: CapsuleCategory[] = [
  cat(
    "人物",
    sg("身份", "warrior=战士|mage=法师|wizard=巫师|sorceress=女术士|archer=弓箭手|ranger=游侠|healer=治疗者|cleric=牧师|paladin=圣骑士|rogue=盗贼|druid=德鲁伊|summoner=召唤师|berserker=狂战士|valkyrie=瓦尔基里|gunner=枪手|tamer=驯兽师|alchemist=炼金术士|necromancer=死灵法师|bard=吟游诗人|swordsman=剑士|swordswoman=女剑士|gunslinger=枪客|martial_artist=武术家|monk_(class)=武僧|dragoon=龙骑兵|enchantress=魅惑女巫|exorcist=驱魔人|onmyouji=阴阳师|vtuber=虚拟主播|librarian=图书管理员|journalist=记者|photographer=摄影师|painter=画家|sculptor=雕塑家|florist=花店店员|baker=面包师|barista=咖啡师|tailor=裁缝|astronaut=宇航员|pilot=飞行员|firefighter=消防员|lifeguard=救生员|veterinarian=兽医|dentist=牙医|judge=法官|lawyer=律师|professor_(female)=女教授|maid_(head)=女仆长|butler=管家|housekeeper=管家女仆|governess=家庭教师|courtesan=名伶|geisha=艺伎|oiran=花魁"),
    sg("种族", "half-demon=半魔|half-dragon=半龙|half-angel=半天使|demigod=半神|deity=神祇|god=神|goddess=女神|spirit_being=灵体|ghost_girl=幽灵少女|living_doll=活人偶|automaton=自动人偶|gynoid=女机器人|reploid=类人机械|dryad=树精|nymph=宁芙|siren=塞壬|gorgon=蛇发女妖|valkyrie_(race)=女武神|amazon=亚马逊女战士|giant=巨人|halfling=半身人|gnome=侏儒|fae=妖精族|undead=不死族|ghoul=食尸鬼|wraith_(race)=怨灵|moth_girl=蛾娘|bee_girl=蜂娘|spider_girl=蛛娘|scorpion_girl=蝎娘|dragon_loli=龙萝|kemono=兽娘"),
    sg("体型", "athletic=运动型|fit=健美|lean=精瘦|petite_frame=娇小骨架|delicate=纤弱|frail=瘦弱|stocky=敦实|buff=壮硕|ripped=精壮|busty_figure=丰胸身材|slim_waist=细腰身|wide_waist=粗腰|broad_back=宽背|long_torso=长躯|short_stature=矮小|towering=高大|petite_and_curvy=娇小有料|toned_legs=结实腿部|defined_muscles=清晰肌肉"),
    sg("发型", "updo=盘发|half_updo=半盘发|braided_bun=辫发髻|braided_ponytail=辫子马尾|braided_crown=辫子王冠|space_buns=双团子|odango=团子头|chignon=低发髻|french_twist=法式盘发|beehive=蜂窝头|victory_rolls=胜利卷|finger_waves=手推波纹|perm=烫卷发|tousled_hair=慵懒乱发|wind-blown_hair=风吹乱发|wet_messy_hair=湿乱发|hair_up=扎起头发|hair_down=放下头发|loose_hair=松散发|partially_braided_hair=部分编发|hair_rings=发环|side_bun=侧发髻|low_bun=低发髻|high_bun=高发髻"),
    sg("发色", "azure_hair=天蓝发|teal_hair=青绿发|mint_hair=薄荷发|lavender_hair=薰衣草发|magenta_hair=洋红发|maroon_hair=栗红发|burgundy_hair=酒红发|navy_hair=藏青发|cyan_hair=青色发|peach_hair=蜜桃发|cream_hair=奶油发|ash_blonde_hair=灰金发|honey_blonde_hair=蜜金发|chestnut_hair=栗色发|auburn_hair=赤褐发|salt_and_pepper_hair=花白发|bicolored_hair=双色发|tricolor_hair=三色发|ombre_hair=渐层染|highlighted_hair=挑染发"),
    sg("眼型眼神", "gentle_eyes=温柔眼神|sharp_eyes=锐利眼神|droopy_eyes=下垂眼|almond_eyes=杏仁眼|round_eyes=圆眼|narrow_eyes=细长眼|hooded_eyes=厚眼睑|monolid=单眼皮|double_eyelid=双眼皮|glowing_pupils=发光瞳|reflective_eyes=反光眼|glassy_eyes=玻璃眼神|piercing_gaze=锐利凝视|seductive_eyes=诱惑眼神|innocent_eyes=纯真眼神|fierce_eyes=凶狠眼神|tearful=泪眼|squinting=眯眼|blank_stare=呆滞凝视|sidelong_glance=斜睨"),
    sg("面部特征", "teardrop_mole=泪痣|under-eye_bags=眼袋|dimples=酒窝|sharp_chin=尖下巴|round_face=圆脸|oval_face=鹅蛋脸|high_cheekbones=高颧骨|button_nose=小翘鼻|aquiline_nose=鹰钩鼻|cleft_chin=下巴沟|face_paint=脸彩绘|tribal_markings=部落纹路|tear_tattoo=泪滴纹身|cheek_scar=脸颊疤|nose_scar=鼻梁疤|burn_scar=烧伤疤|stitches=缝合痕|bandaid_on_face=脸贴创可贴|glowing_markings=发光纹路|war_paint=战妆"),
    sg("胸部腰腹", "gigantic_breasts=超巨乳|breast_curtains=胸帘|asymmetrical_breasts=不对称胸|breasts_apart=分开的胸|center_opening=中开胸|toned_abs=结实腹肌|defined_navel=明显肚脐|soft_belly=柔软小腹|tummy=小肚|hip_bones=胯骨|love_handles=腰间软肉|backless=露背|sideless=露侧腰"),
  ),
  cat(
    "服饰",
    sg("上衣", "peplum_top=褶饰上衣|bolero=波蕾若小外套|kimono_top=和服上衣|haori=羽织|happi=法被|samue=作务衣|kosode=小袖|virgin_killer_sweater=露背毛衣|off-shoulder_sweater=露肩毛衣|aran_sweater=爱尔兰毛衣|cable_knit=麻花针织|bandeau=抹胸带|bralette=无钢圈内衣|halter_top=挂脖上衣|racerback=工字背心|peasant_top=田园上衣|smock=罩衫|tunic=束腰衣|jersey=运动衫|polo_shirt=Polo衫|henley_shirt=亨利衫|flannel_shirt=法兰绒衫|plaid_shirt=格子衬衫|striped_shirt=条纹衫|graphic_tee=印花T恤|long_coat=长大衣|duster_coat=风尘衣|peacoat=双排扣大衣|parka=派克大衣|windbreaker=风衣夹克|varsity_jacket=校队夹克|kimono_jacket=和风外套|cropped_jacket=短款夹克"),
    sg("连衣裙", "a-line_dress=A字裙|empire_dress=高腰裙|tiered_dress=多层蛋糕裙|mermaid_dress=鱼尾裙|wrap_dress=裹身裙|shirt_dress=衬衫裙|tea_dress=茶歇裙|prom_dress=毕业舞会裙|party_dress=派对裙|summer_dress=夏日连衣裙|knit_dress=针织裙|qipao_dress=旗袍裙|kimono_dress=和服裙|jumper_dress=背心裙|smock_dress=罩衫裙|babydoll_dress=娃娃裙|bodycon_dress=紧身连衣裙|maxi_dress=长摆连衣裙|midi_dress=中长裙|floral_dress=碎花裙|polka_dot_dress=圆点裙|lace_dress=蕾丝裙|velvet_dress=丝绒裙|satin_dress=缎面裙"),
    sg("下装", "skort=裙裤|tennis_skirt=网球裙|circle_skirt=伞裙|tutu=芭蕾裙|hoop_skirt=裙撑|sarong=沙笼|loincloth=缠腰布|fundoshi=兜裆布|chaps=皮套裤|culotte=阔腿裙裤|wrap_skirt=裹身裙|asymmetrical_skirt=不对称裙|layered_skirt=多层裙|ruffled_skirt=褶边裙|denim_miniskirt=牛仔迷你裙|leather_skirt=皮裙|cargo_shorts=工装短裤|athletic_shorts=运动短裤|board_shorts=沙滩裤|gym_shorts=体育短裤|jodhpurs=马裤|breeches=马裤|tights_pants=紧身长裤"),
    sg("制服", "track_uniform=田径服|fencing_uniform=击剑服|judo_gi=柔道服|karate_gi=空手道服|kendo_uniform=剑道服|baseball_uniform=棒球服|basketball_uniform=篮球服|soccer_uniform=足球服|volleyball_uniform=排球服|swim_team_uniform=游泳队服|marching_band=行进乐队服|graduation_gown=学位服|choir_robe=唱诗袍|altar_server=祭坛服|military_dress_uniform=军礼服|camouflage_uniform=迷彩服|pilot_suit=飞行服|spacesuit_uniform=宇航服|hazmat_suit=防化服|prisoner_uniform=囚服|hospital_gown=病号服|hotel_uniform=酒店制服|train_conductor=列车员制服"),
    sg("泳装内衣", "frilled_swimsuit=荷叶边泳装|halter_bikini=挂脖比基尼|bandeau_bikini=抹胸比基尼|high-leg_bikini=高叉比基尼|crochet_bikini=钩织比基尼|polka_dot_bikini=圆点比基尼|striped_bikini=条纹比基尼|o-ring_bikini=圆环比基尼|slingshot_swimsuit=吊带泳装|microkini=超微比基尼|tan_lines_swimsuit=晒痕泳装|swim_briefs=泳裤|jammers=及膝泳裤|lace_bra=蕾丝胸罩|push-up_bra=聚拢内衣|strapless_bra=无肩带内衣|bralette_set=内衣套装|lace_panties=蕾丝内裤|thong_panties=丁字内裤|garter=吊袜带|teddy=连体内衣|bodysuit=连体衣|fishnet_bodysuit=渔网连体衣"),
    sg("腿袜", "over-the-knee_socks=过膝长袜|crew_socks=中筒袜|no-show_socks=隐形袜|toe_socks=分趾袜|striped_socks=条纹袜|argyle_socks=菱格袜|ribbed_socks=罗纹袜|lace_socks=蕾丝袜|frilled_socks=花边袜|seamed_stockings=后缝丝袜|sheer_stockings=透明丝袜|opaque_tights=不透明裤袜|patterned_tights=印花裤袜|footless_tights=无脚裤袜|stirrup_legwear=踩脚裤袜|legwarmers=暖腿套|compression_stockings=压力袜|single_sock=单只袜"),
    sg("鞋靴", "mules=穆勒鞋|espadrilles=麻底鞋|wedge_heels=坡跟鞋|kitten_heels=猫跟鞋|oxfords=牛津鞋|brogues=布洛克鞋|moccasins=莫卡辛鞋|clogs=木底鞋|tabi_socks=分趾鞋袜|jika-tabi=分趾鞋|waraji=草鞋|platform_boots=厚底靴|lace-up_boots=系带靴|cuffed_boots=翻边靴|cowboy_boots=牛仔靴|chelsea_boots=切尔西靴|hiking_boots=登山靴|ski_boots=滑雪靴|high-top_sneakers=高帮鞋|canvas_shoes=帆布鞋|ballet_shoes=芭蕾鞋|pointe_shoes=足尖鞋|sports_shoes=运动鞋"),
    sg("头饰帽子", "deerstalker=猎鹿帽|pillbox_hat=药盒帽|cloche_hat=钟形帽|ushanka=雷锋帽|conical_hat=斗笠|jingasa=阵笠|kasa=斗笠|eboshi=乌帽子|hennin=尖顶帽|animal_hood=动物兜帽|cat_hood=猫兜帽|frog_hood=青蛙兜帽|bear_hood=熊兜帽|hooded_cloak=兜帽斗篷|wimple=修女头巾|headdress=头饰冠|feathered_headdress=羽毛头饰|flower_crown=花冠|laurel_crown=月桂冠|antler_headband=鹿角发箍|cat_ear_headphones=猫耳耳机|horned_headband=角发箍|maid_hairband=女仆发箍"),
    sg("颈饰", "bolo_tie=波洛领带|ribbon_choker=丝带项圈|velvet_choker=丝绒项圈|spiked_choker=铆钉项圈|pearl_choker=珍珠项圈|cross_necklace=十字项链|heart_necklace=爱心项链|locket_necklace=吊坠盒项链|chain_necklace=链条项链|gemstone_necklace=宝石项链|bib_necklace=围兜项链|fur_scarf=毛皮围巾|knit_scarf=针织围巾|cravat_tie=领巾结|ribbon_tie=丝带领结|loose_necktie=松领带"),
    sg("装饰元素", "lace_ribbon=蕾丝丝带|satin_ribbon=缎带|bow_(clothing)=服饰蝴蝶结|back_bow=背后蝴蝶结|front_bow=前襟蝴蝶结|ruffled_collar=荷叶领|peter_pan_collar=娃娃领|frilled_sleeves=荷叶袖|puffy_short_sleeves=泡泡短袖|bell_sleeves=喇叭袖|flutter_sleeves=飘逸袖|drawstring=抽绳|grommet=气眼|rivets=铆钉|piping=滚边|epaulette=肩章|aiguillette=肩绶|fringe_(decoration)=流苏边|pom_pom_(clothes)=毛球|brooch_pin=胸针别针|safety_pin=安全别针|patch_(clothing)=布贴"),
    sg("民族风格", "kebaya=可巴雅|samurai_armor=武士铠甲|kabuto=兜（头盔）|do-maru=胴丸|geisha_attire=艺伎服|oiran_attire=花魁服|miko_attire=巫女服|kannushi=神主服|monk_robe=僧袍|kasaya=袈裟|tang_suit=唐装|ruqun=襦裙|aoqun=袄裙|mamianqun=马面裙|kalasiris=古埃及衫|toga=托加袍|chiton=希腊长衣|highland_dress=苏格兰裙|kilt=苏格兰短裙|dashiki=达西基|kente=肯特布"),
  ),
  cat(
    "表情",
    sg("情绪", "ecstatic=狂喜|content=满足|cheerful=愉快|calm=平静|relaxed=放松|relieved=如释重负|hopeful=充满希望|curious=好奇|surprised_happy=惊喜|amused=好笑|gleeful=欢欣|tender_smile=温柔笑|bittersweet=苦乐参半|wistful=惆怅|gloomy=阴郁|despair=绝望|frustrated=沮丧|irritated=烦躁|enraged=暴怒|grumpy=闷闷不乐|sulking=生闷气|jealous=嫉妒|envious=羡慕|guilty=愧疚|ashamed=羞愧|terrified=惊恐|anxious=焦虑|panicked=惊慌|startled=吓一跳|exhausted=精疲力竭|dazed=发懵|spaced_out=放空|drunk=醉态|lovestruck=痴情|flirty=挑逗|shy_smile=羞涩笑|cocky=自负|condescending=不屑|menacing=威吓|sinister=阴险"),
    sg("脸颊嘴部", "biting_thumb=咬拇指|cheek_pinch=捏脸颊|puffed_cheeks=鼓气脸颊|chewing=咀嚼|whistling=吹口哨|kissing=亲吻状|blowing_kiss=飞吻|pursed_lips=抿唇|open_smile=咧嘴开笑|toothy_grin=露齿笑|smug_grin=得意笑|frown=皱眉撇嘴|grimace=做鬼脸|gasp=倒吸气|sticking_tongue_out=伸舌头|tongue_in_cheek=舌顶腮|licking=舔|biting=咬"),
    sg("视线", "looking_through_glasses=透过眼镜看|peeking_out=探头偷看|gazing_into_distance=眺望远方|making_eye_contact=四目相对|looking_at_food=看着食物|looking_at_phone=看手机|looking_at_mirror=照镜子|glancing_back=回头一瞥|upward_glance=上瞥|lowered_gaze=低垂视线|wide_eyed_stare=瞪大眼睛|seductive_glance=媚眼一瞥"),
  ),
  cat(
    "动作姿势",
    sg("站立", "hands_clasped=双手交握|hands_in_pockets=插兜|hand_in_pocket=单手插兜|arms_at_sides=双臂垂放|crossed_arms_under_chest=胸下抱臂|hand_on_chest=手按胸口|hand_on_own_chest=手抚胸|hands_behind_head=双手抱头|stretching_up=向上伸展|hands_clasped_behind_back=背后交握|presenting=展示姿势|model_pose=模特姿势|catwalk=猫步|power_stance=霸气站姿|shy_pose=害羞姿势|knock-kneed=内八站|pigeon-toed=内八字"),
    sg("坐卧", "sitting_sideways=侧坐|sitting_backwards=倒坐|straddling=跨坐|sitting_on_lap=坐腿上|lap_sitting=坐膝盖|reclining_on_elbow=肘撑斜躺|lying_on_side=侧卧|lying_on_back=仰卧|lying_on_stomach=趴卧|curled_up=蜷成一团|hugging_knees=抱膝坐|legs_up=抬腿|legs_dangling=垂腿|sitting_on_railing=坐栏杆|sitting_on_table=坐桌上|sitting_on_windowsill=坐窗台|crossed_ankles=交叉脚踝"),
    sg("手部动作", "adjusting_hair=拨弄头发|adjusting_glasses=扶眼镜|adjusting_clothes=整理衣服|hand_in_hair=手插头发|hand_on_head=手放头上|hand_on_neck=手扶颈|holding_skirt=提裙|skirt_hold=拎裙摆|covering_face=捂脸|covering_eyes=遮眼|covering_chest=遮胸|peace_symbol=胜利手势|finger_gun=手指枪|ok_sign=OK手势|crossed_fingers=交叉手指|pinky_promise=拉钩|beckoning=招手|facepalm=扶额|saluting=行礼|praying_hands=祈祷手|clapping=鼓掌|pointing_up=指上|pointing_down=指下|holding_chin=托下巴"),
    sg("动态", "mid-jump=跳跃中|mid-fall=坠落中|mid-spin=旋转中|leaping_forward=向前跃|lunging=突进|dodging=闪避|sprinting=冲刺|skidding=急停|sliding=滑行|cartwheel=侧手翻|backflip=后空翻|twirling=转圈|swinging=荡秋千|surfing=冲浪|skating=滑冰|skateboarding=滑板|martial_arts_pose=武术姿势|sword_stance=持剑架势|drawing_sword=拔剑|aiming_bow=拉弓瞄准|casting_spell=施法动作|charging_attack=蓄力攻击"),
    sg("互动接触", "back_hug=背后拥抱|bear_hug=熊抱|group_hug=群抱|holding_hands_walking=牵手散步|hand_holding=十指相扣|piggyback_ride=骑背|shoulder_carry=扛肩|lap_pillow=膝枕|head_on_shoulder=头靠肩|leaning_together=相互依偎|whispering=耳语|hand_on_another's_face=手抚他人脸|pinching_cheek=捏脸|feeding=喂食|hair_brushing=梳头发|dancing_together=共舞|fist_bump=碰拳|high_five=击掌|handshake=握手|tug=拉扯衣袖"),
    sg("日常行为", "stretching_in_bed=床上伸懒腰|combing_hair=梳头|tying_hair=扎头发|putting_on_shoes=穿鞋|tying_shoelaces=系鞋带|buttoning_shirt=扣纽扣|holding_umbrella_walking=撑伞行走|carrying_bag=拎包|carrying_groceries=拎购物袋|window_shopping=逛橱窗|waiting=等待|checking_watch=看表|taking_photo=拍照|taking_selfie=自拍|blowing_bubbles=吹泡泡|watering_plants=浇花|feeding_animals=喂动物|playing_with_pet=逗宠物|studying=学习|napping=小憩|daydreaming=发呆"),
  ),
  cat(
    "画面构图",
    sg("景别", "medium_shot=中景|medium_close-up=中近景|american_shot=美式镜头|two_shot=双人镜头|group_shot=群体镜头|establishing_shot=定场镜头|insert_shot=插入镜头|detail_shot=细节镜头|chest_up=胸部以上|knee_shot=及膝镜头|waist_up=腰部以上|hip_shot=胯部镜头"),
    sg("视角", "eye-level=平视|low_angle=低角度|high_angle=高角度|over-the-shoulder=过肩视角|over_shoulder=越肩|aerial_view=航拍视角|top-down_view=俯瞰视角|ground_level=地面视角|tilted_angle=倾斜角度|upside-down=倒置|reflection_view=倒影视角|through_window=透过窗户|through_door=透过门|peeking_view=窥视视角|side_view=侧视图|rear_view=后视图|front_view=正视图"),
    sg("构图技法", "dynamic_composition=动态构图|dramatic_composition=戏剧构图|minimalist_composition=极简构图|busy_composition=繁复构图|layered_composition=分层构图|frame_within_frame=框中框|foreground_object=前景物体|background_blur=背景虚化|midground=中景层|leading_line=引导线|s-curve=S形曲线|triangular_composition=三角构图|radial_composition=放射构图|fill_the_frame=填满画面|empty_space=空旷留白|horizon_line=地平线|low_horizon=低地平线|high_horizon=高地平线|vanishing_point=消失点"),
  ),
  cat(
    "光影画质",
    sg("光照", "chiaroscuro=明暗对照|low_key_lighting=暗调光|high_key_lighting=亮调光|split_lighting=分割光|butterfly_lighting=蝴蝶光|rembrandt_lighting=伦勃朗光|loop_lighting=环形光|broad_lighting=宽光|short_lighting=窄光|spotlight=聚光灯|stage_lighting=舞台灯光|disco_lights=迪斯科灯|strobe_light=频闪灯|blacklight=黑光|bioluminescence=生物荧光|firefly_glow=萤火虫光|candlelit=烛光照明|lamplight=灯光|streetlight=路灯光|window_light=窗光|diffused_light=漫射光|harsh_shadows=硬阴影|long_shadows=长阴影|cast_shadow=投影|dramatic_shadows=戏剧阴影|dappled_light=斑驳光影"),
    sg("质量词", "ultra_high_res=超高分辨率|extremely_high_resolution=极高分辨率|detailed_eyes=精致眼睛|detailed_skin=细腻皮肤|detailed_hair=精细头发|detailed_clothes=精细服装|perfect_face=完美面容|beautiful_composition=优美构图|stunning=惊艳|gorgeous=华美|exquisite=精致绝美|flawless=完美无瑕|crisp=清晰锐利|clean_lineart=干净线稿|vibrant=鲜活|luminous=明亮通透|refined=精炼|polished=精致打磨|high_fidelity=高保真"),
    sg("渲染氛围", "dreamy=梦幻感|surreal=超现实|moody=情绪化|dramatic=戏剧化|epic=史诗感|serene_mood=宁静氛围|melancholic_mood=忧郁氛围|romantic_mood=浪漫氛围|mysterious=神秘|eerie=诡异|cozy_mood=温馨氛围|nostalgic_mood=怀旧氛围|otherworldly=异世界感|magical_atmosphere=魔法氛围|hazy=朦胧|glowing_atmosphere=辉光氛围|warm_atmosphere=暖意氛围|cold_atmosphere=冷峻氛围"),
  ),
  cat(
    "环境天气",
    sg("天气", "typhoon=台风|monsoon=季风雨|sleet=雨夹雪|hailstorm=冰雹|frost=霜|dew=露水|puddle=水洼|after_rain=雨后|rain_on_window=雨打窗|sea_breeze=海风|gust=阵风|whirlwind=旋风|tornado=龙卷风|dust_storm=尘暴|ash_fall=落灰|embers=余烬|falling_ash=飘灰|drifting_snow=飘雪|snow_on_ground=积雪|icicles=冰锥|frozen_over=结冰|foggy_morning=雾晨|low_clouds=低云"),
    sg("时间", "early_morning=清早|late_morning=上午|midday=正午|late_afternoon=傍晚前|early_evening=傍晚|pre-dawn=黎明前|first_light=破晓|nightfall=夜幕降临|deep_night=深夜|witching_hour=子夜"),
    sg("天空", "cumulus_clouds=积云|cirrus_clouds=卷云|storm_clouds=暴风云|pink_clouds=粉色云|golden_clouds=金色云|cloudless_sky=无云天|overcast_sky=阴霾天|aurora_borealis=北极光|comet=彗星|meteor_shower=流星雨|solar_eclipse=日食|lunar_eclipse=月食|constellation=星座|galaxy=星系|distant_planet=远处行星|twin_moons=双月|blood_moon=血月|crescent=新月牙"),
    sg("季节氛围", "early_spring=初春|late_spring=暮春|midsummer=盛夏|early_autumn=初秋|late_autumn=深秋|deep_winter=隆冬|cherry_blossom_season=樱花季|rainy_season=梅雨季|harvest_season=丰收季|first_snow=初雪|indian_summer=小阳春|festival_atmosphere=节庆氛围|tranquil_mood=恬静氛围"),
  ),
  cat(
    "场景",
    sg("室内", "study_room=书房|home_office=家庭办公室|nursery=育婴室|walk-in_closet=步入式衣帽间|wine_cellar=酒窖|ballroom=舞厅|banquet_hall=宴会厅|museum=博物馆|art_gallery=美术馆|theater=剧院|cinema=电影院|arcade=游戏厅|casino=赌场|spa=水疗馆|sauna=桑拿房|onsen=温泉|public_bath=公共浴池|fitting_room=试衣间|prison_cell=牢房|courtroom=法庭|chapel=礼拜堂|tea_room=茶室|tatami_room=榻榻米房|workshop_interior=工坊内部|bakery=面包店|flower_shop=花店|toy_store=玩具店|record_store=唱片店|antique_shop=古董店"),
    sg("城市", "town=小镇|village=村庄|suburb=郊区|old_town=老城区|european_town=欧式小镇|japanese_street=日式街道|shopping_arcade=商店街|train_platform=站台|airport=机场|dock=码头|lighthouse=灯塔|observatory=天文台|balcony=阳台|terrace=露台|courtyard=庭院|archway=拱门|tunnel=隧道|stadium=体育场|amusement_park=游乐园|ferris_wheel=摩天轮|carousel=旋转木马|aquarium=水族馆|zoo=动物园|temple_grounds=寺庙庭院|festival_stall=祭典摊位|night_market=夜市|rooftop_bar=屋顶酒吧|cafe_terrace=咖啡露台"),
    sg("自然", "grotto=岩洞|hot_spring=温泉池|marsh=沼泽|tundra=苔原|savanna=热带草原|prairie=大草原|sand_dune=沙丘|coral_reef=珊瑚礁|underwater=水下|seabed=海床|tide_pool=潮池|plateau=高原|gorge=峡谷|ravine=深谷|bamboo_grove=竹林|autumn_forest=秋林|snowy_forest=雪林|lavender_field=薰衣草田|sunflower_field=向日葵田|terraced_field=梯田|orchard=果园|vineyard=葡萄园|cliffside=崖边|riverbank=河岸|lakeside=湖畔|seaside=海边|hilltop=山顶|misty_forest=雾林|wildflower_field=野花田"),
    sg("幻想场景", "floating_castle=浮空城堡|crystal_cave=水晶洞|enchanted_garden=魔法花园|sacred_grove=圣林|elven_city=精灵之城|dwarven_hall=矮人大厅|wizard_tower=法师塔|abandoned_temple=废弃神殿|underground_city=地下城市|sky_temple=天空神殿|magic_library=魔法图书馆|portal_room=传送门厅|astral_plane=星界|spirit_world=灵界|celestial_realm=天界|demon_realm=魔界|fae_realm=妖精界|mushroom_forest=蘑菇森林|glowing_forest=荧光森林"),
    sg("科幻场景", "starship_bridge=星舰舰桥|cryo_lab=低温实验室|mech_hangar=机甲机库|orbital_station=轨道空间站|moon_base=月球基地|mars_colony=火星殖民地|neon_alley=霓虹巷|megacity=巨型都市|data_center=数据中心|reactor_core=反应堆核心|cockpit=驾驶舱|escape_pod=逃生舱|space_elevator=太空电梯|holodeck=全息甲板|cyber_cafe=网咖|android_factory=机器人工厂|ruined_metropolis=废墟大都会|underground_bunker=地下掩体"),
  ),
  cat(
    "物品道具",
    sg("武器", "trident=三叉戟|glaive=长柄刀|naginata=薙刀|wakizashi=胁差|tanto=短刀|claymore=苏格兰剑|falchion=弯刀|scimitar=弯剑|sabre=军刀|broadsword=阔剑|morning_star=晨星锤|flail=连枷|sling=投石索|throwing_knife=飞刀|grenade=手榴弹|bomb=炸弹|bazooka=火箭筒|gatling_gun=加特林|railgun=电磁炮|beam_rifle=光束步枪|energy_blade=能量刃|magic_sword=魔剑|cursed_sword=妖刀|holy_sword=圣剑|twin_swords=双剑|hidden_blade=袖剑|war_fan=铁扇|chakram=战轮|boomerang=回旋镖|claw_(weapon)=爪刃"),
    sg("食物", "curry=咖喱|fried_rice=炒饭|dumpling=饺子|gyoza=煎饺|tempura=天妇罗|yakitori=烤鸡串|okonomiyaki=御好烧|mochi=麻糬|melonpan=蜜瓜包|croissant=可颂|pretzel=椒盐卷饼|bagel=贝果|muffin=玛芬|brownie=布朗尼|tart=塔派|pie=派|jelly=果冻|gummy=软糖|marshmallow=棉花糖|popcorn=爆米花|french_fries=薯条|hot_dog=热狗|taco=塔可|burrito=卷饼|kebab=烤肉串|salad=沙拉|soup=汤|steak=牛排|omelet=蛋卷|toast=吐司|honey=蜂蜜|jam=果酱|chocolate_bar=巧克力棒|shaved_ice=刨冰|cotton_candy=棉花糖"),
    sg("饮品", "matcha=抹茶|latte=拿铁|espresso=浓缩咖啡|cappuccino=卡布奇诺|hot_chocolate=热可可|lemonade=柠檬水|cola=可乐|energy_drink=能量饮料|champagne=香槟|whiskey=威士忌|martini=马提尼|mojito=莫吉托|punch=潘趣酒|green_tea=绿茶|iced_tea=冰红茶|fruit_juice=果汁|soda_pop=苏打水|hot_tea=热茶|sake_cup=清酒杯"),
    sg("乐器", "organ=管风琴|accordion=手风琴|harmonica=口琴|banjo=班卓琴|mandolin=曼陀林|sitar=西塔琴|xylophone=木琴|tambourine=铃鼓|recorder=竖笛|oboe=双簧管|french_horn=圆号|trombone=长号|tuba=大号|double_bass=低音提琴|lute=鲁特琴|lyre=里拉琴|pan_flute=排箫|dizi=笛子|pipa=琵琶|guzheng=古筝|taiko_drum=太鼓|maracas=沙锤|synthesizer=合成器"),
    sg("日常道具", "comb=梳子|hairbrush=发刷|hand_mirror=手镜|music_box=音乐盒|snow_globe=雪花球|hourglass=沙漏|compass=指南针|telescope=望远镜|binoculars=双筒镜|magnifying_glass=放大镜|oil_lamp=油灯|chandelier=吊灯|vase=花瓶|teapot=茶壶|kettle=水壶|chopsticks=筷子|fork=叉子|spoon=勺子|tray=托盘|bucket=水桶|watering_can=洒水壶|broom=扫帚|scissors=剪刀|needle=针|yarn=毛线|kite=风筝|yo-yo=溜溜球|spinning_top=陀螺|dice=骰子|playing_card=扑克牌|chess_piece=棋子|rubiks_cube=魔方|plushie=毛绒玩偶|paper_crane=纸鹤|origami=折纸|wind_chime=风铃|ribbon_wand=丝带棒|magic_staff_item=法杖道具|potion_bottle=药水瓶"),
    sg("交通", "tram=有轨电车|monorail=单轨列车|taxi=出租车|truck=卡车|van=厢式车|jeep=吉普车|tank_(vehicle)=坦克|helicopter=直升机|jet=喷气机|glider=滑翔机|hot_air_balloon=热气球|airship=飞艇|blimp=软式飞艇|submarine=潜艇|yacht=游艇|canoe=独木舟|kayak=皮划艇|gondola=贡多拉|rickshaw=人力车|carriage=马车|horse-drawn_carriage=四轮马车|wagon=货车|hoverboard=悬浮板|hoverbike=悬浮摩托|space_shuttle=航天飞机"),
    sg("植物花卉", "camellia=山茶花|peony=牡丹|orchid=兰花|jasmine=茉莉|gardenia=栀子花|magnolia=玉兰|iris=鸢尾|poppy=罂粟花|marigold=万寿菊|dandelion=蒲公英|cosmos=波斯菊|forget-me-not=勿忘我|snowdrop=雪花莲|anemone=银莲花|dahlia=大丽花|freesia=小苍兰|baby's-breath=满天星|lily_of_the_valley=铃兰|edelweiss=雪绒花|water_lily=睡莲|chrysanthemum_flower=菊|plum_blossom=梅花|osmanthus=桂花|azalea=杜鹃|maple_leaf=枫叶|ginkgo_leaf=银杏叶|clover=三叶草|four-leaf_clover=四叶草|reed=芦苇|willow=柳树|cherry_tree=樱树|maple_tree=枫树"),
  ),
  cat(
    "色彩特效",
    sg("色调", "complementary_colors=互补色|analogous_colors=类似色|triadic_colors=三色调|jewel_tones=宝石色|neon_pink=霓虹粉|electric_blue=电光蓝|acid_green=酸性绿|blood_red=血红|golden_tone=金色调|silvery_tone=银色调|iridescent=虹彩|holographic=全息色|opalescent=蛋白石光泽|prismatic=棱镜色|warm_palette=暖色板|cool_palette=冷色板|pastel_palette=粉彩色板|dark_palette=暗色板|bright_palette=明亮色板|sepia_tone=泛黄色调|teal_and_orange=青橙色调"),
    sg("特效", "glowing_runes=发光符文|magic_sparkles=魔法闪光|energy_trails=能量轨迹|speed_lines=速度线|emphasis_lines=强调线|impact_frame=冲击帧|halftone=半调网点|screentone=网点|manga_effects=漫画特效|flame_effect=火焰特效|water_effect=水特效|electric_effect=电流特效|smoke_effect=烟雾特效|dust_cloud=尘云|debris=碎屑|glass_shards=玻璃碎|falling_feathers=飘落羽毛|light_streaks=光迹|star_trails=星轨|glitter_effect=亮粉特效|aura_glow=气场辉光|shockwave=冲击波|magic_runes_circle=魔法符文环"),
    sg("后期", "soft_glow=柔光晕|dreamy_blur=梦幻虚化|light_bloom=光晕泛光|sun_flare=太阳耀斑|god_ray_effect=丁达尔效果|volumetric_haze=体积雾霾|color_pop=色彩突出|monochrome_with_accent=单色点缀|grunge_texture=做旧纹理|paper_texture=纸张纹理|canvas_texture=画布纹理|scanlines=扫描线|crt_effect=显像管效果|retro_filter=复古滤镜|warm_filter=暖色滤镜|cold_filter=冷色滤镜"),
  ),
  cat(
    "生物",
    sg("动物", "lynx=猞猁|cheetah=猎豹|jaguar=美洲豹|panther=黑豹|hyena=鬣狗|coyote=郊狼|bison=野牛|moose=驼鹿|reindeer=驯鹿|gazelle=瞪羚|zebra=斑马|giraffe=长颈鹿|hippopotamus=河马|rhinoceros=犀牛|camel=骆驼|llama=美洲驼|alpaca=羊驼|kangaroo=袋鼠|koala=考拉|sloth=树懒|ferret=雪貂|weasel=黄鼠狼|badger=獾|beaver=海狸|chipmunk=花栗鼠|mole_(animal)=鼹鼠|hawk=鹰|falcon=隼|sparrow=麻雀|hummingbird=蜂鸟|flamingo=火烈鸟|seagull=海鸥|heron=苍鹭|crane_(animal)=鹤|woodpecker=啄木鸟|kingfisher=翠鸟|magpie=喜鹊|raven=渡鸦|dove=鸽子|toucan=巨嘴鸟|macaw=金刚鹦鹉"),
    sg("昆虫", "scarab=圣甲虫|mantis=螳螂|cricket=蟋蟀|locust=蝗虫|wasp=黄蜂|hornet=大黄蜂|centipede=蜈蚣|snail=蜗牛|slug=鼻涕虫|earthworm=蚯蚓|tick=蜱虫|flea=跳蚤|stag_beetle=锹甲|rhinoceros_beetle=独角仙"),
    sg("幻想生物", "cerberus=地狱犬|basilisk=蛇怪|manticore=狮蝎|sphinx=斯芬克斯|minotaur=牛头怪|cyclops=独眼巨人|gargoyle=石像鬼|banshee=女妖|wraith=怨灵|lich=巫妖|behemoth=贝希摩斯|leviathan=利维坦|fenrir=芬里尔|salamander=火蜥蜴|wisp=精灵火|imp=小恶魔|gremlin=格雷姆林|treant=树人|dryad_creature=树精|sea_serpent=海蛇|frost_giant=霜巨人|thunderbird=雷鸟|baku=食梦貘"),
  ),
  cat(
    "风格画风",
    sg("媒介", "tempera=蛋彩画|fresco=湿壁画|woodcut=木刻|linocut=油毡刻|etching=蚀刻|engraving=雕版|screen_print=丝网印|risograph=理光印|airbrush=喷绘|graffiti=涂鸦|stained_glass=彩绘玻璃|mosaic=马赛克镶嵌|tapestry=挂毯|batik=蜡染|ink_wash=水墨晕染|calligraphy=书法|chalk_art=粉笔画|scratchboard=刮版画|gouache_painting=水粉画|impasto=厚涂"),
    sg("流派画风", "graphic_novel=图像小说|storybook_illustration=绘本插画|childrens_book=童书插画|editorial_illustration=编辑插画|fashion_illustration=时装插画|technical_drawing=技术制图|blueprint=蓝图|isometric=等距视角|low_poly=低多边形|voxel_art=体素艺术|toon_shading=卡通渲染|pointillism=点彩派|cubism=立体主义|fauvism=野兽派|expressionism=表现主义|baroque=巴洛克|rococo=洛可可|renaissance=文艺复兴|nihonga=日本画|shanshui=山水画|gongbi=工笔画|art_brut=原生艺术"),
    sg("风格氛围", "dieselpunk=柴油朋克|solarpunk=太阳朋克|vaporwave=蒸汽波|synthwave=合成波|dark_fantasy=黑暗奇幻|high_fantasy=高奇幻|fairycore=妖精核|cottagecore=田园核|dreamcore=梦核|weirdcore=怪核|liminal_space=阈限空间|noir=黑色电影风|whimsical=奇趣|ethereal=空灵风|kawaii=可爱风|y2k_aesthetic=千禧美学|art_nouveau_style=新艺术风|gothic_horror=哥特恐怖"),
  ),
  cat(
    "魔法奇幻",
    sg("魔法", "alchemy=炼金术|transmutation=嬗变|divination=占卜|conjuration=咒法|illusion_magic=幻术|time_magic=时间魔法|gravity_magic=重力魔法|blood_magic=血魔法|nature_magic=自然魔法|healing_magic=治愈魔法|barrier_magic=结界|magic_seal=魔法封印|pentagram=五芒星|hexagram=六芒星|talisman=护符|amulet=护身符|relic=圣物|artifact=神器|enchanted_weapon=附魔武器|floating_books=漂浮书籍|mana=魔力|spirit_energy=灵力|chakra=脉轮|ritual_circle=仪式法阵|glowing_glyphs=发光符号|magic_tome=魔法典籍"),
    sg("元素能量", "fire_element=火元素|water_element_magic=水元素魔法|earth_element_magic=土元素魔法|wind_element_magic=风元素魔法|ice_element=冰元素|lightning_element=雷元素|light_magic=光魔法|shadow_magic=暗影魔法|plasma_energy=等离子能量|cosmic_energy=宇宙能量|starlight_energy=星光能量|spirit_flame=灵焰|frost_aura=冰霜气场|lightning_aura=雷电气场|holy_aura=神圣气场|dark_aura=黑暗气场|elemental_burst=元素爆发"),
    sg("科幻设定", "nanobots=纳米机器人|cybernetic_implant=义体植入|neural_interface=神经接口|holographic_display=全息显示|force_field=力场|energy_shield=能量护盾|plasma_cannon=等离子炮|warp_drive=曲速引擎|teleporter=传送器|stasis_pod=休眠舱|cryo_chamber=低温舱|mainframe=主机|data_stream=数据流|augmented_reality=增强现实|virtual_reality=虚拟现实|mech_cockpit=机甲驾驶舱|power_core=动力核心|reactor=反应堆|satellite=卫星|space_colony=太空殖民地|antigravity=反重力|laser_grid=激光网格"),
  ),
  cat(
    "反向提示词",
    sg("结构负面", "poorly_drawn_face=画工拙劣的脸|poorly_drawn_hands=画工拙劣的手|extra_eyes=多眼|missing_eyes=缺眼|distorted_face=扭曲脸|gross_proportions=糟糕比例|mutated_hands=畸变手|too_many_fingers=手指过多|webbed_hands=蹼状手|broken_fingers=断指|twisted_limbs=扭曲肢体|floating_limbs=漂浮肢体|disconnected_limbs=断离肢体|bad_perspective=透视错误|wonky_eyes=歪斜眼|lazy_eye=斜视眼|uneven_eyes=不对称眼|asymmetrical_face=不对称脸|double_image=重影|dislocated_joints=关节脱位|elongated_body=躯体拉长|malformed_hands=畸形手"),
    sg("画质负面", "ghosting=拖影|smudged=涂污|smeared=糊开|dithering=抖动失真|posterization=色调分离|color_bleed=溢色|oversharpened=过度锐化|plastic_skin=塑料皮肤|doll_joints=玩偶关节|mannequin=人体模型|lifeless_eyes=无神眼|dead_eyes=死鱼眼|harsh_noise=刺眼噪点|chromatic_noise=彩色噪点|moire=摩尔纹|burnt_highlights=高光过曝|crushed_shadows=死黑阴影|low_detail=细节不足"),
    sg("内容负面", "sketch_lines=残留草稿线|unfinished=未完成|work_in_progress=半成品|draft=草稿|conjoined=连体|siamese_twins=连体双胞|extra_torso=多躯干|floating_head=漂浮头部|misplaced_features=五官错位|out_of_frame_subject=主体出框|bad_composition=糟糕构图|tangent=切边重叠|distracting_background=干扰背景|jpeg_blocking=方块失真|amateur=业余感|low_effort=敷衍"),
  ),
];

// Third authored batch — additional fresh tags to round out each category.
export const CAPSULE_EXTRA3: CapsuleCategory[] = [
  cat(
    "人物",
    sg("眼睛颜色", "amber_eyes=琥珀眼|hazel_eyes=榛色眼|violet_eyes=紫罗兰眼|turquoise_eyes=松石眼|ruby_eyes=宝石红眼|emerald_eyes=祖母绿眼|sapphire_eyes=蓝宝石眼|crimson_eyes=深红眼|dark_blue_eyes=深蓝眼|light_brown_eyes=浅棕眼|pale_blue_eyes=浅蓝眼"),
    sg("口齿", "gold_tooth=金牙|missing_tooth=缺牙|braces=牙套|tusks=獠牙|sharp_canines=尖犬齿|lip_gloss=唇彩|glossy_lips=水润唇|black_lips=黑唇|purple_lips=紫唇|lipstick_mark=唇印|cracked_lips=干裂唇"),
    sg("面部特征", "beard=胡子|goatee=山羊胡|mustache=八字胡|sideburns=鬓角|stubble=胡茬|clean-shaven=净面|mole_on_neck=颈部痣|mole_on_cheek=脸颊痣|chest_tattoo=胸口纹身|neck_tattoo=颈部纹身|glowing_tattoo=发光纹身|tribal_tattoo=部落纹身"),
    sg("兽人部位", "scales=鳞片|feathers_(body)=羽毛|gills=鳃|fin=鳍|webbed_feet=蹼足|hooves=蹄|talons=利爪|mane=鬃毛|forked_tongue=分叉舌|reptile_eyes=爬虫眼|fang_necklace=兽牙项链|fluffy_ears=毛茸耳"),
    sg("翅角光环", "insect_wings=昆虫翅|phoenix_wings=凤凰翼|ice_wings=冰翼|crystal_wings=水晶翼|broken_wings=破损翅|single_wing=单翼|glowing_horns=发光角|spiral_horns=螺旋角|ram_horns=公羊角|crystal_horns=水晶角|mechanical_halo=机械光环|ring_halo=圆环光环"),
  ),
  cat(
    "服饰",
    sg("首饰", "ear_cuff=耳骨夹|multiple_earrings=多耳环|ankle_bracelet=脚踝链|charm_bracelet=吊饰手链|signet_ring=印章戒|gemstone_ring=宝石戒|body_chain=身体链|navel_piercing=肚脐环|lip_piercing=唇环|septum_piercing=鼻中隔环|eyebrow_piercing=眉钉|hair_chain=发链|waist_chain=腰链|arm_ring=臂环|tiara_crown=冕状头冠"),
    sg("手套臂饰", "opera_gloves=歌剧手套|lace_gloves=蕾丝手套|leather_gloves=皮手套|work_gloves=工作手套|boxing_gloves=拳击手套|single_glove=单只手套|arm_tattoo=手臂纹身|sleeve_tattoo=花臂|arm_cannon=臂炮|prosthetic_arm=义肢手臂|bandaged_hand=绷带手|claw_gauntlet=利爪护手"),
    sg("装饰元素", "lace_up_back=系带背|corset_back=束身系带|keyhole=钥匙孔镂空|cutout_shoulders=露肩镂空|side_slit=侧开衩|asymmetrical_hem=不对称下摆|ruffled_hem=褶边下摆|scalloped_edge=扇贝边|halterneck_strap=挂脖带|crossed_straps=交叉肩带|o-ring=O型环|d-ring=D型环|chain_detail=链条装饰|feather_trim=羽毛边"),
    sg("图案材质", "tie-dye=扎染|sequined=亮片|beaded=串珠|paisley=佩斯利纹|houndstooth=千鸟格|herringbone=人字纹|tartan=苏格兰格|chevron=V字纹|snakeskin=蛇皮纹|chiffon=雪纺|organza=欧根纱|tulle=薄纱|brocade=锦缎|corduroy=灯芯绒|tweed=粗花呢|denim_texture=牛仔纹理|knit_texture=针织纹理"),
    sg("上衣", "corset_top=束身上衣|lace_top=蕾丝上衣|mesh_top=网纱上衣|wrap_top=裹身上衣|button-up=系扣衬衫|undershirt=贴身背心|knit_top=针织上衣|halter_top_(clothes)=露背挂脖|tube_dress=抹胸裙|cropped_sweater=短款毛衣"),
  ),
  cat(
    "表情",
    sg("情绪", "smitten=倾心|yearning=渴慕|pensive=沉思|solemn=庄重|stern=严厉|aloof=冷淡|indifferent=漠然|taunting=挑衅|gloating=幸灾乐祸|devious=狡黠|gentle_gaze=温柔注视|teary-eyed=泪汪汪|flushed=面红|overwhelmed=不知所措|awe=敬畏|wonder=惊奇|disbelief=难以置信|skeptical=怀疑|suspicious=猜疑|contempt=轻蔑|satisfied=心满意足|smug_satisfaction=得意满足|playful_smirk=俏皮坏笑|dreamy_smile=梦幻微笑"),
  ),
  cat(
    "动作姿势",
    sg("站立", "arms_outstretched=张开双臂|hand_to_chest=手抚胸口|hands_together=双手合十|hands_on_thighs=手放大腿|slouching=懒散站姿|heroic_pose=英雄姿势|victory_pose=胜利姿势|thinking_pose=思考姿势|shrugging=耸肩|leaning_on_railing=倚栏|tip-toe=踮脚尖|hands_clasped_in_front=身前交握"),
    sg("坐卧", "sitting_on_steps=坐台阶|sitting_on_swing=坐秋千|kneeling_on_bed=床上跪姿|lying_in_grass=躺草地|lying_in_flowers=卧花丛|floating_in_water=浮于水面|reclining_on_sofa=斜倚沙发|sitting_on_ledge=坐边缘|perched=栖坐|sprawled=四仰八叉|sitting_on_stairs=坐楼梯"),
    sg("动态", "horseback_riding=骑马|galloping=疾驰|paragliding=滑翔伞|vaulting=腾跃|dramatic_landing=戏剧落地|spinning_kick=回旋踢|riding_broom=骑扫帚|riding_motorcycle=骑摩托|diving_pose=跳水姿势|floating_pose=漂浮姿势|fighting_pose=格斗姿势"),
  ),
  cat(
    "画面构图",
    sg("景别", "face_close-up=脸部特写|eye_close-up=眼部特写|hand_close-up=手部特写|lips_close-up=唇部特写|full_shot=全景镜头|long_shot=长镜头|panoramic=全景式"),
    sg("视角", "dramatic_angle=戏剧角度|god's-eye_view=上帝视角|canted_angle=倾斜镜头|looking_down_at_viewer=俯视镜头|looking_up_at_viewer=仰望镜头|extreme_perspective=极端透视|wide-angle_view=广角视角|fisheye_view=鱼眼视角"),
    sg("构图技法", "spiral_composition=螺旋构图|grid_composition=网格构图|converging_lines=汇聚线|repetition=重复构图|isolated_subject=孤立主体|environmental_portrait=环境人像|reflection_composition=倒影构图|silhouette_composition=剪影构图"),
  ),
  cat(
    "光影画质",
    sg("光照", "golden_backlight=金色逆光|neon_rim_light=霓虹轮廓光|candle_glow=烛火光|lantern_light=灯笼光|fireplace_light=壁炉光|screen_glow=屏幕光|underwater_light=水下光|starlight=星光|twilight_glow=暮光|dawn_glow=晨光|harsh_sunlight=烈日光|soft_window_light=柔和窗光|colored_rim_light=彩色轮廓光|glowing_light_source=发光光源"),
    sg("质量词", "intricate_clothing=精致服饰|detailed_eyes_and_face=精致五官|sharp_lineart=锐利线稿|smooth_shading=平滑上色|soft_shading=柔和上色|volumetric=体积感|atmospheric_perspective=空气透视|ultra_detailed_background=超精细背景|masterful=大师级|award-winning=获奖级"),
  ),
  cat(
    "环境天气",
    sg("天气", "light_rain=小雨|pouring_rain=倾盆大雨|snow_flurry=阵雪|partly_cloudy=局部多云|stormy=暴风|calm_weather=风平浪静|misty_weather=薄雾天气|frosty=结霜|breezy=微风"),
    sg("天空", "pastel_sky=粉彩天空|fiery_sky=火烧天|twilight_sky=暮色天空|dawn_sky=黎明天空|moonlit_sky=月光天空|sea_of_clouds=云海|sky_lanterns=天灯|distant_mountains=远山|colorful_sky=多彩天空"),
  ),
  cat(
    "场景",
    sg("室内", "dressing_room=化妆间|vanity_room=梳妆室|planetarium=天文馆|recording_studio=录音棚|dance_studio=舞蹈室|pottery_studio=陶艺室|apothecary=药剂室|bar_counter=吧台|kitchen_counter=厨房台面|indoor_pool=室内泳池|greenhouse_interior=温室内部|art_classroom=美术教室|music_classroom=音乐教室|infirmary_room=医务室"),
    sg("城市", "canal_city=运河城|riverside_town=河畔小镇|mountain_village=山村|fishing_village=渔村|port_town=港口小镇|castle_town=城堡小镇|market_square=集市广场|cobblestone_street=鹅卵石街|alleyway_at_night=夜巷|bridge_at_night=夜桥|shrine_path=神社参道|torii_gate=鸟居"),
    sg("自然", "misty_mountains=雾山|snowy_mountains=雪山|alpine_meadow=高山草甸|pine_forest=松林|birch_forest=白桦林|tropical_beach=热带海滩|rocky_coast=礁石海岸|sea_cave=海蚀洞|frozen_lake=冰湖|rose_garden=玫瑰园|zen_garden=枯山水|japanese_garden=日式庭园|rice_terraces=梯田|moonlit_lake=月下湖"),
  ),
  cat(
    "物品道具",
    sg("食物", "sundae=圣代|banana_split=香蕉船|cheesecake=芝士蛋糕|swiss_roll=瑞士卷|eclair=闪电泡芙|churros=吉事果|mooncake=月饼|miso_soup=味噌汤|hotpot=火锅|dim_sum=点心|spring_roll=春卷|fried_chicken=炸鸡|pancake_stack=松饼塔|fruit_tart=水果塔|matcha_cake=抹茶蛋糕"),
    sg("日常道具", "pocket_mirror=随身镜|hand_fan=手扇|oil-paper_umbrella=油纸伞|incense_burner=香炉|prayer_beads=念珠|calligraphy_brush=毛笔|ink_stone=砚台|abacus=算盘|typewriter=打字机|gramophone=留声机|vinyl_record=黑胶唱片|polaroid=拍立得|film_camera=胶片相机|fountain_pen=钢笔|quill_pen=羽毛笔|wax_seal=火漆印|treasure_chest=宝箱|birdcage=鸟笼|fish_bowl=鱼缸|terrarium=玻璃花房|bonsai=盆景|hourglass_timer=沙漏计时|pocket_watch_open=怀表"),
    sg("武器", "war_scythe=战镰|kusarigama=锁镰|sai=三叉戟刺|tonfa=拐|bo_staff=棍|crystal_staff=水晶杖|flaming_sword=烈焰剑|ice_blade=冰刃|chained_sickle=链镰|spiked_mace=狼牙棒|bone_sword=骨剑|dual_pistols=双枪"),
    sg("乐器", "ocarina=陶笛|bagpipes=风笛|shakuhachi=尺八|biwa=琵琶（日）|suona=唢呐|hang_drum=手碟|theremin=特雷门琴|kalimba=卡林巴|bongo=邦戈鼓|cymbals=镲"),
  ),
  cat(
    "色彩特效",
    sg("特效", "petals_swirl=花瓣漩涡|leaf_swirl=落叶漩涡|snow_swirl=飞雪漩涡|light_orbs=光球|glowing_dust=发光尘埃|ember_sparks=火星|ripple_effect=涟漪效果|water_droplets=水珠|mist_effect=薄雾效果|prism_light=棱镜光|radial_blur=径向模糊|zoom_blur=变焦模糊|soft_vignette=柔和暗角|floating_lights=漂浮光点|magic_glow=魔法辉光"),
  ),
  cat(
    "生物",
    sg("动物", "red_panda=小熊猫|fennec_fox=耳廓狐|arctic_fox=北极狐|snow_leopard=雪豹|white_tiger=白虎|peacock_(animal)=孔雀|swan_(animal)=天鹅|walrus=海象|orca=虎鲸|seahorse=海马|clownfish=小丑鱼|koi_fish=锦鲤|jellyfish_(creature)=水母|starfish=海星|crab_(animal)=螃蟹|squirrel_(animal)=松鼠|chinchilla=龙猫|capybara=水豚"),
    sg("幻想生物", "kelpie=水马|selkie=海豹精|jackalope=鹿角兔|qilin=麒麟|nue=鵺|baby_dragon=幼龙|mini_dragon=迷你龙|spirit_fox=灵狐|nine-tailed_fox=九尾狐|forest_spirit=森林精灵|water_spirit=水精灵|flame_spirit=火精灵"),
  ),
  cat(
    "风格画风",
    sg("媒介", "ballpoint_pen_(medium)=圆珠笔|copic_marker=酒精马克笔|digital_ink=数字勾线|vector_illustration=矢量插画|papercut_art=剪纸艺术|needle_felting=羊毛毡|embroidery_art=刺绣艺术|claymation_style=黏土风|gouache_illustration=水粉插画"),
    sg("流派画风", "ligne_claire=清晰线条|anime_screencap=动画截图风|key_visual=主视觉风|light_novel_illustration=轻小说插画|doujin_style=同人风|retro_anime=复古动画|modern_anime=现代动画|shoujo_style=少女漫风|shounen_style=少年漫风|watercolor_illustration=水彩插画"),
  ),
  cat(
    "魔法奇幻",
    sg("魔法", "summoning_circle=召唤阵|sealing_circle=封印阵|magic_brand=魔法烙印|glowing_tattoo_magic=发光魔纹|levitating_objects=悬浮物体|floating_crystals=漂浮水晶|magic_orb=魔法球|energy_sphere=能量球|spirit_summon=灵体召唤|familiar_spirit=使魔灵|glowing_eyes_magic=魔法发光眼"),
    sg("科幻设定", "jetpack=喷气背包|exosuit=外骨骼服|plasma_shield=等离子盾|laser_sword=激光剑|robotic_arm=机械臂|prosthetic_limb=义肢|cyber_eye=电子眼|hud_display=平视显示|drone_swarm=无人机群|hovering_platform=悬浮平台|holographic_wings=全息翼|neon_circuitry=霓虹电路"),
  ),
];


