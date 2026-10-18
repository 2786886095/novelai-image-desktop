import 'ios_update_card.dart';
import 'prompt_skill_selector.dart';
import '../prompts/prompt_skill_selection.dart';
import 'external_mcp_settings.dart';
import 'openai_edit_settings.dart';
import '../ui/global_typography.dart';
import 'typography_settings.dart';
import '../prompts/translation.dart';
import 'novelai_accounts_screen.dart';
import 'compatible_images.dart';
import 'mcp_tools.dart';
import '../ui/settings_section.dart';
import 'completion_sound_settings.dart';
import '../i18n/parity_text.dart';
import '../ui/zoomable_image.dart';
import '../i18n/image_actions_text.dart';
import '../ui/studio_theme.dart';
import '../ui/studio_dropdown.dart';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../i18n/app_locales.dart';
import '../agent/tavern_preset_import.dart';
import '../i18n/system_prompt_import_text.dart';
import '../agent/tavern_models.dart';
import '../prompts/ig5_image_prompts.dart';
import '../models/nai_models.dart';
import '../services/storage_permission.dart';
import '../services/ios_output_folder.dart';
import '../services/aitag_service.dart';
import '../services/online_gallery_download_location.dart';
import '../state/app_state.dart';
import '../ui/studio_shell.dart';
import 'data_backup_settings.dart';
import 'resource_database_settings.dart';

const _projectGithubUrl = 'https://github.com/2786886095/novelai-image-desktop';
const _wechatRewardAsset = 'assets/about/wechat-reward.jpg';
const _alipayRewardAsset = 'assets/about/alipay-reward.jpg';

({
  String title,
  String hint,
  String active,
  String empty,
  String import,
  String rename,
  String delete,
  String imported,
  String failed,
}) _sharedPromptPresetText(Object? language) {
  switch (normalizeAppLocaleCode(language)) {
    case 'zh-TW':
      return (
        title: '反推 / 轉換共用預設',
        hint: '預設無限五代任務適配；轉換與反推獨立選擇。匯入 UTF-8 TXT / MD / JSON / ST；需開啟系統提示層才會套用。',
        active: '目前預設',
        empty: '目前沒有預設；只保留結構化輸出規則。',
        import: '匯入系統提示詞',
        rename: '重新命名',
        delete: '刪除',
        imported: '已匯入預設',
        failed: '匯入失敗',
      );
    case 'en-US':
      return (
        title: 'Shared reverse / conversion preset',
        hint:
            'IG5 task defaults; conversion and reverse choose independently. Import UTF-8 TXT / MD / JSON / ST. Enable the system-prompt layer to apply.',
        active: 'Active preset',
        empty: 'No preset is active; structured output rules remain enabled.',
        import: 'Import system prompt',
        rename: 'Rename',
        delete: 'Delete',
        imported: 'Preset imported',
        failed: 'Import failed',
      );
    case 'ja-JP':
      return (
        title: '解析 / 変換 共通プリセット',
        hint: 'IG5 タスク別既定。解析と変換は個別選択。UTF-8 TXT / MD / JSON / ST に対応。適用にはシステム層を有効にしてください。',
        active: '現在のプリセット',
        empty: 'プリセットはありません。構造化出力ルールのみ維持されます。',
        import: 'システムプロンプトを読込',
        rename: '名前を変更',
        delete: '削除',
        imported: 'プリセットを読み込みました',
        failed: '読み込み失敗',
      );
    case 'ko-KR':
      return (
        title: '분석 / 변환 공유 프리셋',
        hint: 'IG5 작업별 기본값; 분석과 변환은 별도 선택. UTF-8 TXT / MD / JSON / ST 가져오기. 적용하려면 시스템 프롬프트 층을 켜세요.',
        active: '현재 프리셋',
        empty: '프리셋이 없습니다. 구조화 출력 규칙만 유지됩니다.',
        import: '시스템 프롬프트 가져오기',
        rename: '이름 변경',
        delete: '삭제',
        imported: '프리셋을 가져왔습니다',
        failed: '가져오기 실패',
      );
    default:
      return (
        title: '反推 / 转换共用预设',
        hint: '默认无限五代任务适配；转换与反推独立选择。导入 UTF-8 TXT / MD / JSON / ST；需开启系统提示层才能应用。',
        active: '当前预设',
        empty: '当前没有预设；只保留结构化输出规则。',
        import: '导入系统提示词',
        rename: '重命名',
        delete: '删除',
        imported: '已导入预设',
        failed: '导入失败',
      );
  }
}

(String, String) _streamPreviewSettingText(Object? language) {
  switch (normalizeAppLocaleCode(language)) {
    case 'zh-TW':
      return ('生成時串流預覽', '預設開啟；生成期間逐步顯示中間圖。');
    case 'en-US':
      return (
        'Streaming generation preview',
        'On by default; shows intermediate images while generating.'
      );
    case 'ja-JP':
      return ('生成中のストリーミングプレビュー', '初期状態で有効。生成途中の画像を順次表示します。');
    case 'ko-KR':
      return ('생성 스트리밍 미리보기', '기본으로 켜져 있으며 생성 중간 이미지를 순서대로 표시합니다.');
    default:
      return ('生成时流式预览', '默认开启；生成过程中逐步显示中间图。');
  }
}

String _formatBytes(int bytes) => bytes < 1024 * 1024
    ? '${(bytes / 1024).toStringAsFixed(1)} KB'
    : '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';

