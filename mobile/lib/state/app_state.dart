import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../billing/anlas.dart';
import '../i18n/runtime_text.dart';
import '../images/file_image_preloader.dart';
import '../images/image_processing.dart';
import '../images/png_metadata.dart';
import '../models/nai_models.dart';
import '../prompts/capsule_data.dart';
import '../prompts/prompt_mode.dart';
import '../prompts/prompt_templates.dart';
import '../prompts/prompt_tools.dart';
import '../prompts/positive_prompt_presets.dart';
import '../references/reference_presets.dart';
import '../services/nai_api.dart';
import '../services/nai_stream.dart';
import '../services/proxy_http_client.dart';
import '../services/storage.dart';
import '../services/update_service.dart';
import '../services/background_queue_service.dart';
import '../services/data_backup_service.dart';
import '../services/resource_database_service.dart';
import '../tags/offline_tag_store.dart';

// A finished convert/reverse job is already reflected in the result box and
// history — leaving it in the tracker list just forces a manual ✕ tap.
const _textToolDoneAutoDismiss = Duration(milliseconds: 1500);

@visibleForTesting
int normalizeBatchIntervalSeconds(Object? value) {
  final parsed = value is num ? value.toDouble() : double.tryParse('$value');
  if (parsed == null || !parsed.isFinite) return 0;
  return parsed.round().clamp(0, 3600).toInt();
}

@visibleForTesting
Future<bool> waitForBatchInterval(
  int seconds,
  bool Function() shouldContinue, {
  Future<void> Function(Duration duration)? delay,
}) async {
  var remaining = normalizeBatchIntervalSeconds(seconds) * 1000;
  final wait = delay ?? Future<void>.delayed;
  while (remaining > 0) {
    final slice = min(250, remaining);
    await wait(Duration(milliseconds: slice));
    if (!shouldContinue()) return false;
    remaining -= slice;
  }
  return shouldContinue();
}

@visibleForTesting
bool looksLikeReferenceGenerationError(Object error) {
  final message = error.toString().toLowerCase();
  return message.contains('reference') ||
      message.contains('director') ||
      message.contains('vibe') ||
      message.contains('encode-vibe') ||
      message.contains('information_extracted') ||
      message.contains('controlnet');
}

class AppState extends ChangeNotifier {
  final NaiApi api;
  final Storage storage;
  final OfflineTagStore offlineTags;
  final CompletedImagePreloader _preloadCompletedImage;

  AppState({
    NaiApi? api,
    Storage? storage,
    OfflineTagStore? offlineTags,
    CompletedImagePreloader? preloadCompletedImage,
  })  : api = api ?? NaiApi(),
        storage = storage ?? Storage(),
        offlineTags = offlineTags ?? OfflineTagStore(),
        _preloadCompletedImage =
            preloadCompletedImage ?? preloadCompletedFileImage {
    BackgroundQueueService.addCancelHandler(cancelGeneration);
  }

  GenerateParams params = GenerateParams();
  GenerateExtras extras = GenerateExtras();
  I2IParams i2i = I2IParams();
  String i2iSizeMode = 'adaptive';
  AugmentOptions augmentOptions = AugmentOptions();
  AppSettings settings = AppSettings();
  PromptTemplateLibrary promptTemplates = const PromptTemplateLibrary();
  AccountSummary account = const AccountSummary(hasToken: false);
  List<HistoryItem> history = [];
  List<HistoryGroup> groups = [];
  List<String> referencePresetGroups =
      referencePresetGroupsWithDefaults(const <String>[]);
  List<ReferencePreset> referencePresets = [];
  HistoryItem? current;
  WorkingImage? workbenchImage;
  WorkingImage? i2iOriginalImage;
  String i2iSourceMode = 'original';
  String inpaintSourceMode = 'original';
  ImportedGenerateParams? workbenchImportedParams;
  List<CharCaptionItem> workbenchCharacterCaptions = const [];
  Set<String> aitagCompatibleParams = {...importedGenerateParamKeys};
  WorkingImage? comparisonBefore;
  WorkingImage? comparisonAfter;

  bool booted = false;
  bool needsNetworkOnboarding = false;
  bool busy = false;
  Uint8List? generationPreview;
  double generationPreviewProgress = 0;
  int generationPreviewStep = 0;
  int generationPreviewTotalSteps = 0;
  String status = runtimeTextFor('zh-CN', 'common.ready');
  int batchCount = 1;
  int batchIntervalSeconds = 0;
  String selectedGroupId = '';
  String generationGroupId = '';
  String inpaintModel = 'nai-diffusion-5-full-inpainting';
  double inpaintStrength = 1;
  double inpaintNoise = 0;
  // Independent from params.positivePrompt — inpaint must not inherit the
  // main generate/i2i prompt automatically.
  String inpaintPositivePrompt = '';
  int upscaleScale = 2;
  int enhanceMagnitude = 5;
  int enhanceScale = 1;
  String directorTool = 'bg-removal';
  ReversePromptMode reverseMode = ReversePromptMode.tags;
  ReversePromptMode convertMode = ReversePromptMode.natural;
  ReversePromptScope reverseScope = ReversePromptScope.full;
  String reverseHint = '';
  bool reverseKnownCharacter = false;
  bool convertKnownCharacter = false;
  String reverseResult = '';
  PromptVariants? reversePromptVariants;
  List<PromptCodexMatch> reverseCodexMatches = [];
  // Concurrent job tracker for reverse requests — every submission fires
  // immediately and updates its own entry in place; not a serial queue.
  List<TextToolJob> reverseJobs = [];
  bool reverseQueueCollapsed = true;
  List<TextToolHistoryItem> reverseHistory = [];
  String convertInput = '';
  String convertResult = '';
  PromptVariants? convertResultVariants;
  List<TextToolJob> convertJobs = [];
  bool convertQueueCollapsed = true;
  List<TextToolHistoryItem> convertHistory = [];
  List<PromptCodexMatch> convertCodexMatches = [];
  AnlasQuote? generationQuote;
  bool quoteLoading = false;
  bool generationQueueRunning = false;
  bool queuePaused = false;
  bool queueCollapsed = true;
  bool queueAdding = false;
  bool clearQueueRequested = false;
  List<GenerationQueueJob> generationQueue = [];
  GenerationQueueProgress? queueProgress;
  int queueReservedAnlas = 0;
  int? lastAnlasSpent;
  OfflineTagStatus offlineTagStatus = const OfflineTagStatus();
  bool offlineTagBusy = false;
  UpdateInfo? updateInfo;
  bool updateChecking = false;

  Timer? _quoteTimer;
  Timer? _toolPersistTimer;
  Timer? _opusUsageTimer;
  Timer? _proxyRefreshTimer;
  bool _opusUsageRefreshRunning = false;
  int _quoteVersion = 0;
  bool _cancelGenerationRequested = false;
  int _activeTaskQuote = 0;
  int? _pendingAuthorizedBalance;
  Timer? _automaticBackupTimer;

  String _rt(String key) => runtimeTextFor(settings.language, key);
  String _rf(String key, Map<String, Object?> values) =>
      runtimeFormatFor(settings.language, key, values);
  String _unknown() => _rt('common.unknown');
  String _spentText(int? amount) => amount == null
      ? _rt('status.actualSpentUnknown')
      : _rf('status.actualSpent', {'amount': amount});
  String get displayStatus =>
      status == runtimeTextFor('zh-CN', 'common.ready') ||
              status == runtimeTextFor('en-US', 'common.ready')
          ? _rt('common.ready')
          : status;

  Future<void> load() async {
    try {
      promptTemplates = await PromptTemplateLibrary.load();
      settings = await storage.getSettings();
      try {
        final savedAitagParams = await storage.getAitagCompatibleParams();
        if (savedAitagParams != null) {
          aitagCompatibleParams = savedAitagParams
              .where(importedGenerateParamKeys.contains)
              .toSet();
        }
      } catch (_) {
        // Older/test platform shells may not expose SharedPreferences yet.
      }
      status = _rt('common.ready');
      // Per-tool persistence opt-out: when a toggle is off, that tool keeps
      // its hardcoded defaults instead of restoring the last-used values.
      if (settings.persistGenerateParams) {
        params = await storage.getParams();
        batchIntervalSeconds =
            normalizeBatchIntervalSeconds(settings.batchIntervalSeconds);
      }
      final repairedApiBase = resolveNovelAiBaseUrl(
          settings.apiBaseUrl, 'https://api.novelai.net', settings);
      final repairedImageBase = resolveNovelAiBaseUrl(
          settings.imageBaseUrl, 'https://image.novelai.net', settings);
      if (repairedApiBase != settings.apiBaseUrl ||
          repairedImageBase != settings.imageBaseUrl) {
        settings
          ..apiBaseUrl = repairedApiBase
          ..imageBaseUrl = repairedImageBase;
        await storage.setSettings(settings);
      }
      final expectedModelMode = params.model == 'nai-diffusion-furry-3'
          ? 'furry'
          : settings.modelMode == 'furry'
              ? 'furry'
              : 'anime';
      if (settings.modelMode != expectedModelMode) {
        settings.modelMode = expectedModelMode;
        await storage.setSettings(settings);
      }
      // Follow the phone's current system proxy when one is published; an
      // empty result stays direct so Android/iOS VPN and TUN adapters can route
      // the socket without any app-side localhost port.
      if (settings.proxyMode != 'auto') {
        settings.proxyMode = 'auto';
        settings.proxyUrl = '';
        await storage.setSettings(settings);
      }
      await refreshSystemProxyRoute(settings.apiBaseUrl);
      _proxyRefreshTimer?.cancel();
      _proxyRefreshTimer = Timer.periodic(
        const Duration(seconds: 30),
        (_) => unawaited(refreshSystemProxyRoute(settings.apiBaseUrl)),
      );
      // Restore the last-used tool selections (desktop "last generation state").
      // reverseMode/convertMode aren't part of the per-tool persistence
      // toggles below — those only cover generate/inpaint/upscale/director.
      reverseMode =
          _modeFromSetting(settings.reversePromptMode, ReversePromptMode.tags);
      convertMode = _modeFromSetting(
          settings.convertPromptMode, ReversePromptMode.natural);
      if (settings.persistInpaintParams) {
        inpaintModel = settings.inpaintModel;
        inpaintStrength = settings.inpaintStrength;
        inpaintNoise = settings.inpaintNoise;
        inpaintPositivePrompt = settings.inpaintPositivePrompt;
      }
      if (settings.persistUpscaleParams) {
        upscaleScale = settings.upscaleScale;
      }
      if (settings.persistDirectorParams) {
        directorTool = settings.directorTool;
        augmentOptions = AugmentOptions(
          defry: settings.augmentDefry,
          colorizePrompt: settings.augmentColorizePrompt,
          emotion: settings.augmentEmotion,
          emotionLevel: settings.augmentEmotionLevel,
        );
      }
      history = await storage.getHistory();
      convertHistory = await storage.getConvertHistory();
      reverseHistory = await storage.getReverseHistory();
      unawaited(pruneMissingReverseHistory());
      groups = await storage.getGroups();
      try {
        final referenceLibrary = await storage.getReferencePresetLibrary();
        referencePresets = List.of(referenceLibrary.presets);
        referencePresetGroups = referencePresetGroupsWithDefaults(
          referenceLibrary.groups.where((group) =>
              referenceLibrary.version >= 2 ||
              !legacyReferencePresetGroups.contains(group) ||
              referencePresets.any((preset) => preset.group == group)),
        );
      } catch (_) {
        // Reference presets are optional user data. A damaged legacy entry
        // must never prevent the generator from reaching its first frame.
        referencePresetGroups =
            referencePresetGroupsWithDefaults(const <String>[]);
        referencePresets = [];
      }
      selectedGroupId = groups.any(
        (group) => group.id == settings.activeHistoryGroupId,
      )
          ? settings.activeHistoryGroupId
          : '';
      generationGroupId = groups.any(
        (group) => group.id == settings.generationGroupId,
      )
          ? settings.generationGroupId
          : '';
      if (settings.lockStylePrompt) {
        params.stylePrompt = settings.savedStylePrompt;
      }
      if (settings.lockNegativePrompt) {
        params.negativePrompt = settings.savedNegativePrompt;
      }
      try {
        offlineTagStatus = await offlineTags.status();
      } catch (_) {
        offlineTagStatus = const OfflineTagStatus();
      }
      needsNetworkOnboarding = !await storage.hasSeenNetworkOnboarding();
      current = history.isNotEmpty ? history.first : null;
      final token = await storage.getToken();
      if (token != null && token.isNotEmpty) {
        // Show a token-present placeholder immediately. The real account fetch
        // is a NovelAI network call — awaiting it here would stall startup (and
        // hang indefinitely when there's no proxy), so it runs off the boot
        // path in the finally block and refreshes the UI when it lands.
        account = const AccountSummary(hasToken: true);
      }
    } catch (error) {
      status = _rf('status.bootReadFailed', {'error': _cleanError(error)});
    } finally {
      booted = true;
      notifyListeners();
      _scheduleGenerationQuote();
      unawaited(checkUpdate());
      unawaited(_refreshAccountAtBoot());
      _scheduleAutomaticBackup();
    }
  }

  void _scheduleAutomaticBackup({
    Duration delay = const Duration(minutes: 2),
  }) {
    if (_automaticBackupTimer?.isActive ?? false) return;
    _automaticBackupTimer = Timer(delay, () async {
      _automaticBackupTimer = null;
      // Never compete with generation/queue work. If the user is actively
      // producing images, wait for another quiet window instead.
      if (busy || generationQueueRunning || queueAdding) {
        _scheduleAutomaticBackup(delay: const Duration(minutes: 1));
        return;
      }
      try {
        await DataBackupService(storage).runAutomaticBackup();
      } catch (_) {
        // Automatic backup is best-effort; manual export and import remain
        // available even when the platform file system is temporarily busy.
      }
    });
  }

