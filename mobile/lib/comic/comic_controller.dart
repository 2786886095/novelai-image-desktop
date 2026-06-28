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
import '../prompts/prompt_mode.dart';
import '../state/app_state.dart';
import '../services/background_queue_service.dart';
import 'comic_models.dart';

class ComicController extends ChangeNotifier {
  final AppState app;

  ComicController(this.app) {
    BackgroundQueueService.addCancelHandler(cancelQueue);
  }

  late ComicProject project;
  ComicStep step = ComicStep.story;
  String status = runtimeTextFor('zh-CN', 'common.ready');
  String activePanelId = '';
  Set<String> selectedPanelIds = {};
  bool loaded = false;
  bool busy = false;
  bool queueRunning = false;
  bool queuePaused = false;
  bool queueCancelled = false;
  int queueDone = 0;
  int queueTotal = 0;
  Timer? _saveTimer;

  String _rt(String key) => runtimeTextFor(app.settings.language, key);
  String _rf(String key, Map<String, Object?> values) =>
      runtimeFormatFor(app.settings.language, key, values);
  String _projectTitle() => project.title.trim().isEmpty ||
          project.title == legacyComicProjectTitle ||
          project.title == defaultComicProjectTitle
      ? _rt('comic.defaultTitle')
      : project.title;
  String get displayTitle => _projectTitle();
  String get displayStatus =>
      status == runtimeTextFor('zh-CN', 'common.ready') ||
              status == runtimeTextFor('en-US', 'common.ready')
          ? _rt('common.ready')
          : status;

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

  List<ComicPanel> get selectedPanels => project.panels
      .where((panel) => selectedPanelIds.contains(panel.id))
      .toList();

  void setStep(ComicStep value) {
    step = value;
    notifyListeners();
  }

  void changed([String? message]) {
    if (message != null) status = message;
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
    selectedPanelIds.clear();
    step = ComicStep.story;
    changed(_rt('comic.statusNew'));
  }

  void clearPanels() {
    project.panels.clear();
    activePanelId = '';
    selectedPanelIds.clear();
    changed(_rt('comic.panelsCleared'));
  }

  void syncCurrentParams() {
    project
      ..globalParams = (app.params.copy()..positivePrompt = '')
      ..globalStylePrompt = app.params.stylePrompt
      ..globalNegativePrompt = app.params.negativePrompt;
    changed(_rt('comic.syncedParams'));
  }

  Future<void> exportProjectJson() async {
    final temp = await getTemporaryDirectory();
    final file = File('${temp.path}/${_safeName(_projectTitle())}.json');
    await file.writeAsString(
      const JsonEncoder.withIndent('  ').convert(project.toJson()),
      flush: true,
    );
    await Share.shareXFiles([XFile(file.path)], text: _projectTitle());
    status = _rt('comic.jsonShared');
    notifyListeners();
  }

