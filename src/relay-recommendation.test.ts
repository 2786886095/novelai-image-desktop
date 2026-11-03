import {beforeEach,describe,it,expect,vi} from 'vitest';
import {createElement,type ReactElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import * as Accounts from './components/NaiAccountManager';
vi.mock('./store',()=>({useAppStore:(select:(s:unknown)=>unknown)=>select({settings:{language:'zh-CN'},isGenerating:false})}));
const api=Accounts as unknown as {NaiAccountManager:typeof Accounts.NaiAccountManager;NaiRelayRecommendation?:(props:{language?:'zh-CN';onError?:()=>void})=>ReactElement<{onClick:()=>Promise<void>}>};
describe('relay recommendation external-browser entry',()=>{
 beforeEach(()=>vi.stubGlobal('window',{naiAccounts:{},naiDesktop:{openExternal:vi.fn().mockResolvedValue(undefined)}}));
 it('places the named recommendation immediately after manage in the actual toolbar',()=>{
  const html=renderToStaticMarkup(createElement(api.NaiAccountManager));
  expect(html).toContain('NovelAI 中转站推荐');
  expect(html.indexOf('账户管理')).toBeLessThan(html.indexOf('NovelAI 中转站推荐'));
  expect(html).toContain('nai.langbai.cc');
  expect(html).toContain('relay-brand/brand-mark.svg');
  expect(html).toMatch(/<img[^>]+width="18"[^>]+height="18"/);
 });
 it('its actual handler opens only the fixed URL and never transfers credentials/config',async()=>{
  expect(typeof api.NaiRelayRecommendation).toBe('function');
  const element=api.NaiRelayRecommendation!({language:'zh-CN'});
  await element.props.onClick();
  expect(window.naiDesktop.openExternal).toHaveBeenCalledExactlyOnceWith('https://nai.langbai.cc');
  expect(new URL(vi.mocked(window.naiDesktop.openExternal).mock.calls[0][0]).search).toBe('');
 });
 it('reports rejected browser handoff without changing account state',async()=>{
  expect(typeof api.NaiRelayRecommendation).toBe('function');
  vi.mocked(window.naiDesktop.openExternal).mockRejectedValueOnce(new Error('synthetic unavailable'));
  const onError=vi.fn();await api.NaiRelayRecommendation!({language:'zh-CN',onError}).props.onClick();expect(onError).toHaveBeenCalledOnce();
 });
 it('retains the previous keyboard fix as a control',()=>{
  expect(readFileSync('mobile/lib/screens/generate_screen.dart','utf8')).toContain("androidPromptText(sheetContext.read<AppState>().settings.language, 'close')");
 });
});
