import 'dart:async';
import 'dart:io';

import 'package:archive/archive_io.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../images/metadata_edit.dart';
import '../images/metadata_recovery.dart';
import '../state/app_state.dart';
import '../ui/compact_workbench.dart';
import '../ui/global_typography.dart';

const _labels = {
  'zh-CN': [
    '图片元数据处理',
    '批量处理 PNG / WebP，结果另存为 PNG，不覆盖原图。',
    '选择图片',
    '处理方式',
    '去除生成元数据',
    '官方联网（默认）',
    '本地读取',
    '从第一张图片读取',
    '另存处理结果',
    '官方读取失败，请手动切换到「本地读取」后重试。',
    '正在处理…',
    '已选图片',
    '读取方式',
    '操作失败，请重试。',
    '已处理',
    '读取方式保存失败，应用重启后可能恢复默认。'
  ],
  'zh-TW': [
    '圖片中繼資料處理',
    '批次處理 PNG / WebP，另存為 PNG，不覆蓋原圖。',
    '選擇圖片',
    '處理方式',
    '移除生成中繼資料',
    '官方連線（預設）',
    '本機讀取',
    '從第一張圖片讀取',
    '另存處理結果',
    '官方讀取失敗，請手動切換「本機讀取」後再試。',
    '處理中…',
    '已選圖片',
    '讀取方式',
    '操作失敗，請再試。',
    '已處理',
    '無法儲存讀取方式，重新啟動後可能回復預設。'
  ],
  'en-US': [
    'Image metadata tools',
    'Batch process PNG / WebP and save new PNGs without overwriting the originals.',
    'Choose images',
    'Operation',
    'Remove generation metadata',
    'Official online (default)',
    'Read locally',
    'Read from first image',
    'Save processed images',
    'Official reading failed. Switch to local reading manually and retry.',
    'Processing…',
    'Images selected',
    'Read mode',
    'The operation failed. Please retry.',
    'Processed',
    'Could not save this preference. It may reset on restart.'
  ],
  'ja-JP': [
    '画像メタデータ処理',
    'PNG / WebP を一括処理し、元の画像を上書きせず PNG で保存します。',
    '画像を選択',
    '処理方法',
    '生成メタデータを削除',
    '公式オンライン（既定）',
    'ローカルで読み取る',
    '最初の画像から読み取る',
    '処理結果を保存',
    '公式の読み取りに失敗しました。ローカルに切り替えて再試行してください。',
    '処理中…',
    '選択した画像',
    '読み取り方法',
    '処理に失敗しました。再試行してください。',
    '処理済み',
    '設定を保存できませんでした。再起動すると初期値に戻る場合があります。'
  ],
  'ko-KR': [
    '이미지 메타데이터 처리',
    'PNG / WebP를 일괄 처리해 원본을 덮어쓰지 않고 PNG로 저장합니다.',
    '이미지 선택',
    '처리 방법',
    '생성 메타데이터 제거',
    '공식 온라인(기본값)',
    '로컬 읽기',
    '첫 이미지에서 읽기',
    '처리 결과 저장',
    '공식 읽기에 실패했습니다. 로컬로 전환해 다시 시도하세요.',
    '처리 중…',
    '선택한 이미지',
    '읽기 방식',
    '작업에 실패했습니다. 다시 시도하세요.',
    '처리됨',
    '설정을 저장할 수 없습니다. 재시작 시 기본값으로 돌아갈 수 있습니다.'
  ],
};
List<String> _text(String language) => _labels[language] ?? _labels['zh-CN']!;
String metadataEditTitle(String language) => _text(language)[0];
String metadataEditSubtitle(String language) => _text(language)[1];

class MetadataEditScreen extends StatefulWidget {
  const MetadataEditScreen({super.key, required this.onBack});
  final VoidCallback onBack;

  @override
  State<MetadataEditScreen> createState() => _MetadataEditScreenState();
}

class _MetadataEditScreenState extends State<MetadataEditScreen> {
  final _reader = MetadataRecoveryReader();
  final _draft = TextEditingController();
  final _files = <PlatformFile>[];
  MetadataEditKind _kind = MetadataEditKind.remove;
  MetadataRecoveryMode _mode = MetadataRecoveryMode.online;
  bool _busy = false;
  bool _prefsReady = false;
  String _message = '';
  int _done = 0;

  Future<File> _preference() async {
    final storage = await getApplicationSupportDirectory();
    return File('${storage.path}/metadata-editor-reader-mode');
  }

