import type { ArtistTagRecord, ArtistWeightedTag } from "./artist-lab";
import { ARTIST_TAG_ALIASES } from "./curated-artists";
import { sampleControlledWeight, softBalanceWeights, type WeightDistributionConfig } from "./weight-distribution";

export type RecipeTokenKind = "artist" | "year" | "quality" | "negative" | "style" | "other";

export interface ParsedRecipeToken {
  raw: string;
  value: string;
  weight: number;
  kind: RecipeTokenKind;
}

export interface RandomArtistRecipeOptions {
  count: number;
  minArtists: number;
  maxArtists: number;
  artistWeightMin?: number;
  artistWeightMax?: number;
  artistWeightDistribution?: WeightDistributionConfig;
  auxiliaryPrompt?: string;
  customTagPool?: string;
  /** Per-tag inclusion policy. Missing entries remain backward-compatible and
   * are included in every recipe. Keys are normalized lowercase tag values. */
  customTagModes?: Record<string, CustomTagMode>;
  minRandomCustomTags?: number;
  maxRandomCustomTags?: number;
  customTagWeightMin?: number;
  customTagWeightMax?: number;
  mutateAuxiliary: boolean;
  includeFranchiseStyles?: boolean;
  minFranchiseStyles?: number;
  maxFranchiseStyles?: number;
  franchiseWeightMin?: number;
  franchiseWeightMax?: number;
  favoriteArtists?: string[];
  favoriteMutations?: StyleMutationToken[];
  random?: () => number;
}

export type ArtistWeightTuneTagOptions = Pick<
  RandomArtistRecipeOptions,
  | "customTagPool"
  | "customTagModes"
  | "minRandomCustomTags"
  | "maxRandomCustomTags"
  | "customTagWeightMin"
  | "customTagWeightMax"
>;

export interface ArtistMatchRecipeOptions {
  count: number;
  round: number;
  eliteArtists?: readonly (readonly ArtistWeightedTag[])[];
  seenPrompts?: ReadonlySet<string>;
  maxArtists?: number;
  random?: () => number;
}

export type CustomTagMode = "always" | "random";

export interface GeneratedArtistRecipe {
  id: string;
  artists: ArtistWeightedTag[];
  auxiliary: ParsedRecipeToken[];
  mutations: StyleMutationToken[];
  franchiseStyles: FranchiseStyleToken[];
  basePrompt: string;
  prompt: string;
  /** Search action used by target-style matching. */
  move?: "probe" | "weight" | "ablate" | "expand" | "cross";
}

export type StyleMutationCategory = "artStyle" | "medium" | "color" | "lighting";

export interface StyleMutationToken extends ParsedRecipeToken {
  category: StyleMutationCategory;
}

export interface FranchiseStyleToken extends ParsedRecipeToken {
  kind: "style";
  category: "franchise";
}

export type ArtistRecipeVariant = "plain" | "mutated";

export interface ArtistRecipeComparison extends GeneratedArtistRecipe {
  pairId: string;
  variant: ArtistRecipeVariant;
}

/**
 * Curated NovelAI/Danbooru-friendly visual vocabulary. This is deliberately
 * limited to rendering style rather than composition or character content, so
 * a draw can compare artist strings without silently changing the subject.
 */
