import {describe,it,expect} from 'vitest';
import {NAI_ACCOUNT_TEXT,naiAccountText} from './nai-accounts-locales';
describe('account UI text',()=>{
 for(const [key,text] of Object.entries(NAI_ACCOUNT_TEXT))it(key,()=>{expect(text.trim()).not.toBe('');});
 it('renders the Chinese text whatever language is passed',()=>{expect(naiAccountText('zh-CN','manage')).toBe('账户管理');expect(naiAccountText(undefined,'remove')).toBe('删除');});
});
