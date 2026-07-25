import type { ArtistTagRecord, ArtistWeightedTag } from "./artist-lab";

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
  auxiliaryPrompt?: string;
  mutateAuxiliary: boolean;
  favoriteArtists?: string[];
  favoriteMutations?: StyleMutationToken[];
  random?: () => number;
}

export interface GeneratedArtistRecipe {
  id: string;
  artists: ArtistWeightedTag[];
  auxiliary: ParsedRecipeToken[];
  mutations: StyleMutationToken[];
  basePrompt: string;
  prompt: string;
}

export type StyleMutationCategory = "artStyle" | "medium" | "color" | "lighting" | "atmosphere";

export interface StyleMutationToken extends ParsedRecipeToken {
  category: StyleMutationCategory;
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
    "visual novel", "western comics", "storybook illustration", "editorial illustration", "poster art",
  ],
  medium: [
    "acrylic paint", "airbrush", "charcoal drawing", "colored pencil", "digital painting", "fine lineart",
    "gouache", "graphite", "impasto", "ink", "ink wash", "marker", "oil painting", "pastel", "pencil sketch",
    "rough sketch", "thick lineart", "thin lineart", "visible brushstrokes", "watercolor", "woodcut",
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
  atmosphere: [
    "atmospheric perspective", "cinematic atmosphere", "cozy atmosphere", "dreamy", "dust particles",
    "ethereal", "floating particles", "foggy", "hazy", "magical atmosphere", "melancholic", "misty",
    "moody", "mysterious", "nostalgic", "ominous atmosphere", "peaceful", "romantic atmosphere", "serene",
    "soft focus", "sparkles", "surreal atmosphere", "tranquil", "vignette", "whimsical", "windy atmosphere",
    "glowing dust", "humid atmosphere", "smoky atmosphere", "rainy atmosphere",
  ],
};

const QUALITY_PATTERN = /^(masterpiece|best quality|amazing quality|very aesthetic|extremely detailed(?: cg)?|ultra[- ]?detailed|high quality)$/i;
const YEAR_PATTERN = /^year[_ ]?\d{4}$/i;
const NEGATIVE_PATTERN = /^(no\s+|negative\s+|avoid\s+|-\d+(?:\.\d+)?::)/i;
const STYLE_PATTERN = /(style|realism|impasto|illustration|painting|lineart|lighting|shading|cg|photorealistic|monochrome|sketch|watercolor)/i;

function roundWeight(value: number): number {
  return Math.round(Math.max(-10, Math.min(10, value)) * 100) / 100;
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

function chooseWeight(role: "lead" | "support" | "accent", random: () => number): number {
  if (role === "lead") {
    const roll = random();
    // Reference recipes show that very strong leads can be useful, but they
    // should be exceptional rather than dominating routine exploration.
    if (roll < 0.02) return 7;
    if (roll < 0.05) return 5;
    if (roll < 0.1) return 4;
    const values = [1.1, 1.2, 1.35, 1.5, 1.7, 2, 2.5, 3];
    return values[Math.min(values.length - 1, Math.floor(((roll - 0.1) / 0.9) * values.length))];
  }
  const values = role === "support"
    ? [0.65, 0.75, 0.85, 0.9, 1, 1.1, 1.2]
    : [0.2, 0.3, 0.4, 0.5, 0.6];
  return values[Math.min(values.length - 1, Math.floor(random() * values.length))];
}

function formatToken(token: ParsedRecipeToken): string {
  if (Math.abs(token.weight - 1) < 0.001) return token.value;
  return `${roundWeight(token.weight)}::${token.value} ::`;
}

export function formatArtistString(
  artists: readonly ArtistWeightedTag[],
): string {
  const value = artists
    .map((artist) => `${roundWeight(artist.weight)}::artist:${artist.name} ::`)
    .join(", ");
  return value ? `${value},` : "";
}

export function formatArtistFullPrompt(
  recipe: Pick<GeneratedArtistRecipe, "artists" | "mutations" | "auxiliary">,
  basePrompt: string,
): string {
  const artistText = formatArtistString(recipe.artists);
  const mutationText = recipe.mutations.map(formatToken).join(", ");
  const auxiliaryText = recipe.auxiliary.map(formatToken).join(", ");
  return [artistText.replace(/,$/, ""), mutationText, auxiliaryText, basePrompt.trim()]
    .filter(Boolean)
    .join(", ")
    .trim();
}

export function randomizeArtistRecipeWeights(
  input: string,
  count: number,
  variationPercent = 20,
  random: () => number = Math.random,
): GeneratedArtistRecipe[] {
  const source = parseArtistRecipe(input)
    .filter((token) => token.kind === "artist" && token.weight > 0)
    .map((token) => ({
      name: token.value.replace(/^artist\s*:/i, "").trim(),
      weight: token.weight,
    }))
    .filter((artist) => artist.name);
  if (!source.length) return [];
  const total = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  const ratio = Math.max(0, Math.min(100, variationPercent)) / 100;
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
    return {
      id: `weight-tune-${index + 1}-${artists.map((artist) => `${artist.name}@${artist.weight}`).join("+")}`,
      artists,
      auxiliary: [],
      mutations: [],
      basePrompt: artistText,
      prompt: artistText,
    };
  });
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

export function generatePopularArtistRecipes(
  pool: ArtistTagRecord[],
  options: RandomArtistRecipeOptions,
): GeneratedArtistRecipe[] {
  const random = options.random ?? Math.random;
  const count = Math.max(1, Math.floor(Number.isFinite(options.count) ? options.count : 1));
  const minArtists = Math.max(1, Math.min(20, Math.floor(options.minArtists)));
  const maxArtists = Math.max(minArtists, Math.min(20, Math.floor(options.maxArtists)));
  const favorites = new Set((options.favoriteArtists ?? []).map((name) => name.trim()).filter(Boolean));
  const baseAuxiliary = parseArtistRecipe(options.auxiliaryPrompt ?? "")
    .filter((token) => token.kind !== "artist");
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
    const artists = selected.map((artist, index): ArtistWeightedTag => {
      const role = index < leadCount ? "lead" : index >= selected.length - accentCount ? "accent" : "support";
      return { name: artist.name, weight: chooseWeight(role, random) };
    });
    const auxiliary = baseAuxiliary;
    const mutations = options.mutateAuxiliary
      ? drawStyleMutations(random, options.favoriteMutations)
      : [];
    const artistText = formatArtistString(artists).replace(/,$/, "");
    const auxiliaryText = auxiliary.map(formatToken).join(", ");
    const mutationText = mutations.map(formatToken).join(", ");
    const basePrompt = [artistText, auxiliaryText].filter(Boolean).join(", ");
    const prompt = [basePrompt, mutationText].filter(Boolean).join(", ");
    if (!prompt || seen.has(prompt)) continue;
    seen.add(prompt);
    output.push({
      id: `random-${output.length + 1}-${artists.map((artist) => `${artist.name}@${artist.weight}`).join("+")}`,
      artists,
      auxiliary,
      mutations,
      basePrompt,
      prompt,
    });
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
