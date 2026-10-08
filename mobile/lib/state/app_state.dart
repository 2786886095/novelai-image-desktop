import '../models/ui_typography.dart';
import '../prompts/negative_prompt_library.dart';
import '../models/automatic_comparison.dart';
import '../services/ui_fonts.dart';
import '../services/novelai_image_envelope.dart';
import '../services/novelai_accounts.dart';
import '../services/novelai_account_api.dart';
import '../services/novelai_official_auth.dart';
import '../batch/batch_redraw_controller.dart';
import '../batch/batch_redraw_models.dart';
import '../services/comic_image_service.dart';
import '../comic/comic_controller.dart';
import '../services/generation_scope.dart';
import '../i18n/parity_text.dart';
import '../i18n/compatible_image_text.dart';
import '../services/openai_images.dart';
import '../services/apk_update.dart';
import '../services/completion_sound.dart';
import '../images/style_prompt_restore.dart';
import '../images/upscale_plan.dart';
import '../inpaint/inpaint_size.dart';
import '../services/vibe_file.dart';
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

class CompatibleGenerationOutcome {
  final bool ok;
  final List<HistoryItem> items;
  final String message;
  CompatibleGenerationOutcome(this.ok, List<HistoryItem> items, this.message)
      : items = List.unmodifiable(items);
}

class AppState extends ChangeNotifier {
  NovelAiAccounts get naiAccounts => storage is NovelAiAccountStorage
      ? (storage as NovelAiAccountStorage).accounts : NovelAiAccounts.shared;
  int _naiOperationCount = 0;
  bool _naiChanging = false;
  bool get naiAccountLocked => _naiChanging || _naiOperationCount > 0 || busy ||
      generationQueueRunning || queueAdding || naiAccounts.locked ||
      (api is NovelAiAccountApi && (api as NovelAiAccountApi).inFlight);
  void _applyNaiAccount() {
    final active = naiAccounts.active;
    if (active == null) return;
    settings
      ..apiBaseUrl = active.profile.apiBaseUrl
      ..imageBaseUrl = active.profile.imageBaseUrl
      ..allowCustomEndpoint = active.profile.relay
      ..allowCustomEndpointFallback = false;
  }
  Future<void> _changeNaiAccount(Future<void> Function() action) async {
    if (naiAccountLocked) throw StateError('任务进行中，禁止切换、删除或替换账号');
    _naiChanging = true;
    notifyListeners();
    try {
      if (storage is NovelAiAccountStorage) await (storage as NovelAiAccountStorage).ready();
      await action();
      _applyNaiAccount();
      account = naiAccounts.cachedSummary(naiAccounts.active?.profile.id);
      _opusUsageTimer?.cancel();
      _quoteTimer?.cancel();
      _quoteVersion++;
      generationQuote = null;
      lastAnlasSpent = null;
    } finally { _naiChanging = false; notifyListeners(); }
  }
  Future<void> activateNaiAccount(String? id) async {
    await _changeNaiAccount(() => naiAccounts.activate(id));
    if(id!=null) unawaited(refreshAnlas());
  }
  Future<AccountSummary> verifyNaiAccount(String id) async {
    if(naiAccountLocked) throw StateError('任务进行中，未提交验证');
    _naiChanging=true; notifyListeners();
    try {
      final summary=await naiAccounts.operation((snapshot) {
        if(snapshot.profile.id!=id) throw StateError('账号已变化');
        final transport=api is NovelAiAccountApi ? api as NovelAiAccountApi : NovelAiAccountApi(naiAccounts);
        return transport.verifyCandidate(snapshot,settings);
      },profileId:id);
      await naiAccounts.rememberSummary(id,summary);
      if(naiAccounts.active?.profile.id==id) account=summary; return summary;
    } finally { _naiChanging=false; notifyListeners(); }
  }
  Future<void> removeNaiAccount(String id) => _changeNaiAccount(() => naiAccounts.remove(id));
  Future<void> addNaiAccount({required String label, required String method, String token = '',
      String email = '', String password = '', String apiBaseUrl = 'https://api.novelai.net',
      String imageBaseUrl = 'https://image.novelai.net'}) async {
    await _changeNaiAccount(() async {
    final secret = method == 'official-login' ? await NovelAiOfficialAuth(settingsProvider: () => settings).login(email, password) : token;
    final transport=api is NovelAiAccountApi ? api as NovelAiAccountApi : NovelAiAccountApi(naiAccounts);
    await naiAccounts.addVerified(label: label, method: method, token: secret,
      verify:(snapshot)=>transport.verifyCandidate(snapshot,settings),
      apiBaseUrl: method == 'relay' ? apiBaseUrl : 'https://api.novelai.net',
      imageBaseUrl: method == 'relay' ? imageBaseUrl : 'https://image.novelai.net');
    });
    account=naiAccounts.cachedSummary(naiAccounts.active?.profile.id,stale:false);
    notifyListeners();
  }


  BatchRedrawController? _batchRedraw;
  BatchRedrawController get batchRedraw {
    if (_batchRedraw == null) {
      _batchRedraw = BatchRedrawController(this);
      unawaited(_batchRedraw!.load());
    }
    return _batchRedraw!;
  }

  ComicController? _comic;
  ComicController get comic {
    if(_comic==null){_comic=ComicController(this);unawaited(_comic!.load());}
    return _comic!;
  }
  @override void notifyListeners(){if(!_compatibleDisposed)super.notifyListeners();}
  CompatibleImageCancellation? _compatibleCancellation;
  bool _compatibleDisposed = false;

  Future<void> saveCompatibleSettings(Map<String, dynamic> config, String key,
      {String? expectedCredentialId}) async {
    final expected=expectedCredentialId ?? settings.compatibleImage['credentialId'] as String? ?? '';
    final snapshot=Map<String,dynamic>.from(config);
    await api.verifyCompatibleNovelAi(AppSettings.fromJson(settings.toJson()),snapshot,key);
    if((settings.compatibleImage['credentialId'] as String? ?? '')!=expected) throw StateError('图片服务配置已变化，未保存。');
    final next = AppSettings.fromJson(settings.toJson())
      ..compatibleImage = snapshot
      ..imageProvider = 'openai-images';
    await storage.saveCompatibleConfiguration(next, key,
      expectedCredentialId: expected);
    // Unrelated in-memory edits made while secure storage was writing are retained.
    settings.compatibleImage = next.compatibleImage;
    settings.imageProvider = next.imageProvider;
    generationQuote = null;
    notifyListeners();
  }

  Future<void> switchToNativeImages() async {
    final before = await storage.readCompatibleApiState();
    final next = await storage.writeCompatibleApiState(before,
      {...Map<String, dynamic>.from(before['config'] as Map), 'enabled': false}, before['secret'] as String);
    settings.imageProvider = next.imageProvider;
    settings.compatibleImage = next.compatibleImage;
    notifyListeners();
    _scheduleGenerationQuote();
  }

  /// Agent inputs never overwrite the user's current prompt, batch or workbench.
  Future<CompatibleGenerationOutcome> generateCompatibleForAgent({required String prompt,
      required int count, required VoidCallback ensureCurrent}) async {
    ensureCurrent();
    if (busy) throw StateError('另一个图像任务正在运行，请稍后重试。');
    if (settings.imageProvider != 'openai-images') throw StateError('图片服务配置已变化，未提交生图。');
    return _generateCompatible(promptOverride: prompt, countOverride: count, ensureCurrent: ensureCurrent);
  }

