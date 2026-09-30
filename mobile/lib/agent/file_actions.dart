import 'dart:convert';
import 'dart:io';
import 'package:path/path.dart' as path;
import 'package:share_plus/share_plus.dart';
import 'agent_models.dart';

/// UI-only: a user taps an image path in the Agent webpage. Never registered as
/// an LLM tool, and never accepts arbitrary files outside Studio history.
class AgentFileActions {
  static const tool = 'studio_reveal_image';
  final Iterable<String> Function() historyPaths;
  final Future<void> Function(File) open;
  bool _opening = false;

  AgentFileActions({required this.historyPaths, Future<void> Function(File)? open})
      : open = open ?? ((file) async {
          await Share.shareXFiles([XFile(file.path)]);
        });

  Future<AgentToolResult> execute(Map<String, dynamic> args) async {
    var ownsOpening = false;
    try {
      if (args.keys.any((key) => !{'action', 'filePath'}.contains(key))) {
        throw StateError('未知图片操作参数');
      }
      if (args['action'] == 'capabilities') {
        return AgentToolResult(ok: true, title: '查看或分享图片', output: jsonEncode({
          'reveal': true, 'label': '查看或分享图片',
          'openedText': '已打开图片分享面板', 'platform': 'android',
        }));
      }
      final value = args['filePath'];
      if (args['action'] != 'reveal' || value is! String ||
          value.length > 4096 || !path.isAbsolute(value) ||
          RegExp(r'[\x00-\x1f]').hasMatch(value) ||
          !RegExp(r'\.(png|jpe?g|webp|gif|avif)$', caseSensitive: false).hasMatch(value)) {
        throw StateError('请选择有效的本机生成图片');
      }
      final normalized = path.normalize(path.absolute(value));
      if (!historyPaths().any((item) => path.normalize(path.absolute(item)) == normalized)) {
        throw StateError('此图片不在本机生成历史中');
      }
      if (await FileSystemEntity.type(normalized, followLinks: false) != FileSystemEntityType.file) {
        throw StateError('图片已移动、已删除或不是普通文件');
      }
      if (_opening) throw StateError('图片面板已在打开，请稍后再试');
      _opening = true; ownsOpening = true;
      await open(File(normalized));
      return AgentToolResult(ok: true, title: '查看或分享图片',
          output: jsonEncode({'opened': true, 'filePath': normalized}));
    } catch (_) {
      // Native plugin errors may contain private paths. Return a clear, bounded
      // message without claiming that a file was opened/shared successfully.
      return const AgentToolResult(ok: false, title: '图片未打开',
          output: '请确认图片仍在本机生成历史且文件存在，再点击查看或分享。');
    } finally {
      if (ownsOpening) _opening = false;
    }
  }
}
