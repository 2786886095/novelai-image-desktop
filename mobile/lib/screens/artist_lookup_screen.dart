import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../i18n/issue81_text.dart';
import '../services/artist_identity_index.dart';
import '../services/artist_tag_service.dart';
import '../state/app_state.dart';
import '../ui/compact_workbench.dart';
import '../ui/global_typography.dart';

class ArtistLookupScreen extends StatefulWidget {
  final VoidCallback onBack;
  final ArtistTagService? service;
  const ArtistLookupScreen({super.key, required this.onBack, this.service});
  @override
  State<ArtistLookupScreen> createState() => _ArtistLookupScreenState();
}

typedef _Hit = ({ArtistIdentity artist, ArtistIndexRow? cached});
typedef _Result = ({ArtistProfile profile, List<_Hit> hits, bool failed});

class _ArtistLookupScreenState extends State<ArtistLookupScreen> {
  final _input = TextEditingController();
  late final _service = widget.service ?? ArtistTagService();
  final _index = ArtistIdentityIndex();
  bool _busy = false, _v5 = true;
  String _notice = '';
  List<_Result> _results = [];
  final _weights = <String, double>{};
  final _previews = <String, List<ArtistPreview>>{};
  final _previewErrors = <String>{}, _previewLoading = <String>{};
  int _generation = 0, _indexCount = 0;
  String _t(String key) =>
      issue81Text(context.read<AppState>().settings.language, key);
  String _l(String cn, String en) =>
      context.read<AppState>().settings.language.startsWith('zh') ? cn : en;

  @override
  void initState() {
    super.initState();
    _index.load().then((rows) {
      if (mounted && !_busy) setState(() => _indexCount = rows.length);
    }).catchError((Object _) {});
  }