  Future<CompatibleGenerationOutcome> _generateCompatible({String? promptOverride, int? countOverride, VoidCallback? ensureCurrent}) async {
    final snapshot = AppSettings.fromJson(jsonDecode(jsonEncode(settings.toJson())) as Map<String, dynamic>);
    final c = snapshot.compatibleImage;
    if(!novelAiEnvelopeModels.contains(c['model'])) throw StateError('仅兼容 NovelAI 模型，未提交生成。');
    final prompt = promptOverride ?? params.positivePrompt, count = countOverride ?? batchCount, group = generationGroupId;
    final text = compatibleImageText(snapshot.language);
    final cancel = CompatibleImageCancellation();
    _compatibleCancellation = cancel;
    busy = true; generationQueueRunning = false; lastAnlasSpent = null;
    _clearGenerationPreview(notify: false); status = text['requesting']!; notifyListeners();
    final items = <HistoryItem>[];
    var complete = false;
    try {
      final key = await storage.getCompatibleImageKey(c['credentialId'] as String? ?? '');
      if (cancel.cancelled) { status = text['stopped']!; return CompatibleGenerationOutcome(false, items, status); }
      ensureCurrent?.call();
      final config = CompatibleImageConfig(baseUrl: c['baseUrl'] as String? ?? '', model: c['model'] as String? ?? '',
        apiKey: key ?? '', responseFormat: c['responseFormat'] as String? ?? 'auto');
      final body = compatibleImageBody(config, prompt: prompt, size: c['size'] as String? ?? 'auto', n: count,
        extensions: Map<String, Object?>.from(c['extensions'] as Map? ?? {}));
      try { await BackgroundQueueService.start('compatible-generation', title:text['panel']!,text:text['requesting']!); } catch (_) { /* Foreground generation still works. */ }
      final batch = await generateCompatibleImages(config, prompt: prompt, size: c['size'] as String? ?? 'auto', n: count,
        extensions: Map<String, Object?>.from(c['extensions'] as Map? ?? {}), cancellation: cancel,
        clientForUri: (uri) => createProxyHttpClientForUri(snapshot, uri, scope: ProxyScope.ai));
      for (final bytes in batch.images) {
        try { items.add(await storage.saveCompatibleImage(bytes, body, snapshot, groupId: group.ifEmptyNull)); }
        on SavedImageHistoryException catch (error) { items.add(error.item); rethrow; }
      }
      if (!_compatibleDisposed && items.isNotEmpty) await _commitCompletedHistory(items);
      complete = batch.complete;
      status = batch.complete ? '${text['done']} ${items.length}' : '${batch.cancelled ? text['stopped'] : text['failed']} ${batch.error?.status ?? ''} · ${text['savedCount']} ${items.length}';
    } on SavedImageHistoryException {
      if (!_compatibleDisposed && items.isNotEmpty) await _commitCompletedHistory(items);
      status = '${text['historyFailed']} ${items.length}';
    } catch (_) {
      if (!_compatibleDisposed && items.isNotEmpty) await _commitCompletedHistory(items);
      status = '${text['failed']} · ${text['savedCount']} ${items.length}';
    } finally {
      try { await BackgroundQueueService.stop('compatible-generation'); } catch (_) { /* Notification cleanup is best effort. */ }
      if (_compatibleCancellation == cancel) { _compatibleCancellation = null; busy = false; }
      if (!_compatibleDisposed) notifyListeners();
    }
    return CompatibleGenerationOutcome(complete, items, status);
  }
  final NaiApi api;
  final Storage storage;
  final OfflineTagStore offlineTags;
  final CompletedImagePreloader _preloadCompletedImage;

