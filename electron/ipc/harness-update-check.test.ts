vi.mock('./download-request',()=>({updateFetch:(...args:any[])=>globalThis.fetch(args[0],args[1])}));
import {afterEach,it,expect,vi} from 'vitest';
import {chooseComponent,checkHarnessUpdates} from './harness-update-check';
import {isNewerBundle} from './harness-policy';
afterEach(()=>vi.unstubAllGlobals());
it('selects highest compatible component, not API date order or application releases',()=>{
 const release=(v:string,more={})=>({tag_name:v,draft:false,prerelease:false,assets:[{name:`tavern-agent-${process.platform}-${process.arch}-protocol1.zip`}],...more});
 expect(chooseComponent([release('v2.3.6'),release('agent-v0.1.2'),release('agent-v0.1.10'),release('agent-v9.0.0',{prerelease:true}),release('agent-v10.0.0',{assets:[]})])).toBe('0.1.10');
 expect(chooseComponent([])).toBeNull();
});
it('compares prereleases numerically and never downgrades stable to rc',()=>{
 expect(isNewerBundle('0.1.7-rc.10','0.1.7-rc.2')).toBe(true);
 expect(isNewerBundle('0.1.7-rc.2','0.1.7')).toBe(false);
 expect(isNewerBundle('0.1.7','0.1.7-rc.2')).toBe(true);
});
it('checks metadata only and isolates failed sources',async()=>{
 const fetcher=vi.fn(async(input:string)=>({ok:!input.includes('dshmarket'),status:503,json:async()=>input.includes('api.github.com')?[]:input.includes('raw.githubusercontent')?{version:'0.7.0'}:{'dist-tags':{latest:'0.1.5-rc.3',next:'0.1.7-rc.2'}}}));
 vi.stubGlobal('fetch',fetcher);
 const result=await checkHarnessUpdates();
 expect(result.official).toBe('0.1.7-rc.2');expect(result.errors).toHaveLength(1);expect(result.component).toBeNull();
 expect(fetcher).toHaveBeenCalledTimes(6);expect(fetcher.mock.calls.every(([url])=>!url.includes('.tgz'))).toBe(true);
});
