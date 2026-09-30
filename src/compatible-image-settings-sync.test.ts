import { afterEach, expect, it, vi } from 'vitest';
import type { AppSettings } from './types';
import { DEFAULT_PARAMS } from './types';
import { mergeFullSettings, mergeImageSettings } from './compatible-image-settings-sync';
import { useAppStore } from './store';
const settings = (version: number) => ({ imageServiceVersion: version, imageServiceRevision: `fixture:${version}`,
  imageProvider: 'novelai', compatibleImage: { baseUrl: 'https://example.test/v1', model: `model-${version}`, size: 'auto', responseFormat: 'auto' },
  imageApiKey: `key-${version}`, language: 'zh-CN', savedStylePrompt: `style-${version}` }) as AppSettings;
afterEach(() => { vi.unstubAllGlobals(); useAppStore.setState(useAppStore.getInitialState(), true); });
it('merges only image fields, retaining other drafts', () => {
  const merged = mergeImageSettings(settings(1), settings(2));
  expect(merged.compatibleImage?.model).toBe('model-2'); expect(merged.imageApiKey).toBe('key-2');
  expect(merged.savedStylePrompt).toBe('style-1'); expect(merged.imageServiceVersion).toBe(2);
});
it('ignores out-of-order event responses and protects image fields on a slow full read', () => {
  const current = settings(3); expect(mergeImageSettings(current, settings(1))).toBe(current);
  const full = mergeFullSettings(current, settings(1));
  expect(full.savedStylePrompt).toBe('style-1'); expect(full.compatibleImage?.model).toBe('model-3');
  expect(mergeFullSettings(current, settings(4))).toEqual(settings(4));
});
it('initializes an empty state and does not erase a versioned service with an unversioned read', () => {
  expect(mergeImageSettings(null, settings(2))).toEqual(settings(2));
  expect(mergeFullSettings(settings(2), {} as AppSettings).imageServiceVersion).toBe(2);
});
function fixture() {
  let listener: (() => void) | undefined;
  const api = {
    getSettings: vi.fn().mockResolvedValue(settings(1)),
    onImageServiceChanged: vi.fn((callback: () => void) => { listener = callback; return vi.fn(); }),
    onGenerationPreview: vi.fn(() => vi.fn()), onUpdateEvent: vi.fn(() => vi.fn()),
    accountCached: vi.fn().mockResolvedValue({ hasToken: false }), isFirstRun: vi.fn().mockResolvedValue(false),
    getHistoryDates: vi.fn().mockResolvedValue([]), getHistoryGroups: vi.fn().mockResolvedValue([]),
    isPortable: vi.fn().mockResolvedValue(false), getHistory: vi.fn().mockResolvedValue([]),
  };
  vi.stubGlobal('window', { naiDesktop: api });
  useAppStore.setState(useAppStore.getInitialState(), true);
  return { api, notify: () => listener!() };
}
it('actual store subscription updates provider/key without modifying prompts/count or duplicating listeners', async () => {
  const f = fixture(); await useAppStore.getState().load(); await useAppStore.getState().load();
  expect(f.api.onImageServiceChanged).toHaveBeenCalledTimes(1);
  useAppStore.setState({ params: { ...DEFAULT_PARAMS, positivePrompt: 'unsaved prompt' }, batchCount: 7 });
  f.api.getSettings.mockResolvedValue(settings(2)); f.notify(); await Promise.resolve();
  const current = useAppStore.getState();
  expect(current.settings?.imageApiKey).toBe('key-2'); expect(current.params.positivePrompt).toBe('unsaved prompt'); expect(current.batchCount).toBe(7);
  expect(current.settings?.savedStylePrompt).toBe('style-1');
});
it('actual store ignores late notifications and late full refresh responses', async () => {
  const f = fixture(); await useAppStore.getState().load();
  let old!: (value: AppSettings) => void;
  f.api.getSettings.mockImplementationOnce(() => new Promise(r => { old = r; }));
  const slow = useAppStore.getState().refreshSettings();
  f.api.getSettings.mockResolvedValue(settings(3)); f.notify(); await Promise.resolve();
  old(settings(2)); await slow;
  expect(useAppStore.getState().settings?.imageServiceVersion).toBe(3);
  f.api.getSettings.mockResolvedValue(settings(1)); f.notify(); await Promise.resolve();
  expect(useAppStore.getState().settings?.imageServiceVersion).toBe(3);
});
it('boot completion cannot rewind a newer image service notification', async () => {
  const f = fixture(); let account!: (value: { hasToken: boolean }) => void;
  f.api.accountCached.mockImplementationOnce(() => new Promise(r => { account = r; }));
  const loading = useAppStore.getState().load(); await Promise.resolve();
  f.api.getSettings.mockResolvedValue(settings(4)); f.notify(); await Promise.resolve();
  account({ hasToken: false }); await loading;
  expect(useAppStore.getState().bootDone).toBe(true); expect(useAppStore.getState().settings?.imageServiceVersion).toBe(4);
});
it('a failed notification read retains the prior snapshot and drafts', async () => {
  const f = fixture(); await useAppStore.getState().load();
  const before = useAppStore.getState().settings;
  f.api.getSettings.mockRejectedValue(new Error('fixture read failure')); f.notify(); await Promise.resolve(); await Promise.resolve();
  expect(useAppStore.getState().settings).toBe(before);
});
