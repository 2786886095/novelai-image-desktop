import fs from 'node:fs';
import {describe, it, expect} from 'vitest';
describe('Tavern Agent launcher cutover', () => {
  it('routes Tavern to the new launcher, not the legacy chat page', () => {
    expect(fs.readFileSync('src/App.tsx', 'utf8')).toContain('import("./HarnessPage")');
  });
  it('labels the entry 酒馆Agent', () => {
    expect(fs.readFileSync('src/i18n.ts', 'utf8')).toContain('label: "酒馆Agent"');
  });
  it('guards native close while the engine is alive', () => {
    expect(fs.readFileSync('electron/main.ts', 'utf8')).toContain('confirmHarnessExit');
  });
});
