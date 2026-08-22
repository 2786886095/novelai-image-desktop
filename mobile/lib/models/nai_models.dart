library;

import '../i18n/app_locales.dart';

class NaiOption {
  final String label;
  final String value;
  const NaiOption(this.label, this.value);
}

const appName = 'Langbai NovelAI Studio';
const appVersion = '1.7.6';

const naiModels = <NaiOption>[
  NaiOption(
      'NAI Diffusion V5 Full (Latest full model)', 'nai-diffusion-5-full'),
  NaiOption('NAI Diffusion V5 Curated (Latest curated model)',
      'nai-diffusion-5-curated'),
  NaiOption('NAI Diffusion 4.5 Full (Full model)', 'nai-diffusion-4-5-full'),
  NaiOption(
      'NAI Diffusion 4.5 Curated (Curated model)', 'nai-diffusion-4-5-curated'),
  NaiOption('NAI Diffusion 4 Full (Full model)', 'nai-diffusion-4-full'),
  NaiOption(
      'NAI Diffusion 4 Curated (Curated model)', 'nai-diffusion-4-curated'),
  NaiOption('NAI Diffusion 3 (legacy general model)', 'nai-diffusion-3'),
  NaiOption('NAI Diffusion Furry 3', 'nai-diffusion-furry-3'),
];

const naiInpaintModels = <NaiOption>[
  NaiOption('NAI Diffusion V5 Full Inpaint (Recommended)',
      'nai-diffusion-5-full-inpainting'),
  NaiOption(
      'NAI Diffusion V5 Curated Inpaint', 'nai-diffusion-5-curated-inpainting'),
  NaiOption('NAI Diffusion 4.5 Full Inpaint (Recommended)',
      'nai-diffusion-4-5-full-inpainting'),
  NaiOption('NAI Diffusion 4.5 Curated Inpaint',
      'nai-diffusion-4-5-curated-inpainting'),
  NaiOption(
      'NAI Diffusion 4 Curated Inpaint', 'nai-diffusion-4-curated-inpainting'),
  NaiOption('NAI Diffusion 4 Full Inpaint', 'nai-diffusion-4-full-inpainting'),
  NaiOption('NAI Diffusion 3 Inpaint', 'nai-diffusion-3-inpainting'),
];

const naiNoiseSchedules = <NaiOption>[
  NaiOption('Native', 'native'),
  NaiOption('Karras (common)', 'karras'),
  NaiOption('Exponential', 'exponential'),
];

const naiSamplers = <NaiOption>[
  NaiOption('Euler Ancestral (Recommended)', 'k_euler_ancestral'),
  NaiOption('Euler', 'k_euler'),
  NaiOption('DPM++ 2M', 'k_dpmpp_2m'),
  NaiOption('DPM++ 2M SDE', 'k_dpmpp_2m_sde'),
  NaiOption('DPM++ SDE', 'k_dpmpp_sde'),
  NaiOption('DPM++ 2S Ancestral', 'k_dpmpp_2s_ancestral'),
  NaiOption('DDIM', 'ddim_v3'),
];

const ucPresets = <NaiOption>[
  NaiOption('Heavy (strong negative)', '0'),
  NaiOption('Light (light negative)', '1'),
  NaiOption('Human Focus', '2'),
  NaiOption('None', '3'),
];

const directorTools = <NaiOption>[
  NaiOption('Remove background', 'bg-removal'),
  NaiOption('Extract lineart', 'lineart'),
  NaiOption('Sketch', 'sketch'),
  NaiOption('Colorize', 'colorize'),
  NaiOption('Emotion transfer', 'emotion'),
  NaiOption('Declutter', 'declutter'),
];

const emotionOptions = <NaiOption>[
  NaiOption('Neutral', 'neutral'),
  NaiOption('Happy', 'happy'),
  NaiOption('Sad', 'sad'),
  NaiOption('Angry', 'angry'),
  NaiOption('Surprised', 'surprised'),
  NaiOption('Scared', 'scared'),
  NaiOption('Disgusted', 'disgusted'),
  NaiOption('Amazed', 'amazed'),
];

class SizePreset {
  final String label;
  final int width;
  final int height;
  const SizePreset(this.label, this.width, this.height);
}

const sizePresets = <SizePreset>[
  SizePreset('Square 1024×1024', 1024, 1024),
  SizePreset('Landscape 1216×832', 1216, 832),
  SizePreset('Portrait 832×1216', 832, 1216),
  SizePreset('Portrait 1024×1536', 1024, 1536),
  SizePreset('Landscape 1536×1024', 1536, 1024),
  SizePreset('Large square 1472×1472', 1472, 1472),
];

class GenerateParams {
  String model;
  String stylePrompt;
  String positivePrompt;
  String negativePrompt;
  int width;
  int height;
  int steps;
  double cfgScale;
  double cfgRescale;
  String sampler;
  String noiseSchedule;
  int seed;
  String seedMode;
  int ucPreset;
  bool qualityToggle;
  bool smea;
  bool smeaDyn;
  bool variety;
  String fileNamePrefix;

