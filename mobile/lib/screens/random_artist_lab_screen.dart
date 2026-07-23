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
  String status;
  HistoryItem? image;
  String? error;
  bool liked;
  bool saving;
  _Result(this.recipe,
      {this.status = 'pending',
      this.image,
      this.error,
      this.liked = false,
      this.saving = false});

  Map<String, dynamic> toJson() => {
        'recipe': recipe.toJson(),
        'status': status,
        'image': image?.toJson(),
        'error': error,
        'liked': liked,
      };

  factory _Result.fromJson(Map<String, dynamic> json) => _Result(
        ArtistRecipe.fromJson(
            Map<String, dynamic>.from(json['recipe'] as Map? ?? const {})),
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
  List<ArtistTagRecord> _pool = const [];
  List<ArtistRecipe> _planned = const [];
  final List<_Result> _results = [];
  final List<_Result> _favorites = [];
  bool _mutateAuxiliary = false;
  bool _loading = true;
  bool _running = false;
  bool _cancelled = false;
  String _message = '';
  int _drawSeed = Random.secure().nextInt(0x7fffffff);

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
          'mutateHint': '從藝術風格、媒介/筆觸、色彩、光照、氛圍抽取 2～6 個詞，並配置 0.3～1.5 權重。',
          'count': '本批生成數量（任意正整數）',
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
          'favoritesHint': '收藏圖片永久保存；未收藏結果只留在暫存，下一次抽卡會清除。',
          'remove': '移除收藏',
          'mutation': '本次風格/光影變異詞',
          'categories': '藝術風格|媒介/筆觸|色彩|光照|氛圍',
          'running': '生成中',
          'hint': '每次抽卡都會重新組合畫師與權重；不下載代表圖。'
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
              'Draw 2–6 weighted terms (0.3–1.5) from art style, medium/brushwork, color, lighting, and atmosphere.',
          'count': 'Batch size (any positive integer)',
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
              'Favorites are permanent. Unliked results are temporary and cleared by the next draw.',
          'remove': 'Remove favorite',
          'mutation': 'Style / lighting terms in this draw',
          'categories':
              'Art style|Medium / brushwork|Color|Lighting|Atmosphere',
          'running': 'Generating',
          'hint':
              'Every draw rerolls artists and weights. No representative images are downloaded.'
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
          'mutateHint': '画風、画材/筆致、色彩、光、雰囲気から 2～6 語を選び、0.3～1.5 の重みを付けます。',
          'count': 'バッチ枚数（任意の正整数）',
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
          'favoritesHint': 'お気に入りは永久保存し、それ以外は次回抽選時に消去します。',
          'remove': 'お気に入り削除',
          'mutation': '今回の画風・光変異語',
          'categories': '画風|画材・筆致|色彩|光|雰囲気',
          'running': '生成中',
          'hint': '抽選ごとに画家と重みを更新し、代表画像は取得しません。'
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
          'mutateHint': '화풍, 매체/붓질, 색상, 조명, 분위기에서 2～6개를 뽑고 0.3～1.5 가중치를 부여합니다.',
          'count': '배치 수 (임의의 양의 정수)',
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
          'favoritesHint': '즐겨찾기는 영구 저장되고 나머지는 다음 뽑기 때 삭제됩니다.',
          'remove': '즐겨찾기 제거',
          'mutation': '이번 화풍/조명 변이 용어',
          'categories': '화풍|매체/붓질|색상|조명|분위기',
          'running': '생성 중',
          'hint': '뽑을 때마다 작가와 가중치를 갱신하며 대표 이미지는 받지 않습니다.'
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
          'mutateHint': '从艺术风格、媒介/笔触、色彩、光照、氛围抽取 2～6 个词，并配置 0.3～1.5 权重。',
          'count': '本批生成数量（任意正整数）',
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
          'favoritesHint': '收藏图片永久保存；未收藏结果只留在临时缓存，下一次抽卡会清除。',
          'remove': '移除收藏',
          'mutation': '本次风格/光影变异词',
          'categories': '艺术风格|媒介/笔触|色彩|光照|氛围',
          'running': '生成中',
          'hint': '每次抽卡都会重新组合画师与权重；不下载代表图。'
        };
    }
  }

  int _positive(TextEditingController controller, [int fallback = 1]) {
    final value = int.tryParse(controller.text.trim());
    return value != null && value > 0 ? value : fallback;
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
    _mutateAuxiliary = prefs.getBool('${_prefsPrefix}mutate') ?? false;
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
    await prefs.setBool('${_prefsPrefix}mutate', _mutateAuxiliary);
    await prefs.setString('${_prefsPrefix}results',
        jsonEncode(_results.map((item) => item.toJson()).toList()));
    await prefs.setString('${_prefsPrefix}favorites',
        jsonEncode(_favorites.map((item) => item.toJson()).toList()));
  }

  int _poolLimit() => _positive(_poolSize, 1000).clamp(100, 5000).toInt();

  List<ArtistRecipe> _buildPlan([Set<String> favorites = const {}]) =>
      drawArtistRecipes(
        pool: _pool,
        count: _positive(_count, 8),
        minArtists: _positive(_artistCount, 8),
        maxArtists: _positive(_artistCount, 8),
        drawSeed: _drawSeed,
        auxiliary: _auxiliary.text,
        mutateAuxiliary: _mutateAuxiliary,
        favorites: favorites,
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
    if (likedOnly && favorites.isEmpty) return;
    await _clearCurrent();
    if (!mounted) return;
    _drawSeed = Random.secure().nextInt(0x7fffffff);
    setState(() => _planned = _buildPlan(favorites));
    await _save();
  }

  Future<void> _generateOne(_Result result) async {
    final app = context.read<AppState>();
    setState(() {
      result.status = 'running';
      result.error = null;
    });
    try {
      final fixed = app.params.copy()
        ..positivePrompt = _base.text.trim()
        ..stylePrompt = result.recipe.prompt
        ..width = 512
        ..height = 512
        ..seedMode = 'fixed'
        ..seed = int.tryParse(_seed.text) ?? 0
        ..qualityToggle = false;
      result.image = await app.generateArtistLabTemporary(
        panelParams: fixed,
        panelExtras: GenerateExtras(),
      );
      result.status = 'done';
    } catch (error) {
      result.status = 'failed';
      result.error = error.toString();
    }
    if (mounted) setState(() {});
    await _save();
  }

  Future<void> _generate() async {
    if (_base.text.trim().isEmpty || _planned.isEmpty || _running) return;
    final app = context.read<AppState>();
    await _clearCurrent();
    final batch = _planned.map(_Result.new).toList();
    setState(() {
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
      setState(() {
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
    setState(() => _running = true);
    await _generateOne(result);
    if (mounted) setState(() => _running = false);
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
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: [
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
                    padding: const EdgeInsets.all(6),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        IconButton(
                          tooltip: text['copy'],
                          onPressed: () => Clipboard.setData(
                              ClipboardData(text: result.recipe.prompt)),
                          icon: const Icon(Icons.copy_outlined),
                        ),
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
                              ? () => app.setParam((params) =>
                                  params.stylePrompt = result.recipe.prompt)
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
    final completed = _results
        .where((item) => item.status == 'done' || item.status == 'failed')
        .length;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: widget.onBack,
        ),
        title: Text(text['title']!),
      ),
      body: ListView(
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
                        onChanged: (value) =>
                            setState(() => _mutateAuxiliary = value),
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
                          '${text['preview']} · ${_planned.length}',
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
                              Text(_planned[index].prompt,
                                  maxLines: 2, overflow: TextOverflow.ellipsis),
                              _mutationTerms(_planned[index], text),
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
          if (_results.isNotEmpty) _resultGrid(_results, text, app),
          if (_favorites.isNotEmpty) ...[
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(text['favorites']!,
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text(text['favoritesHint']!,
                        style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 12),
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
