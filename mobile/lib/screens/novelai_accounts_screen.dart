import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';

class NovelAiAccountSelector extends StatelessWidget {
  const NovelAiAccountSelector({super.key});
  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final profiles = state.naiAccounts.profiles;
    final accent = Theme.of(context).colorScheme.primary;
    final active = state.naiAccounts.active?.profile;
    return Material(
        color: Theme.of(context).colorScheme.surfaceContainerLow,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(
                color: Theme.of(context).colorScheme.outlineVariant)),
        clipBehavior: Clip.antiAlias,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Row(children: [
            Icon(Icons.account_circle_outlined, color: accent, size: 20),
            const SizedBox(width: 8),
            Expanded(
                child: DropdownButton<String>(
              isExpanded: true,
              underline: const SizedBox.shrink(),
              value: active?.id ?? '',
              borderRadius: BorderRadius.circular(12),
              dropdownColor: Theme.of(context).colorScheme.surface,
              icon: const Icon(Icons.expand_more, size: 18),
              items: [
                const DropdownMenuItem(
                    value: '',
                    child:
                        Text('原有账户（保留旧设置）', overflow: TextOverflow.ellipsis)),
                ...profiles.map((p) => DropdownMenuItem(
                    value: p.id,
                    child: Text('${p.label} · ${p.relay ? '第三方' : '官方'}',
                        overflow: TextOverflow.ellipsis)))
              ],
              onChanged: state.naiAccountLocked
                  ? null
                  : (id) async {
                      try {
                        await state.activateNaiAccount(id == '' ? null : id);
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
                icon: Icon(Icons.manage_accounts_outlined,
                    color: accent, size: 18),
                label: Text('管理', style: TextStyle(color: accent)),
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
                  color: Theme.of(context).colorScheme.primary),
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
          Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: SegmentedButton<String>(
                  style: SegmentedButton.styleFrom(
                      visualDensity: VisualDensity.standard),
                  segments: const [
                    ButtonSegment(
                        value: 'token',
                        icon: Icon(Icons.key_outlined, size: 16),
                        label: Text('Token')),
                    ButtonSegment(
                        value: 'official-login',
                        icon: Icon(Icons.mail_outline, size: 16),
                        label: Text('邮箱密码')),
                    ButtonSegment(
                        value: 'relay',
                        icon: Icon(Icons.public, size: 16),
                        label: Text('中转'))
                  ],
                  selected: {method},
                  onSelectionChanged: locked
                      ? null
                      : (values) {
                          password.clear();
                          token.clear();
                          setState(() {
                            method = values.single;
                            confirmedRelay = false;
                          });
                        })),
          AnimatedSwitcher(
              duration: MediaQuery.of(context).disableAnimations
                  ? Duration.zero
                  : const Duration(milliseconds: 180),
              child: Align(
                  key: ValueKey(method),
                  alignment: Alignment.centerLeft,
                  child: Text(
                      method == 'relay'
                          ? '使用中转站自己的 Token，费用由服务方决定。'
                          : method == 'official-login'
                              ? '仅向官方登录，不保存密码。'
                              : '使用 NovelAI 官方 Token。',
                      style: TextStyle(
                          fontSize: 12,
                          color: Theme.of(context)
                              .colorScheme
                              .onSurfaceVariant)))),
          field(label, '账号名称'),
          if (method == 'official-login') ...[
            field(email, '官方邮箱（使用注册时的准确形式）'),
            field(password, '密码（仅本次使用，不保存）', secret: true),
            const ExpansionTile(title: Text('登录与凭据说明'), children: [
              Text(
                  '本地 BLAKE2b-128 + Argon2id 派生，遵循当前 NovelAI 代理设置，仅向 https://api.novelai.net/user/login 发送派生密钥（总超时 30 秒，禁止重定向）。算法以公开实现离线验证；官方支持承诺、实际登录和二次验证流程尚未验证。推荐使用官方 Token。')
            ]),
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
            const ExpansionTile(title: Text('中转连接说明'), children: [
              Text(
                  '不使用 OpenAI /v1/images/generations，不探测未知接口。支持 NovelAI /ai/generate-image、/ai/upscale、/ai/augment-image 和显式前缀。newapi.chinahk.qzz.io 仅观察到公开登录页，真实 API 路径未知，不能凭域名自动填充。')
            ]),
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
              style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(44),
                  backgroundColor: Theme.of(context).colorScheme.primary),
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