  AppState({
    NaiApi? api,
    Storage? storage,
    OfflineTagStore? offlineTags,
    CompletedImagePreloader? preloadCompletedImage,
  })  : api = api ?? NovelAiAccountApi(NovelAiAccounts.shared),
        storage = storage ?? NovelAiAccountStorage(NovelAiAccounts.shared),
        offlineTags = offlineTags ?? OfflineTagStore(),
        _preloadCompletedImage =
            preloadCompletedImage ?? preloadCompletedFileImage {
    if (this.storage is NovelAiAccountStorage) {
      naiAccounts.hostBusy = () => busy || _naiOperationCount > 0 || generationQueueRunning || queueAdding ||
          (this.api is NovelAiAccountApi && (this.api as NovelAiAccountApi).inFlight);
      naiAccounts.onCommitted = () {
        if (_compatibleDisposed) return;
        _applyNaiAccount();
        account = naiAccounts.cachedSummary(naiAccounts.active?.profile.id);
        _quoteVersion++;
        generationQuote = null;
        lastAnlasSpent = null;
        notifyListeners();
      };
    }
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
  String? comparisonSurface;
  bool comparisonAutoOpenPending=false;
  Future<void> _negativeSave=Future.value();
  Future<void> mutateNegativePresets(List<Map<String,String>> Function(List<Map<String,String>>) update){
    final operation=_negativeSave.catchError((Object _){}).then((_)async{
      final next=normalizeNegativePromptPresets(update(settings.negativePromptPresets));
      final saved=AppSettings.fromJson({...settings.toJson(),"negativePromptPresets":next});
      await storage.setSettings(saved);settings.negativePromptPresets=next;notifyListeners();
    });_negativeSave=operation;return operation;
  }
  Future<void> _comparisonSave=Future.value();
  Future<void> setAutomaticComparison(String surface,bool enabled) {
    final operation=_comparisonSave.catchError((Object _){}).then((_)async{
      if(!settings.automaticComparison.containsKey(surface))throw ArgumentError(surface);
      final next=normalizeAutomaticComparison({...settings.automaticComparison,surface:enabled});
      final saved=AppSettings.fromJson({...settings.toJson(),'automaticComparison':next});
      await storage.setSettings(saved);settings.automaticComparison=next;notifyListeners();
    });
    _comparisonSave=operation;return operation;
  }
  void renameCharacter(int index,String name){
    extras.charCaptions[index].name=name;
    unawaited(storage.setCharacterPrompts(extras.charCaptions).catchError((Object e){status='$e';notifyListeners();}));
    notifyListeners();
  }

  bool booted = false;
  bool needsNetworkOnboarding = false;
  int _workbenchLoadRevision = 0;
  bool _busy = false;
  bool get busy => _busy;
  set busy(bool value) {
    // Even a generation that starts and finishes during a read cancels that
    // pending explicit restore. Preserve the existing busy notifications.
    if (value && !_busy) _workbenchLoadRevision++;
    _busy = value;
  }
  Uint8List? generationPreview;
  double generationPreviewProgress = 0;
  int generationPreviewStep = 0;
  int generationPreviewTotalSteps = 0;
  String status = runtimeTextFor('zh-CN', 'common.ready');
  int batchCount = 1;
  int batchIntervalSeconds = 0;
  String selectedGroupId = '';
  String generationGroupId = '';
  String inpaintSizeMode = 'original';
  InpaintSize inpaintCustomSize = (width: 1024, height: 1024);
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
  final _textJobTimers=<Timer>{};
  UpdateInfo? updateInfo;
  bool updateInstalling=false;
  double updateProgress=0;
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
    try { await ensureUiFont(settings.uiTypography.font); } catch (_) { /* Missing fonts use system fallback without destroying the saved choice. */ }
      if (storage is NovelAiAccountStorage) {
        await (storage as NovelAiAccountStorage).ready();
        _applyNaiAccount();
      }
      if (settings.imageProvider != 'novelai' && (settings.imageProvider != 'openai-images' || !novelAiEnvelopeModels.contains(settings.compatibleImage['model']))) {
        // Preserve only an explicitly configured supported NovelAI envelope.
        // Unsupported archived models keep their metadata, but stay inactive.
        settings.imageProvider = 'novelai';
        await storage.setSettings(settings);
      }
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
      final savedParams = await storage.getParams();
      if (settings.persistGenerateParams) {
        params = savedParams;
        final savedBatch=settings.lastGenerationState['batchCount'];
        if(savedBatch is num && savedBatch.isFinite)batchCount=savedBatch.toInt().clamp(1,999);
        extras.charCaptions = await storage.getCharacterPrompts();
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
      // AppSettings supplies auto only when no mode is saved. Never overwrite
      // an explicit direct/manual selection or its address during startup.
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
      restoreI2IState();
      if (settings.persistInpaintParams) {
        final size = restoreInpaintSizeState(settings.lastGenerationState);
        inpaintSizeMode = size.mode; inpaintCustomSize = size.custom;
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
      // Always retain edited prompt text, even when numeric persistence is off.
      params.stylePrompt = savedParams.stylePrompt;
      params.negativePrompt = savedParams.negativePrompt;
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
        account = storage is NovelAiAccountStorage
            ? naiAccounts.cachedSummary(naiAccounts.active?.profile.id)
            : const AccountSummary(hasToken: true);
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
    final id=naiAccounts.active?.profile.id;
    final fresh = await api.fetchAccount(token, settings);
    if (!fresh.stale) {
      if(storage is NovelAiAccountStorage && id!=null && naiAccounts.active?.profile.id==id) {
        await naiAccounts.rememberSummary(id,fresh);
      }
      return fresh;
    }
    // A failed official /user/data refresh must never replace the last real
    // allowance with a fabricated zero/placeholder. Keep the last successful
    // values, but mark them stale so the UI cannot claim a live sync.
    return account.hasToken ? account.copyWith(stale: true) : fresh;
  }

  Future<void> _refreshAccountAtBoot() async {
    if (_naiChanging) throw StateError('账号正在切换，未提交请求');
    _naiOperationCount++;
    try {
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
      account = account.hasToken ? account.copyWith(stale:true) : const AccountSummary(hasToken:true,stale:true);
      status = _rf('status.accountReadFailed', {'error': _cleanError(error)});
    }
    notifyListeners();
    _scheduleGenerationQuote();
    } finally { _naiOperationCount--; notifyListeners(); }
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
    notifyListeners();
    storage.setParams(params);
    _scheduleGenerationQuote();
  }

  UiTypography? _uiTypographyPreview;
  UiTypography get effectiveUiTypography=>_uiTypographyPreview??settings.uiTypography;
  void previewUiTypography(UiTypography? value){_uiTypographyPreview=value;notifyListeners();}
  // Typography is local UI state; never schedules a generation quote or a model call.
  Future<void> setUiTypography(UiTypography value) async {
    final next=UiTypography.fromJson(value.toJson());
    try{
      await ensureUiFont(next.font);
      final saved=AppSettings.fromJson({...settings.toJson(),'uiTypography':next.toJson()});
      await storage.setSettings(saved);settings.uiTypography=next;
    }finally{_uiTypographyPreview=null;notifyListeners();}
  }

  Future<void> setSettings(void Function(AppSettings s) update) async {
    update(settings);
    await storage.setSettings(settings);
    notifyListeners();
    _scheduleGenerationQuote();
  }

  void markCharacterChanged() {
    unawaited(storage
        .setCharacterPrompts(extras.charCaptions)
        .catchError((Object error) {
      status = '$error';
      notifyListeners();
    }));
    markChanged();
  }

  void markChanged() {
    notifyListeners();
    _scheduleGenerationQuote();
    _scheduleToolStatePersist();
  }

  void setI2ISizeMode(String value) {
    i2iSizeMode = value == 'custom' ? 'custom' : 'adaptive';
    _scheduleToolStatePersist();
    notifyListeners();
    _scheduleGenerationQuote();
  }

  void setI2ISourceMode(String value) {
    i2iSourceMode = value == 'latest' ? 'latest' : 'original';
    _scheduleToolStatePersist();
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
    _scheduleToolStatePersist();
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
    try { await addNaiAccount(label: naiAccounts.nextLabel, method: 'token', token: token); return null; }
    catch (_) { return '保存账号失败；请检查输入、系统凭据库和运行中任务'; }
  }
  Future<void> clearToken() => activateNaiAccount(null);

  Future<void> refreshAnlas() async {
    if (_naiChanging) throw StateError('账号正在切换，未提交请求');
    _naiOperationCount++;
    try {
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
    } finally { _naiOperationCount--; notifyListeners(); }
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
    if (_naiChanging) throw StateError('账号正在切换，未提交请求');
    _naiOperationCount++;
    try {
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
    } finally { _naiOperationCount--; notifyListeners(); }
  }

  Future<String?> translateText(String text, {String? target}) async {
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
      if (template.negativePrompt.trim().isNotEmpty) {
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

  Future<void> addStylePromptPresets(List<StylePromptPreset> presets) async {
    final next = AppSettings.fromJson(settings.toJson());
    next.stylePromptPresets = [...settings.stylePromptPresets, ...presets];
    await storage.setSettings(next);
    settings = next;
    notifyListeners();
  }

  Future<void> renameStylePromptPreset(String id, String rawName) async {
    final name = rawName.trim();
    if (name.isEmpty) return;
    final preset =
        settings.stylePromptPresets.where((p) => p.id == id).firstOrNull;
    if (preset == null) return;
    final previous = preset.name;
    preset.name = name;
    try {
      await storage.setSettings(settings);
    } catch (_) {
      preset.name = previous;
      rethrow;
    }
    notifyListeners();
  }

  Future<void> removeStylePromptPreset(String id) async {
    await storage.deleteStylePromptPreviewImages(id);
    settings.stylePromptPresets.removeWhere((item) => item.id == id);
    await storage.setSettings(settings);
    notifyListeners();
  }

  void applyStylePromptPreset(StylePromptPreset preset) {
    setParam((params) => params.stylePrompt = preset.prompt);
    unawaited(updateStyleLibrary((s) {
      final p = s.stylePromptPresets.where((p) => p.id == preset.id).firstOrNull;
      if (p != null) p.usageCount++;
    }).catchError((Object e) { status = '$e'; notifyListeners(); }));
  }

  Future<void> _styleWrites = Future.value();
  Future<void> updateStyleLibrary(void Function(AppSettings) update) {
    final next = _styleWrites.catchError((Object _) {}).then((_) async {
      final copy = AppSettings.fromJson(settings.toJson());
      update(copy);
      await storage.setSettings(copy);
      settings = copy;
      notifyListeners();
    });
    _styleWrites = next;
    return next;
  }

  Future<List<StylePromptPreviewImage>> importStylePromptPreviewImages({
    required StylePromptPreset preset,
    required List<({String path, String name})> sources,
  }) async {
    final available = max(0, 9 - preset.previewImages.length);
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
        [...preset.previewImages, ...imported].take(9).toList();
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
    List<CharCaptionItem>? captions,
  }) async {
    final cleanPrompt = prompt;
    if (cleanPrompt.trim().isEmpty && (captions?.isEmpty ?? true)) {
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
        if (captions != null) {
          preset.captions = captions
              .map((c) => CharCaptionItem.fromJson(c.toJson()))
              .toList();
        }
        await storage.setSettings(settings);
        notifyListeners();
        return preset;
      }
    }
    final preset = PositivePromptPreset(
      id: '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(1 << 20)}',
      name: cleanName,
      prompt: cleanPrompt,
      captions:
          captions?.map((c) => CharCaptionItem.fromJson(c.toJson())).toList(),
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
    if (applyMetadata && busy) {
      throw StateError('Cannot restore image parameters during generation.');
    }
    final revision = ++_workbenchLoadRevision;
    final bytes = await File(filePath).readAsBytes();
    final dims = readImageDimensions(bytes);
    final report =
        inspectImageMetadata(await compute(parseImageTextMetadata, bytes));
    // Stage all decoded data before publishing any state. A later selection,
    // clear, or paid-generation start invalidates only this explicit restore.
    if (applyMetadata && (busy || revision != _workbenchLoadRevision)) {
      throw StateError('Image parameter import cancelled: a newer image or generation started.');
    }
    final imported = report.imported;
    workbenchImportedParams = imported.isEmpty ? null : imported;
    workbenchCharacterCaptions = report.characterCaptions;
    workbenchImage =
        WorkingImage(filePath: filePath, width: dims.$1, height: dims.$2);
    i2iOriginalImage = workbenchImage;
    comparisonBefore=null;comparisonAfter=null;comparisonSurface=null;comparisonAutoOpenPending=false;
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

  /// Paste/drop and an explicit favorite apply restore parameters. Picker and
  /// ordinary history selection deliberately retain the current form values.
  Future<void> importGenerationImage(String path) =>
      setWorkbenchPath(path, applyMetadata: true);

  List<HistoryItem> get generationPreviewHistory => history
      .where((item) =>
          (selectedGroupId.isEmpty || item.groupId == selectedGroupId) &&
          File(item.filePath).existsSync())
      .toList();

  Future<void> setWorkbenchFromHistory(HistoryItem item) async {
    current = item;
    await setWorkbenchPath(item.filePath);
  }

  void clearWorkbench() {
    _workbenchLoadRevision++;
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
    imported.applyTo(params);
    if (imported.stylePrompt == '' && imported.positivePrompt != null) {
      final split = restoreSavedStyle(imported.positivePrompt!, settings.stylePromptPresets.map((p) => p.prompt));
      if (split != null) {
        params.stylePrompt = split.style;
        params.positivePrompt = split.positive;
      }
    }
    if (exact) {
      final restoredCaptions = (characterCaptions ?? const [])
          .map((item) => CharCaptionItem(
                enabled: item.enabled,
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
    unawaited(storage.setCharacterPrompts(extras.charCaptions));
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
    comparisonSurface = null;comparisonAutoOpenPending=false;
    notifyListeners();
  }

  void addCharacter() {
    if (extras.charCaptions.length >= params.maxCharacterPrompts) return;
    extras.charCaptions.add(CharCaptionItem(
      useCoords: extras.charCaptions.any((caption) => caption.useCoords),
    ));
    unawaited(storage.setCharacterPrompts(extras.charCaptions));
    notifyListeners();
    _scheduleGenerationQuote();
  }

  void removeCharacter(int index) {
    if (index < 0 || index >= extras.charCaptions.length) return;
    extras.charCaptions.removeAt(index);
    unawaited(storage.setCharacterPrompts(extras.charCaptions));
    notifyListeners();
    _scheduleGenerationQuote();
  }

  String? importVibeFile(String text) {
    try {
      final refs = parseVibeFile(text);
      if (extras.vibeImages.length + refs.length > 16) {
        return _rt('status.vibeLimit');
      }
      extras.vibeImages.addAll(refs);
      notifyListeners();
      _scheduleGenerationQuote();
      return null;
    } catch (error) {
      return error.toString();
    }
  }

  Future<String?> addVibeImage(String filePath) async {
    if (extras.vibeImages.length >= 16) return _rt('status.vibeLimit');
    try {
      final bytes = await File(filePath).readAsBytes();
      readImageDimensions(bytes);
      // Another read or bundle import may have filled the last slot while waiting.
      if (extras.vibeImages.length >= 16) return _rt('status.vibeLimit');
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

  Future<void> _referencePresetMutationTail = Future<void>.value();

  // Serialize the whole copy/metadata/publish transaction. Pending changes are
  // invisible, and a failed write never poisons later mutations or drops a save.
  Future<T> _referencePresetMutation<T>(Future<T> Function() work) {
    final pending = _referencePresetMutationTail.then((_) => work());
    _referencePresetMutationTail =
        pending.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return pending;
  }

  Future<void> _commitReferencePresetLibrary(
      List<String> groups, List<ReferencePreset> presets) async {
    final next = ReferencePresetLibrary(
      groups: List<String>.of(groups),
      presets: List<ReferencePreset>.of(presets),
    );
    await storage.setReferencePresetLibrary(next);
    referencePresetGroups = next.groups;
    referencePresets = next.presets;
  }

  Future<void> _appendReferencePresets(List<ReferencePreset> additions,
      {List<String> groups = const []}) {
    final nextGroups = <String>{
      ...referencePresetGroups,
      ...groups,
      for (final preset in additions) preset.group,
    }.where((value) => value.isNotEmpty).toList()
      ..sort();
    return _commitReferencePresetLibrary(
        nextGroups, [...referencePresets, ...additions]);
  }

  Future<void> _discardReferencePresetImage(String? path) async {
    if (path == null) return;
    try {
      await storage.deleteReferencePresetImage(ReferencePreset(
        id: '',
        name: '',
        group: '',
        kind: ReferencePresetKind.precise,
        filePath: path,
        createdAt: '',
      ));
    } catch (_) {
      // Cleanup must not hide the metadata failure or remove an existing asset.
    }
  }

  Future<String?> addReferencePresetGroup(String value) async {
    return _referencePresetMutation(() async {
      final group = value.trim();
      if (group.isEmpty) return _rt('referencePresets.groupRequired');
      try {
        if (!referencePresetGroups.contains(group)) {
          final nextGroups = [...referencePresetGroups, group]..sort();
          await _commitReferencePresetLibrary(nextGroups, referencePresets);
          notifyListeners();
        }
        return null;
      } catch (_) {
        return _rt('referencePresets.saveFailed');
      }
    });
  }

  Future<void> deleteReferencePresetGroup(String value) async {
    return _referencePresetMutation(() async {
      final group = value.trim();
      if (group.isEmpty || !referencePresetGroups.contains(group)) return;
      final nextGroups =
          referencePresetGroups.where((item) => item != group).toList();
      final nextPresets = referencePresets
          .map((preset) =>
              preset.group == group ? preset.copyWith(group: '') : preset)
          .toList();
      await _commitReferencePresetLibrary(nextGroups, nextPresets);
      notifyListeners();
    });
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
    final item = extras.vibeImages[index];
    return _referencePresetMutation(() async {
      String? persistedPath;
      try {
        final id = _newReferencePresetId();
        final path = await storage.persistReferencePresetImage(
          presetId: id,
          bytes: base64Decode(item.base64),
          sourcePath: item.sourcePath,
        );
        persistedPath = path;
        final cleanGroup = group.trim();
        final preset = ReferencePreset(
          id: id,
          name: title,
          group: cleanGroup,
          kind: ReferencePresetKind.vibe,
          filePath: path,
          createdAt: DateTime.now().toIso8601String(),
          infoExtracted: item.infoExtracted,
          strength: item.strength,
        );
        await _appendReferencePresets([preset]);
        status = _rt('referencePresets.saved');
        notifyListeners();
        return null;
      } catch (_) {
        await _discardReferencePresetImage(persistedPath);
        return _rt('referencePresets.saveFailed');
      }
    });
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
    final item = extras.preciseReferences[index];
    return _referencePresetMutation(() async {
      String? persistedPath;
      try {
        final id = _newReferencePresetId();
        final path = await storage.persistReferencePresetImage(
          presetId: id,
          bytes: base64Decode(item.base64),
          sourcePath: item.sourcePath,
        );
        persistedPath = path;
        final cleanGroup = group.trim();
        final preset = ReferencePreset(
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
        );
        await _appendReferencePresets([preset]);
        status = _rt('referencePresets.saved');
        notifyListeners();
        return null;
      } catch (_) {
        await _discardReferencePresetImage(persistedPath);
        return _rt('referencePresets.saveFailed');
      }
    });
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
    return _referencePresetMutation(() async {
      final title = name.trim();
      if (title.isEmpty) return _rt('referencePresets.nameRequired');
      String? persistedPath;
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
        persistedPath = path;
        final cleanGroup = group.trim();
        final preset = ReferencePreset(
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
        );
        await _appendReferencePresets([preset]);
        status = _rt('referencePresets.saved');
        notifyListeners();
        return null;
      } catch (_) {
        await _discardReferencePresetImage(persistedPath);
        return _rt('referencePresets.saveFailed');
      }
    });
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
    return _referencePresetMutation(() async {
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
        await _appendReferencePresets([preset]);
        status = _rt('referencePresets.saved');
        notifyListeners();
        return null;
      } catch (_) {
        await _discardReferencePresetImage(persistedPath);
        return _rt('referencePresets.saveFailed');
      }
    });
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
        if (extras.vibeImages.length >= 16) return _rt('status.vibeLimit');
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
    return _referencePresetMutation(() async {
      final matches = referencePresets.where((preset) => preset.id == id);
      if (matches.isEmpty) return;
      final preset = matches.first;
      await _commitReferencePresetLibrary(referencePresetGroups,
          referencePresets.where((preset) => preset.id != id).toList());
      // Removing the durable record commits before removing its owned image.
      // A failed metadata write therefore leaves both old metadata and pixels.
      if (!referencePresets.any((item) => item.filePath == preset.filePath)) {
        await _discardReferencePresetImage(preset.filePath);
      }
      notifyListeners();
    });
  }

  Future<String?> moveReferencePresetToGroup(String id, String value) async {
    return _referencePresetMutation(() async {
      final index = referencePresets.indexWhere((preset) => preset.id == id);
      if (index < 0) return _rt('referencePresets.sourceMissing');
      final group = value.trim();
      final nextGroups = <String>{...referencePresetGroups, group}
          .where((value) => value.isNotEmpty)
          .toList()
        ..sort();
      final nextPresets = List<ReferencePreset>.of(referencePresets);
      nextPresets[index] = nextPresets[index].copyWith(group: group);
      try {
        await _commitReferencePresetLibrary(nextGroups, nextPresets);
        status = _rt('referencePresets.moved');
        notifyListeners();
        return null;
      } catch (_) {
        return _rt('referencePresets.saveFailed');
      }
    });
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
    return _referencePresetMutation(() async {
      ReferencePresetImport? imported;
      try {
        imported = await storage.importReferencePresetArchive(filePath);
        await _appendReferencePresets(imported.presets,
            groups: imported.groups);
        status = _rf('referencePresets.imported', {
          'count': imported.presets.length,
        });
        notifyListeners();
        return null;
      } catch (_) {
        for (final preset in imported?.presets ?? <ReferencePreset>[]) {
          await _discardReferencePresetImage(preset.filePath);
        }
        return _rt('referencePresets.importFailed');
      }
    });
  }

  Future<void> runTextOrImage() async {
    if (workbenchImage == null) {
      await generate();
    } else {
      await generateI2I();
    }
  }

  void setInpaintSizeMode(String mode) { inpaintSizeMode = mode == 'custom' ? 'custom' : 'original'; markChanged(); }
  void setInpaintCustomSize(InpaintSize size) { inpaintCustomSize = size; markChanged(); }

  GenerateParams get inpaintOutputParams {
    final source = inpaintSourceMode == 'original' ? i2iOriginalImage ?? workbenchImage : workbenchImage;
    if (source == null) throw FormatException(inpaintSizeText(settings.language)['missing']!);
    final size = resolveInpaintSize(inpaintSizeMode, inpaintCustomSize, (width: source.width, height: source.height), settings.language);
    return params.copy()..width = size.width..height = size.height;
  }

  AnlasQuote get inpaintAnlasQuote {
    try { return calculateInpaintAnlas(
        params: inpaintOutputParams,
        account: account,
        image: workbenchImage,
        inpaintModel: inpaintModel,
        strength: inpaintStrength,
        language: settings.language,
      ); } on FormatException catch (e) {
      return AnlasQuote(ok: false, source: AnlasQuoteSource.unavailable, message: e.message);
    }
  }

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
  void restoreI2IState() {
    i2i = I2IParams(); i2iSizeMode = 'adaptive'; i2iSourceMode = 'original';
    if (!settings.persistI2IParams) return;
    final saved = settings.lastGenerationState;
    final raw = saved['i2iParams'] is Map ? saved['i2iParams'] as Map : const {};
    double number(String key,double fallback,double max) {final v=raw[key];return v is num && v.isFinite ? v.toDouble().clamp(0,max) : fallback;}
    i2i = I2IParams(strength:number('strength',.7,1),noise:number('noise',0,.99),extraNoiseSeed:number('extraNoiseSeed',0,2147483647).round());
    // Enhance is a temporary paid operation and must never persist as active.
    i2iSizeMode = saved['i2iSizeMode']=='custom'?'custom':'adaptive';
    i2iSourceMode = saved['i2iSourceMode']=='latest'?'latest':'original';
  }

  Future<void> persistToolState() async {
    settings.lastGenerationState = {...settings.lastGenerationState,
      'batchCount': batchCount,
      'i2iParams': {'strength':i2i.strength,'noise':i2i.noise,'extraNoiseSeed':i2i.extraNoiseSeed,'upscaledEnhance':false},
      'i2iSizeMode':i2iSizeMode,'i2iSourceMode':i2iSourceMode,
      'inpaintSizeMode': inpaintSizeMode,
      'inpaintCustomSize': {'width': inpaintCustomSize.width, 'height': inpaintCustomSize.height}};
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
      upscaledEnhance: imageToImage && i2i.upscaledEnhance,
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
    if (_naiChanging) throw StateError('账号正在切换，未提交请求');
    _naiOperationCount++;
    try {
    final version = ++_quoteVersion;
    if (settings.imageProvider == 'openai-images' && workbenchImage == null) {
      generationQuote = null; quoteLoading = false; notifyListeners(); return;
    }
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
      upscaledEnhance: imageToImage && i2i.upscaledEnhance,
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
    } finally { _naiOperationCount--; notifyListeners(); }
  }

  Future<void> generate() async {
    if (_naiChanging) throw StateError('账号正在切换，未提交请求');
    _naiOperationCount++;
    try {
    if (busy) return;
    if (settings.imageProvider == 'openai-images') { await _generateCompatible(); return; }
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
          comparisonAutoOpenPending=false;
          comparisonSurface='generate:t2i';
          comparisonBefore=current==null?null:WorkingImage(filePath:current!.filePath,width:current!.width,height:current!.height);
          comparisonAfter=WorkingImage(filePath:items.first.filePath,width:items.first.width,height:items.first.height);
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
      if (CompletionAudio.shouldPlay(cancelled:_cancelGenerationRequested,completed:completed)) unawaited(CompletionAudio.play(settings.completionSound));
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
    } finally { _naiOperationCount--; notifyListeners(); }
  }

  Future<void> enqueueGeneration() async {
    if (_naiChanging) throw StateError('账号正在切换，未提交请求');
    _naiOperationCount++;
    try {
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
    } finally { _naiOperationCount--; notifyListeners(); }
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
    _comic?.cancelQueue();
    if (_compatibleCancellation != null) {
      _compatibleCancellation!.cancel(); status = compatibleImageText(settings.language)['stopped']!; notifyListeners(); return;
    }
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

  Future<void> generateI2I({String comparisonTool='generate:i2i'}) async {
    if (_naiChanging) throw StateError('账号正在切换，未提交请求');
    _naiOperationCount++;
    try {
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
          upscaledEnhance: i2i.upscaledEnhance,
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
        upscaledEnhance: i2i.upscaledEnhance,
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
              final actualSize = i2i.upscaledEnhance
                  ? decodeImageDimensions(bytes)
                  : (taskParams.width, taskParams.height);
              items.add(await storage.saveImage(bytes, taskParams, seed,
                  feature: 'i2i',
                  width: actualSize.$1,
                  height: actualSize.$2,
                  groupId: generationGroupId.ifEmptyNull));
            }
            comparisonAutoOpenPending=automaticComparisonAllowed(comparisonTool);
            comparisonSurface = comparisonTool;
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
        if (CompletionAudio.shouldPlay(cancelled:_cancelGenerationRequested,completed:completed)) unawaited(CompletionAudio.play(settings.completionSound));
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
    } finally { _naiOperationCount--; notifyListeners(); }
  }

  Future<void> enhance() async {
    if (_naiChanging) throw StateError('账号正在切换，未提交请求');
    _naiOperationCount++;
    try {
    if (busy || workbenchImage == null) return;
    final source = workbenchImage!;
    final requestedTarget = resolveNaiEnhanceOutputSize(
      source.width,
      source.height,
      enhanceScale == 0 ? 1 : enhanceScale.clamp(1, 2),
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
    final previousSourceMode = i2iSourceMode;
    i2iSourceMode = 'latest';
    final officialMax =
        enhanceScale == 0 && params.model.startsWith('nai-diffusion-5-');
    final previousMax = i2i.upscaledEnhance;
    i2i.upscaledEnhance = officialMax;
    final target = adaptiveNaiImageSize(
      source.width *
          (officialMax
              ? 1
              : enhanceScale == 0
                  ? 2
                  : enhanceScale.clamp(1, 2)),
      source.height *
          (officialMax
              ? 1
              : enhanceScale == 0
                  ? 2
                  : enhanceScale.clamp(1, 2)),
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
      await generateI2I(comparisonTool:'generate:enhance');
    } finally {
      i2i.upscaledEnhance = previousMax;
      params
        ..width = previousWidth
        ..height = previousHeight;
      i2i
        ..strength = previousStrength
        ..noise = previousNoise;
      i2iSizeMode = previousSizeMode;
      i2iSourceMode = previousSourceMode;
      notifyListeners();
      _scheduleGenerationQuote();
    }
    } finally { _naiOperationCount--; notifyListeners(); }
  }

  Future<void> inpaint(Uint8List maskBytes) async {
    if (_naiChanging) throw StateError('账号正在切换，未提交请求');
    _naiOperationCount++;
    try {
    await _withTokenRun((token) async {
      final source = inpaintSourceMode == 'original'
          ? (i2iOriginalImage ?? workbenchImage)
          : workbenchImage;
      if (source == null) throw Exception(_rt('error.originalImageRequired'));
      final image = await File(source.filePath).readAsBytes();
      final dims = source;
      final outputParams = inpaintOutputParams;
      final targetWidth = outputParams.width;
      final targetHeight = outputParams.height;
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
      comparisonAutoOpenPending=true;
      comparisonSurface = 'inpaint';
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
    } finally { _naiOperationCount--; notifyListeners(); }
  }

  Future<void> upscale() async {
    if (_naiChanging) throw StateError('账号正在切换，未提交请求');
    _naiOperationCount++;
    try {
    await _withTokenRun((token) async {
      final image = await _workbenchBytes();
      final dims = workbenchImage;
      if (dims == null) throw Exception(_rt('error.imageRequired'));
      final plan = planUpscale(dims.width, dims.height, upscaleScale);
      if (plan.exceedsLimit) throw const FormatException('当前倍率超过超分限制，请选择 MAX。');
      final before = await _authorizeQuotedRun(
        token,
        (fresh) => calculateUpscaleAnlas(
          image: dims,
          account: fresh,
          scale: upscaleScale,
          language: settings.language,
        ),
      );
      status = _rf('status.upscaleRunning',
          {'scale': upscaleScale == 0 ? 'MAX' : upscaleScale});
      notifyListeners();
      final bytes =
          await api.upscale(token, settings, image, upscaleScale, params.model);
      final item = await storage.saveImage(bytes, params, 0,
          feature: 'upscale',
          model: 'upscale',
          width: plan.width,
          height: plan.height,
          groupId: generationGroupId.ifEmptyNull);
      comparisonAutoOpenPending=true;comparisonSurface='postprocess:upscale';comparisonBefore=dims;comparisonAfter=WorkingImage(filePath:item.filePath,width:item.width,height:item.height);
      await _commitCompletedHistory([item], useAsWorkbench: true);
      status = _rf('status.upscaleDone',
          {'spent': await _finishQuotedRun(token, before)});
    });
    } finally { _naiOperationCount--; notifyListeners(); }
  }

  Future<void> augment() async {
    if (_naiChanging) throw StateError('账号正在切换，未提交请求');
    _naiOperationCount++;
    try {
    await _withTokenRun((token) async {
      final image = await _workbenchBytes();
      final dims = workbenchImage;
      if (dims == null) throw Exception(_rt('error.imageRequired'));
      final prepared = prepareDirectorImage(await processingImageBytes(image));
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
      comparisonAutoOpenPending=true;comparisonSurface='postprocess:director';comparisonBefore=dims;comparisonAfter=WorkingImage(filePath:items.first.filePath,width:items.first.width,height:items.first.height);
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
    } finally { _naiOperationCount--; notifyListeners(); }
  }

  // Concurrent — every call fires its API request immediately and updates
  // only its own job entry when it resolves, so multiple reverse requests
  // can be in flight (the button never disables while one runs), and a
  // foreground service keeps this specific request alive if the app is
  // backgrounded mid-request.
  Future<void> reversePrompt({String? templateVersion}) async {
    if(templateVersion != null && !['v5','v4.5'].contains(templateVersion)) throw ArgumentError('Invalid template version');
    final chosenVersion = templateVersion ?? settings.reversePromptTemplateVersion;
    final chosenMode=reverseMode, chosenScope=reverseScope, chosenHint=reverseHint, chosenKnown=reverseKnownCharacter;
    final requestSettings=AppSettings.fromJson(settings.toJson())..reversePromptTemplateVersion=chosenVersion;
    final templateBody=resolvedPromptTemplate('reverse',chosenMode,scoped:chosenScope!=ReversePromptScope.full,templateVersion:chosenVersion);
    final sourcePath = workbenchImage?.filePath;
    final image = await _workbenchBytes();
    final key = await storage.getVisionKey() ?? '';
    final job = TextToolJob(
      id: '${DateTime.now().microsecondsSinceEpoch}',
      label: chosenHint.trim().isNotEmpty
          ? chosenHint.trim()
          : _rt('job.reverseLabel'),
      mode: chosenMode,
      knownCharacter: chosenKnown,
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
      settings: requestSettings,
      apiKey: key,
      image: image,
      mode: chosenMode,
      scope: chosenScope,
      hint: chosenHint,
      knownCharacter: chosenKnown,
      systemTemplate: templateBody,
      templateVersion: chosenVersion,
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
        mode: chosenMode,
        knownCharacter: chosenKnown,
        input: chosenHint,
        sourceImagePath: sourcePath,
        result: res.text,
        variants: res.variants,
        codexMatches: res.codexMatches,
        createdAt: DateTime.now().toIso8601String(),
      );
      reverseHistory = [historyItem, ...reverseHistory];
      unawaited(storage.setReverseHistory(reverseHistory));
      _scheduleTextJobDismiss(() => removeReverseJob(job.id));
    } else {
      job.status = TextToolJobStatus.failed;
      job.message = res.message;
      status = res.message;
    }
    notifyListeners();
  }

  // Concurrent, same reasoning as reversePrompt.
  Future<AiTextResult> assistPositivePrompt({
    required String currentPrompt,
    required String instruction,
    required String kind,
  }) async {
    final snapshot = AppSettings.fromJson(settings.toJson());
    final version = snapshot.convertPromptTemplateVersion;
    final mode = ReversePromptMode.values.firstWhere((m)=>m.value==snapshot.promptAssistantMode,orElse:()=>ReversePromptMode.mixed);
    final template = resolvedPromptTemplate('convert', mode, templateVersion: version);
    final key = await storage.getConvertKey() ?? '';
    return api.assistPrompt(settings: snapshot, apiKey: key,
      currentPrompt: currentPrompt, instruction: instruction, kind: kind,
      mode: mode, templateVersion: version, conversionTemplate: template);
  }

  Future<void> convertPrompt({String? templateVersion}) async {
    if(templateVersion != null && !['v5','v4.5'].contains(templateVersion)) throw ArgumentError('Invalid template version');
    final chosenVersion = templateVersion ?? settings.convertPromptTemplateVersion;
    final chosenMode=convertMode, chosenInput=convertInput, chosenKnown=convertKnownCharacter;
    final requestSettings=AppSettings.fromJson(settings.toJson())..convertPromptTemplateVersion=chosenVersion;
    final templateBody=resolvedPromptTemplate('convert',chosenMode,templateVersion:chosenVersion);
    final key = await storage.getConvertKey() ?? '';
    final job = TextToolJob(
      id: '${DateTime.now().microsecondsSinceEpoch}',
      label: chosenInput.trim().length > 60
          ? chosenInput.trim().substring(0, 60)
          : chosenInput.trim(),
      mode: chosenMode,
      knownCharacter: chosenKnown,
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
      settings: requestSettings,
      apiKey: key,
      text: chosenInput,
      mode: chosenMode,
      knownCharacter: chosenKnown,
      systemTemplate: templateBody,
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
        mode: chosenMode,
        knownCharacter: chosenKnown,
        input: chosenInput,
        result: res.text,
        variants: res.variants,
        codexMatches: res.codexMatches,
        createdAt: DateTime.now().toIso8601String(),
      );
      convertHistory = [historyItem, ...convertHistory];
      unawaited(storage.setConvertHistory(convertHistory));
      _scheduleTextJobDismiss(() => removeConvertJob(job.id));
    } else {
      job.status = TextToolJobStatus.failed;
      job.message = res.message;
      status = res.message;
    }
    notifyListeners();
  }

  void _scheduleTextJobDismiss(void Function() action) {
    late final Timer timer;
    timer=Timer(_textToolDoneAutoDismiss,(){_textJobTimers.remove(timer);action();});
    _textJobTimers.add(timer);
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
    String? templateVersion,
  }) {
    if(templateVersion != null && !['v5','v4.5'].contains(templateVersion)) throw ArgumentError('Invalid template version');
    final key = mode.value;
    if (kind == 'reverse' || kind == 'convert') {
      final version=templateVersion??(kind=='reverse'?settings.reversePromptTemplateVersion:settings.convertPromptTemplateVersion);
      return promptTemplates.resolve(kind,mode,promptOverrides(kind,templateVersion:version),templateVersion:version,scoped:scoped);
    }
    if (kind == 'comic') {
      final override = settings.comicAnalyzePromptTemplates[key]?.trim() ?? settings.comicPromptTemplate.trim();
      return override.isNotEmpty?override:promptTemplates.get('comic',mode);
    }
    return '';
  }

  Map<String,String> promptOverrides(String kind, {String? templateVersion}) => switch(kind){
    'reverse' => (templateVersion ?? settings.reversePromptTemplateVersion)=='v4.5'?settings.reversePromptTemplatesV45:settings.reversePromptTemplates,
    'convert' => (templateVersion ?? settings.convertPromptTemplateVersion)=='v4.5'?settings.convertPromptTemplatesV45:settings.convertPromptTemplates,
    'comic' => settings.comicAnalyzePromptTemplates,
    _ => throw ArgumentError.value(kind),
  };

  Future<void> setPromptTemplate(
    String kind,
    ReversePromptMode mode,
    String value,
  ) async {
    final key = mode.value;
    await setSettings((settings) {
      promptOverrides(kind)[key] = value;
    });
  }

  Future<void> resetPromptTemplate(
    String kind,
    ReversePromptMode mode,
  ) async {
    final key = mode.value;
    await setSettings((settings) {
      promptOverrides(kind).remove(key);
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

  Future<void> installAppUpdate() async {
    if(updateInstalling||updateInfo?.hasUpdate!=true)return;
    updateInstalling=true;updateProgress=0;notifyListeners();
    try {
      final stage=await ApkUpdate.install(settings,updateInfo!, (value){updateProgress=value;notifyListeners();});
      status=stage=='permission_required' ? parityText(settings.language,'update.allowSystemInstall') : parityText(settings.language,'update.systemInstallerOpened');
    }catch(error){status='${_rt('status.updateFailedShort')}: $error';}
    finally{updateInstalling=false;notifyListeners();}
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

  Future<HistoryItem> generateCompatibleComicPanel({required GenerateParams panelParams,
      required GenerateExtras panelExtras, required String projectTitle, String? historyGroupId, String? size}) async {
    final snapshot=AppSettings.fromJson(jsonDecode(jsonEncode(settings.toJson())) as Map<String,dynamic>);
    final binding=comicImageBinding(snapshot);
    void guard(){
      if(_compatibleDisposed || settings.imageProvider!='openai-images' || comicImageBinding(settings)!=binding) {
        throw StateError('漫画图片服务配置已变化，未继续提交');
      }
      GenerationScope.current?.check();
    }
    guard();
    compatibleComicRequest(snapshot,panelParams,panelExtras,size:size);
    final groupId=await ensureHistoryGroup(projectTitle,historyGroupId);
    guard();
    List<HistoryItem> items;
    Object? savedError;
    try {
      items=await generateCompatibleComicImages(storage:storage,snapshot:snapshot,params:panelParams,
        extras:panelExtras,groupId:groupId,ensureCurrent:guard,size:size);
    } on SavedComicImagesException catch(e){items=e.items;savedError=e;}
    lastAnlasSpent=null;
    try {await _commitCompletedHistory(items);}catch(_){savedError=SavedComicImagesException(items,'图片已保存，但历史写入失败，已停止后续漫画请求');}
    notifyListeners();
    if(savedError!=null)throw savedError;
    return items.single;
  }

  Future<HistoryItem> generateComicPanel({
    required GenerateParams panelParams,
    required GenerateExtras panelExtras,
    required String projectTitle,
    String? historyGroupId,
  }) async {
    if (_naiChanging) throw StateError('账号正在切换，未提交请求');
    _naiOperationCount++;
    try {
    if(settings.imageProvider=='openai-images') {
      return generateCompatibleComicPanel(panelParams:panelParams,panelExtras:panelExtras,
        projectTitle:projectTitle,historyGroupId:historyGroupId);
    }
    final token = await storage.getToken();
    if (token == null || token.isEmpty) {
      throw Exception(_rt('error.naiTokenRequired'));
    }
    GenerationScope.current?.credentials(token,settings);
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
    GenerationScope.current?.credentials(token,settings);
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
    try{await _commitCompletedHistory([item]);}catch(_){throw SavedImageHistoryException(item);}
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
    } finally { _naiOperationCount--; notifyListeners(); }
  }

  Future<HistoryItem> generateArtistLabTemporary({
    required GenerateParams panelParams,
    required GenerateExtras panelExtras,
  }) async {
    if (_naiChanging) throw StateError('账号正在切换，未提交请求');
    _naiOperationCount++;
    try {
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
    } finally { _naiOperationCount--; notifyListeners(); }
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

  Future<List<HistoryItem>> generateBatchRedrawItems({
    required Uint8List sourceBytes,
    required GenerateParams itemParams,
    required GenerateExtras itemExtras,
    required double strength,
    required String groupName,
    String? historyGroupId,
    bool Function()? cancelled,
  }) async {
    if (_naiChanging) throw StateError('账号正在切换，未提交请求');
    _naiOperationCount++;
    try {
    void throwIfCancelled() {
      if (cancelled?.call() == true) {
        throw const GenerationCancelledException();
      }
    }

    if (settings.imageProvider != 'novelai' && (settings.imageProvider != 'openai-images' || !novelAiEnvelopeModels.contains(settings.compatibleImage['model']))) {
      throw StateError('当前兼容图片服务未接入图生图；请切回 NovelAI，未自动回退或提交');
    }
    final snapshot = AppSettings.fromJson(jsonDecode(jsonEncode(settings.toJson())));
    throwIfCancelled();
    final token = await storage.getToken();
    throwIfCancelled();
    if (token == null || token.isEmpty) {
      throw Exception(_rt('error.naiTokenRequired'));
    }
    GenerationScope.current?.credentials(token, snapshot);
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
    GenerationScope.current?.credentials(token, snapshot);
    final (images, seed) = await api.img2img(
      token,
      snapshot,
      taskParams,
      itemExtras.copy(),
      sourceBytes,
      I2IParams(strength: strength),
    );
    // The response was paid for: do not discard it on a late cancellation.
    if (images.isEmpty) throw Exception(_rt('error.noImagesReturned'));
    final items = <HistoryItem>[];
    String? saveError;
    for (final bytes in images) {
      try {
        items.add(await storage.saveImage(bytes, taskParams, seed,
            feature: 'batch-redraw', groupId: groupId));
      } on SavedImageHistoryException catch (error) {
        items.add(error.item);
        saveError = '图片已保存，但历史记录写入失败';
      } catch (_) {
        saveError = '图片保存未全部完成，请检查输出目录和剩余空间';
        break;
      }
    }
    await _commitCompletedHistory(items);
    // Balance refresh is best effort, uses the captured service, and cannot hide
    // already saved results or overwrite a newly selected provider's balance.
    try {
      if (cancelled?.call() != true && comicImageBinding(settings) == comicImageBinding(snapshot)
          && await storage.getToken() == token) {
        final fresh = await api.fetchAccount(token, snapshot);
        if (comicImageBinding(settings) == comicImageBinding(snapshot)) {
          account = fresh.stale && account.hasToken ? account.copyWith(stale: true) : fresh;
        }
      }
    } catch (_) {}
    notifyListeners();
    if (saveError != null) {
      throw SavedBatchImagesException(items, '$saveError；已落盘 ${items.length}/${images.length} 张，没有自动重新生成');
    }
    return items;
    } finally { _naiOperationCount--; notifyListeners(); }
  }

  /// Kept for existing callers; the shared queue consumes every returned image.
  Future<HistoryItem> generateBatchRedrawItem({
    required Uint8List sourceBytes, required GenerateParams itemParams,
    required GenerateExtras itemExtras, required double strength,
    required String groupName, String? historyGroupId, bool Function()? cancelled,
  }) async => (await generateBatchRedrawItems(sourceBytes: sourceBytes,
      itemParams: itemParams, itemExtras: itemExtras, strength: strength,
      groupName: groupName, historyGroupId: historyGroupId, cancelled: cancelled)).first;

  Future<void> moveHistory(String id, String? groupId) async {
    if(_historyFileOperations.contains(id))throw StateError('该图片正在处理，请稍后重试');
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

  final Set<String> _historyFileOperations = {};
  Future<void> renameHistory(String id, String name) async {
    if (!_historyFileOperations.add(id)) throw StateError('该图片正在处理，请稍后重试');
    try {
      final original=history.where((item)=>item.id==id).firstOrNull;
      if (original==null || name.trim().isEmpty) throw StateError('图片记录或名称无效');
      final renamed=await storage.renameHistoryFile(original,name);
      if (renamed.filePath==original.filePath) return;
      final live=history.where((item)=>item.id==id).firstOrNull;
      if(live==null||live.filePath!=original.filePath){await File(renamed.filePath).delete();throw StateError('图片记录已变化，请重新读取');}
      final committed=HistoryItem.fromJson({...live.toJson(),'filePath':renamed.filePath});
      history=history.map((item)=>item.id==id?committed:item).toList();
      try { await storage.writeHistory(history); }
      catch (_) {
        history=history.map((item)=>item.id==id&&item.filePath==renamed.filePath?HistoryItem.fromJson({...item.toJson(),'filePath':original.filePath}):item).toList();
        try {await File(renamed.filePath).delete();}catch(_){}
        rethrow;
      }
      if (current?.id==id) current=committed;
      if(workbenchImage?.filePath==original.filePath)workbenchImage=WorkingImage(filePath:committed.filePath,width:committed.width,height:committed.height);
      if(!history.any((item)=>item.id!=id&&item.filePath==original.filePath)){
        try{await File(original.filePath).delete();}catch(_){/* Durable new name remains authoritative; retain old copy on cleanup failure. */}
      }
      notifyListeners();
    } finally { _historyFileOperations.remove(id); }
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
    _workbenchLoadRevision++;
    current = item;
    comparisonBefore=null;comparisonAfter=null;comparisonSurface=null;comparisonAutoOpenPending=false;
    notifyListeners();
  }

  Future<void> deleteHistory(String id) async {
    if(_historyFileOperations.contains(id))throw StateError('该图片正在处理，请稍后重试');
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
    if(history.any((item)=>targets.contains(item.filePath)&&_historyFileOperations.contains(item.id)))throw StateError('图片正在处理，请稍后重试');
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
    if (_compatibleDisposed) return;
    _prependHistory(items, useAsWorkbench: useAsWorkbench);
  }

  static (int, int) readImageDimensions(Uint8List b) {
    return decodeImageDimensions(b);
  }

  @override
  void dispose() {
    _comic?.dispose();
    _batchRedraw?.dispose();
    _compatibleDisposed = true;
    _compatibleCancellation?.cancel();
    for(final timer in _textJobTimers){timer.cancel();}
    _textJobTimers.clear();
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
