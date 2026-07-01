import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../billing/anlas.dart';
import '../i18n/runtime_text.dart';
import '../images/image_processing.dart';
import '../images/png_metadata.dart';
import '../models/nai_models.dart';
import '../prompts/capsule_data.dart';
import '../prompts/prompt_mode.dart';
import '../prompts/prompt_templates.dart';
import '../prompts/prompt_tools.dart';
import '../services/nai_api.dart';
import '../services/proxy_http_client.dart';
import '../services/storage.dart';
import '../services/update_service.dart';
import '../services/background_queue_service.dart';
import '../tags/offline_tag_store.dart';

class AppState extends ChangeNotifier {
  final NaiApi api;
  final Storage storage;
  final OfflineTagStore offlineTags;

  AppState({NaiApi? api, Storage? storage, OfflineTagStore? offlineTags})
      : api = api ?? NaiApi(),
        storage = storage ?? Storage(),
        offlineTags = offlineTags ?? OfflineTagStore() {
    BackgroundQueueService.addCancelHandler(cancelGeneration);
  }

  GenerateParams params = GenerateParams();
  GenerateExtras extras = GenerateExtras();
  I2IParams i2i = I2IParams();
  AugmentOptions augmentOptions = AugmentOptions();
  AppSettings settings = AppSettings();
  PromptTemplateLibrary promptTemplates = const PromptTemplateLibrary();
  AccountSummary account = const AccountSummary(hasToken: false);
  List<HistoryItem> history = [];
  List<HistoryGroup> groups = [];
  HistoryItem? current;
  WorkingImage? workbenchImage;
  ImportedGenerateParams? workbenchImportedParams;
  WorkingImage? comparisonBefore;
  WorkingImage? comparisonAfter;

