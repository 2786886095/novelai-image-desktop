/** Only split an exact saved prefix; never infer artist names or split mid-prompt. */
export function restoreSavedStyle<T extends {positivePrompt?: string; stylePrompt?: string}>(
  imported: T, presets: readonly {prompt: string}[],
): T {
  if (imported.stylePrompt !== "" || typeof imported.positivePrompt !== "string") return imported;
  const prompt = imported.positivePrompt;
  const styles = [...new Set(presets.map(p => p.prompt.trim()).filter(Boolean))].sort((a,b)=>b.length-a.length);
  for (const style of styles) {
    if (prompt === style) return {...imported, stylePrompt: style, positivePrompt: ""};
    if (!prompt.startsWith(style)) continue;
    const rest = prompt.slice(style.length);
    if (/^\s*,\s*/.test(rest)) return {...imported, stylePrompt: style, positivePrompt: rest.replace(/^\s*,\s*/, "")};
  }
  return imported;
}
