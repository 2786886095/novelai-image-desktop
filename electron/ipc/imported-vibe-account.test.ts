import {it,expect,vi,beforeEach} from 'vitest';
import sharp from 'sharp';
const q=vi.hoisted(()=>({selected:{imageBaseUrl:'https://fixture-relay.invalid',apiBaseUrl:'https://fixture-relay.invalid'},settings:{imageBaseUrl:'https://fixture-relay.invalid',apiBaseUrl:'https://fixture-relay.invalid'},post:vi.fn(),token:vi.fn(()=> 'fixture-only-token')}));
vi.mock('electron',()=>({app:{getPath:()=>''},nativeImage:{},dialog:{}}));
vi.mock('./store',()=>({getToken:q.token,getSettings:()=>q.settings}));
vi.mock('./nai-accounts-runtime',()=>({currentNaiAccount:()=>q.selected}));
vi.mock('./proxy',()=>({proxyConfig:()=>({proxy:false})}));
vi.mock('axios',()=>({default:{post:q.post,isCancel:()=>false}}));
import {prepareExtras,buildPayload} from './nai';
import {DEFAULT_PARAMS} from '../../src/types';
const model='nai-diffusion-4-5-full',encoding='Zml4dHVyZQ==';
const imported={base64:'',infoExtracted:.7,strength:.31,encodings:[{model,infoExtracted:.7,encoding}]};
beforeEach(()=>{q.post.mockReset().mockResolvedValue({data:Buffer.from('encoded-fixture')});q.token.mockClear();q.selected.imageBaseUrl=q.settings.imageBaseUrl='https://fixture-relay.invalid';});
it.each(['https://image.novelai.net','https://fixture-relay.invalid'])('matching Vibe bypasses encoding host/token lookup for bound %s',async(host)=>{
 q.selected.imageBaseUrl=host; // Deliberately stale settings cannot block zero-network reuse.
 const result=await prepareExtras({...DEFAULT_PARAMS,model},{vibeImages:[imported],charCaptions:[],preciseReferences:[]});
 expect(buildPayload({...DEFAULT_PARAMS,model},123,result).parameters.reference_image_multiple).toEqual([encoding]);expect(q.token).not.toHaveBeenCalled();expect(q.post).not.toHaveBeenCalled();
});
it('mixed raw/imported references encode only the raw image at the selected host without host fallback',async()=>{
 const raw=(await sharp({create:{width:9,height:7,channels:3,background:'#abc'}}).png().toBuffer()).toString('base64');
 const result=await prepareExtras({...DEFAULT_PARAMS,model},{vibeImages:[imported,{base64:raw,infoExtracted:1,strength:.5}],charCaptions:[],preciseReferences:[]});
 expect(q.post).toHaveBeenCalledOnce();expect(q.post.mock.calls[0][0]).toBe('https://fixture-relay.invalid/ai/encode-vibe');expect(q.post.mock.calls[0][2].maxRedirects).toBe(0);expect(result.vibeImages?.[0].base64).toBe(encoding);
});
it('raw encoding still rejects a mismatched account-bound host before POST',async()=>{
 q.settings.imageBaseUrl='https://wrong-host.invalid';const raw=(await sharp({create:{width:11,height:7,channels:3,background:'#abe'}}).png().toBuffer()).toString('base64');
 await expect(prepareExtras({...DEFAULT_PARAMS,model},{vibeImages:[{base64:raw,infoExtracted:1,strength:1}],charCaptions:[],preciseReferences:[]})).rejects.toThrow('账户绑定接口不匹配');expect(q.post).not.toHaveBeenCalled();
});
it.each(['nai-diffusion-4-full','nai-diffusion-5-full'])('incompatible encoded-only Vibe remains rejected for %s without POST',async(model)=>{
 await expect(prepareExtras({...DEFAULT_PARAMS,model},{vibeImages:[imported],charCaptions:[],preciseReferences:[]})).rejects.toThrow();expect(q.post).not.toHaveBeenCalled();expect(q.token).not.toHaveBeenCalled();
});