  Future<void> importProjectJson() async {
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
      final decoded = jsonDecode(utf8.decode(bytes));
      if (decoded is! Map) throw FormatException(_rt('error.projectJsonRoot'));
      project = ComicProject.fromJson(
        Map<String, dynamic>.from(decoded),
        app.params,
      );
      activePanelId = project.panels.isEmpty ? '' : project.panels.first.id;
      selectedPanelIds.clear();
      changed(_rt('comic.projectImported'));
    } catch (error) {
      status = _rf('comic.importFailed', {'error': error});
      notifyListeners();
    }
  }

  Future<String?> addReference(String filePath) async {
    try {
      final file = File(filePath);
      final bytes = await file.readAsBytes();
      final dims = AppState.readImageDimensions(bytes);
      project.references.add(ComicReference(
        id: _id(),
        name: file.uri.pathSegments.last,
        base64: base64Encode(bytes),
        sourcePath: filePath,
        width: dims.$1,
        height: dims.$2,
      ));
      changed(_rt('comic.referenceAdded'));
      return null;
    } catch (_) {
      return _rt('error.readReference');
    }
  }

  void removeReference(String id) {
    project.references.removeWhere((item) => item.id == id);
    changed(_rt('comic.referenceRemoved'));
  }

  Future<void> reverseReference(ComicReference reference) async {
    if (busy) return;
    busy = true;
    status = _rf('comic.reversingReference', {'name': reference.name});
    notifyListeners();
    try {
      final key = await app.storage.getVisionKey() ?? '';
      final scope = ReversePromptScope.values.firstWhere(
        (value) => value.value == reference.scope,
        orElse: () => ReversePromptScope.full,
      );
      final result = await app.api.reversePrompt(
        settings: app.settings,
        apiKey: key,
        image: base64Decode(reference.base64),
        mode: project.mode,
        scope: scope,
        hint: reference.subjectHint,
        knownCharacter: false,
        systemTemplate: app.resolvedPromptTemplate(
          'reverse',
          project.mode,
          scoped: scope != ReversePromptScope.full,
        ),
      );
      if (!result.ok) throw Exception(result.message);
      reference.reversePrompt = result.text;
      changed(_rt('comic.reverseReferenceDone'));
    } catch (error) {
      status = error.toString().replaceFirst('Exception: ', '');
      notifyListeners();
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> analyzeStory() async {
    final script = project.rawScript.trim();
    if (script.isEmpty || busy) return;
    busy = true;
    status = _rt('comic.splittingStory');
    notifyListeners();
    final fallback = _fallbackPanels(script, project.desiredPanelCount);
    try {
      final key = await app.storage.getConvertKey() ?? '';
      if (key.isEmpty) {
        _applyAnalyzedPanels(fallback, title: _projectTitle());
        status = _rf('comic.localSplitUsed', {'count': fallback.length});
      } else {
        final references = _referenceContext();
        final system = [
          app.resolvedPromptTemplate('comic', project.mode),
          project.desiredPanelCount > 0
              ? 'Target panel count: ${project.desiredPanelCount}.'
              : 'Panel count: auto.',
          'Use the reference notes to build global character, scene and object settings.',
          'Return JSON only: title, globalPrompt, globalCharacterSetting, panels. Each panel has cnPrompt and contextSummary.',
        ].join('\n\n');
        final result = await app.api.runTextAi(
          settings: app.settings,
          apiKey: key,
          apiUrl: app.settings.convertApiUrl,
          model: app.settings.convertApiModel,
          system: system,
          user:
              'User story:\n$script\n\nReference inspect / user notes:\n${references.isEmpty ? '(none)' : references.join('\n')}',
          maxTokens: 4000,
        );
        final parsed = result.ok ? _jsonObject(result.text) : null;
        final parsedPanels = _panelsFromJson(parsed?['panels']);
        final minimum = project.desiredPanelCount > 0
            ? max(1, (project.desiredPanelCount * 0.6).floor())
            : 1;
        final panels = parsedPanels.length >= minimum ? parsedPanels : fallback;
        project
          ..title = parsed?['title']?.toString().trim().isNotEmpty == true
              ? parsed!['title'].toString().trim()
              : _projectTitle()
          ..globalPrompt =
              parsed?['globalPrompt']?.toString().trim().isNotEmpty == true
                  ? parsed!['globalPrompt'].toString().trim()
                  : script
          ..globalCharacterSetting =
              parsed?['globalCharacterSetting']?.toString().trim().isNotEmpty ==
                      true
                  ? parsed!['globalCharacterSetting'].toString().trim()
                  : references.join('\n');
        _applyAnalyzedPanels(panels, title: _projectTitle());
        status = result.ok
            ? _rf('comic.splitDone', {'count': panels.length})
            : _rf('comic.splitFallback', {'message': result.message});
      }
      step = ComicStep.global;
      changed();
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> convertPanels(List<ComicPanel> targets) async {
    if (targets.isEmpty || busy) return;
    final key = await app.storage.getConvertKey() ?? '';
    if (key.isEmpty) {
      status = _rt('comic.convertKeyRequired');
      notifyListeners();
      return;
    }
    busy = true;
    var success = 0;
    final ordered = [...project.panels]
      ..sort((a, b) => a.index.compareTo(b.index));
    try {
      for (final panel in targets) {
        final position = ordered.indexWhere((item) => item.id == panel.id);
        status = _rf('comic.convertingPanel', {'index': panel.index});
        notifyListeners();
        final system = [
          app.resolvedPromptTemplate('convert', project.mode),
          'You convert continuous comic panels into NovelAI prompts.',
          'Keep characters, outfits, locations, timeline and key objects consistent.',
          'Do not change this panel camera, action or plot focus.',
          modeUserInstruction(project.mode, 'convert'),
        ].join('\n\n');
        final user = [
          'Global story:',
          project.globalPrompt,
          'Global setting:',
          project.globalCharacterSetting,
          'Global style:',
          project.globalStylePrompt,
          'Reference notes:',
          _referenceContext().join('\n'),
          'Previous Chinese panel:',
          position > 0 ? ordered[position - 1].cnPrompt : '(none)',
          'Current Chinese panel:',
          panel.cnPrompt,
          'Next Chinese panel:',
          position + 1 < ordered.length
              ? ordered[position + 1].cnPrompt
              : '(none)',
          'Previous final prompts:',
          ordered
              .sublist(max(0, position - 2), max(0, position))
              .map((item) => item.enPrompt)
              .where((text) => text.trim().isNotEmpty)
              .join('\n'),
        ].join('\n\n');
        final result = await app.api.runTextAi(
          settings: app.settings,
          apiKey: key,
          apiUrl: app.settings.convertApiUrl,
          model: app.settings.convertApiModel,
          system: system,
          user: user,
          maxTokens: 1800,
        );
        if (result.ok && result.text.trim().isNotEmpty) {
          panel
            ..enPrompt = cleanPromptOutput(result.text)
            ..status = ComicPanelStatus.converted
            ..error = '';
          success++;
        } else {
          panel
            ..status = ComicPanelStatus.failed
            ..error = result.message;
        }
        changed();
      }
      status = _rf('comic.convertDone', {
        'success': success,
        'failed': targets.length - success,
      });
    } finally {
      busy = false;
      changed();
    }
  }

  Future<void> translatePanel(ComicPanel panel,
      {required bool toEnglish}) async {
    if (busy) return;
    final source = (toEnglish ? panel.cnPrompt : panel.enPrompt).trim();
    if (source.isEmpty) return;
    busy = true;
    status = _rf('comic.translatingPanel', {'index': panel.index});
    notifyListeners();
    try {
      final result = await app.api.translateText(
        source,
        app.settings,
        target: toEnglish ? 'en' : 'zh-CN',
      );
      if (!result.ok) throw Exception(result.message);
      if (toEnglish) {
        panel
          ..enPrompt = result.text
          ..status = ComicPanelStatus.converted;
      } else {
        panel.cnPrompt = result.text;
      }
      changed(
          toEnglish ? _rt('comic.translatedEn') : _rt('comic.translatedCn'));
    } catch (error) {
      status = error.toString().replaceFirst('Exception: ', '');
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> checkConsistency() async {
    final reviewable = project.panels
        .where((panel) => panel.enPrompt.trim().isNotEmpty)
        .toList();
    if (reviewable.isEmpty || busy) return;
    final key = await app.storage.getConvertKey() ?? '';
    if (key.isEmpty) {
      status = _rt('comic.convertKeyRequiredShort');
      notifyListeners();
      return;
    }
    busy = true;
    status = _rt('comic.consistencyRunning');
    notifyListeners();
    final replacements = <String, String>{};
    try {
      for (var start = 0; start < reviewable.length; start += 6) {
        final chunk =
            reviewable.sublist(start, min(start + 6, reviewable.length));
        final checked = await _checkConsistencyChunk(chunk, reviewable, key);
        if (checked == null) {
          status = _rt('comic.consistencyFailed');
          return;
        }
        replacements.addAll(checked);
      }
      var changedCount = 0;
      for (final panel in reviewable) {
        final replacement = replacements[panel.id];
        if (replacement != null && replacement.trim().isNotEmpty) {
          if (replacement != panel.enPrompt) changedCount++;
          panel
            ..enPrompt = replacement
            ..status = ComicPanelStatus.converted;
        }
      }
      changed(_rf('comic.consistencyDone', {
        'reviewed': reviewable.length,
        'changed': changedCount,
      }));
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<Map<String, String>?> _checkConsistencyChunk(
    List<ComicPanel> chunk,
    List<ComicPanel> all,
    String key,
  ) async {
    final result = await app.api.runTextAi(
      settings: app.settings,
      apiKey: key,
      apiUrl: app.settings.convertApiUrl,
      model: app.settings.convertApiModel,
      system: [
        'You are a continuous comic prompt consistency reviewer.',
        'Return strict JSON only: {"panels":[{"panelId":"...","enPrompt":"...","note":"..."}]}.',
        'Only fix inconsistent character, outfit, scene or object naming.',
        'Never change camera, action, pose or plot focus in an individual panel.',
      ].join('\n'),
      user: [
        'Global setting:',
        project.globalCharacterSetting,
        'Reference notes:',
        _referenceContext().join('\n'),
        'All panel identity context:',
        jsonEncode(all
            .map((panel) => {
                  'panelId': panel.id,
                  'index': panel.index,
                  'cnPrompt': panel.cnPrompt,
                  'enPrompt': panel.enPrompt,
                })
            .toList()),
        'Panels to review:',
        jsonEncode(chunk
            .map((panel) => {
                  'panelId': panel.id,
                  'index': panel.index,
                  'cnPrompt': panel.cnPrompt,
                  'enPrompt': panel.enPrompt,
                })
            .toList()),
      ].join('\n\n'),
      maxTokens: min(3200, max(1400, 700 + chunk.length * 420)),
    );
    final parsed = result.ok ? _jsonObject(result.text) : null;
    final items = parsed?['panels'];
    final replacements = <String, String>{};
    if (items is List) {
      for (final item in items.whereType<Map>()) {
        final id = item['panelId']?.toString().trim() ?? '';
        final prompt = cleanPromptOutput(item['enPrompt']?.toString() ?? '');
        if (id.isNotEmpty && prompt.isNotEmpty) replacements[id] = prompt;
      }
    }
    if (replacements.isNotEmpty) {
      return {
        for (final panel in chunk)
          panel.id: replacements[panel.id] ?? panel.enPrompt
      };
    }
    if (chunk.length == 1) return null;
    final middle = (chunk.length / 2).ceil();
    final left =
        await _checkConsistencyChunk(chunk.sublist(0, middle), all, key);
    if (left == null) return null;
    final right = await _checkConsistencyChunk(chunk.sublist(middle), all, key);
    if (right == null) return null;
    return {...left, ...right};
  }

  int quotePanels(List<ComicPanel> panels) {
    var total = 0;
    for (final panel in panels) {
      final params = panel.overrideParams ? panel.params : project.globalParams;
      final extras = _referencesToExtras(params);
      total += calculateImageGenerationAnlas(
            params: params,
            account: app.account,
            extras: extras,
            alreadyEncodedVibes: app.api.countCachedVibes(params.model, extras),
            preciseReferenceCount: extras.preciseReferences.length,
            language: app.settings.language,
          ).amount ??
          0;
    }
    return total;
  }

  Future<void> generateOne(ComicPanel panel) async {
    if (panel.status == ComicPanelStatus.generating) return;
    panel
      ..status = ComicPanelStatus.generating
      ..error = '';
    changed(_rf('comic.generatingPanel', {'index': panel.index}));
    try {
      final params =
          (panel.overrideParams ? panel.params : project.globalParams).copy();
      params
        ..positivePrompt = _merge(project.globalStylePrompt,
            panel.enPrompt.trim().isEmpty ? panel.cnPrompt : panel.enPrompt)
        ..negativePrompt = panel.overrideNegative
            ? panel.localNegativePrompt
            : _merge(project.globalNegativePrompt, panel.localNegativePrompt);
      final extras = _referencesToExtras(params);
      final before = app.account.anlasBalance;
      final item = await app.generateComicPanel(
        panelParams: params,
        panelExtras: extras,
        projectTitle: _projectTitle(),
        historyGroupId: project.historyGroupId,
      );
      project.historyGroupId = item.groupId;
      panel
        ..status = ComicPanelStatus.done
        ..outputPath = item.filePath
        ..actualAnlas = before != null && app.account.anlasBalance != null
            ? max(0, before - app.account.anlasBalance!)
            : null;
      changed(_rf('comic.panelDone', {'index': panel.index}));
    } catch (error) {
      panel
        ..status = ComicPanelStatus.failed
        ..error = error.toString().replaceFirst('Exception: ', '');
      changed(_rf('comic.panelFailed', {
        'index': panel.index,
        'error': panel.error,
      }));
      rethrow;
    }
  }

  Future<void> startQueue(List<ComicPanel> targets) async {
    if (targets.isEmpty || queueRunning) return;
    final quote = quotePanels(targets);
    final balance = app.account.anlasBalance;
    if (balance != null && quote > balance) {
      status = _rf('comic.insufficient', {
        'amount': quote,
        'balance': balance,
      });
      notifyListeners();
      return;
    }
    queueRunning = true;
    queuePaused = false;
    queueCancelled = false;
    queueDone = 0;
    queueTotal = targets.length;
    notifyListeners();
    try {
      await BackgroundQueueService.start(
        'comic-generation',
        title: _rt('notification.comicTitle'),
        text: _rf('notification.prepare', {'total': targets.length}),
      );
    } catch (_) {
      // Foreground-service restrictions must not block a foreground run.
    }
    for (final panel in targets) {
      if (queueCancelled) break;
      while (queuePaused && !queueCancelled) {
        await Future<void>.delayed(const Duration(milliseconds: 220));
      }
      if (queueCancelled) break;
      unawaited(BackgroundQueueService.update(
        title: _rt('notification.comicTitle'),
        text: _rf('notification.generatingPanel', {
          'current': queueDone + 1,
          'total': queueTotal,
          'index': panel.index,
        }),
      ));
      try {
        await generateOne(panel);
      } catch (error) {
        final lower = error.toString().toLowerCase();
        if (lower.contains('401') || lower.contains('unauthorized')) {
          queueCancelled = true;
          status = _rt('comic.authStopped');
        }
      }
      queueDone++;
      notifyListeners();
    }
    final cancelled = queueCancelled;
    queueRunning = false;
    queuePaused = false;
    await BackgroundQueueService.stop('comic-generation');
    if (!cancelled) {
      status = _rf('comic.queueDone', {
        'done': queueDone,
        'total': queueTotal,
      });
    }
    changed();
    if (!cancelled && project.autoExportZip) await exportComicZip();
  }

  void toggleQueuePause() {
    queuePaused = !queuePaused;
    notifyListeners();
  }

  void cancelQueue() {
    queueCancelled = true;
    queuePaused = false;
    app.api.cancelActiveGeneration();
    status = _rt('comic.cancelling');
    notifyListeners();
  }

  Future<void> exportComicZip() async {
    final archive = Archive();
    final projectJson = utf8.encode(
      const JsonEncoder.withIndent('  ').convert(project.toJson()),
    );
    archive
        .addFile(ArchiveFile('project.json', projectJson.length, projectJson));
    final prompts = StringBuffer('# ${_projectTitle()}\n\n');
    for (final panel in project.panels) {
      prompts
        ..writeln('## ${panel.index}')
        ..writeln(panel.cnPrompt)
        ..writeln(panel.enPrompt)
        ..writeln();
      final path = panel.outputPath;
      if (path.isNotEmpty && File(path).existsSync()) {
        final bytes = await File(path).readAsBytes();
        archive.addFile(ArchiveFile(
          'images/${panel.index.toString().padLeft(3, '0')}.png',
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
    final file = File('${temp.path}/${_safeName(_projectTitle())}.zip');
    await file.writeAsBytes(zip, flush: true);
    await Share.shareXFiles([XFile(file.path)], text: _projectTitle());
    status = _rt('comic.zipShared');
    notifyListeners();
  }

  GenerateExtras _referencesToExtras(GenerateParams params) {
    final vibes = <VibeTransferItem>[];
    final precise = <PreciseReferenceItem>[];
    for (final reference in project.references.where(
      (item) => item.useForGeneration && item.base64.isNotEmpty,
    )) {
      final preciseType = switch (reference.kind) {
        'character' => 'character',
        'scene' || 'object' => 'style',
        'precise' => 'character&style',
        _ => null,
      };
      if (params.isV45 && preciseType != null) {
        precise.add(PreciseReferenceItem(
          base64: reference.base64,
          type: preciseType,
          strength: reference.strength,
          fidelity: reference.infoExtracted,
          informationExtracted: reference.infoExtracted,
          sourcePath: reference.sourcePath,
          width: reference.width,
          height: reference.height,
        ));
      } else {
        vibes.add(VibeTransferItem(
          base64: reference.base64,
          infoExtracted: reference.infoExtracted,
          strength: reference.strength,
          sourcePath: reference.sourcePath,
        ));
      }
    }
    return GenerateExtras(vibeImages: vibes, preciseReferences: precise);
  }

  List<String> _referenceContext() => project.references
      .where((item) =>
          item.reversePrompt.trim().isNotEmpty ||
          item.subjectHint.trim().isNotEmpty)
      .map((item) => '【${item.kind} · ${item.name}】${[
            item.subjectHint,
            item.reversePrompt
          ].where((text) => text.trim().isNotEmpty).join('；')}')
      .toList();

  void _applyAnalyzedPanels(List<(String, String)> panels,
      {required String title}) {
    project.panels = panels
        .asMap()
        .entries
        .map((entry) => ComicPanel(
              id: _id(),
              index: entry.key + 1,
              cnPrompt: entry.value.$1,
              contextSummary: entry.value.$2,
              params: project.globalParams.copy(),
            ))
        .toList();
    activePanelId = project.panels.isEmpty ? '' : project.panels.first.id;
    selectedPanelIds.clear();
  }

  // Create panels straight from imported tag prompts (one per line). Each line
  // is the panel's English prompt (status converted), so the user can generate
  // without the story → split → reverse flow — same idea as batch img2img import.
  void importTagPanels(String text) {
    final lines = text
        .split(RegExp(r'\r?\n'))
        .map((line) => line.trim())
        .where((line) => line.isNotEmpty)
        .toList();
    if (lines.isEmpty) {
      changed(_rt('comic.tagPanelEmpty'));
      return;
    }
    project.panels = lines
        .asMap()
        .entries
        .map((entry) => ComicPanel(
              id: _id(),
              index: entry.key + 1,
              enPrompt: entry.value,
              status: ComicPanelStatus.converted,
              params: project.globalParams.copy(),
            ))
        .toList();
    activePanelId = project.panels.first.id;
    selectedPanelIds.clear();
    step = ComicStep.panels;
    changed(_rf('comic.tagPanelsImported', {'count': lines.length}));
  }

  List<(String, String)> _fallbackPanels(String script, int desiredCount) {
    final ranges = <(String, String)>[];
    for (final raw in script.split(RegExp(r'\r?\n'))) {
      final line = raw.trim();
      final match =
          RegExp(r'^(\d+)\s*[-~]\s*(\d+)\s*[.。:：、]?\s*(.+)$').firstMatch(line);
      if (match == null) continue;
      final start = int.tryParse(match.group(1) ?? '');
      final end = int.tryParse(match.group(2) ?? '');
      final description = match.group(3)?.trim() ?? '';
      if (start == null || end == null || end < start || end - start > 500) {
        continue;
      }
      for (var index = start; index <= end; index++) {
        ranges.add((
          _rf('comic.fallbackRangePanel', {
            'index': index,
            'description': description,
          }),
          description.substring(0, min(180, description.length)),
        ));
      }
    }
    if (ranges.isNotEmpty) return ranges;
    final chunks = script
        .split(RegExp(r'(?<=[。！？!?])\s*'))
        .map((text) => text.trim())
        .where((text) => text.isNotEmpty)
        .toList();
    final source = chunks.isEmpty ? [script] : chunks;
    final count = desiredCount > 0 ? desiredCount.clamp(1, 500) : source.length;
    return List.generate(count, (index) {
      final chunk = source[
          min(source.length - 1, (index * source.length / count).floor())];
      return (
        _rf('comic.fallbackAutoPanel', {
          'index': index + 1,
          'chunk': chunk,
        }),
        chunk.substring(0, min(180, chunk.length)),
      );
    });
  }

  List<(String, String)> _panelsFromJson(dynamic value) {
    if (value is! List) return [];
    return value
        .whereType<Map>()
        .map((item) {
          final prompt =
              (item['cnPrompt'] ?? item['prompt'] ?? '').toString().trim();
          final summary = (item['contextSummary'] ?? item['summary'] ?? prompt)
              .toString()
              .trim();
          return (prompt, summary);
        })
        .where((item) => item.$1.isNotEmpty)
        .toList();
  }

  Map<String, dynamic>? _jsonObject(String text) {
    final cleaned = text
        .trim()
        .replaceFirst(RegExp(r'^```(?:json)?\s*', caseSensitive: false), '')
        .replaceFirst(RegExp(r'\s*```$'), '');
    try {
      final value = jsonDecode(cleaned);
      if (value is Map) return Map<String, dynamic>.from(value);
    } catch (_) {}
    final start = cleaned.indexOf('{');
    final end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      final value = jsonDecode(cleaned.substring(start, end + 1));
      return value is Map ? Map<String, dynamic>.from(value) : null;
    } catch (_) {
      return null;
    }
  }

  String _merge(String left, String right) =>
      [left.trim(), right.trim()].where((value) => value.isNotEmpty).join(', ');

  String _safeName(String value) {
    final safe = value.replaceAll(RegExp(r'[\\/:*?"<>|]+'), '-').trim();
    return safe.isEmpty
        ? 'comic-project'
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