(String, String, String, String, String, String) _cacheText(Object? language) {
  switch (normalizeAppLocaleCode(language)) {
    case 'zh-TW':
      return ('AI 繪畫咒語圖庫圖片快取', '本機快取', '自動清理週期', '未使用天數', '永不自動清理', '清除快取');
    case 'en-US':
      return (
        'AI Art Prompt Gallery cache',
        'Local cache',
        'Automatic cleanup interval',
        'Unused days',
        'Never clean automatically',
        'Clear cache'
      );
    case 'ja-JP':
      return (
        'AI イラスト呪文ギャラリー画像キャッシュ',
        'ローカルキャッシュ',
        '自動削除の間隔',
        '未使用日数',
        '自動削除しない',
        'キャッシュを消去'
      );
    case 'ko-KR':
      return (
        'AI 그림 프롬프트 갤러리 이미지 캐시',
        '로컬 캐시',
        '자동 정리 주기',
        '미사용 일수',
        '자동으로 정리하지 않음',
        '캐시 지우기'
      );
    default:
      return ('AI绘画咒语图库图片缓存', '本地缓存', '自动清理周期', '未使用天数', '永不自动清理', '清除缓存');
  }
}

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final visionKeyCtrl = TextEditingController();
  final convertKeyCtrl = TextEditingController();
  final tagKeyCtrl = TextEditingController();
  final baiduSecretCtrl = TextEditingController();
  // Controlled (not _TextSetting's uncontrolled initialValue) so a model pick
  // from the detected-models popup can push text into the field directly —
  // an uncontrolled field wouldn't visually update just because `settings`
  // changed on a rebuild it didn't trigger itself.
  final visionModelCtrl = TextEditingController();
  final convertModelCtrl = TextEditingController();
  bool testingProxy = false;
  List<String> _detectedModels = [];
  String _detectedModelKind = '';
  ({int bytes, int files}) _aitagCacheStats = (bytes: 0, files: 0);
  bool _aitagCacheBusy = false;
  String _sharedPromptPresetStatus = '';

  @override
  void initState() {
    super.initState();
    final settings = context.read<AppState>().settings;
    visionModelCtrl.text = settings.visionApiModel;
    convertModelCtrl.text = settings.convertApiModel;
    _prefillSecrets();
    _loadAitagCacheStats();
  }

  Future<void> _loadAitagCacheStats() async {
    try {
      final value = await AitagImageCache.stats();
      if (mounted) setState(() => _aitagCacheStats = value);
    } catch (_) {
      // Path provider may be unavailable in widget tests; the cache remains optional.
    }
  }

  // Secrets live in secure storage, not the reactive `settings` object, so the
  // fields start blank on every screen build unless explicitly loaded once
  // here — otherwise an already-saved key looks like it "disappeared". Best
  // effort: secure storage is unavailable in widget tests (no platform
  // channel) and, in principle, could fail on a real device too — either way
  // the fields simply stay blank rather than crashing the settings screen.
  Future<void> _prefillSecrets() async {
    final storage = context.read<AppState>().storage;
    List<String?> results;
    try {
      results = await Future.wait([
        storage.getVisionKey(),
        storage.getConvertKey(),
        storage.getTagKey(),
        storage.getBaiduSecret(),
      ]);
    } catch (_) {
      return;
    }
    if (!mounted) return;
    visionKeyCtrl.text = results[0] ?? '';
    convertKeyCtrl.text = results[1] ?? '';
    tagKeyCtrl.text = results[2] ?? '';
    baiduSecretCtrl.text = results[3] ?? '';
  }

  @override
  void dispose() {
    visionKeyCtrl.dispose();
    convertKeyCtrl.dispose();
    tagKeyCtrl.dispose();
    baiduSecretCtrl.dispose();
    visionModelCtrl.dispose();
    convertModelCtrl.dispose();
    super.dispose();
  }

  Future<void> _importSharedPromptPreset(AppState state, {required bool reverse}) async {
    final text=_sharedPromptPresetText(state.settings.language);
    try {
      final picked=await FilePicker.platform.pickFiles(type:FileType.custom,allowedExtensions:const ['json','md','txt'],withData:false);
      final file=picked?.files.firstOrNull;if(file==null)return;
      if(file.size>maxSystemPromptFileBytes)throw const SystemPromptImportError('bytes');
      final bytes=file.bytes ?? (file.path==null?null:await File(file.path!).readAsBytes());
      if(bytes==null)throw const SystemPromptImportError('empty');
      final result=importImageSystemPromptBytes(bytes,fileName:file.name);
      TavernSamplerPreset? selected;
      await state.setSettings((settings){
        selected=selectImportedSystemPreset(settings.reverseConvertPromptPresets,result.preset);
        if(reverse){settings.reverseSystemPromptPresetId=selected!.id;}else{settings.convertSystemPromptPresetId=selected!.id;}
      });
      if(!mounted)return;
      setState(()=>_sharedPromptPresetStatus='${text.imported}: ${selected!.name} ${result.warnings.join(' ')}');
    } catch(error){if(!mounted)return;setState(()=>_sharedPromptPresetStatus='${text.failed}: ${systemPromptImportErrorText(error,state.settings.language)}');}
  }

  Future<void> _renameSharedPromptPreset(
      AppState state, TavernSamplerPreset preset) async {
    final controller = TextEditingController(text: preset.name);
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(_sharedPromptPresetText(state.settings.language).rename),
        content: TextField(controller: controller, autofocus: true),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('取消')),
          FilledButton(
              onPressed: () => Navigator.pop(dialogContext, controller.text),
              child: const Text('保存')),
        ],
      ),
    );
    controller.dispose();
    final name = value?.trim();
    if (name == null || name.isEmpty) return;
    await state.setSettings((settings) {
      final target = settings.reverseConvertPromptPresets
          .where((item) => item.id == preset.id)
          .firstOrNull;
      if (target != null) {
        target
          ..name = name.length > 160 ? name.substring(0, 160) : name
          ..updatedAt = DateTime.now().toUtc().toIso8601String();
      }
    });
  }

  Future<void> _deleteSharedPromptPreset(
      AppState state, TavernSamplerPreset preset) async {
    final labels = _sharedPromptPresetText(state.settings.language);
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: Text(labels.delete),
            content: Text('${labels.delete}: ${preset.name}?'),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(dialogContext, false),
                  child: const Text('取消')),
              FilledButton(
                  onPressed: () => Navigator.pop(dialogContext, true),
                  child: Text(labels.delete)),
            ],
          ),
        ) ??
        false;
    if (!confirmed) return;
    await state.setSettings((settings) {
      settings.reverseConvertPromptPresets
          .removeWhere((item) => item.id == preset.id);
      if(settings.convertSystemPromptPresetId==preset.id){final fallback=createIg5ImageSamplerPreset('convert');if(!settings.reverseConvertPromptPresets.any((p)=>p.id==fallback.id))settings.reverseConvertPromptPresets.add(fallback);settings.convertSystemPromptPresetId=fallback.id;}
      if(settings.reverseSystemPromptPresetId==preset.id){final fallback=createIg5ImageSamplerPreset('reverse');if(!settings.reverseConvertPromptPresets.any((p)=>p.id==fallback.id))settings.reverseConvertPromptPresets.add(fallback);settings.reverseSystemPromptPresetId=fallback.id;}
      if(settings.reverseConvertPromptPresetId==preset.id)settings.reverseConvertPromptPresetId=settings.convertSystemPromptPresetId;
    });
  }

  Widget _sharedPromptPresetCard(AppState state, {required bool reverse}) {
    final settings = state.settings;
    final text = _sharedPromptPresetText(settings.language);
    final selected = selectedImageSystemPreset(settings.reverseConvertPromptPresets, reverse ? settings.reverseSystemPromptPresetId : settings.convertSystemPromptPresetId, reverse ? 'reverse' : 'convert');
    return Card(
      key: ValueKey('system-prompt-${reverse ? "reverse" : "convert"}'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(text.title,
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(text.hint, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          if (settings.reverseConvertPromptPresets.isNotEmpty)
            StudioDropdownButtonFormField<String>(
              key: ValueKey('system-prompt-preset-${reverse ? "reverse" : "convert"}'),
              value: selected?.id,
              decoration: InputDecoration(
                  labelText: text.active, border: const OutlineInputBorder()),
              items: settings.reverseConvertPromptPresets
                  .map((item) =>
                      DropdownMenuItem(value: item.id, child: Text(item.name)))
                  .toList(),
              onChanged: (value) => value == null
                  ? null
                  : state.setSettings(
                      (item) { if(reverse){item.reverseSystemPromptPresetId=value;}else{item.convertSystemPromptPresetId=value;} }),
            )
          else
            Text(text.empty),
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 8, children: [
            OutlinedButton.icon(
                key: ValueKey('system-prompt-import-${reverse ? "reverse" : "convert"}'),
                onPressed: () => _importSharedPromptPreset(state, reverse: reverse),
                icon: const Icon(Icons.file_download_outlined),
                label: Text(text.import)),
            OutlinedButton.icon(
                onPressed: selected == null
                    ? null
                    : () => _renameSharedPromptPreset(state, selected),
                icon: const Icon(Icons.edit_outlined),
                label: Text(text.rename)),
            OutlinedButton.icon(
                onPressed: selected == null || selected.source == 'builtin'
                    ? null
                    : () => _deleteSharedPromptPreset(state, selected),
                icon: const Icon(Icons.delete_outline_rounded),
                label: Text(text.delete)),
          ]),
          if (_sharedPromptPresetStatus.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(_sharedPromptPresetStatus,
                style: TextStyle(color: Theme.of(context).colorScheme.primary)),
          ],
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final s = state.settings;
    final settingsText = settingsScreenTextFor(s.language);
    final settingsDetailText = settingsDetailTextFor(s.language);
    final languageText = settingsLanguageTextFor(s.language);
    final appearanceText = settingsAppearanceTextFor(s.language);
    final persistText = settingsPersistTextFor(s.language);
    final aboutText = settingsAboutTextFor(s.language);
    final cacheText = _cacheText(s.language);
    final streamPreviewText = _streamPreviewSettingText(s.language);
    final account = state.account;
    return Scaffold(
      appBar: AppBar(title: studioAppBarTitle(context, Text(settingsText.title))),
      body: StudioContent(
          child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        // Add the keyboard inset to the bottom so the lower fields/buttons can
        // always scroll clear of the on-screen keyboard (nested Scaffold + bottom
        // nav can otherwise leave them covered).
        padding: EdgeInsets.fromLTRB(
            16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
        children: [
          const NovelAiAccountSelector(),
          const SizedBox(height: 12),
          const CompatibleImageSettingsCard(),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: Icon(
                  account.hasToken ? Icons.check_circle : Icons.error_outline,
                  color: account.hasToken ? Colors.green : Colors.orange),
              title: Text(account.hasToken
                  ? '${settingsText.accountConfigured} (${account.tierName ?? settingsText.verified})'
                  : settingsText.accountUnconfigured),
              subtitle: Text(account.anlasBalance == null
                  ? '${settingsText.anlas}: ${settingsText.unknown}'
                  : '${settingsText.anlas}: ${account.anlasBalance}'),
              trailing: IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: state.refreshAnlas),
            ),
          ),
          const SizedBox(height: 12),
          if (Platform.isIOS) const IosUpdateCard() else
          Card(
            child: ListTile(
              leading: Icon(state.updateInfo?.hasUpdate == true
                  ? Icons.system_update_alt
                  : Icons.verified_outlined),
              title: Text(state.updateInfo?.hasUpdate == true
                  ? '${settingsText.updateAvailable} v${state.updateInfo?.latestVersion}'
                  : settingsText.versionUpdate),
              subtitle: Text(state.updateInfo?.error != null
                  ? settingsText.checkFailed
                  : '${settingsText.currentVersion} v$appVersion'),
              trailing: state.updateInfo?.hasUpdate == true &&
                      state.updateInfo?.releaseUrl != null
                  ? FilledButton.tonal(
                      onPressed: state.updateInstalling ? null : Platform.isAndroid ? state.installAppUpdate : () => launchUrl(
                        Uri.parse(state.updateInfo!.releaseUrl!),
                        mode: LaunchMode.externalApplication,
                      ),
                      child: Text(state.updateInstalling ? '${(state.updateProgress*100).round()}%' : Platform.isAndroid ? parityText(state.settings.language,'update.downloadInstall') : settingsText.view),
                    )
                  : IconButton(
                      tooltip: settingsText.checkUpdate,
                      onPressed: state.updateChecking
                          ? null
                          : () => state.checkUpdate(manual: true),
                      icon: state.updateChecking
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.refresh),
                    ),
            ),
          ),
          const SizedBox(height: 12),
          const OpenAIEditSettingsCard(),
          const SizedBox(height: 12),
          const ExternalMcpSettingsCard(),
          _Section(
              title: settingsText.updateSourceTitle,
              children: const [ListTile(title: Text('GitHub'))]),
          _Section(title: languageText.sectionTitle, children: [
            StudioDropdownButtonFormField<String>(
              value: normalizeAppLocaleCode(s.language),
              isExpanded: true,
              decoration: InputDecoration(
                labelText: languageText.languageLabel,
                border: const OutlineInputBorder(),
              ),
              items: [
                for (final locale in supportedAppLocales)
                  DropdownMenuItem(
                    value: locale.code,
                    child: Text(locale.menuLabel),
                  ),
              ],
              onChanged: (value) => value == null
                  ? null
                  : state.setSettings(
                      (x) => x.language = normalizeAppLocaleCode(value)),
            ),
            Text(languageText.hint),
          ]),
          _Section(title: settingsText.networkSection, children: [
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.vpn_key_outlined),
              title: Text(settingsDetailText.networkSystemVpnTitle),
              subtitle: Text(settingsDetailText.networkSystemVpnSubtitle),
            ),
            FilledButton.tonalIcon(
              onPressed: testingProxy ? null : _testProxy,
              icon: testingProxy
                  ? const SizedBox.square(
                      dimension: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.wifi_tethering),
              label: Text(testingProxy
                  ? settingsDetailText.networkTesting
                  : settingsDetailText.networkTest),
            ),
          ]),
          OutlinedButton.icon(onPressed:()=>_showTokenGuide(context),
            icon:const Icon(Icons.help_outline),label:const Text('如何获取 API Token')),
          _Section(title: settingsText.reverseSection, children: [
            _sharedPromptPresetCard(state, reverse: true),
            _TextSetting(
                label: settingsDetailText.visionApiUrl,
                value: s.visionApiUrl,
                onChanged: (v) => state.setSettings((x) => x.visionApiUrl = v)),
            _ModelNameField(
              label: settingsDetailText.visionModel,
              controller: visionModelCtrl,
              detectedModels:
                  _detectedModelKind == 'reverse' ? _detectedModels : const [],
              pickerTooltip: settingsDetailText.chooseDetectedModel,
              onChanged: (v) => state.setSettings((x) => x.visionApiModel = v),
            ),
            _SecretField(
                controller: visionKeyCtrl,
                labelText: settingsDetailText.visionApiKey,
                onChanged: (v) => state.setSecret('vision', v)),
            const SizedBox(height: 8),
            SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                    onPressed: () => _detect(context, 'reverse'),
                    child: Text(settingsDetailText.detectModel))),
          ]),
          _Section(title: settingsText.convertSection, children: [
            _sharedPromptPresetCard(state, reverse: false),
            _TextSetting(
                label: settingsDetailText.textApiUrl,
                value: s.convertApiUrl,
                onChanged: (v) =>
                    state.setSettings((x) => x.convertApiUrl = v)),
            _ModelNameField(
              label: settingsDetailText.textModel,
              controller: convertModelCtrl,
              detectedModels:
                  _detectedModelKind == 'convert' ? _detectedModels : const [],
              pickerTooltip: settingsDetailText.chooseDetectedModel,
              onChanged: (v) => state.setSettings((x) => x.convertApiModel = v),
            ),
            _SecretField(
                controller: convertKeyCtrl,
                labelText: settingsDetailText.textApiKey,
                onChanged: (v) => state.setSecret('convert', v)),
            const SizedBox(height: 8),
            SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                    onPressed: () => _detect(context, 'convert'),
                    child: Text(settingsDetailText.detectModel))),
          ]),
          _Section(title: settingsText.tagSection, children: [
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(settingsDetailText.tagRemoteTitle),
              subtitle: Text(settingsDetailText.tagRemoteSubtitle),
              value: s.tagServerEnabled,
              onChanged: (value) =>
                  state.setSettings((x) => x.tagServerEnabled = value),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.download_for_offline_outlined),
              title: Text(settingsDetailText.tagLibraryTitle),
              subtitle: Text(state.offlineTagStatus.downloaded
                  ? '${settingsDetailText.downloadedTagsPrefix}${state.offlineTagStatus.count}${settingsDetailText.downloadedTagsSuffix}'
                  : settingsDetailText.tagLibraryNotDownloaded),
              trailing: FilledButton.tonal(
                onPressed:
                    state.offlineTagBusy ? null : state.downloadOfflineTags,
                child: Text(state.offlineTagBusy
                    ? settingsDetailText.downloadBusy
                    : settingsDetailText.download),
              ),
            ),
            Text(settingsDetailText.tagDataNotice),
            _TextSetting(
                label: settingsDetailText.tagMcpUrl,
                value: s.tagServerUrl,
                onChanged: (v) => state.setSettings((x) => x.tagServerUrl = v)),
            StudioDropdownButtonFormField<String>(
              value: s.tagServerType,
              decoration: InputDecoration(
                  labelText: settingsDetailText.serviceType,
                  border: const OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: 'rest', child: Text('REST')),
                DropdownMenuItem(
                    value: 'http', child: Text('Streamable HTTP MCP')),
                DropdownMenuItem(value: 'sse', child: Text('SSE MCP')),
              ],
              onChanged: (v) => v == null
                  ? null
                  : state.setSettings((x) => x.tagServerType = v),
            ),
            const SizedBox(height: 8),
            if (s.tagServerType != 'rest') const McpToolSettings(),
            _SecretField(
                controller: tagKeyCtrl,
                labelText: settingsDetailText.tagServiceKey,
                onChanged: (v) => state.setSecret('tag', v)),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () async {
                final message = await state.testTagService();
                if (context.mounted) {
                  ScaffoldMessenger.of(context)
                      .showSnackBar(SnackBar(content: Text(message)));
                }
              },
              icon: const Icon(Icons.network_check),
              label: Text(settingsDetailText.testTagMcp),
            ),
            SwitchListTile(
                title: Text(settingsDetailText.mcpCapsuleTitle),
                subtitle: Text(settingsDetailText.mcpCapsuleSubtitle),
                value: s.mcpForCapsule,
                onChanged: (v) =>
                    state.setSettings((x) => x.mcpForCapsule = v)),
            SwitchListTile(
                title: Text(settingsDetailText.mcpConvertTitle),
                value: s.mcpForConvert,
                onChanged: (v) =>
                    state.setSettings((x) => x.mcpForConvert = v)),
            SwitchListTile(
                title: Text(settingsDetailText.mcpReverseTitle),
                value: s.mcpForReverse,
                onChanged: (v) =>
                    state.setSettings((x) => x.mcpForReverse = v)),
          ]),
          _Section(title: settingsText.translateSection, children: [
            SwitchListTile(
              title: Text(translationEditorText(s.language)['live']!),
              value: s.translateRealtime,
              onChanged: (value) =>
                  state.setSettings((s) => s.translateRealtime = value),
            ),
            StudioDropdownButtonFormField<String>(value:normalizeTranslationPreference(s.translateTargetLanguage),isExpanded:true,decoration:InputDecoration(labelText:translationText(s.language)['target'],border:const OutlineInputBorder()),items:[DropdownMenuItem(value:'system',child:Text(translationText(s.language)['system']!)),...translationLanguages.map((l)=>DropdownMenuItem(value:l.value,child:Text(l.label)))],onChanged:(value){if(value!=null)state.setSettings((x)=>x.translateTargetLanguage=value);}),
            StudioDropdownButtonFormField<String>(
              value: s.translateProvider,
              isExpanded: true,
              decoration: InputDecoration(
                labelText: settingsDetailText.translateProvider,
                border: const OutlineInputBorder(),
              ),
              items: [
                DropdownMenuItem(
                    value: 'google',
                    child: Text(settingsDetailText.googleTranslate)),
                DropdownMenuItem(
                    value: 'baidu',
                    child: Text(settingsDetailText.baiduTranslate)),
              ],
              onChanged: (value) => value == null
                  ? null
                  : state.setSettings((x) => x.translateProvider = value),
            ),
            if (s.translateProvider == 'baidu') ...[
              _TextSetting(
                label: settingsDetailText.baiduAppId,
                value: s.baiduAppId,
                onChanged: (value) =>
                    state.setSettings((x) => x.baiduAppId = value.trim()),
              ),
              _SecretField(
                controller: baiduSecretCtrl,
                labelText: settingsDetailText.baiduSecret,
                onChanged: (v) => state.setSecret('baidu', v),
              ),
            ],
          ]),
          _Section(title: settingsText.promptTemplatesSection, children: [
            Text(settingsDetailText.reverseTemplateTitle),
            PromptSkillSelector(model:promptSkillModel(s,'reverse'),edition:promptSkillEdition(s,'reverse'),language:s.language,onChanged:(model,edition)=>state.setSettings((x)=>selectPromptSkill(x,'reverse',edition,model))),
            ...ReversePromptMode.values.map((mode) => _TemplateTile(
                  title: mode.label,
                  customizedLabel: settingsDetailText.customized,
                  builtInLabel: settingsDetailText.builtInTemplate,
                  customized:
                      state.promptOverrides('reverse')[mode.value]?.trim().isNotEmpty ??
                          false,
                  onTap: () => _editTemplate(context, 'reverse', mode),
                )),
            const Divider(),
            Text(settingsDetailText.convertTemplateTitle),
            PromptSkillSelector(model:promptSkillModel(s,'convert'),edition:promptSkillEdition(s,'convert'),language:s.language,onChanged:(model,edition)=>state.setSettings((x)=>selectPromptSkill(x,'convert',edition,model))),
            ...ReversePromptMode.values.map((mode) => _TemplateTile(
                  title: mode.label,
                  customizedLabel: settingsDetailText.customized,
                  builtInLabel: settingsDetailText.builtInTemplate,
                  customized:
                      state.promptOverrides('convert')[mode.value]?.trim().isNotEmpty ??
                          false,
                  onTap: () => _editTemplate(context, 'convert', mode),
                )),
            Text(settingsDetailText.restoreTemplateNote),
          ]),
          _Section(title: settingsText.promptShortcutsSection, children: [
            if (s.promptShortcuts.isEmpty)
              Text(settingsDetailText.promptShortcutEmpty),
            ...s.promptShortcuts.map(
              (template) => ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.bolt_outlined),
                title: Text(template.name),
                subtitle: Text(
                  [template.prefix, template.suffix, template.negativePrompt]
                      .where((value) => value.isNotEmpty)
                      .join(' · '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: IconButton(
                  tooltip: settingsDetailText.delete,
                  onPressed: () => state.removePromptShortcut(template.id),
                  icon: const Icon(Icons.delete_outline),
                ),
              ),
            ),
            FilledButton.tonalIcon(
              onPressed: () => _addPromptShortcut(context),
              icon: const Icon(Icons.add),
              label: Text(settingsDetailText.newShortcut),
            ),
          ]),
          _Section(title: settingsText.storageSection, children: [
            _TextSetting(
              label: settingsDetailText.imageNameTemplate,
              value: s.imageNameTemplate,
              onChanged: (value) =>
                  state.setSettings((x) => x.imageNameTemplate = value),
            ),
            Text(settingsDetailText.imageNameVars),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(settingsDetailText.keepMetadataTitle),
              subtitle: Text(settingsDetailText.keepMetadataSubtitle),
              value: s.keepImageMetadata,
              onChanged: (value) =>
                  state.setSettings((x) => x.keepImageMetadata = value),
            ),
            SwitchListTile(
              key: const ValueKey('copy-original-metadata-setting'),
              contentPadding: EdgeInsets.zero,
              title: Text(imageActionsText(s.language, 'originalTitle')),
              subtitle: Text(imageActionsText(s.language, 'originalHint')),
              value: s.copyImageMetadata,
              onChanged: (value) => state.setSettings(
                  (x) => x.copyImageMetadata = value),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              secondary: const Icon(Icons.live_tv_outlined),
              title: Text(streamPreviewText.$1),
              subtitle: Text(streamPreviewText.$2),
              value: s.streamPreviewEnabled,
              onChanged: (value) =>
                  state.setSettings((x) => x.streamPreviewEnabled = value),
            ),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(cacheText.$1,
                          style: Theme.of(context).textTheme.titleSmall),
                      const SizedBox(height: 4),
                      Text(
                          '${cacheText.$2} · ${_aitagCacheStats.files} · ${_formatBytes(_aitagCacheStats.bytes)}'),
                      const SizedBox(height: 10),
                      StudioDropdownButtonFormField<int>(
                        value: s.aitagCacheRetentionDays,
                        decoration: InputDecoration(
                            labelText: cacheText.$3,
                            border: const OutlineInputBorder()),
                        items: [1, 7, 30, 90, 180]
                            .map((days) => DropdownMenuItem(
                                value: days,
                                child: Text('${cacheText.$4} $days')))
                            .followedBy([
                          DropdownMenuItem(value: 0, child: Text(cacheText.$5))
                        ]).toList(),
                        onChanged: (value) {
                          if (value != null) {
                            state.setSettings(
                                (x) => x.aitagCacheRetentionDays = value);
                          }
                        },
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton.icon(
                        onPressed: _aitagCacheBusy
                            ? null
                            : () async {
                                setState(() => _aitagCacheBusy = true);
                                await AitagImageCache.clear();
                                if (mounted) {
                                  setState(() {
                                    _aitagCacheBusy = false;
                                    _aitagCacheStats = (bytes: 0, files: 0);
                                  });
                                }
                              },
                        icon: const Icon(Icons.delete_sweep_outlined),
                        label: Text(cacheText.$6),
                      ),
                    ]),
              ),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(settingsDetailText.saveToGalleryTitle),
              subtitle: Text(settingsDetailText.saveToGallerySubtitle),
              value: s.saveToGallery,
              onChanged: (value) =>
                  state.setSettings((x) => x.saveToGallery = value),
            ),
            if (Platform.isAndroid || Platform.isIOS)
              _ImageOutputDirSetting(
                value: s.imageOutputDir,
                text: settingsDetailText,
                language: s.language,
                onChanged: (value) =>
                    state.setSettings((x) => x.imageOutputDir = value),
              ),
            _GalleryDownloadDirSetting(
              value: s.onlineGalleryDownloadDir,
              language: s.language,
              onChanged: (value) =>
                  state.setSettings((x) => x.onlineGalleryDownloadDir = value),
            ),
          ]),
          const ResourceDatabaseSettingsPanel(),
          const DataBackupSettingsPanel(),
          _Section(title: persistText.sectionTitle, children: [
            SwitchListTile(contentPadding:EdgeInsets.zero,title:Text(parityText(s.language,'i2i')),subtitle:Text(parityText(s.language,'i2iHint')),value:s.persistI2IParams,onChanged:(v)=>state.setSettings((x)=>x.persistI2IParams=v)),
            Text(persistText.sectionDesc),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(persistText.generateTitle),
              subtitle: Text(persistText.generateSubtitle),
              value: s.persistGenerateParams,
              onChanged: (value) =>
                  state.setSettings((x) => x.persistGenerateParams = value),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(persistText.inpaintTitle),
              subtitle: Text(persistText.inpaintSubtitle),
              value: s.persistInpaintParams,
              onChanged: (value) =>
                  state.setSettings((x) => x.persistInpaintParams = value),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(persistText.upscaleTitle),
              subtitle: Text(persistText.upscaleSubtitle),
              value: s.persistUpscaleParams,
              onChanged: (value) =>
                  state.setSettings((x) => x.persistUpscaleParams = value),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(persistText.directorTitle),
              subtitle: Text(persistText.directorSubtitle),
              value: s.persistDirectorParams,
              onChanged: (value) =>
                  state.setSettings((x) => x.persistDirectorParams = value),
            ),
          ]),
          const CompletionSoundSettings(),
          _Section(title: appearanceText.sectionTitle, children: [
            SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(const {
                      'zh-CN': '减少动效',
                      'zh-TW': '減少動效',
                      'en-US': 'Reduce motion',
                      'ja-JP': 'アニメーションを減らす',
                      'ko-KR': '모션 줄이기'
                    }[s.language] ??
                    'Reduce motion'),
                value: s.reduceMotion,
                onChanged: (v) => state.setSettings((x) => x.reduceMotion = v)),
            StudioDropdownButtonFormField<String>(
              value: s.theme,
              isExpanded: true,
              decoration: InputDecoration(
                labelText: appearanceText.themeLabel,
                border: const OutlineInputBorder(),
              ),
              items: [
                DropdownMenuItem(
                    value: 'system', child: Text(appearanceText.themeSystem)),
                DropdownMenuItem(
                    value: 'light', child: Text(appearanceText.themeLight)),
                DropdownMenuItem(
                    value: 'dark', child: Text(appearanceText.themeDark)),
              ],
              onChanged: (value) => value == null
                  ? null
                  : state.setSettings((x) => x.theme = value),
            ),
            const SizedBox(height:16),
            const TypographySettings(),
            SwitchListTile(
                title: Text(appearanceText.tagAutocomplete),
                value: s.autoComplete,
                onChanged: (v) => state.setSettings((x) => x.autoComplete = v)),
            ListTile(
              leading: const Icon(Icons.security),
              title: Text(appearanceText.secureTitle),
              subtitle: Text(appearanceText.secureSubtitle),
            ),
          ]),
          _Section(title: aboutText.sectionTitle, children: [
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Image.asset(
                'assets/icon/app_icon.png',
                width: 42,
                height: 42,
              ),
              title: const Text(appName),
              subtitle: Text('${aboutText.versionLabel} v$appVersion'),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.code_outlined),
              title: Text(aboutText.projectTitle),
              subtitle: const Text(_projectGithubUrl),
              trailing: const Icon(Icons.open_in_new),
              onTap: () => launchUrl(
                Uri.parse(_projectGithubUrl),
                mode: LaunchMode.externalApplication,
              ),
            ),
            Text(aboutText.projectDesc),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.person_outline),
              title: Text(aboutText.authorTitle),
              subtitle: Text('${aboutText.authorQq}: 2786886095'),
            ),
            Text(aboutText.authorDesc),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.forum_outlined),
              title: Text(aboutText.novelAiGroup),
              subtitle: const SelectableText('921985070'),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.local_cafe_outlined),
              title: Text(aboutText.supportTitle),
              subtitle: Text(aboutText.supportMessage),
            ),
            _RewardGrid(text: aboutText),
          ]),
        ],
      )),
    );
  }

  Future<void> _detect(BuildContext context, String kind) async {
    final state = context.read<AppState>();
    final detailText = settingsDetailTextFor(state.settings.language);
    // Drop any previous detection results up front so a re-detect against a
    // changed URL/key never leaves stale options selectable. The key field
    // auto-saves on every change, so storage is already current here.
    setState(() {
      _detectedModels = [];
      _detectedModelKind = '';
    });
    try {
      final models = await state.detectModels(kind);
      if (!context.mounted) return;
      setState(() {
        _detectedModels = models;
        _detectedModelKind = kind;
      });
      if (models.isEmpty) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(detailText.noModelList)));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<void> _testProxy() async {
    final detailText =
        settingsDetailTextFor(context.read<AppState>().settings.language);
    setState(() => testingProxy = true);
    try {
      final message = await context.read<AppState>().testNetworkConnection();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(message)));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${detailText.connectionFailed}: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => testingProxy = false);
    }
  }

  Future<void> _editTemplate(
    BuildContext context,
    String kind,
    ReversePromptMode mode,
  ) async {
    final state = context.read<AppState>();
    final detailText = settingsDetailTextFor(state.settings.language);
    final model=promptSkillModel(state.settings,kind),edition=promptSkillEdition(state.settings,kind);
    final label = kind == 'reverse'
        ? '${detailText.reverseTemplateTitle} · ${mode.label}'
        : kind == 'convert'
            ? '${detailText.convertTemplateTitle} · ${mode.label}'
            : detailText.comicTemplateTitle;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => _TemplateEditorScope(
        initialText: state.resolvedPromptTemplate(kind, mode,templateVersion:model,skillVersion:edition),
        builder: (controller) => AlertDialog(
        title: Text('$label · $model · $edition'),
        content: SizedBox(
          // Wide on tablets, but never wider than the dialog on a phone (the old
          // fixed 720 overflowed small screens).
          width: MediaQuery.sizeOf(dialogContext).width > 800
              ? 720
              : double.maxFinite,
          child: TextField(
            controller: controller,
            minLines: 12,
            maxLines: 22,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              alignLabelWithHint: true,
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () async {
              await state.resetPromptTemplate(kind, mode,templateVersion:model,skillVersion:edition);
              if (dialogContext.mounted) Navigator.pop(dialogContext);
            },
            child: Text(detailText.resetDefault),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(detailText.cancel),
          ),
          FilledButton(
            onPressed: () async {
              await state.setPromptTemplate(kind, mode, controller.text,templateVersion:model,skillVersion:edition);
              if (dialogContext.mounted) Navigator.pop(dialogContext);
            },
            child: Text(detailText.save),
          ),
        ],
        ),
      ),
    );
  }

  Future<void> _showTokenGuide(BuildContext context) {
    final language = context.read<AppState>().settings.language;
    return showDialog<void>(
      context: context,
      builder: (context) => Dialog.fullscreen(
        child: _TokenGuideScreen(language: language),
      ),
    );
  }

  Future<void> _addPromptShortcut(BuildContext context) async {
    final name = TextEditingController();
    final prefix = TextEditingController();
    final suffix = TextEditingController();
    final negative = TextEditingController();
    final state = context.read<AppState>();
    final detailText = settingsDetailTextFor(state.settings.language);
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(detailText.newShortcutTitle),
        content: SizedBox(
          width: MediaQuery.sizeOf(dialogContext).width > 800
              ? 560
              : double.maxFinite,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: name,
                  autofocus: true,
                  decoration:
                      InputDecoration(labelText: detailText.shortcutName),
                ),
                TextField(
                  controller: prefix,
                  maxLines: 2,
                  decoration:
                      InputDecoration(labelText: detailText.shortcutPrefix),
                ),
                TextField(
                  controller: suffix,
                  maxLines: 2,
                  decoration:
                      InputDecoration(labelText: detailText.shortcutSuffix),
                ),
                TextField(
                  controller: negative,
                  maxLines: 2,
                  decoration:
                      InputDecoration(labelText: detailText.shortcutNegative),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(detailText.cancel),
          ),
          FilledButton(
            onPressed: () async {
              try {
                await state.addPromptShortcut(
                  name: name.text,
                  prefix: prefix.text,
                  suffix: suffix.text,
                  negativePrompt: negative.text,
                );
                if (dialogContext.mounted) Navigator.pop(dialogContext);
              } catch (error) {
                if (dialogContext.mounted) {
                  ScaffoldMessenger.of(dialogContext).showSnackBar(
                    SnackBar(
                      content: Text(
                        error.toString().replaceFirst('Exception: ', ''),
                      ),
                    ),
                  );
                }
              }
            },
            child: Text(detailText.save),
          ),
        ],
      ),
    );
    name.dispose();
    prefix.dispose();
    suffix.dispose();
    negative.dispose();
  }
}

