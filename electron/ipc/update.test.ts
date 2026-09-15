import {beforeEach,expect,it,vi} from 'vitest';
const {get}=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('electron',()=>({app:{getVersion:()=> '2.3.0'}}));
vi.mock('axios',()=>({default:{get}}));vi.mock('./proxy',()=>({proxyConfig:()=>({})}));
import {checkUpdate,compareVersions,parseLatestYamlVersion,updateSourceOrder,latestGithubRelease} from './update';
beforeEach(()=>{get.mockReset();});
it('parses version fields and compares versions numerically',()=>{
 expect(parseLatestYamlVersion(Buffer.from("version: 'v2.3.1'"))).toBe('2.3.1');
 expect(parseLatestYamlVersion('path: file.exe')).toBe('');expect(compareVersions('2.10.0','2.9.0')).toBe(1);
});
it('migrates a legacy Gitee preference to a single GitHub source',()=>{
 expect(updateSourceOrder('gitee')).toEqual(['github']);expect(updateSourceOrder()).toEqual(['github']);
});
it.each(['github','gitee'])('checks only GitHub with saved preference %s',async source=>{
 get.mockResolvedValueOnce({data:'version: 2.3.1'});expect(await checkUpdate(source)).toMatchObject({hasUpdate:true,latestVersion:'2.3.1',releaseUrl:expect.stringContaining('github.com')});
 expect(get).toHaveBeenCalledTimes(1);expect(get.mock.calls[0][0]).toContain('github.com');
});
it('uses the GitHub API when its manifest fails',async()=>{
 get.mockRejectedValueOnce(Error('blocked')).mockResolvedValueOnce({data:{tag_name:'v2.3.1',html_url:'https://github.com/example/release'}});
 expect(await checkUpdate()).toMatchObject({hasUpdate:true,latestVersion:'2.3.1'});expect(get.mock.calls[1][0]).toContain('api.github.com');
});
it('reports failed checks without calling another mirror',async()=>{
 get.mockRejectedValue(Error('offline'));expect(await checkUpdate('gitee')).toMatchObject({hasUpdate:false,error:expect.stringContaining('offline')});expect(get).toHaveBeenCalledTimes(2);
 expect(get.mock.calls.every(([url])=>!url.includes('gitee'))).toBe(true);
});
it('keeps an up-to-date response without unnecessary requests',async()=>{
 get.mockResolvedValueOnce({data:'version: 2.3.0'});expect((await checkUpdate()).hasUpdate).toBe(false);expect(get).toHaveBeenCalledTimes(1);
});
it('retains download metadata for installer verification',async()=>{
 get.mockResolvedValueOnce({data:{tag_name:'v2.3.1',assets:[{name:'setup.exe',browser_download_url:'https://github.com/example/setup.exe',size:123}]}});
 expect((await latestGithubRelease()).assets).toEqual([{name:'setup.exe',url:'https://github.com/example/setup.exe',size:123}]);
});
