import 'dart:convert';

import 'package:flutter/services.dart';

class CapsuleTag {
  final String tag;
  final String label;

  const CapsuleTag({required this.tag, required this.label});

  factory CapsuleTag.fromJson(Map<String, dynamic> json) => CapsuleTag(
        tag: json['en']?.toString() ?? '',
        label: json['zh']?.toString() ?? '',
      );
}

class CapsuleSubgroup {
  final String name;
  final List<CapsuleTag> tags;

  const CapsuleSubgroup({required this.name, required this.tags});

  factory CapsuleSubgroup.fromJson(Map<String, dynamic> json) =>
      CapsuleSubgroup(
        name: json['name']?.toString() ?? '',
        tags: (json['tags'] as List? ?? const [])
            .whereType<Map>()
            .map((item) => CapsuleTag.fromJson(Map<String, dynamic>.from(item)))
            .where((item) => item.tag.isNotEmpty)
            .toList(growable: false),
      );
}

class CapsuleCategory {
  final String name;
  final List<CapsuleSubgroup> subgroups;

  const CapsuleCategory({required this.name, required this.subgroups});

  bool get isNegative => name == '反向提示词';

  factory CapsuleCategory.fromJson(Map<String, dynamic> json) =>
      CapsuleCategory(
        name: json['name']?.toString() ?? '',
        subgroups: (json['subgroups'] as List? ?? const [])
            .whereType<Map>()
            .map((item) =>
                CapsuleSubgroup.fromJson(Map<String, dynamic>.from(item)))
            .where((item) => item.tags.isNotEmpty)
            .toList(growable: false),
      );
}

String _localeCode(Object? language) {
  final raw = language?.toString();
  return switch (raw) {
    'zh-TW' => 'zh-TW',
    'en-US' => 'en-US',
    'ja-JP' => 'ja-JP',
    'ko-KR' => 'ko-KR',
    _ => 'zh-CN',
  };
}

String readableTagName(String tag) {
  final text = tag.trim().replaceAll(RegExp(r'[_-]+'), ' ');
  if (text.isEmpty) return tag;
  return text.replaceAll(RegExp(r'\s+'), ' ').trim();
}

List<String> _splitReadableTag(String tag) {
  final expanded = readableTagName(tag)
      .replaceAllMapped(
        RegExp(r'(\d+\+?)(girls?|boys?|others?)', caseSensitive: false),
        (match) => '${match[1]} ${match[2]}',
      )
      .replaceAllMapped(
        RegExp(r'([a-z])(\d+)', caseSensitive: false),
        (match) => '${match[1]} ${match[2]}',
      )
      .toLowerCase();
  return expanded
      .split(RegExp(r'[\s/()]+'))
      .where((x) => x.isNotEmpty)
      .toList();
}

String _localizedReadableTag(String tag, String code) {
  final readable = readableTagName(tag);
  final normalized = readable.toLowerCase();
  final exact = _tagGlossByLocale[code]?[normalized];
  if (exact != null) return exact;
  if (code == 'en-US') return readable;
  final tokenGloss = _tagTokenGlossByLocale[code];
  if (tokenGloss == null) return readable;
  final words = _splitReadableTag(tag);
  if (words.isEmpty) return readable;
  final localized = words.map((word) => tokenGloss[word] ?? word).toList();
  return localized.join(code == 'ja-JP' ? '・' : ' ');
}

String _fallbackCapsuleName(String code, String kind) {
  if (code == 'en-US') return kind == 'category' ? 'Category' : 'Tag group';
  if (code == 'ja-JP') return kind == 'category' ? 'カテゴリ' : 'タググループ';
  if (code == 'ko-KR') return kind == 'category' ? '카테고리' : '태그 그룹';
  return kind == 'category' ? '分类' : '分组';
}

String localizedTagLabel(
  Object? language,
  String tag, {
  String? sourceLabel,
}) {
  final code = _localeCode(language);
  final normalized = readableTagName(tag).toLowerCase();
  if (code == 'zh-CN') {
    return sourceLabel?.trim().isNotEmpty == true
        ? sourceLabel!.trim()
        : _tagGlossZh[normalized] ?? readableTagName(tag);
  }
  if (code == 'zh-TW') {
    final base = sourceLabel?.trim().isNotEmpty == true
        ? sourceLabel!.trim()
        : _tagGlossZh[normalized] ?? readableTagName(tag);
    return _toTraditional(base);
  }
  return _localizedReadableTag(tag, code);
}

