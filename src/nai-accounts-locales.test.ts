import {describe,it,expect} from 'vitest';
import {NAI_ACCOUNT_LOCALES,naiAccountText} from './nai-accounts-locales';
describe('account UI five-language text',()=>{
 for(const [key,row] of Object.entries(NAI_ACCOUNT_LOCALES))it(key,()=>{expect(row).toHaveLength(5);for(const text of row)expect(text.trim()).not.toBe('');expect(row[2]).not.toMatch(/[\u3400-\u9fff]/);});
 it('selects all supported languages',()=>{expect(naiAccountText('en-US','manage')).toBe('Manage accounts');expect(naiAccountText('zh-TW','remove')).toBe('刪除');expect(naiAccountText('ja-JP','remove')).toBe('削除');expect(naiAccountText('ko-KR','remove')).toBe('삭제');});
});
