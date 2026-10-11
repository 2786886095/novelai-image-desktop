// Pinned community producers still emit the released V3 plugin wrapper.
// Match the official V3 -> V4 migration's fallback naming, without weakening
// the native validator or rewriting any saved conversation.
const producers = new Set(['rp-core', 'rp-conversation-summary', 'mindspace-session-memory']);
export function adaptSessionSources(source) {
  return source.replace(/kind:\s*(['"])plugin\1,\s*plugin:\s*(['"])([^'"]+)\2/g,
    (match, quote, _otherQuote, producer) => producers.has(producer)
      ? `kind: ${quote}plugin:${producer}${quote}` : match);
}
