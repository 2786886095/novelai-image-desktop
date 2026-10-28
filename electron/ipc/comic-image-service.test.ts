import {it,expect,vi} from 'vitest';
import type {AppSettings} from '../../src/types';
vi.mock('./store',()=>({getSettings:()=>({}),getToken:()=>undefined}));
import {comicSourceBinding} from './comic-image-service';

it('credential/config binding changes with endpoint or key, and never enables a hidden provider fallback',()=>{const settings={imageProvider:'novelai',apiBaseUrl:'https://native.invalid',imageBaseUrl:'https://images.invalid'} as AppSettings;const a=comicSourceBinding(settings,'test-token');expect(a).not.toContain('test-token');expect(comicSourceBinding(settings,'changed')).not.toBe(a);expect(comicSourceBinding({...settings,imageBaseUrl:'https://changed.invalid'},'test-token')).not.toBe(a);expect(()=>comicSourceBinding({...settings,imageProvider:'openai-images'},'test-token')).toThrow('未自动切换');expect(()=>comicSourceBinding(settings,'')).toThrow('Token');});
