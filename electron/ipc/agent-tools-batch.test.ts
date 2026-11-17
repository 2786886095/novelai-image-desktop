import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ generate: vi.fn(), searchDictionary: vi.fn() }));
vi.mock('./nai', () => ({ generateImage: mocks.generate }));
vi.mock('./store', () => ({ getSettings: () => ({}) }));
vi.mock('./agent-store', () => ({}));
vi.mock('./danbooru-tags', () => ({}));
vi.mock('./multilingual-tags', () => ({searchMultilingualTags:mocks.searchDictionary}));
vi.mock('./online-gallery', () => ({}));
vi.mock('./reference-presets', () => ({}));
import { executeAgentTool } from './agent-tools';
const item = { id: 'first-image', filePath: 'fixture.png', fileUrl: 'fixture://first', width: 2, height: 3, createdAt: '2026-09-14' };
const run = () => executeAgentTool({ tool: 'langbai_generate_image', args: { positivePrompt: 'forest', count: 3 } }, () => {});
beforeEach(() => mocks.generate.mockReset());
describe('batch generation retains completed results on failure', () => {
  it.each(['response', 'exception'])('keeps the first image after a second-request %s and stops', async (kind) => {
    mocks.generate.mockResolvedValueOnce({ ok: true, message: 'ok', items: [item] });
    if (kind === 'response') mocks.generate.mockResolvedValueOnce({ ok: false, message: 'HTTP 429', items: [] });
    else mocks.generate.mockRejectedValueOnce(new Error('HTTP 429'));
    const result = await run();
    expect(result.ok).toBe(false);
    expect(result.generatedImages?.map(image => image.id)).toEqual(['first-image']);
    expect(result.data).toMatchObject({ message: 'HTTP 429', items: [item] });
    expect(mocks.generate).toHaveBeenCalledTimes(2);
  });
  it('does not fabricate an image when the first request fails', async () => {
    mocks.generate.mockResolvedValueOnce({ ok: false, message: 'HTTP 429', items: [] });
    expect(await run()).toMatchObject({ ok: false });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
  it('retains items returned together with a failure', async () => {
    mocks.generate.mockResolvedValueOnce({ ok: false, message: 'interrupted', items: [item] });
    const result = await run();
    expect(result.ok).toBe(false);
    expect(result.generatedImages?.map(image => image.id)).toEqual(['first-image']);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
  it('does not mark a batch complete when a later successful response is empty', async () => {
    mocks.generate.mockResolvedValueOnce({ ok: true, message: 'ok', items: [item] })
      .mockResolvedValueOnce({ ok: true, message: 'ok', items: [] });
    const result = await run();
    expect(result.ok).toBe(false);
    expect(result.generatedImages?.map(image => image.id)).toEqual(['first-image']);
    expect(mocks.generate).toHaveBeenCalledTimes(2);
  });
  it('returns all images only after every request succeeds', async () => {
    mocks.generate.mockResolvedValue({ ok: true, message: 'ok', items: [item] });
    const result = await run();
    expect(result.ok).toBe(true);
    expect(result.generatedImages).toHaveLength(3);
    expect(mocks.generate).toHaveBeenCalledTimes(3);
  });
});

it('the in-app Agent returns the active dictionary translations and never silently uses another source', async () => {
  const hit = {tag:'blue_eyes', description:'蓝眼', count:42, category:0, localizedDescription:true};
  const search = () => executeAgentTool({tool:'langbai_search_tags',args:{query:'蓝眼',limit:2}},()=>{});
  mocks.searchDictionary.mockReturnValueOnce([hit]).mockReturnValueOnce([]).mockReturnValueOnce(null);
  expect(await search()).toMatchObject({ok:true,data:[hit]});
  expect(await search()).toMatchObject({ok:true,data:[]});
  expect(await search()).toMatchObject({ok:false,title:expect.stringContaining('下载并启用')});
  expect(mocks.searchDictionary).toHaveBeenLastCalledWith('蓝眼',2);
});
