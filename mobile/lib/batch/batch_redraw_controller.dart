import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:archive/archive.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../billing/anlas.dart';
import '../i18n/runtime_text.dart';
import '../models/nai_models.dart';
import '../references/reference_presets.dart';
import '../services/background_queue_service.dart';
import '../services/import_limits.dart';
import '../services/nai_api.dart';
import '../state/app_state.dart';
import 'batch_redraw_models.dart';

/// A confirmed batch request.  The editor keeps mutable project state, while a
/// running queue must continue with exactly the settings that were present when
/// the user pressed generate.  Keeping the request data separate also means a
/// later retry can take a fresh snapshot without clearing existing results.
class _BatchRedrawQueueJob {
  final BatchRedrawItem item;
  final GenerateParams params;
  final GenerateExtras extras;
  final double strength;

  const _BatchRedrawQueueJob({
    required this.item,
    required this.params,
    required this.extras,
    required this.strength,
  });
}

class BatchRedrawController extends ChangeNotifier {
  final AppState app;
  late BatchRedrawProject project;
  BatchRedrawStep step = BatchRedrawStep.import;
  bool loaded = false;
  bool busy = false;
  bool queueRunning = false;
  bool queuePaused = false;
  bool queueCancelled = false;
  int queueDone = 0;
  int queueTotal = 0;
  String status = runtimeTextFor('zh-CN', 'common.ready');
  Timer? _saveTimer;
  bool _disposed = false;

  BatchRedrawController(this.app) {
    BackgroundQueueService.addCancelHandler(cancelQueue);
  }

  // The queue loop is a plain async function, not tied to widget lifecycle —
  // leaving the batch screen mid-queue must not let it keep calling
  // notifyListeners() on a disposed ChangeNotifier (Flutter throws on that),
  // nor keep the paid request running unattended in the background.
  @override
  void notifyListeners() {
    if (_disposed) return;
    super.notifyListeners();
  }

  String _rt(String key) => runtimeTextFor(app.settings.language, key);
  String _rf(String key, Map<String, Object?> values) =>
      runtimeFormatFor(app.settings.language, key, values);
  String _projectName() => project.groupName.trim().isEmpty ||
          project.groupName == legacyBatchRedrawGroupName ||
          project.groupName == defaultBatchRedrawGroupName
      ? _rt('batch.defaultName')
      : project.groupName;
  String get displayStatus =>
      status == runtimeTextFor('zh-CN', 'common.ready') ||
              status == runtimeTextFor('en-US', 'common.ready')
          ? _rt('common.ready')
          : status;
  String get displayGroupName => _projectName();

  Future<void> load() async {
    try {
      project = await app.storage.getBatchRedrawProject(app.params);
    } catch (_) {
      project = BatchRedrawProject.empty(app.params);
    }
    loaded = true;
    notifyListeners();
  }

  void changed([String? message]) {
    if (message != null) status = message;
    notifyListeners();
    _saveTimer?.cancel();
    _saveTimer = Timer(
      const Duration(milliseconds: 250),
      () => app.storage.setBatchRedrawProject(project),
    );
  }

  void setStep(BatchRedrawStep value) {
    step = value;
    notifyListeners();
  }

  void reset() {
    project = BatchRedrawProject.empty(app.params);
    step = BatchRedrawStep.import;
    changed(_rt('batch.statusNew'));
  }

  Future<String?> addImages(List<String> paths) async {
    var added = 0;
    for (final path in paths) {
      try {
        final file = File(path);
        final bytes = await file.readAsBytes();
        final dimensions = AppState.readImageDimensions(bytes);
        project.items.add(BatchRedrawItem(
          id: _id(),
          name: file.uri.pathSegments.last,
          base64: base64Encode(bytes),
          sourcePath: path,
          width: dimensions.$1,
          height: dimensions.$2,
          params: project.globalParams.copy(),
        ));
        added++;
      } catch (_) {}
    }
    if (added == 0) return _rt('batch.noValidImages');
    changed(_rf('batch.imagesImported', {'count': added}));
    return null;
  }

