import {
  MAX_NAI_UPSCALE_INPUT_PIXELS,
  type AccountSummary,
  type AnlasQuoteFeature,
  type AnlasQuoteResult,
  type DirectorTool,
  type GenerateExtras,
  type GenerateParams,
  type I2IParams,
  type NAIInpaintModel,
  type NAIModel,
  type UpscaleScale,
  type WorkingImage,
} from "./types";

const BASE_PIXEL_COEFFICIENT = 2951823174884865e-21;
const STEP_PIXEL_COEFFICIENT = 5753298233447344e-22;
const OPUS_FREE_MAX_PIXELS = 1024 * 1024;

function isV4Plus(model: string) {
  return model.includes("-4");
}

function isActiveOpus(account?: AccountSummary) {
  return Boolean(account?.hasActiveSubscription && (account.tierLevel ?? 0) >= 3);
}

function positiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function clamp01(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

function fitSizeWithinPixels(width: number, height: number, maxPixels: number) {
  const pixels = width * height;
  if (!width || !height || pixels <= maxPixels) return { width, height, resized: false };
  const ratio = Math.sqrt(maxPixels / pixels);
  return {
    width: Math.max(1, Math.floor(width * ratio)),
    height: Math.max(1, Math.floor(height * ratio)),
    resized: true,
  };
}

function finalizeQuote(
  feature: AnlasQuoteFeature,
  amount: number,
  account: AccountSummary | undefined,
  details: string[],
  source: AnlasQuoteResult["source"],
): AnlasQuoteResult {
  const normalized = Math.max(0, Math.ceil(amount));
  const balance = account?.anlasBalance;
  const insufficient = typeof balance === "number" && normalized > balance;
  return {
    ok: true,
    amount: normalized,
    source,
    balance,
    insufficient,
    message: insufficient
      ? `${feature} needs ${normalized} Anlas, but balance is ${balance}.`
      : `${feature} will cost ${normalized} Anlas.`,
    details,
  };
}

export function calculateImageGenerationAnlas({
  params,
  account,
  extras,
  batchCount = 1,
  action = "generate",
  strength = 1,
  forcePaid = false,
  alreadyEncodedVibes = 0,
}: {
  params: GenerateParams;
  account?: AccountSummary;
  extras?: GenerateExtras;
  batchCount?: number;
  action?: "generate" | "img2img" | "infill";
  strength?: number;
  forcePaid?: boolean;
  /** How many of the vibe references are already encoded+cached (no re-charge). */
  alreadyEncodedVibes?: number;
}): AnlasQuoteResult {
  const samples = positiveInt(batchCount, 1);
  const width = positiveInt(params.width, 512);
  const height = positiveInt(params.height, 512);
  const pixels = Math.max(width * height, 65_536);
  const steps = positiveInt(params.steps, 28);
  const normalizedStrength = action === "generate" ? 1 : clamp01(strength, 1);
  const v4Plus = isV4Plus(params.model);
  const vibeCount = extras?.vibeImages?.length ?? 0;
  const details: string[] = [];

  let basePerSample = 0;
  const opusFree =
    !forcePaid &&
    action === "generate" &&
    isActiveOpus(account) &&
    pixels <= OPUS_FREE_MAX_PIXELS &&
    steps <= 28;

  if (opusFree) {
    details.push("Opus active: base text-to-image generation is free for this size/step request.");
  } else {
    const smeaMultiplier = !v4Plus && params.smeaDyn ? 1.4 : !v4Plus && params.smea ? 1.2 : 1;
    const officialBase = Math.ceil(BASE_PIXEL_COEFFICIENT * pixels + STEP_PIXEL_COEFFICIENT * pixels * steps);
    // NovelAI caps a single image's base generation cost at 140 Anlas.
    basePerSample = Math.min(140, Math.max(2, Math.ceil(officialBase * smeaMultiplier * normalizedStrength)));
    details.push(`Base image price: ${basePerSample} Anlas each by the official frontend formula.`);
  }

  let total = basePerSample * samples;

  if (v4Plus && vibeCount > 0) {
    // Per the official docs, encoding an image into a vibe is a ONE-TIME fee of
    // 2 Anlas (the encoding is deterministic and cached), so it is NOT multiplied
    // by the batch/request count — and references already encoded+cached this
    // session incur NO further encode charge, so only count the un-encoded ones.
    const toEncode = Math.max(0, vibeCount - Math.min(vibeCount, alreadyEncodedVibes));
    const encodeCost = 2 * toEncode;
    total += encodeCost;
    details.push(
      `V4+ Vibe encoding (one-time): ${toEncode} of ${vibeCount} image(s) x 2 Anlas = ${encodeCost}` +
        `${alreadyEncodedVibes > 0 ? `（${Math.min(vibeCount, alreadyEncodedVibes)} 张已缓存，不再计费）` : ""}.`,
    );
    if (vibeCount > 4) {
      // The >4-vibe surcharge is added "to the generation", i.e. per request.
      const multiVibeCost = 2 * (vibeCount - 4) * samples;
      total += multiVibeCost;
      details.push(`Extra Vibe fee above 4 references: ${multiVibeCost} Anlas.`);
    }
  }

  // Precise / Director references (V4.5): the official docs charge "an additional
  // cost of 5 Anlas to each image generation" — a FLAT 5 per generated image when
  // the feature is used, NOT per reference. So it scales with the request/batch
  // count only, regardless of how many references are attached.
  // Precise Reference is V4.5-only (per the docs), and the main process drops it
  // on other models — so only charge it for V4.5 to avoid over-quoting.
  const preciseCount = extras?.preciseReferences?.length ?? 0;
  if (v4Plus && params.model.includes("4-5") && preciseCount > 0) {
    const preciseCost = 5 * samples;
    total += preciseCost;
    details.push(`Precise reference: 5 Anlas x ${samples} image(s) = ${preciseCost} (flat per image, ${preciseCount} ref attached).`);
  }

  return finalizeQuote(action === "generate" ? "generate" : action === "img2img" ? "i2i" : "inpaint", total, account, details, "estimate-formula");
}

export function calculateUpscaleAnlas({
  image,
  account,
  scale,
}: {
  image?: Pick<WorkingImage, "width" | "height"> | null;
  account?: AccountSummary;
  scale?: UpscaleScale;
}): AnlasQuoteResult {
  if (!image?.width || !image?.height) {
    return { ok: false, source: "unavailable", message: "请先加载要超分的图片，才能读取生成前扣费。" };
  }
  const prepared = fitSizeWithinPixels(image.width, image.height, MAX_NAI_UPSCALE_INPUT_PIXELS);
  const pixels = prepared.width * prepared.height;
  const details = [
    prepared.resized
      ? `Input is pre-shrunk for NovelAI upscale: ${image.width}x${image.height} -> ${prepared.width}x${prepared.height}.`
      : `Input size used for upscale quote: ${prepared.width}x${prepared.height}.`,
    `Upscale scale: ${scale ?? 4}x.`,
  ];
  if (isActiveOpus(account) && pixels <= 409_600) {
    details.push("Opus active: official upscale tier is free for this input size.");
    return finalizeQuote("upscale", 0, account, details, "estimate-formula");
  }
  let amount = -3;
  if (pixels <= 262_144) amount = 1;
  else if (pixels <= 409_600) amount = 2;
  else if (pixels <= 524_288) amount = 3;
  else if (pixels <= 786_432) amount = 5;
  else if (pixels <= 1_048_576) amount = 7;
  if (amount < 0) {
    return {
      ok: false,
      source: "unavailable",
      balance: account?.anlasBalance,
      message: "图片分辨率超过 NovelAI 云端超分的报价范围。",
      details,
    };
  }
  return finalizeQuote("upscale", amount, account, details, "estimate-formula");
}

export function calculateDirectorAnlas({
  tool,
  account,
}: {
  tool?: DirectorTool;
  account?: AccountSummary;
}): AnlasQuoteResult {
  const amount = tool === "bg-removal" ? 65 : 0;
  const details =
    tool === "bg-removal"
      ? ["Background removal is a fixed 65 Anlas director-tool request."]
      : ["This director tool is currently free in NovelAI's director-tool pricing."];
  return finalizeQuote("director", amount, account, details, "estimate-fixed");
}

export function calculateFeatureAnlasQuote({
  feature,
  params,
  extras,
  batchCount,
  i2iParams,
  inpaintModel,
  inpaintStrength,
  account,
  image,
  upscaleScale,
  directorTool,
  alreadyEncodedVibes = 0,
}: {
  feature: AnlasQuoteFeature;
  params?: GenerateParams;
  extras?: GenerateExtras;
  batchCount?: number;
  i2iParams?: I2IParams;
  inpaintModel?: NAIInpaintModel;
  inpaintStrength?: number;
  account?: AccountSummary;
  image?: Pick<WorkingImage, "width" | "height"> | null;
  upscaleScale?: UpscaleScale;
  directorTool?: DirectorTool;
  alreadyEncodedVibes?: number;
}): AnlasQuoteResult {
  if (feature === "upscale") {
    return calculateUpscaleAnlas({ image, account, scale: upscaleScale });
  }
  if (feature === "director") {
    return calculateDirectorAnlas({ tool: directorTool, account });
  }
  if (!params) {
    return { ok: false, source: "unavailable", message: "Missing generation parameters for Anlas quote." };
  }
  if (feature === "i2i") {
    return calculateImageGenerationAnlas({
      params,
      account,
      extras,
      alreadyEncodedVibes,
      batchCount: 1,
      action: "img2img",
      strength: i2iParams?.strength ?? 1,
    });
  }
  if (feature === "inpaint") {
    const model = (inpaintModel?.replace(/-inpainting$/, "") || params.model) as NAIModel;
    const inpaintParams = {
      ...params,
      model,
      width: image?.width ? Math.max(64, Math.ceil(image.width / 64) * 64) : params.width,
      height: image?.height ? Math.max(64, Math.ceil(image.height / 64) * 64) : params.height,
    };
    return calculateImageGenerationAnlas({
      params: inpaintParams,
      account,
      extras: { vibeImages: [], charCaptions: [] },
      batchCount: 1,
      action: "infill",
      strength: inpaintStrength ?? 1,
    });
  }
  return calculateImageGenerationAnlas({ params, account, extras, batchCount, action: "generate", alreadyEncodedVibes });
}