// A dialog's result completes before its dismissal animation is unmounted.
// Keep the controller owned by the route subtree, not by the awaiting caller.
class _TemplateEditorScope extends StatefulWidget {
  final String initialText;
  final Widget Function(TextEditingController) builder;
  const _TemplateEditorScope({required this.initialText, required this.builder});

  @override
  State<_TemplateEditorScope> createState() => _TemplateEditorScopeState();
}

class _TemplateEditorScopeState extends State<_TemplateEditorScope> {
  late final TextEditingController _controller;
  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialText);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(_controller);
}

class _TemplateTile extends StatelessWidget {
  final String title;
  final bool customized;
  final String customizedLabel;
  final String builtInLabel;
  final VoidCallback onTap;
  const _TemplateTile({
    required this.title,
    required this.customized,
    required this.customizedLabel,
    required this.builtInLabel,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.description_outlined),
        title: Text(title),
        subtitle: Text(customized ? customizedLabel : builtInLabel),
        trailing: const Icon(Icons.edit_outlined),
        onTap: onTap,
      );
}

class _RewardGrid extends StatelessWidget {
  const _RewardGrid({required this.text});

  final SettingsAboutText text;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) {
          final twoColumns = constraints.maxWidth >= 560;
          return GridView.count(
            crossAxisCount: twoColumns ? 2 : 1,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: twoColumns ? 0.78 : 0.92,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              _RewardCard(
                label: text.wechatReward,
                assetPath: _wechatRewardAsset,
              ),
              _RewardCard(
                label: text.alipayReward,
                assetPath: _alipayRewardAsset,
              ),
            ],
          );
        },
      );
}

