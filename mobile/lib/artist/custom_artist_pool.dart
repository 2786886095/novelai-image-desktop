import 'artist_recipe.dart';

List<ArtistTagRecord> parseCustomArtistPool(String raw) {
  final names = <String>{};
  for (final token in raw.split(RegExp(r'[,，\r\n]+'))) {
    final name = token
        .trim()
        .replaceAll(RegExp(r'^[{\[\s]+|[}\]\s]+$'), '')
        .replaceFirst(RegExp(r'^artist\s*:\s*', caseSensitive: false), '')
        .trim()
        .replaceAll(RegExp(r'\s+'), '_')
        .toLowerCase();
    if (name.isNotEmpty &&
        name.length <= 200 &&
        !RegExp(r'[{}\[\]<>:]').hasMatch(name)) names.add(name);
  }
  return names
      .toList()
      .asMap()
      .entries
      .map((e) => ArtistTagRecord(-(e.key + 1), e.value, 0))
      .toList();
}

const _labels = <String, List<String>>{
  "zh-CN": ["使用自定义画师候选库", "画师列表（逗号或换行分隔）", "仅从这里抽取，不混入排行榜；权重由抽卡参数统一设置。"],
  "zh-TW": ["使用自訂畫師候選庫", "畫師清單（逗號或換行分隔）", "僅從此處抽取，不混入排行榜；權重由抽卡參數統一設定。"],
  "en-US": [
    "Use custom artist pool",
    "Artists (comma or newline separated)",
    "Draw only from this list, not the ranking. Draw settings control weights."
  ],
  "ja-JP": ["独自の画家候補を使用", "画家一覧（コンマ・改行区切り）", "ランキングと混ぜずに抽選します。重みは抽選設定で指定します。"],
  "ko-KR": [
    "사용자 작가 후보 사용",
    "작가 목록 (쉼표 또는 줄바꿈)",
    "순위와 섞지 않고 이 목록에서만 추출합니다. 가중치는 추출 설정을 따릅니다."
  ]
};
List<String> customArtistPoolText(String language) =>
    _labels[language] ?? _labels['en-US']!;