String localizedCapsuleCategoryName(Object? language, String name) {
  final code = _localeCode(language);
  if (code == 'zh-CN') return name;
  if (code == 'zh-TW') return _toTraditional(name);
  return _categoryNameByLocale[code]?[name] ??
      _fallbackCapsuleName(code, 'category');
}

String localizedCapsuleSubgroupName(Object? language, String name) {
  final code = _localeCode(language);
  if (code == 'zh-CN') return name;
  if (code == 'zh-TW') return _toTraditional(name);
  return _subgroupNameByLocale[code]?[name] ??
      _fallbackCapsuleName(code, 'subgroup');
}

const _tagTokenGlossByLocale = <String, Map<String, String>>{
  'ja-JP': {
    'girl': '女の子',
    'girls': '女の子',
    'boy': '男の子',
    'boys': '男の子',
    'other': 'その他',
    'others': 'その他',
    'multiple': '複数',
    'solo': '単独',
    'focus': 'フォーカス',
    'male': '男性',
    'female': '女性',
    'person': '人物',
    'people': '人物',
    'character': 'キャラ',
    'style': 'スタイル',
    'pose': 'ポーズ',
    'action': '動作',
    'standing': '立ち',
    'sitting': '座り',
    'lying': '寝そべり',
    'running': '走る',
    'walking': '歩く',
    'jumping': 'ジャンプ',
    'hand': '手',
    'hands': '手',
    'arm': '腕',
    'arms': '腕',
    'leg': '脚',
    'legs': '脚',
    'foot': '足',
    'feet': '足',
    'face': '顔',
    'eye': '目',
    'eyes': '目',
    'pupil': '瞳孔',
    'pupils': '瞳孔',
    'mouth': '口',
    'lips': '唇',
    'teeth': '歯',
    'tongue': '舌',
    'ear': '耳',
    'ears': '耳',
    'hair': '髪',
    'bangs': '前髪',
    'ponytail': 'ポニーテール',
    'twintails': 'ツインテール',
    'braid': '三つ編み',
    'bun': 'お団子',
    'tail': 'しっぽ',
    'wings': '翼',
    'horns': '角',
    'halo': '光輪',
    'skin': '肌',
    'chest': '胸',
    'breasts': '胸',
    'stomach': '腹部',
    'waist': '腰',
    'hips': '腰',
    'thighs': '太もも',
    'white': '白',
    'black': '黒',
    'blue': '青',
    'red': '赤',
    'green': '緑',
    'yellow': '黄',
    'golden': '金',
    'orange': 'オレンジ',
    'purple': '紫',
    'pink': 'ピンク',
    'brown': '茶',
    'grey': 'グレー',
    'gray': 'グレー',
    'silver': '銀',
    'blonde': '金髪',
    'light': '明るい',
    'dark': '暗い',
    'multicolored': '多色',
    'two': '二色',
    'tone': 'トーン',
    'gradient': 'グラデーション',
    'smile': '笑顔',
    'blush': '赤面',
    'happy': '幸せ',
    'sad': '悲しい',
    'angry': '怒り',
    'crying': '泣き',
    'tears': '涙',
    'open': '開いた',
    'closed': '閉じた',
    'looking': '見る',
    'viewer': '視聴者',
    'back': '後ろ',
    'up': '上',
    'down': '下',
    'side': '横',
    'shirt': 'シャツ',
    'dress': 'ドレス',
    'skirt': 'スカート',
    'shorts': 'ショートパンツ',
    'pants': 'パンツ',
    'uniform': '制服',
    'school': '学校',
    'swimsuit': '水着',
    'bikini': 'ビキニ',
    'underwear': '下着',
    'gloves': '手袋',
    'socks': '靴下',
    'thighhighs': 'ニーソックス',
    'boots': 'ブーツ',
    'shoes': '靴',
    'hat': '帽子',
    'ribbon': 'リボン',
    'bow': 'リボン',
    'ornament': '飾り',
    'glasses': '眼鏡',
    'mask': 'マスク',
    'background': '背景',
    'simple': 'シンプル',
    'indoors': '屋内',
    'outdoors': '屋外',
    'city': '都市',
    'sky': '空',
    'starry': '星空',
    'night': '夜',
    'day': '昼',
    'sunset': '夕焼け',
    'rain': '雨',
    'snow': '雪',
    'flower': '花',
    'flowers': '花',
    'weapon': '武器',
    'sword': '剣',
    'gun': '銃',
    'food': '食べ物',
    'quality': '品質',
    'masterpiece': '傑作',
    'best': '最高',
    'aesthetic': '美的',
    'detailed': '詳細',
    'blurry': 'ぼやけ',
    'bad': '悪い',
    'worst': '最悪',
  },
  'ko-KR': {
    'girl': '소녀',
    'girls': '소녀',
    'boy': '소년',
    'boys': '소년',
    'other': '기타',
    'others': '기타',
    'multiple': '여러',
    'solo': '단독',
    'focus': '초점',
    'male': '남성',
    'female': '여성',
    'person': '인물',
    'people': '인물',
    'character': '캐릭터',
    'style': '스타일',
    'pose': '포즈',
    'action': '동작',
    'standing': '서 있음',
    'sitting': '앉음',
    'lying': '누움',
    'running': '달리기',
    'walking': '걷기',
    'jumping': '점프',
    'hand': '손',
    'hands': '손',
    'arm': '팔',
    'arms': '팔',
    'leg': '다리',
    'legs': '다리',
    'foot': '발',
    'feet': '발',
    'face': '얼굴',
    'eye': '눈',
    'eyes': '눈',
    'pupil': '동공',
    'pupils': '동공',
    'mouth': '입',
    'lips': '입술',
    'teeth': '치아',
    'tongue': '혀',
    'ear': '귀',
    'ears': '귀',
    'hair': '머리카락',
    'bangs': '앞머리',
    'ponytail': '포니테일',
    'twintails': '트윈테일',
    'braid': '땋은 머리',
    'bun': '번 헤어',
    'tail': '꼬리',
    'wings': '날개',
    'horns': '뿔',
    'halo': '후광',
    'skin': '피부',
    'chest': '가슴',
    'breasts': '가슴',
    'stomach': '복부',
    'waist': '허리',
    'hips': '엉덩이',
    'thighs': '허벅지',
    'white': '흰색',
    'black': '검은색',
    'blue': '파란색',
    'red': '빨간색',
    'green': '초록색',
    'yellow': '노란색',
    'golden': '금색',
    'orange': '주황색',
    'purple': '보라색',
    'pink': '분홍색',
    'brown': '갈색',
    'grey': '회색',
    'gray': '회색',
    'silver': '은색',
    'blonde': '금발',
    'light': '밝은',
    'dark': '어두운',
    'multicolored': '다색',
    'two': '두 가지',
    'tone': '톤',
    'gradient': '그라데이션',
    'smile': '미소',
    'blush': '홍조',
    'happy': '행복',
    'sad': '슬픔',
    'angry': '화남',
    'crying': '울음',
    'tears': '눈물',
    'open': '열린',
    'closed': '닫힌',
    'looking': '바라봄',
    'viewer': '시청자',
    'back': '뒤',
    'up': '위',
    'down': '아래',
    'side': '옆',
    'shirt': '셔츠',
    'dress': '드레스',
    'skirt': '스커트',
    'shorts': '반바지',
    'pants': '바지',
    'uniform': '제복',
    'school': '학교',
    'swimsuit': '수영복',
    'bikini': '비키니',
    'underwear': '속옷',
    'gloves': '장갑',
    'socks': '양말',
    'thighhighs': '니삭스',
    'boots': '부츠',
    'shoes': '신발',
    'hat': '모자',
    'ribbon': '리본',
    'bow': '리본',
    'ornament': '장식',
    'glasses': '안경',
    'mask': '마스크',
    'background': '배경',
    'simple': '단순한',
    'indoors': '실내',
    'outdoors': '실외',
    'city': '도시',
    'sky': '하늘',
    'starry': '별이 빛나는',
    'night': '밤',
    'day': '낮',
    'sunset': '석양',
    'rain': '비',
    'snow': '눈',
    'flower': '꽃',
    'flowers': '꽃',
    'weapon': '무기',
    'sword': '검',
    'gun': '총',
    'food': '음식',
    'quality': '품질',
    'masterpiece': '걸작',
    'best': '최고',
    'aesthetic': '미적',
    'detailed': '세밀한',
    'blurry': '흐림',
    'bad': '나쁜',
    'worst': '최악',
  },
};

