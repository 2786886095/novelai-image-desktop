import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import '../models/nai_models.dart';
import '../services/apk_update.dart';
import '../services/update_service.dart';
import 'agent_models.dart';

const appUpdateActionCatalog = <String, Map<String, String>>{
  'app.update.status': {'title': '读取软件版本、自更新进度和最近安装交接结果', 'effect': 'read'},
  'app.update.check': {'title': '检查软件更新（仅元数据，不下载）', 'effect': 'read'},
  'app.update.install': {
    'title': '下载、验证并交给 Android 系统安装',
    'effect': 'confirm',
    'help':
        '先 check，再传 expectedRevision；一次确认包含下载。系统安装授权由 Android 处理，打开安装器不代表更新完成。'
  },
  'app.update.cancel': {'title': '取消下载或尚未打开系统安装器的任务', 'effect': 'write'},
};

abstract class AppUpdatePort {
  bool get busy;
  String? get nativeId;
  Future<Map<String, dynamic>> status();
  Future<UpdateInfo> check();
  void reserve(UpdateInfo info);
  Future<void> download(void Function(double) progress);
  Future<String> install();
  Future<void> cancel(String? id);
  void release();
}

class DeviceAppUpdatePort implements AppUpdatePort {
  final AppSettings Function() settings;
  final Future<void> Function() beforeInstall;
  final void Function()? beforeReserve;
  final ApkUpdateCoordinator coordinator;
  ApkUpdateSession? _session;
  DeviceAppUpdatePort(
      {required this.settings,
      required this.beforeInstall,
      this.beforeReserve,
      ApkUpdateCoordinator? coordinator})
      : coordinator = coordinator ?? ApkUpdate.coordinator;
  @override
  bool get busy => coordinator.busy;
  @override
  String? get nativeId => _session?.id;
  @override
  Future<Map<String, dynamic>> status() => coordinator.nativeStatus();
  @override
  Future<UpdateInfo> check() => checkAppUpdate(settings());
  @override
  void reserve(UpdateInfo info) {
    beforeReserve?.call();
    _session = coordinator.reserve(settings(), info);
  }

  @override
  Future<void> download(void Function(double) progress) =>
      _session!.download(progress);
  @override
  Future<String> install() async {
    await beforeInstall();
    return _session!.install();
  }

  @override
  Future<void> cancel(String? id) async {
    if (_session != null) {
      await _session!.cancel();
      return;
    }
    if (id != null && await coordinator.invoke('cancel', {'id': id}) != true) {
      throw StateError('系统安装器已打开，请在系统界面处理');
    }
  }

  @override
  void release() {
    _session?.release();
  }
}

class AppUpdateActions {
  final Directory root;
  final AppUpdatePort port;
  final Future<bool> Function(String session, Map<String, dynamic> summary)
      approve;
  final void Function(String session)? cancelApproval;
  final void Function()? changed;
  final Duration handoffTimeout;
  Future<void>? _initializing, _work;
  Future<void> _write = Future.value();
  Map<String, dynamic>? operation;
  UpdateInfo? _plan;
  DateTime? _checked;
  bool busy = false,
      _cancelled = false,
      _awaitingApproval = false,
      _queued = false;
  String? _owner;
  Timer? _timer;
  double progress = 0;
  AppUpdateActions(
      {required this.root,
      required this.port,
      required this.approve,
      this.cancelApproval,
      this.changed,
      this.handoffTimeout = const Duration(seconds: 30)});
  static bool handles(String tool, Map<String, dynamic> args) =>
      tool == 'langbai_software_action' &&
      appUpdateActionCatalog.containsKey(args['action']);
  bool get pending =>
      busy ||
      port.busy ||
      ['installing', 'permission_required', 'installer_started']
          .contains(operation?['state']);
  File get _file => File('${root.path}/app-update-operation.json');
  Future<void> _save(Map<String, dynamic> value) {
    final next = _write.then((_) async {
      await root.create(recursive: true);
      final temp = File('${_file.path}.${agentId('receipt')}.tmp');
      try {
        await temp.writeAsString(jsonEncode(value), flush: true);
        await temp.rename(_file.path);
        operation = value;
        changed?.call();
      } finally {
        if (await temp.exists()) await temp.delete();
      }
    });
    _write = next.catchError((Object _) {});
    return next;
  }

  String _version(Map<String, dynamic> native) {
    final value = native['currentVersion'];
    if (value is! String || value.isEmpty) throw StateError('系统未返回已安装版本');
    return value;
  }