export const STYLE_MUTATION_LIBRARY: Record<StyleMutationCategory, readonly string[]> = {
  artStyle: [
    "anime coloring", "anime screencap", "art nouveau", "baroque", "concept art", "contemporary",
    "cubism", "expressionism", "fantasy art", "game cg", "impressionism", "minimalism", "modernism",
    "pop art", "realism", "retro artstyle", "romanticism", "semi-realistic", "surrealism", "ukiyo-e",
    "visual novel art", "western comics", "storybook illustration", "editorial illustration", "poster art",
  ],
  medium: [
    "acrylic paint", "airbrush", "charcoal drawing", "colored pencil", "digital painting", "fine lineart",
    "gouache", "graphite", "impasto", "ink (medium)", "ink wash", "marker", "oil painting (medium)", "pastel", "pencil sketch",
    "rough sketch", "thick lineart", "thin lineart", "visible brushstrokes", "watercolor (medium)", "woodcut",
    "cel shading", "soft shading", "painterly", "textured brush", "dry brush", "wet-on-wet", "stippling",
  ],
  color: [
    "analogous colors", "black and white", "bright colors", "chromatic aberration", "colorful",
    "complementary colors", "cool color palette", "cyan and magenta", "dark colors", "desaturated",
    "duotone", "earth tones", "gradient", "high contrast", "limited palette", "low contrast", "monochrome",
    "muted colors", "neon colors", "pastel colors", "sepia", "split-complementary colors", "vibrant colors",
    "warm color palette", "blue and orange", "gold and white", "iridescent colors", "rainbow gradient",
  ],
  lighting: [
    "ambient lighting", "backlighting", "bioluminescence", "blue hour", "bounced light", "chiaroscuro",
    "cinematic lighting", "dappled sunlight", "dramatic lighting", "edge lighting", "fill light", "firelight",
    "global illumination", "glowing light", "god rays", "golden hour", "hard lighting", "key light",
    "lens flare", "moonlight", "neon lighting", "overcast lighting", "rim lighting", "soft lighting",
    "spotlight", "studio lighting", "sunlight", "underlighting", "volumetric lighting", "window light",
  ],
};

/**
 * Current high-volume Danbooru copyright tags, checked against the public
 * category-3 count ranking on 2026-08-25. Copyright tags are optional style
 * references, not a promise that NovelAI will preserve the requested subject.
 */
export const FRANCHISE_STYLE_LIBRARY = [
  "touhou", "kantai_collection", "blue_archive", "pokemon", "fate_(series)",
  "genshin_impact", "fate/grand_order", "idolmaster", "umamusume", "arknights",
  "vocaloid", "honkai_(series)", "azur_lane", "honkai:_star_rail", "love_live!",
  "fire_emblem", "zenless_zone_zero", "final_fantasy", "mahou_shoujo_madoka_magica",
  "girls'_frontline", "girls_und_panzer", "gundam", "danganronpa_(series)", "precure",
  "kemono_friends", "bang_dream!", "wuthering_waves", "jojo_no_kimyou_na_bouken",
  "one_piece", "honkai_impact_3rd",
] as const;

const QUALITY_PATTERN = /^(masterpiece|best quality|amazing quality|very aesthetic|extremely detailed(?: cg)?|ultra[- ]?detailed|high quality)$/i;
const YEAR_PATTERN = /^year[_ ]?\d{4}$/i;
const NEGATIVE_PATTERN = /^(no\s+|negative\s+|avoid\s+|-\d+(?:\.\d+)?::)/i;
const STYLE_PATTERN = /(style|realism|impasto|illustration|painting|lineart|lighting|shading|cg|photorealistic|monochrome|sketch|watercolor)/i;

function roundWeight(value: number): number {
  return Math.round(Math.max(-10, Math.min(10, value)) * 100) / 100;
}

export function canonicalArtistTagName(raw: string): string {
  const normalized = raw
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return ARTIST_TAG_ALIASES[normalized] ?? normalized;
}

function classify(value: string): RecipeTokenKind {
  const normalized = value.trim();
  if (/^artist\s*:/i.test(normalized)) return "artist";
  if (YEAR_PATTERN.test(normalized)) return "year";
  if (QUALITY_PATTERN.test(normalized)) return "quality";
  if (NEGATIVE_PATTERN.test(normalized)) return "negative";
  if (STYLE_PATTERN.test(normalized)) return "style";
  return "other";
}

/**
 * Parse both legacy bracket emphasis and V4 numerical emphasis. Full-width
 * punctuation is normalized, while the original input remains untouched by
 * callers so tolerant NovelAI prompts can always be restored verbatim.
 */
