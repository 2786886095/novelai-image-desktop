function mergeJsonValue(current: unknown, incoming: unknown): unknown {
  if (Array.isArray(current) && Array.isArray(incoming)) {
    const result = [...current];
    const identities = new Set(result.map((item) =>
      item && typeof item === "object" && "id" in item
        ? `id:${String((item as { id?: unknown }).id)}`
        : `json:${JSON.stringify(item)}`));
    for (const item of incoming) {
      const identity = item && typeof item === "object" && "id" in item
        ? `id:${String((item as { id?: unknown }).id)}`
        : `json:${JSON.stringify(item)}`;
      if (!identities.has(identity)) {
        identities.add(identity);
        result.push(item);
      }
    }
    return result;
  }
  if (
    current && incoming
    && typeof current === "object" && typeof incoming === "object"
    && !Array.isArray(current) && !Array.isArray(incoming)
  ) {
    const result = { ...(incoming as Record<string, unknown>) };
    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      result[key] = key in result ? mergeJsonValue(value, result[key]) : value;
    }
    return result;
  }
  // Existing scalar state always wins. Only configuration is allowed to fully
  // overwrite, and configuration lives in the main-process store, not here.
  return current;
}

export function collectPortableWorkspaceData() {
  const result: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith("langbai.")) continue;
    const value = localStorage.getItem(key);
    if (value !== null) result[key] = value;
  }
  return result;
}

/** Merge imported renderer state without replacing any existing scalar. Arrays
 * are unioned by stable id (or JSON identity) and object fields are merged with
 * current values taking precedence. */
export function mergePortableWorkspaceData(incoming: Record<string, string>) {
  let imported = 0;
  let skipped = 0;
  for (const [key, value] of Object.entries(incoming)) {
    if (!key.startsWith("langbai.") || typeof value !== "string") continue;
    const current = localStorage.getItem(key);
    if (current === null) {
      localStorage.setItem(key, value);
      imported += 1;
      continue;
    }
    if (current === value) {
      skipped += 1;
      continue;
    }
    try {
      const merged = mergeJsonValue(JSON.parse(current), JSON.parse(value));
      const serialized = JSON.stringify(merged);
      if (serialized === current) skipped += 1;
      else {
        localStorage.setItem(key, serialized);
        imported += 1;
      }
    } catch {
      skipped += 1;
    }
  }
  return { imported, skipped };
}
