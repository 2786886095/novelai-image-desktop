import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../state/app_state.dart';

class AgentTaskTools {
  final AppState app;
  AgentTaskTools(this.app);
  Map<String, dynamic> read() {
    final identity = [
      app.busy,
      app.generationQueueRunning,
      app.queuePaused,
      app.generationQueue.map((x) => x.id).toList()
    ];
    return {
      'revision': sha256.convert(utf8.encode(jsonEncode(identity))).toString(),
      'running': app.busy,
      'queueRunning': app.generationQueueRunning,
      'paused': app.queuePaused,
      'progress': app.queueProgress == null
          ? null
          : {
              'done': app.queueProgress!.done,
              'failed': app.queueProgress!.failed,
              'total': app.queueProgress!.total
            },
      'items': app.generationQueue
          .map((x) => {
                'id': x.id,
                'label': x.label,
                'quotedAnlas': x.quotedAnlas,
                'quotePending': x.quotePending
              })
          .toList(),
      'status': app.displayStatus,
      'scope': '软件生成队列；暂停在当前图片结束后生效，取消不能撤销已完成的收费调用。'
    };
  }

  Future<Map<String, dynamic>> execute(Map<String, dynamic> args) async {
    final action = args['action'];
    if (!['list', 'pause', 'resume', 'cancel', 'remove', 'clear']
        .contains(action)) {
      throw StateError('未知任务操作');
    }
    for (final key in args.keys) {
      if (!['action', 'expectedRevision', if (action == 'remove') 'id']
          .contains(key)) {
        throw StateError('未知任务参数：$key');
      }
    }
    final before = read();
    if (action == 'list') {
      return before;
    }
    if (action != 'cancel' && args['expectedRevision'] != before['revision']) {
      throw StateError('任务队列已变化，请重新读取');
    }
    if (action == 'pause' || action == 'resume') {
      if (!app.generationQueueRunning) {
        throw StateError('当前没有可暂停或继续的生成队列');
      }
      if (app.queuePaused != (action == 'pause')) {
        app.toggleQueuePause();
      }
    } else if (action == 'cancel') {
      app.cancelGeneration();
      if (app.busy && !app.generationQueueRunning) {
        app.api.cancelActiveGeneration();
      }
    } else if (action == 'clear') {
      app.clearPendingGenerationQueue();
      if (app.generationQueue.isNotEmpty) {
        throw StateError('队列未清空，请回读状态');
      }
    } else {
      final id = args['id'];
      if (id is! String || !app.generationQueue.any((x) => x.id == id)) {
        throw StateError('排队任务已开始或不存在，请重新读取');
      }
      app.removeQueueJob(id);
      if (app.generationQueue.any((x) => x.id == id)) {
        throw StateError('任务未移除，请回读状态');
      }
    }
    return {
      ...read(),
      'action': action,
      'executed': true,
      if (action == 'cancel') 'cancellationRequested': true
    };
  }
}
