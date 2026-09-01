import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../artist/artist_recipe.dart';
import '../artist/random_custom_tag_library.dart';
import '../i18n/app_locales.dart';
import '../models/nai_models.dart';
import '../services/artist_tag_service.dart';
import '../state/app_state.dart';
import '../tags/offline_tag_store.dart';
import '../ui/quality_preset_control.dart';
import 'positive_prompt_preset_sheet.dart';

class _Result {
  final ArtistRecipe recipe;
  final int sequence;
  int? seed;
  String status;
  HistoryItem? image;
  String? error;
  String generationModel;
  bool liked;
  bool saving = false;
  _Result(this.recipe,
      {this.sequence = 1,
      this.seed,
      this.status = 'pending',
      this.image,
      this.error,
      this.generationModel = '',
      this.liked = false});

  Map<String, dynamic> toJson() => {
        'recipe': recipe.toJson(),
        'sequence': sequence,
        'seed': seed,
        'status': status,
        'image': image?.toJson(),
        'error': error,
        'generationModel': generationModel,
        'liked': liked,
      };

  factory _Result.fromJson(Map<String, dynamic> json) => _Result(
        ArtistRecipe.fromJson(
            Map<String, dynamic>.from(json['recipe'] as Map? ?? const {})),
        sequence: (json['sequence'] as num?)?.toInt() ?? 1,
        seed: (json['seed'] as num?)?.toInt(),
        status: json['status']?.toString() ?? 'pending',
        image: json['image'] is Map
            ? HistoryItem.fromJson(
                Map<String, dynamic>.from(json['image'] as Map))
            : null,
        error: json['error']?.toString(),
        generationModel: json['generationModel']?.toString() ?? '',
        liked: json['liked'] == true,
      );
}

class RandomArtistLabScreen extends StatefulWidget {
  final VoidCallback onBack;
  final ArtistTagService? artistService;
  const RandomArtistLabScreen({
    super.key,
    required this.onBack,
    this.artistService,
  });

  @override
  State<RandomArtistLabScreen> createState() => _RandomArtistLabScreenState();
}

class _RandomArtistLabScreenState extends State<RandomArtistLabScreen> {
  static const _prefsPrefix = 'artist_lab_random_v1_';
  static const _artistWeightMinDefault = .2;
  static const _artistWeightMaxDefault = 1.2;
  static const _customTagWeightMinDefault = .2;
  static const _customTagWeightMaxDefault = 1.2;
  static const _franchiseWeightMinDefault = .15;
  static const _franchiseWeightMaxDefault = .8;
  late final ArtistTagService _service =
      widget.artistService ?? ArtistTagService();
  final _base = TextEditingController();
  final _auxiliary = TextEditingController();
  final _customTags = TextEditingController();
  final _customTagSearch = TextEditingController();
  final _count = TextEditingController(text: '8');
  final _minArtists = TextEditingController(text: '3');
  final _maxArtists = TextEditingController(text: '7');
  final _minArtistWeight = TextEditingController(text: '0.2');
  final _maxArtistWeight = TextEditingController(text: '1.2');
  final _minCustomTagWeight = TextEditingController(text: '0.2');
  final _maxCustomTagWeight = TextEditingController(text: '1.2');
  final _minRandomCustomTags = TextEditingController(text: '1');
  final _maxRandomCustomTags = TextEditingController(text: '3');
  final _minFranchiseStyles = TextEditingController(text: '0');
  final _maxFranchiseStyles = TextEditingController(text: '2');
  final _minFranchiseWeight = TextEditingController(text: '0.15');
  final _maxFranchiseWeight = TextEditingController(text: '0.8');
  final _seed = TextEditingController(text: '246813579');
  final _poolSize = TextEditingController(text: '1000');
  final _width = TextEditingController(text: '832');
  final _height = TextEditingController(text: '1216');
  final _negative = TextEditingController();
  final _weightTuneInput = TextEditingController();
  final _weightTuneCount = TextEditingController(text: '8');
  final _weightVariation = TextEditingController(text: '20');
  final _scrollController = ScrollController();
  GenerateParams _generationParams = GenerateParams();
  List<ArtistTagRecord> _pool = const [];
  List<ArtistRecipe> _planned = const [];
  final List<_Result> _results = [];
  final List<_Result> _favorites = [];
  bool _mutateAuxiliary = false;
  bool _includeFranchiseStyles = false;
  String _seedMode = 'fixed';
  bool _loading = true;
  bool _running = false;
  bool _cancelled = false;
  bool _showFavorites = false;
  String _customTagCategory = 'quality';
  final Map<String, String> _customTagModes = {};
  List<OfflineTagHit> _customTagCatalogItems = const [];
  int _customTagCatalogTotal = 0;
  int _customTagCatalogLimit = 120;
  bool _customTagCatalogLoading = false;
  Timer? _customTagSearchTimer;
  String _favoriteModelFilter = 'all';
  String _message = '';
  String _copiedAction = '';
  int _drawSeed = Random.secure().nextInt(0x7fffffff);

