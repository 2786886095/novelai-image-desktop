library;

class NaiOption {
  final String label;
  final String value;
  const NaiOption(this.label, this.value);
}

const appName = 'Langbai NovelAI Studio';
const appVersion = '0.9.7';

const naiModels = <NaiOption>[
  NaiOption('NAI Diffusion 4.5 Full（完整模型）', 'nai-diffusion-4-5-full'),
  NaiOption('NAI Diffusion 4.5 Curated（精选模型）', 'nai-diffusion-4-5-curated'),
  NaiOption('NAI Diffusion 4 Full（完整模型）', 'nai-diffusion-4-full'),
  NaiOption('NAI Diffusion 4 Curated（精选模型）', 'nai-diffusion-4-curated'),
  NaiOption('NAI Diffusion 3（旧版通用）', 'nai-diffusion-3'),
  NaiOption('NAI Diffusion Furry 3（兽人模型）', 'nai-diffusion-furry-3'),
];

const naiInpaintModels = <NaiOption>[
  NaiOption('NAI Diffusion 4.5 Curated Inpaint（推荐）', 'nai-diffusion-4-5-curated-inpainting'),
  NaiOption('NAI Diffusion 4 Curated Inpaint', 'nai-diffusion-4-curated-inpainting'),
  NaiOption('NAI Diffusion 4 Full Inpaint', 'nai-diffusion-4-full-inpainting'),
  NaiOption('NAI Diffusion 3 Inpaint', 'nai-diffusion-3-inpainting'),
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
    this.variety = false,
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
        variety: j['variety'] ?? false,
        fileNamePrefix: j['fileNamePrefix'] ?? '',
      );

  GenerateParams copy() => GenerateParams.fromJson(toJson());
}

class CharCaptionItem {
  String prompt;
  bool useCoords;
  double x;
  double y;
  CharCaptionItem({this.prompt = '', this.useCoords = false, this.x = 0.5, this.y = 0.5});

  Map<String, dynamic> toJson() => {'prompt': prompt, 'useCoords': useCoords, 'x': x, 'y': y};
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
  const VibeTransferItem({required this.base64, this.infoExtracted = 0.7, this.strength = 0.6});
  Map<String, dynamic> toJson() => {'base64': base64, 'infoExtracted': infoExtracted, 'strength': strength};
}

class GenerateExtras {
  List<VibeTransferItem> vibeImages;
  List<CharCaptionItem> charCaptions;
  GenerateExtras({List<VibeTransferItem>? vibeImages, List<CharCaptionItem>? charCaptions})
      : vibeImages = vibeImages ?? [],
        charCaptions = charCaptions ?? [];

  Map<String, dynamic> toJson() => {
        'vibeImages': vibeImages.map((e) => e.toJson()).toList(),
        'charCaptions': charCaptions.map((e) => e.toJson()).toList(),
      };
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
  AugmentOptions({this.defry = 0, this.colorizePrompt = '', this.emotion = 'happy', this.emotionLevel = 0});
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
  const HistoryGroup({required this.id, required this.name, required this.createdAt});

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'createdAt': createdAt};
  factory HistoryGroup.fromJson(Map<String, dynamic> j) =>
      HistoryGroup(id: j['id'], name: j['name'] ?? '', createdAt: j['createdAt'] ?? '');
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
        params: (j['params'] is Map) ? Map<String, dynamic>.from(j['params']) : {},
      );
}

class AppSettings {
  String apiBaseUrl;
  String imageBaseUrl;
  String visionApiUrl;
  String visionApiModel;
  String convertApiUrl;
  String convertApiModel;
  bool autoComplete;
  String tagServerUrl;
  String tagServerType;
  bool mcpForReverse;
  bool mcpForConvert;
  bool darkMode;

  AppSettings({
    this.apiBaseUrl = 'https://api.novelai.net',
    this.imageBaseUrl = 'https://image.novelai.net',
    this.visionApiUrl = 'https://api.openai.com/v1',
    this.visionApiModel = 'gpt-4o',
    this.convertApiUrl = 'https://api.openai.com/v1',
    this.convertApiModel = 'gpt-4o-mini',
    this.autoComplete = true,
    this.tagServerUrl = '',
    this.tagServerType = 'rest',
    this.mcpForReverse = false,
    this.mcpForConvert = false,
    this.darkMode = false,
  });

  Map<String, dynamic> toJson() => {
        'apiBaseUrl': apiBaseUrl,
        'imageBaseUrl': imageBaseUrl,
        'visionApiUrl': visionApiUrl,
        'visionApiModel': visionApiModel,
        'convertApiUrl': convertApiUrl,
        'convertApiModel': convertApiModel,
        'autoComplete': autoComplete,
        'tagServerUrl': tagServerUrl,
        'tagServerType': tagServerType,
        'mcpForReverse': mcpForReverse,
        'mcpForConvert': mcpForConvert,
        'darkMode': darkMode,
      };

  factory AppSettings.fromJson(Map<String, dynamic> j) => AppSettings(
        apiBaseUrl: j['apiBaseUrl'] ?? 'https://api.novelai.net',
        imageBaseUrl: j['imageBaseUrl'] ?? 'https://image.novelai.net',
        visionApiUrl: j['visionApiUrl'] ?? 'https://api.openai.com/v1',
        visionApiModel: j['visionApiModel'] ?? 'gpt-4o',
        convertApiUrl: j['convertApiUrl'] ?? 'https://api.openai.com/v1',
        convertApiModel: j['convertApiModel'] ?? 'gpt-4o-mini',
        autoComplete: j['autoComplete'] ?? true,
        tagServerUrl: j['tagServerUrl'] ?? '',
        tagServerType: j['tagServerType'] ?? 'rest',
        mcpForReverse: j['mcpForReverse'] ?? false,
        mcpForConvert: j['mcpForConvert'] ?? false,
        darkMode: j['darkMode'] ?? false,
      );
}

enum ReversePromptMode { tags, natural, mixed }

extension ReversePromptModeLabel on ReversePromptMode {
  String get value => switch (this) { ReversePromptMode.tags => 'tags', ReversePromptMode.natural => 'natural', ReversePromptMode.mixed => 'mixed' };
  String get label => switch (this) { ReversePromptMode.tags => '标签', ReversePromptMode.natural => '自然语言', ReversePromptMode.mixed => '混合' };
}

class GenerateResult {
  final bool ok;
  final String message;
  final List<HistoryItem> items;
  const GenerateResult({required this.ok, required this.message, this.items = const []});
}

class SingleImageResult {
  final bool ok;
  final String message;
  final HistoryItem? item;
  const SingleImageResult({required this.ok, required this.message, this.item});
}
