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

// The rest of a partly typed Latin word after the caret is replaced with the tag.
// Chinese text there is kept: it has no spaces, so it is the next phrase.
const WORD_TAIL_CHAR = /[\w-]/;
// Spaces between the words of a multi-word tag; a line break ends the phrase.
const WORD_GAP = /[^\S\r\n]/;

/** Tag text compared loosely: case, repeated spaces and "_" for " " do not matter. */
function tagKey(text: string): string {
  return text.replace(/_/g, " ").replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * Replace the anchored word with a chosen tag. The anchor is the position the
 * suggestions were requested for, so a caret that has since moved elsewhere
 * never decides where the tag goes. Returns null when the anchored text has
 * changed and the suggestion no longer applies. A multi-word tag that starts
 * with the words typed before the anchored one ("long ha" -> "long hair")
 * replaces the longest such run instead of repeating it. The run never crosses
 * a separator (",", "，", "、", a line break) or weight and bracket syntax such
 * as "{{", "(" or "1.2::", which stays in front of the tag.
 */
export function applyAutocompleteTag(
  value: string,
  anchor: AutocompleteAnchor,
  tag: string,
): { value: string; caret: number } | null {
  if (!tag || value.slice(anchor.start, anchor.cursor) !== anchor.word) return null;
  let end = anchor.cursor;
  while (end < value.length && WORD_TAIL_CHAR.test(value[end])) end++;
  const target = tagKey(tag);
  let start = anchor.start;
  // Walk back one whole space-separated word at a time; any other character ends the walk.
  for (let wordEnd = anchor.start; ;) {
    let gap = wordEnd;
    while (gap > 0 && WORD_GAP.test(value[gap - 1])) gap--;
    let wordStart = gap;
    while (wordStart > 0 && WORD_CHAR.test(value[wordStart - 1])) wordStart--;
    if (gap === wordEnd || wordStart === gap) break;
    const phrase = tagKey(value.slice(wordStart, anchor.cursor));
    if (phrase.length > target.length) break;
    if (target.startsWith(phrase)) start = wordStart;
    wordEnd = wordStart;
  }
  // Spaces and one comma left on the caret's line give way to the inserted ", ";
  // line breaks after the caret stay.
  const after = value.slice(end).replace(/^[^\S\r\n]*(?:,[^\S\r\n]*)?/, "");
  return { value: value.slice(0, start) + tag + ", " + after, caret: start + tag.length + 2 };
}