  GenerateParams({
    this.model = 'nai-diffusion-5-full',
    this.stylePrompt = '',
    this.positivePrompt = '',
    this.negativePrompt = '',
    this.width = 832,
    this.height = 1216,
    this.steps = 28,
    this.cfgScale = 6,
    this.cfgRescale = 0,
    this.sampler = 'k_euler_ancestral',
    this.noiseSchedule = 'karras',
    this.seed = 0,
    this.seedMode = 'random',
    this.ucPreset = 2,
    this.qualityToggle = true,
    this.smea = false,
    this.smeaDyn = false,
    this.variety = false,
    this.fileNamePrefix = '',
  });

  bool get isV5 => model.startsWith('nai-diffusion-5');
  bool get isV4Plus =>
      model.startsWith('nai-diffusion-4') ||
      model.startsWith('nai-diffusion-5');
  bool get isV45 => model.startsWith('nai-diffusion-4-5');
  bool get supportsPreciseReference => isV45 || isV5;
  bool get supportsVibeTransfer => !isV5;
  bool get supportsNoiseScheduleControl => !isV5;
  bool get supportsVariety => !isV5;
  int get maxCharacterPrompts => isV5
      ? 32
      : isV4Plus
          ? 6
          : 0;

  Map<String, dynamic> toJson() => {
        'model': model,
        'stylePrompt': stylePrompt,
        'positivePrompt': positivePrompt,
        'negativePrompt': negativePrompt,
        'width': width,
        'height': height,
        'steps': steps,
        'cfgScale': cfgScale,
        'cfgRescale': cfgRescale,
        'sampler': sampler,
        'noiseSchedule': noiseSchedule,
        'seed': seed,
        'seedMode': seedMode,
        'ucPreset': ucPreset,
        'qualityToggle': qualityToggle,
        'smea': smea,
        'smeaDyn': smeaDyn,
        'variety': variety,
        'fileNamePrefix': fileNamePrefix,
      };

  factory GenerateParams.fromJson(Map<String, dynamic> j) => GenerateParams(
        model: _stringValue(j['model'], 'nai-diffusion-5-full'),
        stylePrompt: _stringValue(j['stylePrompt'], ''),
        positivePrompt: _stringValue(j['positivePrompt'], ''),
        negativePrompt: _stringValue(j['negativePrompt'], ''),
        width: _intValue(j['width'], 832),
        height: _intValue(j['height'], 1216),
        steps: _intValue(j['steps'], 28),
        cfgScale: _doubleValue(j['cfgScale'], 6),
        cfgRescale: _doubleValue(j['cfgRescale'], 0),
        sampler: _stringValue(j['sampler'], 'k_euler_ancestral'),
        noiseSchedule: _stringValue(j['noiseSchedule'], 'karras'),
        seed: _intValue(j['seed'], 0),
        seedMode: _stringValue(j['seedMode'], 'random'),
        ucPreset: _intValue(j['ucPreset'], 2),
        qualityToggle: _boolValue(j['qualityToggle'], true),
        smea: _boolValue(j['smea'], false),
        smeaDyn: _boolValue(j['smeaDyn'], false),
        variety: _boolValue(j['variety'], false),
        fileNamePrefix: _stringValue(j['fileNamePrefix'], ''),
      ).normalized();

  /// Repairs values restored from older releases, imported metadata, or saved
  /// projects before they reach NovelAI. Persisted JSON previously bypassed the
  /// UI constraints and could keep a bad request alive until all app data was
  /// cleared.
  GenerateParams normalized({bool allowInpaintModel = false}) {
    final supportedModels = {
      ...naiModels.map((option) => option.value),
      if (allowInpaintModel) ...naiInpaintModels.map((option) => option.value),
    };
    final supportedSamplers = naiSamplers.map((option) => option.value).toSet();
    final supportedSchedules =
        naiNoiseSchedules.map((option) => option.value).toSet();
    return GenerateParams(
      model: supportedModels.contains(model) ? model : 'nai-diffusion-5-full',
      stylePrompt: stylePrompt,
      positivePrompt: positivePrompt,
      negativePrompt: negativePrompt,
      width: _normalizedDimension(width, 832),
      height: _normalizedDimension(height, 1216),
      steps: steps.clamp(1, 50).toInt(),
      cfgScale: _finiteClamp(cfgScale, 0, 10, 6),
      cfgRescale: _finiteClamp(cfgRescale, 0, 1, 0),
      sampler:
          supportedSamplers.contains(sampler) ? sampler : 'k_euler_ancestral',
      noiseSchedule:
          supportedSchedules.contains(noiseSchedule) ? noiseSchedule : 'karras',
      seed: seed.clamp(0, 2147483647).toInt(),
      seedMode: seedMode == 'fixed' ? 'fixed' : 'random',
      ucPreset: ucPreset.clamp(0, 3).toInt(),
      qualityToggle: qualityToggle,
      smea: smea,
      smeaDyn: smea && smeaDyn,
      variety: variety,
      fileNamePrefix: fileNamePrefix,
    );
  }

