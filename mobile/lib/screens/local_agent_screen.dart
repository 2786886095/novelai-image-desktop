import '../agent/batch_generation_actions.dart';
import '../agent/comic_generation_actions.dart';
import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../agent/agent_controller.dart';
import '../agent/local_agent_bridge.dart';
import '../agent/component_actions.dart';
import '../agent/app_update_actions.dart';
import '../agent/agent_models.dart';
import 'dart:convert';
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
  ComponentActions? _components;
  AppUpdateActions? _updates;
  ComicGenerationActions? _comics;
  BatchGenerationActions? _batches;
  bool _readingUpdates = false;
  AgentController? _controller;
  String t(String key) =>
      localAgentText(context.read<AppState>().settings.language, key);
  bool get busy =>
      _request ||
      _launching ||
      _state['busy'] == true ||
      _components?.busy == true ||
      _updates?.pending == true;
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
      if (!mounted) return;
      final home = state?['dataDirectory'];
      if (_updates == null && home is String) {
        final app = context.read<AppState>();
        _updates = AppUpdateActions(
            root: Directory(home).parent,
            port: DeviceAppUpdatePort(
                settings: () => app.settings,
                beforeReserve: () {
                  if (_components?.busy == true ||
                      (_comics?.busy == true || _batches?.busy == true) ||
                      app.busy ||
                      _request ||
                      _state['busy'] == true) throw StateError('组件或运行时任务尚未结束');
                },
                beforeInstall: () async {
                  // Host-owned afterResponse job: do not call _act('stop'), which
                  // would cancel this same job and wait on itself.
                  final stopped = await _native
                      .invokeMapMethod<String, dynamic>(
                          'stop', {'handoff': true});
                  final state =
                      await _native.invokeMapMethod<String, dynamic>('status');
                  if (stopped?['stopRevision'] is! num ||
                      state?['stopRevision'] != stopped?['stopRevision'] ||
                      state?['running'] == true ||
                      state?['busy'] == true) {
                    throw StateError('Agent 停止状态未核实，未打开安装器');
                  }
                }),
            approve: (session, args) =>
                _bridge?.approveOperation(session, args) ?? Future.value(false),
            cancelApproval: (session) =>
                _bridge?.cancelOperationApproval(session, 'app.update.install'),
            changed: () {
              if (mounted) setState(() {});
            });
      }
      // Journal IO must not stall component status, controls or metadata check.
      if (_updates != null && !_readingUpdates) {
        _readingUpdates = true;
        unawaited(_updates!.refresh().catchError((Object e) {
          if (mounted) setState(() => _error = '$e');
        }).whenComplete(() => _readingUpdates = false));
      }
      if (_components == null && home is String) {
        final notification = {
          'notificationTitle': t('title'),
          'notificationBody': t('notification'),
          'stopLabel': t('stop')
        };
        _components = ComponentActions(
            root: Directory(home).parent,
            invoke: (name, args) async {
              if (name == 'status' ||
                  name == 'planDownload' ||
                  name == 'stop') {
                return await _native.invokeMapMethod<String, dynamic>(
                        name, args) ??
                    {};
              }
              await _native.invokeMethod(name, {...args, ...notification});
              return {};
            },
            approve: (session, args) =>
                _bridge?.approveOperation(session, args) ?? Future.value(false),
            changed: () {
              if (mounted) setState(() {});
            });
        // Reading the durable receipt must not delay the native status/UI.
        // Agent mutations still await initialize() before they can execute.
        unawaited(_components!.initialize().catchError((Object e) {
          if (mounted) setState(() => _error = '$e');
        }));
      }
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
    if ((_components?.busy == true || _updates?.pending == true) &&
        name != 'stop' &&
        name != 'open') return;
    if (_request) return;
    setState(() {
      _request = true;
      _error = null;
    });
    try {
      if (name == 'stop') {
        _comics?.cancel();
        _batches?.cancel();
        _bridge?.cancelApprovals();
        await _updates?.cancel();
        await _components?.cancel();
      }
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

  Future<void> _prepareConfirmed(String kind, {bool reinstall = false}) async {
    if (busy || running) return;
    setState(() => _request = true);
    try {
      final plan = await _native.invokeMapMethod<String, dynamic>(
          'planDownload', {'kind': kind, 'reinstall': reinstall});
      if (!mounted || plan == null) return;
      final size = ((plan['bytes'] as num) / 1048576).toStringAsFixed(1);
      if (!await _confirm(t(reinstall ? 'reinstall' : 'install'),
          '${t('downloadSize')}: $size MiB · ${plan['version']}\n${t('downloadConsent')}')) {
        return;
      }
      if (!mounted) return;
      setState(() => _request = false);
      await _act('prepare', {'kind': kind, 'downloadToken': plan['token']});
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
      _comics = ComicGenerationActions(
          app: app,
          sessions: _controller!.tools.sessions,
          root: Directory(home).parent,
          approve: (session, args) =>
              _bridge?.approveOperation(session, args) ?? Future.value(false),
          cancelApproval: (session) => _bridge?.cancelOperationApproval(
              session, 'comic.generation.start'));
      _batches = BatchGenerationActions(
          app: app,
          sessions: _controller!.tools.sessions,
          root: Directory(home).parent,
          approve: (session, args) =>
              _bridge?.approveOperation(session, args) ?? Future.value(false),
          cancelApproval: (session) => _bridge?.cancelOperationApproval(
              session, 'batch.generation.start'));
      _bridge = LocalAgentBridge(
          journal: Directory('$home/studio-tool-journal'),
          managesApproval: (tool, args) =>
              ComponentActions.handles(tool, args) ||
              AppUpdateActions.handles(tool, args) ||
              ComicGenerationActions.handles(tool, args) ||
              BatchGenerationActions.handles(tool, args),
          afterResponse: (tool, args, session, call, result, delivered) {
            _batches?.afterResponse(
                tool, args, session, call, result, delivered);
            _comics?.afterResponse(
                tool, args, session, call, result, delivered);
            _components?.afterResponse(
                tool, args, session, call, result, delivered);
            _updates?.afterResponse(
                tool, args, session, call, result, delivered);
          },
          authorizeImage: (tool, args, session) =>
              _controller!.tools.sessions.authorize(tool, args, session),
          prepareImage: (tool, args, session) => _controller!.tools
              .prepareImageOperation(tool, args, const [], sessionId: session),
          cancelImages: () {
            _comics?.cancel();
            _batches?.cancel();
            _controller?.tools.sessions.close();
          },
          describeApproval: (tool, args, session) =>
              _controller!.tools.approvalSummary(tool, args, session),
          executeScoped: (tool, args, session) async {
            if (ComicGenerationActions.handles(tool, args)) {
              if (args['action'] == 'comic.generation.start' &&
                  (_components?.busy == true ||
                      _updates?.pending == true ||
                      _request)) {
                return const AgentToolResult(
                    ok: false,
                    title: '软件生命周期任务进行中',
                    output: '请先等待组件或软件更新结束，再启动漫画生成。');
              }
              return _comics!.execute(tool, args, session);
            }
            if (BatchGenerationActions.handles(tool, args)) {
              if (args['action'] == 'batch.generation.start' &&
                  (_components?.busy == true ||
                      _updates?.pending == true ||
                      _request)) {
                return const AgentToolResult(
                    ok: false,
                    title: '软件生命周期任务进行中',
                    output: '请先等待组件或软件更新结束，再启动批量生成。');
              }
              return _batches!.execute(tool, args, session);
            }
            if (tool == 'studio_stop_generation') {
              _comics?.cancelOwned(session);
              _batches?.cancelOwned(session);
            }

            if (AppUpdateActions.handles(tool, args)) {
              return _updates!.execute(tool, args, session);
            }
            if (ComponentActions.handles(tool, args)) {
              if ((_updates?.pending == true ||
                      (_comics?.busy == true || _batches?.busy == true)) &&
                  !['component.status', 'component.check']
                      .contains(args['action'])) {
                return const AgentToolResult(
                    ok: false, title: '软件更新进行中', output: '请先停止软件更新或完成系统安装。');
              }
              return _components!.execute(tool, args, session);
            }
            final result = await _controller!.tools
                .execute(tool, args, const [], sessionId: session);
            if (tool == 'langbai_software_capabilities' && result.ok) {
              final data = jsonDecode(result.output) as Map<String, dynamic>;
              return AgentToolResult(
                  ok: true,
                  title: result.title,
                  output: jsonEncode({
                    ...batchGenerationCapabilities(
                        comicGenerationCapabilities(data)),
                    'actions': {
                      ...Map<String, dynamic>.from(data['actions']),
                      ...componentActionCatalog,
                      ...appUpdateActionCatalog,
                      ...comicGenerationCatalog,
                      ...batchGenerationCatalog
                    }
                  }));
            }
            return result;
          },
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
    await _batches?.close();
    _batches = null;
    await _comics?.close();
    _comics = null;
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
                            : () => _prepareConfirmed(kind),
                    child: Text(t(official
                        ? 'officialPrepare'
                        : (_state['installed'] == null
                            ? 'install'
                            : 'componentPrepare')))),
              ]),
            ])));
  }

  @override
  void dispose() {
    widget.visible.removeListener(_visible);
    _poll?.cancel();
    _bridge?.cancelApprovals();
    unawaited(() async {
      try {
        await _updates?.cancel();
      } catch (_) {/* The Android installer owns its pending interaction. */}
      await _components?.cancel();
      await _closeBridge();
    }());
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
      Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Text(t('retainData'))),
      Wrap(spacing: 8, runSpacing: 8, children: [
        OutlinedButton(
            onPressed:
                !supported || busy || running || _state['installed'] == null
                    ? null
                    : () => _prepareConfirmed('component', reinstall: true),
            child: Text(t('reinstall'))),
        OutlinedButton(
            onPressed:
                !supported || busy || running || _state['installed'] == null
                    ? null
                    : () async {
                        if (await _confirm(t('uninstall'), t('retainData'))) {
                          await _act('uninstall', {'confirmed': true});
                        }
                      },
            child: Text(t('uninstall'))),
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
        if (running ||
            _state['phase'] == 'starting' ||
            _components?.busy == true ||
            _updates?.pending == true)
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
      if (_updates?.operation != null)
        Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: SelectableText(
                '${_updates!.operation!['state']} · ${_updates!.operation!['message']}')),
      if (_updates?.busy == true)
        LinearProgressIndicator(value: _updates!.progress),
      if (_components?.operation != null)
        Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: SelectableText(
                '${_components!.operation!['state']} · ${_components!.operation!['message']}')),
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
