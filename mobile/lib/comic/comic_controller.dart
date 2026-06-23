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
  String status = '就绪';
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
    changed('已新建空白漫画项目');
  }

  void clearPanels() {
    project.panels.clear();
    activePanelId = '';
    selectedPanelIds.clear();
    changed('已清空分镜，故事、全局设定和参考图仍保留');
  }

  void syncCurrentParams() {
    project
      ..globalParams = (app.params.copy()..positivePrompt = '')
      ..globalStylePrompt = app.params.stylePrompt
      ..globalNegativePrompt = app.params.negativePrompt;
    changed('已同步当前生图参数');
  }

  Future<void> exportProjectJson() async {
    final temp = await getTemporaryDirectory();
    final file = File('${temp.path}/${_safeName(project.title)}.json');
    await file.writeAsString(
      const JsonEncoder.withIndent('  ').convert(project.toJson()),
      flush: true,
    );
    await Share.shareXFiles([XFile(file.path)], text: project.title);
    status = '项目 JSON 已交给系统分享/保存';
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
      if (bytes == null) throw const FormatException('无法读取文件');
      final decoded = jsonDecode(utf8.decode(bytes));
      if (decoded is! Map) throw const FormatException('项目 JSON 根节点必须是对象');
      project = ComicProject.fromJson(
        Map<String, dynamic>.from(decoded),
        app.params,
      );
      activePanelId = project.panels.isEmpty ? '' : project.panels.first.id;
      selectedPanelIds.clear();
      changed('项目已导入；外部输出路径已清除，需要重新生成图片');
    } catch (error) {
      status = '导入失败：$error';
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
      changed('已添加参考图');
      return null;
    } catch (_) {
      return '无法读取参考图，请换用有效的 PNG、JPG 或 WebP 图片';
    }
  }

  void removeReference(String id) {
    project.references.removeWhere((item) => item.id == id);
    changed('已移除参考图');
  }

  Future<void> reverseReference(ComicReference reference) async {
    if (busy) return;
    busy = true;
    status = '正在反推 ${reference.name}...';
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
      changed('参考图反推完成');
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
    status = '正在拆分故事...';
    notifyListeners();
    final fallback = _fallbackPanels(script, project.desiredPanelCount);
    try {
      final key = await app.storage.getConvertKey() ?? '';
      if (key.isEmpty) {
        _applyAnalyzedPanels(fallback, title: project.title);
        status = '未配置转换 API，已使用本地规则拆分 ${fallback.length} 格';
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
              '用户故事：\n$script\n\n参考图反推 / 用户说明：\n${references.isEmpty ? '(none)' : references.join('\n')}',
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
              : project.title
          ..globalPrompt =
              parsed?['globalPrompt']?.toString().trim().isNotEmpty == true
                  ? parsed!['globalPrompt'].toString().trim()
                  : script
          ..globalCharacterSetting =
              parsed?['globalCharacterSetting']?.toString().trim().isNotEmpty ==
                      true
                  ? parsed!['globalCharacterSetting'].toString().trim()
                  : references.join('\n');
        _applyAnalyzedPanels(panels, title: project.title);
        status = result.ok
            ? '已拆分 ${panels.length} 个分镜'
            : 'AI 拆分失败，已回退本地规则：${result.message}';
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
      status = '请先在设置中配置转换 API Key';
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
        status = '正在转换分镜 #${panel.index}...';
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
      status = '转换完成：成功 $success，失败 ${targets.length - success}';
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
    status = '正在翻译分镜 #${panel.index}...';
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
      changed(toEnglish ? '已直译为英文' : '已回译为中文');
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
      status = '请先配置转换 API Key';
      notifyListeners();
      return;
    }
    busy = true;
    status = '正在分块检测一致性...';
    notifyListeners();
    final replacements = <String, String>{};
    try {
      for (var start = 0; start < reviewable.length; start += 6) {
        final chunk =
            reviewable.sublist(start, min(start + 6, reviewable.length));
        final checked = await _checkConsistencyChunk(chunk, reviewable, key);
        if (checked == null) {
          status = '一致性检测失败，已保留所有原英文提示词，未覆盖任何分镜';
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
      changed('一致性检测完成：复核 ${reviewable.length} 格，调整 $changedCount 格');
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
    changed('正在生成分镜 #${panel.index}...');
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
        projectTitle: project.title,
        historyGroupId: project.historyGroupId,
      );
      project.historyGroupId = item.groupId;
      panel
        ..status = ComicPanelStatus.done
        ..outputPath = item.filePath
        ..actualAnlas = before != null && app.account.anlasBalance != null
            ? max(0, before - app.account.anlasBalance!)
            : null;
      changed('分镜 #${panel.index} 已生成');
    } catch (error) {
      panel
        ..status = ComicPanelStatus.failed
        ..error = error.toString().replaceFirst('Exception: ', '');
      changed('分镜 #${panel.index} 失败：${panel.error}');
      rethrow;
    }
  }

  Future<void> startQueue(List<ComicPanel> targets) async {
    if (targets.isEmpty || queueRunning) return;
    final quote = quotePanels(targets);
    final balance = app.account.anlasBalance;
    if (balance != null && quote > balance) {
      status = '选中分镜预计需要 $quote Anlas，当前余额 $balance，已阻止执行';
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
        title: 'Langbai 漫画生成队列',
        text: '准备生成 0/${targets.length}',
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
        title: 'Langbai 漫画生成队列',
        text: '正在生成 ${queueDone + 1}/$queueTotal · 分镜 #${panel.index}',
      ));
      try {
        await generateOne(panel);
      } catch (error) {
        final lower = error.toString().toLowerCase();
        if (lower.contains('401') || lower.contains('unauthorized')) {
          queueCancelled = true;
          status = '队列已停止：NovelAI Token 或 Image Endpoint 鉴权失败';
        }
      }
      queueDone++;
      notifyListeners();
    }
    final cancelled = queueCancelled;
    queueRunning = false;
    queuePaused = false;
    await BackgroundQueueService.stop('comic-generation');
    if (!cancelled) status = '漫画队列完成：$queueDone/$queueTotal';
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
    status = '正在取消漫画队列...';
    notifyListeners();
  }

  Future<void> exportComicZip() async {
    final archive = Archive();
    final projectJson = utf8.encode(
      const JsonEncoder.withIndent('  ').convert(project.toJson()),
    );
    archive
        .addFile(ArchiveFile('project.json', projectJson.length, projectJson));
    final prompts = StringBuffer('# ${project.title}\n\n');
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
    if (zip == null) throw StateError('ZIP 编码失败');
    final temp = await getTemporaryDirectory();
    final file = File('${temp.path}/${_safeName(project.title)}.zip');
    await file.writeAsBytes(zip, flush: true);
    await Share.shareXFiles([XFile(file.path)], text: project.title);
    status = '漫画 ZIP 已交给系统分享/保存';
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
          '第 $index 格：$description。补足镜头、人物动作、场景、构图、情绪和连续性。',
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
        '第 ${index + 1} 格：$chunk。设计成独立漫画分镜，包含镜头景别、人物动作、场景细节、构图和情绪递进。',
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
