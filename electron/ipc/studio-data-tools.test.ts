import {it,expect,vi,beforeEach} from 'vitest';
const mock=vi.hoisted(()=>({handlers:new Map<string,Function>(),show:vi.fn(),settings:{theme:'system'} as Record<string,unknown>,set:vi.fn()}));
vi.mock('electron',()=>({dialog:{showMessageBox:mock.show},ipcMain:{handle:(name:string,fn:Function)=>mock.handlers.set(name,fn)}}));
vi.mock('./store',()=>({getSettings:()=>mock.settings,setSetting:(key:string,value:unknown)=>{mock.set(key,value);mock.settings[key]=value;}}));
import {createStudioDataTools} from './studio-data-tools';
import type {AgentToolBridgeRequest} from '../../src/agent/types';
beforeEach(()=>{mock.handlers.clear();mock.show.mockReset();mock.show.mockResolvedValue({response:1});mock.set.mockClear();mock.settings={theme:'system'};});
function fixture(respond=true,timeout=1000,approve=vi.fn(async()=>true)) {
  const sent:any[]=[];
  const contents={isDestroyed:()=>false,send:(_channel:string,request:any)=>{
    sent.push(request);
    if(respond)queueMicrotask(()=>mock.handlers.get('studio-agent:reply')!({sender:contents},request.id,{ok:true,data:{revision:'v1',change:{after:'dark'}}}));
  }};
  const owner={isDestroyed:()=>false,webContents:contents};
  const tools=createStudioDataTools(()=>owner as any,timeout,approve);
  const request={tool:'langbai_update_studio_config',args:{expectedRevision:'v1',target:'settings',patch:{theme:'dark'}},callId:'a',sessionId:'b'} as AgentToolBridgeRequest;
  return {tools,request,sent,contents,approve};
}
it('reads live data without a confirmation',async()=>{const f=fixture();expect((await f.tools.execute({...f.request,tool:'langbai_read_studio_state'})).ok).toBe(true);expect(mock.show).not.toHaveBeenCalled();expect(f.sent[0].action).toBe('read');});
it('ordinary settings prepare/apply directly without either confirmation',async()=>{const f=fixture();expect((await f.tools.execute(f.request)).ok).toBe(true);expect(mock.show).not.toHaveBeenCalled();expect(f.approve).not.toHaveBeenCalled();expect(f.sent.map(x=>x.action)).toEqual(['prepare','apply']);});
it('existing style overwrite waits for Agent approval and cancellation leaves it unchanged',async()=>{
 const f=fixture(true,1000,vi.fn(async()=>false));
 const request={...f.request,tool:'langbai_save_style_preset',args:{id:'style',name:'new',prompt:'new',expectedRevision:'v1'}};
 expect((await f.tools.execute(request)).ok).toBe(false);expect(f.approve).toHaveBeenCalledOnce();expect(mock.show).not.toHaveBeenCalled();expect(f.sent.map(x=>x.action)).toEqual(['prepare']);
});
it('new style saves directly, existing style needs Agent approval exactly once',async()=>{
 const f=fixture();const args={name:'name',prompt:'prompt',expectedRevision:'v1'};
 expect((await f.tools.execute({...f.request,tool:'langbai_save_style_preset',args})).ok).toBe(true);expect(f.approve).not.toHaveBeenCalled();
 expect((await f.tools.execute({...f.request,tool:'langbai_save_style_preset',args:{...args,id:'existing'}})).ok).toBe(true);expect(f.approve).toHaveBeenCalledOnce();expect(mock.show).not.toHaveBeenCalled();
});
it('timeouts do not substitute saved settings for live state',async()=>{const f=fixture(false,40);const r=await f.tools.execute({...f.request,tool:'langbai_read_studio_state'});expect(r.ok).toBe(false);expect(r.output).toContain('超时');});
it('rejects forged replies without consuming the real pending request',async()=>{const f=fixture(false);const p=f.tools.execute({...f.request,tool:'langbai_read_studio_state'});const id=f.sent[0].id;expect(()=>mock.handlers.get('studio-agent:reply')!({sender:{}},id,{ok:true})).toThrow();mock.handlers.get('studio-agent:reply')!({sender:f.contents},id,{ok:true,data:{live:true}});expect((await p).ok).toBe(true);});
it('does not allow commits without a pending confirmed apply',async()=>{fixture();await expect(mock.handlers.get('studio-agent:commit')!({sender:{}},'fake','theme','system','dark')).rejects.toThrow();expect(mock.set).not.toHaveBeenCalled();});
it('compare-and-set commits once and rejects concurrent edits or replay',async()=>{
  const f=fixture(false);const task=f.tools.execute(f.request);
  await vi.waitFor(()=>expect(f.sent).toHaveLength(1));
  mock.handlers.get('studio-agent:reply')!({sender:f.contents},f.sent[0].id,{ok:true,data:{change:{theme:'dark'}}});
  await vi.waitFor(()=>expect(f.sent).toHaveLength(2));
  const id=f.sent[1].id,commit=mock.handlers.get('studio-agent:commit')!;
  mock.settings.theme='light';await expect(commit({sender:f.contents},id,'theme','system','dark')).rejects.toThrow('changed');expect(mock.set).not.toHaveBeenCalled();
  mock.settings.theme='system';await commit({sender:f.contents},id,'theme','system','dark');expect(mock.set).toHaveBeenCalledOnce();
  await expect(commit({sender:f.contents},id,'theme','dark','light')).rejects.toThrow();
  mock.handlers.get('studio-agent:reply')!({sender:f.contents},id,{ok:true,data:{persisted:true}});expect((await task).ok).toBe(true);
});
