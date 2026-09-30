import {afterEach,it,expect,vi} from 'vitest';
import {Readable} from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const mocks=vi.hoisted(()=>({route:vi.fn(async()=>({proxy:false})),get:vi.fn()}));
vi.mock('./store',()=>({getSettings:()=>({proxyMode:'auto',proxyForUpdate:true,proxyForAi:true})}));
vi.mock('./proxy',()=>({proxyConfig:()=>({}),proxyConfigForUrl:mocks.route}));
vi.mock('axios',()=>({default:{get:mocks.get,isAxiosError:()=>false}}));
import {queryCompatibleHarness} from './harness-update';
import {prepareArtistModel} from './artist-model-download';
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('Agent metadata resolves the update proxy for its actual URL',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('[]')));
 mocks.get.mockResolvedValue({status:200,headers:{},data:Readable.from([Buffer.from('[]')])});
 expect(await queryCompatibleHarness(new AbortController().signal)).toBeNull();
 expect(mocks.route).toHaveBeenCalledWith('update',expect.stringContaining('api.github.com'),expect.objectContaining({proxyMode:'auto'}));
});
it('scoring models resolve AI proxy for HuggingFace rather than an API host cache',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'routing-repair-'));
 mocks.get.mockImplementation(async(url:string)=>({status:200,headers:{},data:Readable.from([url.endsWith('.json')?'{}':Buffer.alloc(1048577)])}));
 try{await prepareArtistModel(root,'onnx-community/dinov2-small',true);
 expect(mocks.route).toHaveBeenCalledTimes(3);
 expect(mocks.route).toHaveBeenCalledWith('ai',expect.stringContaining('https://huggingface.co/'),expect.anything());
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
