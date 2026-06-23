import 'dart:math';

import '../models/nai_models.dart';

const _basePixelCoefficient = 2951823174884865e-21;
const _stepPixelCoefficient = 5753298233447344e-22;
const _opusFreeMaxPixels = 1024 * 1024;

enum AnlasQuoteSource { officialApi, estimateFormula, unavailable }

class AnlasQuote {
  final bool ok;
  final int? amount;
  final AnlasQuoteSource source;
  final int? balance;
  final bool insufficient;
  final String message;
  final List<String> details;

  const AnlasQuote({
    required this.ok,
    required this.source,
    required this.message,
    this.amount,
    this.balance,
    this.insufficient = false,
    this.details = const [],
  });

  AnlasQuote asOfficial(int officialAmount, {int samples = 1}) {
    final total = (max(0, officialAmount) * max(1, samples)).toInt();
    return AnlasQuote(
      ok: true,
      amount: total,
      source: AnlasQuoteSource.officialApi,
      balance: balance,
      insufficient: balance != null && total > balance!,
      message: '生成前官方报价：$total Anlas。',
      details: [
        'NovelAI request-price 返回每张 $officialAmount Anlas。',
        if (samples > 1) '$officialAmount x $samples 张 = $total Anlas。',
      ],
    );
  }
}

AnlasQuote calculateImageGenerationAnlas({
  required GenerateParams params,
  AccountSummary? account,
  GenerateExtras? extras,
  int batchCount = 1,
  bool imageToImage = false,
  double strength = 1,
  bool forcePaid = false,
  int alreadyEncodedVibes = 0,
  int preciseReferenceCount = 0,
}) {
  final samples = max(1, batchCount.floor());
  final width = max(1, params.width);
  final height = max(1, params.height);
  final pixels = max(width * height, 65536);
  final steps = max(1, params.steps);
  final normalizedStrength = imageToImage ? strength.clamp(0, 1) : 1.0;
  final v4Plus = params.model.contains('-4');
  final vibeCount = extras?.vibeImages.length ?? 0;
  final details = <String>[];

  final activeOpus =
      account?.hasActiveSubscription == true && (account?.tierLevel ?? 0) >= 3;
  final opusFree = !forcePaid &&
      !imageToImage &&
      activeOpus &&
      pixels <= _opusFreeMaxPixels &&
      steps <= 28;

  var basePerSample = 0;
  if (opusFree) {
    details.add('Opus：当前尺寸和步数的文生图基础费用为 0。');
  } else {
    final smeaMultiplier = !v4Plus && params.smeaDyn
        ? 1.4
        : !v4Plus && params.smea
            ? 1.2
            : 1.0;
    final officialBase = (_basePixelCoefficient * pixels +
            _stepPixelCoefficient * pixels * steps)
        .ceil();
    basePerSample = min(
      140,
      max(2, (officialBase * smeaMultiplier * normalizedStrength).ceil()),
    );
    details.add('基础费用：每张 $basePerSample Anlas。');
  }

  var total = basePerSample * samples;
  if (v4Plus && vibeCount > 0) {
    final cached = min(vibeCount, max(0, alreadyEncodedVibes));
    final toEncode = max(0, vibeCount - cached);
    final encodeCost = toEncode * 2;
    total += encodeCost;
    details.add('Vibe 一次性编码：$toEncode 张 x 2 = $encodeCost Anlas。');
    if (vibeCount > 4) {
      final extra = 2 * (vibeCount - 4) * samples;
      total += extra;
      details.add('超过 4 张 Vibe 的附加费：$extra Anlas。');
    }
  }

  if (v4Plus && params.model.contains('4-5') && preciseReferenceCount > 0) {
    final preciseCost = 5 * samples;
    total += preciseCost;
    details.add('精准参考：$samples 张 x 5 = $preciseCost Anlas。');
  }

  final amount = max(0, total.ceil());
  final balance = account?.anlasBalance;
  final insufficient = balance != null && amount > balance;
  return AnlasQuote(
    ok: true,
    amount: amount,
    source: AnlasQuoteSource.estimateFormula,
    balance: balance,
    insufficient: insufficient,
    message: insufficient
        ? '需要 $amount Anlas，当前余额 $balance Anlas。'
        : '预计需要 $amount Anlas。',
    details: details,
  );
}