class _RewardCard extends StatelessWidget {
  const _RewardCard({required this.label, required this.assetPath});

  final String label;
  final String assetPath;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          children: [
            Expanded(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(6),
                  child: Image.asset(assetPath, fit: BoxFit.contain),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.labelLarge,
            ),
          ],
        ),
      ),
    );
  }
}

/// A collapsible settings group: shows only its title until tapped, so the long
/// settings list reads like a table of contents (点击目录才展开).
class _Section extends SettingsSection {
  const _Section({required super.title, required super.children});
}

class _TextSetting extends StatelessWidget {
  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  const _TextSetting(
      {required this.label, required this.value, required this.onChanged});
  @override
  Widget build(BuildContext context) => TextFormField(
      initialValue: value,
      decoration:
          InputDecoration(labelText: label, border: const OutlineInputBorder()),
      onChanged: onChanged);
}

// A secret/API-key field: hidden by default (never re-displayed in plain
// text unintentionally), with a small eye toggle to reveal it on demand.
class _SecretField extends StatefulWidget {
  final TextEditingController controller;
  final String labelText;
  final ValueChanged<String>? onChanged;
  const _SecretField(
      {required this.controller, required this.labelText, this.onChanged});
  @override
  State<_SecretField> createState() => _SecretFieldState();
}