  GenerateParams copy() => GenerateParams.fromJson(toJson());
}

String _stringValue(Object? value, String fallback) =>
    value is String ? value : fallback;

int _intValue(Object? value, int fallback) {
  if (value is num && value.isFinite) return value.round();
  return int.tryParse(value?.toString() ?? '') ?? fallback;
}

double _doubleValue(Object? value, double fallback) {
  final parsed = value is num
      ? value.toDouble()
      : double.tryParse(value?.toString() ?? '');
  return parsed != null && parsed.isFinite ? parsed : fallback;
}

bool _boolValue(Object? value, bool fallback) =>
    value is bool ? value : fallback;

int _normalizedDimension(int value, int fallback) {
  if (value <= 0) return fallback;
  final bounded = value.clamp(64, 1600);
  return ((bounded / 64).round() * 64).clamp(64, 1600).toInt();
}

double _finiteClamp(
    double value, double minimum, double maximum, double fallback) {
  if (!value.isFinite) return fallback;
  return value.clamp(minimum, maximum).toDouble();
}

class CharCaptionItem {
  String prompt;
  String negativePrompt;
  bool useCoords;
  double x;
  double y;
  CharCaptionItem(
      {this.prompt = '',
      this.negativePrompt = '',
      this.useCoords = false,
      this.x = 0.5,
      this.y = 0.5});

  Map<String, dynamic> toJson() => {
        'prompt': prompt,
        'negativePrompt': negativePrompt,
        'useCoords': useCoords,
        'x': x,
        'y': y
      };
  factory CharCaptionItem.fromJson(Map<String, dynamic> j) => CharCaptionItem(
        prompt: j['prompt'] ?? '',
        negativePrompt: j['negativePrompt'] ?? '',
        useCoords: j['useCoords'] ?? false,
        x: (j['x'] ?? 0.5).toDouble(),
        y: (j['y'] ?? 0.5).toDouble(),
      );
}

class VibeTransferItem {
  final String base64;
  final double infoExtracted;
  final double strength;
  final String sourcePath;
  const VibeTransferItem({
    required this.base64,
    this.infoExtracted = 1,
    this.strength = 1,
    this.sourcePath = '',
  });
  Map<String, dynamic> toJson() => {
        'base64': base64,
        'infoExtracted': infoExtracted,
        'strength': strength,
        'sourcePath': sourcePath,
      };
  VibeTransferItem copyWith({double? infoExtracted, double? strength}) =>
      VibeTransferItem(
        base64: base64,
        infoExtracted: infoExtracted ?? this.infoExtracted,
        strength: strength ?? this.strength,
        sourcePath: sourcePath,
      );

  factory VibeTransferItem.fromJson(Map<String, dynamic> json) =>
      VibeTransferItem(
        base64: json['base64']?.toString() ?? '',
        infoExtracted: (json['infoExtracted'] as num?)?.toDouble() ?? 1,
        strength: (json['strength'] as num?)?.toDouble() ?? 1,
        sourcePath: json['sourcePath']?.toString() ?? '',
      );
}

class PreciseReferenceItem {
  final String base64;
  final String type;
  final double strength;
  final double fidelity;
  final double informationExtracted;
  final String sourcePath;
  final int width;
  final int height;

  const PreciseReferenceItem({
    required this.base64,
    // Default to character-only: "character&style" copies the reference's
    // rendering style (a prime cause of unwanted texture/halftone bleed when
    // the art style is meant to come from the prompt's artist tags instead).
    // Matches desktop's src/App.tsx handlePreciseFile default.
    this.type = 'character',
    this.strength = 1,
    this.fidelity = 1,
    this.informationExtracted = 1,
    this.sourcePath = '',
    this.width = 0,
    this.height = 0,
  });

  Map<String, dynamic> toJson() => {
        'base64': base64,
        'type': type,
        'strength': strength,
        'fidelity': fidelity,
        'informationExtracted': informationExtracted,
        'sourcePath': sourcePath,
        'width': width,
        'height': height,
      };

  PreciseReferenceItem copyWith({
    String? type,
    double? strength,
    double? fidelity,
    double? informationExtracted,
  }) =>
      PreciseReferenceItem(
        base64: base64,
        type: type ?? this.type,
        strength: strength ?? this.strength,
        fidelity: fidelity ?? this.fidelity,
        informationExtracted: informationExtracted ?? this.informationExtracted,
        sourcePath: sourcePath,
        width: width,
        height: height,
      );

  factory PreciseReferenceItem.fromJson(Map<String, dynamic> json) =>
      PreciseReferenceItem(
        base64: json['base64']?.toString() ?? '',
        type: json['type']?.toString() ?? 'character',
        strength: (json['strength'] as num?)?.toDouble() ?? 1,
        fidelity: (json['fidelity'] as num?)?.toDouble() ?? 1,
        informationExtracted:
            (json['informationExtracted'] as num?)?.toDouble() ?? 1,
        sourcePath: json['sourcePath']?.toString() ?? '',
        width: (json['width'] as num?)?.toInt() ?? 0,
        height: (json['height'] as num?)?.toInt() ?? 0,
      );
}

