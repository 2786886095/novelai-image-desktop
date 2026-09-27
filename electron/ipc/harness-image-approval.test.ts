import {it,expect} from 'vitest';
import {createImageApprovals} from './harness-image-approval';
const request=(sessionId='A',tool='langbai_generate_image',args:Record<string,unknown>={})=>({sessionId,tool,args,callId:'test-request'});
it('requires UI-bound one-shot confirmation and rejects other sessions/IDs',async()=>{
 const approvals=createImageApprovals(5000);let executed=0;
 const waiting=approvals.wait(request()).then(ok=>{if(ok)executed++;return ok});
 const pending=approvals.execute(request('A','studio_image_approval')).data!;expect(pending.count).toBe(1);expect(executed).toBe(0);
 expect(approvals.execute(request('B','studio_resolve_image_approval',{id:pending.id,approved:true})).ok).toBe(false);
 expect(approvals.execute(request('A','studio_resolve_image_approval',{id:'wrong',approved:true})).ok).toBe(false);
 expect(approvals.execute(request('A','studio_resolve_image_approval',{id:pending.id,approved:true})).ok).toBe(true);
 expect(await waiting).toBe(true);expect(executed).toBe(1);
 expect(approvals.execute(request('A','studio_resolve_image_approval',{id:pending.id,approved:true})).ok).toBe(false);
});
it('cancel, stop and expiry never authorize generation',async()=>{
 const approvals=createImageApprovals(15);
 let waiting=approvals.wait(request());const pending=approvals.execute(request('A','studio_image_approval')).data!;
 approvals.execute(request('A','studio_resolve_image_approval',{id:pending.id,approved:false}));expect(await waiting).toBe(false);
 const c=new AbortController();waiting=approvals.wait({...request(),signal:c.signal});c.abort();expect(await waiting).toBe(false);
 expect(await approvals.wait(request())).toBe(false);expect(approvals.execute(request('A','studio_image_approval')).data).toBe(null);
});

it('generic approvals redact private fields, identify API cost, and cancel on bridge shutdown',async()=>{
 const approvals=createImageApprovals(2000);
 const task=approvals.wait(request('A','langbai_convert_prompt',{apiKey:'TEST-PRIVATE',imageData:'TEST-PIXELS'}));
 const p=approvals.execute(request('A','studio_image_approval')).data!;
 expect(p.kind).toBe('operation');expect(p.title).toContain('收费');
 expect(JSON.stringify(p)).not.toContain('TEST-PRIVATE');expect(JSON.stringify(p)).not.toContain('TEST-PIXELS');
 approvals.close();expect(await task).toBe(false);
});
