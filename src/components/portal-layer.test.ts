import { describe, expect, it } from 'vitest';
import { resolveSelectPortalLayer, selectPortalLayerAbove } from './portal-layer';

describe('select portal ownership layer', () => {
  it('keeps ordinary menus below unrelated notifications', () => {
    expect(selectPortalLayerAbove(20000, ['1000', '11000'])).toBe(20000);
    expect(selectPortalLayerAbove(20000, [])).toBe(20000);
  });
  it('paints above its context panel and nested ancestor panels', () => {
    expect(selectPortalLayerAbove(20000, ['20020'])).toBe(20021);
    expect(selectPortalLayerAbove(20000, ['auto', '20020', '20040'])).toBe(20041);
    expect(selectPortalLayerAbove(20000, ['20000'])).toBe(20001);
  });
  it('ignores non-integer and negative layers without unbounded CSS values', () => {
    expect(selectPortalLayerAbove(20000, ['auto', '', 'bad', '1.5', '-1'])).toBe(20000);
    expect(selectPortalLayerAbove(NaN, ['auto'])).toBe(20000);
    expect(selectPortalLayerAbove(20000, ['2147483647'])).toBe(2147483647);
  });
  it('reads the owning document semantic layer and every parent', () => {
    const outer = { parentElement: null, zIndex: '20040' };
    const inner = { parentElement: outer, zIndex: '20020' };
    const doc = {
      documentElement: {},
      defaultView: { getComputedStyle: (element: { zIndex?: string }) => ({
        zIndex: element.zIndex ?? 'auto', getPropertyValue: () => '20000',
      }) },
    };
    expect(resolveSelectPortalLayer({ ownerDocument: doc, parentElement: inner } as unknown as Element)).toBe(20041);
    expect(resolveSelectPortalLayer({ ownerDocument: { defaultView: null } } as unknown as Element)).toBe(20000);
  });
});
