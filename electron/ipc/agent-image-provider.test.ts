import { expect, it } from 'vitest';
import type { AppSettings } from '../../src/types';
import { agentImageProviderState, assertAgentImageProvider, assertAgentImageTool, bindAgentImageProvider, compatibleAgentInput } from './agent-image-provider';
const config = () => ({ imageProvider: 'openai-images', imageApiKey: 'fixture-private-key', compatibleImage: { baseUrl: 'https://gateway.invalid/v1', model: 'free-model-id', size: '1024x1024', responseFormat: 'auto', extensions: { seed: 42 } }, outputDir: 'fixture-output', generationGroupId: 'group', proxyMode: 'direct', proxyForAi: true } as AppSettings);
it.each(['imageProvider', 'imageApiKey', 'compatibleImage', 'outputDir', 'generationGroupId', 'proxyMode', 'proxyUrl', 'proxyForAi'])('rejects host binding after %s changes', field => {
  const s = config(), binding = bindAgentImageProvider(s);
  const next = { ...s, [field]: field === 'imageProvider' ? 'novelai' : 'changed' } as AppSettings;
  expect(() => assertAgentImageProvider(next, binding)).toThrow('配置已变化');
});
it('ignores unrelated theme changes and keeps the binding out of public state', () => {
  const s = config(), binding = bindAgentImageProvider(s);
  expect(() => assertAgentImageProvider({ ...s, theme: 'dark' }, binding)).not.toThrow();
  const publicState = JSON.stringify(agentImageProviderState(s));
  expect(publicState).not.toContain(s.imageApiKey); expect(publicState).not.toContain(binding.revision);
  expect(agentImageProviderState({ ...s, imageProvider: 'novelai' })).toEqual({ imageProvider: 'novelai' });
});
it('preserves the final template prompt and count without native model normalization or style injection', () => {
  const prompt = 'forest, mist, A path winds between the trees.';
  expect(compatibleAgentInput({ positivePrompt: prompt, count: 2, model: 'free-model-id' }, config())).toEqual({ prompt, n: 2 });
  expect(compatibleAgentInput({ count: 1 }, config(), false)).toEqual({ prompt: '', n: 1 });
});
it.each([{ width: 1024 }, { stylePrompt: 'locked-style' }, { model: 'nai-diffusion-5-full' }, { count: '2' }, { count: 1.5 }, { count: 9 }, { count: 0 }, { imageProviderBinding: {} }, { apiKey: 'from-model' }])('rejects unsupported or forged arguments %j before any call', extra => {
  expect(() => compatibleAgentInput({ positivePrompt: 'forest', ...extra }, config())).toThrow();
});
it('requires a separate key and a valid config even during template preflight', () => {
  expect(() => compatibleAgentInput({}, { ...config(), imageApiKey: '' }, false)).toThrow('API Key');
  expect(() => compatibleAgentInput({}, config())).toThrow('不能为空');
});
it.each(['langbai_redraw_image', 'langbai_inpaint_image', 'langbai_upscale_image', 'langbai_director'])('prevents implicit native fallback for %s', tool => {
  expect(() => assertAgentImageTool(tool, config())).toThrow('没有切换到 NovelAI');
  expect(() => assertAgentImageTool(tool, { ...config(), imageProvider: 'novelai' })).not.toThrow();
});
