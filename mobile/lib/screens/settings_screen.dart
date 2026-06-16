import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _tokenCtrl = TextEditingController();
  bool _verifying = false;
  bool _obscure = true;

  @override
  void dispose() {
    _tokenCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final token = _tokenCtrl.text.trim();
    if (token.isEmpty) return;
    setState(() => _verifying = true);
    final err = await context.read<AppState>().setToken(token);
    if (!mounted) return;
    setState(() => _verifying = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(err ?? 'Token 验证成功')),
    );
    if (err == null) _tokenCtrl.clear();
  }

  @override
  Widget build(BuildContext context) {
    final account = context.watch<AppState>().account;
    return Scaffold(
      appBar: AppBar(title: const Text('设置')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        account.hasToken ? Icons.check_circle : Icons.error_outline,
                        color: account.hasToken ? Colors.green : Colors.orange,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        account.hasToken
                            ? '已配置（${account.tierName ?? "已验证"}）'
                            : '未配置 API Token',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ],
                  ),
                  if (account.hasToken && account.anlasBalance != null) ...[
                    const SizedBox(height: 8),
                    Text('Anlas 余额：${account.anlasBalance}'),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          const Text('NovelAI Persistent API Token'),
          const SizedBox(height: 8),
          TextField(
            controller: _tokenCtrl,
            obscureText: _obscure,
            decoration: InputDecoration(
              border: const OutlineInputBorder(),
              hintText: '粘贴你的 pst-... Token',
              suffixIcon: IconButton(
                icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _verifying ? null : _save,
              child: _verifying
                  ? const SizedBox(
                      height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('验证并保存'),
            ),
          ),
          if (account.hasToken) ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () => context.read<AppState>().clearToken(),
                child: const Text('清除 Token'),
              ),
            ),
          ],
          const SizedBox(height: 24),
          const Divider(),
          const SizedBox(height: 8),
          const ListTile(
            leading: Icon(Icons.info_outline),
            title: Text('关于'),
            subtitle: Text('NovelAI Studio 移动端 · Phase 1\n仅通过官方 API 生成，Token 只保存在本机'),
          ),
        ],
      ),
    );
  }
}
