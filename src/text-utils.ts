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

/** Where an autocomplete session started: the word typed before the caret. */
export interface AutocompleteAnchor {
  start: number;
  cursor: number;
  word: string;
}

/**
 * Replace the anchored word with a chosen tag. The anchor is the position the
 * suggestions were requested for, so a caret that has since moved elsewhere
 * never decides where the tag goes. Returns null when the anchored text has
 * changed and the suggestion no longer applies. A multi-word tag that starts
 * with the words already typed in the same segment ("long ha" -> "long hair")
 * replaces that phrase instead of repeating it.
 */
export function applyAutocompleteTag(
  value: string,
  anchor: AutocompleteAnchor,
  tag: string,
): { value: string; caret: number } | null {
  if (!tag || value.slice(anchor.start, anchor.cursor) !== anchor.word) return null;
  let end = anchor.cursor;
  while (end < value.length && WORD_CHAR.test(value[end])) end++;
  let start = anchor.start;
  const segmentStart = Math.max(...[",", "，", "\n"].map((separator) => value.lastIndexOf(separator, start - 1))) + 1;
  const phrase = value.slice(segmentStart, start).trimStart();
  if (phrase && tag.toLocaleLowerCase().startsWith((phrase + anchor.word).toLocaleLowerCase())) start -= phrase.length;
  const after = value.slice(end).replace(/^\s*,\s*/, "").trimStart();
  return { value: value.slice(0, start) + tag + ", " + after, caret: start + tag.length + 2 };
}
