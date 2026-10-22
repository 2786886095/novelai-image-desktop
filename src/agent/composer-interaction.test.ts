import { expect, it } from 'vitest';
import { appendStudioComposerRecovery, createStudioComposerInteractions, studioSendRecoveryDecision } from './composer-interaction';
it('synchronously admits only one send before any React render and releases only its own flight',()=>{
 const gate=createStudioComposerInteractions();const first=gate.beginSend('a')!;expect(gate.beginSend('a')).toBeUndefined();expect(gate.beginSend('b')).toBeUndefined();expect(gate.finish({...first})).toBe(false);expect(gate.beginSend('a')).toBeUndefined();expect(gate.finish(first)).toBe(true);expect(gate.beginSend('a')).toBeDefined();expect(gate.finish(first)).toBe(false);
});
it('clipboard/upload discovery blocks sends immediately and cannot be cleared by an older completion',()=>{
 const gate=createStudioComposerInteractions();const first=gate.beginUpload('a')!;expect(gate.beginSend('a')).toBeUndefined();expect(gate.beginUpload('b')).toBeUndefined();expect(gate.finish(first)).toBe(true);const second=gate.beginUpload('b')!;expect(gate.finish(first)).toBe(false);expect(gate.beginSend('b')).toBeUndefined();expect(gate.finish(second)).toBe(true);expect(gate.beginSend('b')).toBeDefined();
});
it('allows staging next-turn attachments while a model send is still running',()=>{
 const gate=createStudioComposerInteractions();const send=gate.beginSend('a')!;const upload=gate.beginUpload('a')!;expect(upload).toMatchObject({kind:'upload',conversationId:'a'});expect(gate.finish(send)).toBe(true);expect(gate.beginSend('a')).toBeUndefined();expect(gate.finish(upload)).toBe(true);expect(gate.beginSend('a')).toBeDefined();
});
it('tracks draft revisions per conversation including edits that return to the same text',()=>{
 const gate=createStudioComposerInteractions();expect(gate.revision('a')).toBe(0);expect(gate.edited('a')).toBe(1);expect(gate.edited('a')).toBe(2);expect(gate.revision('b')).toBe(0);
});
it.each([
 [{beforeUsers:2,observedUsers:3,confirmedUsers:2,clearedRevision:1,currentRevision:1},'committed'],
 [{beforeUsers:2,observedUsers:2,confirmedUsers:3,clearedRevision:1,currentRevision:1},'committed'],
 [{beforeUsers:2,observedUsers:2,confirmedUsers:2,clearedRevision:1,currentRevision:1},'restore'],
 [{beforeUsers:2,observedUsers:2,confirmedUsers:2,clearedRevision:1,currentRevision:2},'retain'],
 [{beforeUsers:2,observedUsers:2,clearedRevision:1,currentRevision:1},'retain'],
 [{beforeUsers:2,observedUsers:2,confirmedUsers:1,clearedRevision:1,currentRevision:1},'retain'],
] as const)('recovers only a confirmed uncommitted and unedited draft (%j)',(input,expected)=>expect(studioSendRecoveryDecision(input)).toBe(expected));
it('explicit append preserves raw whitespace/new edits and deduplicates action selections without mutating either input',()=>{
 const current={text:' new draft  ',actions:[{kind:'web-search'} as const]};const recovery={text:'  original\n ',actions:[{kind:'web-search'} as const,{kind:'prompt-preset',templateId:'saved'} as const]};const before=structuredClone({current,recovery});expect(appendStudioComposerRecovery(current,recovery)).toEqual({text:' new draft  \n\n  original\n ',actions:[{kind:'web-search'},{kind:'prompt-preset',templateId:'saved'}]});expect({current,recovery}).toEqual(before);
});
it('refuses action overflow atomically rather than silently dropping existing or recovered selections',()=>{
 const current={text:'new',actions:['a','b','c','d'].map(templateId=>({kind:'prompt-preset' as const,templateId}))};const recovery={text:'old',actions:[{kind:'web-search' as const}]};expect(appendStudioComposerRecovery(current,recovery)).toBeUndefined();expect(current.text).toBe('new');expect(current.actions).toHaveLength(4);expect(recovery.text).toBe('old');
});
