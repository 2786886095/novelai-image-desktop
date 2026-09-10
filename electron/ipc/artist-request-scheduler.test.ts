import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createArtistRequestScheduler } from "./artist-request-scheduler";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); });

it("overlaps up to two slow requests without a request burst", async () => {
  const scheduler = createArtistRequestScheduler(), starts: number[] = [];
  let active = 0, peak = 0;
  const requests = Array.from({ length: 10 }, async () => {
    const release = await scheduler.acquire();
    starts.push(Date.now()); active++; peak = Math.max(peak, active);
    await new Promise(r => setTimeout(r, 1200)); active--; release();
  });
  await vi.runAllTimersAsync(); await Promise.all(requests);
  expect(peak).toBe(2);
  expect(starts.every((s, i) => !i || s - starts[i - 1] >= 500)).toBe(true);
  expect(Date.now()).toBeLessThan(12000); // Old serial RTT: 10 x 1200ms.
});

it("sustains one request per second after the small burst allowance", async () => {
  const scheduler = createArtistRequestScheduler(), starts: number[] = [];
  const requests = Array.from({ length: 30 }, async () => {
    const release = await scheduler.acquire(); starts.push(Date.now()); release();
  });
  await vi.runAllTimersAsync(); await Promise.all(requests);
  expect(starts.slice(12).every((s, i) => s - starts[i + 11] >= 1000)).toBe(true);
  expect(starts[29]).toBeGreaterThanOrEqual(24000);
});

it("total metadata yields to selection instead of competing for its request slots", async () => {
  const scheduler = createArtistRequestScheduler(), finish = scheduler.beginSelection();
  let metadataStarted = false;
  const metadata = scheduler.acquire(undefined, true).then(release => { metadataStarted = true; release(); });
  const release = await scheduler.acquire(); release();
  await vi.advanceTimersByTimeAsync(3000);
  expect(metadataStarted).toBe(false);
  finish(); finish(); await vi.runAllTimersAsync(); await metadata;
  expect(metadataStarted).toBe(true);
});

it("server backoff pauses both candidate and metadata requests", async () => {
  const scheduler = createArtistRequestScheduler(); const starts: number[] = [];
  (await scheduler.acquire())(); scheduler.backoff(5000);
  const tasks = [false, true].map(async background => {
    const release = await scheduler.acquire(undefined, background); starts.push(Date.now()); release();
  });
  await vi.advanceTimersByTimeAsync(4999); expect(starts).toEqual([]);
  await vi.runAllTimersAsync(); await Promise.all(tasks);
  expect(starts[0]).toBeGreaterThanOrEqual(5000);
});

it("cancelling a queued request removes it without consuming a slot", async () => {
  const scheduler = createArtistRequestScheduler(), finish = scheduler.beginSelection();
  const controller = new AbortController();
  const request = scheduler.acquire(controller.signal, true);
  const check = expect(request).rejects.toThrow("cancelled");
  controller.abort(); await check; finish();
  (await scheduler.acquire())(); await vi.runAllTimersAsync();
  expect(vi.getTimerCount()).toBe(0);
});

it("slot release is idempotent and does not exceed the concurrency ceiling", async () => {
  const scheduler = createArtistRequestScheduler();
  const release = await scheduler.acquire(); release(); release();
  let active = 0, peak = 0;
  const jobs = Array.from({ length: 5 }, async () => {
    const end = await scheduler.acquire(); active++; peak = Math.max(peak, active);
    await new Promise(r => setTimeout(r, 1500)); active--; end(); end();
  });
  await vi.runAllTimersAsync(); await Promise.all(jobs); expect(peak).toBe(2);
});
