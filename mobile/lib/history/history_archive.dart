import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';

import '../models/nai_models.dart';

String safeFileStem(String value, {String fallback = 'image'}) {
  final cleaned = value
      .trim()
      .replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1f]'), '_')
      .replaceAll(RegExp(r'\s+'), ' ')
      .replaceAll(RegExp(r'[. ]+$'), '');
  return cleaned.isEmpty ? fallback : cleaned;
}

Future<Uint8List> buildHistoryArchive(
  List<HistoryItem> items,
  List<HistoryGroup> groups,
  Future<Uint8List> Function(String path) readBytes,
) async {
  final archive = Archive();
  final groupNames = {for (final group in groups) group.id: group.name};
  final usedNames = <String>{};
  final exportedItems = <Map<String, dynamic>>[];
  final prompts = StringBuffer('# Langbai NovelAI Studio\n\n');

  for (var index = 0; index < items.length; index++) {
    final item = items[index];
    final sourceName = item.filePath.replaceAll('\\', '/').split('/').last;
    final dot = sourceName.lastIndexOf('.');
    final extension =
        dot >= 0 ? sourceName.substring(dot).toLowerCase() : '.png';
    final stem =
        safeFileStem(dot >= 0 ? sourceName.substring(0, dot) : sourceName);
    final groupName = safeFileStem(
      groupNames[item.groupId] ?? '未分组',
      fallback: '未分组',
    );

    var relativePath = 'images/$groupName/$stem$extension';
    var suffix = 2;
    while (!usedNames.add(relativePath.toLowerCase())) {
      relativePath = 'images/$groupName/$stem-$suffix$extension';
      suffix++;
    }

    final bytes = await readBytes(item.filePath);
    archive.addFile(ArchiveFile(relativePath, bytes.length, bytes));
    exportedItems.add({...item.toJson(), 'filePath': relativePath});

    prompts
      ..writeln('## ${index + 1}. $sourceName')
      ..writeln()
      ..writeln('- 功能：${item.feature}')
      ..writeln('- 模型：${item.model}')
      ..writeln('- 种子：${item.seed}')
      ..writeln('- 尺寸：${item.width}x${item.height}')
      ..writeln('- 分组：$groupName')
      ..writeln()
      ..writeln(item.prompt.isEmpty ? '（无提示词）' : item.prompt)
      ..writeln();
  }

  final manifest = utf8.encode(const JsonEncoder.withIndent('  ').convert({
    'version': 1,
    'exportedAt': DateTime.now().toUtc().toIso8601String(),
    'groups': groups.map((group) => group.toJson()).toList(),
    'items': exportedItems,
  }));
  final promptBytes = utf8.encode(prompts.toString());
  archive
    ..addFile(ArchiveFile('project.json', manifest.length, manifest))
    ..addFile(ArchiveFile('prompts.md', promptBytes.length, promptBytes));

  final encoded = ZipEncoder().encode(archive);
  if (encoded == null) throw StateError('无法创建 ZIP 文件');
  return Uint8List.fromList(encoded);
}
