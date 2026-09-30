import '../services/comic_image_service.dart';
import 'comic_asset_store.dart';
import 'comic_project_transfer.dart';
import 'package:crypto/crypto.dart';
import '../services/generation_scope.dart';
import '../services/storage.dart';
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';

import '../billing/anlas.dart';
import '../i18n/app_locales.dart';
import '../models/nai_models.dart';
import '../references/reference_presets.dart';
import '../services/background_queue_service.dart';
import '../state/app_state.dart';
import 'comic_models.dart';

/// Immutable request data captured when a comic run is confirmed.  Editing
/// project settings after this point affects the next run, not a request that
/// is already queued.
class _ComicGenerationTask {
  final ComicPanel panel;
  final GenerateParams params;
  final GenerateExtras extras;
  final String? compatibleSize;

  const _ComicGenerationTask({
    required this.panel,
    required this.params,
    required this.extras,
    this.compatibleSize,
  });
}

class ComicController extends ChangeNotifier {
  final AppState app;

  final ComicAssetStore assets;
  bool exporting = false;
  Map<String, dynamic>? lastExport;

  ComicController(this.app, {ComicAssetStore? assets})
      : assets = assets ?? ComicAssetStore() {
    BackgroundQueueService.addCancelHandler(cancelQueue);
  }

  late ComicProject project;
  ComicStep step = ComicStep.importTags;
  String statusKey = 'comic.ready';
  String statusDetail = '';
  String activePanelId = '';
  bool loaded = false;
  bool queueRunning = false;
  bool queueCancelled = false;
  int queueDone = 0;
  int queueTotal = 0;
  Timer? _saveTimer;
  bool _disposed = false;
  bool _editing = false;
  String? _agentReservation;
  bool get editing => _editing;
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
  String get revision =>
      sha256.convert(utf8.encode(jsonEncode(project.toJson()))).toString();
  void assertRevision(String expected) {
    if (loadError != null) throw StateError(loadError!);
    if (queueRunning ||
        _editing ||
        _agentReservation != null ||
        revision != expected) {
      throw StateError('漫画工程已变化或正在运行，请重新读取');
    }
  }

