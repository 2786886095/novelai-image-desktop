import '../services/comic_image_service.dart';
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'agent_models.dart';
import 'session_controls.dart';
import '../state/app_state.dart';

const batchGenerationCatalog = <String, Map<String, dynamic>>{
  'batch.generation.start': {
    'title':
        '批量重绘队列生图：all全部、pending未完成、failed失败、additional各加一张；itemIds空数组表示全部。会话内整批确认一次；排队不是完成',
    'effect': 'write',
    'fields': ['mode', 'itemIds']
  },
  'batch.generation.status': {
    'title': '读取批量重绘队列、交接回执和实际进度，不生成',
    'effect': 'read',
    'fields': []
  },
  'batch.generation.stop': {
    'title': '停止本会话拥有的指定runId，保留已保存图片',
    'effect': 'write',
    'fields': ['runId']
  },
};

Map<String, dynamic> batchGenerationCapabilities(Map<String, dynamic> data) => {
      ...data,
      'actions': {
        ...Map<String, dynamic>.from(data['actions'] as Map),
        ...batchGenerationCatalog
      },
      'workflows': (data['workflows'] as List)
          .map((row) => row is Map && row['id'] == 'batch'
              ? {
                  ...row,
                  'steps':
                      'batch.project.read 读取工程与revision；工程与图片参数编辑使用同一软件状态。参考导入尚不在本操作清单内。batch.generation.start 传 mode(all/pending/failed/additional)、itemIds(空数组全部)、expectedRevision；使用会话自动授权或整批确认一次。queued仅表示排队，持续用batch.generation.status核对实际完成。停止使用当前会话拥有的runId；保留已生成图片，不重放未知结果。'
                }
              : row)
          .toList(),
    };

/// The host reserves the shared project, persists its receipt, and starts only
/// after the bridge durably journals and delivers that receipt. Never replay a
/// paid job after a restart or an ambiguous reply.
class BatchGenerationActions {
  final AppState app;
  final AgentSessionControls sessions;
  final Directory root;
  final Future<bool> Function(String, Map<String, dynamic>) approve;
  final void Function(String)? cancelApproval;
  final Duration handoffTimeout;
  Future<void>? _initializing, _work;
  Future<void> _writes = Future.value();
  Map<String, dynamic>? operation;
  bool busy = false, _cancelled = false, _closed = false;
  String? _session, _id, _revision, _source, _token;
  List<String> _tasks = [];
  Map<String, dynamic>? _grant;
  Timer? _timer;
  BatchGenerationActions(
      {required this.app,
      required this.sessions,
      required this.root,
      required this.approve,
      this.cancelApproval,
      this.handoffTimeout = const Duration(seconds: 30)});
  static bool handles(String tool, Map<String, dynamic> args) =>
      tool == 'langbai_software_action' &&
      batchGenerationCatalog.containsKey(args['action']);
  File get _file => File('${root.path}/batch-generation-operation.json');
  Future<void> _save(Map<String, dynamic> value) {
    final next = _writes.then((_) async {
      await root.create(recursive: true);
      final temp = File('${_file.path}.${agentId('receipt')}.tmp');
      await temp.writeAsString(jsonEncode(value), flush: true);
      await temp.rename(_file.path);
      operation = value;
    });
    _writes = next.then<void>((_) {}, onError: (Object _) {});
    return next;
  }

  Future<void> initialize() => _initializing ??= () async {
        await app.batchRedraw.load();
        if (app.batchRedraw.loadError != null) {
          throw StateError(app.batchRedraw.loadError!);
        }
        if (!await _file.exists()) return;
        final value = jsonDecode(await _file.readAsString());
        if (value is! Map<String, dynamic> ||
            value['id'] is! String ||
            value['session'] is! String ||
            value['total'] is! int ||
            value['total'] < 0 ||
            value['done'] is! int ||
            value['done'] < 0 ||
            value['done'] > value['total'] ||
            ![
              'awaiting',
              'queued',
              'running',
              'stopping',
              'completed',
              'cancelled',
              'failed',
              'interrupted'
            ].contains(value['state'])) throw StateError('批量重绘交接记录损坏，未重放生图');
        operation = value;
        if (['awaiting', 'queued', 'running', 'stopping']
            .contains(value['state'])) {
          await _save({
            ...value,
            'state': 'interrupted',
            'message': '上次任务已中断，请核对软件候选图；未自动重试。'
          });
        }
      }();
  String _binding() => comicImageBinding(app.settings);
  void _guard() {
    if (_closed || _cancelled || _id == null || _session == null) {
      throw StateError('批量重绘任务已停止');
    }
    if (_binding() != _source) throw StateError('图片服务配置已变化，未继续提交');
    if (_grant != null) {
      sessions.ensureComicGrant(_session!, _grant!);
    } else {
      sessions.ensureActive(_session!);
    }
  }

