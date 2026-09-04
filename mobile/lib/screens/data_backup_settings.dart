import 'dart:io';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../i18n/app_locales.dart';
import '../services/data_backup_service.dart';
import '../services/storage_permission.dart';
import '../state/app_state.dart';

Map<String, String> _backupText(Object? language) {
  final code = normalizeAppLocaleCode(language);
  const values = <String, Map<String, String>>{
    'zh-CN': {
      'title': '数据导入、导出与自动备份',
      'desc': '桌面、Android 与 iOS 共用 .naisbackup。默认全选，也可以排除任意数据。',
      'sensitive': 'API Token 与第三方密钥会按你的选择直接写入备份，请只交给可信设备。',
      'selectAll': '全选',
      'clear': '清空',
      'export': '导出所选数据',
      'choose': '选择备份文件',
      'import': '导入所选数据',
      'busy': '正在处理…',
      'archive': '待导入归档',
      'mergeTitle': '确认安全合并',
      'merge': '完全相同的图片按内容跳过；同名不同图添加 (1)；图片、参考预设、历史和时间分组只合并。导入前会先生成完整安全备份。',
      'overwriteTitle': '再次确认覆盖配置',
      'overwrite': '配置与 API 会覆盖现有对应值（设备路径除外）。其它数据仍不会覆盖。',
      'cancel': '取消',
      'continue': '继续',
      'confirm': '确认覆盖并导入',
      'done': '导入完成：新增 {i}，跳过 {s}，重命名 {r}。',
      'autoTitle': '自动备份',
      'auto': '启用自动备份',
      'autoDesc': '默认开启轻量备份；图片默认不自动压缩，导入前仍会额外备份。',
      'images': '自动备份包含图片和参考图',
      'interval': '间隔（小时）',
      'retention': '保留数量',
      'backupNow': '立即完整备份',
      'latest': '最近备份',
      'none': '尚无自动备份',
      'folder': '备份目录',
      'chooseFolder': '选择备份目录',
      'resetFolder': '恢复默认目录',
      'defaultFolder': '应用默认备份目录',
      'folderSaved': '备份目录已更新。',
      'fileSaved': '备份文件已保存。',
      'folderFallback': '所选目录当前不可写，已暂时使用默认目录，备份不会中断。',
      'accessContent':
          '自定义备份目录在 Android 11 及以上需要“所有文件访问权限”。授权后返回应用即可；未授权时备份仍会安全保存到应用默认目录。',
      'count': '{count} 个 · {size}',
      'configuration': '应用配置',
      'apiCredentials': 'API 与敏感数据',
      'artistLibrary': '画师串与独立收藏夹',
      'textHistory': '反推与转换历史',
      'referencePresets': '参考预设与参考图',
      'imageHistory': '本机图片与生成记录',
      'promptPresets': '提示词、风格与预设图',
      'agentWorkspace': '角色、对话、世界书、身份、预设与附件',
      'workspaceData': '工具项目与其它本机数据',
    },
    'zh-TW': {
      'title': '資料匯入、匯出與自動備份',
      'desc': '桌面、Android 與 iOS 共用 .naisbackup；預設全選。',
      'sensitive': 'API Token 與第三方金鑰會直接寫入所選備份，只交給可信裝置。',
      'selectAll': '全選',
      'clear': '清空',
      'export': '匯出所選資料',
      'choose': '選擇備份檔',
      'import': '匯入所選資料',
      'busy': '處理中…',
      'archive': '待匯入封存',
      'mergeTitle': '確認安全合併',
      'merge': '相同圖片略過；同名不同圖加 (1)；圖片、參考預設、歷史與日期群組只合併。匯入前先建立完整安全備份。',
      'overwriteTitle': '再次確認覆蓋設定',
      'overwrite': '設定與 API 會覆蓋對應值（裝置路徑除外），其它資料仍不覆蓋。',
      'cancel': '取消',
      'continue': '繼續',
      'confirm': '確認覆蓋並匯入',
      'done': '匯入完成：新增 {i}，略過 {s}，重新命名 {r}。',
      'autoTitle': '自動備份',
      'auto': '啟用自動備份',
      'autoDesc': '預設開啟輕量備份；圖片預設不自動壓縮，匯入前仍會另行備份。',
      'images': '自動備份包含圖片與參考圖',
      'interval': '間隔（小時）',
      'retention': '保留數量',
      'backupNow': '立即完整備份',
      'latest': '最近備份',
      'none': '尚無自動備份',
      'folder': '備份目錄',
      'chooseFolder': '選擇備份目錄',
      'resetFolder': '恢復預設備份目錄',
      'defaultFolder': '應用程式預設備份目錄',
      'folderSaved': '備份目錄已更新。',
      'fileSaved': '備份檔案已儲存。',
      'folderFallback': '所選目錄目前無法寫入，已暫時使用預設目錄，備份不會中斷。',
      'accessContent':
          'Android 11 以上的自訂備份目錄需要「所有檔案存取權限」。授權後返回應用即可；未授權時仍會安全備份至預設目錄。',
      'count': '{count} 個 · {size}',
      'configuration': '應用設定',
      'apiCredentials': 'API 與敏感資料',
      'artistLibrary': '畫家串與獨立收藏',
      'textHistory': '反推與轉換歷史',
      'referencePresets': '參考預設與參考圖',
      'imageHistory': '本機圖片與生成記錄',
      'promptPresets': '提示詞、風格與預設圖',
      'agentWorkspace': '角色、對話、世界書、身分、預設與附件',
      'workspaceData': '工具專案與其它本機資料',
    },
    'en-US': {
      'title': 'Data import, export & automatic backup',
      'desc':
          'One .naisbackup format for desktop, Android, and iOS. Everything is selected by default.',
      'sensitive':
          'Selected API tokens and third-party keys are written directly. Only share with trusted devices.',
      'selectAll': 'Select all',
      'clear': 'Clear',
      'export': 'Export selected data',
      'choose': 'Choose backup file',
      'import': 'Import selected data',
      'busy': 'Working…',
      'archive': 'Archive to import',
      'mergeTitle': 'Confirm safe merge',
      'merge':
          'Byte-identical images are skipped, same-name files receive (1), and images, reference presets, histories, and date groups are merge-only. A complete rescue backup is created first.',
      'overwriteTitle': 'Confirm configuration overwrite again',
      'overwrite':
          'Configuration and APIs replace matching values (device paths are preserved). Everything else remains merge-only.',
      'cancel': 'Cancel',
      'continue': 'Continue',
      'confirm': 'Overwrite settings and import',
      'done': 'Import complete: {i} added, {s} skipped, {r} renamed.',
      'autoTitle': 'Automatic backup',
      'auto': 'Enable automatic backup',
      'autoDesc':
          'Lightweight backups are on by default; images are opt-in and imports still create a rescue copy.',
      'images': 'Include images and references',
      'interval': 'Interval (hours)',
      'retention': 'Backups to keep',
      'backupNow': 'Create full backup now',
      'latest': 'Latest backup',
      'none': 'No automatic backup yet',
      'folder': 'Backup directory',
      'chooseFolder': 'Choose backup directory',
      'resetFolder': 'Restore default directory',
      'defaultFolder': 'App default backup directory',
      'folderSaved': 'Backup directory updated.',
      'fileSaved': 'Backup file saved.',
      'folderFallback':
          'The selected directory is not writable. The default directory is being used so backups continue.',
      'accessContent':
          'Custom backup directories require “All files access” on Android 11+. Return after authorizing; without it, backups continue safely in the app default directory.',
      'count': '{count} files · {size}',
      'configuration': 'Application configuration',
      'apiCredentials': 'APIs and sensitive data',
      'artistLibrary': 'Artist strings and separate favorites',
      'textHistory': 'Reverse and conversion history',
      'referencePresets': 'Reference presets and images',
      'imageHistory': 'Local images and generation history',
      'promptPresets': 'Prompt/style presets and previews',
      'agentWorkspace': 'Characters, chats, lorebooks, personas, presets, and attachments',
      'workspaceData': 'Tool projects and other local data',
    },
    'ja-JP': {
      'title': 'データ入出力と自動バックアップ',
      'desc': 'デスクトップ・Android・iOS 共通の .naisbackup。初期状態は全選択です。',
      'sensitive': '選択した API Token と外部キーは直接保存されます。信頼できる端末だけで共有してください。',
      'selectAll': '全選択',
      'clear': '解除',
      'export': '選択データを書き出す',
      'choose': 'バックアップを選択',
      'import': '選択データを読み込む',
      'busy': '処理中…',
      'archive': '読み込み対象',
      'mergeTitle': '安全マージを確認',
      'merge':
          '同一画像はスキップ、同名別画像は (1) を追加し、画像・参照プリセット・履歴・日付グループはマージのみです。先に完全バックアップを作成します。',
      'overwriteTitle': '設定上書きを再確認',
      'overwrite': '設定/API は対応値を上書きします（端末パスを除く）。その他はマージのみです。',
      'cancel': 'キャンセル',
      'continue': '続行',
      'confirm': '上書きを確認して読み込む',
      'done': '完了：追加 {i}、スキップ {s}、名称変更 {r}。',
      'autoTitle': '自動バックアップ',
      'auto': '自動バックアップ',
      'autoDesc': '軽量バックアップが初期状態で有効です。画像は任意で、読込前には追加コピーを作成します。',
      'images': '画像と参照画像を含める',
      'interval': '間隔（時間）',
      'retention': '保持数',
      'backupNow': '完全バックアップを作成',
      'latest': '最新',
      'none': 'バックアップなし',
      'folder': '保存先',
      'chooseFolder': '保存先を選択',
      'resetFolder': '既定の保存先に戻す',
      'defaultFolder': 'アプリの既定保存先',
      'folderSaved': '保存先を更新しました。',
      'fileSaved': 'バックアップを保存しました。',
      'folderFallback': '選択した保存先に書き込めないため、バックアップを継続できるよう既定の保存先を使用しています。',
      'accessContent':
          'Android 11 以降で任意のバックアップ先を使うには「すべてのファイルへのアクセス」が必要です。未許可でも既定の保存先へ安全にバックアップします。',
      'count': '{count} 件 · {size}',
      'configuration': 'アプリ設定',
      'apiCredentials': 'API と機密データ',
      'artistLibrary': '画家列と独立お気に入り',
      'textHistory': '逆推定・変換履歴',
      'referencePresets': '参照プリセットと画像',
      'imageHistory': 'ローカル画像と生成履歴',
      'promptPresets': 'プロンプト・スタイル・プレビュー',
      'agentWorkspace': 'キャラクター・会話・世界情報・ペルソナ・プリセット・添付',
      'workspaceData': 'ツールプロジェクトとその他データ',
    },
    'ko-KR': {
      'title': '데이터 가져오기·내보내기 및 자동 백업',
      'desc': '데스크톱·Android·iOS 공용 .naisbackup이며 기본값은 전체 선택입니다.',
      'sensitive': '선택한 API Token과 외부 키는 직접 저장됩니다. 신뢰하는 기기에서만 공유하세요.',
      'selectAll': '전체 선택',
      'clear': '해제',
      'export': '선택 데이터 내보내기',
      'choose': '백업 파일 선택',
      'import': '선택 데이터 가져오기',
      'busy': '처리 중…',
      'archive': '가져올 백업',
      'mergeTitle': '안전 병합 확인',
      'merge':
          '같은 이미지는 건너뛰고 이름만 같으면 (1)을 붙입니다. 이미지·참고 프리셋·기록·날짜 그룹은 병합만 하며 먼저 전체 안전 백업을 만듭니다.',
      'overwriteTitle': '설정 덮어쓰기 재확인',
      'overwrite': '설정/API는 대응 값을 덮어씁니다(기기 경로 제외). 나머지는 병합만 합니다.',
      'cancel': '취소',
      'continue': '계속',
      'confirm': '덮어쓰기 확인 및 가져오기',
      'done': '완료: {i}개 추가, {s}개 건너뜀, {r}개 이름 변경.',
      'autoTitle': '자동 백업',
      'auto': '자동 백업 사용',
      'autoDesc': '경량 백업이 기본으로 켜집니다. 이미지는 선택 사항이며 가져오기 전에는 추가 백업합니다.',
      'images': '이미지와 참고 이미지 포함',
      'interval': '간격(시간)',
      'retention': '보관 개수',
      'backupNow': '지금 전체 백업',
      'latest': '최근 백업',
      'none': '백업 없음',
      'folder': '백업 폴더',
      'chooseFolder': '백업 폴더 선택',
      'resetFolder': '기본 폴더로 복원',
      'defaultFolder': '앱 기본 백업 폴더',
      'folderSaved': '백업 폴더를 변경했습니다.',
      'fileSaved': '백업 파일을 저장했습니다.',
      'folderFallback': '선택한 폴더에 쓸 수 없어 백업이 중단되지 않도록 기본 폴더를 사용 중입니다.',
      'accessContent':
          'Android 11 이상에서 사용자 지정 백업 폴더를 쓰려면 “모든 파일 접근” 권한이 필요합니다. 권한이 없어도 기본 폴더에 안전하게 백업합니다.',
      'count': '{count}개 · {size}',
      'configuration': '앱 설정',
      'apiCredentials': 'API 및 민감 데이터',
      'artistLibrary': '작가 문자열과 독립 즐겨찾기',
      'textHistory': '역추론 및 변환 기록',
      'referencePresets': '참고 프리셋과 이미지',
      'imageHistory': '로컬 이미지와 생성 기록',
      'promptPresets': '프롬프트·스타일·미리보기',
      'agentWorkspace': '캐릭터·대화·로어북·페르소나·프리셋·첨부',
      'workspaceData': '도구 프로젝트 및 기타 데이터',
    },
  };
  return values[code] ?? values['zh-CN']!;
}

