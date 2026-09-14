import path from 'node:path';
import {describe,expect,it} from 'vitest';
import type {AgentAttachment,AgentWorkspaceData} from '../../src/agent/types';
import {invalidateHistoryAttachments,reconcileHistoryAttachments,workspaceAttachments} from './agent-attachment-lifecycle';

const output=path.resolve('fixture-outputs');
const oldFile=path.join(output,'date_1.png');
const image=():AgentAttachment=>({id:'old-image',name:'date_1.png',mime:'image/png',kind:'image',size:10,filePath:oldFile,fileUrl:'old-url',createdAt:'2026-09-14'});
function fixture():AgentWorkspaceData {
  return {
    conversations: [{
      draftAttachments: [image()],
      messages: [{
        content: 'Original character prompt',
        attachments: [image()],
        swipeAttachments: [[image()]],
        tools: [{generatedImages: [image()]}],
      }],
    }],
  } as AgentWorkspaceData;
}
const url=(file:string,id:string)=>`${file}?v=${id}`;
describe('tavern attachment identity',()=>{
  it('invalidates message, draft, alternate swipe and tool references together',()=>{
    const w=fixture();expect(invalidateHistoryAttachments(w,'old-image')).toBe(true);
    expect(workspaceAttachments(w)).toHaveLength(4);
    for(const a of workspaceAttachments(w)){expect(a.unavailable).toBe('deleted');expect(a.fileUrl).toBeUndefined()}
    expect(w.conversations[0].messages[0].content).toBe('Original character prompt');
    expect(invalidateHistoryAttachments(w,'unrelated')).toBe(false);
  });
  it('does not resurrect a deleted attachment after restart and pathname reuse',()=>{
    const w=fixture();invalidateHistoryAttachments(w,'old-image');
    const restored=JSON.parse(JSON.stringify(w));
    reconcileHistoryAttachments(restored,[{id:'new-image',filePath:oldFile}],output,()=>true,url);
    for(const a of workspaceAttachments(restored)){expect(a.unavailable).toBe('deleted');expect(a.fileUrl).toBeUndefined()}
  });
  it('detects existing old-version references already pointing at another record',()=>{
    const w=fixture();reconcileHistoryAttachments(w,[{id:'new-image',filePath:oldFile}],output,()=>true,url);
    for(const a of workspaceAttachments(w)){expect(a.unavailable).toBe('replaced');expect(a.fileUrl).toBeUndefined()}
  });
  it('follows a renamed image by record id rather than switching to the occupant at the old path',()=>{
    const w=fixture(),renamed=path.join(output,'renamed.png');
    reconcileHistoryAttachments(w,[{id:'old-image',filePath:renamed},{id:'new-image',filePath:oldFile}],output,()=>true,url);
    for(const a of workspaceAttachments(w)){expect(a.filePath).toBe(renamed);expect(a.fileUrl).toBe(url(renamed,'old-image'));expect(a.unavailable).toBeUndefined()}
  });
  it('does not silently use an unindexed file in the managed output directory',()=>{
    const w=fixture();reconcileHistoryAttachments(w,[],output,()=>true,url);
    expect(workspaceAttachments(w).every(a=>a.unavailable==='deleted')).toBe(true);
  });
  it('preserves imported attachment files outside outputs and uses stable URLs',()=>{
    const w=fixture();for(const a of workspaceAttachments(w))a.filePath=path.resolve('agent-workspace/attachments/import.png');
    reconcileHistoryAttachments(w,[],output,()=>true,url);
    expect(workspaceAttachments(w).every(a=>a.fileUrl&&!a.unavailable)).toBe(true);
    expect(reconcileHistoryAttachments(w,[],output,()=>true,url)).toBe(false);
  });
  it('shows missing rather than rebinding, and allows a genuinely restored file for the same record',()=>{
    const w=fixture(),history=[{id:'old-image',filePath:oldFile}];
    reconcileHistoryAttachments(w,history,output,()=>false,url);
    expect(workspaceAttachments(w).every(a=>a.unavailable==='missing'&&!a.fileUrl)).toBe(true);
    reconcileHistoryAttachments(w,history,output,()=>true,url);
    expect(workspaceAttachments(w).every(a=>!a.unavailable&&a.fileUrl===url(oldFile,'old-image'))).toBe(true);
  });
});
