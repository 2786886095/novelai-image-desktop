import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/proxy_http_client.dart';
import '../state/app_state.dart';
import '../tags/multilingual_tag_packs.dart';

const _text = {
  'zh-CN': [
    '离线 Tag 词库',
    '数据更新',
    '当前词库',
    '未下载',
    '下载并启用',
    '启用已下载词包',
    '正在下载或校验…',
    '安装失败，当前词库不变。',
    '每包词条'
  ],
  'zh-TW': [
    '離線 Tag 詞庫',
    '資料更新',
    '目前詞庫',
    '未下載',
    '下載並啟用',
    '啟用已下載詞包',
    '下載或驗證中…',
    '安裝失敗，目前詞庫不變。',
    '每包詞條'
  ],
  'en-US': [
    'Offline Tag dictionary',
    'Updated',
    'Active dictionary',
    'Not downloaded',
    'Download and activate',
    'Activate downloaded pack',
    'Downloading or verifying…',
    'Installation failed; the active dictionary is unchanged.',
    'Tags per pack'
  ],
  'ja-JP': [
    'オフラインタグ辞書',
    '更新日',
    '有効な辞書',
    '未ダウンロード',
    'ダウンロードして有効化',
    'ダウンロード済みの辞書を有効化',
    'ダウンロードまたは検証中…',
    'インストールできませんでした。有効な辞書は変わりません。',
    'タグ数'
  ],
  'ko-KR': [
    '오프라인 태그 사전',
    '업데이트',
    '사용 중인 사전',
    '미다운로드',
    '다운로드 및 활성화',
    '다운로드한 팩 활성화',
    '다운로드 또는 검증 중…',
    '설치 실패. 사용 중인 사전은 변경되지 않았습니다.',
    '팩당 태그 수'
  ],
};
List<String> _labels(String language) => _text[language] ?? _text['zh-CN']!;
String tagPackSelectorTitle(String language) => _labels(language).first;

Future<void> openTagPackSelector(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => const FractionallySizedBox(
        heightFactor: 0.86,
        child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(16, 0, 16, 24),
            child: TagPackSelector())),
  );
}

class TagPackSelector extends StatefulWidget {
  const TagPackSelector({super.key});
  @override
  State<TagPackSelector> createState() => _TagPackSelectorState();
}

class _TagPackSelectorState extends State<TagPackSelector> {
  String? _selected;

  @override
  void initState() {
    super.initState();
    context.read<AppState>().multilingualTags.load();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.read<AppState>();
    final l = _labels(
        context.select<AppState, String>((value) => value.settings.language));
    final store = app.multilingualTags;
    return ListenableBuilder(
        listenable: store,
        builder: (context, _) {
          final lang = _selected ??
              store.active ??
              (tagPackNames.containsKey(app.settings.language)
                  ? app.settings.language
                  : 'zh-CN');
          final theme = Theme.of(context);
          return Card(
            child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(l[0], style: theme.textTheme.titleLarge),
                    if (store.updatedAt.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                          '${l[1]}: ${store.updatedAt} · ${l[8]} ${store.count(lang)}',
                          style: theme.textTheme.bodySmall),
                      const SizedBox(height: 10),
                      for (final entry in tagPackNames.entries)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: OutlinedButton(
                            style: entry.key == lang
                                ? OutlinedButton.styleFrom(
                                    backgroundColor:
                                        theme.colorScheme.secondaryContainer,
                                    foregroundColor:
                                        theme.colorScheme.onSecondaryContainer)
                                : null,
                            onPressed: store.busy
                                ? null
                                : () => setState(() => _selected = entry.key),
                            child: Row(children: [
                              Icon(
                                  entry.key == lang
                                      ? Icons.radio_button_checked
                                      : Icons.radio_button_unchecked,
                                  size: 18),
                              const SizedBox(width: 8),
                              Expanded(child: Text(entry.value)),
                              Text(
                                  '${(store.size(entry.key) / 1048576).toStringAsFixed(1)} MiB',
                                  style: theme.textTheme.labelSmall),
                            ]),
                          ),
                        ),
                      const SizedBox(height: 4),
                      Semantics(
                          liveRegion: true,
                          child: Text(
                              '${l[2]}: ${tagPackNames[store.active] ?? l[3]}')),
                      const SizedBox(height: 8),
                      if (store.busy) ...[
                        LinearProgressIndicator(
                            value: store.progress, semanticsLabel: l[6]),
                        const SizedBox(height: 8),
                      ],
                      FilledButton(
                        onPressed: store.busy || store.active == lang
                            ? null
                            : () => store.install(
                                lang,
                                () => createProxyHttpClient(app.settings,
                                    scope: ProxyScope.update)),
                        child: Text(store.busy
                            ? l[6]
                            : store.installed.contains(lang)
                                ? l[5]
                                : l[4]),
                      ),
                    ],
                    if (store.error != null)
                      Semantics(
                          liveRegion: true,
                          child: Text(l[7],
                              style:
                                  TextStyle(color: theme.colorScheme.error))),
                  ],
                )),
          );
        });
  }
}
