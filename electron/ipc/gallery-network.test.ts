import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), route: vi.fn(), settings: { proxyMode: 'auto' } }));
vi.mock('axios', () => ({ default: { get: mocks.get } }));
vi.mock('./proxy', () => ({ proxyConfigForUrl: mocks.route }));
vi.mock('./store', () => ({ getSettings: () => mocks.settings }));
import { galleryGet, galleryImageSlot, optionalGalleryValue } from './gallery-network';
beforeEach(() => { mocks.get.mockReset(); mocks.route.mockReset().mockResolvedValue({ proxy: false }); });
afterEach(() => vi.useRealTimers());
it.each([
  'https://aitag.win/api/config', 'https://danbooru.donmai.us/posts.json',
  'https://safebooru.donmai.us/counts/posts.json', 'https://gelbooru.com/index.php',
  'https://novelai.quicktagcloud.com/data-source.json', 'https://assets.quicktagcloud.com/releases/current.json',
  'https://tags.gallery/v4-5', 'https://cdn.example/preview.jpg',
])('resolves gallery PAC against actual URL: %s', async url => {
  mocks.get.mockResolvedValue({ data: 'ready' });
  await galleryGet(url, { timeout: 500 });
  expect(mocks.route).toHaveBeenCalledWith('update', url, mocks.settings);
  expect(mocks.get).toHaveBeenCalledWith(url, expect.objectContaining({ proxy: false, timeout: 500, signal: expect.any(AbortSignal) }));
});
it('bounds even a stalled PAC resolver and does not start a later GET', async () => {
  vi.useFakeTimers(); mocks.route.mockImplementation(() => new Promise(() => {}));
  const result = galleryGet('https://tags.gallery/v4-5', { timeout: 300 }).catch(e => e);
  await vi.advanceTimersByTimeAsync(301);
  expect(await result).toBeInstanceOf(Error); expect(mocks.get).not.toHaveBeenCalled();
});
it('aborts an active read when the caller cancels', async () => {
  mocks.get.mockImplementation(() => new Promise(() => {}));
  const controller = new AbortController();
  const request = galleryGet('https://aitag.win/api/config', { signal: controller.signal }).catch(e => e);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  controller.abort(); expect(await request).toBeInstanceOf(Error);
  expect(mocks.get.mock.calls[0][1].signal.aborted).toBe(true);
});
it('optional totals can be unavailable without stalling or inventing a count', async () => {
  vi.useFakeTimers(); const result = optionalGalleryValue(new Promise<number>(() => {}));
  await vi.advanceTimersByTimeAsync(250); expect(await result).toBeNull();
  expect(await optionalGalleryValue(Promise.resolve(0))).toBe(0);
});
it('caps image downloads at six, releases slots on failure, and does not block data reads', async () => {
  let active = 0, peak = 0;
  const releases: Array<() => void> = [];
  const tasks = Array.from({ length: 14 }, (_, i) => galleryImageSlot(async () => {
    active++; peak = Math.max(active, peak);
    await new Promise<void>(r => releases.push(r)); active--;
    if (i === 0) throw new Error('unavailable image'); return i;
  }).catch(() => -1));
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(active).toBe(6);
  mocks.get.mockResolvedValue({ data: 'list' }); expect((await galleryGet('https://tags.gallery/v4-5')).data).toBe('list');
  while (releases.length) { releases.shift()!(); for (let i = 0; i < 20; i++) await Promise.resolve(); }
  expect((await Promise.all(tasks)).length).toBe(14); expect(peak).toBe(6);
});
