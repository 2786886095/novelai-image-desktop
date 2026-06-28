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
import '../services/background_queue_service.dart';
import '../state/app_state.dart';
import 'batch_redraw_models.dart';

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

  BatchRedrawController(this.app) {
    BackgroundQueueService.addCancelHandler(cancelQueue);
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

  int quote(List<BatchRedrawItem> targets) {
    var total = 0;
    for (final item in targets) {
      final params = item.overrideParams ? item.params : project.globalParams;
      final extras = referencesFor(params);
      total += calculateImageGenerationAnlas(
            params: params,
            account: app.account,
            extras: extras,
            imageToImage: true,
            strength: item.strength ?? project.globalStrength,
            alreadyEncodedVibes: app.api.countCachedVibes(params.model, extras),
            preciseReferenceCount: extras.preciseReferences.length,
            language: app.settings.language,
          ).amount ??
          0;
    }
    return total;
  }

  Future<void> startQueue(List<BatchRedrawItem> targets) async {
    if (targets.isEmpty || queueRunning) return;
    final amount = quote(targets);
    final balance = app.account.anlasBalance;
    if (balance != null && amount > balance) {
      status = _rf('batch.insufficient', {
        'amount': amount,
        'balance': balance,
      });
      notifyListeners();
      return;
    }
    final incompatible = targets.any((item) {
      final params = item.overrideParams ? item.params : project.globalParams;
      return referencesFor(params).preciseReferences.isNotEmpty &&
          !params.isV45;
    });
    if (incompatible) {
      status = _rt('error.preciseV45Only');
      notifyListeners();
      return;
    }
    queueRunning = true;
    queuePaused = false;
    queueCancelled = false;
    queueDone = 0;
    queueTotal = targets.length;
    try {
      await BackgroundQueueService.start(
        'batch-redraw',
        title: _rt('notification.batchTitle'),
        text: _rf('notification.prepare', {'total': queueTotal}),
      );
    } catch (_) {}
    notifyListeners();
    for (final item in targets) {
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
        final params =
            (item.overrideParams ? item.params : project.globalParams).copy();
        params
          ..positivePrompt = _merge(project.globalStyle, item.prompt)
          ..negativePrompt = project.globalNegative;
        final history = await app.generateBatchRedrawItem(
          sourceBytes: base64Decode(item.base64),
          itemParams: params,
          itemExtras: referencesFor(params),
          strength: item.strength ?? project.globalStrength,
          groupName: _projectName(),
          historyGroupId: project.historyGroupId,
        );
        project.historyGroupId = history.groupId;
        item
          ..status = BatchItemStatus.done
          ..outputPath = history.filePath;
      } catch (error) {
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
    await BackgroundQueueService.stop('batch-redraw');
    if (!queueCancelled) {
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
    queueCancelled = true;
    queuePaused = false;
    app.api.cancelActiveGeneration();
    notifyListeners();
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
      project = BatchRedrawProject.fromJson(
        Map<String, dynamic>.from(jsonDecode(utf8.decode(bytes))),
        app.params,
      );
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
    _saveTimer?.cancel();
    BackgroundQueueService.removeCancelHandler(cancelQueue);
    super.dispose();
  }
}