class _SecretFieldState extends State<_SecretField> {
  bool _visible = false;
  @override
  Widget build(BuildContext context) => TextField(
        controller: widget.controller,
        obscureText: !_visible,
        autocorrect: false,
        onChanged: widget.onChanged,
        decoration: InputDecoration(
          labelText: widget.labelText,
          border: const OutlineInputBorder(),
          suffixIcon: IconButton(
            icon: Icon(_visible ? Icons.visibility : Icons.visibility_off),
            onPressed: () => setState(() => _visible = !_visible),
          ),
        ),
      );
}

// A model-name field that stays freely editable but, once models have been
// detected, also lets the same field pull down a picker of them.
class _ModelNameField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final List<String> detectedModels;
  final String pickerTooltip;
  final ValueChanged<String> onChanged;
  const _ModelNameField({
    required this.label,
    required this.controller,
    required this.detectedModels,
    required this.pickerTooltip,
    required this.onChanged,
  });
  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          suffixIcon: detectedModels.isEmpty
              ? null
              : PopupMenuButton<String>(
                  popUpAnimationStyle: MediaQuery.disableAnimationsOf(context)
                      ? AnimationStyle.noAnimation
                      : AppMotion.disclosureStyle,
                  tooltip: pickerTooltip,
                  icon: const Icon(Icons.arrow_drop_down),
                  onSelected: (value) {
                    controller.text = value;
                    onChanged(value);
                  },
                  itemBuilder: (context) => detectedModels
                      .map((m) => PopupMenuItem(
                            value: m,
                            child: Text(m,
                                maxLines: 1, overflow: TextOverflow.ellipsis),
                          ))
                      .toList(),
                ),
        ),
        onChanged: onChanged,
      );
}

