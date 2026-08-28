import {
  canonicalArtistTagName,
  type GeneratedArtistRecipe,
  type ParsedRecipeToken,
  type RecipeTokenKind,
} from "./artist-recipe";
import { CURATED_ARTIST_TAGS } from "./curated-artists";

/**
 * Community migration reports for early NAI Diffusion V5 commonly suggest
 * starting at roughly one third to one half of a V4.5 prompt weight. NovelAI
 * does not publish an official conversion ratio, so this remains an
 * experimental migration heuristic rather than a model guarantee.
 */
export const MIN_V5_ARTIST_REPAIR_MULTIPLIER = 1 / 3;
export const MAX_V5_ARTIST_REPAIR_MULTIPLIER = 1 / 2;
export const DEFAULT_V5_ARTIST_DRAW_MIN = 0.2;
export const DEFAULT_V5_ARTIST_DRAW_MAX = 1.2;

export interface V5ArtistWeightRepairResult {
  output: string;
  /** Legacy field: number of parsed tags that already carried a weight. */
  adjustedWeightedGroups: number;
  /** Legacy field retained for compatibility with earlier callers. */
  wrappedUnweightedArtists: number;
  /** Every valid tag is normalized and adjusted, not just artist tags. */
  totalAdjusted: number;
  artistTagCount: number;
  qualityTagCount: number;
  otherTagCount: number;
}

interface PromptTag extends ParsedRecipeToken {
  sourceWeighted: boolean;
}