class GenerateExtras {
  List<VibeTransferItem> vibeImages;
  List<CharCaptionItem> charCaptions;
  List<PreciseReferenceItem> preciseReferences;
  GenerateExtras({
    List<VibeTransferItem>? vibeImages,
    List<CharCaptionItem>? charCaptions,
    List<PreciseReferenceItem>? preciseReferences,
  })  : vibeImages = vibeImages ?? [],
        charCaptions = charCaptions ?? [],
        preciseReferences = preciseReferences ?? [];

  Map<String, dynamic> toJson() => {
        'vibeImages': vibeImages.map((e) => e.toJson()).toList(),
        'charCaptions': charCaptions.map((e) => e.toJson()).toList(),
        'preciseReferences': preciseReferences.map((e) => e.toJson()).toList(),
      };

  GenerateExtras copy() => GenerateExtras(
        vibeImages: vibeImages
            .map((item) => VibeTransferItem(
                  base64: item.base64,
                  infoExtracted: item.infoExtracted,
                  strength: item.strength,
                  sourcePath: item.sourcePath,
                ))
            .toList(),
        charCaptions: charCaptions
            .map((item) => CharCaptionItem(
                  prompt: item.prompt,
                  negativePrompt: item.negativePrompt,
                  useCoords: item.useCoords,
                  x: item.x,
                  y: item.y,
                ))
            .toList(),
        preciseReferences: preciseReferences
            .map((item) => PreciseReferenceItem(
                  base64: item.base64,
                  type: item.type,
                  strength: item.strength,
                  fidelity: item.fidelity,
                  informationExtracted: item.informationExtracted,
                  sourcePath: item.sourcePath,
                  width: item.width,
                  height: item.height,
                ))
            .toList(),
      );
}

class GenerationQueueJob {
  final String id;
  final GenerateParams params;
  final GenerateExtras extras;
  final int quotedAnlas;
  final String historyGroupId;
  final DateTime addedAt;

  const GenerationQueueJob({
    required this.id,
    required this.params,
    required this.extras,
    required this.quotedAnlas,
    this.historyGroupId = '',
    required this.addedAt,
  });

  String get label {
    final value = params.positivePrompt.trim();
    return value.isEmpty
        ? '(no prompt)'
        : value.substring(0, value.length > 60 ? 60 : value.length);
  }
}

class GenerationQueueProgress {
  final int done;
  final int failed;
  final int total;

  const GenerationQueueProgress({
    this.done = 0,
    this.failed = 0,
    this.total = 0,
  });

  GenerationQueueProgress copyWith({int? done, int? failed, int? total}) =>
      GenerationQueueProgress(
        done: done ?? this.done,
        failed: failed ?? this.failed,
        total: total ?? this.total,
      );
}

class I2IParams {
  double strength;
  double noise;
  int extraNoiseSeed;
  I2IParams({this.strength = 0.7, this.noise = 0, this.extraNoiseSeed = 0});
}

class AugmentOptions {
  double defry;
  String colorizePrompt;
  String emotion;
  double emotionLevel;
  AugmentOptions(
      {this.defry = 0,
      this.colorizePrompt = '',
      this.emotion = 'happy',
      this.emotionLevel = 0});
}

class WorkingImage {
  final String filePath;
  final int width;
  final int height;
  const WorkingImage({required this.filePath, this.width = 0, this.height = 0});
}

class AccountSummary {
  final bool hasToken;
  final String? tierName;
  final int? tierLevel;
  final int? anlasBalance;
  final bool? hasActiveSubscription;
  const AccountSummary({
    this.hasToken = false,
    this.tierName,
    this.tierLevel,
    this.anlasBalance,
    this.hasActiveSubscription,
  });
}

class TokenStatus {
  final bool valid;
  final String message;
  final AccountSummary? account;
  const TokenStatus({required this.valid, required this.message, this.account});
}

class HistoryGroup {
  final String id;
  final String name;
  final String createdAt;
  const HistoryGroup(
      {required this.id, required this.name, required this.createdAt});

  Map<String, dynamic> toJson() =>
      {'id': id, 'name': name, 'createdAt': createdAt};
  factory HistoryGroup.fromJson(Map<String, dynamic> j) => HistoryGroup(
      id: j['id'], name: j['name'] ?? '', createdAt: j['createdAt'] ?? '');
}

class HistoryItem {
  final String id;
  final String filePath;
  final String date;
  final String createdAt;
  final int seed;
  final String model;
  final int width;
  final int height;
  final String prompt;
  final String feature;
  final String? groupId;
  final Map<String, dynamic> params;

  HistoryItem({
    required this.id,
    required this.filePath,
    required this.date,
    required this.createdAt,
    required this.seed,
    required this.model,
    required this.width,
    required this.height,
    required this.prompt,
    this.feature = 't2i',
    this.groupId,
    Map<String, dynamic>? params,
  }) : params = params ?? {};

