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
  _Result(this.recipe,
      {this.status = 'pending', this.image, this.error, this.liked = false});
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
  final _minArtists = TextEditingController(text: '4');
  final _maxArtists = TextEditingController(text: '10');
  final _seed = TextEditingController(text: '246813579');
  List<ArtistTagRecord> _pool = const [];
  List<ArtistRecipe> _planned = const [];
  final List<_Result> _results = [];
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
          'refresh': '更新排行',
          'base': '固定內容提示詞',
          'aux': '輔助畫風詞',
          'mutate': '允許非畫師詞參與隨機變異',
          'count': '本批生成數量（任意正整數）',
          'min': '最少畫師',
          'max': '最多畫師',
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
          'running': '生成中',
          'hint': '每次抽卡都會重新組合畫師與權重；不下載代表圖。'
        };
      case 'en-US':
        return {
          'title': 'Random Artist-string Gacha',
          'pool': 'Dynamic popular-artist pool',
          'refresh': 'Refresh',
          'base': 'Fixed content prompt',
          'aux': 'Auxiliary style terms',
          'mutate': 'Allow non-artist terms to mutate',
          'count': 'Batch size (any positive integer)',
          'min': 'Minimum artists',
          'max': 'Maximum artists',
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
          'running': 'Generating',
          'hint':
              'Every draw rerolls artists and weights. No representative images are downloaded.'
        };
      case 'ja-JP':
        return {
          'title': 'ランダム画家タグ抽選',
          'pool': '動的人気画家プール',
          'refresh': '更新',
          'base': '固定内容プロンプト',
          'aux': '補助画風語',
          'mutate': '非画家語も変異',
          'count': 'バッチ枚数（任意の正整数）',
          'min': '最小画家数',
          'max': '最大画家数',
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
          'running': '生成中',
          'hint': '抽選ごとに画家と重みを更新し、代表画像は取得しません。'
        };
      case 'ko-KR':
        return {
          'title': '무작위 작가 조합 뽑기',
          'pool': '동적 인기 작가 풀',
          'refresh': '새로고침',
          'base': '고정 내용 프롬프트',
          'aux': '보조 화풍 용어',
          'mutate': '비작가 용어도 변이',
          'count': '배치 수 (임의의 양의 정수)',
          'min': '최소 작가 수',
          'max': '최대 작가 수',
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
          'running': '생성 중',
          'hint': '뽑을 때마다 작가와 가중치를 갱신하며 대표 이미지는 받지 않습니다.'
        };
      default:
        return {
          'title': '随机画师串抽卡',
          'pool': '动态热门画师池',
          'refresh': '刷新排行',
          'base': '固定内容提示词',
          'aux': '辅助画风词',
          'mutate': '允许非画师词参与随机变异',
          'count': '本批生成数量（任意正整数）',
          'min': '最少画师',
          'max': '最多画师',
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
    _minArtists.text = '${prefs.getInt('${_prefsPrefix}min') ?? 4}';
    _maxArtists.text = '${prefs.getInt('${_prefsPrefix}max') ?? 10}';
    _seed.text = '${prefs.getInt('${_prefsPrefix}seed') ?? 246813579}';
    _mutateAuxiliary = prefs.getBool('${_prefsPrefix}mutate') ?? false;
    await _loadPool(false);
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('${_prefsPrefix}base', _base.text);
    await prefs.setString('${_prefsPrefix}aux', _auxiliary.text);
    await prefs.setInt('${_prefsPrefix}count', _positive(_count, 8));
    await prefs.setInt('${_prefsPrefix}min', _positive(_minArtists, 4));
    await prefs.setInt('${_prefsPrefix}max', _positive(_maxArtists, 10));
    await prefs.setInt('${_prefsPrefix}seed', int.tryParse(_seed.text) ?? 0);
    await prefs.setBool('${_prefsPrefix}mutate', _mutateAuxiliary);
  }

  Future<void> _loadPool(bool force) async {
    setState(() {
      _loading = true;
      _message = '';
    });
    try {
      final app = context.read<AppState>();
      final targetSize = force ? max(1000, _pool.length + 500) : 1000;
      _pool =
          await _service.popular(app.settings, limit: targetSize, force: force);
      _draw();
    } catch (error) {
      setState(() => _message = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _draw({bool likedOnly = false}) {
    final favorites = likedOnly
        ? _results
            .where((item) => item.liked)
            .expand((item) => item.recipe.artists)
            .toSet()
        : <String>{};
    if (likedOnly && favorites.isEmpty) return;
    _drawSeed = Random.secure().nextInt(0x7fffffff);
    setState(() {
      _planned = drawArtistRecipes(
        pool: _pool,
        count: _positive(_count, 8),
        minArtists: _positive(_minArtists, 4),
        maxArtists: _positive(_maxArtists, 10),
        drawSeed: _drawSeed,
        auxiliary: _auxiliary.text,
        mutateAuxiliary: _mutateAuxiliary,
        favorites: favorites,
      );
    });
    _save();
  }

  Future<void> _generate() async {
    if (_base.text.trim().isEmpty || _planned.isEmpty || _running) return;
    final app = context.read<AppState>();
    final batch = _planned.map(_Result.new).toList();
    setState(() {
      _results.addAll(batch);
      _running = true;
      _cancelled = false;
      _message = '';
    });
    await _save();
    for (final result in batch) {
      if (_cancelled) break;
      setState(() => result.status = 'running');
      try {
        final fixed = app.params.copy()
          ..positivePrompt = _base.text.trim()
          ..stylePrompt = result.recipe.prompt
          ..width = 512
          ..height = 512
          ..seedMode = 'fixed'
          ..seed = int.tryParse(_seed.text) ?? 0
          ..qualityToggle = false;
        result.image = await app.generateComicPanel(
          panelParams: fixed,
          panelExtras: GenerateExtras(),
          projectTitle: '画风实验室-随机抽卡',
        );
        result.status = 'done';
      } catch (error) {
        result.status = 'failed';
        result.error = error.toString();
      }
      if (mounted) setState(() {});
    }
    if (mounted) {
      setState(() {
        _running = false;
        _message = _cancelled
            ? _text(app.settings.language)['stop']!
            : _text(app.settings.language)['done']!;
      });
    }
    _draw();
  }

  @override
  void dispose() {
    _base.dispose();
    _auxiliary.dispose();
    _count.dispose();
    _minArtists.dispose();
    _maxArtists.dispose();
    _seed.dispose();
    super.dispose();
  }

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
              child: Row(
                children: [
                  Expanded(
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
                  OutlinedButton.icon(
                    onPressed: _loading ? null : () => _loadPool(true),
                    icon: const Icon(Icons.refresh),
                    label: Text(text['refresh']!),
                  ),
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
                        value: _mutateAuxiliary,
                        onChanged: (value) =>
                            setState(() => _mutateAuxiliary = value),
                      ),
                    ),
                    numberField(_count, text['count']!),
                    numberField(_seed, text['seed']!),
                    numberField(_minArtists, text['min']!),
                    numberField(_maxArtists, text['max']!),
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
                          title: Text(
                            _planned[index].prompt,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
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
                onPressed: _running || !_results.any((item) => item.liked)
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
              itemCount: _results.length,
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: columns,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: .67,
              ),
              itemBuilder: (context, index) {
                final result = _results[index];
                return Card(
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    children: [
                      Expanded(
                        child: result.image == null
                            ? Center(
                                child:
                                    Text(text[result.status] ?? result.status),
                              )
                            : Image.file(
                                File(result.image!.filePath),
                                width: double.infinity,
                                fit: BoxFit.contain,
                                errorBuilder: (_, __, ___) =>
                                    const Icon(Icons.broken_image_outlined),
                              ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(8, 8, 8, 2),
                        child: Text(
                          result.recipe.prompt,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (result.error != null)
                        Padding(
                          padding: const EdgeInsets.all(6),
                          child: Text(
                            result.error!,
                            maxLines: 2,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                              fontSize: 11,
                            ),
                          ),
                        ),
                      Padding(
                        padding: const EdgeInsets.all(6),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            IconButton(
                              tooltip: text['copy'],
                              onPressed: () => Clipboard.setData(
                                ClipboardData(text: result.recipe.prompt),
                              ),
                              icon: const Icon(Icons.copy_outlined),
                            ),
                            IconButton(
                              tooltip:
                                  result.liked ? text['unlike'] : text['like'],
                              onPressed: () =>
                                  setState(() => result.liked = !result.liked),
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
          }),
        ],
      ),
    );
  }
}
