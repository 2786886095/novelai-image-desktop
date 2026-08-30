import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../i18n/app_locales.dart';
import '../services/resource_database_service.dart';
import '../state/app_state.dart';

class _ResourceText {
  final String title;
  final String description;
  final String path;
  final String copied;
  final String installed;
  final String notInstalled;
  final String invalid;
  final String install;
  final String replace;
  final String restore;
  final String delete;
  final String pause;
  final String resume;
  final String source;
  final String confirmTitle;
  final String confirmBody;
  final String restoreTitle;
  final String restoreBody;
  final String deleteTitle;
  final String deleteBody;
  final String cancel;
  final String confirm;
  final String cache;
  final String clearCache;
  final String refresh;
  final String downloading;
  final String verifying;
  final String extracting;
  final String installing;
  final String complete;
  final String paused;
  final String records;

  const _ResourceText({
    required this.title,
    required this.description,
    required this.path,
    required this.copied,
    required this.installed,
    required this.notInstalled,
    required this.invalid,
    required this.install,
    required this.replace,
    required this.restore,
    required this.delete,
    required this.pause,
    required this.resume,
    required this.source,
    required this.confirmTitle,
    required this.confirmBody,
    required this.restoreTitle,
    required this.restoreBody,
    required this.deleteTitle,
    required this.deleteBody,
    required this.cancel,
    required this.confirm,
    required this.cache,
    required this.clearCache,
    required this.refresh,
    required this.downloading,
    required this.verifying,
    required this.extracting,
    required this.installing,
    required this.complete,
    required this.paused,
    required this.records,
  });
}

