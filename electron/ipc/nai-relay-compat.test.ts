import {describe,it,expect,vi} from 'vitest';
import sharp from 'sharp';
const state=vi.hoisted(()=>({url:'https://relay.invalid/prefix/ai/generate-image'}));
vi.mock('./store',()=>({getToken:()=>"fixture",getSettings:()=>({imageBaseUrl:state.url,streamPreviewEnabled:true})}));
vi.mock('./nai-accounts-runtime',()=>({currentNaiAccount:()=>({method:'relay',imageBaseUrl:state.url})}));
import {consumeGenerateImageStream,resolveNovelAiGenerationBaseUrl} from './nai';

describe('native relay compatibility',()=>{
  it('keeps the bound prefix without duplicating a copied operation path',()=>{
    expect(resolveNovelAiGenerationBaseUrl()).toBe('https://relay.invalid/prefix');
  });
  for(const format of ['png','jpeg','webp'] as const) it('accepts a single fragmented '+format+' response without another POST',async()=>{
    const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#abc'}}).toFormat(format).toBuffer();
    async function* chunks(){yield bytes.subarray(0,4);yield bytes.subarray(4,8);yield bytes.subarray(8);}
    expect(await consumeGenerateImageStream(chunks(),28,()=>{},'application/octet-stream')).toEqual([bytes]);
  });
  it('rejects a truncated PNG and never promotes it to a final preview',async()=>{
    const preview=vi.fn();
    async function* chunks(){yield Buffer.from([137,80,78,71,13,10,26,10]);}
    await expect(consumeGenerateImageStream(chunks(),28,preview,'image/png')).rejects.toThrow();
    expect(preview).not.toHaveBeenCalled();
  });
});
import {encode} from '@msgpack/msgpack';
import {frameNaiStreamMessage} from './nai-stream';
import {DEFAULT_PARAMS} from '../../src/types';
import {generateImage} from './nai';
import {validateNaiAccountReadOnly} from './nai-accounts-validation';
import axios from 'axios';
import {afterEach} from 'vitest';
vi.mock('axios',()=>({default:{get:vi.fn(),post:vi.fn(),isCancel:()=>false}}));
vi.mock('./proxy',()=>({proxyConfigForUrl:async()=>({proxy:false})}));
afterEach(()=>vi.resetAllMocks());

describe('relay request boundaries',()=>{
  it('probes the same native prefix used for generation without a POST',async()=>{
    const get=vi.mocked(axios.get).mockImplementation(async url=>url==='https://relay.invalid/prefix/user/data'
      ? {status:200,data:{subscription:{active:true,tier:1}}}:{status:404,data:''});
    const result=await validateNaiAccountReadOnly({label:'Fixture',method:'relay',relayProtocol:'native',token:'fixture',apiBaseUrl:state.url,imageBaseUrl:state.url});
    expect(result.ok).toBe(true);
    expect(get.mock.calls.map(([url])=>url)).toEqual(['https://relay.invalid/prefix/user/data']);
    expect(axios.post).not.toHaveBeenCalled();
  });
  it('decodes framed MessagePack even when a relay labels it SSE',async()=>{
    const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#abc'}}).png().toBuffer();
    const body=frameNaiStreamMessage(encode({event_type:'final',image:bytes,samp_ix:0}));
    async function* chunks(){for(let i=0;i<body.length;i+=3)yield body.subarray(i,i+3);}
    expect(await consumeGenerateImageStream(chunks(),28,()=>{},'text/event-stream')).toEqual([bytes]);
  });
  it.each([502,504])('does not resubmit on ambiguous HTTP %s mentioning streaming',async status=>{
    const post=vi.mocked(axios.post).mockRejectedValue({response:{status,data:'streaming is not allowed'},config:{url:'https://relay.invalid/prefix/ai/generate-image-stream'}});
    const r=await generateImage({...DEFAULT_PARAMS,positivePrompt:'fixture'},undefined,{onPreview:()=>{}});
    expect(r.ok).toBe(false);expect(post.mock.calls.map(([u])=>u)).toEqual(['https://relay.invalid/prefix/ai/generate-image-stream']);
  });
  it('a missing stream route falls back once; a second 404 explains which setting to check',async()=>{
    const post=vi.mocked(axios.post).mockImplementation(async url=>{throw {response:{status:404,data:'private upstream message'},config:{url}};});
    const r=await generateImage({...DEFAULT_PARAMS,positivePrompt:'fixture'},undefined,{onPreview:()=>{}});
    expect(post.mock.calls.map(([u])=>u)).toEqual(['https://relay.invalid/prefix/ai/generate-image-stream','https://relay.invalid/prefix/ai/generate-image']);
    expect(r.message).toContain('接口类型');expect(r.message).not.toMatch(/relay\.invalid|private upstream/);
  });
});