  Future<void> _search({bool offline = false}) async {
    if (_busy) return;
    late final ({List<ArtistProfile> profiles, int invalid}) batch;
    try {
      batch = parseArtistBatch(_input.text);
    } on FormatException {
      setState(() => _notice = _l('请输入 1–12 个 Pixiv／X 主页链接或画师名。',
          'Enter 1–12 Pixiv/X profiles or artist names.'));
      return;
    }
    FocusScope.of(context).unfocus();
    final settings = context.read<AppState>().settings;
    setState(() {
      _generation++;
      _busy = true;
      _notice = '';
      _results = [];
      _weights.clear();
      _previews.clear();
      _previewErrors.clear();
      _previewLoading.clear();
    });
    try {
      final cached = await _index.load();
      if (!mounted) return;
      final updates = <ArtistIndexRow>[];
      final results = <_Result>[];
      Future<_Result> lookup(ArtistProfile profile) async {
        final local = cached
            .where((row) => artistIndexMatch(profile, row))
            .map((row) => (
                  artist: ArtistIdentity(row.id, row.tag, row.urls, const []),
                  cached: row as ArtistIndexRow?
                ))
            .toList();
        if (offline) return (profile: profile, hits: local, failed: false);
        try {
          final artists = await _service.lookup(settings, profile.value);
          for (final artist in artists.where((item) => item.urls.isNotEmpty)) {
            updates.add((
              id: artist.id,
              tag: artist.tag,
              urls: artist.urls,
              savedAt: DateTime.now().millisecondsSinceEpoch,
              source: 'danbooru'
            ));
          }
          return (
            profile: profile,
            hits: artists
                .map((artist) =>
                    (artist: artist, cached: null as ArtistIndexRow?))
                .toList(),
            failed: false
          );
        } catch (_) {
          return (profile: profile, hits: local, failed: true);
        }
      }

      for (var i = 0; i < batch.profiles.length && mounted; i += 3) {
        results.addAll(
            await Future.wait(batch.profiles.skip(i).take(3).map(lookup)));
      }
      var saveFailed = false, count = cached.length;
      if (updates.isNotEmpty) {
        try {
          count = (await _index.merge(updates)).length;
        } catch (_) {
          saveFailed = true;
        }
      }
      if (mounted) {
        setState(() {
          _results = results;
          _indexCount = count;
          _notice = [
            if (batch.invalid > 0)
              _l('已跳过无效输入：', 'Skipped invalid entries: ') +
                  batch.invalid.toString(),
            if (saveFailed)
              _l('无法写入本地索引，本次结果仍可使用。',
                  'Could not save the local index. These results are still usable.'),
          ].join(' ');
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
            () => _notice = _l('无法读取本地索引。', 'Could not read the local index.'));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _import() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final picked = await FilePicker.platform
          .pickFiles(type: FileType.custom, allowedExtensions: ['json']);
      if (picked == null) return;
      final file = picked.files.single;
      if (file.size > artistIndexByteLimit || file.path == null) {
        throw const FormatException('Invalid index');
      }
      final bytes = <int>[];
      await for (final chunk
          in File(file.path!).openRead(0, artistIndexByteLimit + 1)) {
        bytes.addAll(chunk);
        if (bytes.length > artistIndexByteLimit) {
          throw const FormatException('Index too large');
        }
      }
      final count = (await _index
              .merge(readArtistIndex(utf8.decode(bytes), imported: true)))
          .length;
      if (mounted) {
        setState(() {
          _indexCount = count;
          _notice = _l('已合并本地身份索引。导入记录未经过在线验证。',
              'Local index merged. Imported entries are not verified online.');
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _notice = _l('无法导入：请选择不超过 2 MiB 的 v1 身份索引 JSON。',
            'Could not import: choose a v1 identity index JSON up to 2 MiB.'));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _share(
      BuildContext anchor, String name, String type, String value) async {
    final box = anchor.findRenderObject();
    final origin = box is RenderBox && box.hasSize
        ? box.localToGlobal(Offset.zero) & box.size
        : null;
    try {
      await Share.shareXFiles([
        XFile.fromData(Uint8List.fromList(utf8.encode(value)), mimeType: type)
      ], fileNameOverrides: [
        name
      ], sharePositionOrigin: origin);
    } catch (_) {
      if (mounted) {
        setState(() => _notice = _l('无法导出文件。', 'Could not export the file.'));
      }
    }
  }

  Future<void> _preview(String tag) async {
    final generation = _generation;
    setState(() {
      _previewLoading.add(tag);
      _previewErrors.remove(tag);
      _previews.remove(tag);
    });
    try {
      final rows = await _service.lookupRecentPreviews(
          context.read<AppState>().settings, tag);
      if (mounted && generation == _generation) {
        setState(() => _previews[tag] = rows);
      }
    } catch (_) {
      if (mounted && generation == _generation) {
        setState(() => _previewErrors.add(tag));
      }
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _previewLoading.remove(tag));
      }
    }
  }

  Future<void> _copy(String value) async {
    try {
      await Clipboard.setData(ClipboardData(text: value));
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(_t('copied'))));
      }
    } catch (_) {
      if (mounted) setState(() => _notice = _l('复制失败。', 'Copy failed.'));
    }
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Widget _card(List<Widget> children) => Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: children)),
      );
  Widget _actions(List<Widget> children) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Wrap(spacing: 8, runSpacing: 6, children: children),
      );

  Widget _result(_Result result) => _card([
        Text(result.profile.value,
            style: Theme.of(context).textTheme.titleMedium),
        if (result.failed)
          Text(_l('Danbooru 暂不可用，以下仅显示本地记录。',
              'Danbooru is unavailable; showing local entries only.')),
        if (result.hits.isEmpty) Text(_l('没有可确认的画师记录。', 'No confirmed match.')),
        if (result.hits.length > 1)
          Text(_l(
              '有多个候选，请核对后选择。', 'Multiple matches. Review before selecting.')),
        for (final hit in result.hits) ...[
          const Divider(),
          CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(hit.artist.tag),
              subtitle: Text(
                  'Danbooru #${hit.artist.id}${hit.cached == null ? '' : ' · ${hit.cached!.source == 'danbooru' ? _l('在线查询缓存', 'Online cache') : _l('导入索引（未验证）', 'Imported (unverified)')} · ${MaterialLocalizations.of(context).formatCompactDate(DateTime.fromMillisecondsSinceEpoch(hit.cached!.savedAt))}'}'),
              value: _weights.containsKey(hit.artist.tag),
              onChanged: (checked) => setState(() {
                    if (checked == true) {
                      _weights[hit.artist.tag] = 1;
                    } else {
                      _weights.remove(hit.artist.tag);
                    }
                  })),
          if (hit.artist.aliases.isNotEmpty)
            Text(hit.artist.aliases.join(' · '),
                maxLines: 2, overflow: TextOverflow.ellipsis),
          _actions([
            OutlinedButton.icon(
                onPressed: () => _copy(hit.artist.tag),
                icon: const Icon(Icons.copy, size: 18),
                label: Text(_t('copyTag'))),
            OutlinedButton.icon(
                onPressed: _previewLoading.contains(hit.artist.tag)
                    ? null
                    : () => _preview(hit.artist.tag),
                icon: const Icon(Icons.image_outlined, size: 18),
                label: Text(_l('查看近期作品', 'Preview recent works'))),
          ]),
          if (_previewLoading.contains(hit.artist.tag))
            const LinearProgressIndicator(),
          if (_previewErrors.contains(hit.artist.tag))
            Text(_l('预览暂不可用，查询结果不受影响。',
                'Previews are unavailable; matches are unchanged.')),
          if (_previews[hit.artist.tag]?.isEmpty == true)
            Text(_l('没有可预览的普通级作品。', 'No general-rated previews available.')),
          if (_previews[hit.artist.tag]?.isNotEmpty == true)
            _actions([
              for (final row in _previews[hit.artist.tag]!)
                SizedBox(
                    width: 124,
                    child: Column(children: [
                      SizedBox.square(
                          dimension: 116,
                          child: Image.network(row.url,
                              fit: BoxFit.contain,
                              cacheWidth: 256,
                              semanticLabel: 'Danbooru #${row.id}',
                              errorBuilder: (_, __, ___) => Center(
                                  child: Text(
                                      _l('图片无法加载', 'Image unavailable'))))),
                      Text(
                          '${MaterialLocalizations.of(context).formatCompactDate(row.date.toLocal())} · #${row.id}'),
                    ])),
            ]),
        ],
      ]);

  @override
  Widget build(BuildContext context) {
    context.watch<AppState>();
    final prompt = formatLookupPrompt(_weights, v5: _v5);
    return Scaffold(
      appBar: workbenchAppBar(
          context,
          AppBar(
              leading: BackButton(onPressed: widget.onBack),
              title: studioAppBarTitle(context, Text(_t('lookup'))))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          _card([
            Text(_l('用 Pixiv／X 链接查 Danbooru 画师 Tag。最多 12 项，支持连续粘贴并自动去重。',
                'Find Danbooru artist tags from up to 12 Pixiv/X profiles. Paste links back to back; duplicates are merged.')),
            const SizedBox(height: 12),
            TextField(
                key: const ValueKey('artist-lookup-input'),
                controller: _input,
                maxLength: 12000,
                minLines: 2,
                maxLines: 4,
                enabled: !_busy,
                decoration: InputDecoration(
                    labelText: _t('input'),
                    prefixIcon: const Icon(Icons.person_search_outlined))),
            _actions([
              FilledButton.icon(
                  onPressed: _busy ? null : _search,
                  icon: const Icon(Icons.search),
                  label: Text(_t('search'))),
              OutlinedButton(
                  onPressed: _busy ? null : () => _search(offline: true),
                  child: Text(_l('仅查本地', 'Search local only'))),
            ]),
            ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: Text(
                    '${_l('本地身份索引', 'Local identity index')} · $_indexCount'),
                children: [
                  Text(_l('在线命中后自动记录；也可跨设备导入／导出。未收录无法离线查询，作品预览需联网。',
                      'Online matches are cached. Import/export across devices. Unindexed profiles and previews cannot be looked up offline.')),
                  _actions([
                    OutlinedButton(
                        onPressed: _busy ? null : _import,
                        child: Text(_l('导入索引 JSON', 'Import index JSON'))),
                    Builder(
                        builder: (anchor) => OutlinedButton(
                            onPressed: _busy || _indexCount == 0
                                ? null
                                : () async {
                                    try {
                                      final body = encodeArtistIndex(
                                          await _index.load());
                                      if (anchor.mounted) {
                                        await _share(
                                            anchor,
                                            'artist-identity-index.json',
                                            'application/json',
                                            body);
                                      }
                                    } catch (_) {
                                      if (mounted) {
                                        setState(() => _notice = _l('无法导出索引。',
                                            'Could not export the index.'));
                                      }
                                    }
                                  },
                            child: Text(_l('导出索引 JSON', 'Export index JSON')))),
                  ]),
                ]),
            if (_busy) const LinearProgressIndicator(),
            if (_notice.isNotEmpty)
              Semantics(liveRegion: true, child: Text(_notice)),
          ]),
          if (prompt.isNotEmpty)
            _card([
              Text(_l('画师串', 'Artist prompt'),
                  style: Theme.of(context).textTheme.titleMedium),
              _actions([
                ChoiceChip(
                    label: const Text('NAI V5'),
                    selected: _v5,
                    onSelected: (_) => setState(() => _v5 = true)),
                ChoiceChip(
                    label: const Text('NAI 4.5'),
                    selected: !_v5,
                    onSelected: (_) => setState(() => _v5 = false)),
              ]),
              for (final tag in _weights.keys)
                Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: TextFormField(
                      key: ValueKey('weight:$tag'),
                      initialValue: _weights[tag].toString(),
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      decoration: InputDecoration(
                          labelText: '${_l('权重', 'Weight')} · $tag',
                          helperText: '0.01–5'),
                      onChanged: (input) => setState(
                          () => _weights[tag] = double.tryParse(input) ?? 1),
                    )),
              SelectableText(prompt),
              _actions([
                FilledButton.tonalIcon(
                    onPressed: () => _copy(prompt),
                    icon: const Icon(Icons.copy),
                    label: Text(_l('复制画师串', 'Copy prompt'))),
                Builder(
                    builder: (anchor) => OutlinedButton(
                        onPressed: () => _share(anchor, 'nai-artist-prompt.txt',
                            'text/plain', '$prompt\n'),
                        child: Text(_l('导出 TXT', 'Export TXT')))),
              ]),
            ]),
          for (final result in _results) _result(result),
        ],
      ),
    );
  }
}
