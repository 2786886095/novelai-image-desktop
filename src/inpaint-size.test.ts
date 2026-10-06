import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { inpaintSizePlan, restoreInpaintSizeState, scaledInpaintRegion, validateInpaintSize } from './inpaint-size';
import { InpaintSizeControls } from './components/InpaintSizeControls';
const source = { width: 896, height: 1152 }, custom = { width: 704, height: 1408 };
it('selects exact original/custom dimensions without changing unrelated main dimensions', () => {
  expect(inpaintSizePlan('original', custom, source).outputSize).toEqual(source);
  expect(inpaintSizePlan('custom', custom, source).requestSize).toEqual(custom);
  expect(custom).toEqual({ width: 704, height: 1408 });
});
it.each([0, NaN, Infinity, 63, 705, 1601, 2048, 704.5])('rejects %s instead of snapping or submitting', width => {
  expect(() => validateInpaintSize({ width, height: 1024 })).toThrow();
});
it('restores modes and independent custom values; migrates missing fields to original', () => {
  expect(restoreInpaintSizeState(null)).toEqual({ inpaintSizeMode: 'original', inpaintCustomSize: { width: 1024, height: 1024 } });
  expect(restoreInpaintSizeState({ inpaintSizeMode: 'custom', inpaintCustomSize: custom })).toEqual({ inpaintSizeMode: 'custom', inpaintCustomSize: custom });
  expect(restoreInpaintSizeState({ inpaintSizeMode: 'original', inpaintCustomSize: custom }).inpaintCustomSize).toEqual(custom);
  expect(restoreInpaintSizeState({ inpaintSizeMode: 'unknown', inpaintCustomSize: { width: -1, height: Infinity } }).inpaintCustomSize).toEqual({ width: 1024, height: 1024 });
});
it('focused requests use crop dimensions but keep the chosen final canvas', () => {
  const region = { x: 128, y: 128, width: 256, height: 256 };
  const plan = inpaintSizePlan('custom', custom, source, region);
  expect(plan.outputSize).toEqual(custom);
  expect(plan.requestSize.width % 64).toBe(0);
  expect(plan.requestSize.height % 64).toBe(0);
  expect(scaledInpaintRegion(region, source, source)).toEqual(region);
});
it('renders two exclusive choices and hides unused custom inputs in original mode', () => {
  const props = { mode: 'original' as const, custom, source, language: 'zh-CN', onMode: () => {}, onSize: () => {} };
  const html = renderToStaticMarkup(createElement(InpaintSizeControls, props));
  expect(html).toContain('原图尺寸'); expect(html).toContain('自定义尺寸'); expect(html).toContain('896×1152');
  expect(html).not.toContain('inpaint-width');
  expect(renderToStaticMarkup(createElement(InpaintSizeControls, { ...props, mode: 'custom' }))).toContain('inpaint-width');
});
