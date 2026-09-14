import fs from 'node:fs';
import {describe, expect, it} from 'vitest';

const css = fs.readFileSync('src/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (selector: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(match => match[1].trim() === selector).at(-1)?.[2] ?? '';

describe('tavern fullscreen preview layout', () => {
  it('centers the single in-flow viewer instead of retaining the old three-row stage', () => {
    const section = rule('.tavern-image-lightbox > section');
    expect(section).toContain('grid-template-rows: minmax(0, 1fr)');
    expect(section).toContain('place-items: center');
  });
  it('keeps navigation outside image centering and reserves viewport room for controls', () => {
    expect(rule('.tavern-image-lightbox .image-preview-viewer')).toContain('position: relative');
    const controls = rule('.tavern-image-lightbox .image-preview-controls');
    expect(controls).toContain('position: absolute');
    expect(controls).toContain('left: 50%');
    expect(controls).toContain('bottom: calc(100% + 8px)');
    expect(rule('.tavern-image-lightbox .image-preview-stage')).toContain('calc(100dvh - 160px)');
  });
});
