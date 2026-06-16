/// Ported from the desktop client's src/types.ts — the subset needed for the
/// Phase 1 mobile text-to-image flow.
library;

class NaiOption {
  final String label;
  final String value;
  const NaiOption(this.label, this.value);
}

const naiModels = <NaiOption>[
  NaiOption('NAI Diffusion 4.5 Full（完整模型）', 'nai-diffusion-4-5-full'),
  NaiOption('NAI Diffusion 4.5 Curated（精选模型）', 'nai-diffusion-4-5-curated'),
  NaiOption('NAI Diffusion 4 Full（完整模型）', 'nai-diffusion-4-full'),
  NaiOption('NAI Diffusion 4 Curated（精选模型）', 'nai-diffusion-4-curated'),
  NaiOption('NAI Diffusion 3（旧版通用）', 'nai-diffusion-3'),
  NaiOption('NAI Diffusion Furry 3（兽人模型）', 'nai-diffusion-furry-3'),
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

/// UC (negative) presets — index matches the NovelAI ucPreset enum.
const ucPresets = <NaiOption>[
  NaiOption('Heavy（强负面）', '0'),
  NaiOption('Light（轻负面）', '1'),
  NaiOption('Human Focus（人物优先）', '2'),
  NaiOption('None（不使用预设）', '3'),
];

/// Common resolution presets (width x height).
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
  int ucPreset;
  bool qualityToggle;
  bool smea;
  bool smeaDyn;
  bool variety;

  GenerateParams({
    this.model = 'nai-diffusion-4-5-full',
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
    this.ucPreset = 0,
    this.qualityToggle = true,
    this.smea = false,
    this.smeaDyn = false,
    this.variety = false,
  });

  bool get isV4Plus => model.startsWith('nai-diffusion-4');
  bool get isV45 => model.startsWith('nai-diffusion-4-5');

  Map<String, dynamic> toJson() => {
        'model': model,
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
        'ucPreset': ucPreset,
        'qualityToggle': qualityToggle,
        'smea': smea,
        'smeaDyn': smeaDyn,
        'variety': variety,
      };

  factory GenerateParams.fromJson(Map<String, dynamic> j) => GenerateParams(
        model: j['model'] ?? 'nai-diffusion-4-5-full',
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
        ucPreset: j['ucPreset'] ?? 0,
        qualityToggle: j['qualityToggle'] ?? true,
        smea: j['smea'] ?? false,
        smeaDyn: j['smeaDyn'] ?? false,
        variety: j['variety'] ?? false,
      );

  GenerateParams copy() => GenerateParams.fromJson(toJson());
}

class AccountSummary {
  final bool hasToken;
  final String? tierName;
  final int? tierLevel;
  final int? anlasBalance;
  const AccountSummary({
    this.hasToken = false,
    this.tierName,
    this.tierLevel,
    this.anlasBalance,
  });
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
  });

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
      );
}

class GenerateResult {
  final bool ok;
  final String message;
  final HistoryItem? item;
  const GenerateResult({required this.ok, required this.message, this.item});
}