// Real OS folder selection for generated originals. Android uses the production
// all-files permission flow; iOS uses native persisted document-picker grants.
// Both retain the desktop <base>/<date>/<group>/ layout.
class _ImageOutputDirSetting extends StatelessWidget {
  const _ImageOutputDirSetting({
    required this.value,
    required this.text,
    required this.language,
    required this.onChanged,
  });
  final String value;
  final SettingsDetailText text;
  final String language;
  final ValueChanged<String> onChanged;

  Future<void> _pick(BuildContext context) async {
    try {
      final picked = Platform.isIOS
          ? await IosOutputFolder.choose()
          : await FilePicker.platform
              .getDirectoryPath(dialogTitle: text.chooseImageFolderDialog);
      if (picked == null || picked.trim().isEmpty) return;
      final granted = await StoragePermission.hasAllFilesAccess();
      if (!granted && context.mounted) {
        final go = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: Text(text.fileAccessTitle),
            content: Text(text.fileAccessContent),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: Text(text.later)),
              FilledButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  child: Text(text.authorize)),
            ],
          ),
        );
        if (go == true) await StoragePermission.requestAllFilesAccess();
      }
      // Android retains its prior deferred-grant behavior. iOS only reaches
      // this point after the native picker has saved an access bookmark.
      onChanged(picked.trim());
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final custom = value.trim();
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(text.imageOutputPath, style: theme.textTheme.bodyLarge),
        const SizedBox(height: 4),
        Text(
          custom.isEmpty ? text.defaultImageDir : custom,
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 2),
        Text(
          Platform.isIOS ? switch (language) {
            'zh-CN' => '通过“文件”授权输出目录并记住访问权限。撤销权限或移动目录后，请重新选择；不会假装保存到所选位置。',
            'zh-TW' => '透過「檔案」授權輸出資料夾並記住權限。撤銷權限或移動後請重新選擇；不會假稱已儲存到所選位置。',
            'ja-JP' => 'ファイルで保存先へのアクセスを許可します。権限を取り消したり移動した場合は再選択してください。',
            'ko-KR' => '파일 앱에서 출력 폴더 접근을 허용합니다. 권한 해제나 폴더 이동 후에는 다시 선택하세요.',
            _ => 'Authorize a folder in Files. Choose it again after permission changes or moving it; a fallback is never reported as the selected output.',
          } : text.imagePathHint,
          style: theme.textTheme.bodySmall
              ?.copyWith(color: theme.colorScheme.outline),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: [
            OutlinedButton.icon(
              key: const ValueKey('image-output-choose'),
              onPressed: () => _pick(context),
              icon: const Icon(Icons.folder_open),
              label: Text(text.chooseFolder),
            ),
            if (custom.isNotEmpty)
              TextButton(
                onPressed: () => onChanged(''),
                child: Text(text.restoreDefault),
              ),
          ],
        ),
      ],
    );
  }
}

