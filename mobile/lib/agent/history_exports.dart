import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../history/history_archive.dart';
import '../models/nai_models.dart';
import 'studio_data_service.dart';

/// App-owned archives and durable receipts. Models receive IDs, never a general
/// file-open API. Sharing is only possible after a successful digest check.
class HistoryExports {
  final Future<Directory> Function() root;
  final Future<void> Function(File) open;
  Future<void> _tail = Future<void>.value();
  HistoryExports(
      {Future<Directory> Function()? root, Future<void> Function(File)? open})
      : root = root ??
            (() => getApplicationSupportDirectory().then((dir) =>
                Directory(path.join(dir.path, 'agent-history-exports')))),
        open = open ??
            ((file) async {
              await Share.shareXFiles(
                  [XFile(file.path, mimeType: 'application/zip')]);
            });
  Future<T> _serial<T>(Future<T> Function() work) {
    final task = _tail.then((_) => work());
    _tail = task.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return task;
  }

  Future<List<Map<String, dynamic>>> _read(Directory dir) async {
    final file = File(path.join(dir.path, 'receipts.json'));
    String text;
    try {
      text = await file.readAsString();
    } on FileSystemException catch (e) {
      if ([2, 3].contains(e.osError?.errorCode)) return [];
      rethrow;
    }
    final raw = jsonDecode(text);
    if (raw is! List) throw StateError('导出记录损坏');
    return raw.map((value) {
      final row = Map<String, dynamic>.from(value as Map);
      final id = row['id'];
      if (id is! String ||
          !RegExp(r'^\d+-[a-f0-9]+$').hasMatch(id) ||
          row['filePath'] != path.join(dir.path, '$id.zip') ||
          row['sha256'] is! String) throw StateError('导出记录损坏');
      return row;
    }).toList();
  }

  Future<Map<String, dynamic>> list() async {
    final dir = await root(), rows = await _read(dir);
    final items = <Map<String, dynamic>>[];
    for (final row in rows) {
      var available = false;
      try {
        final file = File(row['filePath'] as String);
        available =
            await FileSystemEntity.type(file.path, followLinks: false) ==
                    FileSystemEntityType.file &&
                await file.length() == row['bytes'];
      } catch (_) {}
      items.add({...row, 'available': available});
    }
    return {'items': items};
  }

  Future<Map<String, dynamic>> create(List<HistoryItem> source,
          List<HistoryGroup> groups, String group, Object? language) =>
      _serial(() async {
        if (group.isNotEmpty &&
            group != '__ungrouped' &&
            !groups.any((x) => x.id == group)) throw StateError('历史分组不存在');
        final items = source
            .where((x) =>
                group.isEmpty ||
                (group == '__ungrouped'
                    ? x.groupId == null || x.groupId!.isEmpty
                    : x.groupId == group))
            .toList();
        if (items.isEmpty) throw StateError('该分组没有可导出的图片');
        final clean = items
            .map((item) => HistoryItem.fromJson({
                  ...item.toJson(),
                  'params': StudioDataService.project(item.params)
                }))
            .toList();
        final bytes = await buildHistoryArchive(clean,
            groups.where((x) => items.any((i) => i.groupId == x.id)).toList(),
            (filePath) async {
          if (!RegExp(r'\.(png|jpe?g|webp|gif|avif)$', caseSensitive: false)
                  .hasMatch(filePath) ||
              await FileSystemEntity.type(filePath, followLinks: false) !=
                  FileSystemEntityType.file) {
            throw StateError('图片已移动或不是普通文件；本次导出未完成');
          }
          return File(filePath).readAsBytes();
        }, language);
        ZipDecoder().decodeBytes(bytes, verify: true);
        final dir = await root();
        await dir.create(recursive: true);
        final id =
            '${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 32).toRadixString(16)}';
        final file = File(path.join(dir.path, '$id.zip')),
            index = File(path.join(dir.path, 'receipts.json')),
            temp = File(path.join(dir.path, '$id.tmp'));
        final receipt = <String, dynamic>{
          'id': id,
          'filePath': file.path,
          'fileName': path.basename(file.path),
          'count': items.length,
          'bytes': bytes.length,
          'sha256': sha256.convert(bytes).toString(),
          'createdAt': DateTime.now().toUtc().toIso8601String(),
          'group': group
        };
        await file.create(exclusive: true);
        try {
          await file.writeAsBytes(bytes, flush: true);
          final rows = await _read(dir);
          await temp.writeAsString(jsonEncode([receipt, ...rows]), flush: true);
          await temp.rename(index.path);
        } catch (_) {
          try {
            await file.delete();
          } catch (_) {}
          rethrow;
        } finally {
          if (await temp.exists()) await temp.delete();
        }
        return receipt;
      });
  Future<Map<String, dynamic>> reveal(String id) async {
    final rows = await _read(await root()),
        receipt = rows.where((x) => x['id'] == id).firstOrNull;
    if (receipt == null) throw StateError('导出记录不存在，请先导出或读取列表');
    final file = File(receipt['filePath'] as String);
    if (await FileSystemEntity.type(file.path, followLinks: false) !=
            FileSystemEntityType.file ||
        await file.length() != receipt['bytes'] ||
        sha256.convert(await file.readAsBytes()).toString() !=
            receipt['sha256']) throw StateError('导出文件已改变或删除，请重新导出');
    await open(file);
    return {...receipt, 'opened': true};
  }
}