const _categoryNameByLocale = <String, Map<String, String>>{
  'en-US': {
    '人物': 'People',
    '服饰': 'Clothing',
    '表情': 'Expression',
    '动作姿势': 'Pose / Action',
    '画面构图': 'Composition',
    '光影画质': 'Lighting / Quality',
    '环境天气': 'Weather',
    '场景': 'Scene',
    '物品道具': 'Objects',
    '色彩特效': 'Color / Effects',
    '生物': 'Creatures',
    '风格画风': 'Style',
    '魔法奇幻': 'Fantasy',
    '反向提示词': 'Negative',
  },
  'ja-JP': {
    '人物': '人物',
    '服饰': '服装',
    '表情': '表情',
    '动作姿势': 'ポーズ / 動作',
    '画面构图': '構図',
    '光影画质': '光 / 品質',
    '环境天气': '天気',
    '场景': 'シーン',
    '物品道具': '小物',
    '色彩特效': '色 / 効果',
    '生物': '生物',
    '风格画风': 'スタイル',
    '魔法奇幻': 'ファンタジー',
    '反向提示词': 'ネガティブ',
  },
  'ko-KR': {
    '人物': '인물',
    '服饰': '의상',
    '表情': '표정',
    '动作姿势': '포즈 / 동작',
    '画面构图': '구도',
    '光影画质': '조명 / 품질',
    '环境天气': '날씨',
    '场景': '장면',
    '物品道具': '소품',
    '色彩特效': '색 / 효과',
    '生物': '생물',
    '风格画风': '스타일',
    '魔法奇幻': '판타지',
    '反向提示词': '네거티브',
  },
};

