import axios, { type AxiosRequestConfig } from 'axios';
import { proxyConfigForUrl } from './proxy';
import { getSettings } from './store';

/** Public gallery GETs must resolve PAC for their own host, not GitHub/update. */
export async function galleryGet<T = unknown>(url: string, options: AxiosRequestConfig = {}) {
  const controller = new AbortController();
  const timeout = Number(options.timeout) > 0 ? Number(options.timeout) : 30_000;
  const abort = () => controller.abort();
  options.signal?.addEventListener?.('abort', abort);
  if (options.signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(new Error('Gallery request timed out')), timeout);
  try {
    const route = await abortableGalleryWork(proxyConfigForUrl('update', url, getSettings()), controller.signal);
    controller.signal.throwIfAborted();
    return await abortableGalleryWork(axios.get<T>(url, { ...options, ...route, signal: controller.signal, timeout }), controller.signal);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener?.('abort', abort);
  }
}

function abortableGalleryWork<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason ?? new Error('Gallery request cancelled'));
    if (signal.aborted) { work.catch(() => undefined); aborted(); return; }
    signal.addEventListener('abort', aborted, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

/** Optional metadata may enrich a page, but never hold a ready list hostage. */
export function optionalGalleryValue<T>(value: Promise<T>, waitMs = 250): Promise<T | null> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), waitMs);
    value.then(result => { clearTimeout(timer); resolve(result); }, () => { clearTimeout(timer); resolve(null); });
  });
}

let imageActive = 0;
const imageQueue: Array<() => void> = [];
/** Keep image traffic bounded and separate from the metadata/list lane. */
export async function galleryImageSlot<T>(load: () => Promise<T>): Promise<T> {
  await new Promise<void>(resolve => {
    const enter = () => { imageActive++; resolve(); };
    if (imageActive < 6) enter(); else imageQueue.push(enter);
  });
  try { return await load(); }
  finally { imageActive--; imageQueue.shift()?.(); }
}