  String createPerImageSizeTemplate() {
    final lines = project.items.map((item) {
      if (item.outputWidth != null &&
          item.outputHeight != null &&
          isValidBatchNaiSize(item.outputWidth!, item.outputHeight!)) {
        return '${item.outputWidth}×${item.outputHeight}';
      }
      final params = item.overrideParams ? item.params : project.globalParams;
      final output = adaptiveNaiImageSize(
        item.width,
        item.height,
        fallbackWidth: params.width,
        fallbackHeight: params.height,
      );
      return '${output.$1}×${output.$2}';
    }).join('\n');
    project
      ..sizeMode = 'perImage'
      ..sizeBulk = lines;
    changed();
    return lines;
  }

  String _sizeImportMessage(BatchSizeImportException error) {
    return switch (error.code) {
      'count' => _rf('batch.sizeMode.perImageCount', {
          'expected': error.expected ?? project.items.length,
          'actual': error.actual ?? 0,
        }),
      'blank' => _rf('batch.sizeMode.perImageBlank', {
          'line': error.line ?? 0,
        }),
      'format' => _rf('batch.sizeMode.perImageFormat', {
          'line': error.line ?? 0,
        }),
      'unsupported' => _rf('batch.sizeMode.perImageUnsupported', {
          'line': error.line ?? 0,
        }),
      _ => _rt('batch.sizeMode.perImageEmpty'),
    };
  }

  bool applyPerImageSizes({bool announce = true}) {
    if (project.items.isEmpty) {
      status = _rt('batch.noValidImages');
      notifyListeners();
      return false;
    }
    try {
      final sizes = parseBatchSizeImport(
        project.sizeBulk,
        project.items.length,
      );
      for (var index = 0; index < project.items.length; index++) {
        project.items[index]
          ..outputWidth = sizes[index].$1
          ..outputHeight = sizes[index].$2;
      }
      project.sizeMode = 'perImage';
      changed(announce
          ? _rf('batch.sizeMode.perImageApplied', {'count': sizes.length})
          : null);
      return true;
    } on BatchSizeImportException catch (error) {
      status = _sizeImportMessage(error);
      notifyListeners();
      return false;
    }
  }

  void syncCurrentParams() {
    project
      ..globalParams = (app.params.copy()..positivePrompt = '')
      ..globalStyle = app.params.stylePrompt
      ..globalNegative = app.params.negativePrompt;
    changed(_rt('batch.syncedParams'));
  }

  GenerateExtras referencesFor(GenerateParams params) {
    final source = project.reuseMainReferences
        ? app.extras
        : GenerateExtras(
            vibeImages: project.vibeImages,
            preciseReferences: project.preciseReferences,
          );
    return source.copy();
  }

  void copyMainReferences() {
    final copied = app.extras.copy();
    project
      ..reuseMainReferences = false
      ..vibeImages = copied.vibeImages
      ..preciseReferences = copied.preciseReferences;
    changed(_rt('batch.copiedReferences'));
  }

  Future<String?> addReference(String path, {required bool precise}) async {
    try {
      final bytes = await File(path).readAsBytes();
      final dimensions = AppState.readImageDimensions(bytes);
      if (precise) {
        project.preciseReferences.add(PreciseReferenceItem(
          base64: base64Encode(bytes),
          sourcePath: path,
          width: dimensions.$1,
          height: dimensions.$2,
        ));
      } else {
        project.vibeImages.add(VibeTransferItem(
          base64: base64Encode(bytes),
          sourcePath: path,
        ));
      }
      changed(precise ? _rt('batch.addedPrecise') : _rt('batch.addedVibe'));
      return null;
    } catch (_) {
      return _rt('error.readReference');
    }
  }