const _subgroupNameByLocale = <String, Map<String, String>>{
  'en-US': {
    '对象': 'Subject',
    '身份': 'Role',
    '年龄': 'Age',
    '体型': 'Body',
    '肤色': 'Skin',
    '发型': 'Hair style',
    '发色': 'Hair color',
    '眼睛': 'Eyes',
    '瞳孔': 'Pupils',
    '耳朵': 'Ears',
    '上衣': 'Tops',
    '下装': 'Bottoms',
    '连衣裙': 'Dresses',
    '制服': 'Uniforms',
    '泳装内衣': 'Swimwear',
    '腿袜鞋': 'Legwear / Shoes',
    '头饰': 'Headwear',
    '配饰': 'Accessories',
    '情绪': 'Emotion',
    '视线': 'Gaze',
    '姿势': 'Pose',
    '手部': 'Hands',
    '动作': 'Action',
    '景别': 'Shot size',
    '视角': 'Camera angle',
    '构图': 'Composition',
    '光照': 'Lighting',
    '质量词': 'Quality tags',
    '天气': 'Weather',
    '时间': 'Time',
    '天空': 'Sky',
    '室内': 'Indoor',
    '室外': 'Outdoor',
    '自然': 'Nature',
    '城市': 'City',
    '校园生活': 'School',
    '科幻场景': 'Sci-fi',
  },
  'ja-JP': {
    '对象': '対象',
    '身份': '役割',
    '年龄': '年齢',
    '体型': '体型',
    '肤色': '肌色',
    '发型': '髪型',
    '发色': '髪色',
    '眼睛': '目',
    '瞳孔': '瞳',
    '耳朵': '耳',
    '上衣': 'トップス',
    '下装': 'ボトムス',
    '连衣裙': 'ドレス',
    '制服': '制服',
    '泳装内衣': '水着',
    '腿袜鞋': '靴下 / 靴',
    '头饰': '髪飾り',
    '配饰': 'アクセサリ',
    '情绪': '感情',
    '视线': '視線',
    '姿势': 'ポーズ',
    '手部': '手',
    '动作': '動作',
    '景别': 'ショット',
    '视角': '視点',
    '构图': '構図',
    '光照': '照明',
    '质量词': '品質タグ',
    '天气': '天気',
    '时间': '時間',
    '天空': '空',
    '室内': '屋内',
    '室外': '屋外',
    '自然': '自然',
    '城市': '都市',
    '校园生活': '学校',
    '科幻场景': 'SF',
  },
  'ko-KR': {
    '对象': '대상',
    '身份': '역할',
    '年龄': '나이',
    '体型': '체형',
    '肤色': '피부색',
    '发型': '헤어스타일',
    '发色': '머리색',
    '眼睛': '눈',
    '瞳孔': '동공',
    '耳朵': '귀',
    '上衣': '상의',
    '下装': '하의',
    '连衣裙': '드레스',
    '制服': '제복',
    '泳装内衣': '수영복',
    '腿袜鞋': '양말 / 신발',
    '头饰': '머리 장식',
    '配饰': '액세서리',
    '情绪': '감정',
    '视线': '시선',
    '姿势': '포즈',
    '手部': '손',
    '动作': '동작',
    '景别': '샷 크기',
    '视角': '시점',
    '构图': '구도',
    '光照': '조명',
    '质量词': '품질 태그',
    '天气': '날씨',
    '时间': '시간',
    '天空': '하늘',
    '室内': '실내',
    '室外': '실외',
    '自然': '자연',
    '城市': '도시',
    '校园生活': '학교',
    '科幻场景': 'SF',
  },
};