_ResourceText _resourceText(Object? language) {
  switch (normalizeAppLocaleCode(language)) {
    case 'zh-TW':
      return const _ResourceText(
        title: '資料與儲存',
        description: '管理本機標籤資料庫、相關標籤資料與查詢快取。',
        path: '資料儲存路徑',
        copied: '路徑已複製',
        installed: '已安裝',
        notInstalled: '未安裝',
        invalid: '需要修復',
        install: '安裝',
        replace: '更新 / 取代',
        restore: '恢復上一版',
        delete: '刪除',
        pause: '暫停',
        resume: '繼續',
        source: '來源與授權',
        confirmTitle: '取代本機資料庫？',
        confirmBody: '只有在你確認後才會取代這個本機資源資料庫。圖片、參考圖、預設、歷史與備份資料都不會被覆蓋。',
        restoreTitle: '恢復上一版資料庫？',
        restoreBody: '這會取代目前資源資料庫，但不會改動任何使用者圖片或記錄。',
        deleteTitle: '刪除本機資料庫？',
        deleteBody: '只會刪除下載的資源資料庫與續傳檔案。',
        cancel: '取消',
        confirm: '確認',
        cache: '查詢快取',
        clearCache: '清除快取',
        refresh: '重新掃描',
        downloading: '正在下載',
        verifying: '正在校驗',
        extracting: '正在解壓縮',
        installing: '正在安裝',
        complete: '已完成',
        paused: '已暫停',
        records: '筆資料',
      );
    case 'en-US':
      return const _ResourceText(
        title: 'Data & Storage',
        description:
            'Manage local tag databases, related-tag data, and query cache.',
        path: 'Data directory',
        copied: 'Path copied',
        installed: 'Installed',
        notInstalled: 'Not installed',
        invalid: 'Repair required',
        install: 'Install',
        replace: 'Update / Replace',
        restore: 'Restore previous',
        delete: 'Delete',
        pause: 'Pause',
        resume: 'Resume',
        source: 'Source & license',
        confirmTitle: 'Replace the local database?',
        confirmBody:
            'This local resource database is replaced only after you confirm. Images, references, presets, history, and backup data are never overwritten.',
        restoreTitle: 'Restore the previous database?',
        restoreBody:
            'This replaces only the current resource database and does not touch user images or records.',
        deleteTitle: 'Delete the local database?',
        deleteBody:
            'Only downloaded resource databases and resumable files are removed.',
        cancel: 'Cancel',
        confirm: 'Confirm',
        cache: 'Query cache',
        clearCache: 'Clear cache',
        refresh: 'Rescan',
        downloading: 'Downloading',
        verifying: 'Verifying',
        extracting: 'Extracting',
        installing: 'Installing',
        complete: 'Complete',
        paused: 'Paused',
        records: 'records',
      );
    case 'ja-JP':
      return const _ResourceText(
        title: 'データとストレージ',
        description: 'ローカルタグ DB、関連タグ DB、検索キャッシュを管理します。',
        path: 'データ保存先',
        copied: 'パスをコピーしました',
        installed: 'インストール済み',
        notInstalled: '未インストール',
        invalid: '修復が必要',
        install: 'インストール',
        replace: '更新 / 置換',
        restore: '前の版へ戻す',
        delete: '削除',
        pause: '一時停止',
        resume: '再開',
        source: '配布元とライセンス',
        confirmTitle: 'ローカル DB を置き換えますか？',
        confirmBody: '確認後にこのリソース DB だけを置き換えます。画像、参照画像、プリセット、履歴、バックアップは上書きしません。',
        restoreTitle: '前の DB を復元しますか？',
        restoreBody: '現在のリソース DB のみを置き換え、ユーザー画像や履歴には触れません。',
        deleteTitle: 'ローカル DB を削除しますか？',
        deleteBody: 'ダウンロード済み DB と再開用ファイルだけを削除します。',
        cancel: 'キャンセル',
        confirm: '確認',
        cache: '検索キャッシュ',
        clearCache: 'キャッシュを消去',
        refresh: '再スキャン',
        downloading: 'ダウンロード中',
        verifying: '検証中',
        extracting: '展開中',
        installing: 'インストール中',
        complete: '完了',
        paused: '一時停止中',
        records: '件',
      );
    case 'ko-KR':
      return const _ResourceText(
        title: '데이터 및 저장소',
        description: '로컬 태그 DB, 연관 태그 DB와 검색 캐시를 관리합니다.',
        path: '데이터 저장 경로',
        copied: '경로가 복사되었습니다',
        installed: '설치됨',
        notInstalled: '설치되지 않음',
        invalid: '복구 필요',
        install: '설치',
        replace: '업데이트 / 교체',
        restore: '이전 버전 복원',
        delete: '삭제',
        pause: '일시 정지',
        resume: '계속',
        source: '출처 및 라이선스',
        confirmTitle: '로컬 DB를 교체할까요?',
        confirmBody:
            '확인한 경우에만 이 리소스 DB를 교체합니다. 이미지, 참조 이미지, 프리셋, 기록과 백업은 덮어쓰지 않습니다.',
        restoreTitle: '이전 DB를 복원할까요?',
        restoreBody: '현재 리소스 DB만 교체하며 사용자 이미지나 기록은 변경하지 않습니다.',
        deleteTitle: '로컬 DB를 삭제할까요?',
        deleteBody: '다운로드한 리소스 DB와 이어받기 파일만 삭제합니다.',
        cancel: '취소',
        confirm: '확인',
        cache: '검색 캐시',
        clearCache: '캐시 지우기',
        refresh: '다시 검색',
        downloading: '다운로드 중',
        verifying: '검증 중',
        extracting: '압축 해제 중',
        installing: '설치 중',
        complete: '완료',
        paused: '일시 정지됨',
        records: '개',
      );
    default:
      return const _ResourceText(
        title: '数据与存储',
        description: '管理本地标签数据库、相关标签数据与查询缓存。',
        path: '数据存储路径',
        copied: '路径已复制',
        installed: '已安装',
        notInstalled: '未安装',
        invalid: '需要修复',
        install: '安装',
        replace: '更新 / 替换',
        restore: '恢复上一版',
        delete: '删除',
        pause: '暂停',
        resume: '继续',
        source: '来源与许可',
        confirmTitle: '替换本地数据库？',
        confirmBody: '只有在你确认后才会替换这个本地资源数据库。图片、参考图、预设、历史和备份数据都不会被覆盖。',
        restoreTitle: '恢复上一版数据库？',
        restoreBody: '这会替换当前资源数据库，但不会改动任何用户图片或记录。',
        deleteTitle: '删除本地数据库？',
        deleteBody: '只会删除下载的资源数据库和续传文件。',
        cancel: '取消',
        confirm: '确认',
        cache: '查询缓存',
        clearCache: '清除缓存',
        refresh: '重新扫描',
        downloading: '正在下载',
        verifying: '正在校验',
        extracting: '正在解压',
        installing: '正在安装',
        complete: '已完成',
        paused: '已暂停',
        records: '条数据',
      );
  }
}

String _bytes(int value) {
  if (value >= 1024 * 1024 * 1024)
    return '${(value / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
  if (value >= 1024 * 1024)
    return '${(value / (1024 * 1024)).toStringAsFixed(1)} MB';
  if (value >= 1024) return '${(value / 1024).toStringAsFixed(1)} KB';
  return '$value B';
}

