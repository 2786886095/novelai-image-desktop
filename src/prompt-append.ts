/** Append saved prompt text after the current prompt with one comma separator.
 * The saved text itself keeps its literal weights, repetitions and line breaks;
 * only trailing whitespace at the join point is dropped. */
export function appendPromptText(current: string, addition: string): string {
  if (!addition.trim()) return current;
  if (!current.trim()) return addition;
  const base = current.trimEnd();
  return base + (/[,，]$/.test(base) ? " " : ", ") + addition.trimStart();
}