  Future<String?> addReferencePreset(ReferencePreset preset) async {
    try {
      final bytes = await File(preset.filePath).readAsBytes();
      if (preset.kind == ReferencePresetKind.precise) {
        project.preciseReferences.add(PreciseReferenceItem(
          base64: base64Encode(bytes),
          sourcePath: preset.filePath,
          type: preset.preciseType,
          strength: preset.strength,
          fidelity: preset.fidelity,
          informationExtracted: 1,
          width: preset.width,
          height: preset.height,
        ));
      } else {
        project.vibeImages.add(VibeTransferItem(
          base64: base64Encode(bytes),
          sourcePath: preset.filePath,
          infoExtracted: preset.infoExtracted,
          strength: preset.strength,
        ));
      }
      changed(preset.kind == ReferencePresetKind.precise
          ? _rt('batch.addedPrecise')
          : _rt('batch.addedVibe'));
      return null;
    } catch (_) {
      return _rt('error.readReference');
    }
  }

  void updateVibeReference(
    int index, {
    double? infoExtracted,
    double? strength,
  }) {
    if (index < 0 || index >= project.vibeImages.length) return;
    project.vibeImages[index] = project.vibeImages[index].copyWith(
      infoExtracted: infoExtracted,
      strength: strength,
    );
    changed();
  }

  void updatePreciseReference(
    int index, {
    String? type,
    double? strength,
    double? fidelity,
    double? informationExtracted,
  }) {
    if (index < 0 || index >= project.preciseReferences.length) return;
    project.preciseReferences[index] =
        project.preciseReferences[index].copyWith(
      type: type,
      strength: strength,
      fidelity: fidelity,
      informationExtracted: informationExtracted,
    );
    changed();
  }

  void removeVibeReference(int index) {
    if (index < 0 || index >= project.vibeImages.length) return;
    project.vibeImages.removeAt(index);
    changed();
  }

  void removePreciseReference(int index) {
    if (index < 0 || index >= project.preciseReferences.length) return;
    project.preciseReferences.removeAt(index);
    changed();
  }

  void applyBulkPrompts() {
    final lines = const LineSplitter()
        .convert(project.promptBulk)
        .map((line) => line.trim())
        .where((line) => line.isNotEmpty)
        .toList();
    if (lines.isEmpty) return;
    for (var index = 0;
        index < project.items.length && index < lines.length;
        index++) {
      final line = lines[index];
      final pipe = line.indexOf('|');
      project.items[index].prompt =
          pipe >= 0 ? line.substring(pipe + 1).trim() : line;
    }
    changed(_rf('batch.bulkApplied', {
      'count': min(lines.length, project.items.length),
    }));
  }

  Future<void> reverseMissingPrompts() async {
    final targets =
        project.items.where((item) => item.prompt.trim().isEmpty).toList();
    if (targets.isEmpty || busy) return;
    final key = await app.storage.getVisionKey() ?? '';
    if (key.isEmpty) {
      status = _rt('batch.visionKeyRequired');
      notifyListeners();
      return;
    }
    busy = true;
    var done = 0;
    try {
      for (final item in targets) {
        status = _rf('batch.reversing', {'name': item.name});
        notifyListeners();
        final result = await app.api.reversePrompt(
          settings: app.settings,
          apiKey: key,
          image: base64Decode(item.base64),
          mode: project.aiMode,
          scope: ReversePromptScope.full,
          hint: '',
          knownCharacter: false,
          systemTemplate: app.resolvedPromptTemplate('reverse', project.aiMode),
        );
        if (result.ok) {
          item.prompt = result.text;
          done++;
        } else {
          item
            ..status = BatchItemStatus.failed
            ..error = result.message;
        }
        changed();
      }
      status = _rf('batch.reverseDone', {
        'done': done,
        'total': targets.length,
      });
    } finally {
      busy = false;
      changed();
    }
  }

  List<BatchRedrawItem> get selected =>
      project.items.where((item) => item.selected).toList();

