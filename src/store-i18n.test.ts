import {it,expect} from 'vitest';import {STORE_LOCALES,localizedStoreText} from './store-i18n';
it('has a single, complete Chinese status and toast catalog',()=>{
 expect(Object.keys(STORE_LOCALES)).toEqual(['zh-CN']);
 for(const [key,value] of Object.entries(STORE_LOCALES['zh-CN']))expect(value.trim(),key).not.toBe('');
});
it('renders Chinese whatever language an older version saved, and falls back to the key',()=>{
 for(const language of ['zh-CN','en-US','ja-JP',undefined])expect(localizedStoreText(language,'status.apiConfigured')).toBe('API 已配置');
 expect(localizedStoreText('zh-CN','status.notInCatalog')).toBe('status.notInCatalog');
});
