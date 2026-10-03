import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:image/image.dart' as img;
import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'comic_models.dart';
import 'comic_project_transfer.dart';

/// Shared file boundary for software UI and Agent comic operations.
class ComicAssetStore {
  final Future<Directory> Function() root;
  final Future<void> Function(File) share;
  final Set<String> _imports = {};
  ComicAssetStore(
      {Future<Directory> Function()? root, Future<void> Function(File)? share})
      : root = root ??
            (() async => Directory(path.join(
                (await getApplicationSupportDirectory()).path,
                'comic-assets'))),
        share = share ??
            ((file) async {
              final result = await Share.shareXFiles([
                XFile(file.path,
                    mimeType: file.path.endsWith('.zip')
                        ? 'application/zip'
                        : 'application/json')
              ]);
              // Closing the sheet (or an unknown platform result) is not a
              // confirmed destination selection. Keep the verified file below.
              if (result.status != ShareResultStatus.success) {
                throw StateError('系统分享未确认完成');
              }
            });

  Future<Uint8List> _image(String filename) async {
    if (await FileSystemEntity.type(filename, followLinks: false) !=
        FileSystemEntityType.file) throw StateError('图片不存在或不是普通文件，请重新选择');
    final file = File(filename), size = await File(filename).length();
    if (size == 0 || size > 32 * 1024 * 1024) throw StateError('图片大小须在32MiB以内');
    final bytes = await file.readAsBytes();
    if (bytes.length > 32 * 1024 * 1024) throw StateError('图片过大');
    img.Image? image;
    try {
      final decoder = img.findDecoderForData(bytes),
          info = decoder?.startDecode(bytes);
      if (info == null ||
          info.width <= 0 ||
          info.height <= 0 ||
          info.width * info.height > 40000000) {
        throw StateError('图片格式或尺寸无效');
      }
      image = decoder!.decodeFrame(0);
    } catch (_) {
      throw StateError('图片格式或尺寸无效，请重新选择');
    }
    if (image == null) throw StateError('图片解码失败');
    final png = img.encodePng(image);
    if (png.length > 32 * 1024 * 1024) throw StateError('标准化后的图片超过32MiB');
    return png;
  }

  /// The caller supplies only a user-picked file or a registered image. No
  /// original is modified. Newly created copies may be rolled back on save failure.
  Future<ComicReferenceAsset> importImage(String filename,
      {String? name}) async {
    final bytes = await _image(filename), dir = await root();
    await dir.create(recursive: true);
    final assetId = 'comic-reference-${comicId()}',
        file = File(path.join(dir.path, '$assetId.png'));
    await file.create(exclusive: true);
    try {
      await file.writeAsBytes(bytes, flush: true);
    } catch (_) {
      await file.delete();
      rethrow;
    }
    _imports.add(file.path);
    return ComicReferenceAsset(
        id: assetId,
        name: name ?? path.basename(filename),
        filePath: file.path);
  }

  Future<void> removeImported(ComicReferenceAsset asset) async {
    if (!_imports.remove(asset.filePath)) return;
    final file = File(asset.filePath);
    if (await file.exists()) await file.delete();
  }

  Future<Map<String, dynamic>> exportSelected(ComicProject project,
      Map<String, dynamic> portable, void Function() check) async {
    check();
    final archive = Archive(), prompts = StringBuffer('# ${project.title}\n\n');
    final imageMap = <Map<String, dynamic>>[];
    var count = 0, total = 0;
    for (final panel in project.panels) {
      final candidate = panel.selectedCandidate;
      if (candidate == null) continue;
      final bytes = await _image(candidate.outputPath);
      check();
      total += bytes.length;
      if (total > 256 * 1024 * 1024) throw StateError('导出图片超过256MiB，请减少分镜');
      final name = 'images/${(++count).toString().padLeft(3, '0')}.png';
      archive.addFile(ArchiveFile(name, bytes.length, bytes));
      imageMap.add({
        'panelId': panel.id,
        'index': panel.index,
        'file': name,
        'sha256': sha256.convert(bytes).toString()
      });
      prompts
        ..writeln('## ${panel.index}. ${panel.title}')
        ..writeln(panel.prompt)
        ..writeln();
    }
    if (count == 0) throw StateError('没有已选候选图可导出');
    for (final entry in {
      'project.json': jsonEncode(portable),
      'prompts.md': prompts.toString(),
      'images.json': jsonEncode(imageMap)
    }.entries) {
      final bytes = utf8.encode(entry.value);
      archive.addFile(ArchiveFile(entry.key, bytes.length, bytes));
    }
    final bytes = ZipEncoder().encode(archive);
    if (bytes == null) throw StateError('ZIP编码失败');
    ZipDecoder().decodeBytes(bytes, verify: true);
    return _saveAndShare(bytes, 'zip', count, check);
  }

  Future<Map<String, dynamic>> exportProject(
      ComicProject project, void Function() check) async {
    check();
    final bytes = utf8.encode(const JsonEncoder.withIndent('  ')
        .convert(portableComicProject(project)));
    return _saveAndShare(bytes, 'json', project.panels.length, check);
  }

  Future<Map<String, dynamic>> _saveAndShare(List<int> bytes, String extension,
      int count, void Function() check) async {
    final dir = await root();
    await dir.create(recursive: true);
    check();
    final id = 'comic-export-${comicId()}',
        temp = File(path.join(dir.path, '$id.tmp')),
        file = File(path.join(dir.path, '$id.$extension'));
    await temp.create(exclusive: true);
    try {
      await temp.writeAsBytes(bytes, flush: true);
      check();
      await temp.rename(file.path);
      check();
      if (sha256.convert(await file.readAsBytes()).toString() !=
          sha256.convert(bytes).toString()) {
        throw StateError('导出文件回读校验失败');
      }
      check();
    } catch (_) {
      if (await temp.exists()) await temp.delete();
      if (await file.exists()) await file.delete();
      rethrow;
    }
    final digest = sha256.convert(bytes).toString();
    final receipt = <String, dynamic>{
      'id': id,
      'filePath': file.path,
      'count': count,
      'bytes': bytes.length,
      'sha256': digest,
      'shared': false
    };
    try {
      await share(file);
      receipt['shared'] = true;
    } catch (_) {
      receipt['shareError'] = '导出文件已保存，系统分享未确认完成';
    }
    return receipt;
  }
}
