import {beforeEach,describe,expect,it,vi} from 'vitest';
const fakes=vi.hoisted(()=>({get:vi.fn(),proxy:vi.fn()}));
vi.mock('axios',()=>({default:{get:fakes.get}}));
vi.mock('./proxy',()=>({proxyConfigForUrl:fakes.proxy}));
vi.mock('./store',()=>({getSettings:()=>({proxyMode:'auto',proxyForAi:true})}));
import {parseStudioWebSearch,searchStudioWeb,studioPublicSourceUrl} from './agent-web-search';
const html='<table><a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.novelai.net%2Fimage%2F" class="result-link">NovelAI &amp; Images</a><td class="result-snippet">Image <b>documentation</b>.</td></table>';
beforeEach(()=>{vi.clearAllMocks();fakes.proxy.mockResolvedValue({proxy:false});fakes.get.mockResolvedValue({data:html});});
describe('public source-backed lookup',()=>{
 it('returns original source URLs, human readable snippets and timestamp',async()=>{
  const result=await searchStudioWeb({query:'NovelAI image documentation',limit:2});
  expect(result.sources).toEqual([{title:'NovelAI & Images',url:'https://docs.novelai.net/image/',snippet:'Image documentation.'}]);
  expect(result.sourceKind).toBe('public-search-snippets');expect(Date.parse(result.fetchedAt)).toBeGreaterThan(0);
  expect(fakes.proxy).toHaveBeenCalledWith('ai',expect.stringContaining('lite.duckduckgo.com'),expect.objectContaining({proxyForAi:true}));
  const config=fakes.get.mock.calls[0][1];expect(config.headers.Authorization).toBeUndefined();expect(config.maxRedirects).toBe(0);
 });
 it('never treats captcha, empty response or private/credential links as success',()=>{
  expect(()=>parseStudioWebSearch('<form class="challenge-form">captcha</form>')).toThrow('人工验证');
  expect(()=>parseStudioWebSearch('<html>no result</html>')).toThrow('没有取得');
  for(const url of ['http://localhost/','http://127.1/','http://10.0.0.1/','https://user:token@example.org/','file:///etc/passwd','javascript:alert(1)','http://[fd00::1]/'])expect(studioPublicSourceUrl(url)).toBeUndefined();
  expect(studioPublicSourceUrl('https://fdroid.org/')).toBe('https://fdroid.org/');
 });
 it('rejects malformed arguments before network and propagates stop',async()=>{
  await expect(searchStudioWeb({query:'x',limit:99})).rejects.toThrow('1–8');expect(fakes.get).not.toHaveBeenCalled();
  const stopped=new AbortController();stopped.abort();await expect(searchStudioWeb({query:'x'},stopped.signal)).rejects.toThrow();
  const controller=new AbortController();fakes.get.mockImplementation((_url,config)=>new Promise((_resolve,reject)=>config.signal.addEventListener('abort',()=>reject(new Error('aborted')))));
  const request=searchStudioWeb({query:'x'},controller.signal);await vi.waitFor(()=>expect(fakes.get).toHaveBeenCalled());controller.abort();await expect(request).rejects.toThrow('aborted');
 });
 it('limits duplicates, results and snippet bytes',()=>{
  const sources=parseStudioWebSearch(html+html,1);expect(sources).toHaveLength(1);expect(sources[0].snippet.length).toBeLessThanOrEqual(600);
 });
});