  // Fetch the account after boot so a slow or blocked network never delays the
  // first frame. Mirrors the old inline fetch: placeholder + status note on
  // failure, no success toast.
  Future<AccountSummary> _fetchAccountPreservingLast(String token) async {
    final fresh = await api.fetchAccount(token, settings);
    if (!fresh.stale) return fresh;
    // A failed official /user/data refresh must never replace the last real
    // allowance with a fabricated zero/placeholder. Keep the last successful
    // values, but mark them stale so the UI cannot claim a live sync.
    return account.hasToken ? account.copyWith(stale: true) : fresh;
  }

  Future<void> _refreshAccountAtBoot() async {
    final token = await storage.getToken();
    if (token == null || token.isEmpty) return;
    try {
      account = await _fetchAccountPreservingLast(token);
      if (!account.stale) {
        _scheduleOpusUsageRefresh();
      } else {
        status = _rt('status.accountSyncStale');
      }
    } catch (error) {
      account = const AccountSummary(hasToken: true);
      status = _rf('status.accountReadFailed', {'error': _cleanError(error)});
    }
    notifyListeners();
    _scheduleGenerationQuote();
  }

  Future<void> dismissNetworkOnboarding() async {
    needsNetworkOnboarding = false;
    await storage.markNetworkOnboardingSeen();
    notifyListeners();
  }

  void setParam(void Function(GenerateParams p) update) {
    final previousQualityPreset = params.qualityPreset;
    final previousQualityToggle = params.qualityToggle;
    update(params);
    if (params.qualityPreset != previousQualityPreset) {
      params.qualityToggle = params.qualityPreset != 'none';
    } else if (params.qualityToggle != previousQualityToggle) {
      params.qualityPreset = params.qualityToggle ? 'standard' : 'none';
    }
    if (!params.isV5) {
      if (params.qualityPreset == 'light') params.qualityPreset = 'standard';
      params.qualityToggle = params.qualityPreset != 'none';
      params.transparentBackground = false;
    }
    var settingsChanged = false;
    if (settings.lockStylePrompt &&
        settings.savedStylePrompt != params.stylePrompt) {
      settings.savedStylePrompt = params.stylePrompt;
      settingsChanged = true;
    }
    if (settings.lockNegativePrompt &&
        settings.savedNegativePrompt != params.negativePrompt) {
      settings.savedNegativePrompt = params.negativePrompt;
      settingsChanged = true;
    }
    notifyListeners();
    storage.setParams(params);
    if (settingsChanged) storage.setSettings(settings);
    _scheduleGenerationQuote();
  }

  Future<void> setSettings(void Function(AppSettings s) update) async {
    update(settings);
    await storage.setSettings(settings);
    notifyListeners();
    _scheduleGenerationQuote();
  }

  void markChanged() {
    notifyListeners();
    _scheduleGenerationQuote();
    _scheduleToolStatePersist();
  }

  void setI2ISizeMode(String value) {
    i2iSizeMode = value == 'custom' ? 'custom' : 'adaptive';
    notifyListeners();
    _scheduleGenerationQuote();
  }

  void setI2ISourceMode(String value) {
    i2iSourceMode = value == 'latest' ? 'latest' : 'original';
    notifyListeners();
  }

  void setInpaintSourceMode(String value) {
    final next = value == 'latest' ? 'latest' : 'original';
    final target = next == 'latest'
        ? (comparisonAfter ?? workbenchImage)
        : (i2iOriginalImage ?? workbenchImage);
    inpaintSourceMode = next;
    if (target != null && target.filePath != workbenchImage?.filePath) {
      workbenchImage = target;
    }
    notifyListeners();
  }

  (int, int) get i2iOutputSize {
    final image = workbenchImage;
    if (image == null || i2iSizeMode == 'custom') {
      return (params.width, params.height);
    }
    return adaptiveNaiImageSize(
      image.width,
      image.height,
      fallbackWidth: params.width,
      fallbackHeight: params.height,
    );
  }

  void setBatchCount(int n) {
    batchCount = n.clamp(1, 999);
    notifyListeners();
    _scheduleGenerationQuote();
  }

  void setBatchIntervalSeconds(int seconds) {
    batchIntervalSeconds = normalizeBatchIntervalSeconds(seconds);
    settings.batchIntervalSeconds = batchIntervalSeconds;
    notifyListeners();
    unawaited(storage.setSettings(settings));
  }

  Future<String?> setToken(String token) async {
    try {
      final summary = await api.verifyToken(token, settings);
      await storage.setToken(token.trim());
      account = summary;
      _scheduleOpusUsageRefresh();
      notifyListeners();
      _scheduleGenerationQuote();
      return null;
    } catch (e) {
      if (e is NaiNetworkException) {
        return _rt('error.naiNetworkRetryFailed');
      }
      return e.toString().replaceFirst('Exception: ', '');
    }
  }

  Future<void> clearToken() async {
    await storage.clearToken();
    account = const AccountSummary(hasToken: false);
    _opusUsageTimer?.cancel();
    generationQuote = null;
    notifyListeners();
  }

  Future<void> refreshAnlas() async {
    final token = await storage.getToken();
    if (token == null) return;
    try {
      account = await _fetchAccountPreservingLast(token);
      if (account.stale) {
        status = _rt('status.accountSyncStale');
      } else {
        _scheduleOpusUsageRefresh();
        status = _rt('status.anlasRefreshed');
      }
    } catch (error) {
      status = _rf('status.anlasRefreshFailed', {'error': _cleanError(error)});
    }
    notifyListeners();
    _scheduleGenerationQuote();
  }

  void _scheduleOpusUsageRefresh() {
    _opusUsageTimer?.cancel();
    if (account.tierLevel != 3) return;
    _opusUsageTimer = Timer.periodic(
      const Duration(minutes: 1),
      (_) => unawaited(_refreshOpusUsageSilently()),
    );
  }

  Future<void> _refreshOpusUsageSilently() async {
    if (_opusUsageRefreshRunning) return;
    final token = await storage.getToken();
    if (token == null || token.isEmpty) return;
    _opusUsageRefreshRunning = true;
    try {
      final fresh = await _fetchAccountPreservingLast(token);
      // fetchAccount deliberately returns a token-present placeholder on a
      // transient network failure. Keep the last official V5 reading instead
      // of replacing it with that placeholder during the silent minute poll.
      if (fresh.stale) {
        account = fresh;
        notifyListeners();
        return;
      }
      account = fresh;
      notifyListeners();
    } catch (_) {
      // Keep the last successful reading; the visible refresh action reports
      // network errors explicitly.
    } finally {
      _opusUsageRefreshRunning = false;
    }
  }

