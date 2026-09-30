import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';

const _purple = Color(0xff7856d8);

class NovelAiAccountSelector extends StatelessWidget {
  const NovelAiAccountSelector({super.key});
  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final profiles = state.naiAccounts.profiles;
    final active = state.naiAccounts.active?.profile;
    return Material(
        color: _purple.withOpacity(.12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Row(children: [
            const Icon(Icons.account_circle, color: _purple),
            const SizedBox(width: 8),
            Expanded(
                child: DropdownButton<String>(
              isExpanded: true,
              underline: const SizedBox.shrink(),
              value: active?.id,
              hint: const Text('选择 NovelAI 账号'),
              items: profiles
                  .map((p) => DropdownMenuItem(
                      value: p.id,
                      child: Text('${p.label} · ${p.relay ? '第三方' : '官方'}',
                          overflow: TextOverflow.ellipsis)))
                  .toList(),
              onChanged: state.naiAccountLocked
                  ? null
                  : (id) async {
                      try {
                        await state.activateNaiAccount(id);
                      } catch (_) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                  content: Text('任务或账号操作进行中，未切换账号')));
                        }
                      }
                    },
            )),
            if (state.naiAccountLocked)
              const Tooltip(
                  message: '任务进行中，账号已锁定',
                  child: Icon(Icons.lock_outline, size: 18)),
            TextButton.icon(
                icon: const Icon(Icons.manage_accounts, color: _purple),
                label: const Text('管理', style: TextStyle(color: _purple)),
                onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                        builder: (_) => const NovelAiAccountsScreen()))),
          ]),
        ));
  }
}

class NovelAiAccountsScreen extends StatefulWidget {
  const NovelAiAccountsScreen({super.key});
  @override
  State<NovelAiAccountsScreen> createState() => _NovelAiAccountsScreenState();
}