const _tagGlossZh = <String, String>{
  '1girl': '一个女孩',
  '1boy': '一个男孩',
  'solo': '单人',
  'long hair': '长发',
  'short hair': '短发',
  'twintails': '双马尾',
  'ponytail': '马尾',
  'blonde hair': '金发',
  'black hair': '黑发',
  'white hair': '白发',
  'blue hair': '蓝发',
  'red hair': '红发',
  'pink hair': '粉发',
  'blue eyes': '蓝眼',
  'red eyes': '红眼',
  'green eyes': '绿眼',
  'smile': '微笑',
  'blush': '脸红',
  'open mouth': '张嘴',
  'looking at viewer': '看向观众',
  'dress': '连衣裙',
  'school uniform': '校服',
  'gloves': '手套',
  'hair ornament': '发饰',
  'simple background': '简单背景',
  'outdoors': '户外',
  'indoors': '室内',
  'night': '夜晚',
  'starry sky': '星空',
  'cityscape': '城市景观',
  'classroom': '教室',
  'masterpiece': '杰作',
  'best quality': '最佳质量',
  'very aesthetic': '高审美',
};

const _tagGlossByLocale = <String, Map<String, String>>{
  'en-US': {},
  'ja-JP': {
    '1girl': '女の子 1人',
    '1boy': '男の子 1人',
    'solo': '単独',
    'long hair': '長髪',
    'short hair': '短髪',
    'twintails': 'ツインテール',
    'ponytail': 'ポニーテール',
    'blonde hair': '金髪',
    'black hair': '黒髪',
    'white hair': '白髪',
    'blue hair': '青髪',
    'red hair': '赤髪',
    'pink hair': 'ピンク髪',
    'blue eyes': '青い目',
    'red eyes': '赤い目',
    'green eyes': '緑の目',
    'smile': '笑顔',
    'blush': '赤面',
    'open mouth': '口を開ける',
    'looking at viewer': 'こちらを見る',
    'dress': 'ワンピース',
    'school uniform': '制服',
    'gloves': '手袋',
    'hair ornament': '髪飾り',
    'simple background': 'シンプル背景',
    'outdoors': '屋外',
    'indoors': '屋内',
    'night': '夜',
    'starry sky': '星空',
    'cityscape': '都市景観',
    'classroom': '教室',
    'masterpiece': '傑作',
    'best quality': '最高品質',
    'very aesthetic': '高い美的品質',
  },
  'ko-KR': {
    '1girl': '여자 1명',
    '1boy': '남자 1명',
    'solo': '단독',
    'long hair': '긴 머리',
    'short hair': '짧은 머리',
    'twintails': '트윈테일',
    'ponytail': '포니테일',
    'blonde hair': '금발',
    'black hair': '검은 머리',
    'white hair': '흰 머리',
    'blue hair': '파란 머리',
    'red hair': '빨간 머리',
    'pink hair': '분홍 머리',
    'blue eyes': '파란 눈',
    'red eyes': '빨간 눈',
    'green eyes': '초록 눈',
    'smile': '미소',
    'blush': '홍조',
    'open mouth': '입 벌림',
    'looking at viewer': '정면 응시',
    'dress': '드레스',
    'school uniform': '교복',
    'gloves': '장갑',
    'hair ornament': '머리 장식',
    'simple background': '단순 배경',
    'outdoors': '실외',
    'indoors': '실내',
    'night': '밤',
    'starry sky': '별이 뜬 하늘',
    'cityscape': '도시 풍경',
    'classroom': '교실',
    'masterpiece': '걸작',
    'best quality': '최고 품질',
    'very aesthetic': '높은 미감 품질',
  },
};

