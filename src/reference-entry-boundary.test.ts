import { afterEach, expect, it } from 'vitest';
import { useAppStore } from './store';
import { STORE_LOCALES } from './store-i18n';
import type { AppLanguage, AppSettings, VibeTransferImage } from './types';

const item = (id: string): VibeTransferImage => ({ id, base64:'owned-image', previewUrl:'owned.png', infoExtracted:.4, strength:.65 });
function seed(count: number, language: AppLanguage = 'zh-CN') {
  useAppStore.setState(useAppStore.getInitialState(), true);
  useAppStore.setState({ vibeImages:Array.from({length:count}, (_, i) => item(`owned-${i}`)), settings:{language} as AppSettings });
}
afterEach(() => useAppStore.setState(useAppStore.getInitialState(), true));
it('accepts the sixteenth item and keeps its parameters unchanged', () => {
  seed(15); const input=item('sixteenth');
  expect(useAppStore.getState().addVibeImage(input)).toBe(true);
  expect(useAppStore.getState().vibeImages).toHaveLength(16);
  expect(useAppStore.getState().vibeImages.at(-1)).toBe(input);
});
it('rejects the seventeenth item without replacing or editing existing references', () => {
  seed(16); const before=useAppStore.getState().vibeImages;
  expect(useAppStore.getState().addVibeImage(item('extra'))).toBe(false);
  expect(useAppStore.getState().vibeImages).toBe(before);
  expect(useAppStore.getState().vibeImages).toHaveLength(16);
});
it('successive delayed-reader commits use current state rather than captured capacity', () => {
  seed(15); const commit=useAppStore.getState().addVibeImage;
  expect(commit(item('read-a'))).toBe(true);
  expect(commit(item('read-b'))).toBe(false);
  expect(useAppStore.getState().vibeImages).toHaveLength(16);
});
for (const language of Object.keys(STORE_LOCALES) as AppLanguage[]) {
  it(`shows the capacity rejection in ${language}`, () => {
    seed(16, language); useAppStore.getState().addVibeImage(item('extra'));
    expect(useAppStore.getState().toast).toBe(STORE_LOCALES[language]['reference.vibeLimit']);
    expect(useAppStore.getState().toast).toContain('16');
    expect(useAppStore.getState().toast).not.toBe('reference.vibeLimit');
  });
}
it('removing an existing reference makes exactly one slot available', () => {
  seed(16); useAppStore.getState().removeVibeImage('owned-0');
  expect(useAppStore.getState().addVibeImage(item('replacement'))).toBe(true);
  expect(useAppStore.getState().addVibeImage(item('extra'))).toBe(false);
  expect(useAppStore.getState().vibeImages).toHaveLength(16);
});
it('clearing references retains the add method and restores capacity', () => {
  seed(16); useAppStore.getState().clearVibeImages();
  expect(useAppStore.getState().addVibeImage(item('new'))).toBe(true);
  expect(useAppStore.getState().vibeImages).toHaveLength(1);
});
