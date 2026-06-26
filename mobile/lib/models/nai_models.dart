library;

class NaiOption {
  final String label;
  final String value;
  const NaiOption(this.label, this.value);
}

const appName = 'Langbai NovelAI Studio';
const appVersion = '1.0.6';

const naiModels = <NaiOption>[
  NaiOption('NAI Diffusion 4.5 Full（完整模型）', 'nai-diffusion-4-5-full'),
  NaiOption('NAI Diffusion 4.5 Curated（精选模型）', 'nai-diffusion-4-5-curated'),
  NaiOption('NAI Diffusion 4 Full（完整模型）', 'nai-diffusion-4-full'),
  NaiOption('NAI Diffusion 4 Curated（精选模型）', 'nai-diffusion-4-curated'),
  NaiOption('NAI Diffusion 3（旧版通用）', 'nai-diffusion-3'),
  NaiOption('NAI Diffusion Furry 3（兽人模型）', 'nai-diffusion-furry-3'),
];

const naiInpaintModels = <NaiOption>[
  NaiOption('NAI Diffusion 4.5 Full Inpaint（推荐）',
      'nai-diffusion-4-5-full-inpainting'),
  NaiOption('NAI Diffusion 4.5 Curated Inpaint',
      'nai-diffusion-4-5-curated-inpainting'),
  NaiOption(
      'NAI Diffusion 4 Curated Inpaint', 'nai-diffusion-4-curated-inpainting'),
  NaiOption('NAI Diffusion 4 Full Inpaint', 'nai-diffusion-4-full-inpainting'),
  NaiOption('NAI Diffusion 3 Inpaint', 'nai-diffusion-3-inpainting'),
];

const naiNoiseSchedules = <NaiOption>[
  NaiOption('Native（原生）', 'native'),
  NaiOption('Karras（常用）', 'karras'),
  NaiOption('Exponential（指数）', 'exponential'),
];

const naiSamplers = <NaiOption>[
  NaiOption('Euler Ancestral（推荐）', 'k_euler_ancestral'),
  NaiOption('Euler', 'k_euler'),
  NaiOption('DPM++ 2M', 'k_dpmpp_2m'),
  NaiOption('DPM++ 2M SDE', 'k_dpmpp_2m_sde'),
  NaiOption('DPM++ SDE', 'k_dpmpp_sde'),
  NaiOption('DPM++ 2S Ancestral', 'k_dpmpp_2s_ancestral'),
  NaiOption('DDIM', 'ddim_v3'),
];

const ucPresets = <NaiOption>[
  NaiOption('Heavy（强负面）', '0'),
  NaiOption('Light（轻负面）', '1'),
  NaiOption('Human Focus（人物优先）', '2'),
  NaiOption('None（不使用预设）', '3'),
];

const directorTools = <NaiOption>[
  NaiOption('移除背景', 'bg-removal'),
  NaiOption('线稿提取', 'lineart'),
  NaiOption('草图化', 'sketch'),
  NaiOption('上色', 'colorize'),
  NaiOption('表情迁移', 'emotion'),
  NaiOption('去除杂乱', 'declutter'),
];

const emotionOptions = <NaiOption>[
  NaiOption('中性', 'neutral'),
  NaiOption('开心', 'happy'),
  NaiOption('悲伤', 'sad'),
  NaiOption('愤怒', 'angry'),
  NaiOption('惊讶', 'surprised'),
  NaiOption('害怕', 'scared'),
  NaiOption('厌恶', 'disgusted'),
  NaiOption('惊叹', 'amazed'),
];

class SizePreset {
  final String label;
  final int width;
  final int height;
  const SizePreset(this.label, this.width, this.height);
}

