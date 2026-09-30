import fs from 'node:fs';
import {describe, it, expect} from 'vitest';
describe('image Agent route cutover', () => {
  it('routes Agent to the app-tool chat, not Harness or the legacy Tavern page', () => {
    const source = fs.readFileSync('src/App.tsx', 'utf8');
    expect(source).toContain('import("./PiAgentPage")');
    expect(source).not.toContain('import("./HarnessPage")');
  });
  it('labels the entry 生图智能体', () => {
    expect(fs.readFileSync('src/i18n.ts', 'utf8')).toContain('label: "生图智能体"');
  });
  it('guards native close while the engine is alive', () => {
    expect(fs.readFileSync('electron/main.ts', 'utf8')).toContain('confirmHarnessExit');
  });
});
