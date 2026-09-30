import {registerAgentComicRun} from './comic-run-authorization';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import os from 'node:os';
import {beginJob,cancelAllJobs} from './job-registry';
import {DEFAULT_PARAMS,type TagComicGenerateRequest} from '../../src/types';
const mock=vi.hoisted(()=>({references:vi.fn(),token:vi.fn(),group:vi.fn()}));
vi.mock('electron',()=>({app:{getPath:()=>os.tmpdir()},dialog:{},nativeImage:{}}));
vi.mock('./comic-assets',()=>({readComicReferences:mock.references,readComicImage:vi.fn(),buildComicSelectedZip:vi.fn(),writeComicZip:vi.fn()}));
vi.mock('./store',()=>({getToken:mock.token,getSettings:()=>({}),ensureHistoryGroup:mock.group}));
import {generateTagComicCandidate,cancelTagComicGeneration,generateImage,waitTagComicGeneration} from './nai';
const request=(runId:string):TagComicGenerateRequest=>({runId,projectId:'project',projectTitle:'comic',panelId:'panel',panelIndex:1,params:{...DEFAULT_PARAMS,positivePrompt:'forest'},panelPrompt:'forest',globalStylePrompt:'',globalNegativePrompt:'',preciseReferences:[]});
beforeEach(()=>{vi.clearAllMocks();mock.references.mockResolvedValue([]);mock.token.mockReturnValue('');mock.group.mockReturnValue({id:'group',name:'comic'});});
afterEach(()=>{cancelAllJobs();});
it('scoped comic stop aborts only the owned run before any paid request, not unrelated jobs',async()=>{
 let release!:(v:[])=>void;mock.references.mockImplementationOnce(()=>new Promise(resolve=>release=resolve));
 const unrelated=beginJob(),pending=generateTagComicCandidate(request('owned-run'));await vi.waitFor(()=>expect(mock.references).toHaveBeenCalledTimes(1));
 expect(cancelTagComicGeneration('wrong-run')).toEqual({ok:true,requested:false});expect(cancelTagComicGeneration('owned-run')).toEqual({ok:true,requested:true});expect(unrelated.controller.signal.aborted).toBe(false);
 release([]);const result=await pending;expect(result.ok).toBe(false);expect(result.message).toContain('停止');expect(mock.token).not.toHaveBeenCalled();expect(mock.group).not.toHaveBeenCalled();expect(cancelTagComicGeneration('owned-run').requested).toBe(false);unrelated.end();
});
it('duplicate run IDs cannot replace another in-flight controller',async()=>{
 let release!:(v:[])=>void;mock.references.mockImplementationOnce(()=>new Promise(resolve=>release=resolve));const first=generateTagComicCandidate(request('same-run'));await vi.waitFor(()=>expect(mock.references).toHaveBeenCalledTimes(1));
 const duplicate=await generateTagComicCandidate(request('same-run'));expect(duplicate.ok).toBe(false);expect(mock.references).toHaveBeenCalledTimes(1);expect(cancelTagComicGeneration('same-run').requested).toBe(true);release([]);expect((await first).ok).toBe(false);
});
it('native generator relays an already-aborted scoped signal and releases its registered job',async()=>{
 mock.token.mockReturnValue('fixture-token');const controller=new AbortController(),unrelated=beginJob();controller.abort(Error('owned-cancel'));
 const result=await generateImage({...DEFAULT_PARAMS,positivePrompt:'forest'},undefined,{signal:controller.signal});expect(result.ok).toBe(false);expect(result.message).toContain('owned-cancel');expect(unrelated.controller.signal.aborted).toBe(false);unrelated.end();expect(cancelAllJobs()).toBe(false);
});
it('invalid run identity stops before file lookup and creates no cancellable operation',async()=>{expect((await generateTagComicCandidate(request('../bad'))).ok).toBe(false);expect(mock.references).not.toHaveBeenCalled();expect(cancelTagComicGeneration('../bad').requested).toBe(false);});

it('expired Agent authorization rejects inside the real native entry before history or token lookup',async()=>{
 const result=await generateTagComicCandidate(request('agent-comic-expired'));expect(result.ok).toBe(false);expect(result.message).toContain('授权');expect(mock.token).not.toHaveBeenCalled();expect(mock.group).not.toHaveBeenCalled();
});
it('live Agent authorization is checked after reference file validation and rejection never charges',async()=>{
 const authorize=vi.fn(async()=>{throw Error('source changed');}),dispose=registerAgentComicRun('agent-comic-live',authorize);
 try{mock.references.mockRejectedValueOnce(Error('missing reference'));expect((await generateTagComicCandidate(request('agent-comic-live'))).message).toBe('missing reference');expect(authorize).not.toHaveBeenCalled();
 expect((await generateTagComicCandidate(request('agent-comic-live'))).message).toBe('source changed');expect(authorize).toHaveBeenCalledOnce();expect(mock.group).not.toHaveBeenCalled();expect(mock.token).not.toHaveBeenCalled();}finally{dispose();}
});
it('real native image preparation invokes the final guard and returns its error before HTTP',async()=>{
 mock.token.mockReturnValue('fixture-token');const guard=vi.fn(()=>{throw Error('final-source-guard');});const result=await generateImage({...DEFAULT_PARAMS,positivePrompt:'forest'},undefined,{beforeSubmit:guard});expect(guard).toHaveBeenCalledOnce();expect(result.ok).toBe(false);expect(result.message).toContain('final-source-guard');expect(cancelAllJobs()).toBe(false);
});
it('native settlement wait does not release an aborted request until its async preparation exits',async()=>{
 let release!:(v:[])=>void;mock.references.mockImplementationOnce(()=>new Promise(resolve=>release=resolve));const pending=generateTagComicCandidate(request('await-owned'));await vi.waitFor(()=>expect(mock.references).toHaveBeenCalled());let done=false;const waiter=waitTagComicGeneration('await-owned').then(()=>{done=true;});cancelTagComicGeneration('await-owned');await Promise.resolve();expect(done).toBe(false);release([]);await pending;await waiter;expect(done).toBe(true);
});
