import 'package:crypto/crypto.dart';
import '../services/generation_scope.dart';
import '../services/comic_image_service.dart';
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
  final String sourceBase64;
  final String sourceName;
  final GenerateParams params;
  final GenerateExtras extras;
  final double strength;
  final int candidateCount;

  const _BatchRedrawQueueJob({
    required this.item,
    required this.sourceBase64,
    required this.sourceName,
    required this.params,
    required this.extras,
    required this.strength,
    required this.candidateCount,
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
  bool _editing = false;
  String? _agentReservation;
  bool get editing => _editing || _agentReservation != null;
  String? loadError;
  String? persistenceError;
  String? runId;
  String runPhase = 'idle';
  String? runError;
  bool _journalLoaded = false;
  Future<void>? _loading;
  Future<void> _writes = Future.value();
  Future<void> _work = Future.value();
  GenerationScope? _scope;
  Future<void> settled() => _work;
  Map<String, dynamic> get runState => {
        'id': runId,
        'phase': runPhase,
        'total': queueTotal,
        'done': queueDone,
        'error': runError,
        'active': queueRunning &&
            ['preparing', 'running', 'stopping'].contains(runPhase),
      };
  Future<void> _saveRun(String phase, {String? error}) async {
    runPhase = phase;
    runError = error;
    await app.storage.setBatchRun(
        {...runState, 'updatedAt': DateTime.now().toIso8601String()});
    notifyListeners();
  }

  Future<void> _loadRun() async {
    if (_journalLoaded) return;
    final saved = await app.storage.getBatchRun();
    if (saved != null) {
      if (saved['id'] is! String ||
          !RegExp(r'^[a-zA-Z0-9_-]{1,160}$').hasMatch(saved['id'] as String) ||
          saved['total'] is! int ||
          saved['done'] is! int ||
          saved['total'] < 0 ||
          saved['done'] < 0 ||
          saved['done'] > saved['total'] ||
          ![
            'preparing',
            'running',
            'stopping',
            'completed',
            'cancelled',
            'failed',
            'interrupted'
          ].contains(saved['phase'])) {
        throw StateError('批量任务记录损坏，原记录已保留');
      }
      runId = saved['id'];
      queueTotal = saved['total'];
      queueDone = saved['done'];
      runPhase = saved['phase'];
      runError = saved['error'] as String?;
      if (['preparing', 'running', 'stopping'].contains(runPhase)) {
        await _saveRun('interrupted', error: '上次批量任务未核实完成，已保存图片保留，未自动重试');
      }
    }
    _journalLoaded = true;
  }

  String get revision => sha256
      .convert(utf8.encode(jsonEncode({
        'project': project.toJson(),
        if (project.reuseMainReferences) 'references': app.extras.toJson()
      })))
      .toString();
  void assertRevision(String expected) {
    if (loadError != null) throw StateError(loadError!);
    if (_disposed ||
        busy ||
        queueRunning ||
        _editing ||
        _agentReservation != null ||
        revision != expected) {
      throw StateError('批量工程已变化或正在运行，请重新读取');
    }
  }

  Future<void> commitProject(
    String expected,
    BatchRedrawProject next,
  ) async {
    assertRevision(expected);
    _editing = true;
    _saveTimer?.cancel();
    final captured = BatchRedrawProject.fromJson(
        jsonDecode(jsonEncode(next.toJson())), next.globalParams,
        trustOutputs: true);
    final transaction = _writes.then((_) async {
      if (revision != expected || queueRunning) {
        throw StateError('批量工程已变化，请重新读取');
      }
      await app.storage.setBatchRedrawProject(captured);
      if (revision != expected || queueRunning) {
        await app.storage.setBatchRedrawProject(project);
        throw StateError('保存期间批量工程已变化，保留了软件端编辑，请重新读取');
      }
      project = captured;
      persistenceError = null;
      notifyListeners();
    });
    _writes = transaction.then<void>((_) {}, onError: (Object e) {
      persistenceError = e.toString();
      notifyListeners();
    });
    try {
      await transaction;
    } finally {
      _editing = false;
      notifyListeners();
    }
  }

  void reserveAgentRun(String owner, String expected) {
    assertRevision(expected);
    _agentReservation = owner;
  }

  void checkAgentRun(String owner, String expected) {
    if (_disposed ||
        loadError != null ||
        busy ||
        queueRunning ||
        _editing ||
        _agentReservation != owner ||
        revision != expected) {
      throw StateError('批量工程已变化或正在运行，请重新读取');
    }
  }

  void releaseAgentRun(String owner) {
    if (_agentReservation == owner) _agentReservation = null;
  }

  List<BatchRedrawItem> agentPlan(String mode, List<String> ids) {
    if (!['all', 'pending', 'failed', 'additional'].contains(mode) ||
        ids.toSet().length != ids.length ||
        ids.any((id) => !project.items.any((x) => x.id == id))) {
      throw StateError('批量模式或图片ID无效');
    }
    if (app.settings.imageProvider != 'novelai') {
      throw StateError('兼容图片服务未接入批量图生图；未自动回退');
    }
    final items = project.items
        .where((x) =>
            (ids.isEmpty || ids.contains(x.id)) &&
            (mode != 'pending' || x.status != BatchItemStatus.done) &&
            (mode != 'failed' || x.status == BatchItemStatus.failed))
        .toList();
    if (items.isEmpty || items.any((x) => x.prompt.trim().isEmpty)) {
      throw StateError('没有待生成图片或缺少提示词');
    }
    if (project.sizeMode == 'perImage') {
      parseBatchSizeImport(project.sizeBulk, project.items.length);
    }
    for (final job in _snapshotQueue(items)) {
      if (base64Decode(job.sourceBase64).isEmpty) throw StateError('批量源图片为空');
      if (job.extras.vibeImages.isNotEmpty &&
              !job.params.supportsVibeTransfer ||
          job.extras.preciseReferences.isNotEmpty &&
              !job.params.supportsPreciseReference) {
        throw StateError('当前模型不支持所选参考');
      }
    }
    return [
      for (final item in items)
        for (var i = 0;
            i <
                (mode == 'additional'
                    ? 1
                    : normalizeBatchRedrawCandidateCount(
                        project.candidateCount));
            i++)
          item
    ];
  }

  Future<void> runAgent(List<String> ids,
      {required String owner,
      required String expected,
      required void Function() guard,
      required Future<void> Function() beforeImage}) {
    checkAgentRun(owner, expected);
    final targets =
        ids.map((id) => project.items.firstWhere((x) => x.id == id)).toList();
    return _runQueue(targets,
        agentRunId: owner, guard: guard, beforeImage: beforeImage);
  }

  Future<void> flush() {
    _saveTimer?.cancel();
    if (loadError != null) return Future.error(StateError(loadError!));
    if (_editing) {
      final next =
          _writes.then((_) => app.storage.setBatchRedrawProject(project));
      _writes = next.then<void>((_) {}, onError: (Object e) {
        persistenceError = '$e';
        notifyListeners();
      });
      return next;
    }
    final snapshot = BatchRedrawProject.fromJson(
        jsonDecode(jsonEncode(project.toJson())), project.globalParams,
        trustOutputs: true);
    final next =
        _writes.then((_) => app.storage.setBatchRedrawProject(snapshot));
    _writes = next.then<void>((_) {
      persistenceError = null;
    }, onError: (Object e) {
      persistenceError = e.toString();
      status = persistenceError!;
      notifyListeners();
    });
    return next;
  }

  BatchRedrawController(this.app) {
    BackgroundQueueService.addCancelHandler(cancelQueue);
  }

  // The application owns this controller. Navigation never disposes the paid
  // queue; actual application shutdown cancels only this request-owned scope.
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

  Future<void> load() => _loading ??= () async {
        if (loaded) return;
        try {
          project = await app.storage.getBatchRedrawProject(app.params);
          await _loadRun();
          if (runError != null) status = runError!;
          if (project.items
              .any((item) => item.status == BatchItemStatus.generating)) {
            for (final item in project.items) {
              if (item.status == BatchItemStatus.generating) {
                item.status = item.candidates.isEmpty
                    ? BatchItemStatus.pending
                    : BatchItemStatus.done;
              }
            }
            await flush();
          }
        } catch (error) {
          project = BatchRedrawProject.empty(app.params);
          loadError = '批量工程读取失败，原始数据保留：$error';
          status = loadError!;
        }
        loaded = true;
        notifyListeners();
      }();

  void changed([String? message]) {
    if (message != null) status = message;
    notifyListeners();
    _saveTimer?.cancel();
    if (loadError != null || _disposed) return;
    _saveTimer = Timer(const Duration(milliseconds: 250), () {
      unawaited(flush().catchError((Object _) {}));
    });
  }

  void setStep(BatchRedrawStep value) {
    step = value;
    notifyListeners();
  }

  void reset() {
    if (queueRunning || busy || editing || loadError != null) {
      throw StateError("批量工程正在运行或读取失败，未重置");
    }
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
          templateVersion: app.settings.reversePromptTemplateVersion,
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
  List<_BatchRedrawQueueJob> _snapshotQueue(List<BatchRedrawItem> targets,
      {bool singleCandidate = false}) {
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
        final itemIndex =
            project.items.indexWhere((entry) => entry.id == item.id);
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
        sourceBase64: item.base64,
        sourceName: item.name,
        params: params,
        extras: referencesFor(sourceParams),
        strength: item.strength ?? globalStrength,
        candidateCount: singleCandidate
            ? 1
            : normalizeBatchRedrawCandidateCount(project.candidateCount),
      );
    }).toList(growable: false);
  }

  int _quoteJobs(List<_BatchRedrawQueueJob> jobs) {
    var total = 0;
    for (final job in jobs) {
      total += (calculateImageGenerationAnlas(
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
              0) *
          job.candidateCount;
    }
    return total;
  }

  int quote(List<BatchRedrawItem> targets) {
    return _quoteJobs(_snapshotQueue(targets));
  }

  void selectCandidate(BatchRedrawItem item, String candidateId) {
    if (item.selectCandidate(candidateId)) {
      changed();
    }
  }

  Future<void> startQueue(List<BatchRedrawItem> targets) => _runQueue(targets);
  Future<void> _runQueue(List<BatchRedrawItem> targets,
      {String? agentRunId,
      void Function()? guard,
      Future<void> Function()? beforeImage}) {
    if (targets.isEmpty || queueRunning) return Future.value();
    if (_disposed ||
        _editing ||
        (_agentReservation != null && _agentReservation != agentRunId) ||
        loadError != null ||
        busy ||
        app.busy ||
        app.generationQueueRunning) {
      status = loadError ?? '图像任务正在运行或控制器已关闭';
      notifyListeners();
      return Future.value();
    }
    List<_BatchRedrawQueueJob> jobs;
    try {
      if (app.settings.imageProvider != 'novelai') {
        throw StateError('当前兼容图片服务未接入图生图，请切回 NovelAI；未自动回退');
      }
      if ((agentRunId == null && targets.toSet().length != targets.length) ||
          targets.any((item) =>
              !project.items.contains(item) || item.prompt.trim().isEmpty)) {
        throw StateError('批量图片不存在、重复或缺少提示词');
      }
      if (project.sizeMode == 'perImage' &&
          !applyPerImageSizes(announce: false)) return Future.value();
      jobs = _snapshotQueue(targets, singleCandidate: agentRunId != null);
      for (final job in jobs) {
        if (base64Decode(job.sourceBase64).isEmpty) throw StateError('批量源图片为空');
        if (job.extras.vibeImages.isNotEmpty &&
            !job.params.supportsVibeTransfer) {
          throw StateError(_rt('error.vibeUnsupportedV5'));
        }
        if (job.extras.preciseReferences.isNotEmpty &&
            !job.params.supportsPreciseReference) {
          throw StateError(_rt('error.preciseV45Only'));
        }
      }
    } catch (error) {
      runPhase = 'failed';
      runError = error.toString();
      status = runError!;
      notifyListeners();
      return Future.value();
    }
    final sourceProject = project;
    final expectedSource = comicImageBinding(app.settings);
    final groupName = _projectName();
    String? token;
    // Reserve synchronously: another UI/Agent task cannot pass an async gap.
    queueRunning = true;
    queuePaused = false;
    queueCancelled = false;
    app.busy = true;
    final scope = GenerationScope(beforeSubmit: () {
      guard?.call();
      if (comicImageBinding(app.settings) != expectedSource) {
        throw StateError('图片服务配置已变化，未继续提交批量任务');
      }
      if (!identical(project, sourceProject)) throw StateError('批量工程已替换，未继续提交');
    }, assertCredentials: (current, _) {
      if (current != token) throw StateError('图片凭据已变化，未继续提交批量任务');
    });
    _scope = scope;
    notifyListeners();
    app.notifyListeners();
    return _work = () async {
      var backgroundStarted = false;
      try {
        await _loadRun();
        runId = agentRunId ?? _id();
        queueDone = 0;
        queueTotal = jobs.fold(0, (total, job) => total + job.candidateCount);
        await flush();
        await _saveRun('preparing');
        scope.check();
        token = await app.storage.getToken();
        scope.check();
        if (token == null || token!.isEmpty) {
          throw StateError(_rt('error.naiTokenRequired'));
        }
        await _saveRun('running');
        try {
          await BackgroundQueueService.start('batch-redraw',
              title: _rt('notification.batchTitle'),
              text: _rf('notification.prepare', {'total': queueTotal}));
          backgroundStarted = true;
        } catch (_) {}
        var groupId = sourceProject.historyGroupId;
        for (final job in jobs) {
          final item = job.item;
          for (var index = 0; index < job.candidateCount; index++) {
            while (queuePaused && !queueCancelled) {
              await Future<void>.delayed(const Duration(milliseconds: 220));
            }
            scope.check();
            if (!project.items.contains(item)) {
              throw StateError('批量图片已移除，未继续提交');
            }
            final currentToken = await app.storage.getToken();
            scope.credentials(currentToken ?? '', app.settings);
            item
              ..status = BatchItemStatus.generating
              ..error = '';
            changed(_rf('batch.generatingItem', {
              'name': '${job.sourceName} ${index + 1}/${job.candidateCount}'
            }));
            await flush();
            scope.check();
            try {
              await BackgroundQueueService.update(
                  title: _rt('notification.batchTitle'),
                  text: _rf('notification.generating',
                      {'current': queueDone + 1, 'total': queueTotal}));
            } catch (_) {}
            await beforeImage?.call();
            scope.check();
            List<HistoryItem> results;
            Object? savedError;
            try {
              results = await scope.run(() => app.generateBatchRedrawItems(
                  sourceBytes: base64Decode(job.sourceBase64),
                  itemParams: job.params,
                  itemExtras: job.extras,
                  strength: job.strength,
                  groupName: groupName,
                  historyGroupId: groupId,
                  cancelled: () => queueCancelled));
            } on SavedBatchImagesException catch (error) {
              results = error.items;
              savedError = error;
            } catch (error) {
              item
                ..status = queueCancelled
                    ? BatchItemStatus.pending
                    : BatchItemStatus.failed
                ..error = queueCancelled ? '' : error.toString();
              rethrow;
            }
            // Attach every durable output before interpreting stop/save failures.
            for (final history in results) {
              groupId = history.groupId;
              sourceProject.historyGroupId = groupId;
              item.addCandidate(BatchRedrawCandidate(
                  id: history.id,
                  historyItemId: history.id,
                  outputPath: history.filePath,
                  createdAt: history.createdAt,
                  actualSeed: history.seed));
            }
            queueDone++;
            item
              ..status = savedError == null
                  ? BatchItemStatus.done
                  : BatchItemStatus.failed
              ..error = savedError?.toString() ?? '';
            changed();
            await flush();
            if (savedError != null) throw savedError;
            if (queueCancelled) break;
            scope.check();
            await _saveRun('running');
          }
          if (queueCancelled) break;
        }
        await _saveRun(queueCancelled ? 'cancelled' : 'completed');
      } catch (error) {
        if (error is GenerationCancelledException) queueCancelled = true;
        final stopped = queueCancelled &&
            error is! SavedBatchImagesException &&
            persistenceError == null;
        runPhase = stopped ? 'cancelled' : 'failed';
        runError = stopped ? null : error.toString();
        if (_journalLoaded && runId != null) {
          try {
            await _saveRun(runPhase, error: runError);
          } catch (journalError) {
            runError = '$error; $journalError';
          }
        }
      } finally {
        if (backgroundStarted) {
          try {
            await BackgroundQueueService.stop('batch-redraw');
          } catch (_) {}
        }
        for (final item in sourceProject.items) {
          if (item.status == BatchItemStatus.generating) {
            item.status = item.candidates.isEmpty
                ? BatchItemStatus.pending
                : BatchItemStatus.done;
          }
        }
        if (loadError == null && _journalLoaded) {
          try {
            await flush();
          } catch (error) {
            runPhase = 'failed';
            runError = error.toString();
            if (runId != null) {
              try {
                await _saveRun('failed', error: runError);
              } catch (_) {}
            }
          }
        }
        queueRunning = false;
        queuePaused = false;
        app.busy = false;
        _scope = null;
        status = runError ??
            _rf(queueCancelled ? 'batch.queueCancelled' : 'batch.queueDone',
                {'done': queueDone, 'total': queueTotal});
        changed();
        app.notifyListeners();
      }
    }();
  }

  void togglePause() {
    if (!queueRunning || queueCancelled) return;
    queuePaused = !queuePaused;
    notifyListeners();
  }

  void cancelQueue() {
    if (!queueRunning || queueCancelled) return;
    queueCancelled = true;
    queuePaused = false;
    runPhase = 'stopping';
    _scope?.cancel();
    status =
        _rf('batch.queueCancelled', {'done': queueDone, 'total': queueTotal});
    notifyListeners();
  }

  Future<bool> clearGeneratedResults() async {
    if (queueRunning || busy) return false;
    final paths = project.items
        .expand((item) => <String>[
              ...item.candidates.map((candidate) => candidate.outputPath),
              if (item.candidates.isEmpty) item.outputPath,
            ])
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
          ..error = ''
          // A cleared run starts a fresh global-parameter revision. Keeping a
          // full per-image snapshot here made later global edits appear to do
          // nothing because the invisible old snapshot still took priority.
          ..overrideParams = false
          ..params = project.globalParams.copy();
        item.clearCandidates();
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
      final selected = item.selectedCandidate;
      final outputPath = selected?.outputPath ?? item.outputPath;
      if (outputPath.isNotEmpty && File(outputPath).existsSync()) {
        final bytes = await File(outputPath).readAsBytes();
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