export function parseArtistRecipe(input: string): ParsedRecipeToken[] {
  const source = input.normalize("NFKC").replace(/\u00a0/g, " ").replace(/[，、；;]/g, ",");
  const output: ParsedRecipeToken[] = [];
  let token = "";
  let curly = 0;
  let square = 0;
  let startingLevel: number | null = null;
  let numericWeight: number | null = null;

  const flush = () => {
    let raw = token.trim().replace(/^,+|,+$/g, "").trim();
    token = "";
    if (!raw || raw === "::") {
      startingLevel = null;
      return;
    }
    const numericStart = raw.match(/^(-?\d+(?:\.\d+)?)\s*::\s*([\s\S]*)$/);
    if (numericStart) {
      numericWeight = Number(numericStart[1]);
      raw = numericStart[2].trim();
    }
    const closesNumeric = raw.endsWith("::");
    if (closesNumeric) raw = raw.slice(0, -2).trim();
    if (raw) {
      const weight = numericWeight ?? Math.pow(1.05, startingLevel ?? (curly - square));
      const value = raw.replace(/^\((.*)\)$/s, "$1").trim();
      output.push({ raw, value, weight: roundWeight(weight), kind: weight < 0 ? "negative" : classify(value) });
    }
    if (closesNumeric) numericWeight = null;
    startingLevel = null;
  };

  for (const char of source) {
    if (char === "{") { curly += 1; continue; }
    if (char === "}") { curly = Math.max(0, curly - 1); continue; }
    if (char === "[") { square += 1; continue; }
    if (char === "]") { square = Math.max(0, square - 1); continue; }
    if (char === ",") { flush(); continue; }
    if (startingLevel === null && !/\s/.test(char)) startingLevel = curly - square;
    token += char;
  }
  flush();
  return output;
}

function weightedChoice<T>(items: T[], weights: number[], random: () => number): number {
  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return Math.floor(random() * items.length);
  let cursor = random() * total;
  for (let index = 0; index < items.length; index += 1) {
    cursor -= Math.max(0, weights[index]);
    if (cursor <= 0) return index;
  }
  return items.length - 1;
}

function chooseDistinctArtists(
  pool: ArtistTagRecord[],
  size: number,
  favorites: Set<string>,
  random: () => number,
): ArtistTagRecord[] {
  const available = [...pool];
  const selected: ArtistTagRecord[] = [];
  while (available.length > 0 && selected.length < size) {
    const weights = available.map((artist) => {
      // Popularity is a prior, not a monopoly: sqrt compresses the long tail.
      const popularity = Math.sqrt(Math.max(1, artist.postCount));
      return popularity * (favorites.has(artist.name) ? 4 : 1);
    });
    const index = weightedChoice(available, weights, random);
    selected.push(available[index]);
    available.splice(index, 1);
  }
  return selected;
}

function normalizedWeightBounds(rawMin: number | undefined, rawMax: number | undefined, defaults: [number, number]): [number, number] {
  const left = Number.isFinite(rawMin) ? Number(rawMin) : defaults[0];
  const right = Number.isFinite(rawMax) ? Number(rawMax) : defaults[1];
  const min = Math.max(0.1, Math.min(10, Math.min(left, right)));
  const max = Math.max(min, Math.max(0.1, Math.min(10, Math.max(left, right))));
  return [min, max];
}

function chooseWeight(
  role: "lead" | "support" | "accent",
  min: number,
  max: number,
  random: () => number,
): number {
  const span = max - min;
  const ratio = role === "lead"
    ? 0.65 + random() * 0.35
    : role === "support"
      ? 0.25 + random() * 0.6
      : random() * 0.4;
  return roundWeight(min + span * ratio);
}

function formatToken(token: ParsedRecipeToken): string {
  if (Math.abs(token.weight - 1) < 0.001) return token.value;
  return `${roundWeight(token.weight)}::${token.value} ::`;
}

