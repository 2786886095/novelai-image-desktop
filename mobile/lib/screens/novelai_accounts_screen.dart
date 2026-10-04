import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../services/novelai_accounts.dart';
import '../services/novelai_official_auth.dart';
import '../ui/studio_theme.dart';
import '../i18n/studio_agent_text.dart';

String _accountText(BuildContext context, String key, {String? name}) =>
    studioAgentText(context.read<AppState>().settings.language, key,
        name: name);
String _accountMethod(BuildContext context, NovelAiAccount p) => _accountText(
    context,
    p.method == 'relay'
        ? 'accountMethodRelay'
        : p.method == 'official-login'
            ? 'accountMethodEmail'
            : 'accountMethodKey');

class NovelAiAccountSelector extends StatelessWidget {
  const NovelAiAccountSelector({super.key, this.showManage = true});
  final bool showManage;
  @override
  Widget build(BuildContext context) {
    String t(String key) => _accountText(context, key);
    final state = context.watch<AppState>(),
        profiles = state.naiAccounts.profiles;
    final active = state.naiAccounts.active?.profile,
        color = Theme.of(context).colorScheme;
    return Material(
        color: color.surfaceContainerLow,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Row(children: [
              Icon(Icons.account_circle_outlined,
                  color: color.primary, size: 20),
              const SizedBox(width: 8),
              Expanded(
                  child: DropdownButton<String>(
                      isExpanded: true,
                      underline: const SizedBox.shrink(),
                      value: active?.id ?? '',
                      borderRadius: BorderRadius.circular(12),
                      items: [
                        DropdownMenuItem(
                            value: '',
                            child: Text(t('accountLoggedOut'),
                                overflow: TextOverflow.ellipsis)),
                        ...profiles.map((p) => DropdownMenuItem(
                            value: p.id,
                            child: Text(
                                '${p.label} · ${_accountMethod(context, p)}',
                                overflow: TextOverflow.ellipsis)))
                      ],
                      onChanged: state.naiAccountLocked
                          ? null
                          : (id) async {
                              try {
                                await state
                                    .activateNaiAccount(id == '' ? null : id);
                              } catch (_) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                          content:
                                              Text(t('accountSwitchBusy'))));
                                }
                              }
                            })),
              if (state.naiAccountLocked)
                Tooltip(
                    message: t('accountLocked'),
                    child: const Icon(Icons.lock_outline, size: 18)),
              if (showManage)
                TextButton.icon(
                    icon: const Icon(Icons.manage_accounts_outlined, size: 18),
                    label: Text(t('accountManage')),
                    onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                            builder: (_) => const NovelAiAccountsScreen())))
            ])));
  }
}

