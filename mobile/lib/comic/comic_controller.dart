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

  const _ComicGenerationTask({
    required this.panel,
    required this.params,
    required this.extras,
  });
}

class ComicController extends ChangeNotifier {
  final AppState app;

  ComicController(this.app) {
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

  Future<void> load() async {
    try {
      project = await app.storage.getComicProject(app.params);
    } catch (_) {
      project = ComicProject.empty(app.params);
    }
    activePanelId = project.panels.isEmpty ? '' : project.panels.first.id;
    loaded = true;
    notifyListeners();
  }

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
      () => app.storage.setComicProject(project),
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

  Future<void> exportProjectJson() async {
    final temp = await getTemporaryDirectory();
    final file = File('${temp.path}/${_safeName(displayTitle)}.json');
    await file.writeAsString(
      const JsonEncoder.withIndent(' ')
          .convert(project.toJson(includeLocalReferences: false)),
      flush: true,
    );
    await Share.shareXFiles([XFile(file.path)], text: displayTitle);
    changed('comic.jsonShared');
  }

  Future<void> importProjectJson() async {
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
    project = ComicProject.fromJson(
      Map<String, dynamic>.from(decoded),
      app.params,
    );
    activePanelId = project.panels.isEmpty ? '' : project.panels.first.id;
    changed('comic.projectImported');
  }

  GenerateParams paramsFor(ComicPanel panel) {
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
    final remaining = max(0, 5 - project.preciseReferences.length);
    if (remaining == 0) return;
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: const ['png', 'jpg', 'jpeg', 'webp'],
      withData: true,
    );
    if (result == null) return;
    final documents = await getApplicationDocumentsDirectory();
    final root = Directory(
        '${documents.path}${Platform.pathSeparator}comic-projects${Platform.pathSeparator}${project.id}${Platform.pathSeparator}references');
    await root.create(recursive: true);
    for (final picked in result.files.take(remaining)) {
      final bytes = picked.bytes ??
          (picked.path == null ? null : await File(picked.path!).readAsBytes());
      if (bytes == null || bytes.isEmpty) continue;
      final extension = picked.extension?.toLowerCase() ?? 'png';
      final id = comicId();
      final file = File('${root.path}${Platform.pathSeparator}$id.$extension');
      await file.writeAsBytes(bytes, flush: true);
      project.preciseReferences.add(ComicReferenceAsset(
        id: id,
        name: picked.name,
        filePath: file.path,
      ));
    }
    changed('comic.preciseImported');
  }

  Future<String?> addPreciseReferencePreset(ReferencePreset preset) async {
    if (preset.kind != ReferencePresetKind.precise) return 'Unsupported preset';
    if (project.preciseReferences.length >= 5) return _t('comic.preciseHint');
    try {
      final source = File(preset.filePath);
      final bytes = await source.readAsBytes();
      final documents = await getApplicationDocumentsDirectory();
      final root = Directory(
          '${documents.path}${Platform.pathSeparator}comic-projects${Platform.pathSeparator}${project.id}${Platform.pathSeparator}references');
      await root.create(recursive: true);
      final sourceExtension = preset.filePath.split('.').last.toLowerCase();
      final extension =
          const {'png', 'jpg', 'jpeg', 'webp'}.contains(sourceExtension)
              ? sourceExtension
              : 'png';
      final id = comicId();
      final file = File('${root.path}${Platform.pathSeparator}$id.$extension');
      await file.writeAsBytes(bytes, flush: true);
      project.preciseReferences.add(ComicReferenceAsset(
        id: id,
        name: preset.name,
        filePath: file.path,
        type: preset.preciseType,
        strength: preset.strength,
        fidelity: preset.fidelity,
        informationExtracted: 1,
      ));
      changed('comic.preciseImported');
      return null;
    } catch (_) {
      return _t('error.readReference');
    }
  }