export function formatArtistString(
  artists: readonly ArtistWeightedTag[],
): string {
  const value = artists
    .map((artist) => `${roundWeight(artist.weight)}::artist:${canonicalArtistTagName(artist.name)} ::`)
    .join(", ");
  return value ? `${value},` : "";
}

/** Copy the exact artist-recipe string shown on a result card, including
 * optional franchise, auxiliary, and mutation tags. */
export function formatArtistCardTags(
  recipe: Pick<GeneratedArtistRecipe, "prompt">,
): string {
  return ensureTrailingPromptComma(recipe.prompt);
}

/** Normalize copied/displayed prompt text to exactly one trailing comma. */
export function ensureTrailingPromptComma(value: string): string {
  const normalized = value.trim().replace(/[，,]+\s*$/, "");
  return normalized ? `${normalized},` : "";
}

export function formatArtistFullPrompt(
  recipe: Pick<GeneratedArtistRecipe, "artists" | "mutations" | "auxiliary"> & Partial<Pick<GeneratedArtistRecipe, "franchiseStyles" | "prompt">>,
  basePrompt: string,
): string {
  // Prefer the exact card prompt when available. Besides preserving the
  // original tag order, this keeps repair/draw candidates identical between
  // what users see and what the copy button places on the clipboard.
  if (recipe.prompt?.trim()) {
    return ensureTrailingPromptComma(
      [recipe.prompt.trim().replace(/[，,]+\s*$/, ""), basePrompt.trim()]
        .filter(Boolean)
        .join(", "),
    );
  }
  const artistText = formatArtistString(recipe.artists);
  const franchiseText = (recipe.franchiseStyles ?? []).map(formatToken).join(", ");
  const mutationText = recipe.mutations.map(formatToken).join(", ");
  const auxiliaryText = recipe.auxiliary.map(formatToken).join(", ");
  return ensureTrailingPromptComma(
    [artistText.replace(/,$/, ""), franchiseText, mutationText, auxiliaryText, basePrompt.trim()]
      .filter(Boolean)
      .join(", ")
      .trim(),
  );
}

export function randomizeArtistRecipeWeights(
  input: string,
  count: number,
  variationPercent = 20,
  random: () => number = Math.random,
  tagOptions: ArtistWeightTuneTagOptions = {},
): GeneratedArtistRecipe[] {
  const source = parseArtistRecipe(input)
    .filter((token) => token.kind === "artist" && token.weight > 0)
    .map((token) => ({
      name: canonicalArtistTagName(token.value.replace(/^artist\s*:/i, "")),
      weight: token.weight,
    }))
    .filter((artist) => artist.name);
  if (!source.length) return [];
  const total = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  const ratio = Math.max(0, Math.min(100, variationPercent)) / 100;
  const customTagPool = parseCustomTagPool(tagOptions.customTagPool ?? "");
  return Array.from({ length: total }, (_, index) => {
    const artists = source.map((artist) => ({
      name: artist.name,
      weight: roundWeight(
        Math.max(
          0.1,
          Math.min(10, artist.weight * (1 + (random() * 2 - 1) * ratio)),
        ),
      ),
    }));
    const artistText = formatArtistString(artists).replace(/,$/, "");
    const selectedCustomTagPool = selectCustomTagPool(
      random,
      customTagPool,
      tagOptions.customTagModes,
      tagOptions.minRandomCustomTags,
      tagOptions.maxRandomCustomTags,
    );
    const auxiliary = drawCustomTags(
      random,
      selectedCustomTagPool,
      tagOptions.customTagWeightMin ?? 0.2,
      tagOptions.customTagWeightMax ?? 1.2,
    );
    const auxiliaryText = auxiliary.map(formatToken).join(", ");
    const prompt = [artistText, auxiliaryText].filter(Boolean).join(", ");
    return {
      id: `weight-tune-${index + 1}-${artists.map((artist) => `${artist.name}@${artist.weight}`).join("+")}-${auxiliary.map((tag) => `${tag.value}@${tag.weight}`).join("+")}`,
      artists,
      auxiliary,
      mutations: [],
      franchiseStyles: [],
      basePrompt: prompt,
      prompt,
    };
  });
}

