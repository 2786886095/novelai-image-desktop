import type { TavernLorebook, TavernLorebookEntry } from "../agent/types";

type ActiveEntry = { book: TavernLorebook; entry: TavernLorebookEntry };
const assignment = /\{\{setvar::([^{}:]+)::((?:\{\{getvar::[^{}:]+\}\}|(?!\}\})[\s\S])*?)\}\}/g;
const reference = /\{\{getvar::([^{}:]+)\}\}/g;

export function isOriginalImageGuidance(entry: TavernLorebookEntry): boolean {
  const config = entry.extensions.langbai_image_guidance;
  return !!config && typeof config === "object" && !Array.isArray(config)
    && "source" in config;
}

/** Render request-local macros without editing the stored original or touching user books. */
export function renderOriginalImageGuidance(items: ActiveEntry[]): Map<TavernLorebookEntry, string> {
  const variables = new Map<string, Map<string, string>>();
  const result = new Map<TavernLorebookEntry, string>();
  for (const { book, entry } of items) {
    if (!isOriginalImageGuidance(entry)) continue;
    // Excluded example analysis and the unused Stable Diffusion branch have no runtime text.
    const scope = variables.get(book.id) ?? new Map(["解析格式", "SD", "图片总数", "male", "尺寸", "尺寸格式", "尺寸竖图", "尺寸方图", "尺寸横图", "NAI", "Danbooru", "叙事"].map(key => [key, ""]));
    variables.set(book.id, scope);
    for (const match of entry.content.matchAll(assignment)) scope.set(match[1], match[2]);
  }
  for (const { book, entry } of items) {
    if (!isOriginalImageGuidance(entry)) continue;
    const scope = variables.get(book.id)!;
    const resolve = (text: string, seen = new Set<string>()): string => text.replace(reference, (_, key: string) => {
      if (seen.has(key)) throw new Error(`Worldbook variable cycle: ${key}`);
      if (!scope.has(key)) throw new Error(`Worldbook variable is not defined: ${key}`);
      return resolve(scope.get(key)!, new Set([...seen, key]));
    });
    result.set(entry, resolve(entry.content.replace(assignment, "")));
  }
  return result;
}
