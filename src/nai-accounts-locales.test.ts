import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {NAI_ACCOUNT_TEXT,naiAccountText} from './nai-accounts-locales';
describe('account UI text',()=>{
 for(const [key,text] of Object.entries(NAI_ACCOUNT_TEXT))it(key,()=>{expect(text.trim()).not.toBe('');});
 it('renders the Chinese text whatever language is passed',()=>{expect(naiAccountText('zh-CN','manage')).toBe('账户管理');expect(naiAccountText(undefined,'remove')).toBe('删除');});
 it('tells the account manager when the last selected account could not be read on this machine',()=>{
  expect(NAI_ACCOUNT_TEXT.selectionUnreadable).toContain('删除该账户后重新添加');
  const manager=fs.readFileSync('src/components/NaiAccountManager.tsx','utf8');
  expect(manager).toContain("else if(state.selectionUnreadable)setMessage(current=>current||'selectionUnreadable');");
 });
});