  Future<void> _credentials() async {
    _guard();
    final token = await comicCredential(app.storage, app.settings);
    _guard();
    if (token != _token) throw StateError('图片凭据已变化，未继续提交');
  }

  Map<String, dynamic> _data() => {
        'busy': busy,
        'operation': operation,
        'queue': app.batchRedraw.runState,
        'revision': app.batchRedraw.revision
      };
  AgentToolResult _result(Map<String, dynamic> value) =>
      AgentToolResult(ok: true, title: '批量重绘生成任务', output: jsonEncode(value));
  Future<AgentToolResult> execute(
      String tool, Map<String, dynamic> args, String session) async {
    var acquired = false;
    try {
      await initialize();
      if (_closed) throw StateError('批量重绘任务入口已关闭');
      if (!handles(tool, args)) throw StateError('批量重绘生成操作不存在');
      final action = args['action'];
      final allowed = action == 'batch.generation.start'
          ? ['action', 'mode', 'itemIds', 'expectedRevision']
          : action == 'batch.generation.stop'
              ? ['action', 'runId']
              : ['action'];
      if (args.keys.any((k) => !allowed.contains(k))) {
        throw StateError('未知批量重绘生成参数');
      }
      if (action == 'batch.generation.status') return _result(_data());
      if (action == 'batch.generation.stop') {
        if (operation?['session'] != session ||
            args['runId'] is! String ||
            args['runId'] != operation?['id']) {
          throw StateError('批量重绘任务不属于当前会话或runId已变化');
        }
        if (busy) {
          cancel();
          if (_work == null && operation?['state'] == 'queued') {
            _launch(_finish('cancelled', '排队任务已停止，未提交图片'));
          }
        }
        return _result({..._data(), 'stopRequested': true});
      }
      if (busy ||
          app.batchRedraw.queueRunning ||
          app.busy ||
          app.generationQueueRunning) throw StateError('已有图像任务，请读取进度');
      if (args['expectedRevision'] is! String ||
          args['mode'] is! String ||
          args['itemIds'] is! List ||
          (args['itemIds'] as List).any((x) => x is! String)) {
        throw StateError('请传入工程revision、mode和图片ID数组');
      }
      app.batchRedraw.assertRevision(args['expectedRevision']);
      final tasks = app.batchRedraw
          .agentPlan(args['mode'], List<String>.from(args['itemIds']));
      sessions.begin(session, cancel: cancel);
      acquired = true;
      busy = true;
      _cancelled = false;
      _work = null;
      _id = agentId('batch');
      _session = session;
      _revision = args['expectedRevision'];
      _source = _binding();
      _grant = null;
      app.batchRedraw.reserveAgentRun(_id!, _revision!);
      _token = await comicCredential(app.storage, app.settings);
      _guard();
      if (_token == null || _token!.isEmpty) {
        throw StateError('请先配置NovelAI Token');
      }
      _tasks = tasks.map((p) => p.id).toList();
      _grant = await sessions.comicGrant(session, tasks.length);
      _guard();
      app.batchRedraw.checkAgentRun(_id!, _revision!);
      await _save({
        'id': _id,
        'session': session,
        'mode': args['mode'],
        'total': tasks.length,
        'done': 0,
        'state': 'awaiting',
        'message': '正在核对会话授权，尚未提交图片'
      });
      _guard();
      if (_grant!['mode'] != 'auto' &&
          !await approve(session, {
            'action': 'batch.generation.start',
            'title': '确认批量重绘整批生图',
            'count': tasks.length,
            'mode': args['mode'],
            'itemIds': tasks.map((p) => p.id).toSet().toList(),
            'imageProvider': app.settings.imageProvider,
            'notice': '本批可能消耗Anlas；只确认一次，失败停止，已生成图片保留。'
          })) throw StateError('已取消批量重绘生成');
      _guard();
      await _credentials();
      app.batchRedraw.checkAgentRun(_id!, _revision!);
      await _save(
          {...operation!, 'state': 'queued', 'message': '已排队，等待软件接管；尚未生成完成'});
      _guard();
      _timer = Timer(handoffTimeout, () {
        if (_work == null) {
          _cancelled = true;
          _launch(_finish('interrupted', '回执交接超时，未提交图片'));
        }
      });
      acquired = false;
      return _result({'queued': true, ..._data()});
    } catch (e) {
      if (acquired) {
        try {
          if (operation?['id'] == _id) {
            await _save({
              ...operation!,
              'state': _cancelled ? 'cancelled' : 'failed',
              'message': '$e'
            });
          }
        } catch (_) {}
      }
      return AgentToolResult(ok: false, title: '批量重绘任务未执行', output: '$e');
    } finally {
      if (acquired) _release();
    }
  }

