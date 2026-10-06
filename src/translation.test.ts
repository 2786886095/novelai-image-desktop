import {describe,it,expect} from 'vitest';
import {TRANSLATION_LANGUAGES,normalizeTranslationPreference,resolveTranslationTarget,baiduTranslationTarget,translationLanguageName,translationText} from './translation';
describe('translation target contract',()=>{
 for(const [app,target] of [['zh-CN','zh-CN'],['zh-TW','zh-TW'],['en-US','en'],['ja-JP','ja'],['ko-KR','ko']])it(`system follows ${app}`,()=>{expect(resolveTranslationTarget(undefined,app)).toBe(target);expect(resolveTranslationTarget('system',app)).toBe(target);});
 it('explicit target is independent of later app-language changes; resetting follows again',()=>{expect(resolveTranslationTarget('ja','zh-CN')).toBe('ja');expect(resolveTranslationTarget('ja','en-US')).toBe('ja');expect(resolveTranslationTarget('system','en-US')).toBe('en');expect(normalizeTranslationPreference('unsupported')).toBe('system');});
 for(const language of TRANSLATION_LANGUAGES)it(`maps ${language.value} for providers without English fallback`,()=>{expect(resolveTranslationTarget(language.value,'en-US')).toBe(language.value);expect(baiduTranslationTarget(language.value)).toBe(language.baidu);expect(translationLanguageName(language.value)).toBe(language.name);});
 it('every supported UI language has complete preview and action labels',()=>{for(const app of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']){const text=translationText(app);expect(Object.values(text)).toHaveLength(16);expect(Object.values(text).every(Boolean)).toBe(true);}});
});