  Future<void> commitProject(String expected, ComicProject next,
      {bool backup = false}) async {
    assertRevision(expected);
    _editing = true;
    _saveTimer?.cancel();
    final before = ComicProject.fromJson(
        jsonDecode(jsonEncode(project.toJson())), project.globalParams,
        trustOutputs: true);
    final captured = ComicProject.fromJson(
        jsonDecode(jsonEncode(next.toJson())), next.globalParams,
        trustOutputs: true);
    final transaction = _writes.then((_) async {
      if (revision != expected || queueRunning) {
        throw StateError('漫画工程已变化，请重新读取');
      }
      if (backup) await app.storage.setComicBackup(before);
      if (revision != expected || queueRunning) {
        throw StateError('备份期间漫画工程已变化，请重新读取');
      }
      await app.storage.setComicProject(captured);
      if (revision != expected || queueRunning) {
        await app.storage.setComicProject(project);
        throw StateError('保存期间漫画工程已变化，保留了软件端编辑，请重新读取');
      }
      project = captured;
      if (!project.panels.any((p) => p.id == activePanelId)) {
        activePanelId = project.panels.isEmpty ? '' : project.panels.first.id;
      }
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

  Future<void> flush() {
    _saveTimer?.cancel();
    if (loadError != null) return Future.error(StateError(loadError!));
    if (_editing) {
      final next = _writes.then((_) => app.storage.setComicProject(project));
      _writes = next.then<void>((_) {}, onError: (Object e) {
        persistenceError = e.toString();
        notifyListeners();
      });
      return next;
    }
    final snapshot = ComicProject.fromJson(
        jsonDecode(jsonEncode(project.toJson())), project.globalParams,
        trustOutputs: true);
    final next = _writes.then((_) => app.storage.setComicProject(snapshot));
    _writes = next.then<void>((_) {
      persistenceError = null;
    }, onError: (Object e) {
      persistenceError = e.toString();
      notifyListeners();
    });
    return next;
  }

  Map<String, dynamic> get runState => {
        'id': runId,
        'phase': runPhase,
        'total': queueTotal,
        'done': queueDone,
        'error': runError,
        'active': queueRunning
      };
  Future<void> _saveRun(String phase, {String? error}) async {
    runPhase = phase;
    runError = error;
    await app.storage.setComicRun(
        {...runState, 'updatedAt': DateTime.now().toIso8601String()});
    notifyListeners();
  }

  Future<void> _loadRun() async {
    if (_journalLoaded) return;
    final saved = await app.storage.getComicRun();
    if (saved != null) {
      if (saved['id'] is! String ||
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
          ].contains(saved['phase'])) throw StateError('漫画任务记录损坏，原始记录保留');
      runId = saved['id'];
      queueTotal = saved['total'];
      queueDone = saved['done'];
      runPhase = saved['phase'];
      runError = saved['error'] as String?;
      if (['preparing', 'running', 'stopping'].contains(runPhase)) {
        await _saveRun('interrupted', error: '上次漫画任务未核实完成；已保存图片保留，未自动重试。');
      }
    }
    _journalLoaded = true;
  }

  Future<void> settled() => _work;

  String _t(String key) => mobileUiTextFor(app.settings.language, key);
  String get displayTitle =>
      project.title.trim().isEmpty || project.title == defaultComicProjectTitle
          ? _t('comic.defaultTitle')
          : project.title.trim();
  String get displayStatus =>
      statusDetail.isEmpty ? _t(statusKey) : statusDetail;

  @override
  void notifyListeners() {
    if (!_disposed) super.notifyListeners();
  }

  Future<void> load() => _loading ??= () async {
        if (loaded) return;
        try {
          project = await app.storage.getComicProject(app.params);
          await _loadRun();
        } catch (e) {
          loadError = e.toString();
          project = ComicProject.empty(app.params);
        }
        activePanelId = project.panels.isEmpty ? '' : project.panels.first.id;
        loaded = true;
        notifyListeners();
      }();

  ComicPanel? get activePanel {
    for (final panel in project.panels) {
      if (panel.id == activePanelId) return panel;
    }
    return project.panels.isEmpty ? null : project.panels.first;
  }

  void setStep(ComicStep value) {
    step = value;
    notifyListeners();
  }

  void changed([String? key, String detail = '']) {
    if (_disposed) return;
    if (key != null) statusKey = key;
    statusDetail = detail;
    notifyListeners();
    _saveTimer?.cancel();
    _saveTimer = Timer(
      const Duration(milliseconds: 250),
      () {
        unawaited(flush().catchError((Object _) {}));
      },
    );
  }

  void createNewProject() {
    project = ComicProject.empty(app.params);
    activePanelId = '';
    step = ComicStep.importTags;
    changed('comic.statusNew');
  }

  void syncCurrentParams() {
    project
      ..globalParams = (app.params.copy()..positivePrompt = '')
      ..globalStylePrompt = app.params.stylePrompt
      ..globalNegativePrompt = app.params.negativePrompt;
    changed('comic.syncedParams');
  }

  void selectPanel(String id) {
    activePanelId = id;
    notifyListeners();
  }

  void addPanel() {
    final index = project.panels.length + 1;
    final panel = ComicPanel(
      id: comicId(),
      index: index,
      title: '${_t('comic.panelFallback')} $index',
      params: project.globalParams.copy(),
      imageWidth: project.sizeMode == ComicSizeMode.perPanel
          ? project.globalParams.width
          : null,
      imageHeight: project.sizeMode == ComicSizeMode.perPanel
          ? project.globalParams.height
          : null,
    );
    project.panels.add(panel);
    activePanelId = panel.id;
    changed('comic.panelAdded');
  }

  void removePanel(String id) {
    project.panels.removeWhere((item) => item.id == id);
    for (final reference in project.preciseReferences) {
      reference.scopePanelIds.remove(id);
    }
    _reindexPanels();
    activePanelId = project.panels.isEmpty ? '' : project.panels.first.id;
    changed('comic.panelRemoved');
  }

  void movePanel(String id, int delta) {
    final from = project.panels.indexWhere((item) => item.id == id);
    final to = from + delta;
    if (from < 0 || to < 0 || to >= project.panels.length) return;
    final item = project.panels.removeAt(from);
    project.panels.insert(to, item);
    _reindexPanels();
    changed();
  }

  void reorderPanel(int oldIndex, int newIndex) {
    if (oldIndex < 0 || oldIndex >= project.panels.length) return;
    if (newIndex > oldIndex) newIndex--;
    if (newIndex < 0 || newIndex >= project.panels.length) return;
    final item = project.panels.removeAt(oldIndex);
    project.panels.insert(newIndex, item);
    _reindexPanels();
    changed();
  }

  void _reindexPanels() {
    for (var index = 0; index < project.panels.length; index++) {
      project.panels[index].index = index + 1;
    }
  }

  Future<void> importText(String source, {String fileName = ''}) async {
    final parsed = parseComicImport(source, fileName: fileName);
    if (parsed.isEmpty) throw FormatException(_t('comic.noTags'));
    project.panels = parsed.asMap().entries.map((entry) {
      return ComicPanel(
        id: comicId(),
        index: entry.key + 1,
        title: entry.value.$1.isEmpty
            ? '${_t('comic.panelFallback')} ${entry.key + 1}'
            : entry.value.$1,
        prompt: entry.value.$2,
        params: project.globalParams.copy(),
        imageWidth: project.sizeMode == ComicSizeMode.perPanel
            ? project.globalParams.width
            : null,
        imageHeight: project.sizeMode == ComicSizeMode.perPanel
            ? project.globalParams.height
            : null,
      );
    }).toList();
    for (final reference in project.preciseReferences) {
      reference
        ..scope = ComicReferenceScope.all
        ..scopePanelIds = [];
    }
    activePanelId = project.panels.first.id;
    changed('comic.imported');
  }

  Future<void> pickImportFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['txt', 'json', 'csv'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final picked = result.files.single;
    final bytes = picked.bytes ??
        (picked.path == null ? null : await File(picked.path!).readAsBytes());
    if (bytes == null) throw FormatException(_t('error.readFile'));
    await importText(utf8.decode(bytes), fileName: picked.name);
  }

  Future<void> exportProjectJson() => _export(false);

  Future<void> _export(bool zip) async {
    if (exporting) throw StateError('导出正在进行，请等待完成');
    final expected = revision;
    assertRevision(expected);
    final snapshot = ComicProject.fromJson(
        project.toJson(), project.globalParams,
        trustOutputs: true);
    exporting = true;
    lastExport = null;
    notifyListeners();
    try {
      final receipt = zip
          ? await assets.exportSelected(snapshot,
              portableComicProject(snapshot), () => assertRevision(expected))
          : await assets.exportProject(
              snapshot, () => assertRevision(expected));
      lastExport = receipt;
      if (receipt['shared'] != true) {
        throw StateError('文件已保存，系统分享未完成：${receipt['filePath']}');
      }
      statusKey = zip ? 'comic.zipShared' : 'comic.jsonShared';
      statusDetail = '';
    } catch (error) {
      statusDetail = error.toString();
      rethrow;
    } finally {
      exporting = false;
      notifyListeners();
    }
  }

  Future<void> importProjectJson() async {
    final expected = revision;
    assertRevision(expected);
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['json'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final picked = result.files.single;
    final bytes = picked.bytes ??
        (picked.path == null ? null : await File(picked.path!).readAsBytes());
    if (bytes == null) throw FormatException(_t('error.readFile'));
    final decoded = jsonDecode(utf8.decode(bytes));
    if (decoded is! Map) throw FormatException(_t('error.projectJsonRoot'));
    assertRevision(expected);
    final next =
        ComicProject.fromJson(Map<String, dynamic>.from(decoded), app.params);
    next.id = comicId();
    for (final panel in next.panels) {
      panel.id = comicId();
    }
    await commitProject(expected, next, backup: true);
    statusKey = 'comic.projectImported';
    statusDetail = '';
    notifyListeners();
  }

  GenerateParams paramsFor(ComicPanel panel, {ComicProject? source}) {
    final project = source ?? this.project;
    final params =
        (panel.overrideParams ? panel.params : project.globalParams).copy();
    params
      ..positivePrompt = _merge(project.globalStylePrompt, panel.prompt)
      ..negativePrompt = project.globalNegativePrompt;
    if (project.sizeMode == ComicSizeMode.perPanel &&
        panel.imageWidth != null &&
        panel.imageHeight != null) {
      params
        ..width = panel.imageWidth!
        ..height = panel.imageHeight!;
    }
    return params;
  }

  Future<void> pickPreciseReferences() async {
    final expected = revision;
    assertRevision(expected);
    final remaining = max(0, 5 - project.preciseReferences.length);
    if (remaining == 0) return;
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: const ['png', 'jpg', 'jpeg', 'webp'],
      withData: false,
    );
    if (result == null || result.files.isEmpty) return;
    assertRevision(expected);
    if (result.files.length > remaining) throw StateError('最多5张漫画参考图，请减少选择');
    final next = ComicProject.fromJson(project.toJson(), project.globalParams,
        trustOutputs: true);
    final imported = <ComicReferenceAsset>[];
    try {
      for (final picked in result.files) {
        final path = picked.path;
        if (path == null) throw StateError('图片文件不存在，请重新选择');
        final asset = await assets.importImage(path, name: picked.name);
        imported.add(asset);
        assertRevision(expected);
        next.preciseReferences.add(asset);
      }
      await commitProject(expected, next);
    } catch (_) {
      for (final asset in imported) {
        await assets.removeImported(asset);
      }
      rethrow;
    }
    statusKey = 'comic.preciseImported';
    statusDetail = '';
    notifyListeners();
  }

  Future<String?> addPreciseReferencePreset(ReferencePreset preset) async {
    if (preset.kind != ReferencePresetKind.precise) return 'Unsupported preset';
    if (project.preciseReferences.length >= 5) return _t('comic.preciseHint');
    ComicReferenceAsset? imported;
    try {
      final expected = revision;
      assertRevision(expected);
      final next = ComicProject.fromJson(project.toJson(), project.globalParams,
          trustOutputs: true);
      imported = await assets.importImage(preset.filePath, name: preset.name);
      assertRevision(expected);
      imported
        ..type = preset.preciseType
        ..strength = preset.strength
        ..fidelity = preset.fidelity;
      next.preciseReferences.add(imported);
      await commitProject(expected, next);
      statusKey = 'comic.preciseImported';
      statusDetail = '';
      notifyListeners();
      return null;
    } catch (error) {
      if (imported != null) await assets.removeImported(imported);
      return '${_t('error.readReference')}: $error';
    }
  }

  Future<void> removePreciseReference(String referenceId) async {
    final expected = revision;
    assertRevision(expected);
    final next = withoutComicReference(project, referenceId);
    await commitProject(expected, next, backup: true);
  }

  void togglePanelReference(
      ComicPanel panel, ComicReferenceAsset asset, bool enabled) {
    final matches = panel.preciseReferences
        .where((item) => item.referenceId == asset.id)
        .toList();
    final current = matches.isEmpty ? null : matches.first;
    panel.preciseReferences.removeWhere((item) => item.referenceId == asset.id);
    panel.preciseReferences.add(ComicPanelReference(
      referenceId: asset.id,
      enabled: enabled,
      type: current?.type ?? asset.type,
      strength: current?.strength ?? asset.strength,
      fidelity: current?.fidelity ?? asset.fidelity,
      informationExtracted:
          current?.informationExtracted ?? asset.informationExtracted,
    ));
    changed();
  }

  void clearPanelReferenceOverride(ComicPanel panel, String referenceId) {
    panel.preciseReferences
        .removeWhere((item) => item.referenceId == referenceId);
    changed();
  }

  void updatePanelReference(
    ComicPanel panel,
    ComicReferenceAsset asset, {
    String? type,
    double? strength,
    double? fidelity,
  }) {
    final matches = panel.preciseReferences
        .where((item) => item.referenceId == asset.id)
        .toList();
    final selection = matches.isEmpty
        ? ComicPanelReference(
            referenceId: asset.id,
            type: asset.type,
            strength: asset.strength,
            fidelity: asset.fidelity,
            informationExtracted: asset.informationExtracted,
          )
        : matches.first;
    if (matches.isEmpty) panel.preciseReferences.add(selection);
    selection
      ..enabled = true
      ..type = type ?? selection.type
      ..strength = strength ?? selection.strength
      ..fidelity = fidelity ?? selection.fidelity
      ..informationExtracted = fidelity ?? selection.informationExtracted;
    changed();
  }

  void setReferenceScope(
      ComicReferenceAsset reference, ComicReferenceScope scope) {
    reference.scope = scope;
    if (scope == ComicReferenceScope.all) reference.scopePanelIds = [];
    changed();
  }

  void applyReferenceRange(ComicReferenceAsset reference, String value) {
    try {
      final numbers = parseComicPanelRange(value, project.panels.length);
      reference.scopePanelIds =
          numbers.map((number) => project.panels[number - 1].id).toList();
      changed();
    } on ComicPanelRangeException catch (error) {
      final key = switch (error.code) {
        'empty' => 'comic.preciseRangeEmpty',
        'format' => 'comic.preciseRangeFormat',
        _ => 'comic.preciseRangeOut',
      };
      throw FormatException(_t(key)
          .replaceAll('{token}', error.token.isEmpty ? '?' : error.token));
    }
  }

  int referenceCoverage(ComicReferenceAsset reference) =>
      project.panels.where((panel) {
        final matches = panel.preciseReferences
            .where((item) => item.referenceId == reference.id)
            .toList();
        return matches.isEmpty
            ? comicReferenceApplies(reference, panel.id)
            : matches.first.enabled;
      }).length;

  Future<GenerateExtras> extrasFor(ComicPanel panel,
      {ComicProject? source}) async {
    final project = source ?? this.project;
    final precise = <PreciseReferenceItem>[];
    for (final selection in resolvedComicPanelReferences(project, panel)) {
      final assets = project.preciseReferences
          .where((item) => item.id == selection.referenceId)
          .toList();
      if (assets.isEmpty) throw StateError('漫画参考记录不存在，请重新选择参考图');
      final asset = assets.first;
      try {
        final bytes = await File(asset.filePath).readAsBytes();
        precise.add(PreciseReferenceItem(
          base64: base64Encode(bytes),
          sourcePath: asset.filePath,
          type: selection.type,
          strength: selection.strength,
          fidelity: selection.fidelity,
          informationExtracted: selection.informationExtracted,
        ));
      } catch (_) {
        throw StateError('漫画参考图不存在或读取失败，请重新选择目录或参考图：${asset.name}');
      }
    }
    return GenerateExtras(preciseReferences: precise);
  }

  void setSizeMode(ComicSizeMode mode) {
    project.sizeMode = mode;
    if (mode == ComicSizeMode.perPanel) {
      for (final panel in project.panels) {
        panel
          ..imageWidth ??= project.globalParams.width
          ..imageHeight ??= project.globalParams.height;
      }
    }
    changed();
  }

  String createSizeTemplate() => comicSizeTemplate(
        project.panels.length,
        ComicImageSize(project.globalParams.width, project.globalParams.height),
      );

  void importPanelSizes(String source) {
    try {
      final sizes = parseComicSizeImport(source, project.panels.length);
      for (var index = 0; index < project.panels.length; index++) {
        project.panels[index]
          ..imageWidth = sizes[index].width
          ..imageHeight = sizes[index].height;
      }
      project.sizeMode = ComicSizeMode.perPanel;
      changed(
        'comic.sizesApplied',
        _t('comic.sizesApplied')
            .replaceAll('{count}', '${project.panels.length}'),
      );
    } on ComicSizeImportException catch (error) {
      final key = switch (error.code) {
        'empty' => 'comic.sizeEmpty',
        'count' => 'comic.sizeCount',
        'blank' => 'comic.sizeBlank',
        'format' => 'comic.sizeFormat',
        _ => 'comic.sizeUnsupported',
      };
      throw FormatException(
        _t(key)
            .replaceAll('{line}', '${error.line ?? '?'}')
            .replaceAll(
                '{expected}', '${error.expected ?? project.panels.length}')
            .replaceAll('{actual}', '${error.actual ?? 0}'),
      );
    }
  }

  bool get hasCompletePanelSizes =>
      project.sizeMode != ComicSizeMode.perPanel ||
      project.panels.every((panel) =>
          panel.imageWidth != null &&
          panel.imageHeight != null &&
          comicSizePresets.any((size) =>
              size.width == panel.imageWidth &&
              size.height == panel.imageHeight));

  bool get compatible => app.settings.imageProvider == 'openai-images';
  Future<String> authorizationStamp() async {
    final binding = _sourceBinding(),
        key = await comicCredential(app.storage, app.settings);
    if (_sourceBinding() != binding) throw StateError('图片服务配置已变化，请重新确认');
    return sha256.convert(utf8.encode(jsonEncode([binding, key]))).toString();
  }

  void validateProviderPanel(ComicPanel panel, GenerateExtras extras,
      {ComicProject? source}) {
    if (compatible) {
      compatibleComicRequest(
          app.settings, paramsFor(panel, source: source), extras,
          size: (source ?? project).sizeMode == ComicSizeMode.perPanel
              ? '${panel.imageWidth}x${panel.imageHeight}'
              : null);
    }
  }

  Future<int?> quoteTasks(Iterable<ComicPanel> panels, {int each = 1}) async {
    if (compatible) {
      for (final panel in panels) {
        validateProviderPanel(panel, await extrasFor(panel));
      }
      return null; // Provider billing is unknown, never report zero Anlas.
    }
    final token = await app.storage.getToken();
    final officialCache = <String, int?>{};
    var total = 0;
    for (final panel in panels) {
      final params = paramsFor(panel);
      final key = jsonEncode({
        'model': params.model,
        'width': params.width,
        'height': params.height,
        'steps': params.steps,
        'sampler': params.sampler,
        'noiseSchedule': params.noiseSchedule,
        'smea': params.smea,
        'smeaDyn': params.smeaDyn,
      });
      int? official = officialCache[key];
      if (!officialCache.containsKey(key) && token?.isNotEmpty == true) {
        official = await app.api.requestOfficialGenerationPrice(
          token!,
          app.settings,
          params,
        );
        officialCache[key] = official;
      }
      final local = calculateImageGenerationAnlas(
            params: params,
            account: app.account,
            preciseReferenceCount:
                resolvedComicPanelReferences(project, panel).length,
            language: app.settings.language,
          ).amount ??
          0;
      total += (official ?? local) * each;
    }
    return total;
  }

  Future<_ComicGenerationTask> _captureGenerationTask(
      ComicPanel panel, ComicProject source,
      {GenerateExtras? approvedExtras}) async {
    final frozen = source.panels.firstWhere((p) => p.id == panel.id);
    final extras =
        (approvedExtras ?? await extrasFor(frozen, source: source)).copy();
    validateProviderPanel(frozen, extras, source: source);
    return _ComicGenerationTask(
        panel: panel,
        compatibleSize: source.sizeMode == ComicSizeMode.perPanel
            ? '${frozen.imageWidth}x${frozen.imageHeight}'
            : null,
        params: paramsFor(frozen, source: source),
        extras: extras);
  }

  Future<void> _generateCandidate(
      _ComicGenerationTask task, ComicProject source) async {
    final matches = project.panels.where((p) => p.id == task.panel.id);
    if (project.id != source.id || matches.isEmpty) {
      throw StateError('漫画工程或分镜已变化，后续任务未提交');
    }
    final panel = matches.first;
    panel
      ..status = ComicPanelStatus.generating
      ..error = '';
    changed('comic.generatingPanel');
    final before = app.account.anlasBalance;
    try {
      List<HistoryItem> items;
      Object? savedError;
      try {
        final item = await _scope!.run(() => compatible
            ? app.generateCompatibleComicPanel(
                panelParams: task.params,
                panelExtras: task.extras,
                projectTitle: source.title,
                historyGroupId: project.historyGroupId,
                size: task.compatibleSize)
            : app.generateComicPanel(
                panelParams: task.params,
                panelExtras: task.extras,
                projectTitle: source.title,
                historyGroupId: project.historyGroupId));
        items = [item];
      } on SavedImageHistoryException catch (e) {
        items = [e.item];
        savedError = e;
      } on SavedComicImagesException catch (e) {
        items = e.items;
        savedError = e;
      }
      if (project.id != source.id ||
          !project.panels.any((p) => identical(p, panel))) {
        throw StateError('图片已保存到历史，但漫画工程已变化；已停止后续生成');
      }
      for (final item in items) {
        project.historyGroupId = item.groupId;
        final candidate = ComicCandidate(
            id: comicId(),
            historyItemId: item.id,
            outputPath: item.filePath,
            createdAt: item.createdAt,
            actualAnlas: item.params['generationProvider'] != 'openai-images' &&
                    before != null &&
                    app.account.anlasBalance != null
                ? max(0, before - app.account.anlasBalance!)
                : null);
        panel.candidates.add(candidate);
        panel
          ..selectedCandidateId ??= candidate.id
          ..status = ComicPanelStatus.done;
      }
      changed('comic.generated');
      await flush();
      if (savedError != null) throw savedError;
    } catch (e) {
      panel
        ..status = queueCancelled
            ? (panel.candidates.isEmpty
                ? ComicPanelStatus.ready
                : ComicPanelStatus.done)
            : ComicPanelStatus.failed
        ..error = queueCancelled ? '' : e.toString();
      changed(queueCancelled ? 'comic.queueStopped' : 'comic.panelFailed',
          panel.error);
      rethrow;
    }
  }

  List<ComicPanel> agentPlan(String mode, List<String> ids) {
    if (!['initial', 'regenerate', 'additional'].contains(mode)) {
      throw StateError('漫画生成模式无效');
    }
    if (ids.toSet().length != ids.length ||
        ids.any((id) => !project.panels.any((p) => p.id == id))) {
      throw StateError('分镜ID不存在或重复');
    }
    final panels = ids.isEmpty
        ? project.panels
        : ids
            .map((id) => project.panels.firstWhere((p) => p.id == id))
            .toList();
    final result = <ComicPanel>[];
    for (final p in panels) {
      final count = mode == 'additional'
          ? 1
          : mode == 'regenerate'
              ? project.initialGenerationCount
              : max(0, project.initialGenerationCount - p.candidates.length);
      for (var i = 0; i < count; i++) {
        result.add(p);
      }
    }
    if (result.isEmpty) throw StateError('没有待生成分镜，未提交图片');
    if (!hasCompletePanelSizes || result.any((p) => p.prompt.trim().isEmpty)) {
      throw StateError('漫画提示词或逐格尺寸未完整配置');
    }
    return result;
  }

  void reserveAgentRun(String owner, String expected) {
    assertRevision(expected);
    _agentReservation = owner;
    notifyListeners();
  }

  void checkAgentRun(String owner, String expected) {
    if (_disposed ||
        loadError != null ||
        _agentReservation != owner ||
        revision != expected ||
        queueRunning ||
        _editing) throw StateError('漫画工程已变化或预留失效，未启动');
  }

  void releaseAgentRun(String owner) {
    if (_agentReservation == owner) {
      _agentReservation = null;
      notifyListeners();
    }
  }

  Future<void> runAgent(List<String> taskIds,
      {required String owner,
      required String expected,
      required Map<String, GenerateExtras> references,
      required Future<void> Function() beforeImage,
      required void Function() guard}) {
    checkAgentRun(owner, expected);
    final tasks = taskIds
        .map((id) => project.panels.firstWhere((p) => p.id == id))
        .toList();
    return _runQueue(tasks,
        agentRunId: owner,
        beforeImage: beforeImage,
        guard: guard,
        approvedReferences: Map.of(references));
  }

  Future<void> generateInitial() async {
    final tasks = <ComicPanel>[];
    for (final panel in project.panels) {
      final missing =
          max(0, project.initialGenerationCount - panel.candidates.length);
      for (var index = 0; index < missing; index++) {
        tasks.add(panel);
      }
    }
    await _runQueue(tasks);
  }

  Future<void> regenerateAll() async {
    final tasks = <ComicPanel>[];
    for (final panel in project.panels) {
      for (var index = 0; index < project.initialGenerationCount; index++) {
        tasks.add(panel);
      }
    }
    await _runQueue(tasks);
  }

  Future<void> addOneToAll() =>
      _runQueue(List<ComicPanel>.from(project.panels));
  Future<void> addOne(ComicPanel panel) => _runQueue([panel]);

  Future<void> _runQueue(List<ComicPanel> tasks,
      {String? agentRunId,
      Map<String, GenerateExtras>? approvedReferences,
      Future<void> Function()? beforeImage,
      void Function()? guard}) {
    if (_disposed || loadError != null) {
      throw StateError(loadError ?? '漫画控制器已关闭');
    }
    if (queueRunning ||
        _editing ||
        (_agentReservation != null && _agentReservation != agentRunId) ||
        app.busy ||
        app.generationQueueRunning) {
      throw StateError('图像任务正在运行，请先停止并等待读回');
    }
    if (tasks.isEmpty) return Future.value();
    if (!hasCompletePanelSizes) {
      throw FormatException(_t('comic.sizesIncomplete'));
    }
    if (tasks.any((p) => p.prompt.trim().isEmpty)) {
      throw FormatException(_t('comic.emptyPrompt'));
    }
    if (tasks.any((p) => !project.panels.any((x) => x.id == p.id))) {
      throw StateError('漫画分镜不存在');
    }
    final source = ComicProject.fromJson(
        jsonDecode(jsonEncode(project.toJson())), project.globalParams,
        trustOutputs: true);
    final expectedSource = _sourceBinding();
    String? token;
    // Reserve before the first async file read so a second click cannot race it.
    queueRunning = true;
    queueCancelled = false;
    app.busy = true;
    _scope = GenerationScope(beforeSubmit: () {
      guard?.call();
      if (_sourceBinding() != expectedSource) {
        throw StateError('图片服务配置已变化，后续漫画图片未提交');
      }
    }, assertCredentials: (current, settings) {
      if (current != token) throw StateError('图片凭据已变化，未提交漫画请求');
    });
    notifyListeners();
    app.notifyListeners();
    _work = () async {
      try {
        await _loadRun();
        runId = agentRunId ?? comicId();
        queueDone = 0;
        queueTotal = tasks.length;
        await flush();
        await _saveRun('preparing');
        _scope!.check();
        token = await comicCredential(app.storage, app.settings);
        if (token == null || token!.isEmpty) {
          throw StateError(compatible ? '请先配置兼容图片服务密钥' : '请先配置 NovelAI Token');
        }
        _scope!.check();
        final planned = <_ComicGenerationTask>[];
        for (final panel in tasks) {
          if (approvedReferences != null &&
              !approvedReferences.containsKey(panel.id)) {
            throw StateError('漫画授权参考快照缺失，未提交图片');
          }
          planned.add(await _captureGenerationTask(panel, source,
              approvedExtras: approvedReferences?[panel.id]));
          _scope!.check();
        }
        if (planned.any((task) =>
            task.extras.preciseReferences.isNotEmpty &&
            !task.params.supportsPreciseReference)) {
          throw FormatException(_t('comic.preciseV45Only'));
        }
        await _saveRun('running');
        _scope!.check();
        try {
          await BackgroundQueueService.start('comic-generation',
              title: _t('notification.comicTitle'),
              text: '${_t('comic.generateHeading')} 0/${planned.length}');
        } catch (_) {}
        for (final task in planned) {
          _scope!.check();
          final currentToken = await comicCredential(app.storage, app.settings);
          _scope!.credentials(currentToken ?? '', app.settings);
          await beforeImage?.call();
          _scope!.check();
          await _generateCandidate(task, source);
          queueDone++;
          await _saveRun(queueCancelled ? 'stopping' : 'running');
          if (queueCancelled) break;
        }
        await _saveRun(queueCancelled ? 'cancelled' : 'completed');
      } catch (e) {
        runPhase = queueCancelled ? 'cancelled' : 'failed';
        runError = e.toString();
        if (!_journalLoaded) {
          loadError = e.toString();
        } else {
          try {
            await _saveRun(runPhase, error: runError);
          } catch (_) {
            runPhase = 'failed';
            runError = '漫画运行记录保存失败：$e';
          }
        }
      } finally {
        try {
          await BackgroundQueueService.stop('comic-generation');
        } catch (_) {}
        queueRunning = false;
        app.busy = false;
        _scope = null;
        changed(
            queueCancelled
                ? 'comic.queueStopped'
                : runPhase == 'completed'
                    ? 'comic.queueDone'
                    : 'comic.panelFailed',
            runError ?? '');
        app.notifyListeners();
      }
    }();
    return _work;
  }

  String _sourceBinding() => comicImageBinding(app.settings);
  void cancelQueue() {
    if (!queueRunning) return;
    queueCancelled = true;
    _scope?.cancel();
    // The currently executing request owns its own HTTP clients; never cancel unrelated work.
    changed('comic.queueStopped');
  }

  void selectCandidate(ComicPanel panel, String candidateId) {
    if (!panel.candidates.any((item) => item.id == candidateId)) return;
    panel.selectedCandidateId = candidateId;
    changed('comic.currentMain');
  }

  Future<void> exportSelectedZip() => _export(true);

  @override
  void dispose() {
    if (_disposed) return;
    cancelQueue();
    _disposed = true;
    _saveTimer?.cancel();
    BackgroundQueueService.removeCancelHandler(cancelQueue);
    super.dispose();
  }
}

List<(String, String)> parseComicImport(String input, {String fileName = ''}) {
  final source = input.replaceFirst('\uFEFF', '').trim();
  if (source.isEmpty) return [];
  final lower = fileName.toLowerCase();
  if (lower.endsWith('.json') ||
      source.startsWith('[') ||
      source.startsWith('{')) {
    final decoded = jsonDecode(source);
    if (decoded is Map && decoded['schemaVersion'] != null) {
      throw const FormatException('Project JSON must be imported as a project');
    }
    final list = decoded is List
        ? decoded
        : decoded is Map && decoded['panels'] is List
            ? decoded['panels'] as List
            : const [];
    return list
        .asMap()
        .entries
        .map((entry) {
          final value = entry.value;
          if (value is String) return ('Panel ${entry.key + 1}', value.trim());
          if (value is! Map) return ('', '');
          final prompt =
              (value['prompt'] ?? value['tags'] ?? value['tagPrompt'] ?? '')
                  .toString()
                  .trim();
          final title =
              (value['title'] ?? value['name'] ?? 'Panel ${entry.key + 1}')
                  .toString()
                  .trim();
          return (title, prompt);
        })
        .where((item) => item.$2.isNotEmpty)
        .toList();
  }
  if (lower.endsWith('.csv')) {
    final rows = _parseCsv(source);
    if (rows.isEmpty) return [];
    final header = rows.first.map((item) => item.trim().toLowerCase()).toList();
    final titleIndex = header
        .indexWhere((item) => ['title', 'name', '标题', '分镜标题'].contains(item));
    final promptIndex = header.indexWhere(
        (item) => ['prompt', 'tags', 'tag', '提示词', '正面提示词'].contains(item));
    final hasHeader = titleIndex >= 0 || promptIndex >= 0;
    final data = hasHeader ? rows.skip(1).toList() : rows;
    return data
        .asMap()
        .entries
        .map((entry) {
          final row = entry.value;
          String at(int index) =>
              index >= 0 && index < row.length ? row[index].trim() : '';
          final prompt =
              at(promptIndex >= 0 ? promptIndex : (row.length > 1 ? 1 : 0));
          final title =
              at(titleIndex >= 0 ? titleIndex : (row.length > 1 ? 0 : -1));
          return (title.isEmpty ? 'Panel ${entry.key + 1}' : title, prompt);
        })
        .where((item) => item.$2.isNotEmpty)
        .toList();
  }
  return source
      .split(RegExp(r'\r?\n'))
      .map((item) => item.trim())
      .where((item) => item.isNotEmpty)
      .toList()
      .asMap()
      .entries
      .map((entry) => ('Panel ${entry.key + 1}', entry.value))
      .toList();
}

List<List<String>> _parseCsv(String text) {
  final rows = <List<String>>[];
  var row = <String>[];
  var cell = StringBuffer();
  var quoted = false;
  for (var index = 0; index < text.length; index++) {
    final char = text[index];
    if (char == '"') {
      if (quoted && index + 1 < text.length && text[index + 1] == '"') {
        cell.write('"');
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (char == ',' && !quoted) {
      row.add(cell.toString());
      cell = StringBuffer();
    } else if ((char == '\n' || char == '\r') && !quoted) {
      if (char == '\r' && index + 1 < text.length && text[index + 1] == '\n') {
        index++;
      }
      row.add(cell.toString());
      if (row.any((item) => item.trim().isNotEmpty)) rows.add(row);
      row = <String>[];
      cell = StringBuffer();
    } else {
      cell.write(char);
    }
  }
  row.add(cell.toString());
  if (row.any((item) => item.trim().isNotEmpty)) rows.add(row);
  return rows;
}

String _merge(String first, String second) =>
    [first.trim(), second.trim()].where((item) => item.isNotEmpty).join(', ');