int? extractOfficialAnlasPrice(Object? data) {
  if (data is num && data.isFinite) return max(0, data.ceil());
  if (data is String) {
    final parsed = num.tryParse(data);
    if (parsed != null && parsed.isFinite) return max(0, parsed.ceil());
  }
  if (data is! Map) return null;
  const directKeys = [
    'price',
    'cost',
    'amount',
    'anlas',
    'requestPrice',
    'trainingSteps',
    'trainingStepsCost',
  ];
  for (final key in directKeys) {
    final value = extractOfficialAnlasPrice(data[key]);
    if (value != null) return value;
  }
  for (final key in const ['data', 'result', 'subscription']) {
    final value = extractOfficialAnlasPrice(data[key]);
    if (value != null) return value;
  }
  return null;
}

AnlasQuote calculateInpaintAnlas({
  required GenerateParams params,
  required AccountSummary account,
  required WorkingImage? image,
  required String inpaintModel,
  double strength = 1,
}) {
  if (image == null || image.width <= 0 || image.height <= 0) {
    return const AnlasQuote(
      ok: false,
      source: AnlasQuoteSource.unavailable,
      message: '请先加载要重绘的图片',
    );
  }
  final quoteParams = params.copy()
    ..model = inpaintModel.replaceFirst(RegExp(r'-inpainting$'), '')
    ..width = max(64, (image.width / 64).ceil() * 64)
    ..height = max(64, (image.height / 64).ceil() * 64);
  return calculateImageGenerationAnlas(
    params: quoteParams,
    account: account,
    extras: GenerateExtras(),
    imageToImage: true,
    strength: strength,
  );
}

AnlasQuote calculateUpscaleAnlas({
  required WorkingImage? image,
  required AccountSummary account,
}) {
  if (image == null || image.width <= 0 || image.height <= 0) {
    return const AnlasQuote(
      ok: false,
      source: AnlasQuoteSource.unavailable,
      message: '请先加载要超分的图片',
    );
  }
  const maxPixels = 1024 * 1024;
  final originalPixels = image.width * image.height;
  final ratio =
      originalPixels <= maxPixels ? 1.0 : sqrt(maxPixels / originalPixels);
  final width = max(1, (image.width * ratio).floor());
  final height = max(1, (image.height * ratio).floor());
  final pixels = width * height;
  final details = <String>[
    if (ratio < 1)
      '超分前需缩小：${image.width}x${image.height} -> ${width}x$height。'
    else
      '报价输入尺寸：${image.width}x${image.height}。',
  ];
  final activeOpus =
      account.hasActiveSubscription == true && (account.tierLevel ?? 0) >= 3;
  var amount = -1;
  if (activeOpus && pixels <= 409600) {
    amount = 0;
  } else if (pixels <= 262144) {
    amount = 1;
  } else if (pixels <= 409600) {
    amount = 2;
  } else if (pixels <= 524288) {
    amount = 3;
  } else if (pixels <= 786432) {
    amount = 5;
  } else if (pixels <= 1048576) {
    amount = 7;
  }
  if (amount < 0) {
    return AnlasQuote(
      ok: false,
      source: AnlasQuoteSource.unavailable,
      balance: account.anlasBalance,
      message: '图片分辨率超过 NovelAI 云端超分报价范围',
      details: details,
    );
  }
  final balance = account.anlasBalance;
  return AnlasQuote(
    ok: true,
    amount: amount,
    source: AnlasQuoteSource.estimateFormula,
    balance: balance,
    insufficient: balance != null && amount > balance,
    message: '超分预计需要 $amount Anlas。',
    details: details,
  );
}

AnlasQuote calculateDirectorAnlas({
  required String tool,
  required AccountSummary account,
}) {
  final amount = tool == 'bg-removal' ? 65 : 0;
  final balance = account.anlasBalance;
  return AnlasQuote(
    ok: true,
    amount: amount,
    source: AnlasQuoteSource.estimateFormula,
    balance: balance,
    insufficient: balance != null && amount > balance,
    message: amount == 0 ? '当前后期工具免费。' : '移除背景固定需要 65 Anlas。',
    details: [
      amount == 0 ? '当前 Director 工具费用为 0。' : '背景移除固定费用 65 Anlas。',
    ],
  );
}