  Map<String, dynamic>? _publicPlan() => _plan == null
      ? null
      : {
          'version': _plan!.latestVersion,
          'downloadBytes': _plan!.apkSize,
          'sha256': _plan!.apkSha256,
          'sourceUrl': _plan!.releaseUrl
        };
  String _revision(Map<String, dynamic> native) => sha256
      .convert(utf8.encode(jsonEncode({
        'current': _version(native),
        'plan': _publicPlan(),
        'checked': _checked?.toIso8601String()
      })))
      .toString();
  Map<String, dynamic> _data(Map<String, dynamic> native) => {
        'currentVersion': _version(native),
        'available': _publicPlan(),
        'revision': _revision(native),
        'operation': operation,
        'busy': busy || port.busy,
        'progress': progress,
        'systemState': native['state']
      };
  AgentToolResult _result(Map<String, dynamic> value) =>
      AgentToolResult(ok: true, title: '软件自更新', output: jsonEncode(value));
  Future<void> _transition(String state, String message) => _save({
        ...operation!,
        'state': state,
        'message': message,
        'updatedAt': DateTime.now().toIso8601String()
      });
  Future<void> initialize() => _initializing ??= () async {
        if (!await _file.exists()) return;
        final value = jsonDecode(await _file.readAsString());
        if (value is! Map<String, dynamic> ||
            value['id'] is! String ||
            value['version'] is! String ||
            ![
              'queued',
              'downloading',
              'installing',
              'permission_required',
              'installer_started',
              'completed',
              'failed',
              'interrupted'
            ].contains(value['state'])) throw StateError('软件更新记录损坏，未自动重试');
        operation = value;
        if ([
          'queued',
          'downloading',
          'installing',
          'permission_required',
          'installer_started'
        ].contains(value['state'])) {
          final native = await port.status();
          if (['installing', 'permission_required', 'installer_started']
                  .contains(value['state']) &&
              _version(native) == value['version']) {
            await _transition('completed', '已安装版本回读一致，软件更新完成。');
          } else if (native['id'] == value['nativeId'] &&
              ['checking', 'permission_required', 'installer_started']
                  .contains(native['state'])) {
            await _transition(
                native['state'] == 'checking'
                    ? 'installing'
                    : native['state'] as String,
                '系统安装交接仍在进行；未重新下载或安装。');
          } else {
            await _transition('interrupted', '上次更新未核实完成，未自动重试或下载。');
          }
        }
      }();
  Future<void> refresh() async {
    await initialize();
    if (busy ||
        operation == null ||
        !['installing', 'permission_required', 'installer_started']
            .contains(operation!['state'])) return;
    final native = await port.status();
    if (_version(native) == operation!['version']) {
      await _transition('completed', '已安装版本回读一致，软件更新完成。');
      port.release();
      return;
    }
    if (native['id'] != operation!['nativeId']) return;
    if (native['state'] == 'installer_started' &&
        operation!['state'] != 'installer_started') {
      await _transition('installer_started', '系统安装器已打开；尚未确认更新成功。');
    } else if (['installer_closed', 'cancelled', 'failed']
        .contains(native['state'])) {
      await _transition(native['state'] == 'failed' ? 'failed' : 'interrupted',
          '系统安装流程已结束，但软件版本尚未更新；未自动重试。');
      port.release();
    }
  }

  void _checkCancelled() {
    if (_cancelled) throw StateError('软件更新已取消');
  }

  Future<AgentToolResult> execute(
      String tool, Map<String, dynamic> args, String session) async {
    var acquired = false, reserved = false;
    try {
      await initialize();
      if (!handles(tool, args)) throw StateError('未知软件更新操作');
      if (args.keys.any((k) => !['action', 'expectedRevision'].contains(k))) {
        throw StateError('未知软件更新参数');
      }
      final action = args['action'];
      if (action == 'app.update.status') {
        await refresh();
        return _result(_data(await port.status()));
      }
      if (action == 'app.update.cancel') {
        await cancel();
        return _result({..._data(await port.status()), 'cancelled': true});
      }
      await refresh();
      final native = await port.status();
      if (busy ||
          port.busy ||
          ['checking', 'permission_required', 'installer_started']
              .contains(native['state'])) throw StateError('已有软件更新任务，请读取状态');
      busy = true;
      acquired = true;
      _cancelled = false;
      _queued = false;
      _owner = session;
      changed?.call();
      if (action == 'app.update.check') {
        final info = await port.check();
        _checkCancelled();
        if (info.error != null) throw StateError('更新检查失败：${info.error}');
        if (info.hasUpdate) {
          validateApkUpdateInfo(info);
        }
        _plan = info.hasUpdate &&
                compareVersions(info.latestVersion!, _version(native)) > 0
            ? info
            : null;
        _checked = DateTime.now();
        busy = false;
        return _result(_data(await port.status()));
      }
      if (args['expectedRevision'] != _revision(native)) {
        throw StateError('版本或更新信息已变化，请 check 后传入 expectedRevision');
      }
      if (_plan == null ||
          _checked == null ||
          DateTime.now().difference(_checked!).inMinutes >= 10) {
        throw StateError('请先检查可用更新，结果有效期10分钟');
      }
      final revision = _revision(native), chosen = _plan!;
      _awaitingApproval = true;
      final accepted = await approve(session, {
        ...args,
        ..._publicPlan()!,
        'currentVersion': _version(native),
        'platform': 'android',
        'notice': '一次确认包括下载与安装交接；Android 系统可能仍要求安装权限或确认。'
      });
      _awaitingApproval = false;
      _checkCancelled();
      if (!accepted) throw StateError('已取消，未下载安装');
      if (revision != _revision(await port.status()) ||
          DateTime.now().difference(_checked!).inMinutes >= 10) {
        throw StateError('确认期间版本变化或检查过期，未执行');
      }
      port.reserve(chosen);
      reserved = true;
      progress = 0;
      await _save({
        'id': agentId('app-update'),
        'nativeId': port.nativeId,
        'version': chosen.latestVersion,
        'state': 'queued',
        'updatedAt': DateTime.now().toIso8601String(),
        'message': '已确认并排队，等待回执；尚未下载安装。'
      });
      _checkCancelled();
      _work = null;
      _queued = true;
      acquired = false;
      reserved = false;
      _timer = Timer(handoffTimeout, () {
        if (_work == null) {
          _launch(_finish('interrupted', '交接回执未完成，未下载安装。'));
        }
      });
      return _result({'queued': true, 'operation': operation});
    } catch (e) {
      return AgentToolResult(ok: false, title: '软件更新未执行', output: '$e');
    } finally {
      if (acquired) {
        busy = false;
        _awaitingApproval = false;
        _owner = null;
        changed?.call();
      }
      if (reserved) port.release();
    }
  }

