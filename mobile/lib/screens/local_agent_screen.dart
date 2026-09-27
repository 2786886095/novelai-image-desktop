import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../agent/agent_controller.dart';
import '../agent/local_agent_bridge.dart';
import '../i18n/local_agent_text.dart';
import '../state/app_state.dart';
import 'agent_screen.dart';

class LocalAgentScreen extends StatefulWidget {
  final ValueNotifier<bool> visible;
  const LocalAgentScreen({super.key, required this.visible});
  @override
  State<LocalAgentScreen> createState() => _LocalAgentScreenState();
}

class _LocalAgentScreenState extends State<LocalAgentScreen> {
  static const _native = MethodChannel('langbai.novelai/local_agent');
  Map<String, dynamic> _state = {};
  List<String> _backups = [];
  Timer? _poll;
  bool _request = false, _reading = false, _checked = false, _launching = false;
  String? _error;
  LocalAgentBridge? _bridge;
  AgentController? _controller;
  String t(String key) =>
      localAgentText(context.read<AppState>().settings.language, key);
  bool get busy => _request || _launching || _state['busy'] == true;
  bool get running => _state['running'] == true;
  @override
  void initState() {
    super.initState();
    widget.visible.addListener(_visible);
    _poll = Timer.periodic(const Duration(seconds: 1), (_) {
      if (widget.visible.value || _bridge != null) _refresh();
    });
    _visible();
  }

  void _visible() {
    if (!widget.visible.value) {
      _checked = false;
      return;
    }
    _refresh();
  }

  Future<void> _refresh() async {
    if (_reading) return;
    _reading = true;
    try {
      final state = await _native.invokeMapMethod<String, dynamic>('status');
      final backups = await _native.invokeListMethod<String>('backups');
      if (mounted) {
        setState(() {
          _state = state ?? {};
          _backups = backups ?? [];
        });
      }
      if (!_launching &&
          state?['running'] != true &&
          state?['busy'] != true &&
          _bridge != null) {
        await _closeBridge();
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      _reading = false;
    }
    if (mounted &&
        widget.visible.value &&
        !_checked &&
        _state['supported'] == true &&
        !busy) {
      _checked = true;
      unawaited(_act('check'));
    }
  }

  Future<void> _act(String name, [Map<String, dynamic> args = const {}]) async {
    if (_request) return;
    setState(() {
      _request = true;
      _error = null;
    });
    try {
      await _native.invokeMethod(name, {
        ...args,
        'notificationTitle': t('title'),
        'notificationBody': t('notification'),
        'stopLabel': t('stop')
      });
      await _refresh();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _request = false);
    }
  }

