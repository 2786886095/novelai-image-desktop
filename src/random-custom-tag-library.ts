import source from "../shared/random-custom-tag-library.json";
import type { AppLanguage } from "./types";

export type RandomCustomTagEntry = {
  tag: string;
  labels: Record<AppLanguage, string>;
};

export type RandomCustomTagCategory = {
  id: string;
  labels: Record<AppLanguage, string>;
  tags: RandomCustomTagEntry[];
};

type RandomCustomTagSource = {
  version: number;
  categories: RandomCustomTagCategory[];
};

const librarySource = source as RandomCustomTagSource;
const VISUAL_STYLE_CATEGORY_IDS = new Set([
  "quality",
  "render3d",
  "medium",
  "lighting",
  "color",
  "texture",
  "stylization",
]);

/**
 * Searchable, localized positive-prompt helpers. This is intentionally kept
 * separate from the draw algorithm: choosing a library item edits the shared
 * Tag pool and its per-item inclusion mode, while the recipe generator remains
 * responsible for assigning a fresh weight to every included Tag in every result.
 */
export const RANDOM_CUSTOM_TAG_LIBRARY = librarySource.categories.filter(
  (category) => VISUAL_STYLE_CATEGORY_IDS.has(category.id),
);

export const RANDOM_CUSTOM_TAG_VALUES = new Set(
  RANDOM_CUSTOM_TAG_LIBRARY.flatMap((category) =>
    category.tags.map((entry) => entry.tag.toLocaleLowerCase()),
  ),
);

export const RANDOM_CUSTOM_TAG_COUNT = RANDOM_CUSTOM_TAG_LIBRARY.reduce(
  (total, category) => total + category.tags.length,
  0,
);

export function customTagCategoryLabel(
  category: RandomCustomTagCategory,
  language: AppLanguage,
): string {
  return category.labels[language] ?? category.labels["en-US"];
}

export function customTagMeaning(
  entry: RandomCustomTagEntry,
  language: AppLanguage,
): string {
  return entry.labels[language] ?? entry.labels["en-US"];
}

export function matchesCustomTagSearch(
  category: RandomCustomTagCategory,
  entry: RandomCustomTagEntry,
  language: AppLanguage,
  query: string,
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const haystack = [
    entry.tag,
    ...Object.values(entry.labels),
    category.id,
    ...Object.values(category.labels),
    customTagMeaning(entry, language),
  ].join("\n").toLocaleLowerCase();
  return haystack.includes(needle);
}
