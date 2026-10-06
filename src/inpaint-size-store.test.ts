import { beforeEach, expect, it, vi } from 'vitest';
import { useAppStore } from './store';
beforeEach(() => useAppStore.setState(useAppStore.getInitialState(), true));
it('persists both mode and custom values without modifying main generation params', () => {
  const save = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('window', { naiDesktop: { setSetting: save } });
  useAppStore.setState({ settings: { language: 'zh-CN' } as any });
  const before = { ...useAppStore.getState().params };
  useAppStore.getState().setInpaintCustomSize({ width: 704, height: 1408 });
  useAppStore.getState().setInpaintSizeMode('custom');
  useAppStore.getState().setInpaintSizeMode('original');
  const snapshot = save.mock.calls.at(-1)![1];
  expect(snapshot.inpaintSizeMode).toBe('original');
  expect(snapshot.inpaintCustomSize).toEqual({ width: 704, height: 1408 });
  expect(useAppStore.getState().params).toEqual(before);
  useAppStore.getState().setInpaintSizeMode('custom');
  expect(useAppStore.getState().inpaintCustomSize).toEqual({ width: 704, height: 1408 });
});
