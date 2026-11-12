// Shared by generation and history mutations, including single and batch operations.
export const pendingHistoryFileEdits = new Set<string>();

export function sanitizeGroupFolderName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 80);
  const segment = cleaned.replace(/[. ]+$/, "");
  return /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/iu.test(segment) ? "_" + segment : segment || "group";
}
