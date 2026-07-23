import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../artist/artist_recipe.dart';
import '../i18n/app_locales.dart';
import '../models/nai_models.dart';
import '../services/artist_tag_service.dart';
import '../state/app_state.dart';

class _Result {
  final ArtistRecipe recipe;
  final int sequence;
  String status;
  HistoryItem? image;
  String? error;
  bool liked;
  bool saving = false;
  _Result(this.recipe,
      {this.sequence = 1,
      this.status = 'pending',
      this.image,
      this.error,
      this.liked = false});

  Map<String, dynamic> toJson() => {
        'recipe': recipe.toJson(),
        'sequence': sequence,
        'status': status,
        'image': image?.toJson(),
        'error': error,
        'liked': liked,
      };

  factory _Result.fromJson(Map<String, dynamic> json) => _Result(
        ArtistRecipe.fromJson(
            Map<String, dynamic>.from(json['recipe'] as Map? ?? const {})),
        sequence: (json['sequence'] as num?)?.toInt() ?? 1,
        status: json['status']?.toString() ?? 'pending',
        image: json['image'] is Map
            ? HistoryItem.fromJson(
                Map<String, dynamic>.from(json['image'] as Map))
            : null,
        error: json['error']?.toString(),
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
  late final ArtistTagService _service =
      widget.artistService ?? ArtistTagService();
  final _base = TextEditingController();
  final _auxiliary = TextEditingController();
  final _count = TextEditingController(text: '8');
  final _artistCount = TextEditingController(text: '8');
  final _seed = TextEditingController(text: '246813579');
  final _poolSize = TextEditingController(text: '1000');
  final _width = TextEditingController(text: '832');
  final _height = TextEditingController(text: '1216');
  final _negative = TextEditingController();
  final _scrollController = ScrollController();
  GenerateParams _generationParams = GenerateParams();
  List<ArtistTagRecord> _pool = const [];
  List<ArtistRecipe> _planned = const [];
  final List<_Result> _results = [];
  final List<_Result> _favorites = [];
  bool _mutateAuxiliary = false;
  bool _loading = true;
  bool _running = false;
  bool _cancelled = false;
  bool _showFavorites = false;
  String _message = '';
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
          'poolSize': '依熱度載入前 N 名（100～5000）',
          'load': '載入',
          'refresh': '更新排行',
          'base': '固定內容提示詞',
          'aux': '固定附加詞（每次保留）',
          'mutate': '抽卡時額外加入隨機風格詞',
          'mutateHint':
              '開啟後以相同畫師串、提示詞、Seed 與參數生成 A/B：A 不加風格詞，B 加入 2～6 個帶 0.3～1.5 權重的風格詞。',
          'count': '本批畫師串組數',
          'min': '最少畫師',
          'max': '每串畫師數量（1～20）',
          'seed': '固定 Seed',
          'draw': '重新抽卡',
          'generate': '生成這一批',
          'stop': '停止',
          'liked': '依喜歡項抽卡',
          'preview': '本批組合預覽',
          'empty': '正在載入畫師池…',
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
          'categories': '藝術風格|媒介/筆觸|色彩|光照|氛圍',
          'running': '生成中',
          'hint': '開啟隨機風格詞時，每組生成 A/B 兩張；不下載代表圖。',
          'variantPlain': 'A｜僅畫師串',
          'variantMutated': 'B｜畫師串＋隨機風格詞',
          'copyArtists': '複製畫師串',
          'copyFull': '複製完整提示詞',
          'pairSummary': '{pairs} 組 · {images} 張'
        };
      case 'en-US':
        return {
          'title': 'Random Artist-string Gacha',
          'pool': 'Dynamic popular-artist pool',
          'poolSize': 'Load top N by popularity (100–5000)',
          'load': 'Load',
          'refresh': 'Refresh',
          'base': 'Fixed content prompt',
          'aux': 'Fixed extra terms (always kept)',
          'mutate': 'Add random style terms during the draw',
          'mutateHint':
              'Create a fair A/B pair with the same artist string, prompt, seed, and settings: A has no random styles; B adds 2–6 terms weighted 0.3–1.5.',
          'count': 'Artist-string groups in this batch',
          'min': 'Minimum artists',
          'max': 'Artists per string (1–20)',
          'seed': 'Fixed seed',
          'draw': 'Draw again',
          'generate': 'Generate this batch',
          'stop': 'Stop',
          'liked': 'Draw from liked',
          'preview': 'Current draw',
          'empty': 'Loading artist pool…',
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
          'categories':
              'Art style|Medium / brushwork|Color|Lighting|Atmosphere',
          'running': 'Generating',
          'hint':
              'Style mode creates two A/B images per group. No representative images are downloaded.',
          'variantPlain': 'A | Artist string only',
          'variantMutated': 'B | Artist string + random styles',
          'copyArtists': 'Copy artist string',
          'copyFull': 'Copy full prompt',
          'pairSummary': '{pairs} groups · {images} images'
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
          'mutate': '抽選時に画風語を追加',
          'mutateHint':
              '同じ画家列・プロンプト・Seed・設定で A/B を生成します。A は画風語なし、B は 0.3～1.5 重みの画風語を 2～6 個追加します。',
          'count': 'このバッチの画家列グループ数',
          'min': '最小画家数',
          'max': '1組の画家数（1～20）',
          'seed': '固定 Seed',
          'draw': '再抽選',
          'generate': 'このバッチを生成',
          'stop': '停止',
          'liked': 'お気に入りから抽選',
          'preview': '現在の抽選',
          'empty': '画家プール読込中…',
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
          'categories': '画風|画材・筆致|色彩|光|雰囲気',
          'running': '生成中',
          'hint': '画風語を有効にすると1組につき A/B の2枚を生成します。代表画像は取得しません。',
          'variantPlain': 'A｜画家列のみ',
          'variantMutated': 'B｜画家列＋ランダム画風語',
          'copyArtists': '画家列をコピー',
          'copyFull': '完全プロンプトをコピー',
          'pairSummary': '{pairs} 組 · {images} 枚'
        };
      case 'ko-KR':
        return {
          'title': '무작위 작가 조합 뽑기',
          'pool': '동적 인기 작가 풀',
          'poolSize': '인기순 상위 N명 (100～5000)',
          'load': '불러오기',
          'refresh': '새로고침',
          'base': '고정 내용 프롬프트',
          'aux': '고정 추가 용어 (항상 유지)',
          'mutate': '뽑을 때 무작위 화풍 용어 추가',
          'mutateHint':
              '같은 작가 문자열·프롬프트·Seed·설정으로 A/B를 생성합니다. A는 화풍 용어가 없고 B는 0.3～1.5 가중치의 용어 2～6개를 추가합니다.',
          'count': '이번 배치 작가 문자열 그룹 수',
          'min': '최소 작가 수',
          'max': '조합당 작가 수 (1～20)',
          'seed': '고정 Seed',
          'draw': '다시 뽑기',
          'generate': '이 배치 생성',
          'stop': '중지',
          'liked': '좋아요로 뽑기',
          'preview': '현재 뽑기',
          'empty': '작가 풀 로딩 중…',
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
          'categories': '화풍|매체/붓질|색상|조명|분위기',
          'running': '생성 중',
          'hint': '화풍 용어를 켜면 그룹마다 A/B 두 장을 생성합니다. 대표 이미지는 받지 않습니다.',
          'variantPlain': 'A｜작가 문자열만',
          'variantMutated': 'B｜작가 문자열＋무작위 화풍',
          'copyArtists': '작가 문자열 복사',
          'copyFull': '전체 프롬프트 복사',
          'pairSummary': '{pairs} 그룹 · {images}장'
        };
      default:
        return {
          'title': '随机画师串抽卡',
          'pool': '动态热门画师池',
          'poolSize': '按热度载入前 N 名（100～5000）',
          'load': '载入',
          'refresh': '刷新排行',
          'base': '固定内容提示词',
          'aux': '固定附加词（每次保留）',
          'mutate': '抽卡时额外加入随机风格词',
          'mutateHint':
              '开启后以相同画师串、提示词、Seed 和参数生成 A/B：A 不加风格词，B 加入 2～6 个带 0.3～1.5 权重的风格词。',
          'count': '本批画师串组数',
          'min': '最少画师',
          'max': '每串画师数量（1～20）',
          'seed': '固定 Seed',
          'draw': '重新抽卡',
          'generate': '生成这一批',
          'stop': '停止',
          'liked': '根据喜欢项抽卡',
          'preview': '本批组合预览',
          'empty': '正在载入画师池…',
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
          'categories': '艺术风格|媒介/笔触|色彩|光照|氛围',
          'running': '生成中',
          'hint': '开启随机风格词时，每组生成 A/B 两张；不下载代表图。',
          'variantPlain': 'A｜仅画师串',
          'variantMutated': 'B｜画师串＋随机风格词',
          'copyArtists': '复制画师串',
          'copyFull': '复制完整提示词',
          'pairSummary': '{pairs} 组 · {images} 张'
        };
    }
  }

  Map<String, String> _parameterText(String language) {
    switch (normalizeAppLocaleCode(language)) {
      case 'zh-TW':
        return {
          'title': 'NovelAI 生成參數',
          'hint': '首次進入時繼承生成頁參數；此處修改只用於抽卡，A/B 使用相同參數。',
          'sync': '從生成頁同步',
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
              'Initially inherited from Generate. Changes affect only gacha and each A/B pair uses identical settings.',
          'sync': 'Sync from Generate',
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
          'hint': '初回は生成画面から継承します。変更は抽選だけに使い、A/B は同じ設定で比較します。',
          'sync': '生成画面から同期',
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
          'hint': '처음에는 생성 화면 설정을 상속합니다. 변경은 뽑기에만 적용되며 A/B는 같은 설정을 사용합니다.',
          'sync': '생성 화면에서 동기화',
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
          'hint': '首次进入时继承生成页参数；此处修改仅用于抽卡，A/B 使用相同参数。',
          'sync': '从生成页同步',
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

  void _syncParameterControllers() {
    _width.text = '${_generationParams.width}';
    _height.text = '${_generationParams.height}';
    _negative.text = _generationParams.negativePrompt;
  }

  int _positive(TextEditingController controller, [int fallback = 1]) {
    final value = int.tryParse(controller.text.trim());
    return value != null && value > 0 ? value : fallback;
  }

  int _snapDimension(String value, [int fallback = 64]) {
    final parsed = int.tryParse(value) ?? fallback;
    return ((parsed / 64).round() * 64).clamp(64, 4096).toInt();
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
    _count.text = '${prefs.getInt('${_prefsPrefix}count') ?? 8}';
    _artistCount.text = '${prefs.getInt('${_prefsPrefix}artistCount') ?? 8}';
    _poolSize.text = '${prefs.getInt('${_prefsPrefix}poolSize') ?? 1000}';
    _seed.text = '${prefs.getInt('${_prefsPrefix}seed') ?? 246813579}';
    try {
      final saved = prefs.getString('${_prefsPrefix}generationParams');
      _generationParams = saved == null
          ? app.params.copy()
          : GenerateParams.fromJson(
              Map<String, dynamic>.from(jsonDecode(saved) as Map));
    } catch (_) {
      _generationParams = app.params.copy();
    }
    _generationParams
      ..positivePrompt = ''
      ..stylePrompt = '';
    _syncParameterControllers();
    _mutateAuxiliary = prefs.getBool('${_prefsPrefix}mutate') ?? false;
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
    await prefs.setInt('${_prefsPrefix}count', _positive(_count, 8));
    await prefs.setInt('${_prefsPrefix}artistCount',
        _positive(_artistCount, 8).clamp(1, 20).toInt());
    await prefs.setInt('${_prefsPrefix}poolSize', _poolLimit());
    await prefs.setInt('${_prefsPrefix}seed', int.tryParse(_seed.text) ?? 0);
    _generationParams
      ..width = _snapDimension(_width.text, 832)
      ..height = _snapDimension(_height.text, 1216)
      ..negativePrompt = _negative.text;
    await prefs.setString('${_prefsPrefix}generationParams',
        jsonEncode(_generationParams.toJson()));
    await prefs.setBool('${_prefsPrefix}mutate', _mutateAuxiliary);
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
        minArtists: _positive(_artistCount, 8),
        maxArtists: _positive(_artistCount, 8),
        drawSeed: _drawSeed,
        auxiliary: _auxiliary.text,
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
    _setStateKeepingScroll(() {
      result.status = 'running';
      result.error = null;
    });
    try {
      final fixed = _generationParams.copy()
        ..positivePrompt = _base.text.trim()
        ..stylePrompt = result.recipe.prompt
        ..seedMode = 'fixed'
        ..seed = int.tryParse(_seed.text) ?? 0;
      final image = await app.generateArtistLabTemporary(
        panelParams: fixed,
        panelExtras: GenerateExtras(),
      );
      _setStateKeepingScroll(() {
        result.image = image;
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
    final batch = List<_Result>.generate(
      comparisons.length,
      (index) => _Result(
        comparisons[index],
        sequence: _mutateAuxiliary ? index ~/ 2 + 1 : index + 1,
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

  @override
  void dispose() {
    _base.dispose();
    _auxiliary.dispose();
    _count.dispose();
    _artistCount.dispose();
    _poolSize.dispose();
    _seed.dispose();
    _width.dispose();
    _height.dispose();
    _negative.dispose();
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
      'atmosphere'
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
                    child: Text(
                      '#${result.sequence.toString().padLeft(2, '0')} · '
                      '${result.recipe.variant == 'mutated' ? text['variantMutated']! : text['variantPlain']!}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                  Expanded(
                    child: result.image == null
                        ? Center(
                            child: Text(text[result.status] ?? result.status))
                        : Image.file(
                            File(result.image!.filePath),
                            width: double.infinity,
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) =>
                                const Icon(Icons.broken_image_outlined),
                          ),
                  ),
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
                          onPressed: () => Clipboard.setData(
                              ClipboardData(text: result.recipe.artistPrompt)),
                          icon: const Icon(Icons.people_alt_outlined, size: 16),
                          label: Text(text['copyArtists']!),
                        ),
                        OutlinedButton.icon(
                          onPressed: () => Clipboard.setData(
                              ClipboardData(text: result.recipe.prompt)),
                          icon:
                              const Icon(Icons.content_copy_outlined, size: 16),
                          label: Text(text['copyFull']!),
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
                                      ..positivePrompt = _base.text.trim()
                                      ..stylePrompt = result.recipe.prompt
                                      ..seed = int.tryParse(_seed.text) ?? 0
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
                                      ..qualityToggle = applied.qualityToggle
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

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final text = _text(app.settings.language);
    final parameterText = _parameterText(app.settings.language);
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
                        Text(_loading ? text['empty']! : '${_pool.length}',
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
              title: Text(parameterText['title']!),
              subtitle: Text(parameterText['hint']!),
              trailing: IconButton(
                tooltip: parameterText['sync'],
                onPressed: () {
                  setState(() {
                    _generationParams = app.params.copy()
                      ..positivePrompt = ''
                      ..stylePrompt = '';
                    _syncParameterControllers();
                  });
                  _save();
                },
                icon: const Icon(Icons.sync),
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
                              setState(() => _generationParams.model = value);
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
                            onChanged: (value) {
                              _generationParams.width = _snapDimension(value);
                              _save();
                            },
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
                            onChanged: (value) {
                              _generationParams.height = _snapDimension(value);
                              _save();
                            },
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
                              FilterChip(
                                label: Text(parameterText['quality']!),
                                selected: _generationParams.qualityToggle,
                                onSelected: (value) {
                                  setState(() =>
                                      _generationParams.qualityToggle = value);
                                  _save();
                                },
                              ),
                              FilterChip(
                                label: const Text('Variety+'),
                                selected: _generationParams.variety,
                                onSelected: (value) {
                                  setState(
                                      () => _generationParams.variety = value);
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
                        TextEditingController controller, String label) =>
                    SizedBox(
                      width: fieldWidth,
                      child: TextField(
                        controller: controller,
                        keyboardType: TextInputType.number,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly
                        ],
                        decoration: InputDecoration(labelText: label),
                      ),
                    );
                return Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
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
                      child: TextField(
                        controller: _auxiliary,
                        minLines: 2,
                        maxLines: 4,
                        decoration: InputDecoration(labelText: text['aux']),
                      ),
                    ),
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
                    numberField(_count, text['count']!),
                    numberField(_seed, text['seed']!),
                    numberField(_artistCount, text['max']!),
                  ],
                );
              }),
            ),
          ),
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
                    Text(favoriteFolderLabel,
                        style: Theme.of(context).textTheme.titleMedium),
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
                      _resultGrid(_favorites, text, app, favorites: true),
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