  /// Freeze all mutable inputs for a confirmed queue.  Do not retain a
  /// reference to [project.globalParams], per-item params, prompts, strengths,
  /// or references: the editor remains available while the queue is running.
  List<_BatchRedrawQueueJob> _snapshotQueue(List<BatchRedrawItem> targets) {
    final globalStyle = project.globalStyle;
    final globalNegative = project.globalNegative;
    final globalStrength = project.globalStrength;
    List<(int, int)>? currentPerImageSizes;
    if (project.sizeMode == 'perImage') {
      try {
        currentPerImageSizes =
            parseBatchSizeImport(project.sizeBulk, project.items.length);
      } on BatchSizeImportException {
        currentPerImageSizes = null;
      }
    }
    return targets.map((item) {
      final sourceParams =
          item.overrideParams ? item.params : project.globalParams;
      final params = sourceParams.copy()
        ..positivePrompt = _merge(globalStyle, item.prompt)
        ..negativePrompt = globalNegative;
      if (project.sizeMode == 'adaptive') {
        final outputSize = adaptiveNaiImageSize(
          item.width,
          item.height,
          fallbackWidth: params.width,
          fallbackHeight: params.height,
        );
        params
          ..width = outputSize.$1
          ..height = outputSize.$2;
      } else if (project.sizeMode == 'perImage') {
        final itemIndex = project.items.indexWhere((entry) => entry.id == item.id);
        final imported = itemIndex >= 0 &&
                currentPerImageSizes != null &&
                itemIndex < currentPerImageSizes.length
            ? currentPerImageSizes[itemIndex]
            : null;
        final width = imported?.$1 ?? item.outputWidth;
        final height = imported?.$2 ?? item.outputHeight;
        if (width != null &&
            height != null &&
            isValidBatchNaiSize(width, height)) {
          params
            ..width = width
            ..height = height;
        }
      }
      return _BatchRedrawQueueJob(
        item: item,
        params: params,
        extras: referencesFor(sourceParams),
        strength: item.strength ?? globalStrength,
      );
    }).toList(growable: false);
  }

  int _quoteJobs(List<_BatchRedrawQueueJob> jobs) {
    var total = 0;
    for (final job in jobs) {
      total += calculateImageGenerationAnlas(
            params: job.params,
            account: app.account,
            extras: job.extras,
            imageToImage: true,
            strength: job.strength,
            alreadyEncodedVibes:
                app.api.countCachedVibes(job.params.model, job.extras),
            preciseReferenceCount: job.extras.preciseReferences.length,
            language: app.settings.language,
          ).amount ??
          0;
    }
    return total;
  }

  int quote(List<BatchRedrawItem> targets) {
    return _quoteJobs(_snapshotQueue(targets));
  }

