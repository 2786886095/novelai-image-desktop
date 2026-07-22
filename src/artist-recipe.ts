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
  random?: () => number;
}

export interface GeneratedArtistRecipe {
  id: string;
  artists: ArtistWeightedTag[];
  auxiliary: ParsedRecipeToken[];
  prompt: string;
}

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

function mutateAuxiliaryTokens(tokens: ParsedRecipeToken[], random: () => number): ParsedRecipeToken[] {
  return tokens.flatMap((token) => {
    // Negative controls are structurally protected: they may be retained or
    // removed, but are never converted into positive prompt content.
    if (token.kind === "negative") return random() < 0.85 ? [token] : [];
    if (random() < 0.12) return [];
    let value = token.value;
    if (token.kind === "year" && random() < 0.45) {
      value = `year ${2021 + Math.floor(random() * 5)}`;
    }
    const jitter = random() < 0.55 ? (random() - 0.5) * 0.4 : 0;
    return [{ ...token, value, weight: roundWeight(token.weight + jitter), kind: classify(value) }];
  });
}

export function generatePopularArtistRecipes(
  pool: ArtistTagRecord[],
  options: RandomArtistRecipeOptions,
): GeneratedArtistRecipe[] {
  const random = options.random ?? Math.random;
  const count = Math.max(1, Math.min(100, Math.floor(options.count)));
  const minArtists = Math.max(1, Math.min(24, Math.floor(options.minArtists)));
  const maxArtists = Math.max(minArtists, Math.min(24, Math.floor(options.maxArtists)));
  const favorites = new Set((options.favoriteArtists ?? []).map((name) => name.trim()).filter(Boolean));
  const baseAuxiliary = parseArtistRecipe(options.auxiliaryPrompt ?? "")
    .filter((token) => token.kind !== "artist");
  const output: GeneratedArtistRecipe[] = [];
  const seen = new Set<string>();
  let attempts = 0;

  while (output.length < count && attempts++ < count * 100) {
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
    const auxiliary = options.mutateAuxiliary
      ? mutateAuxiliaryTokens(baseAuxiliary, random)
      : baseAuxiliary;
    const artistText = artists.map((artist) => `${artist.weight}::artist:${artist.name} ::`).join(", ");
    const auxiliaryText = auxiliary.map(formatToken).join(", ");
    const prompt = [artistText, auxiliaryText].filter(Boolean).join(", ");
    if (!prompt || seen.has(prompt)) continue;
    seen.add(prompt);
    output.push({
      id: `random-${output.length + 1}-${artists.map((artist) => `${artist.name}@${artist.weight}`).join("+")}`,
      artists,
      auxiliary,
      prompt,
    });
  }
  return output;
}
