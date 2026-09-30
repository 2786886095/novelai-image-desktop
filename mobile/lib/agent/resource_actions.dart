import 'dart:async';
import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../services/resource_database_service.dart';

const resourceActionCatalog = <String, Map<String, dynamic>>{
  'resources.list': {'title': '读取资源数据库、来源、下载大小和任务状态', 'effect': 'read'},
  'resources.download': {
    'title': '下载并安装资源数据库（旧库保留）',
    'effect': 'confirm',
    'fields': ['id'],
    'help': 'id: tagCatalog|cooccurrence；started 只表示开始，使用 resources.list 核对完成状态'
  },
  'resources.pause': {
    'title': '暂停资源下载（保留断点）',
    'effect': 'write',
    'fields': ['id']
  },
  'resources.restore': {
    'title': '恢复上一版资源数据库',
    'effect': 'confirm',
    'fields': ['id']
  },
  'resources.clearCache': {'title': '清理资源查询内存缓存（数据库保留）', 'effect': 'write'},
  'resources.delete': {
    'title': '删除本机资源数据库及其断点、旧版本（图片保留）',
    'effect': 'confirm',
    'fields': ['id']
  },
};

abstract class ResourcePort {
  Future<Map<String, dynamic>> overview();
  Future<Map<String, dynamic>> install(String id);
  bool pause(String id);
  Future<void> restore(String id);
  Future<void> delete(String id);
  void clearCache();
}

class DeviceResourcePort implements ResourcePort {
  final ResourceDatabaseService service;
  DeviceResourcePort([ResourceDatabaseService? service])
      : service = service ?? ResourceDatabaseService.shared;
  ResourceDatabaseId _id(String id) => ResourceDatabaseId.values.byName(id);
  @override
  Future<Map<String, dynamic>> overview() async {
    final state = await service.overview();
    return {
      'dataDirectory': state.dataDirectory,
      'cache': {
        'memoryEntries': state.memoryEntries,
        'memoryHits': state.memoryHits,
        'memoryMisses': state.memoryMisses
      },
      'resources': state.resources.map((r) {
        final d = r.definition;
        return {
          'id': d.id.name,
          'label': d.label,
          'installed': r.installed,
          'valid': r.valid,
          'version': r.version,
          'hasPrevious': r.hasPrevious,
          'downloading': service.operation(d.id) == 'download',
          'operation': service.operation(d.id),
          'resumableBytes': r.resumableBytes,
          'downloadBytes': d.downloadSize,
          'databaseBytes': d.databaseSize,
          'sourceUrl': d.sourceUrl,
          'license': d.license,
          'message': r.message
        };
      }).toList()
    };
  }

  @override
  Future<Map<String, dynamic>> install(String id) async {
    final value = _id(id), message = await service.install(value);
    return {
      'paused':
          service.lastProgress(value)?.phase == ResourceDownloadPhase.paused,
      'message': message
    };
  }

  @override
  bool pause(String id) => service.pause(_id(id));
  @override
  Future<void> restore(String id) async {
    await service.restorePrevious(_id(id));
  }

  @override
  Future<void> delete(String id) => service.delete(_id(id));
  @override
  void clearCache() => service.clearMemoryCache();
}

class ResourceActions {
  final ResourcePort port;
  final jobs = <String, Map<String, dynamic>>{};
  final busy = <String>{};
  ResourceActions([ResourcePort? port]) : port = port ?? DeviceResourcePort();
  bool handles(String action) => resourceActionCatalog.containsKey(action);
  Future<Map<String, dynamic>> approvalSummary(
      Map<String, dynamic> args) async {
    final state = await snapshot();
    if (!['tagCatalog', 'cooccurrence'].contains(args['id'])) {
      throw StateError('资源 ID 必须来自 resources.list');
    }
    if (args['expectedRevision'] != state['revision']) {
      throw StateError('资源数据库已变化，请重新读取');
    }
    return {
      ...args,
      'title': resourceActionCatalog[args['action']]?['title'],
      'resource': (state['resources'] as List)
          .where((r) => r['id'] == args['id'])
          .firstOrNull
    };
  }