String _toTraditional(String input) {
  const map = {
    '简': '簡',
    '体': '體',
    '发': '髮',
    '头': '頭',
    '马': '馬',
    '龙': '龍',
    '国': '國',
    '风': '風',
    '画': '畫',
    '图': '圖',
    '场': '場',
    '景': '景',
    '质': '質',
    '词': '詞',
    '饰': '飾',
    '装': '裝',
    '连': '連',
    '裙': '裙',
    '袜': '襪',
    '鞋': '鞋',
    '肤': '膚',
    '色': '色',
    '动': '動',
    '作': '作',
    '势': '勢',
    '构': '構',
    '线': '線',
    '视': '視',
    '觉': '覺',
    '对': '對',
    '象': '象',
    '龄': '齡',
    '型': '型',
    '瞳': '瞳',
    '处': '處',
    '声': '聲',
    '云': '雲',
    '术': '術',
    '气': '氣',
    '间': '間',
    '内': '內',
    '外': '外',
    '园': '園',
    '学': '學',
    '梦': '夢',
    '负': '負',
    '面': '面',
    '单': '單',
    '个': '個',
    '蓝': '藍',
    '绿': '綠',
    '红': '紅',
    '黄': '黃',
    '贝': '貝',
    '观': '觀',
    '众': '眾',
    '爱': '愛',
    '杀': '殺',
    '师': '師',
    '标': '標',
    '签': '籤',
    '库': '庫',
    '万': '萬',
  };
  return input.split('').map((char) => map[char] ?? char).join();
}

Future<List<CapsuleCategory>> loadCapsuleTaxonomy() async {
  final source = await rootBundle.loadString('assets/capsule_taxonomy.json');
  final decoded = jsonDecode(source);
  if (decoded is! List) return const [];
  return decoded
      .whereType<Map>()
      .map((item) => CapsuleCategory.fromJson(Map<String, dynamic>.from(item)))
      .where((item) => item.subgroups.isNotEmpty)
      .toList(growable: false);
}

// Flattened, de-duplicated capsule tags, cached after the first load so tag
// autocomplete can search the bundled 4000+ entries without any download.
List<CapsuleTag>? _flatCapsuleCache;

Future<List<CapsuleTag>> _flatCapsuleTags() async {
  final cached = _flatCapsuleCache;
  if (cached != null) return cached;
  final categories = await loadCapsuleTaxonomy();
  final flat = <CapsuleTag>[];
  final seen = <String>{};
  for (final category in categories) {
    for (final subgroup in category.subgroups) {
      for (final tag in subgroup.tags) {
        if (tag.tag.isNotEmpty && seen.add(tag.tag.toLowerCase())) {
          flat.add(tag);
        }
      }
    }
  }
  _flatCapsuleCache = flat;
  return flat;
}

/// Searches the bundled capsule taxonomy by English tag or Chinese label.
/// Exact > prefix > contains; works for both Latin and CJK queries.
Future<List<CapsuleTag>> searchCapsuleTags(String query,
    {int limit = 12}) async {
  final raw = query.trim();
  if (raw.isEmpty) return const [];
  final flat = await _flatCapsuleTags();
  final cjk = RegExp(r'[㐀-鿿]').hasMatch(raw);
  final normalized = raw.toLowerCase().replaceAll('_', ' ');
  final scored = <({CapsuleTag tag, int score})>[];
  for (final tag in flat) {
    var score = 0;
    if (cjk) {
      final label = tag.label;
      if (label == raw) {
        score = 3;
      } else if (label.startsWith(raw)) {
        score = 2;
      } else if (label.contains(raw)) {
        score = 1;
      }
    } else {
      final name = tag.tag.toLowerCase().replaceAll('_', ' ');
      if (name == normalized) {
        score = 3;
      } else if (name.startsWith(normalized)) {
        score = 2;
      } else if (name.contains(normalized)) {
        score = 1;
      }
    }
    if (score > 0) scored.add((tag: tag, score: score));
  }
  scored.sort((a, b) => b.score.compareTo(a.score));
  return scored.take(limit).map((item) => item.tag).toList();
}
