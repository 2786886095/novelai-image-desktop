import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

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
    final err = await context.read<AppState>().setToken(tokenCtrl.text);
    if (!mounted) return;
    setState(() => verifying = false);
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(err ?? 'Token 验证成功')));
    if (err == null) tokenCtrl.clear();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final s = state.settings;
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
      appBar: AppBar(title: const Text('设置')),
      body: StudioContent(
          child: ListView(
        // Add the keyboard inset to the bottom so the lower fields/buttons can
        // always scroll clear of the on-screen keyboard (nested Scaffold + bottom
        // nav can otherwise leave them covered).
        padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
        children: [
          Card(
            child: ListTile(
              leading: Icon(
                  account.hasToken ? Icons.check_circle : Icons.error_outline,
                  color: account.hasToken ? Colors.green : Colors.orange),
              title: Text(account.hasToken
                  ? '已配置（${account.tierName ?? "已验证"}）'
                  : '未配置 NovelAI API Token'),
              subtitle: Text(account.anlasBalance == null
                  ? 'Anlas：未知'
                  : 'Anlas：${account.anlasBalance}'),
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
                  ? '发现新版本 v${state.updateInfo?.latestVersion}'
                  : '版本更新'),
              subtitle: Text(state.updateInfo?.error != null
                  ? '检查失败：${state.updateInfo?.error}'
                  : '当前版本 v$appVersion'),
              trailing: state.updateInfo?.hasUpdate == true &&
                      state.updateInfo?.releaseUrl != null
                  ? FilledButton.tonal(
                      onPressed: () => launchUrl(
                        Uri.parse(state.updateInfo!.releaseUrl!),
                        mode: LaunchMode.externalApplication,
                      ),
                      child: const Text('查看'),
                    )
                  : IconButton(
                      tooltip: '检查更新',
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
          _Section(title: '网络连接', children: [
            const ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.vpn_key_outlined),
              title: Text('请使用系统 VPN / 全局代理（梯子）'),
              subtitle: Text(
                '移动端已移除应用内代理设置：在系统里开启 VPN 或全局代理后，NovelAI、AI 反推 / 转换、翻译、标签库和更新检查都会走系统网络。',
              ),
            ),
            FilledButton.tonalIcon(
              onPressed: testingProxy ? null : _testProxy,
              icon: testingProxy
                  ? const SizedBox.square(
                      dimension: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.wifi_tethering),
              label: Text(testingProxy ? '正在测试...' : '测试网络连接'),
            ),
          ]),
          _Section(title: 'NovelAI API', children: [
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
              title: const Text('允许自定义 NovelAI 端点'),
              subtitle: const Text('仅在使用可信中转服务时开启；关闭时会强制使用 NovelAI 官方域名。'),
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
                child: Text(verifying ? '验证中...' : '验证并保存 Token')),
            OutlinedButton.icon(
              onPressed: () => _showTokenGuide(context),
              icon: const Icon(Icons.help_outline),
              label: const Text('如何获取 Token'),
            ),
            if (account.hasToken)
              OutlinedButton(
                  onPressed: state.clearToken, child: const Text('清除 Token')),
          ]),
          _Section(title: 'AI 反推', children: [
            _TextSetting(
                label: '视觉 API 地址',
                value: s.visionApiUrl,
                onChanged: (v) => state.setSettings((x) => x.visionApiUrl = v)),
            _TextSetting(
                label: '视觉模型',
                value: s.visionApiModel,
                onChanged: (v) =>
                    state.setSettings((x) => x.visionApiModel = v)),
            TextField(
                controller: visionKeyCtrl,
                obscureText: true,
                decoration: const InputDecoration(
                    labelText: '视觉 API Key', border: OutlineInputBorder())),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                  child: FilledButton.tonal(
                      onPressed: () =>
                          state.setSecret('vision', visionKeyCtrl.text),
                      child: const Text('保存 Key'))),
              const SizedBox(width: 8),
              Expanded(
                  child: OutlinedButton(
                      onPressed: () => _detect(context, 'reverse'),
                      child: const Text('检测模型'))),
            ]),
          ]),
          _Section(title: '转换 API', children: [
            _TextSetting(
                label: '文本 API 地址',
                value: s.convertApiUrl,
                onChanged: (v) =>
                    state.setSettings((x) => x.convertApiUrl = v)),
            _TextSetting(
                label: '文本模型',
                value: s.convertApiModel,
                onChanged: (v) =>
                    state.setSettings((x) => x.convertApiModel = v)),
            TextField(
                controller: convertKeyCtrl,
                obscureText: true,
                decoration: const InputDecoration(
                    labelText: '文本 API Key', border: OutlineInputBorder())),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                  child: FilledButton.tonal(
                      onPressed: () =>
                          state.setSecret('convert', convertKeyCtrl.text),
                      child: const Text('保存 Key'))),
              const SizedBox(width: 8),
              Expanded(
                  child: OutlinedButton(
                      onPressed: () => _detect(context, 'convert'),
                      child: const Text('检测模型'))),
            ]),
          ]),
          _Section(title: 'Tag / MCP', children: [
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('启用远程 Tag / MCP 服务'),
              subtitle: const Text('关闭时仅使用已下载标签库和内置离线词库。'),
              value: s.tagServerEnabled,
              onChanged: (value) =>
                  state.setSettings((x) => x.tagServerEnabled = value),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.download_for_offline_outlined),
              title: const Text('中文 Danbooru 标签库（可选）'),
              subtitle: Text(state.offlineTagStatus.downloaded
                  ? '已下载 ${state.offlineTagStatus.count} 条中文标签'
                  : '未下载；应用仍会使用内置精简词库'),
              trailing: FilledButton.tonal(
                onPressed:
                    state.offlineTagBusy ? null : state.downloadOfflineTags,
                child: Text(state.offlineTagBusy ? '下载中...' : '下载'),
              ),
            ),
            const Text(
                '数据来自 DanbooruSearchOnline（GPL-3.0），仅在用户主动下载后存入本机，不随应用分发。'),
            _TextSetting(
                label: 'Tag/MCP 地址',
                value: s.tagServerUrl,
                onChanged: (v) => state.setSettings((x) => x.tagServerUrl = v)),
            DropdownButtonFormField<String>(
              value: s.tagServerType,
              decoration: const InputDecoration(
                  labelText: '服务类型', border: OutlineInputBorder()),
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
                label: 'MCP 工具名',
                value: s.tagServerTool,
                onChanged: (value) =>
                    state.setSettings((x) => x.tagServerTool = value),
              ),
              const SizedBox(height: 8),
            ],
            TextField(
                controller: tagKeyCtrl,
                obscureText: true,
                decoration: const InputDecoration(
                    labelText: 'Tag 服务 Key（可空）', border: OutlineInputBorder())),
            const SizedBox(height: 8),
            FilledButton.tonal(
                onPressed: () => state.setSecret('tag', tagKeyCtrl.text),
                child: const Text('保存 Tag Key')),
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
              label: const Text('检测 Tag/MCP 服务'),
            ),
            SwitchListTile(
                title: const Text('灵感胶囊使用 MCP 标签搜索'),
                subtitle: const Text('开启后优先用远程服务补全；关闭仍可用内置胶囊和已下载标签库。'),
                value: s.mcpForCapsule,
                onChanged: (v) => state.setSettings((x) => x.mcpForCapsule = v)),
            SwitchListTile(
                title: const Text('转换使用 MCP 标签补强'),
                value: s.mcpForConvert,
                onChanged: (v) =>
                    state.setSettings((x) => x.mcpForConvert = v)),
            SwitchListTile(
                title: const Text('反推使用 MCP 标签补强'),
                value: s.mcpForReverse,
                onChanged: (v) =>
                    state.setSettings((x) => x.mcpForReverse = v)),
          ]),
          _Section(title: '翻译服务', children: [
            DropdownButtonFormField<String>(
              value: s.translateProvider,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: '翻译提供方',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'google', child: Text('Google 免费翻译')),
                DropdownMenuItem(value: 'baidu', child: Text('百度翻译 API')),
              ],
              onChanged: (value) => value == null
                  ? null
                  : state.setSettings((x) => x.translateProvider = value),
            ),
            if (s.translateProvider == 'baidu') ...[
              _TextSetting(
                label: '百度翻译 App ID',
                value: s.baiduAppId,
                onChanged: (value) =>
                    state.setSettings((x) => x.baiduAppId = value.trim()),
              ),
              TextField(
                controller: baiduSecretCtrl,
                obscureText: true,
                autocorrect: false,
                decoration: const InputDecoration(
                  labelText: '百度翻译密钥',
                  border: OutlineInputBorder(),
                ),
              ),
              FilledButton.tonalIcon(
                onPressed: () async {
                  await state.setSecret('baidu', baiduSecretCtrl.text);
                  baiduSecretCtrl.clear();
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('百度翻译密钥已保存到安全存储')),
                    );
                  }
                },
                icon: const Icon(Icons.key_outlined),
                label: const Text('保存百度翻译密钥'),
              ),
            ],
          ]),
          _Section(title: '提示词模板', children: [
            const Text('AI 反推模板'),
            ...ReversePromptMode.values.map((mode) => _TemplateTile(
                  title: mode.label,
                  customized:
                      s.reversePromptTemplates[mode.value]?.trim().isNotEmpty ??
                          false,
                  onTap: () => _editTemplate(context, 'reverse', mode),
                )),
            const Divider(),
            const Text('提示词转换模板'),
            ...ReversePromptMode.values.map((mode) => _TemplateTile(
                  title: mode.label,
                  customized:
                      s.convertPromptTemplates[mode.value]?.trim().isNotEmpty ??
                          false,
                  onTap: () => _editTemplate(context, 'convert', mode),
                )),
            const Divider(),
            _TemplateTile(
              title: 'AI 拆分分镜模板',
              customized: s.comicPromptTemplate.trim().isNotEmpty,
              onTap: () =>
                  _editTemplate(context, 'comic', ReversePromptMode.mixed),
            ),
            const Text('恢复默认会重新使用桌面端同步的完整模板，不会回到旧版短模板。'),
          ]),
          _Section(title: '提示词快捷模板', children: [
            if (s.promptShortcuts.isEmpty)
              const Text('暂无快捷模板。可保存常用前缀、后缀和负面提示词，在生成页一键应用。'),
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
                  tooltip: '删除',
                  onPressed: () => state.removePromptShortcut(template.id),
                  icon: const Icon(Icons.delete_outline),
                ),
              ),
            ),
            FilledButton.tonalIcon(
              onPressed: () => _addPromptShortcut(context),
              icon: const Icon(Icons.add),
              label: const Text('新建快捷模板'),
            ),
          ]),
          _Section(title: '存储与历史', children: [
            DropdownButtonFormField<int>(
              value: s.historyRetentionDays,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: '历史记录保留时间',
                border: OutlineInputBorder(),
              ),
              items: retentionOptions
                  .map(
                    (days) => DropdownMenuItem(
                      value: days,
                      child: Text(switch (days) {
                        30 => '30 天',
                        90 => '90 天',
                        365 => '1 年',
                        3650 => '长期保留（10 年）',
                        _ => '$days 天',
                      }),
                    ),
                  )
                  .toList(),
              onChanged: (value) => value == null
                  ? null
                  : state.setSettings((x) => x.historyRetentionDays = value),
            ),
            _TextSetting(
              label: '图片命名模板',
              value: s.imageNameTemplate,
              onChanged: (value) =>
                  state.setSettings((x) => x.imageNameTemplate = value),
            ),
            const Text(
              '可用变量：{date} {time} {seq} {seed} {model} {type} {name} {ts}',
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('保留 PNG 元数据'),
              subtitle: const Text('关闭后保存时移除提示词等文本元数据，便于隐私分享。'),
              value: s.keepImageMetadata,
              onChanged: (value) =>
                  state.setSettings((x) => x.keepImageMetadata = value),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('自动保存到系统相册'),
              subtitle: const Text('应用内仍保存一份原图；关闭后可从图库手动分享或导出。'),
              value: s.saveToGallery,
              onChanged: (value) =>
                  state.setSettings((x) => x.saveToGallery = value),
            ),
            if (Platform.isAndroid)
              _ImageOutputDirSetting(
                value: s.imageOutputDir,
                onChanged: (value) =>
                    state.setSettings((x) => x.imageOutputDir = value),
              ),
          ]),
          _Section(title: '外观 / 安全', children: [
            DropdownButtonFormField<String>(
              value: s.theme,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: '主题',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'system', child: Text('跟随系统')),
                DropdownMenuItem(value: 'light', child: Text('浅色')),
                DropdownMenuItem(value: 'dark', child: Text('深色')),
              ],
              onChanged: (value) => value == null
                  ? null
                  : state.setSettings((x) => x.theme = value),
            ),
            SwitchListTile(
                title: const Text('Tag 自动补全'),
                value: s.autoComplete,
                onChanged: (v) => state.setSettings((x) => x.autoComplete = v)),
            SwitchListTile(
              title: const Text('锁定风格提示词'),
              subtitle: const Text('应用重启和复用参数时继续保留当前风格提示词。'),
              value: s.lockStylePrompt,
              onChanged: (value) => state.setPromptLock('style', value),
            ),
            SwitchListTile(
              title: const Text('锁定负面提示词'),
              subtitle: const Text('应用快捷模板时不会覆盖锁定的负面提示词。'),
              value: s.lockNegativePrompt,
              onChanged: (value) => state.setPromptLock('negative', value),
            ),
            const ListTile(
              leading: Icon(Icons.security),
              title: Text('密钥只保存在本机安全存储'),
              subtitle: Text(
                  '移动端不支持 stdio MCP；iOS 不支持任意输出目录，使用 App Documents + 分享/Files/相册替代。'),
            ),
          ]),
          const ListTile(
              title: Text(appName), subtitle: Text('移动端全量移植版 · v$appVersion')),
        ],
      )),
    );
  }

  Future<void> _detect(BuildContext context, String kind) async {
    try {
      final models = await context.read<AppState>().detectModels(kind);
      if (!context.mounted) return;
      showDialog(
          context: context,
          builder: (_) => AlertDialog(
              title: const Text('模型检测'),
              content: Text(
                  models.isEmpty ? '未返回模型列表' : models.take(20).join('\n'))));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<void> _testProxy() async {
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
          SnackBar(content: Text('连接失败：$error')),
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
    final controller = TextEditingController(
      text: state.resolvedPromptTemplate(kind, mode),
    );
    final label = kind == 'reverse'
        ? 'AI 反推 · ${mode.label}'
        : kind == 'convert'
            ? '提示词转换 · ${mode.label}'
            : 'AI 拆分分镜';
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(label),
        content: SizedBox(
          // Wide on tablets, but never wider than the dialog on a phone (the old
          // fixed 720 overflowed small screens).
          width: MediaQuery.sizeOf(dialogContext).width > 800 ? 720 : double.maxFinite,
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
            child: const Text('恢复默认'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () async {
              await state.setPromptTemplate(kind, mode, controller.text);
              if (dialogContext.mounted) Navigator.pop(dialogContext);
            },
            child: const Text('保存'),
          ),
        ],
      ),
    );
    controller.dispose();
  }

  Future<void> _showTokenGuide(BuildContext context) => showDialog<void>(
        context: context,
        builder: (context) => const Dialog.fullscreen(
          child: _TokenGuideScreen(),
        ),
      );

  Future<void> _addPromptShortcut(BuildContext context) async {
    final name = TextEditingController();
    final prefix = TextEditingController();
    final suffix = TextEditingController();
    final negative = TextEditingController();
    final state = context.read<AppState>();
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('新建提示词快捷模板'),
        content: SizedBox(
          width: MediaQuery.sizeOf(dialogContext).width > 800 ? 560 : double.maxFinite,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: name,
                  autofocus: true,
                  decoration: const InputDecoration(labelText: '模板名称'),
                ),
                TextField(
                  controller: prefix,
                  maxLines: 2,
                  decoration: const InputDecoration(labelText: '正面提示词前缀'),
                ),
                TextField(
                  controller: suffix,
                  maxLines: 2,
                  decoration: const InputDecoration(labelText: '正面提示词后缀'),
                ),
                TextField(
                  controller: negative,
                  maxLines: 2,
                  decoration: const InputDecoration(labelText: '附加负面提示词'),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('取消'),
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
            child: const Text('保存'),
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
  final VoidCallback onTap;
  const _TemplateTile({
    required this.title,
    required this.customized,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.description_outlined),
        title: Text(title),
        subtitle: Text(customized ? '已自定义' : '使用内置完整模板'),
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
          children: children
              .expand((w) => [w, const SizedBox(height: 8)])
              .toList()
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
  const _ImageOutputDirSetting(
      {required this.value, required this.onChanged});
  final String value;
  final ValueChanged<String> onChanged;

  Future<void> _pick(BuildContext context) async {
    final picked = await FilePicker.platform
        .getDirectoryPath(dialogTitle: '选择图片存放文件夹');
    if (picked == null || picked.trim().isEmpty) return;
    final granted = await StoragePermission.hasAllFilesAccess();
    if (!granted && context.mounted) {
      final go = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('需要文件访问权限'),
          content: const Text(
              '保存到自定义文件夹需要「所有文件访问权限」。点「去授权」后在系统设置中开启，再返回应用即可生效；未授权时图片仍会存到应用目录。'),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('稍后')),
            FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('去授权')),
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
        Text('图片存放路径', style: theme.textTheme.bodyLarge),
        const SizedBox(height: 4),
        Text(
          custom.isEmpty ? '应用默认目录（按 日期/分组 归档）' : custom,
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 2),
        Text(
          '图片按 日期/分组 归档，与电脑端一致。自定义路径在 Android 11+ 需「所有文件访问权限」。',
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
              label: const Text('选择文件夹'),
            ),
            if (custom.isNotEmpty)
              TextButton(
                onPressed: () => onChanged(''),
                child: const Text('恢复默认'),
              ),
          ],
        ),
      ],
    );
  }
}

