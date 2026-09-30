import crypto from 'node:crypto';
import type { AppSettings } from '../../src/types';

export interface ImageSettingsNotice { revision: string; version: number }
const sessionKey = crypto.randomBytes(32);
let fingerprint: string | undefined;
let version = 0;
const listeners = new Set<(notice: ImageSettingsNotice) => void>();
function digest(settings: AppSettings) {
  return crypto.createHmac('sha256', sessionKey).update(JSON.stringify([
    settings.imageProvider ?? 'novelai', settings.compatibleImage ?? null, settings.imageApiKey ?? '',
  ])).digest('hex');
}
export function imageSettingsStamp(settings: AppSettings): ImageSettingsNotice {
  fingerprint ??= digest(settings);
  return { revision: `${version}:${fingerprint}`, version };
}
/** Called only after a durable write. Keep a digest, not a mutable cache reference. */
export function commitImageSettings(settings: AppSettings) {
  const next = digest(settings);
  if (fingerprint === next) return;
  fingerprint = next;
  version++;
  const notice = imageSettingsStamp(settings);
  for (const listener of listeners) {
    try { listener({ ...notice }); } catch { /* An observer cannot roll back a committed write. */ }
  }
}
export function onImageSettingsChanged(listener: (notice: ImageSettingsNotice) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