  Map<String, dynamic> toJson() => {
        'id': id,
        'filePath': filePath,
        'date': date,
        'createdAt': createdAt,
        'seed': seed,
        'model': model,
        'width': width,
        'height': height,
        'prompt': prompt,
        'feature': feature,
        'groupId': groupId,
        'params': params,
      };

  factory HistoryItem.fromJson(Map<String, dynamic> j) => HistoryItem(
        id: j['id'],
        filePath: j['filePath'],
        date: j['date'],
        createdAt: j['createdAt'],
        seed: j['seed'] ?? 0,
        model: j['model'] ?? '',
        width: j['width'] ?? 0,
        height: j['height'] ?? 0,
        prompt: j['prompt'] ?? '',
        feature: j['feature'] ?? 't2i',
        groupId: j['groupId'],
        params:
            (j['params'] is Map) ? Map<String, dynamic>.from(j['params']) : {},
      );
}

class AppSettings {
  String apiBaseUrl;
  String imageBaseUrl;
  bool allowCustomEndpoint;
  String visionApiUrl;
  String visionApiModel;
  String convertApiUrl;
  String convertApiModel;
  bool autoComplete;
  String tagServerUrl;
  String tagServerType;
  String tagServerTool;
  bool tagServerEnabled;
  bool mcpForCapsule;
  bool mcpForReverse;
  bool mcpForConvert;
  String language;
  String theme;
  String modelMode;
  String proxyMode;
  String proxyUrl;
  bool proxyForNai;
  bool proxyForMcp;
  bool proxyForAi;
  bool proxyForUpdate;
  bool proxyForTranslate;
  String translateProvider;
  String baiduAppId;
  int historyRetentionDays;
  int aitagCacheRetentionDays;
  bool keepImageMetadata;
  bool saveToGallery;
  // Custom base folder for saved originals. Empty = app documents/images.
  // Images are organised as <base>/<date>/<group>/ like the desktop client.
  String imageOutputDir;
  String activeHistoryGroupId;
  String generationGroupId;
  bool lockStylePrompt;
  bool lockNegativePrompt;
  String savedStylePrompt;
  String savedNegativePrompt;
  String imageNameTemplate;
  List<PromptShortcutTemplate> promptShortcuts;
  List<StylePromptPreset> stylePromptPresets;
  Map<String, String> reversePromptTemplates;
  Map<String, String> convertPromptTemplates;
  bool promptCodexEnhanceEnabled;
  bool promptCodexAdultEnabled;
  bool promptRuleAutoRepairEnabled;
  String comicPromptTemplate;
  // Last-used tool selections, persisted so they survive an app restart
  // (mirrors the desktop "last generation state").
  String reversePromptMode;
  String convertPromptMode;
  String inpaintModel;
  double inpaintStrength;
  double inpaintNoise;
  // Independent from the main generate/i2i positivePrompt — inpaint must not
  // inherit it automatically.
  String inpaintPositivePrompt;
  int upscaleScale;
  String directorTool;
  double augmentDefry;
  String augmentColorizePrompt;
  String augmentEmotion;
  double augmentEmotionLevel;
  // Per-tool opt-out for restoring last-used params across restarts.
  // All default true (today's behavior); turning one off means that tool
  // falls back to hardcoded defaults on next launch.
  bool persistGenerateParams;
  bool persistInpaintParams;
  bool persistUpscaleParams;
  bool persistDirectorParams;

  AppSettings({
    this.apiBaseUrl = 'https://api.novelai.net',
    this.imageBaseUrl = 'https://image.novelai.net',
    this.allowCustomEndpoint = false,
    this.visionApiUrl = 'https://api.openai.com/v1',
    this.visionApiModel = 'gpt-4o',
    this.convertApiUrl = 'https://api.openai.com/v1',
    this.convertApiModel = 'gpt-4o-mini',
    this.autoComplete = true,
    this.tagServerUrl = '',
    this.tagServerType = 'rest',
    this.tagServerTool = 'search_tags',
    this.tagServerEnabled = false,
    this.mcpForCapsule = false,
    this.mcpForReverse = false,
    this.mcpForConvert = false,
    this.language = 'zh-CN',
    this.theme = 'system',
    this.modelMode = 'anime',
    this.proxyMode = 'direct',
    this.proxyUrl = 'http://127.0.0.1:7890',
    this.proxyForNai = true,
    this.proxyForMcp = true,
    this.proxyForAi = true,
    this.proxyForUpdate = true,
    this.proxyForTranslate = true,
    this.translateProvider = 'google',
    this.baiduAppId = '',
    this.historyRetentionDays = 365,
    this.aitagCacheRetentionDays = 30,
    this.keepImageMetadata = true,
    this.saveToGallery = true,
    this.imageOutputDir = '',
    this.activeHistoryGroupId = '',
    this.generationGroupId = '',
    this.lockStylePrompt = false,
    this.lockNegativePrompt = false,
    this.savedStylePrompt = '',
    this.savedNegativePrompt = '',
    this.imageNameTemplate = '{date}_{seq}_{model}',
    List<PromptShortcutTemplate>? promptShortcuts,
    List<StylePromptPreset>? stylePromptPresets,
    Map<String, String>? reversePromptTemplates,
    Map<String, String>? convertPromptTemplates,
    this.promptCodexEnhanceEnabled = true,
    this.promptCodexAdultEnabled = true,
    this.promptRuleAutoRepairEnabled = false,
    this.comicPromptTemplate = '',
    this.reversePromptMode = 'tags',
    this.convertPromptMode = 'natural',
    this.inpaintModel = 'nai-diffusion-5-full-inpainting',
    this.inpaintStrength = 0.55,
    this.inpaintNoise = 0,
    this.inpaintPositivePrompt = '',
    this.upscaleScale = 2,
    this.directorTool = 'bg-removal',
    this.augmentDefry = 0,
    this.augmentColorizePrompt = '',
    this.augmentEmotion = 'happy',
    this.augmentEmotionLevel = 0,
    this.persistGenerateParams = true,
    this.persistInpaintParams = true,
    this.persistUpscaleParams = true,
    this.persistDirectorParams = true,
  })  : reversePromptTemplates = reversePromptTemplates ?? {},
        convertPromptTemplates = convertPromptTemplates ?? {},
        promptShortcuts = promptShortcuts ?? [],
        stylePromptPresets = stylePromptPresets ?? [];

