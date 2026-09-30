import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import { expect, it, vi } from 'vitest';
import { listenBrowserLoopback } from './browser-loopback';
function fixture(errors: Array<string | null>, sync = false) {
  const emitter = new EventEmitter();
  const listen = vi.fn(() => {
    const code = errors.shift();
    if (sync && code) throw Object.assign(new Error('fixture'), { code });
    queueMicrotask(() => code ? emitter.emit('error', Object.assign(new Error('fixture'), { code })) : emitter.emit('listening'));
    return emitter;
  });
  return { emitter, listen, server: Object.assign(emitter, { listen }) as unknown as Server };
}
it('does not delegate port selection to the potentially unsafe OS ephemeral range', async () => {
  const f = fixture([]); const port = await listenBrowserLoopback(f.server);
  expect(port).toBeGreaterThanOrEqual(49152); expect(port).toBeLessThanOrEqual(65535);
  expect(f.listen).toHaveBeenCalledWith(port, '127.0.0.1'); expect(f.emitter.eventNames()).toEqual([]);
});
it('retries address collisions and reserved Windows ports, with no leaked listeners', async () => {
  const f = fixture(['EADDRINUSE', 'EACCES', null]); let port = 50000;
  expect(await listenBrowserLoopback(f.server, () => port++)).toBe(50002);
  expect(f.listen).toHaveBeenCalledTimes(3); expect(f.emitter.eventNames()).toEqual([]);
});
it('bounds collisions instead of hanging forever', async () => {
  const f = fixture(Array(32).fill('EADDRINUSE'));
  await expect(listenBrowserLoopback(f.server)).rejects.toThrow('端口暂不可用');
  expect(f.listen).toHaveBeenCalledTimes(32); expect(f.emitter.eventNames()).toEqual([]);
});
it('propagates unexpected asynchronous and synchronous errors and cleans up listeners', async () => {
  for (const sync of [false, true]) {
    const f = fixture(['EINVAL'], sync);
    await expect(listenBrowserLoopback(f.server)).rejects.toMatchObject({ code: 'EINVAL' });
    expect(f.listen).toHaveBeenCalledTimes(1); expect(f.emitter.eventNames()).toEqual([]);
  }
});
it('rejects unsafe injected values before binding', async () => {
  for (const port of [0, 6000, 10080, 49151, 65536, NaN, 50000.5]) {
    const f = fixture([]); await expect(listenBrowserLoopback(f.server, () => port)).rejects.toThrow('Invalid');
    expect(f.listen).not.toHaveBeenCalled();
  }
});
