import {PROMPT_CUSTOM_TEMPLATE} from './data/prompt-edit-templates';
import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {preparePromptAssistance} from './prompt-assistant';
import {promptEditorText} from './prompt-editor-text';
it('places the compact toolbar inside the prompt editor',()=>expect(readFileSync('src/App.tsx','utf8')).toContain('className="prompt-editor"'));
it('offers preview-before-apply prompt assistance',()=>expect(readFileSync('src/App.tsx','utf8')).toContain('<PromptAssistant'));
it('offers independent undo/redo history',()=>expect(readFileSync('src/App.tsx','utf8')).toContain('usePromptHistory('));
it('native conversion derives an assistant policy without overwriting templates',()=>expect(readFileSync('electron/ipc/nai.ts','utf8')).toContain('preparePromptAssistance('));
it('uses the current text as material and scopes custom changes',()=>{
 const r=preparePromptAssistance('white hair, from above',{kind:'custom',instruction:'改成俯视雨夜街道'});
 expect(JSON.parse(r.userText)).toMatchObject({currentPrompt:'white hair, from above',instruction:'改成俯视雨夜街道'});
 expect(r.auditText).toBe('改成俯视雨夜街道');expect(r.systemSuffix).toBe(PROMPT_CUSTOM_TEMPLATE);
 expect(r.systemSuffix).toContain('不生成新的画师串');
});
it('optimization keeps the original facts as its audit input',()=>expect(preparePromptAssistance('white hair',{kind:'optimize',instruction:''}).auditText).toBe('white hair'));
it('rejects invalid requests before calling a service',()=>{
 for(const [current,request] of [['',{kind:'optimize',instruction:''}],['a',{kind:'custom',instruction:' '}],['a',{kind:'other',instruction:'b'}],['a'.repeat(24001),{kind:'optimize',instruction:''}],['a',{kind:'custom',instruction:'b'.repeat(8001)}]])expect(()=>preparePromptAssistance(current as string,request as any)).toThrow();
});
it('supports a new prompt from explicit custom requirements',()=>expect(preparePromptAssistance('',{kind:'custom',instruction:'一位白发女性站在花园'}).userText).toContain('花园'));
it('all supported languages have preview/apply and undo labels',()=>{
 for(const l of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']){const t=promptEditorText(l);expect(t.undo).toBeTruthy();expect(t.apply).not.toBe(t.run);expect(t.modes).toHaveLength(3);}
});