  bool get darkMode => theme == 'dark';

  Map<String, dynamic> toJson() => {
        'apiBaseUrl': apiBaseUrl,
        'imageBaseUrl': imageBaseUrl,
        'allowCustomEndpoint': allowCustomEndpoint,
        'visionApiUrl': visionApiUrl,
        'visionApiModel': visionApiModel,
        'convertApiUrl': convertApiUrl,
        'convertApiModel': convertApiModel,
        'autoComplete': autoComplete,
        'tagServerUrl': tagServerUrl,
        'tagServerType': tagServerType,
        'tagServerTool': tagServerTool,
        'tagServerEnabled': tagServerEnabled,
        'mcpForCapsule': mcpForCapsule,
        'mcpForReverse': mcpForReverse,
        'mcpForConvert': mcpForConvert,
        'language': normalizeAppLocaleCode(language),
        'theme': theme,
        'modelMode': modelMode,
        'proxyMode': proxyMode,
        'proxyUrl': proxyUrl,
        'proxyForNai': proxyForNai,
        'proxyForMcp': proxyForMcp,
        'proxyForAi': proxyForAi,
        'proxyForUpdate': proxyForUpdate,
        'proxyForTranslate': proxyForTranslate,
        'translateProvider': translateProvider,
        'baiduAppId': baiduAppId,
        'historyRetentionDays': historyRetentionDays,
        'aitagCacheRetentionDays': aitagCacheRetentionDays,
        'keepImageMetadata': keepImageMetadata,
        'saveToGallery': saveToGallery,
        'imageOutputDir': imageOutputDir,
        'activeHistoryGroupId': activeHistoryGroupId,
        'generationGroupId': generationGroupId,
        'lockStylePrompt': lockStylePrompt,
        'lockNegativePrompt': lockNegativePrompt,
        'savedStylePrompt': savedStylePrompt,
        'savedNegativePrompt': savedNegativePrompt,
        'imageNameTemplate': imageNameTemplate,
        'promptShortcuts':
            promptShortcuts.map((item) => item.toJson()).toList(),
        'stylePromptPresets':
            stylePromptPresets.map((item) => item.toJson()).toList(),
        'reversePromptTemplates': reversePromptTemplates,
        'convertPromptTemplates': convertPromptTemplates,
        'promptCodexEnhanceEnabled': promptCodexEnhanceEnabled,
        'promptCodexAdultEnabled': promptCodexAdultEnabled,
        'promptRuleAutoRepairEnabled': promptRuleAutoRepairEnabled,
        'comicPromptTemplate': comicPromptTemplate,
        'reversePromptMode': reversePromptMode,
        'convertPromptMode': convertPromptMode,
        'inpaintModel': inpaintModel,
        'inpaintStrength': inpaintStrength,
        'inpaintNoise': inpaintNoise,
        'inpaintPositivePrompt': inpaintPositivePrompt,
        'upscaleScale': upscaleScale,
        'directorTool': directorTool,
        'augmentDefry': augmentDefry,
        'augmentColorizePrompt': augmentColorizePrompt,
        'augmentEmotion': augmentEmotion,
        'augmentEmotionLevel': augmentEmotionLevel,
        'persistGenerateParams': persistGenerateParams,
        'persistInpaintParams': persistInpaintParams,
        'persistUpscaleParams': persistUpscaleParams,
        'persistDirectorParams': persistDirectorParams,
      };

