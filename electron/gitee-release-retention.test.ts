import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect,it,vi} from 'vitest';

async function run(pruneOld = false) {
  const removed: string[] = [];
  const fetch = vi.fn(async (url: string, options: {method?: string} = {}) => {
    let data: unknown;
    if (options.method === 'DELETE') { removed.push(url); data = {}; }
    else if (url.includes('/releases/1/attach_files')) data = [{id:11,name:'old.exe',size:100}];
    else if (url.includes('/releases/2/attach_files')) data = [{id:21,name:'new.exe',size:100},{id:22,name:'new.exe',size:100}];
    else data = [{id:1,tag_name:'v2.2.4'},{id:2,tag_name:'v2.2.5'}];
    return {ok:true,status:200,json:async()=>data};
  });
  const code = readFileSync(resolve('scripts/prune-gitee-release-assets.mjs'),'utf8');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('process','fetch','console',code)({
    env: {GITEE_TOKEN:'fixture-token',GITEE_PRUNE_OLD_RELEASES:pruneOld?'1':'0'},
    argv:['node','script','v2.2.5']
  },fetch,{log:vi.fn()});
  return removed;
}
it('normal release retains previous downloads and only deduplicates its own assets', async()=>{
  const removed=await run();
  expect(removed).toEqual(['https://gitee.com/api/v5/repos/langbai666/novelai-image-desktop/releases/2/attach_files/22']);
});
it('requires an explicit maintenance opt-in before removing old release downloads', async()=>{
  const removed=await run(true);
  expect(removed).toHaveLength(2);
  expect(removed[0]).toContain('/releases/1/attach_files/11');
});
