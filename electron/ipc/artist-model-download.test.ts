import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Readable} from 'node:stream';
vi.mock('./proxy',()=>({proxyConfig:()=>({proxy:false,httpsAgent:'configured-agent'})}));
vi.mock('axios',()=>({default:{get:vi.fn(),isAxiosError:()=>false}}));
import axios from 'axios';import {prepareArtistModel} from './artist-model-download';
let root:string;
beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'artist-model-test-'));vi.clearAllMocks();vi.mocked(axios.get).mockImplementation(async(url:any)=>{const body=String(url).endsWith('.json')?Buffer.from('{"valid":true}'):Buffer.alloc(1024*1024+1,1);return {data:Readable.from([body]),headers:{'content-length':String(body.length)}};});});
afterEach(()=>fs.rmSync(root,{recursive:true,force:true}));
describe('artist scorer downloads (#14)',()=>{
 it('uses configured proxy and local cache; concurrent preparation downloads each file only once',async()=>{
  await Promise.all([prepareArtistModel(root,'onnx-community/dinov2-small',true),prepareArtistModel(root,'onnx-community/dinov2-small',true)]);
  expect(axios.get).toHaveBeenCalledTimes(3);
  expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('model_quantized.onnx'),expect.objectContaining({httpsAgent:'configured-agent',proxy:false,timeout:60000}));
  await prepareArtistModel(root,'onnx-community/dinov2-small',true);expect(axios.get).toHaveBeenCalledTimes(3);
 });
 it('rejects unknown repositories without making a request',async()=>{await expect(prepareArtistModel(root,'../other',false)).rejects.toThrow('Unknown');expect(axios.get).not.toHaveBeenCalled();});
 it('does not publish an incomplete model as a usable cache file',async()=>{
  vi.mocked(axios.get).mockImplementation(async()=>({data:Readable.from([Buffer.from('{}')]),headers:{'content-length':'99'}}));
  await expect(prepareArtistModel(root,'onnx-community/dinov2-small',true)).rejects.toThrow('download failed');
  expect(fs.existsSync(path.join(root,'onnx-community/dinov2-small/onnx/model_quantized.onnx'))).toBe(false);
 });
});