function drawFranchiseStyles(
  random: () => number,
  minCount: number,
  maxCount: number,
  minWeight: number,
  maxWeight: number,
): FranchiseStyleToken[] {
  const lower = Math.max(0, Math.min(FRANCHISE_STYLE_LIBRARY.length, Math.floor(Math.min(minCount, maxCount))));
  const upper = Math.max(lower, Math.min(FRANCHISE_STYLE_LIBRARY.length, Math.floor(Math.max(minCount, maxCount))));
  const count = lower + Math.floor(random() * (upper - lower + 1));
  const available = [...FRANCHISE_STYLE_LIBRARY];
  const output: FranchiseStyleToken[] = [];
  while (output.length < count && available.length > 0) {
    const index = Math.min(available.length - 1, Math.floor(random() * available.length));
    const value = available.splice(index, 1)[0];
    const weight = roundWeight(minWeight + random() * (maxWeight - minWeight));
    output.push({ raw: value, value, weight, kind: "style", category: "franchise" });
  }
  return output;
}

function drawStyleMutations(
  random: () => number,
  favoriteMutations: StyleMutationToken[] = [],
): StyleMutationToken[] {
  const categories = Object.keys(STYLE_MUTATION_LIBRARY) as StyleMutationCategory[];
  const preferred = favoriteMutations.filter((token) => (
    categories.includes(token.category)
    && Boolean(token.value.trim())
    && Number.isFinite(token.weight)
  ));
  const count = 2 + Math.floor(random() * 5);
  const selected = new Set<string>();
  const output: StyleMutationToken[] = [];
  while (output.length < count) {
    const availablePreferred = preferred.filter((token) => !selected.has(token.value));
    const favorite = availablePreferred.length > 0 && random() < 0.6
      ? availablePreferred[Math.floor(random() * availablePreferred.length)]
      : undefined;
    const category = favorite?.category ?? categories[Math.floor(random() * categories.length)];
    const terms = STYLE_MUTATION_LIBRARY[category];
    const value = favorite?.value ?? terms[Math.floor(random() * terms.length)];
    if (selected.has(value)) continue;
    selected.add(value);
    const weight = favorite
      ? roundWeight(Math.max(0.3, Math.min(1.5, favorite.weight)))
      : roundWeight(0.3 + Math.floor(random() * 13) / 10);
    output.push({ raw: value, value, weight, kind: "style", category });
  }
  return output;
}