  Future<void> startQueue(List<BatchRedrawItem> targets) async {
    if (targets.isEmpty || queueRunning) return;
    if (project.sizeMode == 'perImage' &&
        !applyPerImageSizes(announce: false)) {
      return;
    }
    // Build this before awaiting or changing any item state.  Every item in
    // the current run then receives the same confirmed global values, while a
    // later clear/retry call starts from the latest editor values.
    final jobs = _snapshotQueue(targets);
    final amount = _quoteJobs(jobs);
    final balance = app.account.anlasBalance;
    if (balance != null && amount > balance) {
      status = _rf('batch.insufficient', {
        'amount': amount,
        'balance': balance,
      });
      notifyListeners();
    }
    final vibeIncompatible = jobs.any((job) =>
        job.extras.vibeImages.isNotEmpty && !job.params.supportsVibeTransfer);
    if (vibeIncompatible) {
      status = _rt('error.vibeUnsupportedV5');
      notifyListeners();
      return;
    }
    final incompatible = jobs.any((job) =>
        job.extras.preciseReferences.isNotEmpty &&
        !job.params.supportsPreciseReference);
    if (incompatible) {
      status = _rt('error.preciseV45Only');
      notifyListeners();
      return;
    }
    queueRunning = true;
    queuePaused = false;
    queueCancelled = false;
    queueDone = 0;
    queueTotal = jobs.length;
    final queueGroupName = _projectName();
    var queueHistoryGroupId = project.historyGroupId;
    if (BackgroundQueueService.shouldWarnNoBackgroundSupport()) {
      status = _rt('status.backgroundNotSupported');
    }
    try {
      await BackgroundQueueService.start(
        'batch-redraw',
        title: _rt('notification.batchTitle'),
        text: _rf('notification.prepare', {'total': queueTotal}),
      );
    } catch (_) {}
    notifyListeners();
    for (final job in jobs) {
      final item = job.item;
      if (queueCancelled) break;
      while (queuePaused && !queueCancelled) {
        await Future<void>.delayed(const Duration(milliseconds: 220));
      }
      if (queueCancelled) break;
      item
        ..status = BatchItemStatus.generating
        ..error = '';
      changed(_rf('batch.generatingItem', {'name': item.name}));
      unawaited(BackgroundQueueService.update(
        title: _rt('notification.batchTitle'),
        text: _rf('notification.generating', {
          'current': queueDone + 1,
          'total': queueTotal,
        }),
      ));
      try {
        final history = await app.generateBatchRedrawItem(
          sourceBytes: base64Decode(item.base64),
          itemParams: job.params,
          itemExtras: job.extras,
          strength: job.strength,
          groupName: queueGroupName,
          historyGroupId: queueHistoryGroupId,
          cancelled: () => queueCancelled,
        );
        if (queueCancelled) {
          item
            ..status = BatchItemStatus.pending
            ..error = '';
          changed();
          break;
        }
        queueHistoryGroupId = history.groupId;
        project.historyGroupId = queueHistoryGroupId;
        item
          ..status = BatchItemStatus.done
          ..outputPath = history.filePath;
      } catch (error) {
        if (queueCancelled || error is GenerationCancelledException) {
          queueCancelled = true;
          item
            ..status = BatchItemStatus.pending
            ..error = '';
          changed();
          break;
        }
        item
          ..status = BatchItemStatus.failed
          ..error = error.toString().replaceFirst('Exception: ', '');
        final lower = item.error.toLowerCase();
        if (lower.contains('401') || lower.contains('unauthorized')) {
          queueCancelled = true;
          status = _rt('batch.authStopped');
        }
      }
      queueDone++;
      changed();
    }
    queueRunning = false;
    queuePaused = false;
    for (final item in project.items) {
      if (item.status == BatchItemStatus.generating) {
        item
          ..status = BatchItemStatus.pending
          ..error = '';
      }
    }
    await BackgroundQueueService.stop('batch-redraw');
    if (queueCancelled) {
      status = _rf('batch.queueCancelled', {
        'done': queueDone,
        'total': queueTotal,
      });
    } else {
      status = _rf('batch.queueDone', {
        'done': queueDone,
        'total': queueTotal,
      });
    }
    changed();
  }

  void togglePause() {
    queuePaused = !queuePaused;
    notifyListeners();
  }

  void cancelQueue() {
    if (!queueRunning || queueCancelled) return;
    queueCancelled = true;
    queuePaused = false;
    for (final item in project.items) {
      if (item.status == BatchItemStatus.generating) {
        item
          ..status = BatchItemStatus.pending
          ..error = '';
      }
    }
    status = _rf('batch.queueCancelled', {
      'done': queueDone,
      'total': queueTotal,
    });
    app.api.cancelActiveGeneration();
    notifyListeners();
  }

