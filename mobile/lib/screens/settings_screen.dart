import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../i18n/app_locales.dart';
import '../models/nai_models.dart';
import '../services/storage_permission.dart';
import '../state/app_state.dart';
import '../ui/studio_shell.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final tokenCtrl = TextEditingController();
  final visionKeyCtrl = TextEditingController();
  final convertKeyCtrl = TextEditingController();
  final tagKeyCtrl = TextEditingController();
  final baiduSecretCtrl = TextEditingController();
  bool verifying = false;
  bool testingProxy = false;

  @override
  void dispose() {
    tokenCtrl.dispose();
    visionKeyCtrl.dispose();
    convertKeyCtrl.dispose();
    tagKeyCtrl.dispose();
    baiduSecretCtrl.dispose();
    super.dispose();
  }

  Future<void> _saveToken() async {
    setState(() => verifying = true);
    final appState = context.read<AppState>();
    final detailText = settingsDetailTextFor(appState.settings.language);
    final err = await appState.setToken(tokenCtrl.text);
    if (!mounted) return;
    setState(() => verifying = false);
    ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(err ?? detailText.tokenVerifiedSuccess)));
    if (err == null) tokenCtrl.clear();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final s = state.settings;
    final settingsText = settingsScreenTextFor(s.language);
    final settingsDetailText = settingsDetailTextFor(s.language);
    final languageText = settingsLanguageTextFor(s.language);
    final appearanceText = settingsAppearanceTextFor(s.language);
    final account = state.account;
    final retentionOptions = <int>{
      30,
      90,
      365,
      3650,
      s.historyRetentionDays,
    }.toList()
      ..sort();
    return Scaffold(
      appBar: AppBar(title: Text(settingsText.title)),
      body: StudioContent(
          child: ListView(
        // Add the keyboard inset to the bottom so the lower fields/buttons can
        // always scroll clear of the on-screen keyboard (nested Scaffold + bottom
        // nav can otherwise leave them covered).
        padding: EdgeInsets.fromLTRB(
            16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
        children: [
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
          Card(
            child: ListTile(
              leading: Icon(state.updateInfo?.hasUpdate == true
                  ? Icons.system_update_alt
                  : Icons.verified_outlined),
              title: Text(state.updateInfo?.hasUpdate == true
                  ? '${settingsText.updateAvailable} v${state.updateInfo?.latestVersion}'
                  : settingsText.versionUpdate),
              subtitle: Text(state.updateInfo?.error != null
                  ? '${settingsText.checkFailed}: ${state.updateInfo?.error}'
                  : '${settingsText.currentVersion} v$appVersion'),
              trailing: state.updateInfo?.hasUpdate == true &&
                      state.updateInfo?.releaseUrl != null
                  ? FilledButton.tonal(
                      onPressed: () => launchUrl(
                        Uri.parse(state.updateInfo!.releaseUrl!),
                        mode: LaunchMode.externalApplication,
                      ),
                      child: Text(settingsText.view),
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
          _Section(title: languageText.sectionTitle, children: [
            DropdownButtonFormField<String>(
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
          _Section(title: settingsText.novelAiSection, children: [
            _TextSetting(
                label: 'API Base URL',
                value: s.apiBaseUrl,
                onChanged: (v) => state.setSettings((x) => x.apiBaseUrl = v)),
            _TextSetting(
                label: 'Image Base URL',
                value: s.imageBaseUrl,
                onChanged: (v) => state.setSettings((x) => x.imageBaseUrl = v)),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(settingsDetailText.allowCustomEndpointTitle),
              subtitle: Text(settingsDetailText.allowCustomEndpointSubtitle),
              value: s.allowCustomEndpoint,
              onChanged: (value) =>
                  state.setSettings((x) => x.allowCustomEndpoint = value),
            ),
            TextField(
                controller: tokenCtrl,
                obscureText: true,
                decoration: const InputDecoration(
                    labelText: 'Persistent API Token',
                    border: OutlineInputBorder())),
            const SizedBox(height: 8),
            FilledButton(
                onPressed: verifying ? null : _saveToken,
                child: Text(verifying
                    ? settingsDetailText.verifying
                    : settingsDetailText.verifyAndSaveToken)),
            OutlinedButton.icon(
              onPressed: () => _showTokenGuide(context),
              icon: const Icon(Icons.help_outline),
              label: Text(settingsDetailText.howToGetToken),
            ),
            if (account.hasToken)
              OutlinedButton(
                  onPressed: state.clearToken,
                  child: Text(settingsDetailText.clearToken)),
          ]),
          _Section(title: settingsText.reverseSection, children: [
            _TextSetting(
                label: settingsDetailText.visionApiUrl,
                value: s.visionApiUrl,
                onChanged: (v) => state.setSettings((x) => x.visionApiUrl = v)),
            _TextSetting(
                label: settingsDetailText.visionModel,
                value: s.visionApiModel,
                onChanged: (v) =>
                    state.setSettings((x) => x.visionApiModel = v)),
            TextField(
                controller: visionKeyCtrl,
                obscureText: true,
                decoration: InputDecoration(
                    labelText: settingsDetailText.visionApiKey,
                    border: const OutlineInputBorder())),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                  child: FilledButton.tonal(
                      onPressed: () =>
                          state.setSecret('vision', visionKeyCtrl.text),
                      child: Text(settingsDetailText.saveKey))),
              const SizedBox(width: 8),
              Expanded(
                  child: OutlinedButton(
                      onPressed: () => _detect(context, 'reverse'),
                      child: Text(settingsDetailText.detectModel))),
            ]),
          ]),
          _Section(title: settingsText.convertSection, children: [
            _TextSetting(
                label: settingsDetailText.textApiUrl,
                value: s.convertApiUrl,
                onChanged: (v) =>
                    state.setSettings((x) => x.convertApiUrl = v)),
            _TextSetting(
                label: settingsDetailText.textModel,
                value: s.convertApiModel,
                onChanged: (v) =>
                    state.setSettings((x) => x.convertApiModel = v)),
            TextField(
                controller: convertKeyCtrl,
                obscureText: true,
                decoration: InputDecoration(
                    labelText: settingsDetailText.textApiKey,
                    border: const OutlineInputBorder())),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                  child: FilledButton.tonal(
                      onPressed: () =>
                          state.setSecret('convert', convertKeyCtrl.text),
                      child: Text(settingsDetailText.saveKey))),
              const SizedBox(width: 8),
              Expanded(
                  child: OutlinedButton(
                      onPressed: () => _detect(context, 'convert'),
                      child: Text(settingsDetailText.detectModel))),
            ]),
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
            DropdownButtonFormField<String>(
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
            if (s.tagServerType != 'rest') ...[
              _TextSetting(
                label: settingsDetailText.mcpToolName,
                value: s.tagServerTool,
                onChanged: (value) =>
                    state.setSettings((x) => x.tagServerTool = value),
              ),
              const SizedBox(height: 8),
            ],
            TextField(
                controller: tagKeyCtrl,
                obscureText: true,
                decoration: InputDecoration(
                    labelText: settingsDetailText.tagServiceKey,
                    border: const OutlineInputBorder())),
            const SizedBox(height: 8),
            FilledButton.tonal(
                onPressed: () => state.setSecret('tag', tagKeyCtrl.text),
                child: Text(settingsDetailText.saveTagKey)),
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
            DropdownButtonFormField<String>(
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
              TextField(
                controller: baiduSecretCtrl,
                obscureText: true,
                autocorrect: false,
                decoration: InputDecoration(
                  labelText: settingsDetailText.baiduSecret,
                  border: const OutlineInputBorder(),
                ),
              ),
              FilledButton.tonalIcon(
                onPressed: () async {
                  await state.setSecret('baidu', baiduSecretCtrl.text);
                  baiduSecretCtrl.clear();
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                          content: Text(settingsDetailText.baiduSecretSaved)),
                    );
                  }
                },
                icon: const Icon(Icons.key_outlined),
                label: Text(settingsDetailText.saveBaiduSecret),
              ),
            ],
          ]),
          _Section(title: settingsText.promptTemplatesSection, children: [
            Text(settingsDetailText.reverseTemplateTitle),
            ...ReversePromptMode.values.map((mode) => _TemplateTile(
                  title: mode.label,
                  customizedLabel: settingsDetailText.customized,
                  builtInLabel: settingsDetailText.builtInTemplate,
                  customized:
                      s.reversePromptTemplates[mode.value]?.trim().isNotEmpty ??
                          false,
                  onTap: () => _editTemplate(context, 'reverse', mode),
                )),
            const Divider(),
            Text(settingsDetailText.convertTemplateTitle),
            ...ReversePromptMode.values.map((mode) => _TemplateTile(
                  title: mode.label,
                  customizedLabel: settingsDetailText.customized,
                  builtInLabel: settingsDetailText.builtInTemplate,
                  customized:
                      s.convertPromptTemplates[mode.value]?.trim().isNotEmpty ??
                          false,
                  onTap: () => _editTemplate(context, 'convert', mode),
                )),
            const Divider(),
            _TemplateTile(
              title: settingsDetailText.comicTemplateTitle,
              customizedLabel: settingsDetailText.customized,
              builtInLabel: settingsDetailText.builtInTemplate,
              customized: s.comicPromptTemplate.trim().isNotEmpty,
              onTap: () =>
                  _editTemplate(context, 'comic', ReversePromptMode.mixed),
            ),
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
            DropdownButtonFormField<int>(
              value: s.historyRetentionDays,
              isExpanded: true,
              decoration: InputDecoration(
                labelText: settingsDetailText.historyRetention,
                border: const OutlineInputBorder(),
              ),
              items: retentionOptions
                  .map(
                    (days) => DropdownMenuItem(
                      value: days,
                      child: Text(switch (days) {
                        30 => settingsDetailText.days30,
                        90 => settingsDetailText.days90,
                        365 => settingsDetailText.oneYear,
                        3650 => settingsDetailText.longRetention,
                        _ => '$days${settingsDetailText.daysSuffix}',
                      }),
                    ),
                  )
                  .toList(),
              onChanged: (value) => value == null
                  ? null
                  : state.setSettings((x) => x.historyRetentionDays = value),
            ),
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
              contentPadding: EdgeInsets.zero,
              title: Text(settingsDetailText.saveToGalleryTitle),
              subtitle: Text(settingsDetailText.saveToGallerySubtitle),
              value: s.saveToGallery,
              onChanged: (value) =>
                  state.setSettings((x) => x.saveToGallery = value),
            ),
            if (Platform.isAndroid)
              _ImageOutputDirSetting(
                value: s.imageOutputDir,
                text: settingsDetailText,
                onChanged: (value) =>
                    state.setSettings((x) => x.imageOutputDir = value),
              ),
          ]),
          _Section(title: appearanceText.sectionTitle, children: [
            DropdownButtonFormField<String>(
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
            SwitchListTile(
                title: Text(appearanceText.tagAutocomplete),
                value: s.autoComplete,
                onChanged: (v) => state.setSettings((x) => x.autoComplete = v)),
            SwitchListTile(
              title: Text(appearanceText.lockStyleTitle),
              subtitle: Text(appearanceText.lockStyleSubtitle),
              value: s.lockStylePrompt,
              onChanged: (value) => state.setPromptLock('style', value),
            ),
            SwitchListTile(
              title: Text(appearanceText.lockNegativeTitle),
              subtitle: Text(appearanceText.lockNegativeSubtitle),
              value: s.lockNegativePrompt,
              onChanged: (value) => state.setPromptLock('negative', value),
            ),
            ListTile(
              leading: const Icon(Icons.security),
              title: Text(appearanceText.secureTitle),
              subtitle: Text(appearanceText.secureSubtitle),
            ),
          ]),
          ListTile(
              title: const Text(appName),
              subtitle:
                  Text('${appearanceText.appInfoSubtitle} · v$appVersion')),
        ],
      )),
    );
  }

  Future<void> _detect(BuildContext context, String kind) async {
    final detailText =
        settingsDetailTextFor(context.read<AppState>().settings.language);
    try {
      final models = await context.read<AppState>().detectModels(kind);
      if (!context.mounted) return;
      showDialog(
          context: context,
          builder: (_) => AlertDialog(
              title: Text(detailText.modelDetection),
              content: Text(models.isEmpty
                  ? detailText.noModelList
                  : models.take(20).join('\n'))));
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
    final controller = TextEditingController(
      text: state.resolvedPromptTemplate(kind, mode),
    );
    final label = kind == 'reverse'
        ? '${detailText.reverseTemplateTitle} · ${mode.label}'
        : kind == 'convert'
            ? '${detailText.convertTemplateTitle} · ${mode.label}'
            : detailText.comicTemplateTitle;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(label),
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
              await state.resetPromptTemplate(kind, mode);
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
              await state.setPromptTemplate(kind, mode, controller.text);
              if (dialogContext.mounted) Navigator.pop(dialogContext);
            },
            child: Text(detailText.save),
          ),
        ],
      ),
    );
    controller.dispose();
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