class _GalleryDownloadDirSetting extends StatelessWidget {
  const _GalleryDownloadDirSetting({
    required this.value,
    required this.language,
    required this.onChanged,
  });

  final String value;
  final Object? language;
  final ValueChanged<String> onChanged;

  Future<void> _pick() async {
    final text = onlineGalleryDownloadPathText(language);
    final picked = await FilePicker.platform
        .getDirectoryPath(dialogTitle: text.dialogTitle);
    if (picked == null || picked.trim().isEmpty) return;
    if (Platform.isAndroid && !await StoragePermission.hasAllFilesAccess()) {
      await StoragePermission.requestAllFilesAccess();
    }
    onChanged(picked.trim());
  }

  @override
  Widget build(BuildContext context) {
    final text = onlineGalleryDownloadPathText(language);
    final custom = value.trim();
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(text.title, style: theme.textTheme.bodyLarge),
        const SizedBox(height: 4),
        Text(custom.isEmpty ? text.defaultLabel : custom,
            style: theme.textTheme.bodySmall),
        const SizedBox(height: 2),
        Text(text.hint,
            style: theme.textTheme.bodySmall
                ?.copyWith(color: theme.colorScheme.outline)),
        const SizedBox(height: 8),
        Wrap(spacing: 8, children: [
          OutlinedButton.icon(
              onPressed: _pick,
              icon: const Icon(Icons.folder_open),
              label: Text(text.choose)),
          if (custom.isNotEmpty)
            TextButton(onPressed: () => onChanged(''), child: Text(text.reset)),
        ]),
      ],
    );
  }
}

