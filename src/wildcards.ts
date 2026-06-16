// Dynamic-prompt wildcard expansion. Syntax: {a|b|c} picks ONE option at random.
//
// IMPORTANT: NovelAI uses bare {tag} / [tag] for weight up/down. We must NOT
// touch those — only braces that contain at least one `|` are treated as
// wildcards. Nesting works innermost-first, e.g. {a|{b|c}}.

// Innermost {...|...} group (no nested braces, at least one pipe).
const WILDCARD = /\{([^{}]*\|[^{}]*)\}/;

/**
 * Expand all {a|b|c} wildcards in `text`. `rand` is injectable for tests.
 * Bare {tag} (NovelAI weight) and [tag] are left untouched.
 */
export function expandWildcards(text: string, rand: () => number = Math.random): string {
  if (!text || text.indexOf("{") === -1) return text;
  let result = text;
  let guard = 0;
  while (WILDCARD.test(result) && guard++ < 200) {
    result = result.replace(WILDCARD, (_match, body: string) => {
      const options = body.split("|");
      const pick = options[Math.floor(rand() * options.length)] ?? "";
      return pick.trim();
    });
  }
  return result;
}

/** True if the text contains at least one expandable wildcard group. */
export function hasWildcards(text: string): boolean {
  return WILDCARD.test(text);
}
