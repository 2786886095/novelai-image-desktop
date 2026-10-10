vi.mock('./download-request',()=>({updateFetch:vi.fn()}));
import {expect,it,vi} from 'vitest';
import {componentAssetDownloadUrl,type HarnessDownload} from './harness-update';
const name='tavern-agent-win32-x64-protocol1.zip',tag='agent-v0.1.7';
const canonical=`https://github.com/2786886095/novelai-image-desktop/releases/download/${tag}/${name}`;
const fixture=():HarnessDownload=>({version:'0.1.7',tag,bytes:10,asset:{name,size:10,digest:'sha256:'+'a'.repeat(64),url:'https://api.github.com/repos/2786886095/novelai-image-desktop/releases/assets/123',browser_download_url:canonical}});
it('uses the exact approved public asset with a fresh non-credential cache key',()=>{
 const selected=fixture(),first=new URL(componentAssetDownloadUrl(selected,'first')),next=new URL(componentAssetDownloadUrl(selected,'next'));
 expect(first.origin+first.pathname).toBe(canonical);expect(first.searchParams.get('cacheBust')).toBe('first');expect(first.href).not.toBe(next.href);expect(first.username).toBe('');expect(first.password).toBe('');expect(selected.asset.digest).toBe('sha256:'+'a'.repeat(64));
});
it('retains approved legacy asset API metadata without adding credentials',()=>{
 const selected=fixture();delete selected.asset.browser_download_url;
 const result=new URL(componentAssetDownloadUrl(selected,'legacy'));expect(result.origin+result.pathname).toBe(selected.asset.url);expect([...result.searchParams.keys()]).toEqual(['cacheBust']);
});
for(const url of ['https://evil.test/file.zip','http://github.com/2786886095/novelai-image-desktop/releases/download/agent-v0.1.7/'+name,canonical+'?token=secret',canonical.replace('agent-v0.1.7','agent-v0.1.6')])it('rejects a replaced public source '+new URL(url).origin,()=>{
 const selected=fixture();selected.asset.browser_download_url=url;expect(()=>componentAssetDownloadUrl(selected)).toThrow('Unexpected public');
});
it('rejects unapproved API origin and unsafe component identity',()=>{
 const selected=fixture();selected.asset.url='https://evil.test/file.zip';expect(()=>componentAssetDownloadUrl(selected)).toThrow('Unexpected update');
 const unsafe=fixture();unsafe.asset.name='../file.zip';expect(()=>componentAssetDownloadUrl(unsafe)).toThrow('identity');
 const tagInvalid=fixture();tagInvalid.tag='agent-v0.1.7/../bad';expect(()=>componentAssetDownloadUrl(tagInvalid)).toThrow('identity');
});