class _TokenGuideScreen extends StatelessWidget {
  const _TokenGuideScreen();

  static const steps = [
    (
      image: 'assets/token_guide/token-step-1.webp',
      title: '打开左上角菜单',
      description: '登录 NovelAI 生图页面后，点击左上角蓝圈标出的三横线菜单。',
    ),
    (
      image: 'assets/token_guide/token-step-2.webp',
      title: '进入 Account Settings',
      description: '菜单展开后，在 Account 区域点击蓝圈标出的 Account Settings。',
    ),
    (
      image: 'assets/token_guide/token-step-3.webp',
      title: '获取 Persistent API Token',
      description:
          '在 User Settings 的 Account 页面点击蓝圈标出的 Get Persistent API Token，并复制完整 Token。',
    ),
  ];

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('获取 NovelAI Persistent API Token'),
          leading: IconButton(
            tooltip: '关闭',
            onPressed: () => Navigator.pop(context),
            icon: const Icon(Icons.close),
          ),
        ),
        body: StudioContent(
          maxWidth: 980,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
            children: [
              const Text('按 NovelAI 当前网页界面操作，无需打开旧 API 文档。'),
              for (var index = 0; index < steps.length; index++)
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
                                  Text(steps[index].title,
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleMedium),
                                  Text(steps[index].description),
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
                                      steps[index].image,
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
                              steps[index].image,
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
                child: const ListTile(
                  leading: Icon(Icons.security),
                  title: Text('Token 等同账号凭证'),
                  subtitle: Text('只粘贴到本软件，不要截图、分享或写入项目文件。'),
                ),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: () => launchUrl(
                  Uri.parse('https://novelai.net/image'),
                  mode: LaunchMode.externalApplication,
                ),
                icon: const Icon(Icons.open_in_new),
                label: const Text('打开 NovelAI 生图页'),
              ),
            ],
          ),
        ),
      );
}