class _VerificationMessage {
  final bool ok;
  final String title, detail;
  _VerificationMessage(this.ok, this.title, this.detail);
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
  String t(String key, {String? name}) =>
      _accountText(context, key, name: name);
  String method = 'token';
  bool submitting = false, showInputKey = false, initialized = false;
  final visibleKeys = <String>{};
  final results = <String, _VerificationMessage>{};
  _VerificationMessage? message;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!initialized) {
      label.text = context.read<AppState>().naiAccounts.nextLabel;
      initialized = true;
    }
  }

  @override
  void dispose() {
    for (final c in [label, token, email, password, api, image]) {
      c.dispose();
    }
    super.dispose();
  }

  _VerificationMessage failure(Object error) {
    if (error is NovelAiOfficialAuthFailure) {
      final key = switch (error.code) {
        'otp-unsupported' => 'accountLoginOtp',
        'challenge' => 'accountLoginChallenge',
        'rate-limited' => 'accountLoginRateLimited',
        'invalid-response' => 'accountLoginInvalidResponse',
        'network' => 'accountLoginNetwork',
        _ => 'accountLoginRejected'
      };
      return _VerificationMessage(false, t('accountFailed'),
          '${error.status != null ? 'HTTP ${error.status} · ' : ''}${t(key)}');
    }
    final text = error is FormatException ? error.message.toString() : '';
    final match =
        RegExp(r'NAI_ACCOUNT_VALIDATION:([a-z-]+):(\d+)').firstMatch(text);
    final detail = match == null
        ? t('accountSaveFailed')
        : 'HTTP ${match.group(2)} · ${switch (match.group(1)) {
            'unsupported' => t('accountUnsupported'),
            'auth' => t('accountAuthFailed'),
            'invalid-response' => t('accountInvalidResponse'),
            _ => t('accountValidationFailed')
          }}';
    return _VerificationMessage(false, t('accountFailed'), detail);
  }

  Future<void> save() async {
    if (submitting) return;
    final state = context.read<AppState>(), secret = password.text;
    password.clear();
    setState(() => submitting = true);
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
      setState(() {
        message = _VerificationMessage(
            true, t('accountSaved'), t('accountSavedDetail'));
        token.clear();
        email.clear();
        label.text = state.naiAccounts.nextLabel;
      });
    } catch (error) {
      if (mounted) setState(() => message = failure(error));
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  Widget status(_VerificationMessage value) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final fg = value.ok
        ? (dark ? Colors.greenAccent.shade100 : Colors.green.shade800)
        : Theme.of(context).colorScheme.error;
    return Container(
        margin: const EdgeInsets.only(top: 10),
        decoration: BoxDecoration(
            color: fg.withOpacity(.08),
            border: Border.all(color: fg.withOpacity(.4)),
            borderRadius: BorderRadius.circular(12)),
        child: ExpansionTile(
            iconColor: fg,
            textColor: fg,
            collapsedIconColor: fg,
            collapsedTextColor: fg,
            leading: Icon(
                value.ok ? Icons.check_circle_outline : Icons.error_outline,
                color: fg),
            title: Text(value.title),
            childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            children: [
              Align(
                  alignment: Alignment.centerLeft,
                  child: Text(value.detail, style: TextStyle(color: fg)))
            ]));
  }

  Widget account(NovelAiAccount p, bool locked, AppState state) {
    final active = state.naiAccounts.active?.profile.id == p.id,
        cache = active ? state.account : state.naiAccounts.cachedSummary(p.id);
    return Card(
        child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(p.label, style: Theme.of(context).textTheme.titleMedium),
                  Text(_accountMethod(context, p),
                      style: Theme.of(context).textTheme.bodySmall),
                  Text(p.imageBaseUrl,
                      maxLines: 2, overflow: TextOverflow.ellipsis),
                  if (cache.anlasBalance != null)
                    Text(
                        'Anlas: ${cache.anlasBalance}${cache.stale ? t('accountCached') : ''}'),
                  const SizedBox(height: 8),
                  Row(children: [
                    Expanded(
                        child: InputDecorator(
                            decoration: const InputDecoration(
                                labelText: 'API Token',
                                border: OutlineInputBorder()),
                            child: visibleKeys.contains(p.id)
                                ? SelectableText(state.naiAccounts.reveal(p.id),
                                    maxLines: 2)
                                : const Text('••••••••••'))),
                    IconButton(
                        tooltip: visibleKeys.contains(p.id)
                            ? t('accountHideKey')
                            : t('accountViewKey'),
                        icon: Icon(visibleKeys.contains(p.id)
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined),
                        onPressed: () => setState(() =>
                            visibleKeys.contains(p.id)
                                ? visibleKeys.remove(p.id)
                                : visibleKeys.add(p.id))),
                    IconButton(
                        tooltip: t('accountCopyKey'),
                        icon: const Icon(Icons.copy_outlined),
                        onPressed: () async {
                          await Clipboard.setData(ClipboardData(
                              text: state.naiAccounts.reveal(p.id)));
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text(t('accountKeyCopied'))));
                          }
                        })
                  ]),
                  Wrap(spacing: 8, children: [
                    TextButton(
                        onPressed: locked || active
                            ? null
                            : () async {
                                try {
                                  await state.activateNaiAccount(p.id);
                                } catch (_) {
                                  if (mounted) {
                                    setState(() => message =
                                        _VerificationMessage(
                                            false,
                                            t('accountNotSwitched'),
                                            t('accountBusy')));
                                  }
                                }
                              },
                        child: Text(
                            active ? t('accountCurrent') : t('accountUse'))),
                    TextButton(
                        onPressed: locked
                            ? null
                            : () async {
                                setState(() => submitting = true);
                                try {
                                  final summary =
                                      await state.verifyNaiAccount(p.id);
                                  if (mounted) {
                                    setState(() => results[
                                        p
                                            .id] = _VerificationMessage(
                                        true,
                                        t('accountVerified'),
                                        summary.anlasBalance == null
                                            ? t('accountNoBalance')
                                            : t('accountBalanceVerified',
                                                name:
                                                    '${summary.anlasBalance}')));
                                  }
                                } catch (error) {
                                  if (mounted) {
                                    setState(
                                        () => results[p.id] = failure(error));
                                  }
                                } finally {
                                  if (mounted) {
                                    setState(() => submitting = false);
                                  }
                                }
                              },
                        child: Text(t('accountVerify'))),
                    TextButton(
                        onPressed: locked
                            ? null
                            : () async {
                                final yes = await showDialog<bool>(
                                    context: context,
                                    builder: (ctx) => AlertDialog(
                                            title: Text(t('accountDeleteTitle',
                                                name: p.label)),
                                            content:
                                                Text(t('accountDeleteDetail')),
                                            actions: [
                                              TextButton(
                                                  onPressed: () =>
                                                      Navigator.pop(ctx, false),
                                                  child:
                                                      Text(t('accountCancel'))),
                                              TextButton(
                                                  onPressed: () =>
                                                      Navigator.pop(ctx, true),
                                                  child:
                                                      Text(t('accountDelete')))
                                            ]));
                                if (yes != true) return;
                                try {
                                  await state.removeNaiAccount(p.id);
                                  visibleKeys.remove(p.id);
                                  results.remove(p.id);
                                } catch (_) {
                                  if (mounted) {
                                    setState(() => message =
                                        _VerificationMessage(
                                            false,
                                            t('accountNotDeleted'),
                                            t('accountDeleteFailed')));
                                  }
                                }
                              },
                        child: Text(t('accountDelete')))
                  ]),
                  if (results[p.id] != null) status(results[p.id]!)
                ])));
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>(),
        locked = state.naiAccountLocked || submitting;
    Widget field(TextEditingController c, String title,
            {bool secret = false, String? hint}) =>
        Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: TextField(
                controller: c,
                enabled: !locked,
                obscureText: secret && !showInputKey,
                autocorrect: false,
                enableSuggestions: !secret,
                decoration: InputDecoration(
                    labelText: title,
                    hintText: hint,
                    border: const OutlineInputBorder(),
                    suffixIcon: secret
                        ? IconButton(
                            tooltip: showInputKey
                                ? t('accountHideKey')
                                : t('accountViewKey'),
                            onPressed: () =>
                                setState(() => showInputKey = !showInputKey),
                            icon: Icon(showInputKey
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined))
                        : null)));
    return Scaffold(
        appBar: AppBar(title: Text(t('accountManager'))),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const NovelAiAccountSelector(showManage: false),
          const SizedBox(height: 12),
          Text(t('accountSecurityHint')),
          for (final p in state.naiAccounts.profiles) account(p, locked, state),
          const Divider(),
          Text(t('accountAdd')),
          Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: SegmentedButton<String>(
                  segments: [
                    ButtonSegment(
                        value: 'token',
                        icon: MediaQuery.sizeOf(context).width < 370
                            ? null
                            : const Icon(Icons.key_outlined, size: 16),
                        label: Text(t('accountOfficialShort'))),
                    ButtonSegment(
                        value: 'official-login',
                        icon: MediaQuery.sizeOf(context).width < 370
                            ? null
                            : const Icon(Icons.mail_outline, size: 16),
                        label: Text(t('accountEmailShort'))),
                    ButtonSegment(
                        value: 'relay',
                        icon: MediaQuery.sizeOf(context).width < 370
                            ? null
                            : const Icon(Icons.public, size: 16),
                        label: Text(t('accountRelayShort')))
                  ],
                  selected: {
                    method
                  },
                  onSelectionChanged: locked
                      ? null
                      : (values) {
                          FocusManager.instance.primaryFocus?.unfocus();
                          password.clear();
                          token.clear();
                          setState(() => method = values.single);
                        })),
          AnimatedSwitcher(
              duration: MediaQuery.of(context).disableAnimations
                  ? Duration.zero
                  : AppMotion.standard,
              child: Align(
                  key: ValueKey(method),
                  alignment: Alignment.centerLeft,
                  child: Text(method == 'relay'
                      ? t('accountRelayHint')
                      : method == 'official-login'
                          ? t('accountEmailHint')
                          : t('accountOfficialHint')))),
          field(label, t('accountLabel')),
          if (method == 'official-login') ...[
            field(email, t('accountEmail')),
            field(password, t('accountPassword'), secret: true)
          ] else
            field(
                token,
                method == 'relay'
                    ? t('accountRelayKey')
                    : t('accountMethodKey'),
                secret: true),
          if (method == 'relay') ...[
            field(api, t('accountApiAddress'), hint: 'https://relay.example'),
            Text(t('accountAddressHint')),
            field(image, t('accountImageAddress'),
                hint: 'https://images.relay.example')
          ],
          FilledButton(
              onPressed: locked ? null : save,
              child: Text(
                  submitting ? t('accountVerifying') : t('accountVerifySave'))),
          if (message != null) status(message!)
        ]));
  }
}