  factory AppSettings.fromJson(Map<String, dynamic> j) => AppSettings(
        apiBaseUrl: j['apiBaseUrl'] ?? 'https://api.novelai.net',
        imageBaseUrl: j['imageBaseUrl'] ?? 'https://image.novelai.net',
        allowCustomEndpoint: j['allowCustomEndpoint'] ?? false,
        visionApiUrl: j['visionApiUrl'] ?? 'https://api.openai.com/v1',
        visionApiModel: j['visionApiModel'] ?? 'gpt-4o',
        convertApiUrl: j['convertApiUrl'] ?? 'https://api.openai.com/v1',
        convertApiModel: j['convertApiModel'] ?? 'gpt-4o-mini',
        autoComplete: j['autoComplete'] ?? true,
        tagServerUrl: j['tagServerUrl'] ?? '',
        tagServerType: j['tagServerType'] ?? 'rest',
        tagServerTool: j['tagServerTool'] ?? 'search_tags',
        tagServerEnabled: j['tagServerEnabled'] ??
            (j['tagServerUrl']?.toString().trim().isNotEmpty ?? false),
        mcpForCapsule: j['mcpForCapsule'] ?? false,
        mcpForReverse: j['mcpForReverse'] ?? false,
        mcpForConvert: j['mcpForConvert'] ?? false,
        language: normalizeAppLocaleCode(j['language']),
        theme: j['theme'] ?? ((j['darkMode'] ?? false) ? 'dark' : 'system'),
        modelMode: j['modelMode'] ?? 'anime',
        proxyMode: j['proxyMode'] ?? 'direct',
        proxyUrl: j['proxyUrl'] ?? 'http://127.0.0.1:7890',
        proxyForNai: j['proxyForNai'] ?? true,
        proxyForMcp: j['proxyForMcp'] ?? true,
        proxyForAi: j['proxyForAi'] ?? true,
        proxyForUpdate: j['proxyForUpdate'] ?? true,
        proxyForTranslate: j['proxyForTranslate'] ?? true,
        translateProvider: j['translateProvider'] ?? 'google',
        baiduAppId: j['baiduAppId'] ?? '',
        historyRetentionDays: j['historyRetentionDays'] ?? 365,
        aitagCacheRetentionDays: j['aitagCacheRetentionDays'] ?? 30,
        keepImageMetadata: j['keepImageMetadata'] ?? true,
        saveToGallery: j['saveToGallery'] ?? true,
        imageOutputDir: j['imageOutputDir'] ?? '',
        activeHistoryGroupId: j['activeHistoryGroupId'] ?? '',
        generationGroupId: j['generationGroupId'] ?? '',
        lockStylePrompt: j['lockStylePrompt'] ?? false,
        lockNegativePrompt: j['lockNegativePrompt'] ?? false,
        savedStylePrompt: j['savedStylePrompt'] ?? '',
        savedNegativePrompt: j['savedNegativePrompt'] ?? '',
        imageNameTemplate: j['imageNameTemplate'] ?? '{date}_{seq}_{model}',
        promptShortcuts: (j['promptShortcuts'] as List?)
                ?.whereType<Map>()
                .map((item) => PromptShortcutTemplate.fromJson(
                    Map<String, dynamic>.from(item)))
                .toList() ??
            [],
        stylePromptPresets: (j['stylePromptPresets'] as List?)
                ?.whereType<Map>()
                .map((item) =>
                    StylePromptPreset.fromJson(Map<String, dynamic>.from(item)))
                .toList() ??
            [],
        reversePromptTemplates: _stringMap(j['reversePromptTemplates']),
        convertPromptTemplates: _stringMap(j['convertPromptTemplates']),
        promptCodexEnhanceEnabled: j['promptCodexEnhanceEnabled'] ?? true,
        promptCodexAdultEnabled: j['promptCodexAdultEnabled'] ?? true,
        promptRuleAutoRepairEnabled: j['promptRuleAutoRepairEnabled'] ?? false,
        comicPromptTemplate: j['comicPromptTemplate'] ?? '',
        reversePromptMode: j['reversePromptMode'] ?? 'tags',
        convertPromptMode: j['convertPromptMode'] ?? 'natural',
        inpaintModel: _supportedOptionValue(j['inpaintModel'], naiInpaintModels,
            'nai-diffusion-5-full-inpainting'),
        inpaintStrength:
            _finiteClamp(_doubleValue(j['inpaintStrength'], 0.55), 0, 1, 0.55),
        inpaintNoise:
            _finiteClamp(_doubleValue(j['inpaintNoise'], 0), 0, 0.99, 0),
        inpaintPositivePrompt: _stringValue(j['inpaintPositivePrompt'], ''),
        upscaleScale: _intValue(j['upscaleScale'], 2) == 4 ? 4 : 2,
        directorTool: _supportedOptionValue(
            j['directorTool'], directorTools, 'bg-removal'),
        augmentDefry: _finiteClamp(_doubleValue(j['augmentDefry'], 0), 0, 5, 0),
        augmentColorizePrompt: _stringValue(j['augmentColorizePrompt'], ''),
        augmentEmotion:
            _supportedOptionValue(j['augmentEmotion'], emotionOptions, 'happy'),
        augmentEmotionLevel:
            _finiteClamp(_doubleValue(j['augmentEmotionLevel'], 0), 0, 5, 0),
        persistGenerateParams: j['persistGenerateParams'] ?? true,
        persistInpaintParams: j['persistInpaintParams'] ?? true,
        persistUpscaleParams: j['persistUpscaleParams'] ?? true,
        persistDirectorParams: j['persistDirectorParams'] ?? true,
      );
}

