import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';

// Resolve the shipped CSS declarations rather than assuming numeric token values.
const sheet = postcss.parse(readFileSync(new URL('./styles.css', import.meta.url), 'utf8'));
const layers = new Map<string, string>();
let toastLayer = '';
sheet.walkDecls(declaration => {
  if (declaration.prop.startsWith('--z-')) layers.set(declaration.prop, declaration.value);
  if (declaration.prop === 'z-index' && declaration.parent?.type === 'rule'
      && declaration.parent.selector.split(',').map(selector => selector.trim()).includes('.toast')) {
    toastLayer = declaration.value;
  }
});
function resolveLayer(input: string): number {
  const expanded = input.replace(/var\((--z-[\w-]+)\)/g, (_, key: string) => {
    return String(resolveLayer(layers.get(key) ?? ''));
  })
    .replace(/^calc\((.*)\)$/, '$1');
  if (!/^\s*\d+(?:\s*\+\s*\d+)*\s*$/.test(expanded)) throw new Error(`Unsupported z-layer: ${input}`);
  return expanded.split('+').map(Number).reduce((sum, value) => sum + value, 0);
}
describe('global feedback remains above its invoking dialog', () => {
  for (const [label, token] of [
    ['ordinary modal', '--z-overlay'], ['raised modal', '--z-overlay-raised'],
    ['fullscreen preview', '--z-overlay-top'], ['nested confirmation', '--z-confirm'],
  ]) {
    it(`is readable above ${label}`, () => {
      expect(resolveLayer(toastLayer)).toBeGreaterThan(resolveLayer(layers.get(token) ?? ''));
    });
  }
  it('preserves the explicit help-layer priority', () => {
    expect(resolveLayer(toastLayer)).toBeLessThan(resolveLayer(layers.get('--z-help') ?? ''));
  });
});