  @override
  void initState() {
    super.initState();
    unawaited(_restore());
  }

  Future<void> _restore() async {
    var mode = MetadataRecoveryMode.online;
    try {
      final file = await _preference();
      if (await file.exists() &&
          await file.length() < 16 &&
          await file.readAsString() == 'offline') {
        mode = MetadataRecoveryMode.offline;
      }
    } catch (_) {/* Default is official online. */}
    if (mounted) {
      setState(() {
        _mode = mode;
        _prefsReady = true;
      });
    }
  }

  @override
  void dispose() {
    unawaited(_reader.cancel());
    _draft.dispose();
    super.dispose();
  }

  Future<void> _setMode(MetadataRecoveryMode next, List<String> l) async {
    setState(() {
      _mode = next;
      _draft.clear();
      _message = '';
      _prefsReady = false;
    });
    try {
      final file = await _preference();
      final temporary = File('${file.path}.tmp');
      await temporary.writeAsString(next.name, flush: true);
      await temporary.rename(file.path);
    } catch (_) {
      if (mounted) setState(() => _message = l[15]);
    } finally {
      if (mounted) setState(() => _prefsReady = true);
    }
  }

  Future<void> _run(List<String> l, Future<void> Function() callback) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _message = '';
      _done = 0;
    });
    try {
      await callback();
    } catch (error) {
      if (mounted) {
        setState(() => _message =
            error is FormatException ? '${l[13]} ${error.message}' : l[13]);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pick(List<String> l) => _run(l, () async {
        final result = await FilePicker.platform.pickFiles(
          allowMultiple: true,
          withData: false,
          type: FileType.custom,
          allowedExtensions: const ['png', 'webp'],
        );
        if (!mounted || result == null) return;
        final readable = result.files.where((f) => f.path != null).toList();
        if (readable.isEmpty ||
            readable.length != result.files.length ||
            readable.length > 64) {
          throw const FormatException('Choose 1–64 readable images.');
        }
        setState(() {
          _files
            ..clear()
            ..addAll(readable);
          _draft.clear();
        });
      });

  Future<void> _read(List<String> l) => _run(l, () async {
        final mode =
            _kind == MetadataEditKind.sd ? MetadataRecoveryMode.offline : _mode;
        try {
          _draft.clear();
          final bytes = await readMetadataInput(File(_files.first.path!));
          if (!mounted) return;
          final report = await _reader.read(bytes, mode: mode);
          final data = report.rawMetadata;
          final value = _kind == MetadataEditKind.sd
              ? (data['parameters'] ?? data['Parameters'])
              : (data['Comment'] ?? data['comment']);
          if (value == null || value.isEmpty) {
            throw const FormatException('Metadata format not found.');
          }
          if (mounted) _draft.text = value;
        } catch (_) {
          if (mounted) {
            setState(() =>
                _message = mode == MetadataRecoveryMode.online ? l[9] : l[13]);
          }
        }
      });

  Future<void> _export(List<String> l) => _run(l, () async {
        final kind = _kind;
        final text = _draft.text;
        editedGenerationMetadata(kind, text);
        final root = await getTemporaryDirectory();
        final work = await root.createTemp('metadata-staging-');
        final zip = File(
            '${root.path}/metadata-processed-${DateTime.now().microsecondsSinceEpoch}.zip');
        final encoder = ZipFileEncoder();
        var kept = false;
        final failures = <String>[];
        var total = 0;
        var successful = 0;
        try {
          encoder.create(zip.path);
          try {
            for (var i = 0; i < _files.length; i++) {
              if (!mounted) return;
              final file = _files[i];
              final temp = File('${work.path}/image.png');
              try {
                final png = await rewriteGenerationMetadata(
                    await readMetadataInput(File(file.path!)), kind, text);
                if (!mounted) return;
                if (total + png.length > 160 * 1024 * 1024) {
                  throw const FormatException(
                      'Batch output limit reached. Select fewer images.');
                }
                final stem = file.name
                    .replaceFirst(RegExp(r'\.[^.]+$'), '')
                    .replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1f]'), '-');
                final name = String.fromCharCodes(stem.runes.take(80));
                await temp.writeAsBytes(png);
                await encoder.addFile(
                    temp, '${i + 1}-${name.isEmpty ? "image" : name}.png', 0);
                total += png.length;
                successful++;
              } catch (e) {
                failures.add(
                    '${file.name}: ${e is FormatException ? e.message : l[13]}');
              } finally {
                if (await temp.exists()) await temp.delete();
              }
              if (mounted) setState(() => _done = i + 1);
            }
            if (successful == 0) {
              if (mounted) setState(() => _message = failures.join('\n'));
              return;
            }
            if (failures.isNotEmpty) {
              final report = File('${work.path}/skipped.txt');
              await report.writeAsString(failures.join('\n'));
              await encoder.addFile(report, 'skipped.txt');
            }
          } finally {
            await encoder.close();
          }
          if (!mounted) return;
          final box = context.findRenderObject() as RenderBox?;
          final origin = box != null && box.hasSize
              ? box.localToGlobal(Offset.zero) & box.size
              : null;
          final result = await Share.shareXFiles(
              [XFile(zip.path, mimeType: 'application/zip')],
              sharePositionOrigin: origin);
          kept = result.status != ShareResultStatus.dismissed;
          if (mounted) {
            setState(() => _message = '${l[14]} $successful/${_files.length}'
                '${failures.isEmpty ? "" : "\n${failures.join('\n')}"}');
          }
        } finally {
          await work.delete(recursive: true);
          if (!kept && await zip.exists()) await zip.delete();
        }
      });

  @override
  Widget build(BuildContext context) {
    final l =
        _text(context.select<AppState, String>((s) => s.settings.language));
    return Scaffold(
      appBar: workbenchAppBar(
          context,
          AppBar(
            title: studioAppBarTitle(context, Text(l[0])),
            leading: BackButton(onPressed: widget.onBack),
          )),
      body: SafeArea(
          child: ListView(padding: const EdgeInsets.all(16), children: [
        Text(l[1]),
        const SizedBox(height: 14),
        OutlinedButton.icon(
            onPressed: _busy ? null : () => _pick(l),
            label: Text(l[2]),
            icon: const Icon(Icons.add_photo_alternate_outlined)),
        if (_files.isNotEmpty) Text('${l[11]}: ${_files.length}'),
        const SizedBox(height: 12),
        DropdownButtonFormField<MetadataEditKind>(
          value: _kind,
          isExpanded: true,
          decoration: InputDecoration(labelText: l[3]),
          items: [
            DropdownMenuItem(value: MetadataEditKind.remove, child: Text(l[4])),
            const DropdownMenuItem(
                value: MetadataEditKind.novelai,
                child: Text('NovelAI · Comment JSON')),
            const DropdownMenuItem(
                value: MetadataEditKind.sd,
                child: Text('Stable Diffusion · parameters')),
          ],
          onChanged: _busy
              ? null
              : (value) {
                  if (value != null) {
                    setState(() {
                      _kind = value;
                      _draft.clear();
                      _message = '';
                    });
                  }
                },
        ),
        if (_kind == MetadataEditKind.novelai) ...[
          const SizedBox(height: 14),
          DropdownButtonFormField<MetadataRecoveryMode>(
            value: _mode,
            decoration: InputDecoration(labelText: l[12]),
            items: [
              DropdownMenuItem(
                  value: MetadataRecoveryMode.online, child: Text(l[5])),
              DropdownMenuItem(
                  value: MetadataRecoveryMode.offline, child: Text(l[6])),
            ],
            onChanged: _busy || !_prefsReady
                ? null
                : (value) {
                    if (value != null) _setMode(value, l);
                  },
          ),
        ],
        if (_kind != MetadataEditKind.remove) ...[
          const SizedBox(height: 14),
          OutlinedButton(
              onPressed: _busy || !_prefsReady || _files.isEmpty
                  ? null
                  : () => _read(l),
              child: Text(l[7])),
          TextField(
              controller: _draft,
              enabled: !_busy,
              minLines: 3,
              maxLines: 8,
              decoration: InputDecoration(
                  border: const OutlineInputBorder(),
                  labelText: _kind == MetadataEditKind.novelai
                      ? 'Comment JSON'
                      : 'Stable Diffusion parameters')),
        ],
        const SizedBox(height: 16),
        FilledButton(
            onPressed: _busy || _files.isEmpty ? null : () => _export(l),
            child: Text(l[8])),
        if (_busy) ...[
          LinearProgressIndicator(
              value: _done == 0 ? null : _done / _files.length,
              semanticsLabel: l[10]),
          Text(_done == 0 ? l[10] : '$_done/${_files.length}'),
        ],
        if (_message.isNotEmpty)
          Semantics(liveRegion: true, child: Text(_message)),
      ])),
    );
  }
}