String _supportedOptionValue(
  Object? value,
  List<NaiOption> options,
  String fallback,
) {
  final candidate = _stringValue(value, fallback);
  return options.any((option) => option.value == candidate)
      ? candidate
      : fallback;
}

class PromptShortcutTemplate {
  final String id;
  String name;
  String prefix;
  String suffix;
  String negativePrompt;

  PromptShortcutTemplate({
    required this.id,
    required this.name,
    this.prefix = '',
    this.suffix = '',
    this.negativePrompt = '',
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'prefix': prefix,
        'suffix': suffix,
        'negativePrompt': negativePrompt,
      };

  factory PromptShortcutTemplate.fromJson(Map<String, dynamic> json) =>
      PromptShortcutTemplate(
        id: json['id']?.toString() ?? '',
        name: json['name']?.toString() ?? '',
        prefix: json['prefix']?.toString() ?? '',
        suffix: json['suffix']?.toString() ?? '',
        negativePrompt: json['negativePrompt']?.toString() ?? '',
      );
}

class StylePromptPreset {
  final String id;
  String name;
  String prompt;
  String createdAt;
  List<StylePromptPreviewImage> previewImages;

  StylePromptPreset({
    required this.id,
    required this.name,
    required this.prompt,
    required this.createdAt,
    List<StylePromptPreviewImage>? previewImages,
  }) : previewImages = previewImages ?? [];

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'prompt': prompt,
        'createdAt': createdAt,
        'previewImages': previewImages.map((item) => item.toJson()).toList(),
      };

  factory StylePromptPreset.fromJson(Map<String, dynamic> json) =>
      StylePromptPreset(
        id: json['id']?.toString() ?? '',
        name: json['name']?.toString() ?? '',
        prompt: json['prompt']?.toString() ?? '',
        createdAt: json['createdAt']?.toString() ?? '',
        previewImages: (json['previewImages'] as List?)
                ?.whereType<Map>()
                .map((item) => StylePromptPreviewImage.fromJson(
                    Map<String, dynamic>.from(item)))
                .take(3)
                .toList() ??
            [],
      );
}

class StylePromptPreviewImage {
  final String id;
  final String name;
  final String filePath;
  final String createdAt;

  const StylePromptPreviewImage({
    required this.id,
    required this.name,
    required this.filePath,
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'filePath': filePath,
        'createdAt': createdAt,
      };

  factory StylePromptPreviewImage.fromJson(Map<String, dynamic> json) =>
      StylePromptPreviewImage(
        id: json['id']?.toString() ?? '',
        name: json['name']?.toString() ?? '',
        filePath: json['filePath']?.toString() ?? '',
        createdAt: json['createdAt']?.toString() ?? '',
      );
}

Map<String, String> _stringMap(dynamic value) {
  if (value is! Map) return {};
  return value.map(
    (key, value) => MapEntry(key.toString(), value?.toString() ?? ''),
  );
}

enum ReversePromptMode { tags, natural, mixed }

enum ReversePromptScope { full, character, object, scene }

extension ReversePromptScopeLabel on ReversePromptScope {
  String get value => name;
  String get label => switch (this) {
        ReversePromptScope.full => 'Whole image',
        ReversePromptScope.character => 'Character',
        ReversePromptScope.object => 'Object',
        ReversePromptScope.scene => 'Scene',
      };
}

extension ReversePromptModeLabel on ReversePromptMode {
  String get value => switch (this) {
        ReversePromptMode.tags => 'tags',
        ReversePromptMode.natural => 'natural',
        ReversePromptMode.mixed => 'mixed'
      };
  String get label => switch (this) {
        ReversePromptMode.tags => 'Tags',
        ReversePromptMode.natural => 'Natural language',
        ReversePromptMode.mixed => 'Mixed'
      };
}

class GenerateResult {
  final bool ok;
  final String message;
  final List<HistoryItem> items;
  const GenerateResult(
      {required this.ok, required this.message, this.items = const []});
}

class SingleImageResult {
  final bool ok;
  final String message;
  final HistoryItem? item;
  const SingleImageResult({required this.ok, required this.message, this.item});
}

class AiCallLogEntry {
  final String id;
  final DateTime time;
  final String label;
  final String api;
  final String model;
  final String systemPrompt;
  final String userText;
  final bool ok;
  final String response;

  const AiCallLogEntry({
    required this.id,
    required this.time,
    required this.label,
    required this.api,
    required this.model,
    required this.systemPrompt,
    required this.userText,
    required this.ok,
    required this.response,
  });
}