  Future<void> _finish(String state, String message) async {
    try {
      await _transition(state, message);
    } finally {
      _timer?.cancel();
      busy = false;
      _queued = false;
      _owner = null;
      port.release();
      changed?.call();
    }
  }

  void _launch(Future<void> work) {
    _work = work.catchError((Object e) {
      busy = false;
      port.release();
      operation = {
        ...operation!,
        'state': 'failed',
        'message': '更新回执保存失败，请核对系统状态：$e'
      };
      changed?.call();
    });
  }

  Future<void> _run() async {
    try {
      _checkCancelled();
      await _transition('downloading', '正在下载并验证已确认版本。');
      await port.download((p) {
        progress = p;
        changed?.call();
      });
      _checkCancelled();
      await _transition('installing', '安装包已验证，正在交给 Android 安装。');
      final stage = await port.install();
      if (!['permission_required', 'installer_started'].contains(stage)) {
        throw StateError('系统交接结果无效：$stage');
      }
      await _finish(
          stage,
          stage == 'permission_required'
              ? '请在 Android 设置中允许安装；尚未完成更新。'
              : '系统安装器已打开；重启后核对已安装版本。');
    } catch (e) {
      // A platform reply can race cancellation or be lost after Android opened
      // its installer. Preserve that observable state instead of claiming stop.
      final native = await port.status();
      if (native['id'] == operation?['nativeId'] &&
          ['checking', 'permission_required', 'installer_started']
              .contains(native['state'])) {
        await _finish(
            native['state'] == 'checking'
                ? 'installing'
                : native['state'] as String,
            'Android 安装交接仍在进行，请核对系统状态；未自动重试。');
      } else {
        await _finish(_cancelled ? 'interrupted' : 'failed', '$e；未自动重试。');
      }
    }
  }

  void afterResponse(String tool, Map<String, dynamic> args, String session,
      String call, Map<String, dynamic> result, bool delivered) {
    final data = result['data'];
    if (!busy ||
        _work != null ||
        args['action'] != 'app.update.install' ||
        !handles(tool, args) ||
        session != _owner ||
        result['ok'] != true ||
        data is! Map ||
        data['operation'] is! Map ||
        data['operation']['id'] != operation?['id']) return;
    _timer?.cancel();
    _launch(delivered ? _run() : _finish('interrupted', '回执连接已断开，未下载安装。'));
  }

  Future<void> cancel() async {
    if (_awaitingApproval) {
      _cancelled = true;
      if (_owner != null) cancelApproval?.call(_owner!);
      return;
    }
    if (busy && !_queued) {
      _cancelled = true;
      return;
    }
    if (!busy &&
        !['permission_required', 'installing', 'installer_started']
            .contains(operation?['state'])) return;
    if (operation?['state'] == 'installer_started') {
      throw StateError('系统安装器已打开，请在系统界面处理');
    }
    _cancelled = true;
    try {
      await port.cancel(operation?['nativeId'] as String?);
    } catch (_) {
      _cancelled = false;
      rethrow;
    }
    _timer?.cancel();
    if (_work != null && busy) {
      await _work;
    } else if (operation != null) {
      await _finish('interrupted', '用户取消更新；未自动重试。');
    }
  }

  Future<void> settled() async {
    await _work;
  }
}
