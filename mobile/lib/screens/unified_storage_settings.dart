import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/storage_permission.dart';
import '../services/unified_storage.dart';
import '../state/app_state.dart';

class UnifiedStorageSettings extends StatefulWidget {
  const UnifiedStorageSettings({super.key});
  @override
  State<UnifiedStorageSettings> createState() => _UnifiedStorageSettingsState();
}

class _UnifiedStorageSettingsState extends State<UnifiedStorageSettings> {
  bool busy = false;
  String message = '';
  String text(String key) {
    final language = context.read<AppState>().settings.language;
    const words = {
      'zh-CN': [
        '统一数据目录',
        '将本机对话、角色卡、预设、图片和备份集中存放。自定义路径不变；密钥、插件代码与运行环境保持私有。',
        '复制并校验迁移',
        '已启用',
        '当前使用应用私有目录',
        '请在系统页面开启文件访问权限，然后返回点击迁移。',
        '迁移期间请勿编辑资料；旧文件保留。',
        '迁移完成，旧数据仍保留。',
        '请先停止生成任务与酒馆 Agent。',
        '回退旧目录',
        '回退使用迁移前的旧资料；新目录及迁移后的新增资料会保留，但不会自动合并。',
        '取消',
        '确认回退'
      ],
      'zh-TW': [
        '統一資料目錄',
        '集中存放本機對話、角色卡、預設、圖片與備份。自訂路徑不變；金鑰、外掛程式碼與執行環境保持私有。',
        '複製並驗證遷移',
        '已啟用',
        '目前使用應用程式私有目錄',
        '請在系統頁面開啟檔案存取權，再返回點擊遷移。',
        '遷移期間請勿編輯；舊檔案保留。',
        '遷移完成，舊資料仍保留。',
        '請先停止生成任務與酒館 Agent。',
        '回復舊目錄',
        '回復使用遷移前資料；新目錄與新增資料保留，不會自動合併。',
        '取消',
        '確認回復'
      ],
      'en-US': [
        'Unified data folder',
        'Keep local chats, characters, presets, images and backups together. Custom paths stay unchanged; keys, plugin code and executables remain private.',
        'Copy, verify and migrate',
        'Enabled',
        'Using app-private storage',
        'Enable file access in system settings, then return and tap migrate.',
        'Do not edit during migration. Original files are retained.',
        'Migration complete. Original data retained.',
        'Stop generation and Tavern Agent first.',
        'Return to old folder',
        'Use pre-migration data. The new folder and new data are retained but not merged automatically.',
        'Cancel',
        'Confirm rollback'
      ],
      'ja-JP': [
        '共通データフォルダー',
        '会話、キャラクター、プリセット、画像、バックアップをまとめます。指定済みのパスは維持し、キー・プラグインコード・実行環境は非公開領域に保持します。',
        'コピー・検証して移行',
        '有効',
        'アプリ専用領域を使用中',
        'システム設定でファイルアクセスを許可し、戻って移行を押してください。',
        '移行中は編集しないでください。元のファイルは保持されます。',
        '移行完了。元のデータは保持されています。',
        '生成処理と Tavern Agent を停止してください。',
        '旧フォルダーに戻す',
        '移行前のデータに戻ります。新フォルダーは保持され、自動統合は行われません。',
        'キャンセル',
        '復帰を確認'
      ],
      'ko-KR': [
        '통합 데이터 폴더',
        '대화, 캐릭터, 프리셋, 이미지와 백업을 모읍니다. 사용자 지정 경로는 유지하며 키, 플러그인 코드와 실행 환경은 비공개로 보관합니다.',
        '복사·검증 후 이전',
        '사용 중',
        '앱 전용 저장소 사용 중',
        '시스템 설정에서 파일 접근을 허용한 뒤 돌아와 이전을 누르세요.',
        '이전 중에는 편집하지 마세요. 원본 파일은 보존합니다.',
        '이전 완료. 원본 데이터를 보존했습니다.',
        '생성과 Tavern Agent를 먼저 중지하세요.',
        '이전 폴더로 복귀',
        '이전 전 데이터로 돌아갑니다. 새 폴더와 데이터는 보존되며 자동 병합하지 않습니다.',
        '취소',
        '복귀 확인'
      ],
    };
    return (words[language] ?? words['zh-CN']!)[int.parse(key)];
  }

  @override
  void initState() {
    super.initState();
    UnifiedStorage.initialize().then((_) {
      if (mounted) setState(() {});
    }).catchError((Object e) {
      if (mounted) setState(() => message = '$e');
    });
  }

  Future<void> migrate() async {
    final app = context.read<AppState>();
    if (app.busy || app.generationQueueRunning) {
      setState(() => message = text('8'));
      return;
    }
    if (!await StoragePermission.hasAllFilesAccess()) {
      await StoragePermission.requestAllFilesAccess();
      if (mounted) setState(() => message = text('5'));
      return;
    }
    setState(() {
      busy = true;
      message = text('6');
    });
    try {
      await UnifiedStorage.migrate(progress: (s) {
        if (mounted) setState(() => message = s);
      });
      app.storage.resetDataCaches();
      await app.load();
      if (mounted) setState(() => message = text('7'));
    } catch (e) {
      if (mounted) setState(() => message = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> rollback() async {
    final app = context.read<AppState>();
    if (app.busy || app.generationQueueRunning) {
      setState(() => message = text('8'));
      return;
    }
    final yes = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
                title: Text(text('9')),
                content: Text(text('10')),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(c, false),
                      child: Text(text('11'))),
                  FilledButton(
                      onPressed: () => Navigator.pop(c, true),
                      child: Text(text('12')))
                ]));
    if (yes != true) return;
    setState(() => busy = true);
    try {
      await UnifiedStorage.rollback();
      app.storage.resetDataCaches();
      await app.load();
      if (mounted) setState(() => message = text('4'));
    } catch (e) {
      if (mounted) setState(() => message = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    context.watch<AppState>();
    if (!Platform.isAndroid) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(text('0'), style: Theme.of(context).textTheme.titleSmall),
      const SizedBox(height: 8),
      Text(text('1')),
      const SizedBox(height: 8),
      SelectableText(UnifiedStorage.active?.path ??
          UnifiedStorage.candidate ??
          '/storage/emulated/0/LangbaiStudio/'),
      Text(UnifiedStorage.active == null ? text('4') : text('3')),
      if (busy) const LinearProgressIndicator(),
      if (message.isNotEmpty)
        Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: SelectableText(message)),
      Wrap(spacing: 8, runSpacing: 8, children: [
        if (UnifiedStorage.active == null)
          FilledButton.icon(
              onPressed: busy ? null : migrate,
              icon: const Icon(Icons.drive_file_move_outline),
              label: Text(text('2')))
        else
          OutlinedButton(
              onPressed: busy ? null : rollback, child: Text(text('9')))
      ]),
    ]);
  }
}