  String revision(Map<String, dynamic> state) => sha256
      .convert(utf8.encode(jsonEncode((state['resources'] as List)
          .map((r) => {
                'id': r['id'],
                'installed': r['installed'],
                'valid': r['valid'],
                'version': r['version'],
                'hasPrevious': r['hasPrevious']
              })
          .toList())))
      .toString();
  Future<Map<String, dynamic>> snapshot() async {
    final state = await port.overview();
    return {
      ...state,
      'revision': revision(state),
      'jobs': jobs.values.map((x) => Map<String, dynamic>.from(x)).toList()
    };
  }

  Future<Map<String, dynamic>> execute(Map<String, dynamic> args) async {
    final action = args['action'], spec = resourceActionCatalog[action];
    if (spec == null) throw StateError('未知资源操作');
    final fields = List<String>.from(spec['fields'] ?? []);
    for (final key in args.keys) {
      if (!['action', 'expectedRevision', ...fields].contains(key)) {
        throw StateError('未知资源参数：$key');
      }
    }
    final before = await snapshot();
    if (spec['effect'] == 'read') return before;
    if (args['expectedRevision'] != before['revision']) {
      throw StateError('资源数据库已变化，请重新读取');
    }
    final id = args['id'];
    if (fields.isNotEmpty && !['tagCatalog', 'cooccurrence'].contains(id)) {
      throw StateError('资源 ID 必须来自 resources.list');
    }
    final row =
        (before['resources'] as List).where((r) => r['id'] == id).firstOrNull;
    if (fields.isNotEmpty &&
        action != 'resources.pause' &&
        (busy.contains(id) ||
            row?['operation'] != null ||
            row?['downloading'] == true)) throw StateError('该资源正在处理，请先暂停或等待完成');
    Map<String, dynamic> result;
    if (action == 'resources.download') {
      final key = id as String;
      busy.add(key);
      jobs[key] = {'id': key, 'state': 'running'};
      unawaited(() async {
        try {
          final reply = await port.install(key), after = await port.overview();
          final installed = (after['resources'] as List)
              .where((r) => r['id'] == key)
              .firstOrNull;
          final complete = reply['paused'] != true &&
              installed?['installed'] == true &&
              installed?['valid'] == true;
          jobs[key] = {
            'id': key,
            'state': reply['paused'] == true
                ? 'paused'
                : complete
                    ? 'complete'
                    : 'error',
            'message': reply['message'] ?? '安装回读未通过'
          };
        } catch (e) {
          jobs[key] = {'id': key, 'state': 'error', 'message': e.toString()};
        } finally {
          busy.remove(key);
        }
      }());
      result = {
        'started': true,
        'id': key,
        'notice': '任务已启动，尚未确认安装完成；请读取 resources.list'
      };
    } else if (action == 'resources.pause') {
      if (!port.pause(id as String)) throw StateError('当前没有可暂停的下载，或正在提交数据库');
      if (jobs[id]?['state'] == 'running') {
        jobs[id] = {'id': id, 'state': 'pausing'};
      }
      result = {'pauseRequested': true, 'id': id};
    } else if (action == 'resources.clearCache') {
      port.clearCache();
      if ((await port.overview())['cache']['memoryEntries'] != 0) {
        throw StateError('缓存清理回读未通过');
      }
      result = {'cleared': true};
    } else {
      final key = id as String;
      busy.add(key);
      try {
        if (action == 'resources.restore') {
          await port.restore(key);
        } else {
          await port.delete(key);
        }
        final after = (await port.overview())['resources'] as List,
            current = after.firstWhere((r) => r['id'] == key);
        if (action == 'resources.restore' &&
            (current['installed'] != true || current['valid'] != true)) {
          throw StateError('恢复回读未通过');
        }
        if (action == 'resources.delete' &&
            (current['installed'] == true ||
                current['hasPrevious'] == true ||
                current['resumableBytes'] != 0)) throw StateError('删除回读未通过');
        result = {
          'id': key,
          'restored': action == 'resources.restore',
          'deleted': action == 'resources.delete'
        };
      } finally {
        busy.remove(key);
      }
    }
    return {...await snapshot(), 'result': result};
  }
}
