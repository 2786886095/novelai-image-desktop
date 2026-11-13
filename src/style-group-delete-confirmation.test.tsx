import { isValidElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  group: '常用',
  settings: {} as Record<string, unknown>,
  hook: 0,
  setGroup: vi.fn(),
  refreshSettings: vi.fn(),
  confirmAction: vi.fn(),
  setSetting: vi.fn(),
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => ++f.hook === 2
    ? [f.group, f.setGroup]
    : [initial, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: () => ({ current: null }),
}));
vi.mock('./store', () => {
  const state = { get settings() { return f.settings; }, refreshSettings: f.refreshSettings };
  return { useAppStore: Object.assign(
    (pick: (s: typeof state) => unknown) => pick(state),
    { getState: () => state, setState: () => {} },
  ) };
});
vi.mock('./components/confirm', () => ({ confirmAction: f.confirmAction }));
vi.mock('./components/ui', () => ({ Button: 'button', SelectMenuCompat: 'select' }));
vi.mock('./components/PreviewImageViewer', () => ({ PreviewImageViewer: () => null }));
vi.mock('./components/FilePicker', () => ({ FilePicker: () => null }));

import StyleLibrary from './StyleLibrary';

function deleteButton(value: unknown): ReactElement<{
  disabled: boolean;
  onClick: () => unknown;
}> | undefined {
  if (!isValidElement<{ className?: string; children?: unknown }>(value)) return;
  const children = Array.isArray(value.props.children)
    ? value.props.children.flat(Infinity) : [value.props.children];
  if (value.props.className === 'style-library-groups') {
    return children.at(-1) as ReturnType<typeof deleteButton>;
  }
  for (const child of children) {
    const found = deleteButton(child);
    if (found) return found;
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  f.hook = 0;
  f.group = '常用';
  f.settings = {
    language: 'zh-CN',
    stylePromptPresetGroups: ['Default', '常用', '其他'],
    stylePromptPresets: [
      { id: 'A', name: 'A', prompt: 'artist:test_a', group: '常用', previewImages: [{ id: 'a' }] },
      { id: 'B', name: 'B', prompt: 'artist:test_b', group: '其他', previewImages: [] },
    ],
  };
  f.setSetting.mockImplementation(async (key: string, value: unknown) => {
    f.settings[key] = value;
    return value;
  });
  vi.stubGlobal('window', { naiDesktop: {
    getSettings: async () => f.settings,
    setSetting: f.setSetting,
  } });
});

afterEach(() => vi.unstubAllGlobals());

describe('desktop style manager group deletion', () => {
  it('waits for explicit confirmation and performs no write after cancellation', async () => {
    let resolve!: (value: boolean) => void;
    f.confirmAction.mockReturnValue(new Promise<boolean>((done) => { resolve = done; }));
    const click = deleteButton(StyleLibrary())!.props.onClick();
    await new Promise((done) => setTimeout(done, 0));
    console.log('first click: confirmation=%d writes=%d', f.confirmAction.mock.calls.length, f.setSetting.mock.calls.length);
    expect(f.confirmAction).toHaveBeenCalledWith(
      expect.stringContaining('“常用”'),
      '删除分组', undefined, undefined,
      { confirm: '删除分组', cancel: '取消', localized: true },
    );
    expect(f.confirmAction.mock.calls[0][0]).toContain('默认分组');
    expect(f.setSetting).not.toHaveBeenCalled();
    resolve(false);
    await click;
    expect(f.setSetting).not.toHaveBeenCalled();
    expect(f.settings.stylePromptPresetGroups).toEqual(['Default', '常用', '其他']);
  });

  it('on confirmation removes only the target group and keeps its preset and preview', async () => {
    f.confirmAction.mockResolvedValue(true);
    const click = deleteButton(StyleLibrary())!.props.onClick();
    await vi.waitFor(() => expect(f.setGroup).toHaveBeenCalled());
    await click;
    expect(f.confirmAction).toHaveBeenCalledTimes(1);
    expect(f.setSetting.mock.calls.map(([key]) => key)).toEqual([
      'stylePromptPresets', 'stylePromptPresetGroups',
    ]);
    expect(f.settings.stylePromptPresetGroups).toEqual(['Default', '其他']);
    expect(f.settings.stylePromptPresets).toEqual([
      { id: 'A', name: 'A', prompt: 'artist:test_a', group: 'Default', previewImages: [{ id: 'a' }] },
      { id: 'B', name: 'B', prompt: 'artist:test_b', group: '其他', previewImages: [] },
    ]);
    console.log('confirmed: A=Default B=其他; original preview retained');
  });

  it.each(['', 'Default'])('disables deletion for %j', (group) => {
    f.group = group;
    expect(deleteButton(StyleLibrary())!.props.disabled).toBe(true);
    expect(f.confirmAction).not.toHaveBeenCalled();
    expect(f.setSetting).not.toHaveBeenCalled();
  });
});