  Future<bool> clearGeneratedResults() async {
    if (queueRunning || busy) return false;
    final paths = project.items
        .map((item) => item.outputPath)
        .where((path) => path.isNotEmpty)
        .toSet();
    if (paths.isEmpty &&
        !project.items.any((item) => item.status == BatchItemStatus.failed)) {
      return false;
    }
    busy = true;
    notifyListeners();
    try {
      await app.deleteHistoryFiles(paths);
      for (final item in project.items) {
        item
          ..status = BatchItemStatus.pending
          ..outputPath = ''
          ..error = ''
          // A cleared run starts a fresh global-parameter revision. Keeping a
          // full per-image snapshot here made later global edits appear to do
          // nothing because the invisible old snapshot still took priority.
          ..overrideParams = false
          ..params = project.globalParams.copy();
      }
      queueDone = 0;
      queueTotal = 0;
      queuePaused = false;
      queueCancelled = false;
      step = BatchRedrawStep.params;
      changed(_rt('batch.resultsCleared'));
      return true;
    } catch (error) {
      status = _rf('batch.resultsClearFailed', {'error': error});
      notifyListeners();
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> exportJson() async {
    final temp = await getTemporaryDirectory();
    final file = File('${temp.path}/${_safe(_projectName())}.batch.json');
    await file.writeAsString(
      const JsonEncoder.withIndent('  ').convert(project.toJson()),
      flush: true,
    );
    await Share.shareXFiles([XFile(file.path)]);
  }

  Future<void> importJson() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['json'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    try {
      final picked = result.files.single;
      final bytes = picked.bytes ??
          (picked.path == null ? null : await File(picked.path!).readAsBytes());
      if (bytes == null) throw FormatException(_rt('error.readFile'));
      final imported = BatchRedrawProject.fromJson(
        Map<String, dynamic>.from(jsonDecode(utf8.decode(bytes))),
        app.params,
      );
      enforceImportLimits(
        imported.items.map((it) => it.base64).toList(),
        itemNoun: '张图片',
      );
      project = imported;
      changed(_rt('batch.projectImported'));
    } catch (error) {
      status = _rf('batch.importFailed', {'error': error});
      notifyListeners();
    }
  }

  Future<void> exportZip() async {
    final archive = Archive();
    final projectBytes = utf8
        .encode(const JsonEncoder.withIndent('  ').convert(project.toJson()));
    archive.addFile(
        ArchiveFile('project.batch.json', projectBytes.length, projectBytes));
    final prompts = StringBuffer('# ${_projectName()}\n\n');
    for (var index = 0; index < project.items.length; index++) {
      final item = project.items[index];
      prompts.writeln('${index + 1}. ${item.name}\n${item.prompt}\n');
      if (item.outputPath.isNotEmpty && File(item.outputPath).existsSync()) {
        final bytes = await File(item.outputPath).readAsBytes();
        archive.addFile(ArchiveFile(
          'images/${(index + 1).toString().padLeft(3, '0')}.png',
          bytes.length,
          bytes,
        ));
      }
    }
    final promptBytes = utf8.encode(prompts.toString());
    archive.addFile(ArchiveFile('prompts.md', promptBytes.length, promptBytes));
    final zip = ZipEncoder().encode(archive);
    if (zip == null) throw StateError(_rt('error.zipEncode'));
    final temp = await getTemporaryDirectory();
    final file = File('${temp.path}/${_safe(_projectName())}.zip');
    await file.writeAsBytes(zip, flush: true);
    await Share.shareXFiles([XFile(file.path)]);
    status = _rt('batch.zipShared');
    notifyListeners();
  }

  String _merge(String left, String right) =>
      [left.trim(), right.trim()].where((value) => value.isNotEmpty).join(', ');
  String _safe(String value) {
    final safe = value.replaceAll(RegExp(r'[\\/:*?"<>|]+'), '-').trim();
    return safe.isEmpty
        ? 'batch-redraw'
        : safe.substring(0, min(80, safe.length));
  }

  String _id() =>
      '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(1 << 20)}';

  @override
  void dispose() {
    if (queueRunning) cancelQueue();
    _disposed = true;
    _saveTimer?.cancel();
    BackgroundQueueService.removeCancelHandler(cancelQueue);
    super.dispose();
  }
}
