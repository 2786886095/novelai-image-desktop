import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ collapsed: false }));
vi.mock('../store', () => ({ useAppStore: (select: (state: unknown) => unknown) => select({
  wsHistoryCollapsed: fixture.collapsed, wsRightWidth: 416,
  activeTab: 'generate', settings: { language: 'zh-CN' },
}) }));
import { HistoryRailControls } from './HistoryRailControls';

afterEach(() => { fixture.collapsed = false; });
it.each([false, true])('centers the vector glyph for collapsed=%s without font baselines', collapsed => {
  fixture.collapsed = collapsed;
  const html = renderToStaticMarkup(<HistoryRailControls />);
  expect(html).toContain('viewBox="0 0 20 20"');
  expect(html).toContain('aria-hidden="true" focusable="false"');
  const points = html.match(/<polyline points="([^"]+)"/)![1].split(' ').map(p => p.split(',').map(Number));
  for (const axis of [0, 1]) {
    const values = points.map(p => p[axis]);
    expect((Math.min(...values) + Math.max(...values)) / 2).toBe(10);
  }
  expect(html).not.toContain(collapsed ? '‹' : '›');
  expect(html).toContain(`aria-expanded="${!collapsed}"`);
});
it('keeps the button position and size, with a block SVG centered by the existing grid', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const button = css.match(/\.history-rail-toggle \{([^}]+)\}/)![1];
  for (const rule of ['top: 14px', 'width: 28px', 'height: 28px', 'place-items: center']) expect(button).toContain(rule);
  expect(css).toContain('.history-rail-toggle > svg { display: block; width: 16px; height: 16px; }');
});