String _bytes(int value) {
  if (value < 1024) return '$value B';
  if (value < 1024 * 1024) return '${(value / 1024).toStringAsFixed(1)} KB';
  if (value < 1024 * 1024 * 1024) {
    return '${(value / 1024 / 1024).toStringAsFixed(1)} MB';
  }
  return '${(value / 1024 / 1024 / 1024).toStringAsFixed(2)} GB';
}

class DataBackupSettingsPanel extends StatefulWidget {
  final String? initialBackupPath;
  final bool initiallyExpanded;
  final bool importOnly;

  const DataBackupSettingsPanel({
    super.key,
    this.initialBackupPath,
    this.initiallyExpanded = false,
    this.importOnly = false,
  });

  @override
  State<DataBackupSettingsPanel> createState() =>
      _DataBackupSettingsPanelState();
}

class _DataBackupSettingsPanelState extends State<DataBackupSettingsPanel>
    with WidgetsBindingObserver {
  Set<DataBackupCategory> exportSelection = DataBackupCategory.values.toSet();
  Set<DataBackupCategory> importSelection = {};
  DataBackupInspection? inspection;
  DataBackupStatus? backupStatus;
  String? inspectionError;
  bool busy = false;

  DataBackupService get service =>
      DataBackupService(context.read<AppState>().storage);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refreshStatus();
      final path = widget.initialBackupPath?.trim();
      if (path != null && path.isNotEmpty) _inspectPath(path);
    });
  }

  @override
  void didUpdateWidget(covariant DataBackupSettingsPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    final path = widget.initialBackupPath?.trim();
    if (path != null &&
        path.isNotEmpty &&
        path != oldWidget.initialBackupPath?.trim()) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _inspectPath(path));
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refreshStatus();
  }

  Future<void> _refreshStatus() async {
    try {
      final value = await service.status();
      if (mounted) setState(() => backupStatus = value);
    } catch (_) {}
  }

  void _message(String value) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(value)));
  }

  Future<bool> _confirm(String title, String message, String action,
      {bool destructive = false}) async {
    return await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            icon: Icon(destructive
                ? Icons.warning_amber_rounded
                : Icons.restore_rounded),
            title: Text(title),
            content: Text(message),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: Text(_backupText(
                    context.read<AppState>().settings.language)['cancel']!),
              ),
              destructive
                  ? FilledButton(
                      style: FilledButton.styleFrom(
                          backgroundColor: Theme.of(context).colorScheme.error),
                      onPressed: () => Navigator.pop(context, true),
                      child: Text(action),
                    )
                  : FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: Text(action),
                    ),
            ],
          ),
        ) ??
        false;
  }

  Future<void> _export(Map<String, String> text) async {
    if (exportSelection.isEmpty) return;
    setState(() => busy = true);
    try {
      final file = await service.createBackup(exportSelection);
      final path = await service.saveBackupFile(
        file,
        dialogTitle: text['export'],
      );
      if (path != null) _message(text['fileSaved']!);
    } catch (error) {
      _message(error.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _chooseBackupDirectory(Map<String, String> text) async {
    final app = context.read<AppState>();
    setState(() => busy = true);
    try {
      final selected = await service.chooseBackupDirectory(
        dialogTitle: text['chooseFolder'],
      );
      if (selected == null) return;
      await app.setSettings((settings) => settings.backupDir = selected);
      if (!await StoragePermission.hasAllFilesAccess() && mounted) {
        final detail = settingsDetailTextFor(app.settings.language);
        final authorize = await showDialog<bool>(
              context: context,
              builder: (context) => AlertDialog(
                title: Text(detail.fileAccessTitle),
                content: Text(text['accessContent']!),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: Text(detail.later),
                  ),
                  FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: Text(detail.authorize),
                  ),
                ],
              ),
            ) ??
            false;
        if (authorize) await StoragePermission.requestAllFilesAccess();
      }
      await _refreshStatus();
      _message(text['folderSaved']!);
    } catch (error) {
      _message(error.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _resetBackupDirectory(Map<String, String> text) async {
    final app = context.read<AppState>();
    setState(() => busy = true);
    try {
      await app.setSettings((settings) => settings.backupDir = '');
      await _refreshStatus();
      _message(text['folderSaved']!);
    } catch (error) {
      _message(error.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _choose() async {
    setState(() => busy = true);
    try {
      final path = await service.pickBackupFile();
      if (path == null) return;
      await _inspectPath(path, managesBusyState: false);
    } catch (error) {
      if (mounted) setState(() => inspectionError = error.toString());
      _message(error.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _inspectPath(
    String path, {
    bool managesBusyState = true,
  }) async {
    if (managesBusyState && mounted) setState(() => busy = true);
    if (mounted) {
      setState(() {
        inspectionError = null;
        inspection = null;
        importSelection = {};
      });
    }
    try {
      final value = await service.inspect(path);
      if (!mounted) return;
      setState(() {
        inspection = value;
        importSelection =
            value.categories.map((summary) => summary.category).toSet();
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => inspectionError = error.toString());
      _message(error.toString());
    } finally {
      if (managesBusyState && mounted) setState(() => busy = false);
    }
  }

  Future<void> _import(Map<String, String> text) async {
    final source = inspection;
    final app = context.read<AppState>();
    if (source == null || importSelection.isEmpty) return;
    if (!await _confirm(
        text['mergeTitle']!, text['merge']!, text['continue']!)) {
      return;
    }
    final overwrites =
        importSelection.contains(DataBackupCategory.configuration) ||
            importSelection.contains(DataBackupCategory.apiCredentials);
    if (overwrites &&
        !await _confirm(
            text['overwriteTitle']!, text['overwrite']!, text['confirm']!,
            destructive: true)) {
      return;
    }
    setState(() => busy = true);
    try {
      final report = await service.importBackup(
        source.path,
        importSelection,
        confirmConfigurationOverwrite: overwrites,
      );
      await app.load();
      _message(text['done']!
          .replaceAll('{i}', '${report.imported}')
          .replaceAll('{s}', '${report.skipped}')
          .replaceAll('{r}', '${report.renamed}'));
      await _refreshStatus();
    } catch (error) {
      _message(error.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _backupNow() async {
    setState(() => busy = true);
    try {
      final file = await service.runAutomaticBackup(force: true);
      if (file != null) _message(file.path);
      await _refreshStatus();
    } catch (error) {
      _message(error.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget _categoryList(
    Map<String, String> text,
    Set<DataBackupCategory> selection,
    ValueChanged<Set<DataBackupCategory>> onChanged, {
    List<DataBackupCategorySummary>? summaries,
  }) {
    final summaryMap = {
      for (final summary in summaries ?? const <DataBackupCategorySummary>[])
        summary.category: summary,
    };
    final available = summaries == null
        ? DataBackupCategory.values
        : summaries.map((summary) => summary.category);
    return Column(
      children: available.map((category) {
        final summary = summaryMap[category];
        return CheckboxListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          value: selection.contains(category),
          title: Text(text[category.id]!),
          subtitle: summary == null
              ? null
              : Text('${summary.items} · ${_bytes(summary.bytes)}'),
          onChanged: busy
              ? null
              : (checked) {
                  final next = {...selection};
                  checked == true ? next.add(category) : next.remove(category);
                  onChanged(next);
                },
        );
      }).toList(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final text = _backupText(app.settings.language);
    final status = backupStatus;
    final intervalOptions = <int>{
      1,
      6,
      12,
      24,
      72,
      168,
      app.settings.autoBackupIntervalHours,
    }.toList()
      ..sort();
    final retentionOptions = <int>{
      1,
      3,
      7,
      14,
      30,
      50,
      app.settings.autoBackupRetentionCount,
    }.toList()
      ..sort();
    return Card(
      margin: const EdgeInsets.only(top: 12),
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        initiallyExpanded: widget.initiallyExpanded || widget.importOnly,
        title: Text(text['title']!,
            style: Theme.of(context).textTheme.titleMedium),
        shape: const Border(),
        collapsedShape: const Border(),
        childrenPadding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        children: [
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: Text(
              text['desc']!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
          ),
          const SizedBox(height: 12),
          DecoratedBox(
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.errorContainer,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child:
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Icons.key_rounded,
                    size: 20,
                    color: Theme.of(context).colorScheme.onErrorContainer),
                const SizedBox(width: 8),
                Expanded(child: Text(text['sensitive']!)),
              ]),
            ),
          ),
          if (!widget.importOnly) ...[
            const SizedBox(height: 8),
            Row(mainAxisAlignment: MainAxisAlignment.end, children: [
              TextButton(
                onPressed: busy
                    ? null
                    : () => setState(() =>
                        exportSelection = DataBackupCategory.values.toSet()),
                child: Text(text['selectAll']!),
              ),
              TextButton(
                onPressed:
                    busy ? null : () => setState(() => exportSelection = {}),
                child: Text(text['clear']!),
              ),
            ]),
            _categoryList(text, exportSelection,
                (value) => setState(() => exportSelection = value)),
            const SizedBox(height: 10),
            Wrap(spacing: 8, runSpacing: 8, children: [
              FilledButton.icon(
                onPressed: busy || exportSelection.isEmpty
                    ? null
                    : () => _export(text),
                icon: const Icon(Icons.archive_rounded),
                label: Text(busy ? text['busy']! : text['export']!),
              ),
              OutlinedButton.icon(
                onPressed: busy ? null : _choose,
                icon: const Icon(Icons.upload_file_rounded),
                label: Text(text['choose']!),
              ),
            ]),
          ],
          if (widget.importOnly && busy && inspection == null) ...[
            const SizedBox(height: 16),
            const LinearProgressIndicator(),
            const SizedBox(height: 8),
            Text(text['busy']!, textAlign: TextAlign.center),
          ],
          if (inspectionError != null) ...[
            const SizedBox(height: 16),
            DecoratedBox(
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.errorContainer,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.error_outline_rounded,
                        color: Theme.of(context).colorScheme.onErrorContainer),
                    const SizedBox(width: 8),
                    Expanded(child: Text(inspectionError!)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: busy ? null : _choose,
              icon: const Icon(Icons.folder_open_rounded),
              label: Text(text['choose']!),
            ),
          ],
          if (inspection != null) ...[
            const Divider(height: 28),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.inventory_2_rounded),
              title: Text(text['archive']!),
              subtitle: Text(
                '${inspection!.createdAt.toLocal()} · ${inspection!.sourcePlatform} · v${inspection!.sourceVersion}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            _categoryList(
              text,
              importSelection,
              (value) => setState(() => importSelection = value),
              summaries: inspection!.categories,
            ),
            const SizedBox(height: 8),
            FilledButton.tonalIcon(
              onPressed:
                  busy || importSelection.isEmpty ? null : () => _import(text),
              icon: const Icon(Icons.restore_rounded),
              label: Text(text['import']!),
            ),
          ],
          if (!widget.importOnly) ...[
            const Divider(height: 32),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.backup_rounded),
              title: Text(text['autoTitle']!),
              subtitle: Text(text['autoDesc']!),
            ),
            Card(
              elevation: 0,
              color: Theme.of(context).colorScheme.surfaceContainerLow,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ListTile(
                      leading: const Icon(Icons.folder_copy_rounded),
                      title: Text(text['folder']!),
                      subtitle: Text(
                        status?.directory ??
                            (app.settings.backupDir.trim().isEmpty
                                ? text['defaultFolder']!
                                : app.settings.backupDir),
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          OutlinedButton.icon(
                            onPressed: busy
                                ? null
                                : () => _chooseBackupDirectory(text),
                            icon: const Icon(Icons.folder_open_rounded),
                            label: Text(text['chooseFolder']!),
                          ),
                          TextButton.icon(
                            onPressed: busy || app.settings.backupDir.isEmpty
                                ? null
                                : () => _resetBackupDirectory(text),
                            icon: const Icon(Icons.restart_alt_rounded),
                            label: Text(text['resetFolder']!),
                          ),
                        ],
                      ),
                    ),
                    if (status?.usingFallbackDirectory == true)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                        child: Text(
                          text['folderFallback']!,
                          style:
                              Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: Theme.of(context).colorScheme.error,
                                  ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: app.settings.autoBackupEnabled,
              title: Text(text['auto']!),
              onChanged: (value) => app.setSettings(
                  (settings) => settings.autoBackupEnabled = value),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: app.settings.autoBackupIncludeImages,
              title: Text(text['images']!),
              onChanged: (value) => app.setSettings(
                  (settings) => settings.autoBackupIncludeImages = value),
            ),
            Row(children: [
              Expanded(
                child: DropdownButtonFormField<int>(
                  value: app.settings.autoBackupIntervalHours,
                  isExpanded: true,
                  decoration: InputDecoration(
                      labelText: text['interval']!,
                      border: const OutlineInputBorder()),
                  items: intervalOptions
                      .map((value) =>
                          DropdownMenuItem(value: value, child: Text('$value')))
                      .toList(),
                  onChanged: (value) => value == null
                      ? null
                      : app.setSettings((settings) =>
                          settings.autoBackupIntervalHours = value),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: DropdownButtonFormField<int>(
                  value: app.settings.autoBackupRetentionCount,
                  isExpanded: true,
                  decoration: InputDecoration(
                      labelText: text['retention']!,
                      border: const OutlineInputBorder()),
                  items: retentionOptions
                      .map((value) =>
                          DropdownMenuItem(value: value, child: Text('$value')))
                      .toList(),
                  onChanged: (value) => value == null
                      ? null
                      : app.setSettings((settings) =>
                          settings.autoBackupRetentionCount = value),
                ),
              ),
            ]),
            const SizedBox(height: 12),
            Card(
              elevation: 0,
              color: Theme.of(context).colorScheme.surfaceContainerLow,
              child: ListTile(
                leading: const Icon(Icons.history_rounded),
                title: Text(text['latest']!),
                subtitle: Text([
                  status?.latest?.toLocal().toString() ?? text['none']!,
                  text['count']!
                      .replaceAll('{count}', '${status?.count ?? 0}')
                      .replaceAll('{size}', _bytes(status?.totalBytes ?? 0)),
                ].join('\n')),
                isThreeLine: false,
                trailing: IconButton(
                  tooltip: text['backupNow']!,
                  onPressed: busy ? null : _backupNow,
                  icon: const Icon(Icons.backup_rounded),
                ),
              ),
            ),
            if (Platform.isIOS || Platform.isAndroid)
              Text(text['desc']!, style: Theme.of(context).textTheme.bodySmall),
          ],
        ],
      ),
    );
  }
}

/// Dedicated destination for a backup opened from the operating-system share
/// sheet or "Open with" menu. It reuses the exact same inspection, category
/// selection, merge, rescue-backup, and overwrite-confirmation flow as Settings.
class IncomingBackupImportScreen extends StatelessWidget {
  final String filePath;

  const IncomingBackupImportScreen({
    super.key,
    required this.filePath,
  });

  @override
  Widget build(BuildContext context) {
    final language = context.select<AppState, String>(
      (state) => state.settings.language,
    );
    final text = _backupText(language);
    return Scaffold(
      appBar: AppBar(title: Text(text['archive']!)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
          children: [
            DataBackupSettingsPanel(
              initialBackupPath: filePath,
              initiallyExpanded: true,
              importOnly: true,
            ),
          ],
        ),
      ),
    );
  }
}