  void _release() {
    _timer?.cancel();
    if (_id != null) app.batchRedraw.releaseAgentRun(_id!);
    if (_session != null) sessions.end(_session!);
    busy = false;
    _token = null;
  }

  Future<void> _finish(String state, String message) async {
    try {
      await _save({
        ...operation!,
        'state': state,
        'message': message,
        'done': app.batchRedraw.runId == _id ? app.batchRedraw.queueDone : 0
      });
    } finally {
      _release();
    }
  }

  void _launch(Future<void> work) {
    _work = work.catchError((Object e) {
      operation = {
        ...operation!,
        'state': 'failed',
        'message': '任务回执写入失败，请核对已保存图片：$e'
      };
      _release();
    });
  }

  Future<void> _run() async {
    try {
      await _credentials();
      app.batchRedraw.checkAgentRun(_id!, _revision!);
      await _save(
          {...operation!, 'state': 'running', 'message': '软件已接管批量重绘生成'});
      _guard();
      await app.batchRedraw.runAgent(_tasks,
          owner: _id!,
          expected: _revision!,
          guard: _guard, beforeImage: () async {
        await _credentials();
        await sessions.consumeComicAttempt(_session!, _grant!);
        _guard();
      });
      final phase = app.batchRedraw.runPhase;
      if (phase == 'completed' &&
          (app.batchRedraw.runId != _id ||
              app.batchRedraw.queueDone != _tasks.length ||
              app.batchRedraw.queueTotal != _tasks.length)) {
        throw StateError('批量重绘完成回执与任务数量不一致，请核对候选图');
      }
      await _finish(
          phase == 'completed'
              ? 'completed'
              : phase == 'cancelled'
                  ? 'cancelled'
                  : 'failed',
          app.batchRedraw.runError ??
              (phase == 'completed' ? '批量重绘生成完成' : '批量重绘生成已停止'));
    } catch (e) {
      await _finish(_cancelled || _closed ? 'cancelled' : 'failed', '$e');
    }
  }

  void afterResponse(String tool, Map<String, dynamic> args, String session,
      String call, Map<String, dynamic> result, bool delivered) {
    final data = result['data'];
    if (!busy ||
        _work != null ||
        args['action'] != 'batch.generation.start' ||
        !handles(tool, args) ||
        session != _session ||
        result['ok'] != true ||
        data is! Map ||
        data['queued'] != true ||
        data['operation']?['id'] != _id) return;
    _timer?.cancel();
    _launch(delivered ? _run() : _finish('interrupted', '回执未送达，未提交图片'));
  }

  void cancelOwned(String session) {
    if (busy && _session == session) cancel();
  }

  void cancel() {
    _cancelled = true;
    if (_session != null) cancelApproval?.call(_session!);
    if (app.batchRedraw.runId == _id) app.batchRedraw.cancelQueue();
  }

  Future<void> close() async {
    _closed = true;
    cancel();
    if (busy && _work == null && operation?['state'] == 'queued') {
      _launch(_finish('cancelled', 'Agent已关闭，未提交图片'));
    }
    await _work;
  }

  Future<void> settled() async {
    await _work;
  }
}
