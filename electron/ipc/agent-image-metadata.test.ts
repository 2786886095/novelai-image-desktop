import fs from 'node:fs';
import path from 'node:path';
import {describe, it, expect, vi} from 'vitest';
const state = vi.hoisted(() => ({history: [] as any[]}));
vi.mock('./store', () => ({getSettings: () => ({}), getHistory: () => state.history}));
import {executeAgentTool} from './agent-tools';
import {loadImageFromPath, loadImageFile} from './nai';
const dialog = vi.hoisted(() => ({showOpenDialog: vi.fn()}));
vi.mock('electron', () => ({app: {}, dialog, nativeImage: {}, protocol: {}}));

const root = path.resolve('shared/official-image-metadata-fixtures');
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
describe('actual workbench and MCP tool metadata entrypoints', () => {
  for (const fixture of fixtures) it(fixture.name, async () => {
    const filePath = path.join(root, fixture.name), before = fs.readFileSync(filePath);
    // A history image addressed by its record ID, as the local MCP server does.
    state.history = [{id: 'fixture', filePath, width: 64, height: 128, createdAt: '2026-10-11'}];
    const agent = await executeAgentTool({tool: 'langbai_read_image_metadata', sessionId: '',
      args: {attachmentId: 'fixture'}});
    expect(agent.ok, agent.output).toBe(true);
    const data = agent.data as {found: boolean; parameters: Record<string, unknown>; characterPrompts: unknown[]};
    expect(data.found).toBe(true);
    dialog.showOpenDialog.mockResolvedValueOnce({canceled: false, filePaths: [filePath]});
    const results = [await loadImageFromPath(filePath), await loadImageFile()];
    for (const result of results) {
      expect(result.ok).toBe(true);
      expect(result.image).toMatchObject({width: 64, height: 128});
      for (const [key, value] of Object.entries(fixture.expected)) {
        expect(key === 'characters' ? result.metadata?.characterCaptions.length : (result.metadata?.imported as any)?.[key], key).toEqual(value);
        expect(key === 'characters' ? data.characterPrompts.length : data.parameters[key], 'agent ' + key).toEqual(value);
      }
    }
    expect(fs.readFileSync(filePath)).toEqual(before);
  });
});
