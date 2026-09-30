import type { AppSettings } from './types';
import {normalizeNovelAiSettings} from './novelai-only-settings';

/** Events refresh only this projection; unrelated settings and workbench drafts stay intact. */
export function mergeImageSettings(current: AppSettings | null, incoming: AppSettings): AppSettings {
  if (!current) return normalizeNovelAiSettings(incoming);
  if ((current.imageServiceVersion ?? -1) > (incoming.imageServiceVersion ?? -1)) return normalizeNovelAiSettings(current);
  return { ...current, imageProvider: 'novelai', compatibleImage: incoming.compatibleImage,
    imageApiKey: incoming.imageApiKey, imageServiceRevision: incoming.imageServiceRevision,
    imageServiceVersion: incoming.imageServiceVersion };
}
/** A slow full read may refresh other fields, but must not rewind the image service. */
export function mergeFullSettings(current: AppSettings | null, incoming: AppSettings): AppSettings {
  return current && (current.imageServiceVersion ?? -1) > (incoming.imageServiceVersion ?? -1)
    ? mergeImageSettings(incoming, current) : normalizeNovelAiSettings(incoming);
}
