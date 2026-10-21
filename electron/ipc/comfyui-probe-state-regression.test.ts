import { describe, expect, it } from 'vitest';
import { windowsPortTimeWaitOnly } from './comfyui-probe';
describe('Windows unrelated valid digit TCP states', () => {
  for (const state of ['FIN_WAIT_1', 'FIN_WAIT_2']) {
    it(`accepts unrelated ${state} without discarding the observed target TIME_WAIT`, () => {
      expect(windowsPortTimeWaitOnly(` TCP 127.0.0.1:54321 127.0.0.1:54322 TIME_WAIT 0\n TCP 127.0.0.1:55555 127.0.0.1:55556 ${state} 123`, 54321)).toBe(true);
    });
    it(`does not waive the target's own live ${state} endpoint`, () => {
      expect(windowsPortTimeWaitOnly(` TCP 127.0.0.1:54321 127.0.0.1:54322 ${state} 123`, 54321)).toBe(false);
    });
  }
});
