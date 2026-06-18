import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/nai_models.dart';
import '../state/app_state.dart';

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
  bool verifying = false;

  @override
  void dispose() {
    tokenCtrl.dispose();
    visionKeyCtrl.dispose();
    convertKeyCtrl.dispose();
    tagKeyCtrl.dispose();
    super.dispose();
  }

  Future<void> _saveToken() async {
    setState(() => verifying = true);
    final err = await context.read<AppState>().setToken(tokenCtrl.text);
    if (!mounted) return;
    setState(() => verifying = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err ?? 'Token 验证成功')));
    if (err == null) tokenCtrl.clear();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final s = state.settings;
    final account = state.account;
    return Scaffold(
      appBar: AppBar(title: const Text('设置')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: Icon(account.hasToken ? Icons.check_circle : Icons.error_outline, color: account.hasToken ? Colors.green : Colors.orange),
              title: Text(account.hasToken ? '已配置（${account.tierName ?? "已验证"}）' : '未配置 NovelAI API Token'),
              subtitle: Text(account.anlasBalance == null ? 'Anlas：未知' : 'Anlas：${account.anlasBalance}'),
              trailing: IconButton(icon: const Icon(Icons.refresh), onPressed: state.refreshAnlas),
            ),
          ),
          _Section(title: 'NovelAI API', children: [
            _TextSetting(label: 'API Base URL', value: s.apiBaseUrl, onChanged: (v) => state.setSettings((x) => x.apiBaseUrl = v)),
            _TextSetting(label: 'Image Base URL', value: s.imageBaseUrl, onChanged: (v) => state.setSettings((x) => x.imageBaseUrl = v)),
            TextField(controller: tokenCtrl, obscureText: true, decoration: const InputDecoration(labelText: 'Persistent API Token', border: OutlineInputBorder())),
            const SizedBox(height: 8),
            FilledButton(onPressed: verifying ? null : _saveToken, child: Text(verifying ? '验证中...' : '验证并保存 Token')),
            if (account.hasToken) OutlinedButton(onPressed: state.clearToken, child: const Text('清除 Token')),
          ]),
          _Section(title: 'AI 反推', children: [
            _TextSetting(label: '视觉 API 地址', value: s.visionApiUrl, onChanged: (v) => state.setSettings((x) => x.visionApiUrl = v)),
            _TextSetting(label: '视觉模型', value: s.visionApiModel, onChanged: (v) => state.setSettings((x) => x.visionApiModel = v)),
            TextField(controller: visionKeyCtrl, obscureText: true, decoration: const InputDecoration(labelText: '视觉 API Key', border: OutlineInputBorder())),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: FilledButton.tonal(onPressed: () => state.setSecret('vision', visionKeyCtrl.text), child: const Text('保存 Key'))),
              const SizedBox(width: 8),
              Expanded(child: OutlinedButton(onPressed: () => _detect(context, 'reverse'), child: const Text('检测模型'))),
            ]),
          ]),
          _Section(title: '转换 API', children: [
            _TextSetting(label: '文本 API 地址', value: s.convertApiUrl, onChanged: (v) => state.setSettings((x) => x.convertApiUrl = v)),
            _TextSetting(label: '文本模型', value: s.convertApiModel, onChanged: (v) => state.setSettings((x) => x.convertApiModel = v)),
            TextField(controller: convertKeyCtrl, obscureText: true, decoration: const InputDecoration(labelText: '文本 API Key', border: OutlineInputBorder())),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: FilledButton.tonal(onPressed: () => state.setSecret('convert', convertKeyCtrl.text), child: const Text('保存 Key'))),
              const SizedBox(width: 8),
              Expanded(child: OutlinedButton(onPressed: () => _detect(context, 'convert'), child: const Text('检测模型'))),
            ]),
          ]),
          _Section(title: 'Tag / MCP', children: [
            _TextSetting(label: 'Tag/MCP 地址', value: s.tagServerUrl, onChanged: (v) => state.setSettings((x) => x.tagServerUrl = v)),
            DropdownButtonFormField<String>(
              value: s.tagServerType,
              decoration: const InputDecoration(labelText: '服务类型', border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: 'rest', child: Text('REST')),
                DropdownMenuItem(value: 'http', child: Text('Streamable HTTP MCP')),
                DropdownMenuItem(value: 'sse', child: Text('SSE MCP')),
              ],
              onChanged: (v) => v == null ? null : state.setSettings((x) => x.tagServerType = v),
            ),
            const SizedBox(height: 8),
            TextField(controller: tagKeyCtrl, obscureText: true, decoration: const InputDecoration(labelText: 'Tag 服务 Key（可空）', border: OutlineInputBorder())),
            const SizedBox(height: 8),
            FilledButton.tonal(onPressed: () => state.setSecret('tag', tagKeyCtrl.text), child: const Text('保存 Tag Key')),
            SwitchListTile(title: const Text('转换使用 MCP 标签补强'), value: s.mcpForConvert, onChanged: (v) => state.setSettings((x) => x.mcpForConvert = v)),
            SwitchListTile(title: const Text('反推使用 MCP 标签补强'), value: s.mcpForReverse, onChanged: (v) => state.setSettings((x) => x.mcpForReverse = v)),
          ]),
          _Section(title: '外观 / 安全', children: [
            SwitchListTile(title: const Text('深色主题'), value: s.darkMode, onChanged: (v) => state.setSettings((x) => x.darkMode = v)),
            SwitchListTile(title: const Text('Tag 自动补全'), value: s.autoComplete, onChanged: (v) => state.setSettings((x) => x.autoComplete = v)),
            const ListTile(
              leading: Icon(Icons.security),
              title: Text('密钥只保存在本机安全存储'),
              subtitle: Text('移动端不支持 stdio MCP；iOS 不支持任意输出目录，使用 App Documents + 分享/Files/相册替代。'),
            ),
          ]),
          const ListTile(title: Text(appName), subtitle: Text('移动端全量移植版 · v$appVersion')),
        ],
      ),
    );
  }

  Future<void> _detect(BuildContext context, String kind) async {
    try {
      final models = await context.read<AppState>().detectModels(kind);
      if (!context.mounted) return;
      showDialog(context: context, builder: (_) => AlertDialog(title: const Text('模型检测'), content: Text(models.isEmpty ? '未返回模型列表' : models.take(20).join('\n'))));
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }
}

class _Section extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _Section({required this.title, required this.children});
  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(top: 16),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            ...children.expand((w) => [w, const SizedBox(height: 8)]).toList()..removeLast(),
          ]),
        ),
      );
}

class _TextSetting extends StatelessWidget {
  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  const _TextSetting({required this.label, required this.value, required this.onChanged});
  @override
  Widget build(BuildContext context) => TextFormField(initialValue: value, decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()), onChanged: onChanged);
}
