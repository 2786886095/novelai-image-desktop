import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/proxy_http_client.dart';
import '../services/tag_asset_download.dart';
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
    '每包词条',
    '进度已保留，正在自动续传',
    '网络中断，正在自动重试',
    '进度已保留。网络恢复后，点“下载并启用”即可继续。',
    '网络暂不可用，请稍后再试。'
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
    '每包詞條',
    '進度已保留，正在自動續傳',
    '網路中斷，正在自動重試',
    '進度已保留。網路恢復後，點「下載並啟用」即可繼續。',
    '網路暫不可用，請稍後再試。'
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
    'Tags per pack',
    'Progress saved. Resuming automatically',
    'Connection interrupted. Retrying automatically',
    'Progress saved. Select Download and activate to resume when online.',
    'Network unavailable. Please try again later.'
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
    'タグ数',
    '進捗を保存しました。自動で再開します',
    '接続が切れました。自動で再試行します',
    '進捗を保存しました。接続が戻ったらダウンロードを再開してください。',
    '接続を確認してから再試行してください。'
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
    '팩당 태그 수',
    '진행 상태를 저장했습니다. 자동으로 이어받는 중',
    '연결이 끊겼습니다. 자동 재시도 중',
    '진행 상태를 저장했습니다. 연결이 복구되면 다운로드를 눌러 이어받으세요.',
    '네트워크 연결을 확인하고 다시 시도하세요.'
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
                      if (store.busy && store.interruptedLanguage == lang && store.retryNumber > 0)
                        Semantics(liveRegion: true, child: Text(
                          '${l[store.retainedBytes > 0 ? 9 : 10]}（${store.retryNumber}/${MultilingualTagPacks.maxRetries}）')),
                      FilledButton(
                        onPressed: store.busy || store.active == lang
                            ? null
                            : () => store.install(
                                lang,
                                () => TagAssetClient((uri) => createProxyHttpClientForUri(app.settings, uri,
                                    scope: ProxyScope.update, routeTimeout: const Duration(seconds: 10)))),
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
                          child: Text(store.interruptedLanguage == lang
                              ? '${l[7]} ${l[store.retainedBytes > 0 ? 11 : 12]}'
                              : '${l[7]} ${store.error}',
                              style:
                                  TextStyle(color: theme.colorScheme.error))),
                  ],
                )),
          );
        });
  }
}
