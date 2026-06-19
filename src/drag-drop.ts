const IMAGE_EXT_RE = /\.(png|jpe?g|webp)$/i;

export function hasDraggedFiles(dataTransfer: DataTransfer | null | undefined) {
  return Boolean(dataTransfer && Array.from(dataTransfer.types).includes("Files"));
}

export async function droppedImagePath(dataTransfer: DataTransfer | null | undefined) {
  const file = dataTransfer?.files?.[0] as (File & { path?: string }) | undefined;
  if (!file) return "";
  const filePath = file.path || window.naiDesktop.getPathForFile(file);
  if (!filePath) return "";
  if (file.type && !file.type.startsWith("image/")) return "";
  return IMAGE_EXT_RE.test(filePath) || file.type.startsWith("image/") ? filePath : "";
}