  void _setStateKeepingScroll(VoidCallback update) {
    if (!mounted) return;
    final scrollOffset =
        _scrollController.hasClients ? _scrollController.offset : null;
    setState(update);
    if (scrollOffset == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) return;
      final position = _scrollController.position;
      final target = scrollOffset
          .clamp(position.minScrollExtent, position.maxScrollExtent)
          .toDouble();
      if ((position.pixels - target).abs() > 0.5) {
        _scrollController.jumpTo(target);
      }
    });
  }

  Map<String, String> _text(String language) {
    switch (normalizeAppLocaleCode(language)) {
      case 'zh-TW':
        return {
          'title': '隨機畫師串抽卡',
          'pool': '動態熱門畫師池',
          'poolSize': 'Danbooru 熱度前 N 名（100～5000）',
          'load': '載入',
          'refresh': '更新排行',
          'base': '固定內容提示詞',
          'aux': '固定附加詞（每次保留）',
          'customTags': '自訂 Tag（權重隨機）',
          'customTagsHint': '使用逗號或換行分隔；所有 Tag 都會加入每個畫師串，只分別隨機權重。',
          'customTagWeightMin': '自訂 Tag 最低權重（0.1～10）',
          'customTagWeightMax': '自訂 Tag 最高權重（0.1～10）',
          'customTagLibrary': 'Tag 快選庫',
          'customTagLibraryHint': '依分類瀏覽或搜尋；每個 Tag 都標示目前介面語言的意思。',
          'customTagSelected': '已選 {count} 個',
          'customTagAvailable': '共 {count} 個可選 Tag',
          'customTagSearch': '搜尋英文 Tag 或中文意思',
          'customTagAll': '全部分類',
          'customTagClear': '清除庫內選擇',
          'customTagNoResults': '沒有符合項目，請縮短關鍵字或切換到全部分類。',
          'mutate': '抽卡時額外加入隨機風格詞',
          'mutateHint':
              '開啟後以相同畫師串、提示詞、Seed 與參數生成 A/B：A 不加風格詞，B 加入 2～6 個帶 0.3～1.5 權重的風格詞。',
          'count': '本批畫師串組數',
          'min': '每串最少畫師（1～20）',
          'max': '每串最多畫師（1～20）',
          'artistWeightMin': '畫師最低權重（0.1～10）',
          'artistWeightMax': '畫師最高權重（0.1～10）',
          'franchise': '加入遊戲／動漫作品風格 Tag',
          'franchiseHint': '從 30 個規範 Danbooru copyright Tag 中抽取，加入每個 A/B 版本。',
          'franchiseMin': '最少作品 Tag（0～20）',
          'franchiseMax': '最多作品 Tag（0～20）',
          'franchiseWeightMin': '作品 Tag 最低權重（0.1～10）',
          'franchiseWeightMax': '作品 Tag 最高權重（0.1～10）',
          'seed': 'Seed',
          'seedMode': 'Seed 模式',
          'seedRandom': '隨機',
          'seedFixed': '固定',
          'randomFixedSeed': '隨機產生固定 Seed',
          'draw': '重新抽卡',
          'generate': '生成這一批',
          'stop': '停止',
          'liked': '依喜歡項抽卡',
          'preview': '本批組合預覽',
          'empty': '正在載入畫師池…',
          'total': '目前候選庫共 {count} 名畫師',
          'apply': '套用到生成',
          'copy': '複製',
          'like': '喜歡',
          'unlike': '取消喜歡',
          'done': '完成',
          'failed': '失敗',
          'retry': '重試',
          'saving': '儲存中',
          'saved': '已收藏',
          'favorites': '喜歡的畫風',
          'favoritesHint': 'A、B 可分別收藏；收藏 B 後，偏好抽卡也會參考其風格詞與權重。',
          'remove': '移除收藏',
          'mutation': '本次風格/光影變異詞',
          'categories': '藝術風格|媒介/筆觸|色彩|光照',
          'running': '生成中',
          'hint': '畫師 Tag 來源：Danbooru',
          'variantPlain': 'A｜僅畫師串',
          'variantMutated': 'B｜畫師串＋隨機風格詞',
          'copyArtists': '複製畫師串',
          'copyFull': '複製完整提示詞',
          'pairSummary': '{pairs} 組 · {images} 張',
          'allModels': '全部模型',
          'modelGroup': '生成模型',
          'previewImage': '雙擊預覽大圖'
        };
      case 'en-US':
        return {
          'title': 'Random Artist-string Gacha',
          'pool': 'Dynamic popular-artist pool',
          'poolSize': 'Danbooru top N by popularity (100–5000)',
          'load': 'Load',
          'refresh': 'Refresh',
          'base': 'Fixed content prompt',
          'aux': 'Fixed extra terms (always kept)',
          'customTags': 'Custom Tags (random weights)',
          'customTagsHint':
              'Separate with commas or new lines. Set each Tag to Always or Random below; weights are rerolled either way.',
          'customTagWeightMin': 'Minimum custom Tag weight (0.1–10)',
          'customTagWeightMax': 'Maximum custom Tag weight (0.1–10)',
          'customTagLibrary': 'Tag quick-pick library',
          'customTagLibraryHint':
              'Browse by category or search. Every Tag includes a meaning in the current UI language.',
          'customTagSelected': '{count} selected',
          'customTagAvailable': '{count} Tags available',
          'customTagSearch': 'Search English Tags or meanings',
          'customTagAll': 'All categories',
          'customTagClear': 'Clear library choices',
          'customTagNoResults':
              'No matches. Try a shorter query or switch to all categories.',
          'mutate': 'Add random style terms during the draw',
          'mutateHint':
              'Create a fair A/B pair with the same artist string, prompt, seed, and settings: A has no random styles; B adds 2–6 terms weighted 0.3–1.5.',
          'count': 'Artist-string groups in this batch',
          'min': 'Minimum artists per string (1–20)',
          'max': 'Maximum artists per string (1–20)',
          'artistWeightMin': 'Minimum artist weight (0.1–10)',
          'artistWeightMax': 'Maximum artist weight (0.1–10)',
          'franchise': 'Add game / anime franchise style tags',
          'franchiseHint':
              'Draw from 30 canonical Danbooru copyright tags and add them to every A/B variant.',
          'franchiseMin': 'Minimum franchise tags (0–20)',
          'franchiseMax': 'Maximum franchise tags (0–20)',
          'franchiseWeightMin': 'Minimum franchise weight (0.1–10)',
          'franchiseWeightMax': 'Maximum franchise weight (0.1–10)',
          'seed': 'Seed',
          'seedMode': 'Seed mode',
          'seedRandom': 'Random',
          'seedFixed': 'Fixed',
          'randomFixedSeed': 'Generate random fixed seed',
          'draw': 'Draw again',
          'generate': 'Generate this batch',
          'stop': 'Stop',
          'liked': 'Draw from liked',
          'preview': 'Current draw',
          'empty': 'Loading artist pool…',
          'total': '{count} artists in the current pool',
          'apply': 'Apply to Generate',
          'copy': 'Copy',
          'like': 'Like',
          'unlike': 'Unlike',
          'done': 'Complete',
          'failed': 'Failed',
          'retry': 'Retry',
          'saving': 'Saving',
          'saved': 'Saved',
          'favorites': 'Favorite styles',
          'favoritesHint':
              'A and B can be saved independently. Favorite B terms and weights can guide later style-enabled draws.',
          'remove': 'Remove favorite',
          'mutation': 'Style / lighting terms in this draw',
          'categories': 'Art style|Medium / brushwork|Color|Lighting',
          'running': 'Generating',
          'hint': 'Artist tag source: Danbooru',
          'variantPlain': 'A | Artist string only',
          'variantMutated': 'B | Artist string + random styles',
          'copyArtists': 'Copy artist string',
          'copyFull': 'Copy full prompt',
          'pairSummary': '{pairs} groups · {images} images',
          'allModels': 'All models',
          'modelGroup': 'Generation model',
          'previewImage': 'Double-tap to preview'
        };
      case 'ja-JP':
        return {
          'title': 'ランダム画家タグ抽選',
          'pool': '動的人気画家プール',
          'poolSize': '人気順上位 N 名（100～5000）',
          'load': '読込',
          'refresh': '更新',
          'base': '固定内容プロンプト',
          'aux': '固定追加語（常に保持）',
          'customTags': 'カスタム Tag（ウェイトのみ抽選）',
          'customTagsHint':
              'カンマまたは改行で区切り、各 Tag を下で「毎回」または「ランダム」に設定します。ウェイトはいずれも抽選されます。',
          'customTagWeightMin': 'カスタム Tag の最小ウェイト（0.1～10）',
          'customTagWeightMax': 'カスタム Tag の最大ウェイト（0.1～10）',
          'customTagLibrary': 'Tag クイック選択',
          'customTagLibraryHint': 'カテゴリ別に閲覧・検索できます。各 Tag に現在のUI言語で意味を表示します。',
          'customTagSelected': '{count} 個選択中',
          'customTagAvailable': '全 {count} Tag',
          'customTagSearch': '英語 Tag または意味を検索',
          'customTagAll': 'すべてのカテゴリ',
          'customTagClear': 'ライブラリ選択を解除',
          'customTagNoResults': '一致する項目がありません。短い語句か全カテゴリで検索してください。',
          'mutate': '抽選時に画風語を追加',
          'mutateHint':
              '同じ画家列・プロンプト・Seed・設定で A/B を生成します。A は画風語なし、B は 0.3～1.5 重みの画風語を 2～6 個追加します。',
          'count': 'このバッチの画家列グループ数',
          'min': '1組の最小画家数（1～20）',
          'max': '1組の最大画家数（1～20）',
          'artistWeightMin': '画家の最小ウェイト（0.1～10）',
          'artistWeightMax': '画家の最大ウェイト（0.1～10）',
          'franchise': 'ゲーム／アニメ作品スタイル Tag を追加',
          'franchiseHint':
              '30 個の正規 Danbooru copyright Tag から抽選し、すべての A/B に追加します。',
          'franchiseMin': '作品 Tag の最小数（0～20）',
          'franchiseMax': '作品 Tag の最大数（0～20）',
          'franchiseWeightMin': '作品 Tag の最小ウェイト（0.1～10）',
          'franchiseWeightMax': '作品 Tag の最大ウェイト（0.1～10）',
          'seed': 'Seed',
          'seedMode': 'Seed モード',
          'seedRandom': 'ランダム',
          'seedFixed': '固定',
          'randomFixedSeed': '固定 Seed をランダム生成',
          'draw': '再抽選',
          'generate': 'このバッチを生成',
          'stop': '停止',
          'liked': 'お気に入りから抽選',
          'preview': '現在の抽選',
          'empty': '画家プール読込中…',
          'total': '現在の候補は全 {count} 名',
          'apply': '生成へ適用',
          'copy': 'コピー',
          'like': 'お気に入り',
          'unlike': '解除',
          'done': '完了',
          'failed': '失敗',
          'retry': '再試行',
          'saving': '保存中',
          'saved': '保存済み',
          'favorites': 'お気に入り画風',
          'favoritesHint': 'A/B は個別保存できます。B の画風語と重みは次の画風語抽選にも反映できます。',
          'remove': 'お気に入り削除',
          'mutation': '今回の画風・光変異語',
          'categories': '画風|画材・筆致|色彩|光',
          'running': '生成中',
          'hint': '画家 Tag の出典：Danbooru',
          'variantPlain': 'A｜画家列のみ',
          'variantMutated': 'B｜画家列＋ランダム画風語',
          'copyArtists': '画家列をコピー',
          'copyFull': '完全プロンプトをコピー',
          'pairSummary': '{pairs} 組 · {images} 枚',
          'allModels': 'すべてのモデル',
          'modelGroup': '生成モデル',
          'previewImage': 'ダブルタップで拡大'
        };
      case 'ko-KR':
        return {
          'title': '무작위 작가 조합 뽑기',
          'pool': '동적 인기 작가 풀',
          'poolSize': 'Danbooru 인기 상위 N명 (100～5000)',
          'load': '불러오기',
          'refresh': '새로고침',
          'base': '고정 내용 프롬프트',
          'aux': '고정 추가 용어 (항상 유지)',
          'customTags': '사용자 지정 Tag (가중치만 무작위)',
          'customTagsHint':
              '쉼표나 줄바꿈으로 구분하고 각 Tag를 아래에서 매번 또는 무작위로 설정합니다. 가중치는 모두 다시 뽑습니다.',
          'customTagWeightMin': '사용자 Tag 최소 가중치 (0.1～10)',
          'customTagWeightMax': '사용자 Tag 최대 가중치 (0.1～10)',
          'customTagLibrary': 'Tag 빠른 선택',
          'customTagLibraryHint':
              '카테고리별로 탐색하거나 검색합니다. 각 Tag의 뜻을 현재 UI 언어로 표시합니다.',
          'customTagSelected': '{count}개 선택',
          'customTagAvailable': '총 {count}개 Tag',
          'customTagSearch': '영문 Tag 또는 뜻 검색',
          'customTagAll': '모든 카테고리',
          'customTagClear': '라이브러리 선택 해제',
          'customTagNoResults': '일치하는 항목이 없습니다. 더 짧게 검색하거나 전체 카테고리를 선택하세요.',
          'mutate': '뽑을 때 무작위 화풍 용어 추가',
          'mutateHint':
              '같은 작가 문자열·프롬프트·Seed·설정으로 A/B를 생성합니다. A는 화풍 용어가 없고 B는 0.3～1.5 가중치의 용어 2～6개를 추가합니다.',
          'count': '이번 배치 작가 문자열 그룹 수',
          'min': '조합당 최소 작가 수 (1～20)',
          'max': '조합당 최대 작가 수 (1～20)',
          'artistWeightMin': '작가 최소 가중치 (0.1～10)',
          'artistWeightMax': '작가 최대 가중치 (0.1～10)',
          'franchise': '게임／애니 작품 스타일 Tag 추가',
          'franchiseHint':
              '정규 Danbooru copyright Tag 30개에서 뽑아 모든 A/B 버전에 추가합니다.',
          'franchiseMin': '최소 작품 Tag 수 (0～20)',
          'franchiseMax': '최대 작품 Tag 수 (0～20)',
          'franchiseWeightMin': '작품 Tag 최소 가중치 (0.1～10)',
          'franchiseWeightMax': '작품 Tag 최대 가중치 (0.1～10)',
          'seed': 'Seed',
          'seedMode': 'Seed 모드',
          'seedRandom': '무작위',
          'seedFixed': '고정',
          'randomFixedSeed': '무작위 고정 Seed 생성',
          'draw': '다시 뽑기',
          'generate': '이 배치 생성',
          'stop': '중지',
          'liked': '좋아요로 뽑기',
          'preview': '현재 뽑기',
          'empty': '작가 풀 로딩 중…',
          'total': '현재 후보 풀 총 {count}명',
          'apply': '생성에 적용',
          'copy': '복사',
          'like': '좋아요',
          'unlike': '취소',
          'done': '완료',
          'failed': '실패',
          'retry': '재시도',
          'saving': '저장 중',
          'saved': '저장됨',
          'favorites': '좋아하는 화풍',
          'favoritesHint':
              'A/B를 각각 저장할 수 있습니다. B의 화풍 용어와 가중치는 이후 화풍 추첨에도 반영됩니다.',
          'remove': '즐겨찾기 제거',
          'mutation': '이번 화풍/조명 변이 용어',
          'categories': '화풍|매체/붓질|색상|조명',
          'running': '생성 중',
          'hint': '작가 Tag 출처: Danbooru',
          'variantPlain': 'A｜작가 문자열만',
          'variantMutated': 'B｜작가 문자열＋무작위 화풍',
          'copyArtists': '작가 문자열 복사',
          'copyFull': '전체 프롬프트 복사',
          'pairSummary': '{pairs} 그룹 · {images}장',
          'allModels': '모든 모델',
          'modelGroup': '생성 모델',
          'previewImage': '두 번 탭하여 미리보기'
        };
      default:
        return {
          'title': '随机画师串抽卡',
          'pool': '动态热门画师池',
          'poolSize': 'Danbooru 热度前 N 名（100～5000）',
          'load': '载入',
          'refresh': '刷新排行',
          'base': '固定内容提示词',
          'aux': '固定附加词（每次保留）',
          'customTags': '自定义 Tag（权重随机）',
          'customTagsHint': '使用逗号或换行分隔；每个 Tag 可在下方设为“每串必加”或“随机加入”，权重都会随机。',
          'customTagWeightMin': '自定义 Tag 最低权重（0.1～10）',
          'customTagWeightMax': '自定义 Tag 最高权重（0.1～10）',
          'customTagLibrary': 'Tag 快选库',
          'customTagLibraryHint': '按分类浏览或搜索；每个 Tag 都标注当前界面语言的含义。',
          'customTagSelected': '已选 {count} 个',
          'customTagAvailable': '共 {count} 个可选 Tag',
          'customTagSearch': '搜索英文 Tag 或中文含义',
          'customTagAll': '全部分类',
          'customTagClear': '清除库内选择',
          'customTagNoResults': '没有匹配项，请尝试更短的关键词或切换到全部分类。',
          'mutate': '抽卡时额外加入随机风格词',
          'mutateHint':
              '开启后以相同画师串、提示词、Seed 和参数生成 A/B：A 不加风格词，B 加入 2～6 个带 0.3～1.5 权重的风格词。',
          'count': '本批画师串组数',
          'min': '每串最少画师（1～20）',
          'max': '每串最多画师（1～20）',
          'artistWeightMin': '画师最低权重（0.1～10）',
          'artistWeightMax': '画师最高权重（0.1～10）',
          'franchise': '加入游戏／动漫作品风格 Tag',
          'franchiseHint': '从 30 个规范 Danbooru copyright Tag 中抽取，加入每个 A/B 版本。',
          'franchiseMin': '最少作品 Tag（0～20）',
          'franchiseMax': '最多作品 Tag（0～20）',
          'franchiseWeightMin': '作品 Tag 最低权重（0.1～10）',
          'franchiseWeightMax': '作品 Tag 最高权重（0.1～10）',
          'seed': 'Seed',
          'seedMode': 'Seed 模式',
          'seedRandom': '随机',
          'seedFixed': '固定',
          'randomFixedSeed': '随机生成固定 Seed',
          'draw': '重新抽卡',
          'generate': '生成这一批',
          'stop': '停止',
          'liked': '根据喜欢项抽卡',
          'preview': '本批组合预览',
          'empty': '正在载入画师池…',
          'total': '当前候选库共 {count} 名画师',
          'apply': '应用到生成',
          'copy': '复制',
          'like': '喜欢',
          'unlike': '取消喜欢',
          'done': '完成',
          'failed': '失败',
          'retry': '重试',
          'saving': '保存中',
          'saved': '已收藏',
          'favorites': '喜欢的画风',
          'favoritesHint': 'A、B 可分别收藏；收藏 B 后，偏好抽卡也会参考其风格词与权重。',
          'remove': '移除收藏',
          'mutation': '本次风格/光影变异词',
          'categories': '艺术风格|媒介/笔触|色彩|光照',
          'running': '生成中',
          'hint': '画师 Tag 来源：Danbooru',
          'variantPlain': 'A｜仅画师串',
          'variantMutated': 'B｜画师串＋随机风格词',
          'copyArtists': '复制画师串',
          'copyFull': '复制完整提示词',
          'pairSummary': '{pairs} 组 · {images} 张',
          'allModels': '全部模型',
          'modelGroup': '生成模型',
          'previewImage': '双击预览大图'
        };
    }
  }

  Map<String, String> _parameterText(String language) {
    switch (normalizeAppLocaleCode(language)) {
      case 'zh-TW':
        return {
          'title': 'NovelAI 生成參數',
          'hint': '首次使用軟體初始參數；此處修改只用於抽卡，A/B 使用相同參數。',
          'sync': '從生成頁同步',
          'reset': '恢復初始參數',
          'model': '模型',
          'size': '圖片尺寸',
          'width': '寬度',
          'height': '高度',
          'negative': '負面提示詞',
          'steps': '步數',
          'sampler': '採樣器',
          'noise': '噪聲計畫',
          'uc': '負面預設',
          'quality': '品質詞',
        };
      case 'en-US':
        return {
          'title': 'NovelAI generation settings',
          'hint':
              'Uses app defaults initially. Changes affect only gacha and each A/B pair uses identical settings.',
          'sync': 'Sync from Generate',
          'reset': 'Restore defaults',
          'model': 'Model',
          'size': 'Image size',
          'width': 'Width',
          'height': 'Height',
          'negative': 'Negative prompt',
          'steps': 'Steps',
          'sampler': 'Sampler',
          'noise': 'Noise schedule',
          'uc': 'UC preset',
          'quality': 'Quality tags',
        };
      case 'ja-JP':
        return {
          'title': 'NovelAI 生成設定',
          'hint': '初回はアプリ既定値を使います。変更は抽選だけに使い、A/B は同じ設定で比較します。',
          'sync': '生成画面から同期',
          'reset': '初期設定に戻す',
          'model': 'モデル',
          'size': '画像サイズ',
          'width': '幅',
          'height': '高さ',
          'negative': 'ネガティブプロンプト',
          'steps': 'ステップ',
          'sampler': 'サンプラー',
          'noise': 'ノイズスケジュール',
          'uc': 'UC プリセット',
          'quality': '品質タグ',
        };
      case 'ko-KR':
        return {
          'title': 'NovelAI 생성 설정',
          'hint': '처음에는 앱 기본 설정을 사용합니다. 변경은 뽑기에만 적용되며 A/B는 같은 설정을 사용합니다.',
          'sync': '생성 화면에서 동기화',
          'reset': '초기값 복원',
          'model': '모델',
          'size': '이미지 크기',
          'width': '너비',
          'height': '높이',
          'negative': '네거티브 프롬프트',
          'steps': '스텝',
          'sampler': '샘플러',
          'noise': '노이즈 스케줄',
          'uc': 'UC 프리셋',
          'quality': '품질 태그',
        };
      default:
        return {
          'title': 'NovelAI 生成参数',
          'hint': '首次使用软件初始参数；此处修改仅用于抽卡，A/B 使用相同参数。',
          'sync': '从生成页同步',
          'reset': '恢复初始参数',
          'model': '模型',
          'size': '图片尺寸',
          'width': '宽度',
          'height': '高度',
          'negative': '负面提示词',
          'steps': '步数',
          'sampler': '采样器',
          'noise': '噪声计划',
          'uc': '负面预设',
          'quality': '质量词',
        };
    }
  }

  Map<String, String> _tuneText(String language) {
    switch (normalizeAppLocaleCode(language)) {
      case 'zh-TW':
        return {
          'title': '既有畫師串權重微調',
          'hint': '保持畫師名單與順序不變，只在原權重上下隨機浮動。無權重標籤按 1.0 處理。',
          'input': '貼上畫師串',
          'count': '候選組數',
          'variation': '權重浮動（±%）',
          'generate': '生成權重微調候選',
          'noArtists': '未識別到 artist: 畫師標籤。',
          'copied': '已複製 ✓',
          'copiedArtists': '畫師串已複製到剪貼簿。',
          'copiedFull': '完整提示詞已複製到剪貼簿。',
        };
      case 'en-US':
        return {
          'title': 'Fine-tune an existing artist string',
          'hint':
              'Keep artist names and order fixed while varying only their weights around the originals. Unweighted tags use 1.0.',
          'input': 'Paste artist string',
          'count': 'Candidate groups',
          'variation': 'Weight variation (±%)',
          'generate': 'Generate weight-tuned candidates',
          'noArtists': 'No artist: tags were recognized.',
          'copied': 'Copied ✓',
          'copiedArtists': 'Artist string copied to the clipboard.',
          'copiedFull': 'Full prompt copied to the clipboard.',
        };
      case 'ja-JP':
        return {
          'title': '既存の画家列の重みを微調整',
          'hint': '画家名と順序を固定し、元の重みだけを上下に変化させます。重みなしは 1.0 とします。',
          'input': '画家列を貼り付け',
          'count': '候補グループ数',
          'variation': '重み変動（±%）',
          'generate': '重み候補を生成',
          'noArtists': 'artist: 画家タグを認識できませんでした。',
          'copied': 'コピー済み ✓',
          'copiedArtists': '画家列をクリップボードへコピーしました。',
          'copiedFull': '完全プロンプトをクリップボードへコピーしました。',
        };
      case 'ko-KR':
        return {
          'title': '기존 작가 문자열 가중치 미세 조정',
          'hint': '작가 목록과 순서는 유지하고 원래 가중치만 위아래로 변경합니다. 가중치가 없으면 1.0입니다.',
          'input': '작가 문자열 붙여넣기',
          'count': '후보 그룹 수',
          'variation': '가중치 변동 (±%)',
          'generate': '가중치 후보 생성',
          'noArtists': 'artist: 작가 태그를 인식하지 못했습니다.',
          'copied': '복사됨 ✓',
          'copiedArtists': '작가 문자열을 클립보드에 복사했습니다.',
          'copiedFull': '전체 프롬프트를 클립보드에 복사했습니다.',
        };
      default:
        return {
          'title': '已有画师串权重微调',
          'hint': '保持画师名单和顺序不变，只在原权重上下随机浮动。无权重标签按 1.0 处理。',
          'input': '粘贴画师串',
          'count': '候选组数',
          'variation': '权重浮动（±%）',
          'generate': '生成权重微调候选',
          'noArtists': '没有识别到 artist: 画师标签。',
          'copied': '已复制 ✓',
          'copiedArtists': '画师串已复制到剪贴板。',
          'copiedFull': '完整提示词已复制到剪贴板。',
        };
    }
  }

  void _syncParameterControllers() {
    _width.text = '${_generationParams.width}';
    _height.text = '${_generationParams.height}';
    _negative.text = _generationParams.negativePrompt;
  }

  int _positive(TextEditingController controller, [int fallback = 1]) {
    final value = int.tryParse(controller.text.trim());
    return value != null && value > 0 ? value : fallback;
  }

  int _nonNegative(TextEditingController controller, [int fallback = 0]) {
    final value = int.tryParse(controller.text.trim());
    return value != null && value >= 0 ? value : fallback;
  }

  double _decimal(TextEditingController controller, double fallback) {
    final value = double.tryParse(controller.text.trim());
    return value != null && value.isFinite ? value : fallback;
  }

  int _seedValue() =>
      (int.tryParse(_seed.text.trim()) ?? 1).clamp(1, 2147483647).toInt();

  int _weightVariationValue() =>
      (int.tryParse(_weightVariation.text.trim()) ?? 20).clamp(0, 100).toInt();

  String _resetDrawLabel(String language) => switch (language) {
        'zh-TW' => '恢復抽卡預設',
        'en-US' => 'Restore draw defaults',
        'ja-JP' => '抽選設定を初期化',
        'ko-KR' => '뽑기 기본값 복원',
        _ => '恢复抽卡默认',
      };

  String _resetDrawHint(String language) => switch (language) {
        'zh-TW' => 'V5 預設：畫師與自訂 Tag 0.2～1.2；系列風格 0.15～0.8。',
        'en-US' =>
          'V5 defaults: artists and custom Tags 0.2–1.2; franchises 0.15–0.8.',
        'ja-JP' => 'V5 初期値：画家とカスタム Tag 0.2～1.2、作品風格 0.15～0.8。',
        'ko-KR' => 'V5 기본값: 작가와 사용자 Tag 0.2～1.2, 작품 화풍 0.15～0.8.',
        _ => 'V5 默认：画师与自定义 Tag 0.2～1.2；系列风格 0.15～0.8。',
      };

  Future<void> _restoreDrawDefaults(String language) async {
    setState(() {
      _count.text = '8';
      _minArtists.text = '3';
      _maxArtists.text = '7';
      _minArtistWeight.text = '0.2';
      _maxArtistWeight.text = '1.2';
      _minCustomTagWeight.text = '0.2';
      _maxCustomTagWeight.text = '1.2';
      _minRandomCustomTags.text = '1';
      _maxRandomCustomTags.text = '3';
      _minFranchiseStyles.text = '0';
      _maxFranchiseStyles.text = '2';
      _minFranchiseWeight.text = '0.15';
      _maxFranchiseWeight.text = '0.8';
      _includeFranchiseStyles = false;
      _mutateAuxiliary = false;
      _seedMode = 'fixed';
      _seed.text = '246813579';
      _drawSeed = Random.secure().nextInt(0x7fffffff);
      _planned = _buildPlan();
      _message = _resetDrawHint(language);
    });
    await _save();
  }

  void _commitCustomTags() {
    setState(() {
      _drawSeed = Random.secure().nextInt(0x7fffffff);
      _planned = _buildPlan();
    });
    _save();
  }

  void _commitDimension(TextEditingController controller, bool width) {
    final fallback = width ? _generationParams.width : _generationParams.height;
    final parsed = int.tryParse(controller.text) ?? fallback;
    final snapped = snapNaiDimensionWithinArea(
      parsed,
      width ? _generationParams.height : _generationParams.width,
      fallback,
    );
    setState(() {
      controller.text = '$snapped';
      if (width) {
        _generationParams.width = snapped;
      } else {
        _generationParams.height = snapped;
      }
    });
    _save();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final app = context.read<AppState>();
    final prefs = await SharedPreferences.getInstance();
    _base.text =
        prefs.getString('${_prefsPrefix}base') ?? app.params.positivePrompt;
    _auxiliary.text = prefs.getString('${_prefsPrefix}aux') ?? '';
    _customTags.text = prefs.getString('${_prefsPrefix}customTags') ?? '';
    try {
      final savedModes = jsonDecode(
        prefs.getString('${_prefsPrefix}customTagModes') ?? '{}',
      );
      if (savedModes is Map) {
        _customTagModes
          ..clear()
          ..addAll(savedModes.map((key, value) => MapEntry(
                key.toString().toLowerCase(),
                value.toString() == 'random' ? 'random' : 'always',
              )));
      }
    } catch (_) {}
    _minRandomCustomTags.text =
        '${prefs.getInt('${_prefsPrefix}minRandomCustomTags') ?? 1}';
    _maxRandomCustomTags.text =
        '${prefs.getInt('${_prefsPrefix}maxRandomCustomTags') ?? 3}';
    _count.text = '${prefs.getInt('${_prefsPrefix}count') ?? 8}';
    final oldArtistCount = prefs.getInt('${_prefsPrefix}artistCount');
    _minArtists.text =
        '${prefs.getInt('${_prefsPrefix}minArtists') ?? oldArtistCount ?? 3}';
    _maxArtists.text =
        '${prefs.getInt('${_prefsPrefix}maxArtists') ?? oldArtistCount ?? 7}';
    final migrateV5Weights =
        (prefs.getInt('${_prefsPrefix}weightDefaultsVersion') ?? 0) < 2;
    _minArtistWeight.text = migrateV5Weights
        ? '0.2'
        : '${prefs.getDouble('${_prefsPrefix}minArtistWeight') ?? _artistWeightMinDefault}';
    _maxArtistWeight.text = migrateV5Weights
        ? '1.2'
        : '${prefs.getDouble('${_prefsPrefix}maxArtistWeight') ?? _artistWeightMaxDefault}';
    _minCustomTagWeight.text =
        '${prefs.getDouble('${_prefsPrefix}minCustomTagWeight') ?? _customTagWeightMinDefault}';
    _maxCustomTagWeight.text =
        '${prefs.getDouble('${_prefsPrefix}maxCustomTagWeight') ?? _customTagWeightMaxDefault}';
    _minFranchiseStyles.text =
        '${prefs.getInt('${_prefsPrefix}minFranchiseStyles') ?? 0}';
    _maxFranchiseStyles.text =
        '${prefs.getInt('${_prefsPrefix}maxFranchiseStyles') ?? 2}';
    _minFranchiseWeight.text = migrateV5Weights
        ? '0.15'
        : '${prefs.getDouble('${_prefsPrefix}minFranchiseWeight') ?? _franchiseWeightMinDefault}';
    _maxFranchiseWeight.text = migrateV5Weights
        ? '0.8'
        : '${prefs.getDouble('${_prefsPrefix}maxFranchiseWeight') ?? _franchiseWeightMaxDefault}';
    if (migrateV5Weights) {
      await prefs.setInt('${_prefsPrefix}weightDefaultsVersion', 2);
    }
    _poolSize.text = '${prefs.getInt('${_prefsPrefix}poolSize') ?? 1000}';
    _seed.text = '${prefs.getInt('${_prefsPrefix}seed') ?? 246813579}';
    _weightTuneInput.text =
        prefs.getString('${_prefsPrefix}weightTuneInput') ?? '';
    _weightTuneCount.text =
        '${prefs.getInt('${_prefsPrefix}weightTuneCount') ?? 8}';
    _weightVariation.text =
        '${prefs.getInt('${_prefsPrefix}weightVariation') ?? 20}';
    try {
      final saved = prefs.getString('${_prefsPrefix}generationParams');
      _generationParams = saved == null
          ? GenerateParams()
          : GenerateParams.fromJson(
              Map<String, dynamic>.from(jsonDecode(saved) as Map));
    } catch (_) {
      _generationParams = GenerateParams();
    }
    _generationParams
      ..positivePrompt = ''
      ..stylePrompt = '';
    _syncParameterControllers();
    _mutateAuxiliary = prefs.getBool('${_prefsPrefix}mutate') ?? false;
    _includeFranchiseStyles =
        prefs.getBool('${_prefsPrefix}includeFranchiseStyles') ?? false;
    _seedMode = prefs.getString('${_prefsPrefix}seedMode') == 'random'
        ? 'random'
        : 'fixed';
    _showFavorites = prefs.getBool('${_prefsPrefix}showFavorites') ?? false;
    for (final entry in <(String, List<_Result>)>[
      ('results', _results),
      ('favorites', _favorites),
    ]) {
      try {
        final rows =
            jsonDecode(prefs.getString('$_prefsPrefix${entry.$1}') ?? '[]')
                as List;
        entry.$2.addAll(rows
            .whereType<Map>()
            .map((item) => _Result.fromJson(Map<String, dynamic>.from(item)))
            .where((item) =>
                item.image == null || File(item.image!.filePath).existsSync()));
      } catch (_) {}
    }
    await _loadPool(false);
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('${_prefsPrefix}base', _base.text);
    await prefs.setString('${_prefsPrefix}aux', _auxiliary.text);
    await prefs.setString('${_prefsPrefix}customTags', _customTags.text);
    await prefs.setString(
        '${_prefsPrefix}customTagModes', jsonEncode(_customTagModes));
    await prefs.setInt('${_prefsPrefix}minRandomCustomTags',
        _nonNegative(_minRandomCustomTags, 1));
    await prefs.setInt('${_prefsPrefix}maxRandomCustomTags',
        _nonNegative(_maxRandomCustomTags, 3));
    await prefs.setInt('${_prefsPrefix}count', _positive(_count, 8));
    await prefs.setInt('${_prefsPrefix}minArtists',
        _positive(_minArtists, 3).clamp(1, 20).toInt());
    await prefs.setInt('${_prefsPrefix}maxArtists',
        _positive(_maxArtists, 7).clamp(1, 20).toInt());
    await prefs.setDouble(
        '${_prefsPrefix}minArtistWeight',
        _decimal(_minArtistWeight, _artistWeightMinDefault)
            .clamp(.1, 10)
            .toDouble());
    await prefs.setDouble(
        '${_prefsPrefix}maxArtistWeight',
        _decimal(_maxArtistWeight, _artistWeightMaxDefault)
            .clamp(.1, 10)
            .toDouble());
    await prefs.setDouble(
        '${_prefsPrefix}minCustomTagWeight',
        _decimal(_minCustomTagWeight, _customTagWeightMinDefault)
            .clamp(.1, 10)
            .toDouble());
    await prefs.setDouble(
        '${_prefsPrefix}maxCustomTagWeight',
        _decimal(_maxCustomTagWeight, _customTagWeightMaxDefault)
            .clamp(.1, 10)
            .toDouble());
    await prefs.setInt('${_prefsPrefix}minFranchiseStyles',
        _nonNegative(_minFranchiseStyles).clamp(0, 20).toInt());
    await prefs.setInt('${_prefsPrefix}maxFranchiseStyles',
        _nonNegative(_maxFranchiseStyles, 2).clamp(0, 20).toInt());
    await prefs.setDouble(
        '${_prefsPrefix}minFranchiseWeight',
        _decimal(_minFranchiseWeight, _franchiseWeightMinDefault)
            .clamp(.1, 10)
            .toDouble());
    await prefs.setDouble(
        '${_prefsPrefix}maxFranchiseWeight',
        _decimal(_maxFranchiseWeight, _franchiseWeightMaxDefault)
            .clamp(.1, 10)
            .toDouble());
    await prefs.setInt('${_prefsPrefix}poolSize', _poolLimit());
    await prefs.setInt('${_prefsPrefix}seed', _seedValue());
    await prefs.setString(
        '${_prefsPrefix}weightTuneInput', _weightTuneInput.text);
    await prefs.setInt('${_prefsPrefix}weightTuneCount',
        _positive(_weightTuneCount, 8).clamp(1, 1000).toInt());
    await prefs.setInt(
        '${_prefsPrefix}weightVariation', _weightVariationValue());
    final dimensions = fitNaiImageSize(
      int.tryParse(_width.text) ?? _generationParams.width,
      int.tryParse(_height.text) ?? _generationParams.height,
      fallbackWidth: 832,
      fallbackHeight: 1216,
    );
    _generationParams
      ..width = dimensions.$1
      ..height = dimensions.$2
      ..negativePrompt = _negative.text;
    _width.text = '${dimensions.$1}';
    _height.text = '${dimensions.$2}';
    await prefs.setString('${_prefsPrefix}generationParams',
        jsonEncode(_generationParams.toJson()));
    await prefs.setBool('${_prefsPrefix}mutate', _mutateAuxiliary);
    await prefs.setBool(
        '${_prefsPrefix}includeFranchiseStyles', _includeFranchiseStyles);
    await prefs.setString('${_prefsPrefix}seedMode', _seedMode);
    await prefs.setBool('${_prefsPrefix}showFavorites', _showFavorites);
    await prefs.setString('${_prefsPrefix}results',
        jsonEncode(_results.map((item) => item.toJson()).toList()));
    await prefs.setString('${_prefsPrefix}favorites',
        jsonEncode(_favorites.map((item) => item.toJson()).toList()));
  }

  int _poolLimit() => _positive(_poolSize, 1000).clamp(100, 5000).toInt();

  List<ArtistRecipe> _buildPlan([
    Set<String> favorites = const {},
    List<StyleMutationTerm> favoriteMutations = const [],
  ]) =>
      drawArtistRecipes(
        pool: _pool,
        count: _positive(_count, 8),
        minArtists: _positive(_minArtists, 3).clamp(1, 20).toInt(),
        maxArtists: _positive(_maxArtists, 7).clamp(1, 20).toInt(),
        drawSeed: _drawSeed,
        minArtistWeight: _decimal(_minArtistWeight, _artistWeightMinDefault),
        maxArtistWeight: _decimal(_maxArtistWeight, _artistWeightMaxDefault),
        auxiliary: _auxiliary.text,
        customTagPool: _customTags.text,
        customTagModes: _customTagModes,
        minRandomCustomTags: _nonNegative(_minRandomCustomTags, 1),
        maxRandomCustomTags: _nonNegative(_maxRandomCustomTags, 3),
        minCustomTagWeight:
            _decimal(_minCustomTagWeight, _customTagWeightMinDefault),
        maxCustomTagWeight:
            _decimal(_maxCustomTagWeight, _customTagWeightMaxDefault),
        mutateAuxiliary: _mutateAuxiliary,
        favorites: favorites,
        favoriteMutations: _mutateAuxiliary ? favoriteMutations : const [],
      );

  Future<void> _loadPool(bool force) async {
    setState(() {
      _loading = true;
      _message = '';
    });
    try {
      final app = context.read<AppState>();
      _pool = await _service.popular(app.settings,
          limit: _poolLimit(), force: force);
      setState(() => _planned = _buildPlan());
    } catch (error) {
      setState(() => _message = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _clearCurrent() async {
    final app = context.read<AppState>();
    final temporary = _results
        .where((item) => !item.liked && item.image != null)
        .map((item) => item.image!)
        .toList();
    for (final item in temporary) {
      await app.deleteArtistLabTemporary(item);
    }
    if (mounted) setState(_results.clear);
  }

  Future<void> _draw({bool likedOnly = false}) async {
    final favorites = likedOnly
        ? _favorites.expand((item) => item.recipe.artists).toSet()
        : <String>{};
    final favoriteMutations = likedOnly && _mutateAuxiliary
        ? _favorites
            .where((item) => item.recipe.variant == 'mutated')
            .expand((item) => item.recipe.mutations)
            .toList()
        : <StyleMutationTerm>[];
    if (likedOnly && favorites.isEmpty) return;
    await _clearCurrent();
    if (!mounted) return;
    _drawSeed = Random.secure().nextInt(0x7fffffff);
    setState(() => _planned = _buildPlan(favorites, favoriteMutations));
    await _save();
  }

  Future<void> _generateOne(_Result result) async {
    final app = context.read<AppState>();
    result.seed ??= _seedMode == 'fixed'
        ? _seedValue()
        : Random.secure().nextInt(0x7fffffff) + 1;
    final fixed = _generationParams.copy()
      ..positivePrompt = _base.text.trim()
      ..stylePrompt = result.recipe.prompt
      ..seedMode = 'fixed'
      ..seed = result.seed!;
    _setStateKeepingScroll(() {
      result.status = 'running';
      result.error = null;
      result.generationModel = fixed.model;
    });
    try {
      final image = await app.generateArtistLabTemporary(
        panelParams: fixed,
        panelExtras: GenerateExtras(),
      );
      _setStateKeepingScroll(() {
        result.image = image;
        result.generationModel =
            image.model.isNotEmpty ? image.model : fixed.model;
        result.status = 'done';
      });
    } catch (error) {
      _setStateKeepingScroll(() {
        result.status = 'failed';
        result.error = error.toString();
      });
    }
    await _save();
  }

  Future<void> _generate() async {
    if (_base.text.trim().isEmpty || _planned.isEmpty || _running) return;
    final app = context.read<AppState>();
    await _clearCurrent();
    final comparisons = expandArtistRecipeComparisons(
      _planned,
      _mutateAuxiliary,
    );
    final variantsPerGroup = _mutateAuxiliary ? 2 : 1;
    final seeds = artistGenerationSeeds(
      groupCount: _planned.length,
      variantsPerGroup: variantsPerGroup,
      fixed: _seedMode == 'fixed',
      fixedSeed: _seedValue(),
      entropySeed: Random.secure().nextInt(0x7fffffff),
    );
    final batch = List<_Result>.generate(
      comparisons.length,
      (index) => _Result(
        comparisons[index],
        seed: seeds[index],
        sequence: _mutateAuxiliary ? index ~/ 2 + 1 : index + 1,
        generationModel: _generationParams.model,
      ),
    );
    _setStateKeepingScroll(() {
      _results
        ..clear()
        ..addAll(batch);
      _running = true;
      _cancelled = false;
      _message = '';
    });
    await _save();
    for (final result in batch) {
      if (_cancelled) break;
      await _generateOne(result);
    }
    if (mounted) {
      _setStateKeepingScroll(() {
        _running = false;
        _message = _cancelled
            ? _text(app.settings.language)['stop']!
            : _text(app.settings.language)['done']!;
      });
    }
    await _save();
  }

  Future<void> _generateWeightTuning() async {
    if (_running || _base.text.trim().isEmpty) return;
    final recipes = randomizeArtistWeights(
      artistPrompt: _weightTuneInput.text,
      count: _positive(_weightTuneCount, 8).clamp(1, 1000).toInt(),
      variationPercent: _weightVariationValue().toDouble(),
      drawSeed: Random.secure().nextInt(0x7fffffff),
    );
    if (recipes.isEmpty) {
      setState(() => _message =
          _tuneText(context.read<AppState>().settings.language)['noArtists']!);
      return;
    }
    await _clearCurrent();
    final seeds = artistGenerationSeeds(
      groupCount: recipes.length,
      variantsPerGroup: 1,
      fixed: _seedMode == 'fixed',
      fixedSeed: _seedValue(),
      entropySeed: Random.secure().nextInt(0x7fffffff),
    );
    final batch = List<_Result>.generate(
      recipes.length,
      (index) => _Result(
        recipes[index],
        sequence: index + 1,
        seed: seeds[index],
        generationModel: _generationParams.model,
      ),
    );
    _setStateKeepingScroll(() {
      _planned = recipes;
      _results
        ..clear()
        ..addAll(batch);
      _running = true;
      _cancelled = false;
      _message = '';
      _showFavorites = false;
    });
    await _save();
    for (final result in batch) {
      if (_cancelled) break;
      await _generateOne(result);
    }
    if (mounted) {
      _setStateKeepingScroll(() {
        _running = false;
        _message = _cancelled
            ? _text(context.read<AppState>().settings.language)['stop']!
            : _text(context.read<AppState>().settings.language)['done']!;
      });
    }
    await _save();
  }

  Future<void> _copyResult(String action, String value, String message) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (!mounted) return;
    setState(() => _copiedAction = action);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
    await Future<void>.delayed(const Duration(milliseconds: 1800));
    if (mounted && _copiedAction == action) {
      setState(() => _copiedAction = '');
    }
  }

  Future<void> _retry(_Result result) async {
    if (_running || result.status != 'failed') return;
    _setStateKeepingScroll(() => _running = true);
    await _generateOne(result);
    _setStateKeepingScroll(() => _running = false);
  }

  Future<void> _saveFavorite(_Result result) async {
    if (result.image == null || result.liked || result.saving) return;
    final app = context.read<AppState>();
    setState(() => result.saving = true);
    try {
      result.image = await app.saveArtistLabFavorite(result.image!);
      result
        ..liked = true
        ..saving = false;
      if (!_favorites.any((item) => item.recipe.id == result.recipe.id)) {
        _favorites.insert(0, result);
      }
    } catch (error) {
      result.saving = false;
      _message = error.toString();
    }
    if (mounted) setState(() {});
    await _save();
  }

  Future<void> _removeFavorite(_Result result) async {
    final image = result.image;
    if (image == null) return;
    await context.read<AppState>().deleteHistory(image.id);
    _favorites.remove(result);
    _results.removeWhere((item) => item.recipe.id == result.recipe.id);
    if (mounted) setState(() {});
    await _save();
  }

  String _resultModel(_Result result) {
    if (result.generationModel.isNotEmpty) return result.generationModel;
    return result.image?.model ?? 'unknown';
  }

  String _modelLabel(_Result result, AppState app) {
    final value = _resultModel(result);
    NaiOption? option;
    for (final item in naiModels) {
      if (item.value == value) {
        option = item;
        break;
      }
    }
    return option == null
        ? value
        : localizedNaiOptionLabel(
            app.settings.language, option.value, option.label);
  }

  Future<void> _previewResult(
      _Result result, Map<String, String> text, AppState app) async {
    final image = result.image;
    if (image == null) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog.fullscreen(
        child: SafeArea(
          child: Stack(
            children: [
              Positioned.fill(
                child: InteractiveViewer(
                  minScale: .5,
                  maxScale: 5,
                  child: Center(
                    child: Image.file(
                      File(image.filePath),
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) =>
                          const Icon(Icons.broken_image_outlined, size: 48),
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 12,
                right: 12,
                top: 8,
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${_modelLabel(result, app)} · ${result.recipe.variant == 'mutated' ? text['variantMutated'] : text['variantPlain']}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    IconButton.filledTonal(
                      tooltip:
                          MaterialLocalizations.of(context).closeButtonTooltip,
                      onPressed: () => Navigator.of(dialogContext).pop(),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _base.dispose();
    _auxiliary.dispose();
    _customTags.dispose();
    _customTagSearch.dispose();
    _count.dispose();
    _minArtists.dispose();
    _maxArtists.dispose();
    _minArtistWeight.dispose();
    _maxArtistWeight.dispose();
    _minCustomTagWeight.dispose();
    _maxCustomTagWeight.dispose();
    _minRandomCustomTags.dispose();
    _maxRandomCustomTags.dispose();
    _minFranchiseStyles.dispose();
    _maxFranchiseStyles.dispose();
    _minFranchiseWeight.dispose();
    _maxFranchiseWeight.dispose();
    _poolSize.dispose();
    _seed.dispose();
    _width.dispose();
    _height.dispose();
    _negative.dispose();
    _weightTuneInput.dispose();
    _weightTuneCount.dispose();
    _weightVariation.dispose();
    _customTagSearchTimer?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  Widget _mutationTerms(ArtistRecipe recipe, Map<String, String> text) {
    if (recipe.mutations.isEmpty) return const SizedBox.shrink();
    const categoryKeys = <String>[
      'artStyle',
      'medium',
      'color',
      'lighting',
    ];
    final categoryValues = text['categories']!.split('|');
    final categoryLabels = <String, String>{
      for (var index = 0; index < categoryKeys.length; index++)
        categoryKeys[index]: categoryValues[index],
    };
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 6, 8, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(text['mutation']!, style: const TextStyle(fontSize: 11)),
          const SizedBox(height: 4),
          Wrap(
            spacing: 4,
            runSpacing: 4,
            children: recipe.mutations
                .map((item) => Chip(
                      visualDensity: VisualDensity.compact,
                      label: Text(
                        '${categoryLabels[item.category] ?? item.category} · ${item.weight.toStringAsFixed(1)}::${item.value}',
                        style: const TextStyle(fontSize: 10),
                      ),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }

  Widget _franchiseTerms(ArtistRecipe recipe, Map<String, String> text) {
    if (recipe.franchiseStyles.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 6, 8, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(text['franchise']!, style: const TextStyle(fontSize: 11)),
          const SizedBox(height: 4),
          Wrap(
            spacing: 4,
            runSpacing: 4,
            children: recipe.franchiseStyles
                .map((item) => Chip(
                      visualDensity: VisualDensity.compact,
                      label: Text(
                        '${item.weight.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '')}::${item.value}',
                        style: const TextStyle(fontSize: 10),
                      ),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }

  Widget _resultGrid(
    List<_Result> items,
    Map<String, String> text,
    AppState app, {
    bool favorites = false,
  }) =>
      LayoutBuilder(builder: (context, constraints) {
        final columns = constraints.maxWidth >= 1000
            ? 4
            : constraints.maxWidth >= 700
                ? 3
                : constraints.maxWidth >= 460
                    ? 2
                    : 1;
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: items.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: .58,
          ),
          itemBuilder: (context, index) {
            final result = items[index];
            final tuneText = _tuneText(app.settings.language);
            final artistsAction = 'artists:${result.recipe.id}';
            final fullAction = 'full:${result.recipe.id}';
            return Card(
              key: ValueKey(result.recipe.id),
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: [
                  Container(
                    width: double.infinity,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    color: result.recipe.variant == 'mutated'
                        ? Theme.of(context)
                            .colorScheme
                            .primaryContainer
                            .withAlpha(166)
                        : Theme.of(context)
                            .colorScheme
                            .surfaceContainerHighest
                            .withAlpha(184),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '#${result.sequence.toString().padLeft(2, '0')} · '
                          '${result.recipe.variant == 'mutated' ? text['variantMutated']! : text['variantPlain']!}',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${text['modelGroup']} · ${_modelLabel(result, app)}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: result.image == null
                        ? Center(
                            child: Text(text[result.status] ?? result.status))
                        : GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onDoubleTap: () =>
                                _previewResult(result, text, app),
                            child: Tooltip(
                              message: text['previewImage']!,
                              child: Image.file(
                                File(result.image!.filePath),
                                width: double.infinity,
                                fit: BoxFit.contain,
                                cacheWidth: 720,
                                filterQuality: FilterQuality.medium,
                                errorBuilder: (_, __, ___) =>
                                    const Icon(Icons.broken_image_outlined),
                              ),
                            ),
                          ),
                  ),
                  _franchiseTerms(result.recipe, text),
                  _mutationTerms(result.recipe, text),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 8, 8, 2),
                    child: Text(result.recipe.prompt,
                        maxLines: 3, overflow: TextOverflow.ellipsis),
                  ),
                  if (result.error != null)
                    Padding(
                      padding: const EdgeInsets.all(6),
                      child: Text(result.error!,
                          maxLines: 2,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                              fontSize: 11)),
                    ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(6, 6, 6, 0),
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        OutlinedButton.icon(
                          onPressed: () => _copyResult(
                            artistsAction,
                            artistRecipeCardTagsWithTrailingComma(
                                result.recipe),
                            tuneText['copiedArtists']!,
                          ),
                          icon: const Icon(Icons.people_alt_outlined, size: 16),
                          label: Text(_copiedAction == artistsAction
                              ? tuneText['copied']!
                              : text['copyArtists']!),
                        ),
                        OutlinedButton.icon(
                          onPressed: () => _copyResult(
                            fullAction,
                            fullArtistRecipePrompt(result.recipe, _base.text),
                            tuneText['copiedFull']!,
                          ),
                          icon:
                              const Icon(Icons.content_copy_outlined, size: 16),
                          label: Text(_copiedAction == fullAction
                              ? tuneText['copied']!
                              : text['copyFull']!),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(6),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        if (favorites)
                          IconButton(
                            tooltip: text['remove'],
                            onPressed: () => _removeFavorite(result),
                            icon: const Icon(Icons.delete_outline),
                          )
                        else if (result.status == 'failed')
                          IconButton(
                            tooltip: text['retry'],
                            onPressed: _running ? null : () => _retry(result),
                            icon: const Icon(Icons.refresh),
                          )
                        else
                          IconButton(
                            tooltip: result.liked
                                ? text['saved']
                                : result.saving
                                    ? text['saving']
                                    : text['like'],
                            onPressed: result.status == 'done' &&
                                    !result.liked &&
                                    !result.saving
                                ? () => _saveFavorite(result)
                                : null,
                            icon: Icon(result.liked
                                ? Icons.favorite
                                : Icons.favorite_border),
                          ),
                        IconButton(
                          tooltip: text['apply'],
                          onPressed: result.status == 'done'
                              ? () => app.setParam((params) {
                                    final selected = _generationParams.copy()
                                      ..model = _resultModel(result)
                                      ..positivePrompt = _base.text.trim()
                                      ..stylePrompt = result.recipe.prompt
                                      ..seed = result.seed ?? _seedValue()
                                      ..seedMode = 'fixed';
                                    final value = selected.toJson();
                                    final applied =
                                        GenerateParams.fromJson(value);
                                    params
                                      ..model = applied.model
                                      ..stylePrompt = applied.stylePrompt
                                      ..positivePrompt = applied.positivePrompt
                                      ..negativePrompt = applied.negativePrompt
                                      ..width = applied.width
                                      ..height = applied.height
                                      ..steps = applied.steps
                                      ..cfgScale = applied.cfgScale
                                      ..cfgRescale = applied.cfgRescale
                                      ..sampler = applied.sampler
                                      ..noiseSchedule = applied.noiseSchedule
                                      ..seed = applied.seed
                                      ..seedMode = applied.seedMode
                                      ..ucPreset = applied.ucPreset
                                      ..qualityPreset = applied.qualityPreset
                                      ..qualityToggle = applied.qualityToggle
                                      ..transparentBackground =
                                          applied.transparentBackground
                                      ..smea = applied.smea
                                      ..smeaDyn = applied.smeaDyn
                                      ..variety = applied.variety
                                      ..fileNamePrefix = applied.fileNamePrefix;
                                  })
                              : null,
                          icon: const Icon(Icons.call_made),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        );
      });

  Map<String, String> _customTagUiText(String language) =>
      switch (normalizeAppLocaleCode(language)) {
        'zh-TW' => {
            'title': '畫風 Tag 庫',
            'hint': '僅收錄畫風、媒材、渲染、光色與品質。動作、背景、特效、情緒不混入畫師串；預設收合。',
            'selected': '已選 {count} 個',
            'available': '本機按需載入',
            'search': '搜尋 Tag、中文意思或作品名',
            'all': '精選畫風',
            'styles': 'Danbooru 畫風模仿',
            'copyright': '動畫／遊戲／漫畫作品',
            'always': '每串必加',
            'random': '隨機加入',
            'randomRange': '每串隨機抽取數量',
            'min': '最少',
            'max': '最多',
            'clear': '全部清除',
            'noResults': '找不到結果；完整資料需先在設定下載 Danbooru 中英標籤庫。',
            'loading': '正在讀取本機 Tag 庫…',
            'loadMore': '載入更多',
          },
        'en-US' => {
            'title': 'Visual-style Tag library',
            'hint':
                'Only visual style, medium, rendering, lighting/color, and quality are included—never action, background, effects, or emotion. Collapsed by default.',
            'selected': '{count} selected',
            'available': 'Loaded locally on demand',
            'search': 'Search Tags, meanings, anime, or games',
            'all': 'Curated styles',
            'styles': 'Danbooru style parodies',
            'copyright': 'Anime / game / manga sources',
            'always': 'Always',
            'random': 'Random',
            'randomRange': 'Random Tags per string',
            'min': 'Minimum',
            'max': 'Maximum',
            'clear': 'Clear all',
            'noResults':
                'No matches. Download the Danbooru bilingual Tag data in Settings for the full catalog.',
            'loading': 'Reading the local Tag catalog…',
            'loadMore': 'Load more',
          },
        'ja-JP' => {
            'title': '画風 Tag ライブラリ',
            'hint': '画風・画材・レンダリング・光色・品質のみ収録し、動作・背景・効果・感情は混在させません。初期状態は折りたたみです。',
            'selected': '{count} 個選択',
            'available': 'ローカルから必要時に読込',
            'search': 'Tag・意味・作品名を検索',
            'all': '厳選画風',
            'styles': 'Danbooru 画風模倣',
            'copyright': 'アニメ／ゲーム／漫画作品',
            'always': '毎回追加',
            'random': 'ランダム',
            'randomRange': '1列ごとのランダム数',
            'min': '最小',
            'max': '最大',
            'clear': 'すべて解除',
            'noResults': '一致なし。完全な一覧には設定で Danbooru 日中 Tag データをダウンロードしてください。',
            'loading': 'ローカル Tag を読込中…',
            'loadMore': 'さらに読込',
          },
        'ko-KR' => {
            'title': '화풍 Tag 라이브러리',
            'hint':
                '화풍·매체·렌더링·빛/색·품질만 포함하며 동작·배경·효과·감정은 작가 문자열에 섞지 않습니다. 기본은 접힘입니다.',
            'selected': '{count}개 선택',
            'available': '로컬에서 필요할 때 로드',
            'search': 'Tag, 뜻, 작품명 검색',
            'all': '엄선 화풍',
            'styles': 'Danbooru 화풍 모방',
            'copyright': '애니／게임／만화 작품',
            'always': '매번 추가',
            'random': '무작위',
            'randomRange': '문자열당 무작위 수',
            'min': '최소',
            'max': '최대',
            'clear': '모두 지우기',
            'noResults':
                '검색 결과가 없습니다. 전체 목록은 설정에서 Danbooru 중영 Tag 데이터를 내려받으세요.',
            'loading': '로컬 Tag 목록 읽는 중…',
            'loadMore': '더 불러오기',
          },
        _ => {
            'title': '画风 Tag 库',
            'hint': '仅收录画风、媒介、渲染、光色与质量；动作、背景、特效、情绪不混入画师串。面板默认折叠。',
            'selected': '已选 {count} 个',
            'available': '本地按需载入',
            'search': '搜索 Tag、中文含义或作品名',
            'all': '精选画风',
            'styles': 'Danbooru 画风模仿',
            'copyright': '动漫／游戏／漫画作品',
            'always': '每串必加',
            'random': '随机加入',
            'randomRange': '每串随机抽取数量',
            'min': '最少',
            'max': '最多',
            'clear': '清空全部',
            'noResults': '没有匹配项；完整库需要先在设置中下载 Danbooru 中英标签数据。',
            'loading': '正在读取本地 Tag 库…',
            'loadMore': '载入更多',
          },
      };

  bool get _isDynamicCustomTagCategory =>
      _customTagCategory == 'danbooru-style' ||
      _customTagCategory == 'copyright';

  Future<void> _loadCustomTagCatalog({bool reset = false}) async {
    if (!_isDynamicCustomTagCategory) return;
    if (reset) _customTagCatalogLimit = 120;
    final scope = _customTagCategory == 'copyright' ? 'copyright' : 'style';
    final requestCategory = _customTagCategory;
    final requestQuery = _customTagSearch.text;
    setState(() => _customTagCatalogLoading = true);
    try {
      final result =
          await context.read<AppState>().offlineTags.browseArtistStyleCatalog(
                scope: scope,
                query: requestQuery,
                limit: _customTagCatalogLimit,
              );
      if (!mounted ||
          requestCategory != _customTagCategory ||
          requestQuery != _customTagSearch.text) return;
      setState(() {
        _customTagCatalogItems = result.items;
        _customTagCatalogTotal = result.total;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _customTagCatalogItems = const [];
          _customTagCatalogTotal = 0;
        });
      }
    } finally {
      if (mounted && requestCategory == _customTagCategory) {
        setState(() => _customTagCatalogLoading = false);
      }
    }
  }

  void _scheduleCustomTagCatalogSearch() {
    _customTagSearchTimer?.cancel();
    if (!_isDynamicCustomTagCategory) return;
    _customTagSearchTimer = Timer(
      const Duration(milliseconds: 220),
      () => _loadCustomTagCatalog(reset: true),
    );
  }

  void _replaceCustomTagValues(List<String> values) {
    final value = values.join(', ');
    _customTags.value = TextEditingValue(
      text: value,
      selection: TextSelection.collapsed(offset: value.length),
    );
    _drawSeed = Random.secure().nextInt(0x7fffffff);
    _planned = _buildPlan();
  }

  void _toggleCustomTag(String tag) {
    final key = tag.trim().toLowerCase();
    setState(() {
      final values = parseCustomTagPoolValues(_customTags.text);
      final exists = values.any((value) => value.toLowerCase() == key);
      if (exists) {
        values.removeWhere((value) => value.toLowerCase() == key);
        _customTagModes.remove(key);
      } else {
        values.add(tag.trim());
        _customTagModes[key] = _customTagModes[key] ?? 'always';
      }
      _replaceCustomTagValues(values);
    });
    _save();
  }

  void _setCustomTagMode(String tag, String mode) {
    setState(() {
      _customTagModes[tag.trim().toLowerCase()] =
          mode == 'random' ? 'random' : 'always';
      _drawSeed = Random.secure().nextInt(0x7fffffff);
      _planned = _buildPlan();
    });
    _save();
  }

  String _offlineCatalogMeaning(OfflineTagHit hit, String language) {
    if (normalizeAppLocaleCode(language).startsWith('zh') &&
        hit.chinese.isNotEmpty) {
      return hit.chinese.join('／');
    }
    final value = hit.tag
        .replaceFirst(RegExp(r'_\(style\)$', caseSensitive: false), '')
        .replaceAll('_', ' ');
    return value.isEmpty
        ? hit.tag
        : '${value[0].toUpperCase()}${value.substring(1)}';
  }

  Widget _customTagLibraryCard(Map<String, String> _, String language) {
    final ui = _customTagUiText(language);
    final colors = Theme.of(context).colorScheme;
    final selectedValues = parseCustomTagPoolValues(_customTags.text);
    final selected = selectedValues.map((tag) => tag.toLowerCase()).toSet();
    final selectedRandomCount = selectedValues
        .where((tag) => _customTagModes[tag.toLowerCase()] == 'random')
        .length;
    final query = _customTagSearch.text;
    final staticCategories = _customTagCategory == 'all'
        ? randomCustomTagLibrary
        : randomCustomTagLibrary
            .where((category) => category.id == _customTagCategory)
            .toList();
    final staticEntries = <({RandomCustomTagEntry entry, String category})>[];
    if (!_isDynamicCustomTagCategory) {
      for (final category in staticCategories) {
        for (final entry in category.tags) {
          if (matchesRandomCustomTagSearch(category, entry, language, query)) {
            staticEntries.add((
              entry: entry,
              category: category.label(language),
            ));
          }
        }
      }
    }

    Widget modeControl(String tag) {
      final mode = _customTagModes[tag.toLowerCase()] ?? 'always';
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ChoiceChip(
            visualDensity: VisualDensity.compact,
            label: Text(ui['always']!, style: const TextStyle(fontSize: 11)),
            selected: mode == 'always',
            onSelected: (_) => _setCustomTagMode(tag, 'always'),
          ),
          const SizedBox(width: 4),
          ChoiceChip(
            visualDensity: VisualDensity.compact,
            label: Text(ui['random']!, style: const TextStyle(fontSize: 11)),
            selected: mode == 'random',
            onSelected: (_) => _setCustomTagMode(tag, 'random'),
          ),
        ],
      );
    }

    Widget tagTile(String tag, String meaning, [int? count]) {
      final isSelected = selected.contains(tag.toLowerCase());
      return Material(
        color: isSelected
            ? colors.primaryContainer.withAlpha(140)
            : colors.surfaceContainerLowest,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: isSelected ? colors.primary : colors.outlineVariant,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => _toggleCustomTag(tag),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(
                      isSelected
                          ? Icons.check_circle_rounded
                          : Icons.add_circle_outline_rounded,
                      size: 21,
                      color: isSelected ? colors.primary : colors.outline,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(tag,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style:
                                  const TextStyle(fontWeight: FontWeight.w700)),
                          Text(meaning,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.bodySmall),
                        ],
                      ),
                    ),
                    if (count != null)
                      Text('$count',
                          style: Theme.of(context).textTheme.labelSmall),
                  ],
                ),
                if (isSelected) ...[
                  const SizedBox(height: 6),
                  Align(
                      alignment: Alignment.centerRight,
                      child: modeControl(tag)),
                ],
              ],
            ),
          ),
        ),
      );
    }

    Widget categoryButton(String id, String label, String count) => Padding(
          padding: const EdgeInsets.only(right: 7),
          child: FilterChip(
            selected: _customTagCategory == id,
            label: Text('$label  $count'),
            onSelected: (_) {
              setState(() {
                _customTagCategory = id;
                _customTagCatalogLimit = 120;
              });
              if (_isDynamicCustomTagCategory) {
                _loadCustomTagCatalog(reset: true);
              }
            },
          ),
        );

    final visibleCount = _isDynamicCustomTagCategory
        ? _customTagCatalogItems.length
        : staticEntries.length;
    final totalCount = _isDynamicCustomTagCategory
        ? _customTagCatalogTotal
        : randomCustomTagCount;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        key: const PageStorageKey<String>('random-artist-style-tag-library'),
        initiallyExpanded: false,
        onExpansionChanged: (expanded) {
          if (expanded && _isDynamicCustomTagCategory) {
            _loadCustomTagCatalog(reset: true);
          }
        },
        leading: const Icon(Icons.style_outlined),
        title: Text(ui['title']!,
            style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text(
          '${ui['selected']!.replaceAll('{count}', '${selectedValues.length}')} · ${ui['available']}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(ui['hint']!, style: Theme.of(context).textTheme.bodySmall),
                if (selectedValues.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          ui['selected']!.replaceAll(
                              '{count}', '${selectedValues.length}'),
                          style: Theme.of(context).textTheme.labelLarge,
                        ),
                      ),
                      TextButton(
                        onPressed: () {
                          setState(() {
                            _customTagModes.clear();
                            _replaceCustomTagValues(const []);
                          });
                          _save();
                        },
                        child: Text(ui['clear']!),
                      ),
                    ],
                  ),
                  Wrap(
                    spacing: 7,
                    runSpacing: 7,
                    children: selectedValues
                        .map((tag) => InputChip(
                              label: Text(tag),
                              avatar: Icon(
                                _customTagModes[tag.toLowerCase()] == 'random'
                                    ? Icons.casino_outlined
                                    : Icons.push_pin_outlined,
                                size: 17,
                              ),
                              onPressed: () => _setCustomTagMode(
                                tag,
                                _customTagModes[tag.toLowerCase()] == 'random'
                                    ? 'always'
                                    : 'random',
                              ),
                              onDeleted: () => _toggleCustomTag(tag),
                            ))
                        .toList(),
                  ),
                ],
                if (selectedRandomCount > 0) ...[
                  const SizedBox(height: 10),
                  Text(ui['randomRange']!,
                      style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _minRandomCustomTags,
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(labelText: ui['min']),
                          onEditingComplete: _commitCustomTags,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: _maxRandomCustomTags,
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(labelText: ui['max']),
                          onEditingComplete: _commitCustomTags,
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 10),
                TextField(
                  controller: _customTagSearch,
                  decoration: InputDecoration(
                    hintText: ui['search'],
                    prefixIcon: const Icon(Icons.search_rounded),
                    suffixIcon: query.isEmpty
                        ? null
                        : IconButton(
                            onPressed: () {
                              setState(() => _customTagSearch.clear());
                              _scheduleCustomTagCatalogSearch();
                            },
                            icon: const Icon(Icons.close_rounded),
                          ),
                  ),
                  onChanged: (_) {
                    setState(() {});
                    _scheduleCustomTagCatalogSearch();
                  },
                ),
                const SizedBox(height: 9),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      categoryButton(
                          'all', ui['all']!, '$randomCustomTagCount'),
                      ...randomCustomTagLibrary
                          .map((category) => categoryButton(
                                category.id,
                                category.label(language),
                                '${category.tags.length}',
                              )),
                      categoryButton('danbooru-style', ui['styles']!, 'ALL'),
                      categoryButton('copyright', ui['copyright']!, 'ALL'),
                    ],
                  ),
                ),
                const SizedBox(height: 7),
                Text('$visibleCount / $totalCount',
                    textAlign: TextAlign.end,
                    style: Theme.of(context).textTheme.labelSmall),
                const SizedBox(height: 7),
                if (_customTagCatalogLoading && _isDynamicCustomTagCategory)
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      children: [
                        const CircularProgressIndicator(),
                        const SizedBox(height: 10),
                        Text(ui['loading']!),
                      ],
                    ),
                  )
                else if ((_isDynamicCustomTagCategory
                    ? _customTagCatalogItems.isEmpty
                    : staticEntries.isEmpty))
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(ui['noResults']!, textAlign: TextAlign.center),
                  )
                else
                  LayoutBuilder(builder: (context, constraints) {
                    final columns = constraints.maxWidth >= 760
                        ? 3
                        : constraints.maxWidth >= 430
                            ? 2
                            : 1;
                    final length = _isDynamicCustomTagCategory
                        ? _customTagCatalogItems.length
                        : staticEntries.length;
                    final rows = (length / columns).ceil();
                    return SizedBox(
                      height: min(520.0, max(112.0, rows * 120.0)),
                      child: GridView.builder(
                        primary: false,
                        itemCount: length,
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: columns,
                          crossAxisSpacing: 8,
                          mainAxisSpacing: 8,
                          mainAxisExtent: 112,
                        ),
                        itemBuilder: (context, index) {
                          if (_isDynamicCustomTagCategory) {
                            final hit = _customTagCatalogItems[index];
                            return tagTile(
                              hit.tag,
                              _offlineCatalogMeaning(hit, language),
                              hit.postCount,
                            );
                          }
                          final item = staticEntries[index];
                          return tagTile(
                            item.entry.tag,
                            '${item.entry.label(language)} · ${item.category}',
                          );
                        },
                      ),
                    );
                  }),
                if (_isDynamicCustomTagCategory &&
                    _customTagCatalogItems.length < _customTagCatalogTotal &&
                    !_customTagCatalogLoading)
                  Align(
                    alignment: Alignment.center,
                    child: OutlinedButton.icon(
                      onPressed: () {
                        _customTagCatalogLimit = min(
                          _customTagCatalogTotal,
                          _customTagCatalogLimit + 120,
                        );
                        _loadCustomTagCatalog();
                      },
                      icon: const Icon(Icons.expand_more_rounded),
                      label: Text(ui['loadMore']!),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _weightTunerCard(Map<String, String> tuneText) => Card(
        clipBehavior: Clip.antiAlias,
        child: ExpansionTile(
          key: const PageStorageKey<String>('random-artist-weight-tuner'),
          initiallyExpanded: false,
          title: Text(tuneText['title']!),
          subtitle: Text(
            tuneText['hint']!,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: LayoutBuilder(builder: (context, constraints) {
                final fieldWidth = constraints.maxWidth >= 700
                    ? (constraints.maxWidth - 12) / 2
                    : constraints.maxWidth;
                return Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  crossAxisAlignment: WrapCrossAlignment.end,
                  children: [
                    SizedBox(
                      width: constraints.maxWidth,
                      child: TextField(
                        controller: _weightTuneInput,
                        minLines: 2,
                        maxLines: 4,
                        decoration: InputDecoration(
                          labelText: tuneText['input'],
                          hintText: '1::artist:foo ::, 0.8::artist:bar ::,',
                          filled: false,
                        ),
                        onChanged: (_) => _save(),
                      ),
                    ),
                    SizedBox(
                      width: fieldWidth,
                      child: TextField(
                        controller: _weightTuneCount,
                        keyboardType: TextInputType.number,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly
                        ],
                        decoration:
                            InputDecoration(labelText: tuneText['count']),
                        onChanged: (_) => _save(),
                      ),
                    ),
                    SizedBox(
                      width: fieldWidth,
                      child: TextField(
                        controller: _weightVariation,
                        keyboardType: TextInputType.number,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly
                        ],
                        decoration:
                            InputDecoration(labelText: tuneText['variation']),
                        onChanged: (_) => _save(),
                      ),
                    ),
                    FilledButton.icon(
                      onPressed: _running ? null : _generateWeightTuning,
                      icon: const Icon(Icons.tune),
                      label: Text(tuneText['generate']!),
                    ),
                  ],
                );
              }),
            ),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final text = _text(app.settings.language);
    final parameterText = _parameterText(app.settings.language);
    final tuneText = _tuneText(app.settings.language);
    final favoriteFolderLabel = switch (app.settings.language) {
      'zh-TW' => '收藏夾',
      'en-US' => 'Favorites',
      'ja-JP' => 'お気に入り',
      'ko-KR' => '즐겨찾기',
      _ => '收藏夹',
    };
    final completed = _results
        .where((item) => item.status == 'done' || item.status == 'failed')
        .length;
    final plannedImages = _planned.length * (_mutateAuxiliary ? 2 : 1);
    final pairSummary = text['pairSummary']!
        .replaceAll('{pairs}', '${_planned.length}')
        .replaceAll('{images}', '$plannedImages');
    final favoriteModels = _favorites.map(_resultModel).toSet().toList()
      ..sort();
    final selectedFavoriteModel = _favoriteModelFilter == 'all' ||
            favoriteModels.contains(_favoriteModelFilter)
        ? _favoriteModelFilter
        : 'all';
    final favoriteGroups = <String, List<_Result>>{};
    for (final result in _favorites) {
      final model = _resultModel(result);
      if (selectedFavoriteModel != 'all' && model != selectedFavoriteModel) {
        continue;
      }
      favoriteGroups.putIfAbsent(model, () => []).add(result);
    }
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: widget.onBack,
        ),
        title: Text(text['title']!),
      ),
      body: ListView(
        controller: _scrollController,
        key: const PageStorageKey<String>('random-artist-lab-scroll'),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 32),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Wrap(
                spacing: 12,
                runSpacing: 10,
                crossAxisAlignment: WrapCrossAlignment.end,
                children: [
                  SizedBox(
                    width: 320,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(text['pool']!,
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 4),
                        Text(
                            _loading
                                ? text['empty']!
                                : text['total']!
                                    .replaceAll('{count}', '${_pool.length}'),
                            style: Theme.of(context).textTheme.bodySmall),
                        const SizedBox(height: 4),
                        Text(text['hint']!,
                            style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                  ),
                  SizedBox(
                    width: 220,
                    child: TextField(
                      controller: _poolSize,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: InputDecoration(labelText: text['poolSize']),
                    ),
                  ),
                  OutlinedButton(
                      onPressed: _loading ? null : () => _loadPool(false),
                      child: Text(text['load']!)),
                  OutlinedButton.icon(
                      onPressed: _loading ? null : () => _loadPool(true),
                      icon: const Icon(Icons.refresh),
                      label: Text(text['refresh']!)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Card(
            clipBehavior: Clip.antiAlias,
            child: ExpansionTile(
              key: const PageStorageKey<String>(
                  'random-artist-generation-settings'),
              initiallyExpanded: false,
              maintainState: true,
              title: Text(parameterText['title']!),
              subtitle: Text(parameterText['hint']!),
              trailing: PopupMenuButton<String>(
                tooltip: parameterText['title'],
                icon: const Icon(Icons.tune),
                onSelected: (value) {
                  setState(() {
                    _generationParams = value == 'sync'
                        ? (app.params.copy()
                          ..positivePrompt = ''
                          ..stylePrompt = '')
                        : GenerateParams();
                    _syncParameterControllers();
                  });
                  _save();
                },
                itemBuilder: (_) => [
                  PopupMenuItem(
                    value: 'sync',
                    child: ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.sync),
                      title: Text(parameterText['sync']!),
                    ),
                  ),
                  PopupMenuItem(
                    value: 'reset',
                    child: ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.restart_alt),
                      title: Text(parameterText['reset']!),
                    ),
                  ),
                ],
              ),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                  child: LayoutBuilder(builder: (context, constraints) {
                    final twoColumns = constraints.maxWidth >= 620;
                    final fieldWidth = twoColumns
                        ? (constraints.maxWidth - 12) / 2
                        : constraints.maxWidth;
                    return Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: [
                        SizedBox(
                          width: constraints.maxWidth,
                          child: DropdownButtonFormField<String>(
                            value: _generationParams.model,
                            isExpanded: true,
                            decoration: InputDecoration(
                                labelText: parameterText['model']),
                            items: naiModels
                                .map((option) => DropdownMenuItem(
                                      value: option.value,
                                      child: Text(localizedNaiOptionLabel(
                                          app.settings.language,
                                          option.value,
                                          option.label)),
                                    ))
                                .toList(),
                            onChanged: (value) {
                              if (value == null) return;
                              setState(() {
                                _generationParams.model = value;
                                if (!_generationParams.isV5) {
                                  if (_generationParams.qualityPreset ==
                                      'light') {
                                    _generationParams.qualityPreset =
                                        'standard';
                                  }
                                  _generationParams.transparentBackground =
                                      false;
                                }
                                _generationParams.qualityToggle =
                                    _generationParams.qualityPreset != 'none';
                              });
                              _save();
                            },
                          ),
                        ),
                        SizedBox(
                          width: constraints.maxWidth,
                          child: Wrap(
                            spacing: 7,
                            runSpacing: 7,
                            children: sizePresets
                                .map((preset) => ChoiceChip(
                                      label: Text(localizedSizePresetLabel(
                                          app.settings.language,
                                          preset.width,
                                          preset.height,
                                          preset.label)),
                                      selected: _generationParams.width ==
                                              preset.width &&
                                          _generationParams.height ==
                                              preset.height,
                                      onSelected: (_) {
                                        setState(() {
                                          _generationParams
                                            ..width = preset.width
                                            ..height = preset.height;
                                          _syncParameterControllers();
                                        });
                                        _save();
                                      },
                                    ))
                                .toList(),
                          ),
                        ),
                        SizedBox(
                          width: fieldWidth,
                          child: TextField(
                            controller: _width,
                            keyboardType: TextInputType.number,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly
                            ],
                            decoration: InputDecoration(
                                labelText: parameterText['width']),
                            onEditingComplete: () =>
                                _commitDimension(_width, true),
                            onTapOutside: (_) => _commitDimension(_width, true),
                          ),
                        ),
                        SizedBox(
                          width: fieldWidth,
                          child: TextField(
                            controller: _height,
                            keyboardType: TextInputType.number,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly
                            ],
                            decoration: InputDecoration(
                                labelText: parameterText['height']),
                            onEditingComplete: () =>
                                _commitDimension(_height, false),
                            onTapOutside: (_) =>
                                _commitDimension(_height, false),
                          ),
                        ),
                        SizedBox(
                          width: fieldWidth,
                          child: DropdownButtonFormField<String>(
                            value: _generationParams.sampler,
                            isExpanded: true,
                            decoration: InputDecoration(
                                labelText: parameterText['sampler']),
                            items: naiSamplers
                                .map((option) => DropdownMenuItem(
                                      value: option.value,
                                      child: Text(localizedNaiOptionLabel(
                                          app.settings.language,
                                          option.value,
                                          option.label)),
                                    ))
                                .toList(),
                            onChanged: (value) {
                              if (value == null) return;
                              setState(() => _generationParams.sampler = value);
                              _save();
                            },
                          ),
                        ),
                        if (_generationParams.supportsNoiseScheduleControl)
                          SizedBox(
                            width: fieldWidth,
                            child: DropdownButtonFormField<String>(
                              value: _generationParams.noiseSchedule,
                              isExpanded: true,
                              decoration: InputDecoration(
                                  labelText: parameterText['noise']),
                              items: naiNoiseSchedules
                                  .map((option) => DropdownMenuItem(
                                        value: option.value,
                                        child: Text(localizedNaiOptionLabel(
                                            app.settings.language,
                                            option.value,
                                            option.label)),
                                      ))
                                  .toList(),
                              onChanged: (value) {
                                if (value == null) return;
                                setState(() =>
                                    _generationParams.noiseSchedule = value);
                                _save();
                              },
                            ),
                          ),
                        SizedBox(
                          width: fieldWidth,
                          child: DropdownButtonFormField<int>(
                            value: _generationParams.ucPreset,
                            isExpanded: true,
                            decoration:
                                InputDecoration(labelText: parameterText['uc']),
                            items: ucPresets
                                .map((option) => DropdownMenuItem(
                                      value: int.parse(option.value),
                                      child: Text(localizedNaiOptionLabel(
                                          app.settings.language,
                                          option.value,
                                          option.label)),
                                    ))
                                .toList(),
                            onChanged: (value) {
                              if (value == null) return;
                              setState(
                                  () => _generationParams.ucPreset = value);
                              _save();
                            },
                          ),
                        ),
                        SizedBox(
                          width: fieldWidth,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                  '${parameterText['steps']} · ${_generationParams.steps}'),
                              Slider(
                                value: _generationParams.steps
                                    .clamp(1, 50)
                                    .toDouble(),
                                min: 1,
                                max: 50,
                                divisions: 49,
                                onChanged: (value) => setState(() =>
                                    _generationParams.steps = value.round()),
                                onChangeEnd: (_) => _save(),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(
                          width: fieldWidth,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                  'CFG Scale · ${_generationParams.cfgScale.toStringAsFixed(1)}'),
                              Slider(
                                value: _generationParams.cfgScale.clamp(1, 10),
                                min: 1,
                                max: 10,
                                divisions: 45,
                                onChanged: (value) => setState(
                                    () => _generationParams.cfgScale = value),
                                onChangeEnd: (_) => _save(),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(
                          width: fieldWidth,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                  'CFG Rescale · ${_generationParams.cfgRescale.toStringAsFixed(2)}'),
                              Slider(
                                value: _generationParams.cfgRescale.clamp(0, 1),
                                min: 0,
                                max: 1,
                                divisions: 100,
                                onChanged: (value) => setState(
                                    () => _generationParams.cfgRescale = value),
                                onChangeEnd: (_) => _save(),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(
                          width: constraints.maxWidth,
                          child: QualityPresetControl(
                            language: app.settings.language,
                            model: _generationParams.model,
                            value: _generationParams.qualityPreset,
                            transparentBackground:
                                _generationParams.transparentBackground,
                            onChanged: (value) {
                              setState(() => _generationParams
                                ..qualityPreset = value
                                ..qualityToggle = value != 'none');
                              _save();
                            },
                            onTransparentChanged: (value) {
                              setState(() => _generationParams
                                  .transparentBackground = value);
                              _save();
                            },
                          ),
                        ),
                        SizedBox(
                          width: constraints.maxWidth,
                          child: TextField(
                            controller: _negative,
                            minLines: 2,
                            maxLines: 5,
                            decoration: InputDecoration(
                                labelText: parameterText['negative']),
                            onChanged: (value) {
                              _generationParams.negativePrompt = value;
                              _save();
                            },
                          ),
                        ),
                        SizedBox(
                          width: constraints.maxWidth,
                          child: Wrap(
                            spacing: 8,
                            runSpacing: 6,
                            children: [
                              if (_generationParams.supportsVariety)
                                FilterChip(
                                  label: const Text('Variety+'),
                                  selected: _generationParams.variety,
                                  onSelected: (value) {
                                    setState(() =>
                                        _generationParams.variety = value);
                                    _save();
                                  },
                                ),
                              if (!_generationParams.isV4Plus)
                                FilterChip(
                                  label: const Text('SMEA'),
                                  selected: _generationParams.smea,
                                  onSelected: (value) {
                                    setState(() {
                                      _generationParams.smea = value;
                                      if (!value) {
                                        _generationParams.smeaDyn = false;
                                      }
                                    });
                                    _save();
                                  },
                                ),
                              if (!_generationParams.isV4Plus)
                                FilterChip(
                                  label: const Text('SMEA Dyn'),
                                  selected: _generationParams.smeaDyn,
                                  onSelected: _generationParams.smea
                                      ? (value) {
                                          setState(() => _generationParams
                                              .smeaDyn = value);
                                          _save();
                                        }
                                      : null,
                                ),
                            ],
                          ),
                        ),
                      ],
                    );
                  }),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: LayoutBuilder(builder: (context, constraints) {
                final fieldWidth = constraints.maxWidth >= 700
                    ? (constraints.maxWidth - 12) / 2
                    : constraints.maxWidth;
                Widget numberField(
                        TextEditingController controller, String label,
                        {required VoidCallback commit}) =>
                    SizedBox(
                      width: fieldWidth,
                      child: TextField(
                        controller: controller,
                        keyboardType: TextInputType.number,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly
                        ],
                        decoration: InputDecoration(labelText: label),
                        onEditingComplete: commit,
                        onTapOutside: (_) => commit(),
                      ),
                    );
                Widget decimalField(
                        TextEditingController controller, String label,
                        {required VoidCallback commit}) =>
                    SizedBox(
                      width: fieldWidth,
                      child: TextField(
                        controller: controller,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        decoration: InputDecoration(labelText: label),
                        onEditingComplete: commit,
                        onTapOutside: (_) => commit(),
                      ),
                    );
                return Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    SizedBox(
                      width: constraints.maxWidth,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: Theme.of(context)
                              .colorScheme
                              .primaryContainer
                              .withAlpha(92),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(12, 7, 7, 7),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  _resetDrawHint(app.settings.language),
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ),
                              const SizedBox(width: 8),
                              TextButton.icon(
                                onPressed: () =>
                                    _restoreDrawDefaults(app.settings.language),
                                icon: const Icon(Icons.restart_alt, size: 18),
                                label: Text(
                                    _resetDrawLabel(app.settings.language)),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    SizedBox(
                      width: constraints.maxWidth,
                      child: TextField(
                        controller: _base,
                        minLines: 2,
                        maxLines: 5,
                        decoration: InputDecoration(labelText: text['base']),
                      ),
                    ),
                    SizedBox(
                      width: constraints.maxWidth,
                      child: Align(
                        alignment: Alignment.centerRight,
                        child: AnimatedBuilder(
                          animation: _base,
                          builder: (context, _) => PositivePromptPresetButton(
                            currentPrompt: _base.text,
                            compact: true,
                            onApply: (value) {
                              _base.text = value;
                              _base.selection = TextSelection.collapsed(
                                offset: _base.text.length,
                              );
                              setState(() {});
                              unawaited(_save());
                            },
                          ),
                        ),
                      ),
                    ),
                    SizedBox(
                      width: constraints.maxWidth,
                      child: TextField(
                        controller: _auxiliary,
                        minLines: 2,
                        maxLines: 4,
                        decoration: InputDecoration(labelText: text['aux']),
                      ),
                    ),
                    SizedBox(
                      width: constraints.maxWidth,
                      child: TextField(
                        controller: _customTags,
                        minLines: 2,
                        maxLines: 4,
                        decoration: InputDecoration(
                          labelText: text['customTags'],
                          hintText:
                              'year 2024, 0.7::blue theme ::, dynamic angle',
                          helperText: text['customTagsHint'],
                          helperMaxLines: 3,
                          filled: false,
                        ),
                        onEditingComplete: _commitCustomTags,
                        onTapOutside: (_) {
                          FocusManager.instance.primaryFocus?.unfocus();
                          _commitCustomTags();
                        },
                        onChanged: (_) {
                          setState(() => _planned = _buildPlan());
                        },
                      ),
                    ),
                    SizedBox(
                      width: constraints.maxWidth,
                      child: _customTagLibraryCard(text, app.settings.language),
                    ),
                    if (_customTags.text.trim().isNotEmpty) ...[
                      decimalField(
                        _minCustomTagWeight,
                        text['customTagWeightMin']!,
                        commit: _commitCustomTags,
                      ),
                      decimalField(
                        _maxCustomTagWeight,
                        text['customTagWeightMax']!,
                        commit: _commitCustomTags,
                      ),
                    ],
                    SizedBox(
                      width: constraints.maxWidth,
                      child: SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(text['mutate']!),
                        subtitle: Text(text['mutateHint']!),
                        value: _mutateAuxiliary,
                        onChanged: (value) {
                          setState(() {
                            _mutateAuxiliary = value;
                            _drawSeed = Random.secure().nextInt(0x7fffffff);
                            _planned = _buildPlan();
                          });
                          _save();
                        },
                      ),
                    ),
                    numberField(_count, text['count']!, commit: () {
                      setState(() => _planned = _buildPlan());
                      _save();
                    }),
                    numberField(_minArtists, text['min']!, commit: () {
                      setState(() => _planned = _buildPlan());
                      _save();
                    }),
                    numberField(_maxArtists, text['max']!, commit: () {
                      setState(() => _planned = _buildPlan());
                      _save();
                    }),
                    decimalField(_minArtistWeight, text['artistWeightMin']!,
                        commit: () {
                      setState(() => _planned = _buildPlan());
                      _save();
                    }),
                    decimalField(_maxArtistWeight, text['artistWeightMax']!,
                        commit: () {
                      setState(() => _planned = _buildPlan());
                      _save();
                    }),
                    SizedBox(
                      width: constraints.maxWidth,
                      child: Text(text['seedMode']!,
                          style: Theme.of(context).textTheme.labelLarge),
                    ),
                    SizedBox(
                      width: constraints.maxWidth,
                      child: SegmentedButton<String>(
                        segments: [
                          ButtonSegment(
                            value: 'random',
                            icon: const Icon(Icons.casino_outlined),
                            label: Text(text['seedRandom']!),
                          ),
                          ButtonSegment(
                            value: 'fixed',
                            icon: const Icon(Icons.push_pin_outlined),
                            label: Text(text['seedFixed']!),
                          ),
                        ],
                        selected: {_seedMode},
                        onSelectionChanged: (value) {
                          setState(() => _seedMode = value.first);
                          _save();
                        },
                      ),
                    ),
                    if (_seedMode == 'fixed') ...[
                      numberField(_seed, text['seed']!, commit: () {
                        final seed = _seedValue();
                        setState(() => _seed.text = '$seed');
                        _save();
                      }),
                      SizedBox(
                        width: fieldWidth,
                        child: OutlinedButton.icon(
                          onPressed: () {
                            setState(() => _seed.text =
                                '${Random.secure().nextInt(0x7fffffff) + 1}');
                            _save();
                          },
                          icon: const Icon(Icons.casino_outlined),
                          label: Text(text['randomFixedSeed']!),
                        ),
                      ),
                    ],
                  ],
                );
              }),
            ),
          ),
          const SizedBox(height: 10),
          _weightTunerCard(tuneText),
          const SizedBox(height: 10),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${text['preview']} · $pairSummary',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                      OutlinedButton.icon(
                        onPressed: _loading || _running ? null : _draw,
                        icon: const Icon(Icons.casino_outlined),
                        label: Text(text['draw']!),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_planned.isEmpty)
                    Text(text['empty']!)
                  else
                    SizedBox(
                      height: min(360.0, _planned.length * 62.0),
                      child: ListView.builder(
                        itemCount: _planned.length,
                        itemBuilder: (_, index) => ListTile(
                          dense: true,
                          leading: CircleAvatar(child: Text('${index + 1}')),
                          title: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(text['variantPlain']!,
                                  style:
                                      Theme.of(context).textTheme.labelMedium),
                              Text(_planned[index].basePrompt,
                                  maxLines: 2, overflow: TextOverflow.ellipsis),
                              _franchiseTerms(_planned[index], text),
                              if (_mutateAuxiliary) ...[
                                const SizedBox(height: 5),
                                Text(text['variantMutated']!,
                                    style: Theme.of(context)
                                        .textTheme
                                        .labelMedium),
                                Text(_planned[index].prompt,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis),
                                _mutationTerms(_planned[index], text),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              if (_running)
                FilledButton.tonalIcon(
                  onPressed: () {
                    _cancelled = true;
                    app.cancelGeneration();
                  },
                  icon: const Icon(Icons.stop),
                  label: Text(text['stop']!),
                )
              else
                FilledButton.icon(
                  onPressed: _planned.isEmpty ? null : _generate,
                  icon: const Icon(Icons.play_arrow),
                  label: Text(text['generate']!),
                ),
              OutlinedButton.icon(
                onPressed: _running || _favorites.isEmpty
                    ? null
                    : () => _draw(likedOnly: true),
                icon: const Icon(Icons.favorite_border),
                label: Text(text['liked']!),
              ),
              if (_running)
                Padding(
                  padding: const EdgeInsets.all(10),
                  child: Text('$completed/${_results.length}'),
                ),
              if (_message.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.all(10),
                  child: Text(_message),
                ),
            ],
          ),
          const SizedBox(height: 12),
          SegmentedButton<bool>(
            segments: [
              ButtonSegment(
                value: false,
                icon: const Icon(Icons.grid_view_outlined),
                label: Text('${text['preview']} (${_results.length})'),
              ),
              ButtonSegment(
                value: true,
                icon: const Icon(Icons.favorite_outline),
                label: Text('$favoriteFolderLabel (${_favorites.length})'),
              ),
            ],
            selected: {_showFavorites},
            onSelectionChanged: (value) {
              setState(() => _showFavorites = value.first);
              _save();
            },
          ),
          const SizedBox(height: 12),
          if (!_showFavorites && _results.isNotEmpty)
            _resultGrid(_results, text, app),
          if (_showFavorites) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    LayoutBuilder(
                      builder: (context, constraints) => Wrap(
                        spacing: 12,
                        runSpacing: 8,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          SizedBox(
                            width: constraints.maxWidth >= 520
                                ? constraints.maxWidth - 232
                                : constraints.maxWidth,
                            child: Text(favoriteFolderLabel,
                                style: Theme.of(context).textTheme.titleMedium),
                          ),
                          SizedBox(
                            width: constraints.maxWidth >= 520
                                ? 220
                                : constraints.maxWidth,
                            child: DropdownButtonFormField<String>(
                              value: selectedFavoriteModel,
                              isExpanded: true,
                              decoration: InputDecoration(
                                  labelText: text['modelGroup']),
                              items: [
                                DropdownMenuItem(
                                  value: 'all',
                                  child: Text(
                                      '${text['allModels']} (${_favorites.length})'),
                                ),
                                ...favoriteModels.map((model) {
                                  final sample = _favorites.firstWhere(
                                      (item) => _resultModel(item) == model);
                                  final count = _favorites
                                      .where(
                                          (item) => _resultModel(item) == model)
                                      .length;
                                  return DropdownMenuItem(
                                    value: model,
                                    child: Text(
                                      '${_modelLabel(sample, app)} ($count)',
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  );
                                }),
                              ],
                              onChanged: (value) {
                                if (value == null) return;
                                setState(() => _favoriteModelFilter = value);
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(text['favoritesHint']!,
                        style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 12),
                    if (_favorites.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 32),
                        child: Center(child: Text(text['needLikes']!)),
                      )
                    else
                      ...favoriteGroups.entries.expand((entry) => [
                            Padding(
                              padding:
                                  const EdgeInsets.only(top: 12, bottom: 8),
                              child: Row(
                                children: [
                                  const Icon(Icons.auto_awesome_mosaic_outlined,
                                      size: 18),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      _modelLabel(entry.value.first, app),
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleSmall,
                                    ),
                                  ),
                                  Text('${entry.value.length}'),
                                ],
                              ),
                            ),
                            _resultGrid(entry.value, text, app,
                                favorites: true),
                          ]),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