class ResourceDatabaseSettingsPanel extends StatefulWidget {
  const ResourceDatabaseSettingsPanel({super.key});

  @override
  State<ResourceDatabaseSettingsPanel> createState() =>
      _ResourceDatabaseSettingsPanelState();
}

class _ResourceDatabaseSettingsPanelState
    extends State<ResourceDatabaseSettingsPanel> {
  final service = ResourceDatabaseService.shared;
  ResourceDatabaseOverview? overview;
  final Map<ResourceDatabaseId, ResourceDatabaseProgress> progress = {};
  StreamSubscription<ResourceDatabaseProgress>? subscription;
  final Set<ResourceDatabaseId> busy = {};

  @override
  void initState() {
    super.initState();
    subscription = service.progress.listen((event) {
      if (!mounted) return;
      setState(() => progress[event.id] = event);
      if (event.phase == ResourceDownloadPhase.complete ||
          event.phase == ResourceDownloadPhase.error ||
          event.phase == ResourceDownloadPhase.paused) {
        _load();
      }
    });
    _load();
  }

  @override
  void dispose() {
    subscription?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final value = await service.overview();
    if (mounted) setState(() => overview = value);
  }

  Future<bool> _confirm(String title, String body, _ResourceText text) async =>
      await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(title),
          content: Text(body),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(text.cancel),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text(text.confirm),
            ),
          ],
        ),
      ) ??
      false;

  Future<void> _install(
      ResourceDatabaseStatus status, _ResourceText text) async {
    if (!await _confirm(text.confirmTitle, text.confirmBody, text)) return;
    setState(() => busy.add(status.definition.id));
    try {
      final message = await service.install(status.definition.id);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(message)));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => busy.remove(status.definition.id));
      await _load();
    }
  }

  Future<void> _restore(
      ResourceDatabaseStatus status, _ResourceText text) async {
    if (!await _confirm(text.restoreTitle, text.restoreBody, text)) return;
    setState(() => busy.add(status.definition.id));
    try {
      final message = await service.restorePrevious(status.definition.id);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(message)));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => busy.remove(status.definition.id));
      await _load();
    }
  }

  Future<void> _delete(
      ResourceDatabaseStatus status, _ResourceText text) async {
    if (!await _confirm(text.deleteTitle, text.deleteBody, text)) return;
    await service.delete(status.definition.id);
    await _load();
  }

  String _phase(ResourceDatabaseProgress value, _ResourceText text) =>
      switch (value.phase) {
        ResourceDownloadPhase.downloading => text.downloading,
        ResourceDownloadPhase.verifying => text.verifying,
        ResourceDownloadPhase.extracting => text.extracting,
        ResourceDownloadPhase.installing => text.installing,
        ResourceDownloadPhase.complete => text.complete,
        ResourceDownloadPhase.paused => text.paused,
        ResourceDownloadPhase.error => value.message,
        _ => '',
      };

  @override
  Widget build(BuildContext context) {
    final language =
        context.select<AppState, String>((state) => state.settings.language);
    final text = _resourceText(language);
    return Card(
      margin: const EdgeInsets.only(top: 12),
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        title: Text(text.title, style: Theme.of(context).textTheme.titleMedium),
        shape: const Border(),
        collapsedShape: const Border(),
        childrenPadding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        children: [
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: Text(text.description,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    )),
          ),
          const SizedBox(height: 12),
          if (overview == null)
            const Padding(
              padding: EdgeInsets.all(20),
              child: CircularProgressIndicator(),
            )
          else ...[
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.folder_outlined),
              title: Text(text.path),
              subtitle: Text(overview!.dataDirectory,
                  maxLines: 2, overflow: TextOverflow.ellipsis),
              trailing: IconButton(
                tooltip: text.copied,
                onPressed: () {
                  Clipboard.setData(
                      ClipboardData(text: overview!.dataDirectory));
                  ScaffoldMessenger.of(context)
                      .showSnackBar(SnackBar(content: Text(text.copied)));
                },
                icon: const Icon(Icons.copy_outlined),
              ),
            ),
            const Divider(),
            for (final status in overview!.resources) ...[
              _ResourceRow(
                status: status,
                event: progress[status.definition.id],
                text: text,
                phaseLabel: progress[status.definition.id] == null
                    ? ''
                    : _phase(progress[status.definition.id]!, text),
                busy: busy.contains(status.definition.id),
                onInstall: () => _install(status, text),
                onPause: () => service.pause(status.definition.id),
                onRestore: () => _restore(status, text),
                onDelete: () => _delete(status, text),
              ),
              if (status != overview!.resources.last) const Divider(height: 28),
            ],
            const Divider(height: 30),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.memory_outlined),
              title: Text(text.cache),
              subtitle: Text(
                '${overview!.memoryEntries} ${text.records} · ${(overview!.memoryHitRate * 100).toStringAsFixed(1)}%',
              ),
              trailing: IconButton(
                tooltip: text.clearCache,
                onPressed: () {
                  service.clearMemoryCache();
                  _load();
                },
                icon: const Icon(Icons.delete_sweep_outlined),
              ),
            ),
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: TextButton.icon(
                onPressed: _load,
                icon: const Icon(Icons.refresh),
                label: Text(text.refresh),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ResourceRow extends StatelessWidget {
  final ResourceDatabaseStatus status;
  final ResourceDatabaseProgress? event;
  final _ResourceText text;
  final String phaseLabel;
  final bool busy;
  final VoidCallback onInstall;
  final VoidCallback onPause;
  final VoidCallback onRestore;
  final VoidCallback onDelete;

  const _ResourceRow({
    required this.status,
    required this.event,
    required this.text,
    required this.phaseLabel,
    required this.busy,
    required this.onInstall,
    required this.onPause,
    required this.onRestore,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final active = event != null &&
        const {
          ResourceDownloadPhase.downloading,
          ResourceDownloadPhase.verifying,
          ResourceDownloadPhase.extracting,
          ResourceDownloadPhase.installing,
        }.contains(event!.phase);
    final state = !status.installed
        ? text.notInstalled
        : status.valid
            ? text.installed
            : text.invalid;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(
              status.definition.id == ResourceDatabaseId.tagCatalog
                  ? Icons.sell_outlined
                  : Icons.hub_outlined,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(status.definition.label,
                    style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 3),
                Text(status.definition.description,
                    style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 5),
                Text(
                  '$state${status.version.isEmpty ? '' : ' · ${status.version}'}${status.count <= 0 ? '' : ' · ${status.count} ${text.records}'} · ${_bytes(status.sizeBytes > 0 ? status.sizeBytes : status.definition.databaseSize)}',
                  style: Theme.of(context).textTheme.labelMedium,
                ),
                if (status.message.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(status.message,
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error)),
                ],
              ],
            ),
          ),
        ]),
        if (event != null && event!.phase != ResourceDownloadPhase.idle) ...[
          const SizedBox(height: 10),
          LinearProgressIndicator(
            value: active && event!.totalBytes > 0 ? event!.percent : null,
          ),
          const SizedBox(height: 5),
          Text(
            '$phaseLabel · ${_bytes(event!.receivedBytes)} / ${_bytes(event!.totalBytes)}${event!.speedBytesPerSecond > 0 ? ' · ${_bytes(event!.speedBytesPerSecond.round())}/s' : ''}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ] else if (status.resumableBytes > 0) ...[
          const SizedBox(height: 7),
          Text('${text.paused} · ${_bytes(status.resumableBytes)}',
              style: Theme.of(context).textTheme.bodySmall),
        ],
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          if (active && event!.phase == ResourceDownloadPhase.downloading)
            OutlinedButton.icon(
              onPressed: onPause,
              icon: const Icon(Icons.pause),
              label: Text(text.pause),
            )
          else
            FilledButton.tonalIcon(
              onPressed: busy ? null : onInstall,
              icon: Icon(status.resumableBytes > 0
                  ? Icons.play_arrow
                  : status.installed
                      ? Icons.sync
                      : Icons.download_outlined),
              label: Text(status.resumableBytes > 0
                  ? text.resume
                  : status.installed
                      ? text.replace
                      : text.install),
            ),
          if (status.hasPrevious)
            OutlinedButton.icon(
              onPressed: busy || active ? null : onRestore,
              icon: const Icon(Icons.restore),
              label: Text(text.restore),
            ),
          if (status.installed || status.resumableBytes > 0)
            IconButton.outlined(
              tooltip: text.delete,
              onPressed: busy || active ? null : onDelete,
              icon: const Icon(Icons.delete_outline),
            ),
          TextButton.icon(
            onPressed: () => launchUrl(Uri.parse(status.definition.sourceUrl),
                mode: LaunchMode.externalApplication),
            icon: const Icon(Icons.open_in_new, size: 18),
            label: Text(text.source),
          ),
        ]),
      ],
    );
  }
}