  Future<String?> translateText(String text, {String target = 'en'}) async {
    busy = true;
    status = _rt('status.translating');
    notifyListeners();
    try {
      final result = await api.translateText(
        text,
        settings,
        target: target,
        baiduSecret: await storage.getBaiduSecret() ?? '',
      );
      status = result.message;
      return result.ok ? result.text : null;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> setSecret(String key, String value) async {
    if (key == 'vision') await storage.setVisionKey(value.trim());
    if (key == 'convert') await storage.setConvertKey(value.trim());
    if (key == 'tag') await storage.setTagKey(value.trim());
    if (key == 'baidu') await storage.setBaiduSecret(value.trim());
  }

  Future<void> setActiveHistoryGroup(String value) async {
    selectedGroupId = groups.any((group) => group.id == value) ? value : '';
    settings.activeHistoryGroupId = selectedGroupId;
    await storage.setSettings(settings);
    notifyListeners();
  }

  Future<void> setGenerationGroup(String value) async {
    generationGroupId = groups.any((group) => group.id == value) ? value : '';
    settings.generationGroupId = generationGroupId;
    await storage.setSettings(settings);
    notifyListeners();
  }

  Future<void> createGenerationGroup(String name) async {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return;
    HistoryGroup? group = groups
        .where((item) => item.name.toLowerCase() == trimmed.toLowerCase())
        .firstOrNull;
    if (group == null) {
      group = HistoryGroup(
        id: DateTime.now().microsecondsSinceEpoch.toString(),
        name: trimmed,
        createdAt: DateTime.now().toIso8601String(),
      );
      groups = [...groups, group];
      await storage.writeGroups(groups);
    }
    generationGroupId = group.id;
    settings.generationGroupId = group.id;
    await storage.setSettings(settings);
    notifyListeners();
  }

  Future<void> setPromptLock(String kind, bool locked) async {
    if (kind == 'style') {
      settings
        ..lockStylePrompt = locked
        ..savedStylePrompt = locked ? params.stylePrompt : '';
    } else {
      settings
        ..lockNegativePrompt = locked
        ..savedNegativePrompt = locked ? params.negativePrompt : '';
    }
    await storage.setSettings(settings);
    notifyListeners();
  }

  Future<void> addPromptShortcut({
    required String name,
    required String prefix,
    required String suffix,
    required String negativePrompt,
  }) async {
    final cleanName = name.trim();
    if (cleanName.isEmpty) {
      throw Exception(_rt('status.promptTemplateNameRequired'));
    }
    settings.promptShortcuts.add(PromptShortcutTemplate(
      id: '${DateTime.now().microsecondsSinceEpoch}',
      name: cleanName,
      prefix: prefix.trim(),
      suffix: suffix.trim(),
      negativePrompt: negativePrompt.trim(),
    ));
    await storage.setSettings(settings);
    notifyListeners();
  }

  Future<void> removePromptShortcut(String id) async {
    settings.promptShortcuts.removeWhere((item) => item.id == id);
    await storage.setSettings(settings);
    notifyListeners();
  }

  void applyPromptShortcut(PromptShortcutTemplate template) {
    setParam((params) {
      final positive = [
        template.prefix,
        params.positivePrompt,
        template.suffix,
      ].where((value) => value.trim().isNotEmpty).join(', ');
      params.positivePrompt = positive;
      if (!settings.lockNegativePrompt &&
          template.negativePrompt.trim().isNotEmpty) {
        params.negativePrompt = [
          params.negativePrompt,
          template.negativePrompt,
        ].where((value) => value.trim().isNotEmpty).join(', ');
      }
    });
    status = _rf('status.promptShortcutApplied', {'name': template.name});
  }

  Future<StylePromptPreset> addStylePromptPreset({
    required String name,
    required String prompt,
    String group = 'Default',
  }) async {
    final cleanName = name.trim();
    final cleanPrompt = prompt.trim();
    if (cleanName.isEmpty) {
      throw Exception(_rt('status.promptTemplateNameRequired'));
    }
    final preset = StylePromptPreset(
      id: '${DateTime.now().microsecondsSinceEpoch}',
      name: cleanName,
      prompt: cleanPrompt,
      group: group.trim().isEmpty ? 'Default' : group.trim(),
      createdAt: DateTime.now().toIso8601String(),
      previewImages: [],
    );
    settings.stylePromptPresets.add(preset);
    await storage.setSettings(settings);
    notifyListeners();
    return preset;
  }

  Future<bool> addStylePromptPresetGroup(String rawName) async {
    final name = rawName.trim();
    if (name.isEmpty) return false;
    if (settings.stylePromptPresetGroups
        .any((item) => item.toLowerCase() == name.toLowerCase())) {
      return false;
    }
    settings.stylePromptPresetGroups.add(name);
    await storage.setSettings(settings);
    notifyListeners();
    return true;
  }

  Future<void> moveStylePromptPreset(String id, String rawGroup) async {
    final group = rawGroup.trim().isEmpty ? 'Default' : rawGroup.trim();
    final preset =
        settings.stylePromptPresets.where((item) => item.id == id).firstOrNull;
    if (preset == null || preset.group == group) return;
    preset.group = group;
    if (!settings.stylePromptPresetGroups.contains(group)) {
      settings.stylePromptPresetGroups.add(group);
    }
    await storage.setSettings(settings);
    notifyListeners();
  }

  Future<bool> removeStylePromptPresetGroup(String rawGroup) async {
    final group = rawGroup.trim();
    if (group.isEmpty || group == 'Default') return false;
    final removed = settings.stylePromptPresetGroups.remove(group);
    if (!removed) return false;
    for (final preset in settings.stylePromptPresets) {
      if (preset.group == group) preset.group = 'Default';
    }
    await storage.setSettings(settings);
    notifyListeners();
    return true;
  }

  Future<void> removeStylePromptPreset(String id) async {
    await storage.deleteStylePromptPreviewImages(id);
    settings.stylePromptPresets.removeWhere((item) => item.id == id);
    await storage.setSettings(settings);
    notifyListeners();
  }

  void applyStylePromptPreset(StylePromptPreset preset) {
    setParam((params) => params.stylePrompt = preset.prompt);
  }

  Future<List<StylePromptPreviewImage>> importStylePromptPreviewImages({
    required StylePromptPreset preset,
    required List<({String path, String name})> sources,
  }) async {
    final available = max(0, 3 - preset.previewImages.length);
    if (available == 0) return const [];
    final imported = <StylePromptPreviewImage>[];
    for (final source in sources.take(available)) {
      final image = await storage.copyStylePromptPreviewImage(
        presetId: preset.id,
        sourcePath: source.path,
        sourceName: source.name,
      );
      if (image != null) imported.add(image);
    }
    if (imported.isEmpty) return const [];
    preset.previewImages =
        [...preset.previewImages, ...imported].take(3).toList();
    await storage.setSettings(settings);
    notifyListeners();
    return imported;
  }

  Future<StylePromptPreviewImage?> replaceStylePromptPreviewImage({
    required StylePromptPreset preset,
    required StylePromptPreviewImage previous,
    required ({String path, String name}) source,
  }) async {
    final imported = await storage.copyStylePromptPreviewImage(
      presetId: preset.id,
      sourcePath: source.path,
      sourceName: source.name,
    );
    if (imported == null) return null;
    await storage.deleteStylePromptPreviewImage(preset.id, previous);
    preset.previewImages = preset.previewImages
        .map((item) => item.id == previous.id ? imported : item)
        .toList();
    await storage.setSettings(settings);
    notifyListeners();
    return imported;
  }

  Future<void> removeStylePromptPreviewImage({
    required StylePromptPreset preset,
    required StylePromptPreviewImage image,
  }) async {
    await storage.deleteStylePromptPreviewImage(preset.id, image);
    preset.previewImages.removeWhere((item) => item.id == image.id);
    await storage.setSettings(settings);
    notifyListeners();
  }

  Future<PositivePromptPreset> savePositivePromptPreset({
    String? id,
    required String name,
    required String prompt,
  }) async {
    final cleanPrompt = prompt;
    if (cleanPrompt.trim().isEmpty) {
      throw ArgumentError('Positive prompt is required.');
    }
    final existingId = id ?? '';
    final requestedName = name.trim().isEmpty
        ? defaultPositivePromptPresetName(
            cleanPrompt, settings.positivePromptPresets.length + 1)
        : name.trim();
    final cleanName = uniquePositivePromptPresetName(
      settings.positivePromptPresets,
      requestedName,
      excludeId: existingId,
    );
    if (existingId.isNotEmpty) {
      final index = settings.positivePromptPresets
          .indexWhere((preset) => preset.id == existingId);
      if (index >= 0) {
        final preset = settings.positivePromptPresets[index]
          ..name = cleanName
          ..prompt = cleanPrompt;
        await storage.setSettings(settings);
        notifyListeners();
        return preset;
      }
    }
    final preset = PositivePromptPreset(
      id: '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(1 << 20)}',
      name: cleanName,
      prompt: cleanPrompt,
      createdAt: DateTime.now().toIso8601String(),
    );
    settings.positivePromptPresets.insert(0, preset);
    await storage.setSettings(settings);
    notifyListeners();
    return preset;
  }

  Future<void> removePositivePromptPreset(String id) async {
    await storage
        .deleteStylePromptPreviewImages(positivePromptPresetStorageId(id));
    settings.positivePromptPresets.removeWhere((preset) => preset.id == id);
    await storage.setSettings(settings);
    notifyListeners();
  }

  Future<List<StylePromptPreviewImage>> importPositivePromptPresetImages({
    required PositivePromptPreset preset,
    required List<({String path, String name})> sources,
  }) async {
    final available = max(
      0,
      positivePromptPresetImageLimit - preset.previewImages.length,
    );
    if (available == 0) return const [];
    final imported = <StylePromptPreviewImage>[];
    for (final source in sources.take(available)) {
      final image = await storage.copyStylePromptPreviewImage(
        presetId: positivePromptPresetStorageId(preset.id),
        sourcePath: source.path,
        sourceName: source.name,
      );
      if (image != null) imported.add(image);
    }
    if (imported.isEmpty) return const [];
    preset.previewImages = [...preset.previewImages, ...imported]
        .take(positivePromptPresetImageLimit)
        .toList();
    await storage.setSettings(settings);
    notifyListeners();
    return imported;
  }

  Future<void> removePositivePromptPresetImage({
    required PositivePromptPreset preset,
    required StylePromptPreviewImage image,
  }) async {
    await storage.deleteStylePromptPreviewImage(
      positivePromptPresetStorageId(preset.id),
      image,
    );
    preset.previewImages.removeWhere((item) => item.id == image.id);
    await storage.setSettings(settings);
    notifyListeners();
  }

  Future<void> setWorkbenchPath(
    String filePath, {
    bool applyMetadata = false,
  }) async {
    final bytes = await File(filePath).readAsBytes();
    final dims = readImageDimensions(bytes);
    final report = inspectImageMetadata(parseImageTextMetadata(bytes));
    final imported = report.imported;
    workbenchImportedParams = imported.isEmpty ? null : imported;
    workbenchCharacterCaptions = report.characterCaptions;
    workbenchImage =
        WorkingImage(filePath: filePath, width: dims.$1, height: dims.$2);
    i2iOriginalImage = workbenchImage;
    if (applyMetadata && !imported.isEmpty) {
      applyImportedMetadata(
        imported,
        characterCaptions: report.characterCaptions,
        exact: true,
        preserveMissing: true,
      );
      return;
    }
    status = _rt('status.workbenchLoaded');
    notifyListeners();
    _scheduleGenerationQuote();
  }

  Future<void> setWorkbenchFromHistory(HistoryItem item) async {
    current = item;
    await setWorkbenchPath(item.filePath);
  }

  void clearWorkbench() {
    workbenchImage = null;
    i2iOriginalImage = null;
    workbenchImportedParams = null;
    workbenchCharacterCaptions = const [];
    status = _rt('status.workbenchCleared');
    notifyListeners();
    _scheduleGenerationQuote();
  }

  void applyWorkbenchMetadata() {
    final imported = workbenchImportedParams;
    if (imported == null || imported.isEmpty) {
      status = _rt('status.noMetadata');
      notifyListeners();
      return;
    }
    applyImportedMetadata(
      imported,
      characterCaptions: workbenchCharacterCaptions,
      exact: true,
      preserveMissing: true,
    );
  }

  void applyImportedMetadata(
    ImportedGenerateParams imported, {
    List<CharCaptionItem>? characterCaptions,
    bool exact = false,
    bool preserveMissing = false,
  }) {
    if (imported.isEmpty) {
      status = _rt('status.noMetadata');
      notifyListeners();
      return;
    }
    final lockedStyle = params.stylePrompt;
    final lockedNegative = params.negativePrompt;
    imported.applyTo(params);
    if (!exact && settings.lockStylePrompt) {
      params.stylePrompt = lockedStyle;
    }
    if (!exact && settings.lockNegativePrompt) {
      params.negativePrompt = lockedNegative;
    }
    if (exact) {
      final restoredCaptions = (characterCaptions ?? const [])
          .map((item) => CharCaptionItem(
                prompt: item.prompt,
                negativePrompt: item.negativePrompt,
                useCoords: item.useCoords,
                x: item.x,
                y: item.y,
              ))
          .toList();
      if (!preserveMissing || restoredCaptions.isNotEmpty) {
        extras.charCaptions = restoredCaptions;
      }
      if (!preserveMissing) {
        extras
          ..vibeImages.clear()
          ..preciseReferences.clear();
      }
    }
    params = params.normalized();
    unawaited(storage.setParams(params));
    status = _rt('status.metadataRestored');
    notifyListeners();
    _scheduleGenerationQuote();
  }

  void setAitagCompatibleParams(Set<String> values) {
    aitagCompatibleParams =
        values.where(importedGenerateParamKeys.contains).toSet();
    unawaited(storage.setAitagCompatibleParams(aitagCompatibleParams));
    notifyListeners();
  }

  void clearComparison() {
    comparisonBefore = null;
    comparisonAfter = null;
    notifyListeners();
  }

  void addCharacter() {
    if (extras.charCaptions.length >= params.maxCharacterPrompts) return;
    extras.charCaptions.add(CharCaptionItem(
      useCoords: extras.charCaptions.any((caption) => caption.useCoords),
    ));
    notifyListeners();
    _scheduleGenerationQuote();
  }

  void removeCharacter(int index) {
    if (index < 0 || index >= extras.charCaptions.length) return;
    extras.charCaptions.removeAt(index);
    notifyListeners();
    _scheduleGenerationQuote();
  }

  Future<String?> addVibeImage(String filePath) async {
    if (extras.vibeImages.length >= 16) return _rt('status.vibeLimit');
    try {
      final bytes = await File(filePath).readAsBytes();
      readImageDimensions(bytes);
      extras.vibeImages.add(VibeTransferItem(
        base64: base64Encode(bytes),
        sourcePath: filePath,
      ));
      status = _rt('status.vibeAdded');
      notifyListeners();
      _scheduleGenerationQuote();
      return null;
    } catch (_) {
      return _rt('error.readReference');
    }
  }

  Future<String?> addPreciseReference(String filePath) async {
    try {
      final bytes = await File(filePath).readAsBytes();
      final dims = readImageDimensions(bytes);
      extras.preciseReferences.add(PreciseReferenceItem(
        base64: base64Encode(bytes),
        sourcePath: filePath,
        width: dims.$1,
        height: dims.$2,
      ));
      status = _rt('status.preciseAdded');
      notifyListeners();
      _scheduleGenerationQuote();
      return null;
    } catch (_) {
      return _rt('error.readPreciseReference');
    }
  }

  void updateVibeImage(
    int index, {
    double? infoExtracted,
    double? strength,
  }) {
    if (index < 0 || index >= extras.vibeImages.length) return;
    extras.vibeImages[index] = extras.vibeImages[index].copyWith(
      infoExtracted: infoExtracted,
      strength: strength,
    );
    notifyListeners();
    _scheduleGenerationQuote();
  }

  void updatePreciseReference(
    int index, {
    String? type,
    double? strength,
    double? fidelity,
    double? informationExtracted,
  }) {
    if (index < 0 || index >= extras.preciseReferences.length) return;
    extras.preciseReferences[index] = extras.preciseReferences[index].copyWith(
      type: type,
      strength: strength,
      fidelity: fidelity,
      informationExtracted: informationExtracted,
    );
    notifyListeners();
    _scheduleGenerationQuote();
  }

  void removeVibeImage(int index) {
    if (index < 0 || index >= extras.vibeImages.length) return;
    extras.vibeImages.removeAt(index);
    notifyListeners();
    _scheduleGenerationQuote();
  }

  void removePreciseReference(int index) {
    if (index < 0 || index >= extras.preciseReferences.length) return;
    extras.preciseReferences.removeAt(index);
    notifyListeners();
    _scheduleGenerationQuote();
  }

  Future<void> _persistReferencePresetLibrary() =>
      storage.setReferencePresetLibrary(ReferencePresetLibrary(
        groups: referencePresetGroups,
        presets: referencePresets,
      ));

  Future<String?> addReferencePresetGroup(String value) async {
    final group = value.trim();
    if (group.isEmpty) return _rt('referencePresets.groupRequired');
    if (!referencePresetGroups.contains(group)) {
      referencePresetGroups.add(group);
      referencePresetGroups.sort();
      await _persistReferencePresetLibrary();
      notifyListeners();
    }
    return null;
  }

  Future<void> deleteReferencePresetGroup(String value) async {
    final group = value.trim();
    if (group.isEmpty || !referencePresetGroups.contains(group)) return;
    final nextGroups =
        referencePresetGroups.where((item) => item != group).toList();
    final nextPresets = referencePresets
        .map((preset) =>
            preset.group == group ? preset.copyWith(group: '') : preset)
        .toList();
    await storage.setReferencePresetLibrary(ReferencePresetLibrary(
      groups: nextGroups,
      presets: nextPresets,
    ));
    referencePresetGroups = nextGroups;
    referencePresets = nextPresets;
    notifyListeners();
  }

  String _newReferencePresetId() =>
      '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(1 << 30)}';

  Future<String?> saveVibeReferencePreset(
    int index, {
    required String name,
    String group = '',
  }) async {
    if (index < 0 || index >= extras.vibeImages.length) {
      return _rt('referencePresets.sourceMissing');
    }
    final title = name.trim();
    if (title.isEmpty) return _rt('referencePresets.nameRequired');
    try {
      final item = extras.vibeImages[index];
      final id = _newReferencePresetId();
      final path = await storage.persistReferencePresetImage(
        presetId: id,
        bytes: base64Decode(item.base64),
        sourcePath: item.sourcePath,
      );
      final cleanGroup = group.trim();
      if (cleanGroup.isNotEmpty &&
          !referencePresetGroups.contains(cleanGroup)) {
        referencePresetGroups.add(cleanGroup);
        referencePresetGroups.sort();
      }
      referencePresets.add(ReferencePreset(
        id: id,
        name: title,
        group: cleanGroup,
        kind: ReferencePresetKind.vibe,
        filePath: path,
        createdAt: DateTime.now().toIso8601String(),
        infoExtracted: item.infoExtracted,
        strength: item.strength,
      ));
      await _persistReferencePresetLibrary();
      status = _rt('referencePresets.saved');
      notifyListeners();
      return null;
    } catch (_) {
      return _rt('referencePresets.saveFailed');
    }
  }

  Future<String?> savePreciseReferencePreset(
    int index, {
    required String name,
    String group = '',
  }) async {
    if (index < 0 || index >= extras.preciseReferences.length) {
      return _rt('referencePresets.sourceMissing');
    }
    final title = name.trim();
    if (title.isEmpty) return _rt('referencePresets.nameRequired');
    try {
      final item = extras.preciseReferences[index];
      final id = _newReferencePresetId();
      final path = await storage.persistReferencePresetImage(
        presetId: id,
        bytes: base64Decode(item.base64),
        sourcePath: item.sourcePath,
      );
      final cleanGroup = group.trim();
      if (cleanGroup.isNotEmpty &&
          !referencePresetGroups.contains(cleanGroup)) {
        referencePresetGroups.add(cleanGroup);
        referencePresetGroups.sort();
      }
      referencePresets.add(ReferencePreset(
        id: id,
        name: title,
        group: cleanGroup,
        kind: ReferencePresetKind.precise,
        filePath: path,
        createdAt: DateTime.now().toIso8601String(),
        preciseType: item.type,
        strength: item.strength,
        fidelity: item.fidelity,
        informationExtracted: item.informationExtracted,
        width: item.width,
        height: item.height,
      ));
      await _persistReferencePresetLibrary();
      status = _rt('referencePresets.saved');
      notifyListeners();
      return null;
    } catch (_) {
      return _rt('referencePresets.saveFailed');
    }
  }

  Future<String?> saveReferencePresetFromPath(
    String sourcePath, {
    required ReferencePresetKind kind,
    required String name,
    String group = '',
    double infoExtracted = 1,
    double strength = 1,
    String preciseType = 'character',
    double fidelity = 1,
    double informationExtracted = 1,
  }) async {
    final title = name.trim();
    if (title.isEmpty) return _rt('referencePresets.nameRequired');
    try {
      final source = File(sourcePath);
      if (!source.existsSync()) return _rt('referencePresets.sourceMissing');
      final bytes = await source.readAsBytes();
      final dimensions = decodeImageDimensions(bytes);
      final id = _newReferencePresetId();
      final path = await storage.persistReferencePresetImage(
        presetId: id,
        bytes: bytes,
        sourcePath: sourcePath,
      );
      final cleanGroup = group.trim();
      if (cleanGroup.isNotEmpty &&
          !referencePresetGroups.contains(cleanGroup)) {
        referencePresetGroups.add(cleanGroup);
        referencePresetGroups.sort();
      }
      referencePresets.add(ReferencePreset(
        id: id,
        name: title,
        group: cleanGroup,
        kind: kind,
        filePath: path,
        createdAt: DateTime.now().toIso8601String(),
        infoExtracted: infoExtracted.clamp(0, 1).toDouble(),
        strength: strength.clamp(0, 1).toDouble(),
        preciseType: preciseType,
        fidelity: fidelity.clamp(0, 1).toDouble(),
        informationExtracted: informationExtracted.clamp(0, 1).toDouble(),
        width: dimensions.$1,
        height: dimensions.$2,
      ));
      await _persistReferencePresetLibrary();
      status = _rt('referencePresets.saved');
      notifyListeners();
      return null;
    } catch (_) {
      return _rt('referencePresets.saveFailed');
    }
  }

  Future<String?> saveDownloadedPreciseReferencePreset({
    required Uint8List bytes,
    required String sourceId,
    required String name,
    required String group,
    required int width,
    required int height,
    Map<String, String> sourceNames = const {},
    Map<String, String> sourceGameNames = const {},
    String sourceGameId = '',
    String sourceCategory = '',
  }) async {
    if (referencePresets.any((preset) => preset.sourceId == sourceId)) {
      return null;
    }
    final title = name.trim();
    if (title.isEmpty || bytes.isEmpty) {
      return _rt('referencePresets.saveFailed');
    }
    String? persistedPath;
    try {
      final dimensions = decodeImageDimensions(bytes);
      if (dimensions.$1 <= 0 || dimensions.$2 <= 0) {
        return _rt('referencePresets.saveFailed');
      }
      final id = _newReferencePresetId();
      final path = await storage.persistReferencePresetImage(
        presetId: id,
        bytes: bytes,
        sourcePath: '$sourceId.png',
      );
      persistedPath = path;
      final cleanGroup = group.trim();
      final nextGroups = <String>{...referencePresetGroups, cleanGroup}
          .where((value) => value.isNotEmpty)
          .toList()
        ..sort();
      final preset = ReferencePreset(
        id: id,
        name: title,
        group: cleanGroup,
        kind: ReferencePresetKind.precise,
        filePath: path,
        createdAt: DateTime.now().toIso8601String(),
        sourceId: sourceId,
        preciseType: 'character',
        strength: 1,
        fidelity: 1,
        informationExtracted: 1,
        width: width > 0 ? width : dimensions.$1,
        height: height > 0 ? height : dimensions.$2,
        sourceNames: sourceNames,
        sourceGameNames: sourceGameNames,
        sourceGameId: sourceGameId,
        sourceCategory: sourceCategory,
      );
      final nextPresets = [...referencePresets, preset];
      await storage.setReferencePresetLibrary(ReferencePresetLibrary(
        groups: nextGroups,
        presets: nextPresets,
      ));
      referencePresetGroups = nextGroups;
      referencePresets = nextPresets;
      status = _rt('referencePresets.saved');
      notifyListeners();
      return null;
    } catch (_) {
      if (persistedPath != null) {
        try {
          await File(persistedPath).delete();
        } catch (_) {}
      }
      return _rt('referencePresets.saveFailed');
    }
  }

  Future<String?> applyReferencePreset(String id) async {
    final matches = referencePresets.where((preset) => preset.id == id);
    if (matches.isEmpty) return _rt('referencePresets.sourceMissing');
    final preset = matches.first;
    if (preset.kind == ReferencePresetKind.vibe &&
        extras.vibeImages.length >= 16) {
      return _rt('status.vibeLimit');
    }
    try {
      final file = File(preset.filePath);
      if (!file.existsSync()) throw const FileSystemException();
      final encoded = base64Encode(await file.readAsBytes());
      if (preset.kind == ReferencePresetKind.vibe) {
        extras.vibeImages.add(VibeTransferItem(
          base64: encoded,
          infoExtracted: preset.infoExtracted,
          strength: preset.strength,
          sourcePath: preset.filePath,
        ));
      } else {
        extras.preciseReferences.add(PreciseReferenceItem(
          base64: encoded,
          type: preset.preciseType,
          strength: preset.strength,
          fidelity: preset.fidelity,
          informationExtracted: 1,
          sourcePath: preset.filePath,
          width: preset.width,
          height: preset.height,
        ));
      }
      status = _rt('referencePresets.applied');
      notifyListeners();
      _scheduleGenerationQuote();
      return null;
    } catch (_) {
      return _rt('referencePresets.sourceMissing');
    }
  }

  Future<void> deleteReferencePreset(String id) async {
    final index = referencePresets.indexWhere((preset) => preset.id == id);
    if (index < 0) return;
    final preset = referencePresets.removeAt(index);
    await storage.deleteReferencePresetImage(preset);
    await _persistReferencePresetLibrary();
    notifyListeners();
  }

  Future<String?> moveReferencePresetToGroup(String id, String value) async {
    final index = referencePresets.indexWhere((preset) => preset.id == id);
    if (index < 0) return _rt('referencePresets.sourceMissing');
    final group = value.trim();
    if (group.isNotEmpty && !referencePresetGroups.contains(group)) {
      referencePresetGroups.add(group);
      referencePresetGroups.sort();
    }
    referencePresets[index] = referencePresets[index].copyWith(group: group);
    await _persistReferencePresetLibrary();
    status = _rt('referencePresets.moved');
    notifyListeners();
    return null;
  }

  Future<File> exportReferencePresets({String? presetId, String? group}) {
    final selected = presetId != null
        ? referencePresets.where((preset) => preset.id == presetId).toList()
        : group != null
            ? referencePresets.where((preset) => preset.group == group).toList()
            : List<ReferencePreset>.of(referencePresets);
    final selectedGroups = group != null
        ? <String>[if (group.isNotEmpty) group]
        : presetId != null
            ? <String>[
                for (final preset in selected)
                  if (preset.group.isNotEmpty) preset.group
              ]
            : List<String>.of(referencePresetGroups);
    return storage.exportReferencePresetArchive(
      presets: selected,
      groups: selectedGroups.toSet().toList(),
      label: presetId != null
          ? selected.firstOrNull?.name ?? 'reference-preset'
          : group?.isNotEmpty == true
              ? group!
              : 'reference-presets',
    );
  }

  Future<String?> importReferencePresets(String filePath) async {
    try {
      final imported = await storage.importReferencePresetArchive(filePath);
      for (final group in imported.groups) {
        if (!referencePresetGroups.contains(group)) {
          referencePresetGroups.add(group);
        }
      }
      referencePresetGroups.sort();
      referencePresets.addAll(imported.presets);
      await _persistReferencePresetLibrary();
      status = _rf('referencePresets.imported', {
        'count': imported.presets.length,
      });
      notifyListeners();
      return null;
    } catch (_) {
      return _rt('referencePresets.importFailed');
    }
  }

  Future<void> runTextOrImage() async {
    if (workbenchImage == null) {
      await generate();
    } else {
      await generateI2I();
    }
  }

  AnlasQuote get inpaintAnlasQuote => calculateInpaintAnlas(
        params: params,
        account: account,
        image: workbenchImage,
        inpaintModel: inpaintModel,
        strength: inpaintStrength,
        language: settings.language,
      );

  AnlasQuote get upscaleAnlasQuote => calculateUpscaleAnlas(
        image: workbenchImage,
        account: account,
        scale: upscaleScale,
        language: settings.language,
      );

  AnlasQuote get directorAnlasQuote => calculateDirectorAnlas(
        tool: directorTool,
        account: account,
        language: settings.language,
      );

  void _scheduleGenerationQuote() {
    if (!booted) return;
    _quoteTimer?.cancel();
    _quoteTimer = Timer(const Duration(milliseconds: 350), () {
      refreshGenerationQuote();
    });
  }

  void _scheduleToolStatePersist() {
    if (!booted) return;
    _toolPersistTimer?.cancel();
    _toolPersistTimer =
        Timer(const Duration(milliseconds: 400), persistToolState);
  }

  /// Persists the last-used tool selections (reverse/convert mode, inpaint /
  /// upscale / director options) so they survive an app restart, mirroring the
  /// desktop's `lastGenerationState`.
  Future<void> persistToolState() async {
    settings
      ..reversePromptMode = reverseMode.value
      ..convertPromptMode = convertMode.value
      ..inpaintModel = inpaintModel
      ..inpaintStrength = inpaintStrength
      ..inpaintNoise = inpaintNoise
      ..inpaintPositivePrompt = inpaintPositivePrompt
      ..upscaleScale = upscaleScale
      ..directorTool = directorTool
      ..augmentDefry = augmentOptions.defry
      ..augmentColorizePrompt = augmentOptions.colorizePrompt
      ..augmentEmotion = augmentOptions.emotion
      ..augmentEmotionLevel = augmentOptions.emotionLevel;
    await storage.setSettings(settings);
  }

  Future<AnlasQuote> _quoteFor(
    String token,
    GenerateParams quoteParams,
    GenerateExtras quoteExtras,
    int count,
    AccountSummary quoteAccount, {
    bool imageToImage = false,
  }) async {
    final local = calculateImageGenerationAnlas(
      params: quoteParams,
      account: quoteAccount,
      extras: quoteExtras,
      batchCount: count,
      imageToImage: imageToImage,
      strength: i2i.strength,
      alreadyEncodedVibes: api.countCachedVibes(quoteParams.model, quoteExtras),
      preciseReferenceCount: quoteExtras.preciseReferences.length,
      language: settings.language,
    );
    if (imageToImage ||
        quoteExtras.vibeImages.isNotEmpty ||
        quoteExtras.preciseReferences.isNotEmpty) {
      return local;
    }
    final official = await api.requestOfficialGenerationPrice(
      token,
      settings,
      quoteParams,
    );
    return official == null
        ? local
        : local.asOfficial(official,
            samples: count, language: settings.language);
  }

  Future<void> refreshGenerationQuote() async {
    final version = ++_quoteVersion;
    final token = await storage.getToken();
    if (token == null || token.isEmpty || !account.hasToken) {
      if (version == _quoteVersion) {
        generationQuote = null;
        quoteLoading = false;
        notifyListeners();
      }
      return;
    }

    final quoteParams = params.copy();
    final quoteExtras = extras.copy();
    final imageToImage = workbenchImage != null;
    if (imageToImage && i2iSizeMode == 'adaptive') {
      final size = i2iOutputSize;
      quoteParams
        ..width = size.$1
        ..height = size.$2;
    }
    final count = batchCount.clamp(1, 999);
    generationQuote = calculateImageGenerationAnlas(
      params: quoteParams,
      account: account,
      extras: quoteExtras,
      batchCount: count,
      imageToImage: imageToImage,
      strength: i2i.strength,
      alreadyEncodedVibes: api.countCachedVibes(quoteParams.model, quoteExtras),
      preciseReferenceCount: quoteExtras.preciseReferences.length,
      language: settings.language,
    );
    quoteLoading = !imageToImage &&
        quoteExtras.vibeImages.isEmpty &&
        quoteExtras.preciseReferences.isEmpty;
    notifyListeners();

    final quote = await _quoteFor(
      token,
      quoteParams,
      quoteExtras,
      count,
      account,
      imageToImage: imageToImage,
    );
    if (version != _quoteVersion) return;
    generationQuote = quote;
    quoteLoading = false;
    notifyListeners();
  }

  Future<void> generate() async {
    if (busy) return;
    final token = await storage.getToken();
    if (token == null || token.isEmpty) {
      status = _rt('error.tokenRequired');
      notifyListeners();
      return;
    }
    if (params.positivePrompt.trim().isEmpty) {
      status = _rt('error.positiveRequired');
      notifyListeners();
      return;
    }
    final referenceError = _referenceValidationError();
    if (referenceError != null) {
      status = referenceError;
      notifyListeners();
      return;
    }

    final initialTotal = batchCount.clamp(1, 999);
    final initialBatchIntervalSeconds = initialTotal > 1
        ? normalizeBatchIntervalSeconds(batchIntervalSeconds)
        : 0;
    final initialParams = params.copy();
    final initialExtras = extras.copy();
    final initialSeed = initialParams.seed;
    final initialHistoryGroupId = generationGroupId;
    _clearGenerationPreview(notify: false);
    busy = true;
    status = _rt('status.readingCharge');
    notifyListeners();

    var completed = 0;
    var failed = 0;
    var lastError = '';
    int? anlasBefore;
    try {
      account = await _fetchAccountPreservingLast(token);
      final quote = await _quoteFor(
        token,
        initialParams,
        initialExtras,
        initialTotal,
        account,
      );
      generationQuote = quote;
      if (!quote.ok || quote.amount == null) {
        throw Exception(quote.message);
      }
      if (quote.insufficient) {
        status = _rf('status.insufficientThisRun', {
          'amount': quote.amount,
          'balance': quote.balance ?? _unknown(),
        });
        notifyListeners();
      }

      anlasBefore = account.anlasBalance;
      final initialCosts = _splitQuote(quote.amount!, initialTotal);
      queueReservedAnlas = quote.amount!;
      generationQueueRunning = true;
      queuePaused = false;
      queueAdding = false;
      clearQueueRequested = false;
      _cancelGenerationRequested = false;
      generationQueue = [];
      queueProgress = GenerationQueueProgress(total: initialTotal);
      lastAnlasSpent = null;
      if (BackgroundQueueService.shouldWarnNoBackgroundSupport()) {
        status = _rt('status.backgroundNotSupported');
      }
      notifyListeners();
      try {
        await BackgroundQueueService.start(
          'main-generation',
          title: _rt('notification.imageQueueTitle'),
          text: _rf('notification.prepare', {'total': initialTotal}),
        );
      } catch (_) {
        // Notification permission or OEM restrictions must not block generation.
      }

      var initialIndex = 0;
      var skipInitial = false;
      while ((!skipInitial && initialIndex < initialTotal) ||
          generationQueue.isNotEmpty ||
          queueAdding) {
        if (_cancelGenerationRequested) break;
        if (clearQueueRequested) {
          skipInitial = true;
          clearQueueRequested = false;
        }
        while (queuePaused && !_cancelGenerationRequested) {
          status = _rf('status.queuePaused', {
            'done': completed + failed,
            'total': queueProgress?.total ?? 0,
          });
          notifyListeners();
          await Future<void>.delayed(const Duration(milliseconds: 250));
        }
        if (_cancelGenerationRequested) break;
        if (!skipInitial &&
            initialIndex > 0 &&
            initialIndex < initialTotal &&
            initialBatchIntervalSeconds > 0) {
          status = _rf('status.batchInterval', {
            'seconds': initialBatchIntervalSeconds,
            'current': initialIndex + 1,
            'total': initialTotal,
          });
          notifyListeners();
          final shouldContinue = await waitForBatchInterval(
            initialBatchIntervalSeconds,
            () => !_cancelGenerationRequested,
          );
          if (!shouldContinue) break;
          while (queuePaused && !_cancelGenerationRequested) {
            status = _rf('status.queuePaused', {
              'done': completed + failed,
              'total': queueProgress?.total ?? initialTotal,
            });
            notifyListeners();
            await Future<void>.delayed(const Duration(milliseconds: 250));
          }
          if (_cancelGenerationRequested) break;
        }

        GenerateParams taskParams;
        GenerateExtras taskExtras;
        String taskHistoryGroupId;
        var taskQuote = 0;
        if (!skipInitial && initialIndex < initialTotal) {
          taskParams = initialParams.copy();
          taskExtras = initialExtras.copy();
          taskHistoryGroupId = initialHistoryGroupId;
          taskQuote = initialCosts[initialIndex];
          if (initialParams.seedMode != 'random' && initialSeed > 0) {
            taskParams.seed =
                ((initialSeed - 1 + initialIndex) % 4294967295) + 1;
          }
          initialIndex++;
        } else {
          if (generationQueue.isEmpty && queueAdding) {
            status = _rt('status.waitingQueueQuote');
            notifyListeners();
            await Future<void>.delayed(const Duration(milliseconds: 100));
            continue;
          }
          if (generationQueue.isEmpty) break;
          final queued = generationQueue.first;
          if (queued.quotePending) {
            status = _rt('status.waitingQueueQuote');
            notifyListeners();
            await Future<void>.delayed(const Duration(milliseconds: 50));
            continue;
          }
          final job = generationQueue.removeAt(0);
          taskParams = job.params.copy();
          taskExtras = job.extras.copy();
          taskHistoryGroupId = job.historyGroupId;
          taskQuote = job.quotedAnlas;
        }

        _activeTaskQuote = taskQuote;
        taskParams
          ..positivePrompt = expandPromptWildcards(taskParams.positivePrompt)
          ..negativePrompt = expandPromptWildcards(taskParams.negativePrompt);
        final currentNumber = completed + failed + 1;
        status = _rf('status.generatingImage', {
          'current': currentNumber,
          'total': queueProgress?.total ?? initialTotal,
          'queued': generationQueue.length,
        });
        notifyListeners();
        unawaited(BackgroundQueueService.update(
          title: _rt('notification.imageQueueTitle'),
          text: _rf('notification.generating', {
            'current': currentNumber,
            'total': queueProgress?.total ?? initialTotal,
          }),
        ));
        try {
          _clearGenerationPreview(notify: false);
          final (images, seed) = await api.generate(
            token,
            settings,
            taskParams,
            taskExtras,
            onPreview:
                settings.streamPreviewEnabled ? _handleGenerationPreview : null,
          );
          if (images.isEmpty) throw Exception(_rt('error.apiNoImages'));
          final items = <HistoryItem>[];
          for (final bytes in images) {
            items.add(await storage.saveImage(
              bytes,
              taskParams,
              seed,
              feature: 't2i',
              groupId: taskHistoryGroupId.ifEmptyNull,
            ));
          }
          status = _rt('status.savingImage');
          notifyListeners();
          await _commitCompletedHistory(items);
          _clearGenerationPreview(notify: false);
          completed += items.length;
          // The images are already saved at this point — a balance-refresh
          // hiccup here must not flip an already-successful item to failed.
          try {
            account = await _fetchAccountPreservingLast(token);
          } catch (_) {
            /* balance will catch up on the next natural refresh */
          }
        } on GenerationCancelledException {
          _cancelGenerationRequested = true;
        } catch (error) {
          failed++;
          lastError = error.toString().replaceFirst('Exception: ', '');
          final statusCode =
              error is NaiHttpException ? error.statusCode : null;
          final authFailure = statusCode == 401 ||
              statusCode == 403 ||
              lastError.contains('401') ||
              lastError.toLowerCase().contains('unauthorized');
          if (authFailure) {
            _cancelGenerationRequested = true;
            generationQueue.clear();
            skipInitial = true;
          } else if (statusCode == 400 || statusCode == 422) {
            // Every remaining item in the initial batch has the same request
            // shape, so repeating a rejected payload only produces more noise.
            skipInitial = true;
          }
        } finally {
          queueReservedAnlas = max(0, queueReservedAnlas - taskQuote);
          _activeTaskQuote = 0;
          queueProgress = (queueProgress ?? const GenerationQueueProgress())
              .copyWith(done: completed, failed: failed);
          notifyListeners();
        }
      }

      try {
        account = await _fetchAccountPreservingLast(token);
      } catch (_) {
        // Generated files are already on disk; keep the completion result and
        // let the next natural refresh update the balance.
      }
      final after = account.anlasBalance;
      lastAnlasSpent = anlasBefore != null && after != null
          ? max(0, anlasBefore - after)
          : null;
      final spentText = _spentText(lastAnlasSpent);
      if (_cancelGenerationRequested) {
        status = _rf('status.generationCancelled', {'spent': spentText});
      } else if (failed > 0) {
        status = _rf('status.generationFailedSome', {
          'completed': completed,
          'failed': failed,
          'spent': spentText,
          'error': lastError,
        });
      } else {
        status = _rf('status.generationDone', {
          'completed': completed,
          'spent': spentText,
        });
      }
    } catch (error) {
      status = error.toString().replaceFirst('Exception: ', '');
    } finally {
      _clearGenerationPreview(notify: false);
      busy = false;
      generationQueueRunning = false;
      queuePaused = false;
      queueAdding = false;
      clearQueueRequested = false;
      generationQueue = [];
      queueReservedAnlas = 0;
      _activeTaskQuote = 0;
      notifyListeners();
      _scheduleGenerationQuote();
      await BackgroundQueueService.stop('main-generation');
    }
  }

  Future<void> enqueueGeneration() async {
    if (!generationQueueRunning || !busy || queueAdding) return;
    if (params.positivePrompt.trim().isEmpty) {
      status = _rt('status.enqueuePositiveRequired');
      notifyListeners();
      return;
    }
    final snapshot = params.copy();
    final snapshotExtras = extras.copy();
    final jobId = DateTime.now().microsecondsSinceEpoch.toString();
    final pendingJob = GenerationQueueJob(
      id: jobId,
      params: snapshot,
      extras: snapshotExtras,
      quotedAnlas: 0,
      quotePending: true,
      historyGroupId: generationGroupId,
      addedAt: DateTime.now(),
    );
    queueAdding = true;
    generationQueue.add(pendingJob);
    queueProgress = (queueProgress ?? const GenerationQueueProgress())
        .copyWith(total: (queueProgress?.total ?? 0) + 1);
    status = _rt('status.waitingQueueQuote');
    notifyListeners();
    try {
      final token = await storage.getToken();
      if (token == null || token.isEmpty) {
        throw Exception(_rt('error.tokenRequired'));
      }
      final freshAccount = await _fetchAccountPreservingLast(token);
      account = freshAccount;
      final quote = await _quoteFor(
        token,
        snapshot,
        snapshotExtras,
        1,
        freshAccount,
      );
      if (!generationQueueRunning ||
          _cancelGenerationRequested ||
          !generationQueue.any((job) => job.id == jobId)) {
        return;
      }
      var quotedAnlas = 0;
      var quoteWarning = '';
      if (!quote.ok || quote.amount == null) {
        quoteWarning = quote.message;
      } else {
        quotedAnlas = quote.amount!;
      }
      final balance = quote.balance ?? freshAccount.anlasBalance;
      if (balance != null && queueReservedAnlas + quotedAnlas > balance) {
        quoteWarning = _rf('status.queueReserveExceeded', {
          'reserved': queueReservedAnlas,
          'balance': balance,
        });
      }
      final index = generationQueue.indexWhere((job) => job.id == jobId);
      if (index < 0) return;
      generationQueue[index]
        ..quotedAnlas = quotedAnlas
        ..quotePending = false;
      queueReservedAnlas += quotedAnlas;
      status = quoteWarning.isNotEmpty
          ? quoteWarning
          : _rf('status.queueAdded', {
              'count': generationQueue.length,
              'amount': quotedAnlas,
            });
    } catch (error) {
      final index = generationQueue.indexWhere((job) => job.id == jobId);
      if (index >= 0) {
        generationQueue.removeAt(index);
        final progress = queueProgress;
        if (progress != null) {
          queueProgress = progress.copyWith(
            total: max(progress.done + progress.failed, progress.total - 1),
          );
        }
      }
      status = _rf('status.queueAddFailed',
          {'error': error.toString().replaceFirst('Exception: ', '')});
    } finally {
      queueAdding = false;
      notifyListeners();
    }
  }

  void removeQueueJob(String id) {
    final index = generationQueue.indexWhere((job) => job.id == id);
    if (index < 0) return;
    final removed = generationQueue.removeAt(index);
    queueReservedAnlas = max(0, queueReservedAnlas - removed.quotedAnlas);
    final progress = queueProgress;
    if (progress != null) {
      queueProgress = progress.copyWith(
        total: max(progress.done + progress.failed, progress.total - 1),
      );
    }
    status = _rt('status.queueRemoved');
    notifyListeners();
  }

  void clearPendingGenerationQueue() {
    generationQueue.clear();
    queueAdding = false;
    clearQueueRequested = generationQueueRunning;
    queueReservedAnlas = _activeTaskQuote;
    final progress = queueProgress;
    if (progress != null) {
      queueProgress = progress.copyWith(
        total: progress.done + progress.failed + (_activeTaskQuote > 0 ? 1 : 0),
      );
    }
    status = generationQueueRunning
        ? _rt('status.pendingClearedStop')
        : _rt('status.queueCleared');
    notifyListeners();
  }

  void toggleQueuePause() {
    if (!generationQueueRunning) return;
    queuePaused = !queuePaused;
    status = queuePaused
        ? _rt('status.pauseAfterCurrent')
        : _rt('status.queueResumed');
    notifyListeners();
  }

  void toggleQueueCollapsed() {
    queueCollapsed = !queueCollapsed;
    notifyListeners();
  }

  void cancelGeneration() {
    if (!generationQueueRunning) return;
    _cancelGenerationRequested = true;
    generationQueue.clear();
    queueReservedAnlas = 0;
    api.cancelActiveGeneration();
    status = _rt('status.cancellingQueue');
    notifyListeners();
  }

  void _handleGenerationPreview(NaiGenerationPreview preview) {
    if (!generationQueueRunning || _cancelGenerationRequested) return;
    generationPreview = preview.image;
    generationPreviewProgress = preview.progress.clamp(0, 1).toDouble();
    generationPreviewStep = preview.currentStep;
    generationPreviewTotalSteps = preview.totalSteps;
    notifyListeners();
  }

  void _clearGenerationPreview({bool notify = true}) {
    generationPreview = null;
    generationPreviewProgress = 0;
    generationPreviewStep = 0;
    generationPreviewTotalSteps = 0;
    if (notify) notifyListeners();
  }

  Future<void> generateI2I() async {
    if (busy) return;
    await _withTokenRun((token) async {
      if (params.positivePrompt.trim().isEmpty) {
        throw Exception(_rt('error.positiveRequired'));
      }
      final referenceError = _referenceValidationError();
      if (referenceError != null) throw Exception(referenceError);
      final source = i2iSourceMode == 'original'
          ? (i2iOriginalImage ?? workbenchImage)
          : workbenchImage;
      if (source == null) throw Exception(_rt('error.workbenchRequired'));
      final image = await File(source.filePath).readAsBytes();
      final total = batchCount.clamp(1, 999);
      final initialBatchIntervalSeconds =
          total > 1 ? normalizeBatchIntervalSeconds(batchIntervalSeconds) : 0;
      final initialParams = params.copy();
      final initialExtras = extras.copy();
      final initialSeed = initialParams.seed;
      if (i2iSizeMode == 'adaptive') {
        final size = i2iOutputSize;
        initialParams
          ..width = size.$1
          ..height = size.$2;
      }
      final before = await _authorizeQuotedRun(
        token,
        (fresh) => calculateImageGenerationAnlas(
          params: initialParams,
          account: fresh,
          extras: initialExtras,
          batchCount: total,
          imageToImage: true,
          strength: i2i.strength,
          alreadyEncodedVibes:
              api.countCachedVibes(initialParams.model, initialExtras),
          preciseReferenceCount: initialExtras.preciseReferences.length,
          language: settings.language,
        ),
      );
      final quote = calculateImageGenerationAnlas(
        params: initialParams,
        account: account,
        extras: initialExtras,
        batchCount: total,
        imageToImage: true,
        strength: i2i.strength,
        alreadyEncodedVibes:
            api.countCachedVibes(initialParams.model, initialExtras),
        preciseReferenceCount: initialExtras.preciseReferences.length,
        language: settings.language,
      );
      generationQueueRunning = true;
      queuePaused = false;
      queueAdding = false;
      clearQueueRequested = false;
      _cancelGenerationRequested = false;
      generationQueue = [];
      queueProgress = GenerationQueueProgress(total: total);
      queueReservedAnlas = quote.amount ?? 0;
      status = _rf('status.i2iRunning', {'amount': quote.amount});
      notifyListeners();
      try {
        await BackgroundQueueService.start(
          'i2i-generation',
          title: _rt('notification.imageQueueTitle'),
          text: _rf('notification.prepare', {'total': total}),
        );
      } catch (_) {
        // Notification permission or OEM restrictions must not block generation.
      }

      var completed = 0;
      var failed = 0;
      var lastError = '';
      try {
        for (var index = 0;
            index < total && !_cancelGenerationRequested;
            index++) {
          while (queuePaused && !_cancelGenerationRequested) {
            status = _rf('status.queuePaused', {
              'done': completed + failed,
              'total': total,
            });
            notifyListeners();
            await Future<void>.delayed(const Duration(milliseconds: 250));
          }
          if (_cancelGenerationRequested) break;
          if (index > 0 && initialBatchIntervalSeconds > 0) {
            status = _rf('status.batchInterval', {
              'seconds': initialBatchIntervalSeconds,
              'current': index + 1,
              'total': total,
            });
            notifyListeners();
            final shouldContinue = await waitForBatchInterval(
              initialBatchIntervalSeconds,
              () => !_cancelGenerationRequested,
            );
            if (!shouldContinue) break;
            while (queuePaused && !_cancelGenerationRequested) {
              status = _rf('status.queuePaused', {
                'done': completed + failed,
                'total': total,
              });
              notifyListeners();
              await Future<void>.delayed(const Duration(milliseconds: 250));
            }
            if (_cancelGenerationRequested) break;
          }

          final taskParams = initialParams.copy();
          if (initialParams.seedMode != 'random' && initialSeed > 0) {
            taskParams.seed = ((initialSeed - 1 + index) % 4294967295) + 1;
          }
          taskParams
            ..positivePrompt =
                expandPromptWildcards(initialParams.positivePrompt)
            ..negativePrompt =
                expandPromptWildcards(initialParams.negativePrompt);
          final currentNumber = completed + failed + 1;
          status = _rf('status.generatingImage', {
            'current': currentNumber,
            'total': total,
            'queued': max(0, total - currentNumber),
          });
          notifyListeners();
          unawaited(BackgroundQueueService.update(
            title: _rt('notification.imageQueueTitle'),
            text: _rf('notification.generating', {
              'current': currentNumber,
              'total': total,
            }),
          ));
          try {
            final (images, seed) = await api.img2img(
                token, settings, taskParams, initialExtras.copy(), image, i2i);
            if (images.isEmpty) throw Exception(_rt('error.i2iNoImages'));
            final items = <HistoryItem>[];
            for (final bytes in images) {
              items.add(await storage.saveImage(bytes, taskParams, seed,
                  feature: 'i2i', groupId: generationGroupId.ifEmptyNull));
            }
            comparisonBefore = source;
            comparisonAfter = WorkingImage(
              filePath: items.first.filePath,
              width: items.first.width,
              height: items.first.height,
            );
            await _commitCompletedHistory(items,
                useAsWorkbench: i2iSourceMode == 'latest');
            completed += items.length;
          } on GenerationCancelledException {
            _cancelGenerationRequested = true;
          } catch (error) {
            failed++;
            lastError = error.toString().replaceFirst('Exception: ', '');
            final statusCode =
                error is NaiHttpException ? error.statusCode : null;
            if (statusCode == 400 ||
                statusCode == 401 ||
                statusCode == 403 ||
                statusCode == 422) {
              _cancelGenerationRequested = true;
            }
          } finally {
            queueProgress =
                (queueProgress ?? GenerationQueueProgress(total: total))
                    .copyWith(done: completed, failed: failed);
            notifyListeners();
          }
        }

        final spent = await _finishQuotedRun(token, before);
        if (_cancelGenerationRequested && failed == 0) {
          status = _rf('status.generationCancelled', {'spent': spent});
        } else if (failed > 0) {
          status = _rf('status.generationFailedSome', {
            'completed': completed,
            'failed': failed,
            'spent': spent,
            'error': lastError,
          });
        } else {
          status = _rf('status.generationDone', {
            'completed': completed,
            'spent': spent,
          });
        }
      } finally {
        generationQueueRunning = false;
        queuePaused = false;
        queueAdding = false;
        clearQueueRequested = false;
        generationQueue = [];
        queueReservedAnlas = 0;
        notifyListeners();
        await BackgroundQueueService.stop('i2i-generation');
      }
    });
  }

  Future<void> enhance() async {
    if (busy || workbenchImage == null) return;
    final source = workbenchImage!;
    final requestedTarget = resolveNaiEnhanceOutputSize(
      source.width,
      source.height,
      enhanceScale.clamp(1, 2),
      fallbackWidth: source.width,
      fallbackHeight: source.height,
    );
    if (enhanceScale > 1 && requestedTarget.exceedsLimit) {
      status = _rf('status.enhanceOutputTooLarge', {
        'width': requestedTarget.width,
        'height': requestedTarget.height,
        'pixels': requestedTarget.width * requestedTarget.height,
        'max': naiMaxPixelArea,
      });
      notifyListeners();
      return;
    }
    final previousWidth = params.width;
    final previousHeight = params.height;
    final previousStrength = i2i.strength;
    final previousNoise = i2i.noise;
    final previousSizeMode = i2iSizeMode;
    final target = adaptiveNaiImageSize(
      source.width * enhanceScale.clamp(1, 2),
      source.height * enhanceScale.clamp(1, 2),
      fallbackWidth: source.width,
      fallbackHeight: source.height,
    );
    params
      ..width = target.$1
      ..height = target.$2;
    i2iSizeMode = 'custom';
    i2i
      ..strength = min(0.82, 0.18 + enhanceMagnitude.clamp(1, 10) * 0.064)
      ..noise = min(0.5, enhanceMagnitude.clamp(1, 10) * 0.045);
    notifyListeners();
    try {
      await generateI2I();
    } finally {
      params
        ..width = previousWidth
        ..height = previousHeight;
      i2i
        ..strength = previousStrength
        ..noise = previousNoise;
      i2iSizeMode = previousSizeMode;
      notifyListeners();
      _scheduleGenerationQuote();
    }
  }

  Future<void> inpaint(Uint8List maskBytes) async {
    await _withTokenRun((token) async {
      final source = inpaintSourceMode == 'original'
          ? (i2iOriginalImage ?? workbenchImage)
          : workbenchImage;
      if (source == null) throw Exception(_rt('error.originalImageRequired'));
      final image = await File(source.filePath).readAsBytes();
      final dims = source;
      final targetWidth = max(64, (dims.width / 64).ceil() * 64);
      final targetHeight = max(64, (dims.height / 64).ceil() * 64);
      // Inpaint keeps its own independent positive prompt
      // (inpaintPositivePrompt) instead of reusing params.positivePrompt —
      // the rest of params (size, sampler, negative prompt, etc.) is still
      // shared with the main generate/i2i params.
      final taskParams = params.copy()
        ..positivePrompt = expandPromptWildcards(inpaintPositivePrompt)
        ..negativePrompt = expandPromptWildcards(params.negativePrompt)
        ..width = targetWidth
        ..height = targetHeight;
      final before = await _authorizeQuotedRun(
        token,
        (fresh) => calculateInpaintAnlas(
          params: taskParams,
          account: fresh,
          image: dims,
          inpaintModel: inpaintModel,
          strength: inpaintStrength,
          language: settings.language,
        ),
      );
      status =
          _rf('status.inpaintRunning', {'amount': inpaintAnlasQuote.amount});
      notifyListeners();
      final (images, seed, usedModel) = await api.inpaint(
          token,
          settings,
          taskParams,
          image,
          maskBytes,
          inpaintModel,
          dims.width,
          dims.height,
          inpaintStrength,
          0);
      if (images.isEmpty) throw Exception(_rt('error.inpaintNoImages'));
      final items = <HistoryItem>[];
      for (final bytes in images) {
        items.add(await storage.saveImage(bytes, taskParams, seed,
            feature: 'inpaint',
            model: usedModel,
            width: targetWidth,
            height: targetHeight,
            groupId: generationGroupId.ifEmptyNull));
      }
      comparisonBefore = source;
      comparisonAfter = WorkingImage(
        filePath: items.first.filePath,
        width: targetWidth,
        height: targetHeight,
      );
      await _commitCompletedHistory(items,
          useAsWorkbench: inpaintSourceMode == 'latest');
      final fallbackNote = usedModel == inpaintModel
          ? ''
          : _rf('status.inpaintFallback', {'model': usedModel});
      status = _rf('status.inpaintDone', {
        'note': fallbackNote,
        'spent': await _finishQuotedRun(token, before),
      });
    });
  }

  Future<void> upscale() async {
    await _withTokenRun((token) async {
      final image = await _workbenchBytes();
      final dims = workbenchImage;
      if (dims == null) throw Exception(_rt('error.imageRequired'));
      final prepared = prepareImageWithinPixels(image);
      final outputSize = resolveUpscaleOutputSize(
          prepared.width, prepared.height, upscaleScale);
      if (outputSize.exceedsLimit) {
        throw Exception(_rf('status.upscaleOutputTooLarge', {
          'width': outputSize.width,
          'height': outputSize.height,
          'max': maxNaiUpscaleOutputDimension,
        }));
      }
      final before = await _authorizeQuotedRun(
        token,
        (fresh) => calculateUpscaleAnlas(
          image: dims,
          account: fresh,
          scale: upscaleScale,
          language: settings.language,
        ),
      );
      status = prepared.resized
          ? _rf('status.upscalePreparedRunning', {
              'width': prepared.width,
              'height': prepared.height,
              'scale': upscaleScale,
            })
          : _rf('status.upscaleRunning', {'scale': upscaleScale});
      notifyListeners();
      final bytes = await api.upscale(
          token, settings, prepared.bytes, upscaleScale, params.model);
      final item = await storage.saveImage(bytes, params, 0,
          feature: 'upscale',
          model: 'upscale',
          width: prepared.width * upscaleScale,
          height: prepared.height * upscaleScale,
          groupId: generationGroupId.ifEmptyNull);
      await _commitCompletedHistory([item], useAsWorkbench: true);
      status = _rf('status.upscaleDone',
          {'spent': await _finishQuotedRun(token, before)});
    });
  }

  Future<void> augment() async {
    await _withTokenRun((token) async {
      final image = await _workbenchBytes();
      final dims = workbenchImage;
      if (dims == null) throw Exception(_rt('error.imageRequired'));
      final prepared = prepareDirectorImage(image);
      final before = await _authorizeQuotedRun(
        token,
        (fresh) => calculateDirectorAnlas(
          tool: directorTool,
          account: fresh,
          language: settings.language,
        ),
      );
      status = prepared.resized
          ? _rf('status.directorPreparedRunning', {
              'width': prepared.width,
              'height': prepared.height,
            })
          : _rf(
              'status.directorRunning', {'amount': directorAnlasQuote.amount});
      notifyListeners();
      final images = await api.augment(
        token,
        settings,
        prepared.bytes,
        prepared.width,
        prepared.height,
        directorTool,
        augmentOptions,
      );
      if (images.isEmpty) throw Exception(_rt('error.directorNoImages'));
      final items = <HistoryItem>[];
      for (final bytes in images) {
        final restored = prepared.resized
            ? resizeImageToSize(
                bytes,
                prepared.originalWidth,
                prepared.originalHeight,
              )
            : bytes;
        items.add(await storage.saveImage(restored, params, 0,
            feature: 'director-$directorTool',
            model: 'director-$directorTool',
            width: prepared.originalWidth,
            height: prepared.originalHeight,
            groupId: generationGroupId.ifEmptyNull));
      }
      await _commitCompletedHistory(items, useAsWorkbench: true);
      final resizeNote = prepared.resized
          ? _rf('status.directorRestoreNote', {
              'width': prepared.originalWidth,
              'height': prepared.originalHeight,
            })
          : '';
      status = _rf('status.directorDone', {
        'note': resizeNote,
        'spent': await _finishQuotedRun(token, before),
      });
    });
  }

  // Concurrent — every call fires its API request immediately and updates
  // only its own job entry when it resolves, so multiple reverse requests
  // can be in flight (the button never disables while one runs), and a
  // foreground service keeps this specific request alive if the app is
  // backgrounded mid-request.
  Future<void> reversePrompt() async {
    final image = await _workbenchBytes();
    final sourcePath = workbenchImage?.filePath;
    final key = await storage.getVisionKey() ?? '';
    final job = TextToolJob(
      id: '${DateTime.now().microsecondsSinceEpoch}',
      label: reverseHint.trim().isNotEmpty
          ? reverseHint.trim()
          : _rt('job.reverseLabel'),
      mode: reverseMode,
      knownCharacter: reverseKnownCharacter,
      status: TextToolJobStatus.processing,
      addedAt: DateTime.now(),
    );
    final owner = 'reverse-${job.id}';
    reverseJobs = [job, ...reverseJobs];
    reverseCodexMatches = [];
    notifyListeners();
    try {
      await BackgroundQueueService.start(
        owner,
        title: _rt('notification.reverseTitle'),
        text: _rt('notification.textToolRunning'),
      );
    } catch (_) {
      // Notification permission or OEM restrictions must not block the request.
    }
    final res = await api.reversePrompt(
      settings: settings,
      apiKey: key,
      image: image,
      mode: reverseMode,
      scope: reverseScope,
      hint: reverseHint,
      knownCharacter: reverseKnownCharacter,
      systemTemplate: resolvedPromptTemplate('reverse', reverseMode,
          scoped: reverseScope != ReversePromptScope.full),
      templateVersion: settings.reversePromptTemplateVersion,
    );
    await BackgroundQueueService.stop(owner);
    // "Cancel" just removes the job from the tracker (the in-flight HTTP
    // request itself isn't aborted) — but once it resolves, treat a removed
    // job as truly cancelled: no result overwrite, no toast, no history entry.
    if (!reverseJobs.any((j) => j.id == job.id)) return;
    if (res.ok) {
      job.status = TextToolJobStatus.done;
      job.result = res.text;
      job.variants = res.variants;
      job.codexMatches = res.codexMatches;
      reverseResult = res.text;
      reversePromptVariants = res.variants;
      reverseCodexMatches = res.codexMatches;
      status = _rt('status.reverseDone');
      final historyItem = TextToolHistoryItem(
        id: job.id,
        mode: reverseMode,
        knownCharacter: reverseKnownCharacter,
        input: reverseHint,
        sourceImagePath: sourcePath,
        result: res.text,
        variants: res.variants,
        codexMatches: res.codexMatches,
        createdAt: DateTime.now().toIso8601String(),
      );
      reverseHistory = [historyItem, ...reverseHistory];
      unawaited(storage.setReverseHistory(reverseHistory));
      Timer(_textToolDoneAutoDismiss, () => removeReverseJob(job.id));
    } else {
      job.status = TextToolJobStatus.failed;
      job.message = res.message;
      status = res.message;
    }
    notifyListeners();
  }

  // Concurrent, same reasoning as reversePrompt.
  Future<void> convertPrompt() async {
    final key = await storage.getConvertKey() ?? '';
    final job = TextToolJob(
      id: '${DateTime.now().microsecondsSinceEpoch}',
      label: convertInput.trim().length > 60
          ? convertInput.trim().substring(0, 60)
          : convertInput.trim(),
      mode: convertMode,
      knownCharacter: convertKnownCharacter,
      status: TextToolJobStatus.processing,
      addedAt: DateTime.now(),
    );
    final owner = 'convert-${job.id}';
    convertJobs = [job, ...convertJobs];
    convertCodexMatches = [];
    notifyListeners();
    try {
      await BackgroundQueueService.start(
        owner,
        title: _rt('notification.convertTitle'),
        text: _rt('notification.textToolRunning'),
      );
    } catch (_) {
      // Notification permission or OEM restrictions must not block the request.
    }
    final res = await api.convertPrompt(
      settings: settings,
      apiKey: key,
      text: convertInput,
      mode: convertMode,
      knownCharacter: convertKnownCharacter,
      systemTemplate: resolvedPromptTemplate('convert', convertMode),
    );
    await BackgroundQueueService.stop(owner);
    // See reversePrompt: a removed job is treated as cancelled.
    if (!convertJobs.any((j) => j.id == job.id)) return;
    if (res.ok) {
      job.status = TextToolJobStatus.done;
      job.result = res.text;
      job.variants = res.variants;
      job.codexMatches = res.codexMatches;
      convertResult = res.text;
      convertResultVariants = res.variants;
      convertCodexMatches = res.codexMatches;
      status = _rt('status.convertDone');
      final historyItem = TextToolHistoryItem(
        id: job.id,
        mode: convertMode,
        knownCharacter: convertKnownCharacter,
        input: convertInput,
        result: res.text,
        variants: res.variants,
        codexMatches: res.codexMatches,
        createdAt: DateTime.now().toIso8601String(),
      );
      convertHistory = [historyItem, ...convertHistory];
      unawaited(storage.setConvertHistory(convertHistory));
      Timer(_textToolDoneAutoDismiss, () => removeConvertJob(job.id));
    } else {
      job.status = TextToolJobStatus.failed;
      job.message = res.message;
      status = res.message;
    }
    notifyListeners();
  }

  void toggleReverseQueueCollapsed() {
    reverseQueueCollapsed = !reverseQueueCollapsed;
    notifyListeners();
  }

  void removeReverseJob(String id) {
    reverseJobs = reverseJobs.where((j) => j.id != id).toList();
    notifyListeners();
  }

  Future<void> deleteReverseHistoryItem(String id) async {
    reverseHistory = reverseHistory.where((item) => item.id != id).toList();
    notifyListeners();
    await storage.setReverseHistory(reverseHistory);
  }

  Future<void> clearReverseHistory() async {
    reverseHistory = [];
    notifyListeners();
    await storage.setReverseHistory(reverseHistory);
  }

  /// Same lazy-cleanup precedent as dropMissingImage: called when the
  /// reverse history list renders, drops any record whose source image file
  /// is gone. No-op for records with no tracked source path.
  Future<void> pruneMissingReverseHistory() async {
    final survivors = <TextToolHistoryItem>[];
    var changed = false;
    for (final item in reverseHistory) {
      final path = item.sourceImagePath;
      if (path != null && path.isNotEmpty && !File(path).existsSync()) {
        changed = true;
        continue;
      }
      survivors.add(item);
    }
    if (!changed) return;
    reverseHistory = survivors;
    notifyListeners();
    await storage.setReverseHistory(reverseHistory);
  }

  void toggleConvertQueueCollapsed() {
    convertQueueCollapsed = !convertQueueCollapsed;
    notifyListeners();
  }

  void removeConvertJob(String id) {
    convertJobs = convertJobs.where((j) => j.id != id).toList();
    notifyListeners();
  }

  Future<void> deleteConvertHistoryItem(String id) async {
    convertHistory = convertHistory.where((item) => item.id != id).toList();
    notifyListeners();
    await storage.setConvertHistory(convertHistory);
  }

  Future<void> clearConvertHistory() async {
    convertHistory = [];
    notifyListeners();
    await storage.setConvertHistory(convertHistory);
  }

  void applyPrompt(String prompt) {
    setParam((p) => p.positivePrompt = prompt);
    status = _rt('status.promptApplied');
    notifyListeners();
  }

  String? _referenceValidationError() {
    if (extras.vibeImages.isNotEmpty && !params.supportsVibeTransfer) {
      return _rt('error.vibeUnsupportedV5');
    }
    if (extras.preciseReferences.isNotEmpty &&
        !params.supportsPreciseReference) {
      return _rt('error.preciseV45OnlyPeriod');
    }
    return null;
  }

  String resolvedPromptTemplate(
    String kind,
    ReversePromptMode mode, {
    bool scoped = false,
  }) {
    final key = mode.value;
    if (kind == 'reverse') {
      if (settings.reversePromptTemplateVersion == 'v5') {
        final override = settings.reversePromptTemplates[key]?.trim() ?? '';
        if (override.isNotEmpty) return override;
      }
      return promptTemplates.getReverse(
        mode,
        scoped: scoped,
        templateVersion: settings.reversePromptTemplateVersion,
      );
    }
    if (kind == 'convert') {
      final override = settings.convertPromptTemplates[key]?.trim() ?? '';
      if (override.isNotEmpty) return override;
      return promptTemplates.get('convert', mode);
    }
    if (kind == 'comic') {
      final override = settings.comicPromptTemplate.trim();
      return override.isNotEmpty
          ? override
          : promptTemplates.get('comic', mode);
    }
    return '';
  }

  Future<void> setPromptTemplate(
    String kind,
    ReversePromptMode mode,
    String value,
  ) async {
    final key = mode.value;
    await setSettings((settings) {
      if (kind == 'reverse') settings.reversePromptTemplates[key] = value;
      if (kind == 'convert') settings.convertPromptTemplates[key] = value;
      if (kind == 'comic') settings.comicPromptTemplate = value;
    });
  }

  Future<void> resetPromptTemplate(
    String kind,
    ReversePromptMode mode,
  ) async {
    final key = mode.value;
    await setSettings((settings) {
      if (kind == 'reverse') settings.reversePromptTemplates.remove(key);
      if (kind == 'convert') settings.convertPromptTemplates.remove(key);
      if (kind == 'comic') settings.comicPromptTemplate = '';
    });
  }

  Future<List<TagSuggestion>> suggestTags(String query) async {
    final raw = query.trim();
    if (raw.isEmpty) return [];
    final key = await storage.getTagKey() ?? '';
    final results = <TagSuggestion>[];
    final seen = <String>{};
    void merge(Iterable<TagSuggestion> items) {
      for (final item in items) {
        final norm = item.tag.trim().toLowerCase();
        if (norm.isEmpty || !seen.add(norm)) continue;
        results.add(item);
        if (results.length >= 12) break;
      }
    }

    // 0) Remote Tag / MCP service when the user enabled it for the capsule.
    if (settings.tagServerEnabled &&
        settings.mcpForCapsule &&
        settings.tagServerUrl.trim().isNotEmpty) {
      merge(await api.searchTags(settings, raw, 12,
          apiKey: key, fallbackLocal: false));
    }
    // 1) Full SQLite catalog shared with the desktop app. It becomes the local
    //    primary source only after the user explicitly installs it.
    merge(
        (await ResourceDatabaseService.shared.searchTagCatalog(raw, limit: 12))
            .map((item) => TagSuggestion(
                  tag: item.tag,
                  count: item.count,
                  description: item.description,
                )));
    // 2) Legacy Chinese-alias CSV remains a compatible secondary source.
    merge(
        (await offlineTags.search(raw, limit: 12)).map((item) => TagSuggestion(
              tag: item.tag,
              count: item.postCount,
              description: item.chinese.join(' '),
            )));
    // 3) Bundled capsule taxonomy — always available, so autocomplete works even
    //    before any download, for both Chinese and English input.
    if (results.length < 12) {
      merge((await searchCapsuleTags(raw, limit: 12)).map((tag) =>
          TagSuggestion(
              tag: tag.tag.replaceAll('_', ' '), description: tag.label)));
    }
    // 4) Tiny built-in fallback only if nothing matched anywhere.
    if (results.isEmpty) {
      merge(await api.searchTags(settings, raw, 12, apiKey: key));
    }
    return results;
  }

  Future<List<RelatedPromptTag>> suggestRelatedPromptTags(String prompt,
      {int limit = 8}) async {
    final present = splitPromptTags(prompt);
    if (present.isEmpty) return const [];
    final installed = await ResourceDatabaseService.shared.relatedTags(
      present,
      limit: limit,
    );
    if (installed.isNotEmpty) {
      return installed
          .map((item) => RelatedPromptTag(
                item.tag.replaceAll('_', ' '),
                item.count > 0 ? '${item.count}' : item.description,
              ))
          .toList();
    }
    return relatedPromptTags(prompt, limit: limit);
  }

  Future<String> testTagService() async {
    if (settings.tagServerUrl.trim().isEmpty) {
      return _rt('status.tagAddressRequired');
    }
    final key = await storage.getTagKey() ?? '';
    try {
      final tags = await api.searchTags(
        settings,
        'girl',
        5,
        apiKey: key,
        fallbackLocal: false,
        forceRemote: true,
      );
      final remoteLike = tags.isNotEmpty && tags.first.tag.isNotEmpty;
      final message = remoteLike
          ? _rf('status.tagAvailable', {'count': tags.length})
          : _rt('status.tagUnavailable');
      status = message;
      notifyListeners();
      return message;
    } catch (error) {
      final message = _rf('status.tagTestFailed', {'error': error});
      status = message;
      notifyListeners();
      return message;
    }
  }

  Future<void> downloadOfflineTags() async {
    if (offlineTagBusy) return;
    offlineTagBusy = true;
    status = _rt('status.downloadingTags');
    notifyListeners();
    try {
      status = await offlineTags.download(settings);
      offlineTagStatus = await offlineTags.status();
    } catch (error) {
      status = _rf('status.tagDownloadFailed',
          {'error': error.toString().replaceFirst('Exception: ', '')});
    } finally {
      offlineTagBusy = false;
      notifyListeners();
    }
  }

  Future<void> checkUpdate({bool manual = false}) async {
    if (updateChecking) return;
    updateChecking = true;
    if (manual) {
      status = _rt('status.updateChecking');
      notifyListeners();
    }
    updateInfo = await checkAppUpdate(settings);
    updateChecking = false;
    if (manual) {
      status = updateInfo?.error != null
          ? _rt('status.updateFailedShort')
          : updateInfo?.hasUpdate == true
              ? _rf(
                  'status.updateFound', {'version': updateInfo!.latestVersion})
              : _rt('status.updateLatest');
    }
    notifyListeners();
  }

  Future<List<String>> detectModels(String kind) async {
    if (kind == 'reverse') {
      return api.listModels(
          settings, settings.visionApiUrl, await storage.getVisionKey() ?? '');
    }
    return api.listModels(
        settings, settings.convertApiUrl, await storage.getConvertKey() ?? '');
  }

  List<AiCallLogEntry> get aiCallLog => api.aiCallLog;

  void clearAiCallLog() {
    api.clearAiCallLog();
    status = _rt('status.aiLogCleared');
    notifyListeners();
  }

  Future<String> testNetworkConnection() => testProxyConnection(settings);

  Future<void> createGroup(String name) async {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return;
    groups = [
      ...groups,
      HistoryGroup(
          id: DateTime.now().microsecondsSinceEpoch.toString(),
          name: trimmed,
          createdAt: DateTime.now().toIso8601String())
    ];
    await storage.writeGroups(groups);
    notifyListeners();
  }

  Future<void> deleteGroup(String id) async {
    groups = groups.where((g) => g.id != id).toList();
    history = history
        .map((h) => h.groupId == id
            ? HistoryItem.fromJson({...h.toJson(), 'groupId': null})
            : h)
        .toList();
    await storage.writeGroups(groups);
    await storage.writeHistory(history);
    if (selectedGroupId == id) {
      selectedGroupId = '';
      settings.activeHistoryGroupId = '';
      await storage.setSettings(settings);
    }
    if (generationGroupId == id) {
      generationGroupId = '';
      settings.generationGroupId = '';
      await storage.setSettings(settings);
    }
    notifyListeners();
  }

  Future<void> renameGroup(String id, String name) async {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return;
    groups = groups
        .map((group) => group.id == id
            ? HistoryGroup(
                id: group.id,
                name: trimmed,
                createdAt: group.createdAt,
              )
            : group)
        .toList();
    await storage.writeGroups(groups);
    notifyListeners();
  }

  Future<String> ensureHistoryGroup(String title, [String? preferredId]) async {
    if (preferredId != null && groups.any((group) => group.id == preferredId)) {
      return preferredId;
    }
    final normalized =
        title.trim().isEmpty ? _rt('comic.defaultTitle') : title.trim();
    for (final group in groups) {
      if (group.name == normalized) return group.id;
    }
    final group = HistoryGroup(
      id: DateTime.now().microsecondsSinceEpoch.toString(),
      name: normalized,
      createdAt: DateTime.now().toIso8601String(),
    );
    groups = [...groups, group];
    await storage.writeGroups(groups);
    notifyListeners();
    return group.id;
  }

  Future<HistoryItem> generateComicPanel({
    required GenerateParams panelParams,
    required GenerateExtras panelExtras,
    required String projectTitle,
    String? historyGroupId,
  }) async {
    final token = await storage.getToken();
    if (token == null || token.isEmpty) {
      throw Exception(_rt('error.naiTokenRequired'));
    }
    final taskParams = panelParams.normalized();
    account = await _fetchAccountPreservingLast(token);
    final quote = calculateImageGenerationAnlas(
      params: taskParams,
      account: account,
      extras: panelExtras,
      alreadyEncodedVibes: api.countCachedVibes(taskParams.model, panelExtras),
      preciseReferenceCount: panelExtras.preciseReferences.length,
      language: settings.language,
    );
    if (quote.insufficient) {
      status = _rf('status.insufficientPanel', {
        'amount': quote.amount,
        'balance': quote.balance ?? _unknown(),
      });
      notifyListeners();
    }
    final groupId = await ensureHistoryGroup(projectTitle, historyGroupId);
    final before = account.anlasBalance;
    final extrasToUse = panelExtras.copy();
    late List<Uint8List> images;
    late int seed;
    (images, seed) = await api.generate(
      token,
      settings,
      taskParams,
      extrasToUse,
    );
    if (images.isEmpty) throw Exception(_rt('error.noImagesReturned'));
    final item = await storage.saveImage(
      images.first,
      taskParams,
      seed,
      feature: 'comic',
      groupId: groupId,
    );
    await _commitCompletedHistory([item]);
    // The panel image is already saved at this point — a balance-refresh hiccup
    // here must not make the caller (comic_controller's generateOne) report an
    // already-successful panel as failed.
    try {
      account = await _fetchAccountPreservingLast(token);
      final after = account.anlasBalance;
      lastAnlasSpent =
          before != null && after != null ? max(0, before - after) : null;
    } catch (_) {
      /* balance will catch up on the next natural refresh */
    }
    notifyListeners();
    return item;
  }

  Future<HistoryItem> generateArtistLabTemporary({
    required GenerateParams panelParams,
    required GenerateExtras panelExtras,
  }) async {
    final token = await storage.getToken();
    if (token == null || token.isEmpty) {
      throw Exception(_rt('error.naiTokenRequired'));
    }
    final taskParams = panelParams.normalized();
    final before = account.anlasBalance;
    final (images, seed) =
        await api.generate(token, settings, taskParams, panelExtras);
    if (images.isEmpty) throw Exception(_rt('error.noImagesReturned'));
    final item = await storage.saveArtistLabTemporaryImage(
        images.first, taskParams, seed);
    await _preloadCompletedItems([item]);
    try {
      account = await _fetchAccountPreservingLast(token);
      final after = account.anlasBalance;
      lastAnlasSpent =
          before != null && after != null ? max(0, before - after) : null;
      notifyListeners();
    } catch (_) {}
    return item;
  }

  Future<HistoryItem> saveArtistLabFavorite(HistoryItem temporary) async {
    final bytes = await File(temporary.filePath).readAsBytes();
    final groupId = await ensureHistoryGroup('画风实验室-随机抽卡');
    final params = GenerateParams.fromJson(temporary.params);
    final item = await storage.saveImage(
      bytes,
      params,
      temporary.seed,
      feature: 'artist-lab',
      model: temporary.model,
      width: temporary.width,
      height: temporary.height,
      groupId: groupId,
    );
    await storage.deleteArtistLabTemporaryImage(temporary.filePath);
    await _commitCompletedHistory([item]);
    return item;
  }

  Future<void> deleteArtistLabTemporary(HistoryItem temporary) =>
      storage.deleteArtistLabTemporaryImage(temporary.filePath);

  Future<HistoryItem> generateBatchRedrawItem({
    required Uint8List sourceBytes,
    required GenerateParams itemParams,
    required GenerateExtras itemExtras,
    required double strength,
    required String groupName,
    String? historyGroupId,
    bool Function()? cancelled,
  }) async {
    void throwIfCancelled() {
      if (cancelled?.call() == true) {
        throw const GenerationCancelledException();
      }
    }

    throwIfCancelled();
    final token = await storage.getToken();
    throwIfCancelled();
    if (token == null || token.isEmpty) {
      throw Exception(_rt('error.naiTokenRequired'));
    }
    final taskParams = itemParams.copy()
      ..positivePrompt = expandPromptWildcards(itemParams.positivePrompt)
      ..negativePrompt = expandPromptWildcards(itemParams.negativePrompt);
    if (itemExtras.vibeImages.isNotEmpty && !taskParams.supportsVibeTransfer) {
      throw Exception(_rt('error.vibeUnsupportedV5'));
    }
    if (itemExtras.preciseReferences.isNotEmpty &&
        !taskParams.supportsPreciseReference) {
      throw Exception(_rt('error.preciseV45Only'));
    }
    account = await _fetchAccountPreservingLast(token);
    throwIfCancelled();
    final quote = calculateImageGenerationAnlas(
      params: taskParams,
      account: account,
      extras: itemExtras,
      imageToImage: true,
      strength: strength,
      alreadyEncodedVibes: api.countCachedVibes(taskParams.model, itemExtras),
      preciseReferenceCount: itemExtras.preciseReferences.length,
      language: settings.language,
    );
    if (quote.insufficient) {
      status = _rf('status.insufficientItem', {
        'amount': quote.amount,
        'balance': quote.balance ?? _unknown(),
      });
      notifyListeners();
    }
    final groupId = await ensureHistoryGroup(groupName, historyGroupId);
    throwIfCancelled();
    final (images, seed) = await api.img2img(
      token,
      settings,
      taskParams,
      itemExtras.copy(),
      sourceBytes,
      I2IParams(strength: strength),
    );
    throwIfCancelled();
    if (images.isEmpty) throw Exception(_rt('error.noImagesReturned'));
    final item = await storage.saveImage(
      images.first,
      taskParams,
      seed,
      feature: 'batch-redraw',
      groupId: groupId,
    );
    await _commitCompletedHistory([item]);
    // The redrawn image is already saved at this point — a balance-refresh
    // hiccup here must not make the caller report an already-successful item
    // as failed.
    try {
      account = await _fetchAccountPreservingLast(token);
    } catch (_) {
      /* balance will catch up on the next natural refresh */
    }
    notifyListeners();
    return item;
  }

  Future<void> moveHistory(String id, String? groupId) async {
    history = history
        .map((item) => item.id == id
            ? HistoryItem.fromJson({...item.toJson(), 'groupId': groupId})
            : item)
        .toList();
    if (current?.id == id) {
      current = history.where((item) => item.id == id).firstOrNull;
    }
    await storage.writeHistory(history);
    notifyListeners();
  }

  Future<void> renameHistory(String id, String name) async {
    final index = history.indexWhere((item) => item.id == id);
    if (index < 0 || name.trim().isEmpty) return;
    final oldPath = history[index].filePath;
    final renamed = await storage.renameHistoryFile(history[index], name);
    history[index] = renamed;
    if (current?.id == id) current = renamed;
    if (workbenchImage?.filePath == oldPath) {
      workbenchImage = WorkingImage(
        filePath: renamed.filePath,
        width: renamed.width,
        height: renamed.height,
      );
    }
    await storage.writeHistory(history);
    notifyListeners();
  }

  Future<String> exportHistory(
    List<HistoryItem> items, {
    String archiveName = 'Langbai-NovelAI-Studio',
  }) =>
      storage.exportHistoryZip(
        items,
        groups,
        archiveName: archiveName,
        language: settings.language,
      );

  void selectImage(HistoryItem item) {
    current = item;
    notifyListeners();
  }

  Future<void> deleteHistory(String id) async {
    final previousIndex = history.indexWhere((item) => item.id == id);
    final removed = previousIndex >= 0 ? history[previousIndex] : null;
    final previousCurrent = current;
    history.removeWhere((e) => e.id == id);
    if (current?.id == id) current = history.isNotEmpty ? history.first : null;
    notifyListeners();
    try {
      await storage.deleteHistory(id);
    } catch (_) {
      if (removed != null && !history.any((item) => item.id == id)) {
        history.insert(previousIndex.clamp(0, history.length), removed);
      }
      if (previousCurrent?.id == id) current = previousCurrent;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> deleteHistoryFiles(Iterable<String> filePaths) async {
    final targets = filePaths.where((path) => path.isNotEmpty).toSet();
    if (targets.isEmpty) return;
    final removed = <({int index, HistoryItem item})>[
      for (var index = 0; index < history.length; index++)
        if (targets.contains(history[index].filePath))
          (index: index, item: history[index]),
    ];
    final previousCurrent = current;
    history.removeWhere((item) => targets.contains(item.filePath));
    if (current != null && targets.contains(current!.filePath)) {
      current = history.isNotEmpty ? history.first : null;
    }
    notifyListeners();
    try {
      await storage.deleteHistoryFiles(targets);
    } catch (_) {
      for (final entry in removed) {
        if (!history.any((item) => item.id == entry.item.id)) {
          history.insert(entry.index.clamp(0, history.length), entry.item);
        }
      }
      if (previousCurrent != null &&
          targets.contains(previousCurrent.filePath)) {
        current = previousCurrent;
      }
      notifyListeners();
      rethrow;
    }
  }

  // Drop a history record whose image file is gone from disk (called when a
  // gallery tile can't find its file mid-session). Re-checks existence so a
  // present file is never removed; only the record is dropped (file already
  // gone), keeping the in-app library in sync without showing broken tiles.
  Future<void> dropMissingImage(String id) async {
    final idx = history.indexWhere((e) => e.id == id);
    if (idx < 0) return;
    final item = history[idx];
    if (item.filePath.isNotEmpty && File(item.filePath).existsSync()) return;
    history.removeAt(idx);
    if (current?.id == id) current = history.isNotEmpty ? history.first : null;
    await storage.writeHistory(history);
    notifyListeners();
  }

  Future<int?> _authorizeQuotedRun(
    String token,
    AnlasQuote Function(AccountSummary account) buildQuote,
  ) async {
    account = await _fetchAccountPreservingLast(token);
    final quote = buildQuote(account);
    if (!quote.ok || quote.amount == null) throw Exception(quote.message);
    if (quote.insufficient) {
      status = _rf('status.insufficientThisRun', {
        'amount': quote.amount,
        'balance': quote.balance ?? _unknown(),
      });
    }
    lastAnlasSpent = null;
    _pendingAuthorizedBalance = account.anlasBalance;
    notifyListeners();
    return account.anlasBalance;
  }

  Future<String> _finishQuotedRun(String token, int? before) async {
    account = await _fetchAccountPreservingLast(token);
    final after = account.anlasBalance;
    lastAnlasSpent =
        before != null && after != null ? max(0, before - after) : null;
    _pendingAuthorizedBalance = null;
    return _spentText(lastAnlasSpent);
  }

  Future<void> _withTokenRun(Future<void> Function(String token) fn) async {
    final token = await storage.getToken();
    if (token == null || token.isEmpty) {
      status = _rt('error.tokenRequired');
      notifyListeners();
      return;
    }
    busy = true;
    notifyListeners();
    try {
      await fn(token);
    } catch (e) {
      final message = e.toString().replaceFirst('Exception: ', '');
      final before = _pendingAuthorizedBalance;
      if (before != null) {
        account = await _fetchAccountPreservingLast(token);
        final after = account.anlasBalance;
        lastAnlasSpent = after == null ? null : max(0, before - after);
        status = lastAnlasSpent == null
            ? _rf('status.failureActualUnknown', {'message': message})
            : _rf('status.failureActualSpent', {
                'message': message,
                'amount': lastAnlasSpent,
              });
      } else {
        status = message;
      }
    } finally {
      _pendingAuthorizedBalance = null;
      busy = false;
      notifyListeners();
    }
  }

  Future<Uint8List> _workbenchBytes() async {
    final img = workbenchImage;
    if (img == null) throw Exception(_rt('error.workbenchRequired'));
    return File(img.filePath).readAsBytes();
  }

  void _prependHistory(List<HistoryItem> items, {bool useAsWorkbench = false}) {
    history.insertAll(0, items);
    if (items.isNotEmpty) {
      current = items.first;
      if (useAsWorkbench) {
        workbenchImage = WorkingImage(
          filePath: items.first.filePath,
          width: items.first.width,
          height: items.first.height,
        );
      }
    }
    notifyListeners();
  }

  Future<void> _preloadCompletedItems(List<HistoryItem> items) async {
    if (items.isEmpty) return;
    try {
      await _preloadCompletedImage(items.first.filePath);
    } catch (_) {
      // Generation and persistence already succeeded. A display-cache failure
      // must not discard the result or report the paid request as failed.
    }
  }

  Future<void> _commitCompletedHistory(
    List<HistoryItem> items, {
    bool useAsWorkbench = false,
  }) async {
    await _preloadCompletedItems(items);
    _prependHistory(items, useAsWorkbench: useAsWorkbench);
  }

  static (int, int) readImageDimensions(Uint8List b) {
    return decodeImageDimensions(b);
  }

  @override
  void dispose() {
    _quoteTimer?.cancel();
    _toolPersistTimer?.cancel();
    _opusUsageTimer?.cancel();
    _proxyRefreshTimer?.cancel();
    _automaticBackupTimer?.cancel();
    BackgroundQueueService.removeCancelHandler(cancelGeneration);
    api.cancelActiveGeneration();
    super.dispose();
  }
}

List<int> _splitQuote(int amount, int count) {
  final safeCount = max(1, count);
  final base = amount ~/ safeCount;
  final remainder = amount % safeCount;
  return List<int>.generate(
    safeCount,
    (index) => base + (index < remainder ? 1 : 0),
  );
}

extension on String {
  String? get ifEmptyNull => trim().isEmpty ? null : this;
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

String _cleanError(Object error) =>
    error.toString().replaceFirst('Exception: ', '');

ReversePromptMode _modeFromSetting(String value, ReversePromptMode fallback) =>
    ReversePromptMode.values.firstWhere(
      (mode) => mode.value == value,
      orElse: () => fallback,
    );
