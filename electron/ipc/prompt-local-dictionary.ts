import {capsuleTagUnits} from "../../src/compact-prompt";
import type {TagSuggestion} from "../../src/types";
import {lookupMultilingualTags, type TagDictionaryMatch} from "./multilingual-tags";

/** Bounded exact matches only: never treat fuzzy suggestions as facts in a model request. */
export function dictionaryQueryTerms(text: string) {
  const source = text.slice(0, 384).normalize("NFKC");
  const terms = new Set<string>();
  for (const part of source.split(/[,、，。.;；\n！？!?]/u)) {
    const clean = part.trim();
    if (!clean) continue;
    terms.add(clean);
    const words = clean.match(/[\p{L}\p{N}_'-]+/gu) ?? [];
    for (let i = 0; i < words.length && terms.size < 240; i++) {
      for (let n = 1; n <= 4 && i+n <= words.length; n++) {
        if (n === 1 && words[i].length < 2) continue;
        terms.add(words.slice(i,i+n).join(" "));
      }
    }
  }
  // Exact lookup of phrases embedded in unspaced Chinese/Japanese descriptions.
  for (const run of source.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2,}/gu) ?? []) {
    const chars = [...run];
    for (let i=0;i<chars.length && terms.size<480;i++) {
      for(let n=Math.min(8,chars.length-i);n>=2;n--) terms.add(chars.slice(i,i+n).join(""));
    }
  }
  return [...terms].slice(0, 480);
}

export function localDictionaryGuidance(mode: string, source: string) {
  if (mode === "natural" || !source.trim()) return "";
  const matches = lookupMultilingualTags(dictionaryQueryTerms(source), true);
  const ordered = [...matches].sort((a,b)=>b.query.length-a.query.length || b.count-a.count);
  const covered: TagDictionaryMatch[] = [];
  for (const row of ordered) {
    if (covered.some(other=>other.tag===row.tag || other.query.includes(row.query))) continue;
    // Keep database data on one line and bound the supplemental model context.
    if (!/^[\p{L}\p{N} _+.'()!?#&:\/-]{1,100}$/u.test(row.tag)) continue;
    covered.push(row);
    if (covered.length === 12) break;
  }
  if (!covered.length) return "";
  return "Offline dictionary spellings (use only where independently supported by the input/image; do not add new facts): " +
    covered.map(row=>JSON.stringify(row.tag)).join(", ");
}

/** Image-only reverse still checks its actual output against the selected pack.
 * This is advisory metadata; don't remove unsupported free-text or rewrite weighting. */
export function promptDictionaryMatches(mode: string, ...prompts: (string|undefined)[]): TagSuggestion[] {
  if (mode === "natural") return [];
  const terms = prompts.flatMap(prompt => prompt ? capsuleTagUnits(prompt.slice(0,24_000)).map(unit=>unit.core) : []);
  return lookupMultilingualTags(terms).slice(0,64).map(({query: _query, ...row})=>row);
}