const QUALITY_PATTERN = /^(?:masterpiece|best[_ ]quality|amazing[_ ]quality|very[_ ]aesthetic|extremely[_ ]detailed(?:[_ ]cg)?|ultra[-_ ]?detailed|high[_ ]quality|great[_ ]quality|good[_ ]quality|average[_ ]quality|low[_ ]quality|worst[_ ]quality|aesthetic|very[_ ]pleasing|no[_ ]text)$/i;
const YEAR_PATTERN = /^year[_ ]?\d{4}$/i;
const NEGATIVE_PATTERN = /^(?:no\s+|negative\s+|avoid\s+)/i;
const STYLE_PATTERN = /(?:style|realism|impasto|illustration|painting|lineart|lighting|shading|\bcg\b|photorealistic|monochrome|sketch|watercolor|brushstroke|anime coloring|game cg)/i;
const NUMERIC_SCOPE_PATTERN = /([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*::([\s\S]*?)::/g;

// A bare token is inherently ambiguous. Only locally reviewed Danbooru
// category-1 names (plus the explicitly confirmed compatibility addition) are
// allowed to gain an artist: prefix automatically. Unknown bare tags still
// participate in repair/draw, but remain ordinary tags.
const KNOWN_BARE_ARTIST_TAGS = new Set([
  ...CURATED_ARTIST_TAGS.map((artist) => artist.name),
  "xiaoluo_xl",
]);

export function formatV5ArtistWeight(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return (Object.is(rounded, -0) ? 0 : rounded)
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}

function normalizePromptSource(input: string) {
  return input
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\\([_()[\]{}])/g, "$1")
    .replace(/[，、；;\r\n]+/g, ",");
}

function cleanPromptValue(raw: string) {
  return raw
    .trim()
    .replace(/^(?:::)+\s*/, "")
    .replace(/\s*(?:::)+$/, "")
    .trim();
}

function repairKnownBareArtistName(raw: string): string | null {
  const candidate = canonicalArtistTagName(raw);
  if (KNOWN_BARE_ARTIST_TAGS.has(candidate)) return candidate;

  // Recover a single missing final parenthesis only when the repaired value
  // exactly matches the reviewed artist set. This fixes yd_(orange_maru
  // without guessing arbitrary malformed content tags.
  const opens = (candidate.match(/\(/g) ?? []).length;
  const closes = (candidate.match(/\)/g) ?? []).length;
  if (opens === closes + 1 && KNOWN_BARE_ARTIST_TAGS.has(`${candidate})`)) {
    return `${candidate})`;
  }
  return null;
}

function classifyAndNormalizeValue(raw: string): { value: string; kind: RecipeTokenKind } | null {
  const value = cleanPromptValue(raw);
  if (!value) return null;

  const explicitArtist = value.match(/^artist\s*:\s*([\s\S]+)$/i);
  if (explicitArtist) {
    const rawName = explicitArtist[1].trim();
    const name = repairKnownBareArtistName(rawName) ?? canonicalArtistTagName(rawName);
    return name ? { value: `artist:${name}`, kind: "artist" } : null;
  }

  const knownArtist = repairKnownBareArtistName(value);
  if (knownArtist) return { value: `artist:${knownArtist}`, kind: "artist" };

  const comparable = value.replace(/_/g, " ").trim();
  if (YEAR_PATTERN.test(value)) return { value, kind: "year" };
  if (QUALITY_PATTERN.test(value)) return { value, kind: "quality" };
  if (NEGATIVE_PATTERN.test(comparable)) return { value, kind: "negative" };
  if (STYLE_PATTERN.test(comparable)) return { value, kind: "style" };
  return { value, kind: "other" };
}

function parseTerm(
  raw: string,
  inheritedWeight: number | null,
  legacyLevel: number,
): PromptTag | null {
  let value = cleanPromptValue(raw);
  if (!value) return null;

  let baseWeight = inheritedWeight ?? 1;
  let sourceWeighted = inheritedWeight !== null || legacyLevel !== 0;

  // Stable-Diffusion-style compatibility form. Match the final numeric suffix
  // so artist names containing parentheses remain intact.
  const parenthesizedWeight = value.match(
    /^\(\s*([\s\S]+)\s*:\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\)$/,
  );
  if (parenthesizedWeight) {
    value = parenthesizedWeight[1].trim();
    baseWeight = Number(parenthesizedWeight[2]);
    sourceWeighted = true;
  } else if (value.startsWith("(") && value.endsWith(")")) {
    value = value.slice(1, -1).trim();
  }

  const normalized = classifyAndNormalizeValue(value);
  if (!normalized) return null;
  const weight = baseWeight * Math.pow(1.05, legacyLevel);
  return {
    raw,
    value: normalized.value,
    weight: Number.isFinite(weight) ? weight : 1,
    kind: normalized.kind,
    sourceWeighted,
  };
}

/**
 * Split a comma-delimited section while carrying NovelAI brace/square-bracket
 * emphasis across commas. Braces are removed because every output tag is
 * emitted using explicit numerical emphasis.
 */
function parseTermList(source: string, inheritedWeight: number | null): PromptTag[] {
  const output: PromptTag[] = [];
  let token = "";
  let curly = 0;
  let square = 0;
  let startingLevel: number | null = null;

  const flush = () => {
    const parsed = parseTerm(token, inheritedWeight, startingLevel ?? 0);
    if (parsed) output.push(parsed);
    token = "";
    startingLevel = null;
  };

  for (const char of source) {
    if (char === "{") {
      curly += 1;
      continue;
    }
    if (char === "}") {
      curly = Math.max(0, curly - 1);
      continue;
    }
    if (char === "[") {
      square += 1;
      continue;
    }
    if (char === "]") {
      square = Math.max(0, square - 1);
      continue;
    }
    if (char === ",") {
      flush();
      continue;
    }
    if (startingLevel === null && !/\s/.test(char)) {
      startingLevel = curly - square;
    }
    token += char;
  }
  flush();
  return output;
}

function parsePromptTags(input: string): PromptTag[] {
  const source = normalizePromptSource(input);
  const output: PromptTag[] = [];
  let cursor = 0;

  for (const match of source.matchAll(NUMERIC_SCOPE_PATTERN)) {
    const index = match.index ?? 0;
    output.push(...parseTermList(source.slice(cursor, index), null));
    const weight = Number(match[1]);
    output.push(...parseTermList(match[2], Number.isFinite(weight) ? weight : 1));
    cursor = index + match[0].length;
  }
  output.push(...parseTermList(source.slice(cursor), null));
  return output;
}

function formatPromptTags(tags: readonly Pick<PromptTag, "value" | "weight">[]) {
  return tags
    .map((tag) => `${formatV5ArtistWeight(tag.weight)}::${tag.value} ::`)
    .join(", ");
}

function createRepairResult(tags: PromptTag[]): V5ArtistWeightRepairResult {
  const artistTagCount = tags.filter((tag) => tag.kind === "artist").length;
  const qualityTagCount = tags.filter((tag) => tag.kind === "quality").length;
  return {
    output: formatPromptTags(tags),
    adjustedWeightedGroups: tags.filter((tag) => tag.sourceWeighted).length,
    wrappedUnweightedArtists: tags.filter(
      (tag) => tag.kind === "artist" && !tag.sourceWeighted,
    ).length,
    totalAdjusted: tags.length,
    artistTagCount,
    qualityTagCount,
    otherTagCount: tags.length - artistTagCount - qualityTagCount,
  };
}

function normalizedRandomSample(random: () => number) {
  const value = random();
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
}

function randomRepairMultiplier(random: () => number) {
  return MIN_V5_ARTIST_REPAIR_MULTIPLIER
    + normalizedRandomSample(random)
      * (MAX_V5_ARTIST_REPAIR_MULTIPLIER - MIN_V5_ARTIST_REPAIR_MULTIPLIER);
}

function migratePromptTags(
  tags: readonly PromptTag[],
  random: () => number,
  bounds?: readonly [number, number],
) {
  return tags.map((tag) => {
    const migrated = tag.weight * randomRepairMultiplier(random);
    const bounded = bounds
      ? Math.max(bounds[0], Math.min(bounds[1], migrated))
      : migrated;
    return {
      ...tag,
      weight: Math.round(bounded * 100) / 100,
    };
  });
}

function generatedRecipeFromTags(
  tags: readonly PromptTag[],
  index: number,
  idPrefix: string,
): GeneratedArtistRecipe {
  const prompt = formatPromptTags(tags);
  const artists = tags
    .filter((tag) => tag.kind === "artist")
    .map((tag) => ({
      name: canonicalArtistTagName(tag.value.replace(/^artist\s*:/i, "")),
      weight: tag.weight,
    }));
  const auxiliary: ParsedRecipeToken[] = tags
    .filter((tag) => tag.kind !== "artist")
    .map((tag) => ({
      raw: `${formatV5ArtistWeight(tag.weight)}::${tag.value} ::`,
      value: tag.value,
      weight: tag.weight,
      kind: tag.kind,
    }));
  const fingerprint = tags
    .map((tag) => `${tag.value}@${formatV5ArtistWeight(tag.weight)}`)
    .join("+");
  return {
    id: `${idPrefix}-${index + 1}-${Date.now().toString(36)}-${fingerprint}`,
    artists,
    auxiliary,
    mutations: [],
    franchiseStyles: [],
    basePrompt: prompt,
    prompt,
  };
}

/** Normalize every valid prompt tag to explicit NovelAI numerical syntax. */
export function normalizeV45ArtistSyntax(input: string): V5ArtistWeightRepairResult {
  return createRepairResult(parsePromptTags(input));
}

/**
 * Apply an independent [1/3, 1/2] multiplier to every valid tag. Artist tags
 * and quality/style/content tags all participate; only artist classification
 * controls whether the artist: prefix is added.
 */
export function repairV45ArtistWeightsForV5(
  input: string,
  random: () => number = Math.random,
): V5ArtistWeightRepairResult {
  const tags = migratePromptTags(parsePromptTags(input), random);
  return createRepairResult(tags);
}

/**
 * Create several independently repaired complete strings for visual A/B
 * testing. Every candidate uses the exact same parser and migration rule as
 * `repairV45ArtistWeightsForV5`; only the sampled multipliers differ.
 */
export function repairV45ArtistCandidatesForV5(
  input: string,
  count: number,
  random: () => number = Math.random,
): GeneratedArtistRecipe[] {
  const sourceTags = parsePromptTags(input);
  if (sourceTags.length === 0 || count < 1) return [];
  const total = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  return Array.from({ length: total }, (_, index) => generatedRecipeFromTags(
    migratePromptTags(sourceTags, random),
    index,
    "v5-repair",
  ));
}

function normalizedDrawBounds(rawMin: number, rawMax: number): [number, number] {
  const left = Number.isFinite(rawMin) ? rawMin : DEFAULT_V5_ARTIST_DRAW_MIN;
  const right = Number.isFinite(rawMax) ? rawMax : DEFAULT_V5_ARTIST_DRAW_MAX;
  const min = Math.max(0.05, Math.min(10, Math.min(left, right)));
  const max = Math.max(min, Math.max(0.05, Math.min(10, Math.max(left, right))));
  return [min, max];
}

/** Return the number of valid tags retained in every weight-draw candidate. */
export function countV5PromptTags(input: string) {
  return parsePromptTags(input).length;
}

/**
 * Migrate every valid tag with the same independent one-third-to-one-half rule
 * as the repair tool, then constrain the result to the user-selected draw
 * bounds. The original weight therefore remains meaningful (for example a
 * legacy weight of 2 becomes roughly 0.67-1.0), while the bounds provide a
 * final safety floor/ceiling. This is a complete-string weight draw, not a
 * subset draw.
 */
export function drawAllV5ArtistWeights(
  input: string,
  count: number,
  minWeight = DEFAULT_V5_ARTIST_DRAW_MIN,
  maxWeight = DEFAULT_V5_ARTIST_DRAW_MAX,
  random: () => number = Math.random,
): GeneratedArtistRecipe[] {
  const sourceTags = parsePromptTags(input);
  if (sourceTags.length === 0 || count < 1) return [];

  const [min, max] = normalizedDrawBounds(minWeight, maxWeight);
  const total = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  return Array.from({ length: total }, (_, index) => {
    const tags = migratePromptTags(sourceTags, random, [min, max]);
    return generatedRecipeFromTags(tags, index, "v5-weight-draw");
  });
}