class _TokenGuideScreen extends StatelessWidget {
  const _TokenGuideScreen({required this.language});

  final String language;

  static const images = [
    'assets/token_guide/token-step-1.webp',
    'assets/token_guide/token-step-2.webp',
    'assets/token_guide/token-step-3.webp',
  ];

  @override
  Widget build(BuildContext context) {
    final text = tokenGuideTextFor(language);
    return Scaffold(
      appBar: AppBar(
        title: studioAppBarTitle(context, Text(text.title)),
        leading: IconButton(
          tooltip: text.close,
          onPressed: () => Navigator.pop(context),
          icon: const Icon(Icons.close),
        ),
      ),
      body: StudioContent(
        maxWidth: 980,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
          children: [
            Text(text.subtitle),
            for (var index = 0; index < text.steps.length; index++)
              Card(
                margin: const EdgeInsets.only(top: 12),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          CircleAvatar(child: Text('${index + 1}')),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(text.steps[index].title,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleMedium),
                                Text(text.steps[index].description),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      InkWell(
                        onTap: () => showGalleryImagePreview(context,
                          images: images.map((path) => Image.asset(path, fit: BoxFit.contain)).toList(),
                          initialIndex: index),
                        child: AspectRatio(
                          aspectRatio: 1.92,
                          child: Image.asset(
                            images[index],
                            fit: BoxFit.contain,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            Card(
              color: Theme.of(context).colorScheme.errorContainer,
              margin: const EdgeInsets.only(top: 12),
              child: ListTile(
                leading: const Icon(Icons.security),
                title: Text(text.securityTitle),
                subtitle: Text(text.securitySubtitle),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: () => launchUrl(
                Uri.parse('https://novelai.net/image'),
                mode: LaunchMode.externalApplication,
              ),
              icon: const Icon(Icons.open_in_new),
              label: Text(text.openNovelAi),
            ),
          ],
        ),
      ),
    );
  }
}
