import {it,expect} from 'vitest';import {normalizeNovelAiEndpoint} from './nai-endpoint';
it('accepts operation URL from issue #6 without duplicating the generation route',()=>expect(normalizeNovelAiEndpoint('https://image.novelai.net/ai/generate-image/','https://image.novelai.net')).toBe('https://image.novelai.net'));
it('keeps intermediary prefixes and default base URLs',()=>{
 expect(normalizeNovelAiEndpoint('https://proxy.example/nai/ai/generate-image','')).toBe('https://proxy.example/nai');
 expect(normalizeNovelAiEndpoint('','https://api.novelai.net')).toBe('https://api.novelai.net');
 expect(normalizeNovelAiEndpoint('https://proxy.example/v1','')).toBe('https://proxy.example/v1');
});
