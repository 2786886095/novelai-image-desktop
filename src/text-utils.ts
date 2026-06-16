// Small pure text helpers shared by the prompt UI. Kept separate for testing.

/** Format a Danbooru post count compactly (1_900_000 -> "1.9M"). */
export function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

// Word characters for autocomplete. Includes CJK so Chinese input (e.g. "蓝眼")
// triggers the 灵感胶囊 suggestions, plus latin word chars and hyphen.
const WORD_CHAR = /[\w㐀-鿿-]/;

/** The "word" immediately left of the cursor and where it starts. */
export function wordAtCursor(text: string, cursor: number): { word: string; start: number } {
  let s = cursor;
  while (s > 0 && WORD_CHAR.test(text[s - 1])) s--;
  return { word: text.slice(s, cursor), start: s };
}
