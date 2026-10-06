import {previewImageContainsPoint} from './preview-hit';

export type StageImageIdentity = {id?: string; filePath?: string};

function imagePathKey(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/');
  // Windows paths are case-insensitive; do not conflate distinct POSIX files.
  return /^(?:[a-z]:\/|\/\/)/i.test(normalized) ? normalized.toLowerCase() : normalized;
}

/** Use the visible History & Materials list, never a separately fetched gallery.
 * WorkingImage has no history id: its durable filePath still identifies the slot.
 * An external/stale image is not silently mapped to the first history entry. */
export function imageStageNavigation<T extends StageImageIdentity>(history: readonly T[], image: StageImageIdentity) {
  let index = image.id ? history.findIndex(item => item.id === image.id) : -1;
  if (index < 0 && image.filePath) {
    const filePath = imagePathKey(image.filePath);
    index = history.findIndex(item => Boolean(item.filePath) && imagePathKey(item.filePath!) === filePath);
  }
  return {index, previous: index > 0 ? history[index - 1] : undefined, next: index >= 0 ? history[index + 1] : undefined};
}

/** Geometry is read from the transformed image, not its shell or guessed size. */
export function imageStageContainsPoint(image: HTMLImageElement | null, x: number, y: number) {
  return Boolean(image && image.naturalWidth > 0 && image.naturalHeight > 0 && previewImageContainsPoint(
    image.getBoundingClientRect(), image.naturalWidth, image.naturalHeight, x, y,
    getComputedStyle(image).objectFit === 'contain',
  ));
}
