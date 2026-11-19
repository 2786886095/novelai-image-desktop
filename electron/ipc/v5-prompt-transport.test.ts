import {describe,it,expect,vi} from 'vitest';
import {requestV5Prompt} from './v5-prompt-transport';
const o={model:'local-model',messages:[{role:'user',content:'fixture'}],budget:1000};
const reply=(content:string,finish_reason='stop')=>({data:{choices:[{finish_reason,message:{content}}]}});
describe('bounded V5 transport',()=>{
 it('continues an open envelope after stop; finishes with closed pages even if notes cut off',async()=>{const send=vi.fn().mockResolvedValueOnce(reply('<<<PAGES\n1girl, ')).mockResolvedValueOnce(reply('long hair\nPAGES>>>\n<<<NOTES\npartial','length'));const r=await requestV5Prompt({...o,pages:1},send);expect(send).toHaveBeenCalledTimes(2);expect(send.mock.calls[1][0][1]).toMatchObject({role:'assistant',content:'<<<PAGES\n1girl, '});expect(r.data.choices[0].message.content).toContain('1girl, long hair');expect(r.data.choices[0].finish_reason).toBe('stop')});
 it('keeps provider length after two exhausted continuations',async()=>{const send=vi.fn().mockResolvedValue(reply('partial','length'));expect((await requestV5Prompt(o,send)).data.choices[0].finish_reason).toBe('length');expect(send).toHaveBeenCalledTimes(3)});
 it('retries only explicit token ceiling for a reasoning API',async()=>{const err={response:{status:400,data:{error:{message:'max_completion_tokens exceeds maximum'}}}};const send=vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce(reply('ok'));await requestV5Prompt({...o,model:'o3'},send);expect(send.mock.calls.map(x=>x.slice(1))).toEqual([[12000,'max_completion_tokens'],[8192,'max_completion_tokens']]);const no=vi.fn().mockRejectedValue({response:{status:401}});await expect(requestV5Prompt({...o,model:'o3'},no)).rejects.toBeTruthy();expect(no).toHaveBeenCalledOnce()});
 it('does not turn filtered output into a successful continuation',async()=>{const send=vi.fn().mockResolvedValue(reply('no','content_filter'));await expect(requestV5Prompt(o,send)).rejects.toThrow();expect(send).toHaveBeenCalledOnce()});
});
