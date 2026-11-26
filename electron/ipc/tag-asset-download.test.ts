import { Readable } from "node:stream";
import { beforeEach, expect, it, vi } from "vitest";
import axios from "axios";
import { openTagAsset } from "./tag-asset-download";

vi.mock("axios", () => ({default: {get:vi.fn(), isAxiosError:()=>false}}));
vi.mock("./proxy", () => ({proxyConfigForUrl:async()=>({proxy:false})}));
vi.mock("./store", () => ({getSettings:()=>({})}));
const get = vi.mocked(axios.get);
const url = "https://github.com/Aaalice233/Aaalice_NAI_Launcher/releases/download/tag/tag_catalog.db";
const path = "/github-production-release-asset/fixture/data?sig=fixture";
const reply = (status:number, headers:Record<string,string>={}) => ({status,headers,data:Readable.from(["fixture"])});
beforeEach(()=>get.mockReset());

it("keeps Range and the signed object path when the release CDN fails", async () => {
  get.mockResolvedValueOnce(reply(302,{location:"https://release-assets.githubusercontent.com"+path}))
    .mockRejectedValueOnce(new Error("TLS connection failed"))
    .mockResolvedValueOnce(reply(206,{"content-range":"bytes 2-9/10"}));
  expect((await openTagAsset(url,10,undefined,2)).status).toBe(206);
  expect(get.mock.calls[2][0]).toBe("https://releaseassetproduction.blob.core.windows.net"+path);
  for (const [,options] of get.mock.calls) expect(options?.headers?.Range).toBe("bytes=2-");
});
it("tries the immutable public asset API when the release page cannot be reached", async () => {
  get.mockRejectedValueOnce(new Error("connection reset")).mockResolvedValueOnce(reply(200));
  await openTagAsset(url,10);
  expect(get.mock.calls[1][0]).toContain("/releases/assets/533720512?");
});
it("rejects unrelated redirects before connecting", async () => {
  get.mockResolvedValueOnce(reply(302,{location:"https://example.invalid/file"}));
  await expect(openTagAsset(url,10)).rejects.toThrow(/host/);
  expect(get).toHaveBeenCalledTimes(1);
});

it('bad Content-Range falls back without losing resume offset',async()=>{

 for(const r of ['bytes 0-9/10','bytes 4-9/10']) get.mockResolvedValueOnce({status:206,headers:{'content-range':r},data:Readable.from(['fixture'])});
 const r=await openTagAsset('https://github.com/example/test/releases/download/tag/tag_catalog.db',10,undefined,4);
 console.log('RANGE',r.headers['content-range'],'requests',get.mock.calls.length);expect(r.headers['content-range']).toBe('bytes 4-9/10');
 expect(get.mock.calls.map(c=>c[1]?.headers?.Range)).toEqual(['bytes=4-','bytes=4-']);
});