class _NovelAiAccountsScreenState extends State<NovelAiAccountsScreen> {
  final label = TextEditingController(),
      token = TextEditingController(),
      email = TextEditingController(),
      password = TextEditingController(),
      api = TextEditingController(),
      image = TextEditingController();
  String method = 'token', message = '';
  bool submitting = false, confirmedRelay = false;
  @override
  void dispose() {
    for (final c in [label, token, email, password, api, image]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> save() async {
    if (submitting) return;
    final state = context.read<AppState>();
    if (method == 'relay' && !confirmedRelay) {
      setState(() => message = '请确认服务方给出的 NovelAI 原生 API 前缀');
      return;
    }
    final secret = password.text;
    password.clear();
    setState(() {
      submitting = true;
      message = '';
    });
    try {
      await state.addNaiAccount(
          label: label.text,
          method: method,
          token: token.text,
          email: email.text,
          password: secret,
          apiBaseUrl: api.text,
          imageBaseUrl: image.text);
      if (!mounted) return;
      token.clear();
      email.clear();
      label.clear();
      setState(() => message = '已保存并激活；没有进行生成测试。余额与第三方计费规则需由服务方确认。');
    } catch (error) {
      if (!mounted) return;
      setState(() => message = error is FormatException
          ? error.message.toString()
          : '账号未激活：检查系统凭据库、账号输入或正在运行的任务。官方若要求二次验证，请改用 Persistent API Token。没有自动重试。');
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final locked = state.naiAccountLocked || submitting;
    Widget field(TextEditingController c, String title,
            {bool secret = false}) =>
        Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: TextField(
                controller: c,
                enabled: !locked,
                obscureText: secret,
                autocorrect: false,
                enableSuggestions: !secret,
                decoration: InputDecoration(
                    labelText: title, border: const OutlineInputBorder())));
    return Scaffold(
        appBar: AppBar(title: const Text('NovelAI 多账号工作区')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const NovelAiAccountSelector(),
          const SizedBox(height: 12),
          const Text(
              '凭据保存在 Android / iOS 系统安全存储。旧单账号凭据保留；取消激活不删除旧凭据。运行中的任务固定账号和地址，禁止切换、删除或替换。'),
          for (final p in state.naiAccounts.profiles)
            Card(
                child: ListTile(
              title: Text(p.label),
              subtitle: Text('${p.method}\n${p.imageBaseUrl}'),
              isThreeLine: true,
              leading: Icon(
                  p.id == state.naiAccounts.active?.profile.id
                      ? Icons.radio_button_checked
                      : Icons.radio_button_off,
                  color: _purple),
              onTap: locked
                  ? null
                  : () async {
                      try {
                        await state.activateNaiAccount(p.id);
                      } catch (_) {
                        if (mounted) setState(() => message = '账号正在使用，未切换');
                      }
                    },
              trailing: IconButton(
                  tooltip: '删除账号',
                  icon: const Icon(Icons.delete_outline),
                  onPressed: locked
                      ? null
                      : () async {
                          final yes = await showDialog<bool>(
                              context: context,
                              builder: (context) => AlertDialog(
                                      title: Text('删除 ${p.label}？'),
                                      content:
                                          const Text('只删除此工作区账号，旧凭据不会被覆盖。'),
                                      actions: [
                                        TextButton(
                                            onPressed: () =>
                                                Navigator.pop(context, false),
                                            child: const Text('取消')),
                                        TextButton(
                                            onPressed: () =>
                                                Navigator.pop(context, true),
                                            child: const Text('删除'))
                                      ]));
                          if (yes != true) return;
                          try {
                            await state.removeNaiAccount(p.id);
                          } catch (_) {
                            if (mounted) {
                              setState(() => message = '账号正在使用或凭据库写入失败，未删除');
                            }
                          }
                        }),
            )),
          const Divider(),
          DropdownButtonFormField<String>(
              value: method,
              decoration: const InputDecoration(labelText: '添加方式'),
              items: const [
                DropdownMenuItem(
                    value: 'token', child: Text('官方 Persistent API Token')),
                DropdownMenuItem(
                    value: 'official-login', child: Text('官方邮箱 + 密码')),
                DropdownMenuItem(
                    value: 'relay', child: Text('第三方 NovelAI 兼容 Token'))
              ],
              onChanged: locked
                  ? null
                  : (v) {
                      password.clear();
                      token.clear();
                      setState(() {
                        method = v!;
                        confirmedRelay = false;
                      });
                    }),
          field(label, '账号名称'),
          if (method == 'official-login') ...[
            field(email, '官方邮箱（使用注册时的准确形式）'),
            field(password, '密码（仅本次使用，不保存）', secret: true),
            const Text(
                '本地 BLAKE2b-128 + Argon2id 派生，遵循当前 NovelAI 代理设置，仅向 https://api.novelai.net/user/login 发送派生密钥（总超时 30 秒，禁止重定向）。算法以公开实现离线验证；官方支持承诺、实际登录和二次验证流程尚未验证。推荐使用官方 Token。'),
          ] else
            field(
                token,
                method == 'relay'
                    ? '此第三方服务自己的 Bearer Token'
                    : '官方 Persistent API Token',
                secret: true),
          if (method == 'relay') ...[
            field(api, '第三方通用 API 前缀（HTTPS）'),
            field(image, '第三方图片 API 前缀或 /ai/generate-image 地址'),
            const Text(
                '不使用 OpenAI /v1/images/generations，不探测未知接口。支持 NovelAI /ai/generate-image、/ai/upscale、/ai/augment-image 和显式前缀。newapi.chinahk.qzz.io 仅观察到公开登录页，真实 API 路径未知，不能凭域名自动填充。'),
            CheckboxListTile(
                value: confirmedRelay,
                onChanged: locked
                    ? null
                    : (v) => setState(() => confirmedRelay = v ?? false),
                title: const Text('我已从服务方确认 NovelAI 原生 API 前缀，并接受其独立计费')),
          ],
          const SizedBox(height: 12),
          FilledButton(
              onPressed: locked ? null : save,
              style: FilledButton.styleFrom(backgroundColor: _purple),
              child: Text(submitting
                  ? '正在保存…'
                  : method == 'official-login'
                      ? '登录、保存并激活'
                      : '保存并激活（不生成测试）')),
          if (message.isNotEmpty)
            Padding(padding: const EdgeInsets.all(12), child: Text(message)),
        ]));
  }
}