/// A collapsible settings group: shows only its title until tapped, so the long
/// settings list reads like a table of contents (点击目录才展开).
class _Section extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _Section({required this.title, required this.children});
  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(top: 12),
        clipBehavior: Clip.antiAlias,
        child: ExpansionTile(
          title: Text(title, style: Theme.of(context).textTheme.titleMedium),
          shape: const Border(),
          collapsedShape: const Border(),
          childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
          children:
              children.expand((w) => [w, const SizedBox(height: 8)]).toList()
                ..removeLast(),
        ),
      );
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

// Lets the user choose a custom base folder for saved originals (Android). Images
// are stored as <base>/<date>/<group>/ — the same date/group layout as the
// desktop client. On Android 11+ an arbitrary folder needs "All files access",
// so we prompt for it; until granted, saves fall back to the app folder.
class _ImageOutputDirSetting extends StatelessWidget {
  const _ImageOutputDirSetting({
    required this.value,
    required this.text,
    required this.onChanged,
  });
  final String value;
  final SettingsDetailText text;
  final ValueChanged<String> onChanged;

  Future<void> _pick(BuildContext context) async {
    final picked = await FilePicker.platform
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
    // Remember the choice regardless — saving falls back gracefully until the
    // permission is granted.
    onChanged(picked.trim());
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
          text.imagePathHint,
          style: theme.textTheme.bodySmall
              ?.copyWith(color: theme.colorScheme.outline),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: [
            OutlinedButton.icon(
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
        title: Text(text.title),
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
                        onTap: () => showDialog<void>(
                          context: context,
                          builder: (previewContext) => Dialog.fullscreen(
                            backgroundColor: Colors.black,
                            child: Stack(
                              fit: StackFit.expand,
                              children: [
                                InteractiveViewer(
                                  minScale: 0.5,
                                  maxScale: 5,
                                  child: Image.asset(
                                    images[index],
                                    fit: BoxFit.contain,
                                  ),
                                ),
                                Positioned(
                                  top: 12,
                                  right: 12,
                                  child: SafeArea(
                                    child: IconButton.filled(
                                      onPressed: () =>
                                          Navigator.pop(previewContext),
                                      icon: const Icon(Icons.close),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
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
