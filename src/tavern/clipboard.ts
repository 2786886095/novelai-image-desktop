/** Never report success from the legacy fallback unless the browser confirms it. */
export async function copyTavernText(text: string, write = (value: string) => navigator.clipboard.writeText(value), doc = document) {
  try { await write(text); return; } catch { /* Try the local legacy path below. */ }
  const focus = doc.activeElement as HTMLElement | null;
  const selection = doc.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  const textarea = doc.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed'; textarea.style.opacity = '0';
  doc.body.appendChild(textarea);
  try {
    textarea.select();
    if (!doc.execCommand('copy')) throw Error('CLIPBOARD_WRITE_FAILED');
  } finally {
    textarea.remove();
    if (focus?.isConnected) focus.focus({ preventScroll: true });
    if (selection && ranges.length) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
}
