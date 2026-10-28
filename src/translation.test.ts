import {describe,it,expect} from 'vitest';
import {TRANSLATION_LANGUAGES,normalizeTranslationPreference,resolveTranslationTarget,baiduTranslationTarget,translationLanguageName,translationText} from './translation';
describe('translation target contract',()=>{
 it('"system" and an unset target follow the software language, which is Simplified Chinese',()=>{expect(resolveTranslationTarget(undefined)).toBe('zh-CN');expect(resolveTranslationTarget('system')).toBe('zh-CN');expect(normalizeTranslationPreference('unsupported')).toBe('system');});
 it('an explicit target is kept, including stored legacy aliases',()=>{expect(resolveTranslationTarget('ja')).toBe('ja');expect(resolveTranslationTarget('en-US')).toBe('en');expect(resolveTranslationTarget('zh-tw')).toBe('zh-TW');});
 for(const language of TRANSLATION_LANGUAGES)it(`maps ${language.value} for providers without English fallback`,()=>{expect(resolveTranslationTarget(language.value)).toBe(language.value);expect(baiduTranslationTarget(language.value)).toBe(language.baidu);expect(translationLanguageName(language.value)).toBe(language.name);});
 it('has complete Chinese preview and action labels',()=>{const text=translationText('zh-CN');expect(Object.values(text)).toHaveLength(16);expect(Object.values(text).every(Boolean)).toBe(true);expect(text.system).toBe('跟随软件语言');});
});