  bool booted = false;
  bool needsNetworkOnboarding = false;
  bool busy = false;
  String status = runtimeTextFor('zh-CN', 'common.ready');
  int batchCount = 1;
  String selectedGroupId = '';
  String inpaintModel = 'nai-diffusion-4-5-full-inpainting';
  double inpaintStrength = 0.55;
  double inpaintNoise = 0;
  int upscaleScale = 2;
  String directorTool = 'bg-removal';
  ReversePromptMode reverseMode = ReversePromptMode.tags;
  ReversePromptMode convertMode = ReversePromptMode.natural;
  ReversePromptScope reverseScope = ReversePromptScope.full;
  String reverseHint = '';
  bool reverseKnownCharacter = false;
  bool convertKnownCharacter = false;
  String reverseResult = '';
  PromptVariants? reversePromptVariants;
  String convertInput = '';
  String convertResult = '';
  PromptVariants? convertResultVariants;
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
  int _quoteVersion = 0;
  bool _cancelGenerationRequested = false;
  int _activeTaskQuote = 0;
  int? _pendingAuthorizedBalance;

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
      status = _rt('common.ready');
      params = await storage.getParams();
      final expectedModelMode = params.model == 'nai-diffusion-furry-3'
          ? 'furry'
          : settings.modelMode == 'furry'
              ? 'furry'
              : 'anime';
      if (settings.modelMode != expectedModelMode) {
        settings.modelMode = expectedModelMode;
        await storage.setSettings(settings);
      }
      // Mobile no longer ships an in-app proxy: the phone's system VPN handles
      // routing. Migrate any saved local-proxy mode to direct so update checks
      // and API calls don't dead-end on a 127.0.0.1 proxy that isn't there.
      if (settings.proxyMode != 'direct') {
        settings.proxyMode = 'direct';
        await storage.setSettings(settings);
      }
      // Restore the last-used tool selections (desktop "last generation state").
      reverseMode =
          _modeFromSetting(settings.reversePromptMode, ReversePromptMode.tags);
      convertMode = _modeFromSetting(
          settings.convertPromptMode, ReversePromptMode.natural);
      inpaintModel = settings.inpaintModel;
      inpaintStrength = settings.inpaintStrength;
      inpaintNoise = settings.inpaintNoise;
      upscaleScale = settings.upscaleScale;
      directorTool = settings.directorTool;
      augmentOptions = AugmentOptions(
        defry: settings.augmentDefry,
        colorizePrompt: settings.augmentColorizePrompt,
        emotion: settings.augmentEmotion,
        emotionLevel: settings.augmentEmotionLevel,
      );
      history = await storage.getHistory();
      groups = await storage.getGroups();
      selectedGroupId = groups.any(
        (group) => group.id == settings.activeHistoryGroupId,
      )
          ? settings.activeHistoryGroupId
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
    }
  }

  // Fetch the account after boot so a slow or blocked network never delays the
  // first frame. Mirrors the old inline fetch: placeholder + status note on
  // failure, no success toast.
  Future<void> _refreshAccountAtBoot() async {
    final token = await storage.getToken();
    if (token == null || token.isEmpty) return;
    try {
      account = await api.fetchAccount(token, settings);
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
    update(params);
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

  void setBatchCount(int n) {
    batchCount = n.clamp(1, 16);
    notifyListeners();
    _scheduleGenerationQuote();
  }

  Future<String?> setToken(String token) async {
    try {
      final summary = await api.verifyToken(token, settings);
      await storage.setToken(token.trim());
      account = summary;
      notifyListeners();
      _scheduleGenerationQuote();
      return null;
    } catch (e) {
      return e.toString().replaceFirst('Exception: ', '');
    }
  }

  Future<void> clearToken() async {
    await storage.clearToken();
    account = const AccountSummary(hasToken: false);
    generationQuote = null;
    notifyListeners();
  }

  Future<void> refreshAnlas() async {
    final token = await storage.getToken();
    if (token == null) return;
    try {
      account = await api.fetchAccount(token, settings);
      status = _rt('status.anlasRefreshed');
    } catch (error) {
      status = _rf('status.anlasRefreshFailed', {'error': _cleanError(error)});
    }
    notifyListeners();
    _scheduleGenerationQuote();
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
      createdAt: DateTime.now().toIso8601String(),
    );
    settings.stylePromptPresets.add(preset);
    await storage.setSettings(settings);
    notifyListeners();
    return preset;
  }

  Future<void> removeStylePromptPreset(String id) async {
    settings.stylePromptPresets.removeWhere((item) => item.id == id);
    await storage.setSettings(settings);
    notifyListeners();
  }

  void applyStylePromptPreset(StylePromptPreset preset) {
    setParam((params) => params.stylePrompt = preset.prompt);
  }

  Future<void> setWorkbenchPath(String filePath) async {
    final bytes = await File(filePath).readAsBytes();
    final dims = readImageDimensions(bytes);
    final imported = parseImportedGenerateParams(parsePngTextMetadata(bytes));
    workbenchImportedParams = imported.isEmpty ? null : imported;
    workbenchImage =
        WorkingImage(filePath: filePath, width: dims.$1, height: dims.$2);
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
    workbenchImportedParams = null;
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
    final lockedStyle = params.stylePrompt;
    final lockedNegative = params.negativePrompt;
    imported.applyTo(params);
    if (settings.lockStylePrompt) params.stylePrompt = lockedStyle;
    if (settings.lockNegativePrompt) params.negativePrompt = lockedNegative;
    unawaited(storage.setParams(params));
    status = _rt('status.metadataRestored');
    notifyListeners();
    _scheduleGenerationQuote();
  }

  void clearComparison() {
    comparisonBefore = null;
    comparisonAfter = null;
    notifyListeners();
  }

  void addCharacter() {
    if (extras.charCaptions.length >= 6) return;
    extras.charCaptions.add(CharCaptionItem());
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
    final count = imageToImage ? 1 : batchCount.clamp(1, 16);
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

    final initialTotal = batchCount.clamp(1, 16);
    final initialParams = params.copy();
    final initialExtras = extras.copy();
    final initialSeed = initialParams.seed;
    busy = true;
    status = _rt('status.readingCharge');
    notifyListeners();

    var completed = 0;
    var failed = 0;
    var lastError = '';
    int? anlasBefore;
    try {
      account = await api.fetchAccount(token, settings);
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

        GenerateParams taskParams;
        GenerateExtras taskExtras;
        var taskQuote = 0;
        if (!skipInitial && initialIndex < initialTotal) {
          taskParams = initialParams.copy();
          taskExtras = initialExtras.copy();
          taskQuote = initialCosts[initialIndex];
          if (initialParams.seedMode != 'random' && initialSeed > 0) {
            taskParams.seed = initialSeed + initialIndex;
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
          final job = generationQueue.removeAt(0);
          taskParams = job.params.copy();
          taskExtras = job.extras.copy();
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
          final (images, seed) =
              await api.generate(token, settings, taskParams, taskExtras);
          if (images.isEmpty) throw Exception(_rt('error.apiNoImages'));
          final items = <HistoryItem>[];
          for (final bytes in images) {
            items.add(await storage.saveImage(
              bytes,
              taskParams,
              seed,
              feature: 't2i',
              groupId: selectedGroupId.ifEmptyNull,
            ));
          }
          _prependHistory(items);
          completed += items.length;
          account = await api.fetchAccount(token, settings);
        } on GenerationCancelledException {
          _cancelGenerationRequested = true;
        } catch (error) {
          failed++;
          lastError = error.toString().replaceFirst('Exception: ', '');
          final authFailure = lastError.contains('401') ||
              lastError.toLowerCase().contains('unauthorized');
          if (authFailure) {
            _cancelGenerationRequested = true;
            generationQueue.clear();
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

      account = await api.fetchAccount(token, settings);
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
    final token = await storage.getToken();
    if (token == null || token.isEmpty) return;
    final snapshot = params.copy();
    final snapshotExtras = extras.copy();
    queueAdding = true;
    notifyListeners();
    try {
      final freshAccount = await api.fetchAccount(token, settings);
      account = freshAccount;
      final quote = await _quoteFor(
        token,
        snapshot,
        snapshotExtras,
        1,
        freshAccount,
      );
      if (!generationQueueRunning || _cancelGenerationRequested) return;
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
      generationQueue.add(GenerationQueueJob(
        id: DateTime.now().microsecondsSinceEpoch.toString(),
        params: snapshot,
        extras: snapshotExtras,
        quotedAnlas: quotedAnlas,
        addedAt: DateTime.now(),
      ));
      queueReservedAnlas += quotedAnlas;
      queueProgress = (queueProgress ?? const GenerationQueueProgress())
          .copyWith(total: (queueProgress?.total ?? 0) + 1);
      status = quoteWarning.isNotEmpty
          ? quoteWarning
          : _rf('status.queueAdded', {
              'count': generationQueue.length,
              'amount': quotedAnlas,
            });
    } catch (error) {
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

  Future<void> generateI2I() async {
    await _withTokenRun((token) async {
      if (params.positivePrompt.trim().isEmpty) {
        throw Exception(_rt('error.positiveRequired'));
      }
      final referenceError = _referenceValidationError();
      if (referenceError != null) throw Exception(referenceError);
      final image = await _workbenchBytes();
      final taskParams = params.copy()
        ..positivePrompt = expandPromptWildcards(params.positivePrompt)
        ..negativePrompt = expandPromptWildcards(params.negativePrompt);
      final before = await _authorizeQuotedRun(
        token,
        (fresh) => calculateImageGenerationAnlas(
          params: taskParams,
          account: fresh,
          extras: extras,
          imageToImage: true,
          strength: i2i.strength,
          alreadyEncodedVibes: api.countCachedVibes(taskParams.model, extras),
          preciseReferenceCount: extras.preciseReferences.length,
          language: settings.language,
        ),
      );
      final quote = calculateImageGenerationAnlas(
        params: taskParams,
        account: account,
        extras: extras,
        imageToImage: true,
        strength: i2i.strength,
        alreadyEncodedVibes: api.countCachedVibes(taskParams.model, extras),
        preciseReferenceCount: extras.preciseReferences.length,
        language: settings.language,
      );
      status = _rf('status.i2iRunning', {'amount': quote.amount});
      notifyListeners();
      final (images, seed) = await api.img2img(
          token, settings, taskParams, extras.copy(), image, i2i);
      if (images.isEmpty) throw Exception(_rt('error.i2iNoImages'));
      final items = <HistoryItem>[];
      for (final bytes in images) {
        items.add(await storage.saveImage(bytes, taskParams, seed,
            feature: 'i2i', groupId: selectedGroupId.ifEmptyNull));
      }
      _prependHistory(items, useAsWorkbench: true);
      status = _rf(
          'status.i2iDone', {'spent': await _finishQuotedRun(token, before)});
    });
  }

  Future<void> inpaint(Uint8List maskBytes) async {
    await _withTokenRun((token) async {
      final image = await _workbenchBytes();
      final dims = workbenchImage;
      if (dims == null) throw Exception(_rt('error.originalImageRequired'));
      final before = await _authorizeQuotedRun(
        token,
        (fresh) => calculateInpaintAnlas(
          params: params,
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
      final taskParams = params.copy()
        ..positivePrompt = expandPromptWildcards(params.positivePrompt)
        ..negativePrompt = expandPromptWildcards(params.negativePrompt);
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
          inpaintNoise);
      if (images.isEmpty) throw Exception(_rt('error.inpaintNoImages'));
      final items = <HistoryItem>[];
      for (final bytes in images) {
        items.add(await storage.saveImage(bytes, taskParams, seed,
            feature: 'inpaint',
            model: usedModel,
            width: dims.width,
            height: dims.height,
            groupId: selectedGroupId.ifEmptyNull));
      }
      comparisonBefore = dims;
      comparisonAfter = WorkingImage(
        filePath: items.first.filePath,
        width: dims.width,
        height: dims.height,
      );
      _prependHistory(items, useAsWorkbench: true);
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
      final before = await _authorizeQuotedRun(
        token,
        (fresh) => calculateUpscaleAnlas(
          image: dims,
          account: fresh,
          language: settings.language,
        ),
      );
      final prepared = prepareImageWithinPixels(image);
      status = prepared.resized
          ? _rf('status.upscalePreparedRunning', {
              'width': prepared.width,
              'height': prepared.height,
              'scale': upscaleScale,
            })
          : _rf('status.upscaleRunning', {'scale': upscaleScale});
      notifyListeners();
      final bytes = await api.upscale(token, settings, prepared.bytes,
          prepared.width, prepared.height, upscaleScale);
      final item = await storage.saveImage(bytes, params, 0,
          feature: 'upscale',
          model: 'upscale',
          width: prepared.width * upscaleScale,
          height: prepared.height * upscaleScale,
          groupId: selectedGroupId.ifEmptyNull);
      _prependHistory([item], useAsWorkbench: true);
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
            groupId: selectedGroupId.ifEmptyNull));
      }
      _prependHistory(items, useAsWorkbench: true);
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

  Future<void> reversePrompt() async {
    final image = await _workbenchBytes();
    final key = await storage.getVisionKey() ?? '';
    busy = true;
    status = _rt('status.reverseRunning');
    notifyListeners();
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
    );
    busy = false;
    reverseResult = res.ok ? res.text : '';
    reversePromptVariants = res.ok ? res.variants : null;
    status = res.ok ? _rt('status.reverseDone') : res.message;
    notifyListeners();
  }

  Future<void> convertPrompt() async {
    final key = await storage.getConvertKey() ?? '';
    busy = true;
    status = _rt('status.convertRunning');
    notifyListeners();
    final res = await api.convertPrompt(
      settings: settings,
      apiKey: key,
      text: convertInput,
      mode: convertMode,
      knownCharacter: convertKnownCharacter,
      systemTemplate: resolvedPromptTemplate('convert', convertMode),
    );
    busy = false;
    convertResult = res.ok ? res.text : '';
    convertResultVariants = res.ok ? res.variants : null;
    status = res.ok ? _rt('status.convertDone') : res.message;
    notifyListeners();
  }

  void applyPrompt(String prompt) {
    setParam((p) => p.positivePrompt = prompt);
    status = _rt('status.promptApplied');
    notifyListeners();
  }

  String? _referenceValidationError() {
    if (extras.preciseReferences.isNotEmpty && !params.isV45) {
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
      final override = settings.reversePromptTemplates[key]?.trim() ?? '';
      if (override.isNotEmpty) return override;
      return promptTemplates.get(scoped ? 'scopedReverse' : 'reverse', mode);
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
    // 1) Downloaded Danbooru library (richest: post counts + Chinese aliases).
    merge(
        (await offlineTags.search(raw, limit: 12)).map((item) => TagSuggestion(
              tag: item.tag,
              count: item.postCount,
              description: item.chinese.join(' '),
            )));
    // 2) Bundled capsule taxonomy — always available, so autocomplete works even
    //    before any download, for both Chinese and English input.
    if (results.length < 12) {
      merge((await searchCapsuleTags(raw, limit: 12)).map((tag) =>
          TagSuggestion(
              tag: tag.tag.replaceAll('_', ' '), description: tag.label)));
    }
    // 3) Tiny built-in fallback only if nothing matched anywhere.
    if (results.isEmpty) {
      merge(await api.searchTags(settings, raw, 12, apiKey: key));
    }
    return results;
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
          ? _rf('status.updateFailed', {'error': updateInfo!.error})
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
    account = await api.fetchAccount(token, settings);
    final quote = calculateImageGenerationAnlas(
      params: panelParams,
      account: account,
      extras: panelExtras,
      alreadyEncodedVibes: api.countCachedVibes(panelParams.model, panelExtras),
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
    var extrasToUse = panelExtras.copy();
    late List<Uint8List> images;
    late int seed;
    try {
      (images, seed) = await api.generate(
        token,
        settings,
        panelParams,
        extrasToUse,
      );
    } catch (error) {
      final message = error.toString().toLowerCase();
      final referenceFailure = message.contains('reference') ||
          message.contains('director') ||
          message.contains('encode-vibe') ||
          message.contains('422');
      final hasReferences = extrasToUse.vibeImages.isNotEmpty ||
          extrasToUse.preciseReferences.isNotEmpty;
      if (!hasReferences || !referenceFailure) rethrow;
      extrasToUse = GenerateExtras();
      (images, seed) = await api.generate(
        token,
        settings,
        panelParams,
        extrasToUse,
      );
      status = _rt('status.referenceRetrySucceeded');
    }
    if (images.isEmpty) throw Exception(_rt('error.noImagesReturned'));
    final item = await storage.saveImage(
      images.first,
      panelParams,
      seed,
      feature: 'comic',
      groupId: groupId,
    );
    _prependHistory([item]);
    account = await api.fetchAccount(token, settings);
    final after = account.anlasBalance;
    lastAnlasSpent =
        before != null && after != null ? max(0, before - after) : null;
    notifyListeners();
    return item;
  }

  Future<HistoryItem> generateBatchRedrawItem({
    required Uint8List sourceBytes,
    required GenerateParams itemParams,
    required GenerateExtras itemExtras,
    required double strength,
    required String groupName,
    String? historyGroupId,
  }) async {
    final token = await storage.getToken();
    if (token == null || token.isEmpty) {
      throw Exception(_rt('error.naiTokenRequired'));
    }
    if (itemExtras.preciseReferences.isNotEmpty && !itemParams.isV45) {
      throw Exception(_rt('error.preciseV45Only'));
    }
    final taskParams = itemParams.copy()
      ..positivePrompt = expandPromptWildcards(itemParams.positivePrompt)
      ..negativePrompt = expandPromptWildcards(itemParams.negativePrompt);
    account = await api.fetchAccount(token, settings);
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
    final (images, seed) = await api.img2img(
      token,
      settings,
      taskParams,
      itemExtras.copy(),
      sourceBytes,
      I2IParams(strength: strength),
    );
    if (images.isEmpty) throw Exception(_rt('error.noImagesReturned'));
    final item = await storage.saveImage(
      images.first,
      taskParams,
      seed,
      feature: 'batch-redraw',
      groupId: groupId,
    );
    _prependHistory([item]);
    account = await api.fetchAccount(token, settings);
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
    await storage.deleteHistory(id);
    history.removeWhere((e) => e.id == id);
    if (current?.id == id) current = history.isNotEmpty ? history.first : null;
    notifyListeners();
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
    account = await api.fetchAccount(token, settings);
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
    account = await api.fetchAccount(token, settings);
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
        account = await api.fetchAccount(token, settings);
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

  static (int, int) readImageDimensions(Uint8List b) {
    return decodeImageDimensions(b);
  }

  @override
  void dispose() {
    _quoteTimer?.cancel();
    _toolPersistTimer?.cancel();
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