  Future<void> removePreciseReference(String referenceId) async {
    final matches = project.preciseReferences
        .where((item) => item.id == referenceId)
        .toList();
    for (final item in matches) {
      await File(item.filePath).delete().catchError((_) => File(item.filePath));
    }
    project.preciseReferences.removeWhere((item) => item.id == referenceId);
    for (final panel in project.panels) {
      panel.preciseReferences
          .removeWhere((item) => item.referenceId == referenceId);
    }
    changed();
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

  Future<GenerateExtras> extrasFor(ComicPanel panel) async {
    final precise = <PreciseReferenceItem>[];
    for (final selection in resolvedComicPanelReferences(project, panel)) {
      final assets = project.preciseReferences
          .where((item) => item.id == selection.referenceId)
          .toList();
      if (assets.isEmpty) continue;
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
      } catch (_) {}
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

  Future<int> quoteTasks(Iterable<ComicPanel> panels, {int each = 1}) async {
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
    ComicPanel panel,
  ) async {
    return _ComicGenerationTask(
      panel: panel,
      params: paramsFor(panel).copy(),
      extras: (await extrasFor(panel)).copy(),
    );
  }

  Future<void> _generateCandidate(_ComicGenerationTask task) async {
    final panel = task.panel;
    if (panel.prompt.trim().isEmpty) {
      throw FormatException(_t('comic.emptyPrompt'));
    }
    panel
      ..status = ComicPanelStatus.generating
      ..error = '';
    changed('comic.generatingPanel');
    try {
      final before = app.account.anlasBalance;
      final item = await app.generateComicPanel(
        panelParams: task.params,
        panelExtras: task.extras,
        projectTitle: displayTitle,
        historyGroupId: project.historyGroupId,
      );
      project.historyGroupId = item.groupId;
      final candidate = ComicCandidate(
        id: comicId(),
        historyItemId: item.id,
        outputPath: item.filePath,
        createdAt: item.createdAt,
        actualAnlas: before != null && app.account.anlasBalance != null
            ? max(0, before - app.account.anlasBalance!)
            : null,
      );
      panel.candidates.add(candidate);
      panel
        ..selectedCandidateId ??= candidate.id
        ..status = ComicPanelStatus.done;
      changed('comic.generated');
    } catch (error) {
      if (queueCancelled) {
        panel
          ..status = panel.candidates.isEmpty
              ? ComicPanelStatus.ready
              : ComicPanelStatus.done
          ..error = '';
        changed('comic.queueStopped');
        return;
      }
      panel
        ..status = ComicPanelStatus.failed
        ..error = error.toString().replaceFirst('Exception: ', '');
      changed('comic.panelFailed', panel.error);
      rethrow;
    }
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

  Future<void> _runQueue(List<ComicPanel> tasks) async {
    if (queueRunning || tasks.isEmpty) return;
    if (!hasCompletePanelSizes) {
      throw FormatException(_t('comic.sizesIncomplete'));
    }
    if (tasks.any((panel) => panel.prompt.trim().isEmpty)) {
      throw FormatException(_t('comic.emptyPrompt'));
    }
    final planned = <_ComicGenerationTask>[];
    for (final panel in tasks) {
      planned.add(await _captureGenerationTask(panel));
    }
    if (planned.any((task) =>
        task.extras.preciseReferences.isNotEmpty &&
        !task.params.supportsPreciseReference)) {
      throw FormatException(_t('comic.preciseV45Only'));
    }
    queueRunning = true;
    queueCancelled = false;
    queueDone = 0;
    queueTotal = planned.length;
    notifyListeners();
    try {
      await BackgroundQueueService.start(
        'comic-generation',
        title: _t('notification.comicTitle'),
        text: '${_t('comic.generateHeading')} 0/${planned.length}',
      );
    } catch (_) {}
    for (final task in planned) {
      if (queueCancelled) break;
      try {
        await _generateCandidate(task);
      } catch (_) {}
      queueDone++;
      notifyListeners();
    }
    queueRunning = false;
    await BackgroundQueueService.stop('comic-generation');
    changed(queueCancelled ? 'comic.queueStopped' : 'comic.queueDone');
  }

  void cancelQueue() {
    if (!queueRunning) return;
    queueCancelled = true;
    app.api.cancelActiveGeneration();
    changed('comic.queueStopped');
  }

  void selectCandidate(ComicPanel panel, String candidateId) {
    if (!panel.candidates.any((item) => item.id == candidateId)) return;
    panel.selectedCandidateId = candidateId;
    changed('comic.currentMain');
  }

  Future<void> exportSelectedZip() async {
    final selected = project.panels
        .map((panel) => (panel, panel.selectedCandidate))
        .where((entry) =>
            entry.$2 != null && File(entry.$2!.outputPath).existsSync())
        .toList();
    if (selected.isEmpty) throw StateError(_t('comic.noCandidate'));
    final archive = Archive();
    final manifest = utf8.encode(
      const JsonEncoder.withIndent('  ').convert(project.toJson()),
    );
    archive.addFile(ArchiveFile('project.json', manifest.length, manifest));
    final prompts = StringBuffer('# $displayTitle\n\n');
    for (final entry in selected) {
      final panel = entry.$1;
      final candidate = entry.$2!;
      final bytes = await File(candidate.outputPath).readAsBytes();
      final extension = _extension(candidate.outputPath);
      archive.addFile(ArchiveFile(
        'images/${panel.index.toString().padLeft(3, '0')}.$extension',
        bytes.length,
        bytes,
      ));
      prompts
        ..writeln('## ${panel.index}. ${panel.title}')
        ..writeln(panel.prompt)
        ..writeln();
    }
    final promptBytes = utf8.encode(prompts.toString());
    archive.addFile(ArchiveFile('prompts.md', promptBytes.length, promptBytes));
    final zip = ZipEncoder().encode(archive);
    if (zip == null) throw StateError(_t('error.zipEncode'));
    final temp = await getTemporaryDirectory();
    final file = File('${temp.path}/${_safeName(displayTitle)}.zip');
    await file.writeAsBytes(zip, flush: true);
    await Share.shareXFiles([XFile(file.path)], text: displayTitle);
    changed('comic.zipShared');
  }

  @override
  void dispose() {
    if (queueRunning) {
      queueCancelled = true;
      app.api.cancelActiveGeneration();
    }
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
String _safeName(String value) =>
    value.replaceAll(RegExp(r'[<>:"/\\|?*]'), '_');
String _extension(String path) {
  final dot = path.lastIndexOf('.');
  return dot < 0 ? 'png' : path.substring(dot + 1).toLowerCase();
}
