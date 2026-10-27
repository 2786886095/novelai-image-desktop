import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const modalStyles = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const libraryStyles = readFileSync(new URL('./template-library.css', import.meta.url), 'utf8');

// Geometry is exercised separately with the actual SettingsModal in a browser.
// These guards prevent the two CSS contracts behind that regression from drifting.
describe('template library inside the settings modal', () => {
  it('limits close-button styling to the outer header, including grouped close buttons', () => {
    expect(modalStyles).not.toMatch(/\.modal\s+header\s+button\b/);
    expect(modalStyles).toMatch(/\.modal\s*>\s*header\s+button\s*\{/);
    expect(modalStyles).toMatch(/\.modal\s*>\s*header\s+button:hover\s*\{/);
  });

  it('wraps whole header controls at the available content width', () => {
    const header = libraryStyles.match(/\.template-library__header\s*\{([^}]+)\}/)?.[1] ?? '';
    const buttons = libraryStyles.match(/\.template-library__header\s+\.btn\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(header).toMatch(/flex-wrap\s*:\s*wrap/);
    expect(buttons).toMatch(/flex\s*:\s*0\s+0\s+auto/);
    expect(buttons).toMatch(/white-space\s*:\s*nowrap/);
    expect(buttons).toMatch(/width\s*:\s*auto/);
  });
});