  Future<void> _start() async {
    if (busy) return;
    final app = context.read<AppState>();
    setState(() => _launching = true);
    try {
      await _closeBridge();
      _controller = AgentController(app: app);
      await _controller!.load();
      final home = _state['dataDirectory'] as String?;
      if (home == null) return;
      _bridge = LocalAgentBridge(
          journal: Directory('$home/studio-tool-journal'),
          authorizeImage: (tool, args, session) =>
              _controller!.tools.sessions.authorize(tool, args, session),
          describeApproval: (tool, args, session) =>
              _controller!.tools.approvalSummary(tool, args, session),
          executeScoped: (tool, args, session) => _controller!.tools
              .execute(tool, args, const [], sessionId: session),
          execute: (tool, args) =>
              _controller!.tools.execute(tool, args, const []));
      await _bridge!.start();
      if (mounted) {
        await _act('start',
            {'bridgeUrl': _bridge!.url, 'bridgeToken': _bridge!.token});
      }
    } catch (e) {
      await _closeBridge();
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _launching = false);
    }
  }

  Future<void> _closeBridge() async {
    await _bridge?.close();
    _bridge = null;
    _controller?.tools.sessions.close();
    _controller?.tools.apiTools.close();
    _controller?.dispose();
    _controller = null;
  }

  Future<bool> _confirm(String title, String body) async =>
      await showDialog<bool>(
          context: context,
          builder: (context) =>
              AlertDialog(title: Text(title), content: Text(body), actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: Text(t('cancel'))),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: Text(t('confirm')))
              ])) ??
      false;
  Widget _channelCard(String kind, bool supported) {
    final official = kind == 'official';
    final failed = _state['${kind}Failed'] == true;
    final checked = (_state['${kind}CheckedAt'] as num? ?? 0) > 0;
    final installed = _state[official ? 'installedUpstream' : 'installed'];
    final raw = _state[official ? 'official' : 'candidate'];
    final latest = failed
        ? t('checkFailed')
        : !checked
            ? t('unknown')
            : (!official && _state['downloadAvailable'] != true)
                ? t('notPublishedShort')
                : (raw == null || '$raw'.isEmpty)
                    ? t('unknown')
                    : '$raw';
    return Card(
        key: ValueKey('agent-update-$kind'),
        margin: const EdgeInsets.symmetric(vertical: 4),
        child: Padding(
            padding: const EdgeInsets.all(12),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t(official ? 'official' : 'studio'),
                  style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 4),
              Wrap(spacing: 12, runSpacing: 4, children: [
                Text('${t('current')}: ${installed ?? '—'}'),
                Text('${t('latest')}: $latest')
              ]),
              const SizedBox(height: 4),
              Wrap(spacing: 8, runSpacing: 4, children: [
                OutlinedButton(
                    onPressed: !supported || busy
                        ? null
                        : () => _act('check', {'kind': kind}),
                    child:
                        Text(t(official ? 'officialCheck' : 'componentCheck'))),
                TextButton(
                    onPressed:
                        !supported || busy || running || !checked || failed
                            ? null
                            : () => _act('prepare', {'kind': kind}),
                    child: Text(
                        t(official ? 'officialPrepare' : 'componentPrepare'))),
              ]),
            ])));
  }

  @override
  void dispose() {
    widget.visible.removeListener(_visible);
    _poll?.cancel();
    _closeBridge();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    context.watch<AppState>();
    final language = context.read<AppState>().settings.language;
    final logs = (_state['logs'] as List?)
            ?.map((line) => localAgentLog(language, '$line'))
            .join('\n') ??
        '';
    final supported = _state['supported'] == true;
    final proposal = _state['proposal'];
    final downloading = _state['phase'] == 'downloading';
    final total = (_state['downloadTotal'] as num?)?.toDouble() ?? 0;
    final received = (_state['downloadBytes'] as num?)?.toDouble() ?? 0;
    final speed = (_state['downloadSpeed'] as num?)?.toDouble() ?? 0;
    final runtimeBytes = (_state['runtimeBytes'] as num?)?.toDouble() ?? 0;
    String mib(double bytes) => (bytes / 1048576).toStringAsFixed(1);
    return Scaffold(
        body: SafeArea(
            child: ListView(padding: const EdgeInsets.all(16), children: [
      Text(t('title'), style: Theme.of(context).textTheme.titleLarge),
      if (_state['supported'] == false)
        Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(t('unsupported'))),
      const SizedBox(height: 8),
      for (final kind in ['component', 'official'])
        _channelCard(kind, supported),
      Wrap(spacing: 8, runSpacing: 8, children: [
        TextButton.icon(
            onPressed: !supported || busy ? null : () => _act('check'),
            icon: const Icon(Icons.refresh),
            label: Text(t('check'))),
        if (proposal is Map)
          FilledButton(
              onPressed: busy
                  ? null
                  : () async {
                      final kind = proposal['kind'] == 'official'
                          ? 'official'
                          : 'studio';
                      final details =
                          '${t(kind)}\n${t('studio')}: ${_state['installed'] ?? '—'} → ${proposal['version']}\n${t('official')}: ${_state['installedUpstream'] ?? '—'} → ${proposal['upstream']}\n\n${t('confirmBody')}';
                      if (await _confirm(t('confirm'), details)) {
                        await _act('confirm', {'token': proposal['token']});
                      }
                    },
              child: Text(t('confirm'))),
      ]),
      ExpansionTile(title: Text(t('updateHelp')), children: [
        Text(t('about')),
        const SizedBox(height: 8),
        Text(t('downloadHint')),
        if (_state['downloadAvailable'] == false && !busy)
          Text(t('notPublished')),
        if (runtimeBytes > 0)
          Text('${t('downloadSize')}: ${mib(runtimeBytes)} MiB'),
      ]),
      if (busy)
        Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: LinearProgressIndicator(
                value: downloading && total > 0
                    ? (received / total).clamp(0.0, 1.0)
                    : null)),
      if (downloading)
        Wrap(
            spacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                  '${total > 0 ? (100 * received / total).toStringAsFixed(1) : "0.0"}% · ${mib(received)} / ${mib(total)} MiB · ${mib(speed)} MiB/s'),
              TextButton(
                  onPressed: () => _act('stop'),
                  child: Text(t('pauseDownload'))),
            ]),
      if (_error != null || _state['error'] != null)
        SelectableText(localAgentLog(language, _error ?? '${_state['error']}'),
            style: TextStyle(color: Theme.of(context).colorScheme.error)),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(child: Text(t('${_state['phase'] ?? 'stopped'}'))),
        if (running)
          TextButton(onPressed: () => _act('open'), child: Text(t('open'))),
        if (running || _state['phase'] == 'starting')
          OutlinedButton(
              onPressed: () async {
                await _act('stop');
                await _closeBridge();
              },
              child: Text(t('stop')))
        else
          FilledButton(
              onPressed: !supported || busy || _state['installed'] == null
                  ? null
                  : _start,
              child: Text(t('start'))),
      ]),
      const SizedBox(height: 8),
      Text(t('logs'), style: Theme.of(context).textTheme.titleSmall),
      Container(
          key: const ValueKey('agent-runtime-log'),
          constraints: const BoxConstraints(minHeight: 240),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(10)),
          child: SelectableText(logs,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12))),
      const SizedBox(height: 12),
      ExpansionTile(title: Text('${t('backup')} / ${t('restore')}'), children: [
        Text(t('backupsHint')),
        SelectableText('${_state['backupDirectory'] ?? ''}'),
        OutlinedButton(
            onPressed:
                !supported || busy || running ? null : () => _act('backup'),
            child: Text(t('backup'))),
        for (final name in _backups)
          ListTile(
              title: Text(name),
              trailing: TextButton(
                  onPressed: busy || running
                      ? null
                      : () async {
                          if (await _confirm(t('restore'), t('restoreBody'))) {
                            await _act('restore', {'name': name});
                          }
                        },
                  child: Text(t('restore')))),
      ]),
      TextButton(
          onPressed: busy || running
              ? null
              : () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => const AgentScreen())),
          child: Text(t('legacy'))),
    ])));
  }
}