function parseCustomTagPool(input: string): ParsedRecipeToken[] {
  const seen = new Set<string>();
  return parseArtistRecipe(input.replace(/[\r\n]+/g, ","))
    .filter((token) => {
      const key = token.value.trim().toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function parseCustomTagPoolValues(input: string): string[] {
  return parseCustomTagPool(input).map((token) => token.value);
}

export function toggleCustomTagInPool(input: string, tag: string): string {
  const values = parseCustomTagPoolValues(input);
  const target = tag.trim().toLocaleLowerCase();
  const selected = values.some((value) => value.toLocaleLowerCase() === target);
  return (selected
    ? values.filter((value) => value.toLocaleLowerCase() !== target)
    : [...values, tag.trim()]
  ).join(", ");
}

function drawCustomTags(
  random: () => number,
  pool: ParsedRecipeToken[],
  minWeight: number,
  maxWeight: number,
): ParsedRecipeToken[] {
  const [lower, upper] = normalizedWeightBounds(minWeight, maxWeight, [0.2, 1.2]);
  return pool.map((token) => ({
    ...token,
    weight: roundWeight(lower + random() * (upper - lower)),
  }));
}

function selectCustomTagPool(
  random: () => number,
  pool: ParsedRecipeToken[],
  modes: Record<string, CustomTagMode> | undefined,
  minRandom: number | undefined,
  maxRandom: number | undefined,
): ParsedRecipeToken[] {
  const always: ParsedRecipeToken[] = [];
  const randomPool: ParsedRecipeToken[] = [];
  for (const token of pool) {
    const mode = modes?.[token.value.trim().toLocaleLowerCase()] ?? "always";
    (mode === "random" ? randomPool : always).push(token);
  }
  if (randomPool.length === 0) return always;
  const requestedMin = Number.isFinite(minRandom) ? Math.floor(Number(minRandom)) : 1;
  const requestedMax = Number.isFinite(maxRandom) ? Math.floor(Number(maxRandom)) : 3;
  const lower = Math.max(0, Math.min(randomPool.length, Math.min(requestedMin, requestedMax)));
  const upper = Math.max(lower, Math.min(randomPool.length, Math.max(requestedMin, requestedMax)));
  const count = lower + Math.floor(random() * (upper - lower + 1));
  const available = [...randomPool];
  const selected: ParsedRecipeToken[] = [];
  while (selected.length < count && available.length > 0) {
    const index = Math.min(available.length - 1, Math.floor(random() * available.length));
    selected.push(available.splice(index, 1)[0]);
  }
  return [...always, ...selected];
}

export function generatePopularArtistRecipes(
  pool: ArtistTagRecord[],
  options: RandomArtistRecipeOptions,
): GeneratedArtistRecipe[] {
  const random = options.random ?? Math.random;
  const count = Math.max(1, Math.floor(Number.isFinite(options.count) ? options.count : 1));
  const requestedMinArtists = Math.max(1, Math.min(20, Math.floor(options.minArtists)));
  const requestedMaxArtists = Math.max(1, Math.min(20, Math.floor(options.maxArtists)));
  const minArtists = Math.min(requestedMinArtists, requestedMaxArtists);
  const maxArtists = Math.max(requestedMinArtists, requestedMaxArtists);
  const [artistWeightMin, artistWeightMax] = normalizedWeightBounds(options.artistWeightMin, options.artistWeightMax, [0.2, 1.2]);
  const [franchiseWeightMin, franchiseWeightMax] = normalizedWeightBounds(options.franchiseWeightMin, options.franchiseWeightMax, [0.15, 0.8]);
  const favorites = new Set((options.favoriteArtists ?? []).map(canonicalArtistTagName).filter(Boolean));
  const baseAuxiliary = parseArtistRecipe(options.auxiliaryPrompt ?? "")
    .filter((token) => token.kind !== "artist");
  const customTagPool = parseCustomTagPool(options.customTagPool ?? "");
  const output: GeneratedArtistRecipe[] = [];
  const seen = new Set<string>();
  let attempts = 0;

  const maxAttempts = Math.min(Number.MAX_SAFE_INTEGER, count * 100);
  while (output.length < count && attempts++ < maxAttempts) {
    // A triangular distribution keeps most recipes near the mature reference
    // median while still allowing sparse and very dense combinations.
    const span = maxArtists - minArtists + 1;
    const size = minArtists + Math.floor(((random() + random()) / 2) * span);
    const selected = chooseDistinctArtists(pool, Math.min(maxArtists, size), favorites, random);
    if (selected.length === 0) break;
    const leadCount = selected.length >= 8 && random() < 0.35 ? 2 : 1;
    const accentCount = selected.length >= 5 ? Math.max(1, Math.round(selected.length * 0.25)) : 0;
    let artists = selected.map((artist, index): ArtistWeightedTag => {
      const role = index < leadCount ? "lead" : index >= selected.length - accentCount ? "accent" : "support";
      return {
        name: artist.name,
        weight: options.artistWeightDistribution
          ? sampleControlledWeight(options.artistWeightDistribution, random)
          : chooseWeight(role, artistWeightMin, artistWeightMax, random),
      };
    });
    if (options.artistWeightDistribution) {
      const balanced = softBalanceWeights(
        artists.map((artist) => artist.weight),
        options.artistWeightDistribution,
      );
      artists = artists.map((artist, index) => ({ ...artist, weight: balanced[index] }));
    }
    const franchiseStyles = options.includeFranchiseStyles
      ? drawFranchiseStyles(
          random,
          options.minFranchiseStyles ?? 0,
          options.maxFranchiseStyles ?? 2,
          franchiseWeightMin,
          franchiseWeightMax,
        )
      : [];
    const selectedCustomTagPool = selectCustomTagPool(
      random,
      customTagPool,
      options.customTagModes,
      options.minRandomCustomTags,
      options.maxRandomCustomTags,
    );
    const customTags = drawCustomTags(
      random,
      selectedCustomTagPool,
      options.customTagWeightMin ?? 0.2,
      options.customTagWeightMax ?? 1.2,
    );
    const auxiliary = [...customTags, ...baseAuxiliary];
    const mutations = options.mutateAuxiliary
      ? drawStyleMutations(random, options.favoriteMutations)
      : [];
    const artistText = formatArtistString(artists).replace(/,$/, "");
    const franchiseText = franchiseStyles.map(formatToken).join(", ");
    const auxiliaryText = auxiliary.map(formatToken).join(", ");
    const mutationText = mutations.map(formatToken).join(", ");
    const basePrompt = [artistText, franchiseText, auxiliaryText].filter(Boolean).join(", ");
    const prompt = [basePrompt, mutationText].filter(Boolean).join(", ");
    if (!prompt || seen.has(prompt)) continue;
    seen.add(prompt);
    output.push({
      id: `random-${output.length + 1}-${artists.map((artist) => `${artist.name}@${artist.weight}`).join("+")}-${franchiseStyles.map((tag) => `${tag.value}@${tag.weight}`).join("+")}`,
      artists,
      auxiliary,
      mutations,
      franchiseStyles,
      basePrompt,
      prompt,
    });
  }
  return output;
}

/**
 * Coarse-to-fine beam search for target-style matching.
 *
 * Round one measures single artists so the scorer learns which tags actually
 * move the fixed scene toward the target. Later rounds preserve the strongest
 * combinations, jitter their weights, add one new ranked artist, remove weak
 * accents, and cross the best beams. This avoids the old behaviour where every
 * round discarded what it learned and sampled unrelated 2–10 artist strings.
 */
export function generateArtistMatchRecipes(
  pool: ArtistTagRecord[],
  options: ArtistMatchRecipeOptions,
): GeneratedArtistRecipe[] {
  const random = options.random ?? Math.random;
  const count = Math.max(1, Math.min(40, Math.floor(options.count || 1)));
  const ranked = Array.from(new Map(
    pool.map((artist) => [canonicalArtistTagName(artist.name), {
      ...artist,
      name: canonicalArtistTagName(artist.name),
    }]),
  ).values()).filter((artist) => artist.name);
  const maxArtists = Math.max(1, Math.min(6, Math.floor(options.maxArtists ?? 4)));
  const signature = (artists: readonly ArtistWeightedTag[]) => artists
    .map((artist) => `${canonicalArtistTagName(artist.name)}@${Math.round(artist.weight * 4) / 4}`)
    .sort()
    .join("+");
  const seen = new Set<string>();
  for (const prompt of options.seenPrompts ?? []) {
    const parsed = parseArtistRecipe(prompt)
      .filter((token) => token.kind === "artist")
      .map((token) => ({ name: token.value.replace(/^artist\s*:/i, ""), weight: token.weight }));
    if (parsed.length) seen.add(signature(parsed));
  }
  const output: GeneratedArtistRecipe[] = [];

  const add = (rawArtists: readonly ArtistWeightedTag[], move: GeneratedArtistRecipe["move"]) => {
    const unique = Array.from(new Map(rawArtists
      .map((artist) => ({
        name: canonicalArtistTagName(artist.name),
        weight: roundWeight(Math.max(.2, Math.min(1.8, artist.weight))),
      }))
      .filter((artist) => artist.name)
      .map((artist) => [artist.name, artist])).values()).slice(0, maxArtists);
    if (unique.length === 0) return;
    const prompt = formatArtistString(unique).replace(/,$/, "");
    const key = signature(unique);
    if (!prompt || seen.has(key)) return;
    seen.add(key);
    output.push({
      id: `match-${options.round}-${output.length + 1}-${unique.map((artist) => `${artist.name}@${artist.weight}`).join("+")}`,
      artists: unique,
      auxiliary: [],
      mutations: [],
      franchiseStyles: [],
      basePrompt: prompt,
      prompt,
      move,
    });
  };

  const elites = (options.eliteArtists ?? [])
    .map((artists) => artists.map((artist) => ({ ...artist })))
    .filter((artists) => artists.length > 0)
    .slice(0, Math.max(2, Math.ceil(count / 3)));

  // Always spend part of every round on unseen single-artist probes. This
  // prevents an early mediocre elite from monopolising the whole image budget.
  const probeBudget = elites.length ? Math.max(1, Math.ceil(count * .25)) : count;
  for (const artist of ranked) {
    add([{ name: artist.name, weight: 1 }], "probe");
    if (output.length >= probeBudget) break;
  }
  if (!elites.length || output.length >= count) return output.slice(0, count);

  // Round-robin actions give every elite a fair chance: coarse multiplicative
  // weight moves are visually measurable, then ablation and one-tag expansion.
  const actions: Array<() => void> = [];
  for (const elite of elites) {
    for (let index = 0; index < elite.length; index += 1) {
      actions.push(() => add(elite.map((artist, artistIndex) => artistIndex === index
        ? { ...artist, weight: artist.weight * .7 }
        : artist), "weight"));
      actions.push(() => add(elite.map((artist, artistIndex) => artistIndex === index
        ? { ...artist, weight: artist.weight * 1.4 }
        : artist), "weight"));
    }
    if (elite.length > 1) {
      const weakest = elite.reduce((best, artist, index) => artist.weight < elite[best].weight ? index : best, 0);
      actions.push(() => add(elite.filter((_, index) => index !== weakest), "ablate"));
    }
    for (const candidate of ranked) {
      if (elite.length >= maxArtists || elite.some((artist) => artist.name === candidate.name)) continue;
      actions.push(() => add([...elite, { name: candidate.name, weight: .5 + random() * .5 }], "expand"));
      break;
    }
  }
  for (let index = 0; index < actions.length && output.length < count; index += 1) actions[index]();

  for (let left = 0; left < elites.length && output.length < count; left += 1) {
    for (let right = left + 1; right < elites.length && output.length < count; right += 1) {
      add([...elites[left], ...elites[right]], "cross");
    }
  }

  let attempts = 0;
  while (output.length < count && ranked.length && attempts++ < count * 80) {
    const base = elites[Math.floor(random() * elites.length)];
    const candidate = ranked[Math.floor(random() * ranked.length)];
    add([...base, { name: candidate.name, weight: .5 + random() * .5 }], "expand");
  }
  return output;
}

export function expandArtistRecipeComparisons(
  recipes: GeneratedArtistRecipe[],
  compareMutations: boolean,
): ArtistRecipeComparison[] {
  return recipes.flatMap((recipe) => {
    const plain: ArtistRecipeComparison = {
      ...recipe,
      id: `${recipe.id}-plain`,
      pairId: recipe.id,
      variant: "plain",
      mutations: [],
      prompt: recipe.basePrompt,
    };
    if (!compareMutations || recipe.mutations.length === 0) return [plain];
    return [
      plain,
      {
        ...recipe,
        id: `${recipe.id}-mutated`,
        pairId: recipe.id,
        variant: "mutated",
      },
    ];
  });
}