const sizePresets = <SizePreset>[
  SizePreset('方形 1024×1024', 1024, 1024),
  SizePreset('横向 1216×832', 1216, 832),
  SizePreset('纵向 832×1216', 832, 1216),
  SizePreset('竖图 1024×1536', 1024, 1536),
  SizePreset('宽图 1536×1024', 1536, 1024),
  SizePreset('大方图 1472×1472', 1472, 1472),
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
    this.model = 'nai-diffusion-4-5-full',
    this.stylePrompt = '',
    this.positivePrompt = '',
    this.negativePrompt = '',
    this.width = 832,
    this.height = 1216,
    this.steps = 28,
    this.cfgScale = 6,
    this.cfgRescale = 0,
    this.sampler = 'k_euler_ancestral',
    this.noiseSchedule = 'native',
    this.seed = 0,
    this.seedMode = 'random',
    this.ucPreset = 0,
    this.qualityToggle = true,
    this.smea = false,
    this.smeaDyn = false,
    this.variety = true,
    this.fileNamePrefix = '',
  });

  bool get isV4Plus => model.startsWith('nai-diffusion-4');
  bool get isV45 => model.startsWith('nai-diffusion-4-5');

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
        model: j['model'] ?? 'nai-diffusion-4-5-full',
        stylePrompt: j['stylePrompt'] ?? '',
        positivePrompt: j['positivePrompt'] ?? '',
        negativePrompt: j['negativePrompt'] ?? '',
        width: j['width'] ?? 832,
        height: j['height'] ?? 1216,
        steps: j['steps'] ?? 28,
        cfgScale: (j['cfgScale'] ?? 6).toDouble(),
        cfgRescale: (j['cfgRescale'] ?? 0).toDouble(),
        sampler: j['sampler'] ?? 'k_euler_ancestral',
        noiseSchedule: j['noiseSchedule'] ?? 'native',
        seed: j['seed'] ?? 0,
        seedMode: j['seedMode'] ?? 'random',
        ucPreset: j['ucPreset'] ?? 0,
        qualityToggle: j['qualityToggle'] ?? true,
        smea: j['smea'] ?? false,
        smeaDyn: j['smeaDyn'] ?? false,
        variety: j['variety'] ?? true,
        fileNamePrefix: j['fileNamePrefix'] ?? '',
      );

  GenerateParams copy() => GenerateParams.fromJson(toJson());
}

class CharCaptionItem {
  String prompt;
  bool useCoords;
  double x;
  double y;
  CharCaptionItem(
      {this.prompt = '', this.useCoords = false, this.x = 0.5, this.y = 0.5});

