import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const fixture = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => fixture.root, getAppPath: () => fixture.root }, safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() } }));
beforeEach(() => { fixture.root = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-proxy-default-')); vi.resetModules(); });
afterEach(() => {
  vi.restoreAllMocks();
  if (path.dirname(fixture.root) !== path.resolve(os.tmpdir()) || !path.basename(fixture.root).startsWith('owned-proxy-default-')) throw Error('Invalid owned fixture cleanup');
  fs.rmSync(fixture.root, { recursive: true, force: true });
});
it.each(['absent', 'missing-mode', 'auto', 'http', 'custom', 'socks', 'direct', 'choose-direct'])('desktop proxy cold persistence %s', async input => {
  const mode = ['absent', 'missing-mode', 'choose-direct'].includes(input) ? 'auto' : input;
  const url = input === 'http' ? 'http://127.0.0.1:7890' : input === 'custom' ? 'http://127.0.0.1:17892' : input === 'socks' ? 'socks5://127.0.0.1:10809' : '';
  const file = path.join(fixture.root, 'novelai-image-desktop.json');
  if (input !== 'absent' && input !== 'choose-direct') fs.writeFileSync(file, JSON.stringify({ settings: { ...(input !== 'missing-mode' ? { proxyMode: mode } : {}), proxyUrl: url, proxyForMcp: false, proxyForTranslate: false } }));
  const first = await import('./store');
  if (input === 'choose-direct') first.setSetting('proxyMode', 'direct');
  const before = first.getSettings();
  vi.resetModules();
  const second = await import('./store');
  const cold = second.getSettings();
  const expected = input === 'choose-direct' ? 'direct' : mode;
  console.log(`PROXY_PERSISTENCE desktop input=${input} expected=${expected}/${url} first=${before.proxyMode}/${before.proxyUrl} cold=${cold.proxyMode}/${cold.proxyUrl};0HTTP/0credits`);
  expect(cold.proxyMode).toBe(expected);
  expect(cold.proxyUrl).toBe(url);
  if (input !== 'absent' && input !== 'choose-direct') {
    expect(cold.proxyForMcp).toBe(false);
    expect(cold.proxyForTranslate).toBe(false);
  }
});