  Map<String, dynamic> toJson() =>
      {'prompt': prompt, 'useCoords': useCoords, 'x': x, 'y': y};
  factory CharCaptionItem.fromJson(Map<String, dynamic> j) => CharCaptionItem(
        prompt: j['prompt'] ?? '',
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
    this.infoExtracted = 0.7,
    this.strength = 0.6,
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
        infoExtracted: (json['infoExtracted'] as num?)?.toDouble() ?? 0.7,
        strength: (json['strength'] as num?)?.toDouble() ?? 0.6,
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
    this.type = 'character&style',
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
        type: json['type']?.toString() ?? 'character&style',
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
  final DateTime addedAt;

  const GenerationQueueJob({
    required this.id,
    required this.params,
    required this.extras,
    required this.quotedAnlas,
    required this.addedAt,
  });

  String get label {
    final value = params.positivePrompt.trim();
    return value.isEmpty
        ? '（无提示词）'
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
  bool keepImageMetadata;
  bool saveToGallery;
  // Custom base folder for saved originals. Empty = app documents/images.
  // Images are organised as <base>/<date>/<group>/ like the desktop client.
  String imageOutputDir;
  String activeHistoryGroupId;
  bool lockStylePrompt;
  bool lockNegativePrompt;
  String savedStylePrompt;
  String savedNegativePrompt;
  String imageNameTemplate;
  List<PromptShortcutTemplate> promptShortcuts;
  Map<String, String> reversePromptTemplates;
  Map<String, String> convertPromptTemplates;
  String comicPromptTemplate;
  // Last-used tool selections, persisted so they survive an app restart
  // (mirrors the desktop "last generation state").
  String reversePromptMode;
  String convertPromptMode;
  String inpaintModel;
  double inpaintStrength;
  double inpaintNoise;
  int upscaleScale;
  String directorTool;
  double augmentDefry;
  String augmentColorizePrompt;
  String augmentEmotion;
  double augmentEmotionLevel;

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
    this.keepImageMetadata = true,
    this.saveToGallery = true,
    this.imageOutputDir = '',
    this.activeHistoryGroupId = '',
    this.lockStylePrompt = false,
    this.lockNegativePrompt = false,
    this.savedStylePrompt = '',
    this.savedNegativePrompt = '',
    this.imageNameTemplate = '{date}_{seq}_{model}',
    List<PromptShortcutTemplate>? promptShortcuts,
    Map<String, String>? reversePromptTemplates,
    Map<String, String>? convertPromptTemplates,
    this.comicPromptTemplate = '',
    this.reversePromptMode = 'tags',
    this.convertPromptMode = 'natural',
    this.inpaintModel = 'nai-diffusion-4-5-full-inpainting',
    this.inpaintStrength = 0.55,
    this.inpaintNoise = 0,
    this.upscaleScale = 2,
    this.directorTool = 'bg-removal',
    this.augmentDefry = 0,
    this.augmentColorizePrompt = '',
    this.augmentEmotion = 'happy',
    this.augmentEmotionLevel = 0,
  })  : reversePromptTemplates = reversePromptTemplates ?? {},
        convertPromptTemplates = convertPromptTemplates ?? {},
        promptShortcuts = promptShortcuts ?? [];

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
        'keepImageMetadata': keepImageMetadata,
        'saveToGallery': saveToGallery,
        'imageOutputDir': imageOutputDir,
        'activeHistoryGroupId': activeHistoryGroupId,
        'lockStylePrompt': lockStylePrompt,
        'lockNegativePrompt': lockNegativePrompt,
        'savedStylePrompt': savedStylePrompt,
        'savedNegativePrompt': savedNegativePrompt,
        'imageNameTemplate': imageNameTemplate,
        'promptShortcuts':
            promptShortcuts.map((item) => item.toJson()).toList(),
        'reversePromptTemplates': reversePromptTemplates,
        'convertPromptTemplates': convertPromptTemplates,
        'comicPromptTemplate': comicPromptTemplate,
        'reversePromptMode': reversePromptMode,
        'convertPromptMode': convertPromptMode,
        'inpaintModel': inpaintModel,
        'inpaintStrength': inpaintStrength,
        'inpaintNoise': inpaintNoise,
        'upscaleScale': upscaleScale,
        'directorTool': directorTool,
        'augmentDefry': augmentDefry,
        'augmentColorizePrompt': augmentColorizePrompt,
        'augmentEmotion': augmentEmotion,
        'augmentEmotionLevel': augmentEmotionLevel,
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
        keepImageMetadata: j['keepImageMetadata'] ?? true,
        saveToGallery: j['saveToGallery'] ?? true,
        imageOutputDir: j['imageOutputDir'] ?? '',
        activeHistoryGroupId: j['activeHistoryGroupId'] ?? '',
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
        reversePromptTemplates: _stringMap(j['reversePromptTemplates']),
        convertPromptTemplates: _stringMap(j['convertPromptTemplates']),
        comicPromptTemplate: j['comicPromptTemplate'] ?? '',
        reversePromptMode: j['reversePromptMode'] ?? 'tags',
        convertPromptMode: j['convertPromptMode'] ?? 'natural',
        inpaintModel: j['inpaintModel'] ?? 'nai-diffusion-4-5-full-inpainting',
        inpaintStrength: (j['inpaintStrength'] as num?)?.toDouble() ?? 0.55,
        inpaintNoise: (j['inpaintNoise'] as num?)?.toDouble() ?? 0,
        upscaleScale: (j['upscaleScale'] as num?)?.toInt() ?? 2,
        directorTool: j['directorTool'] ?? 'bg-removal',
        augmentDefry: (j['augmentDefry'] as num?)?.toDouble() ?? 0,
        augmentColorizePrompt: j['augmentColorizePrompt'] ?? '',
        augmentEmotion: j['augmentEmotion'] ?? 'happy',
        augmentEmotionLevel: (j['augmentEmotionLevel'] as num?)?.toDouble() ?? 0,
      );
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
        ReversePromptScope.full => '整张图片',
        ReversePromptScope.character => '角色',
        ReversePromptScope.object => '物品',
        ReversePromptScope.scene => '场景',
      };
}

extension ReversePromptModeLabel on ReversePromptMode {
  String get value => switch (this) {
        ReversePromptMode.tags => 'tags',
        ReversePromptMode.natural => 'natural',
        ReversePromptMode.mixed => 'mixed'
      };
  String get label => switch (this) {
        ReversePromptMode.tags => '标签',
        ReversePromptMode.natural => '自然语言',
        ReversePromptMode.mixed => '混合'
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
