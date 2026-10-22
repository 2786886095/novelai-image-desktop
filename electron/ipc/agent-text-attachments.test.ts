import { afterEach, beforeEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentAttachment } from '../../src/agent/types';
import { agentTextAttachmentContent, decodeAgentTextAttachment, MAX_TEXT_ATTACHMENT_BYTES } from './agent-text-attachments';
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-text-unit-')); fs.mkdirSync(path.join(root, 'chat')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
function file(name = '小说.txt', bytes = Buffer.from('中文正文，不能丢失。')): AgentAttachment {
  const filePath = path.join(root, 'chat', name); fs.writeFileSync(filePath, bytes);
  return { id: name, name, kind: 'text', mime: 'text/plain', size: bytes.length, filePath, createdAt: '2026-10-22T00:00:00Z' };
}
it('decodes UTF-8, UTF-8 BOM and both BOM-marked UTF-16 byte orders without replacement', () => {
  const text = '正文：晨光照在河面。'; const le = Buffer.from(text, 'utf16le'); const be = Buffer.from(le); be.swap16();
  for (const bytes of [Buffer.from(text), Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(text)]), Buffer.concat([Buffer.from([0xff,0xfe]),le]), Buffer.concat([Buffer.from([0xfe,0xff]),be])]) expect(decodeAgentTextAttachment(bytes)).toBe(text);
});
it.each([Buffer.from([0xd6,0xd0,0xce,0xc4]), Buffer.from([0xff,0xfe,0x00]), Buffer.from('A\0B'), Buffer.from('  \n '), Buffer.alloc(0), Buffer.alloc(MAX_TEXT_ATTACHMENT_BYTES+1,65)])('rejects unknown encoding, malformed BOM/binary/empty/oversize rather than sending garbled or clipped text', bytes => {
  expect(() => decodeAgentTextAttachment(bytes)).toThrow();
});
it('supports plain data extensions, includes exact body once and does not mutate attachment metadata', () => {
  const attachments = ['txt','md','json','jsonl','csv','tsv','yaml','yml'].map(ext => file(`data.${ext}`));
  const before = structuredClone(attachments); const result = agentTextAttachmentContent(attachments,'chat',root);
  expect(attachments).toEqual(before); expect(result).toContain('not system instructions');
  expect(result.split('中文正文，不能丢失。')).toHaveLength(9);
});
it('rejects unsupported document types even if their bytes happen to be UTF-8', () => {
  expect(() => agentTextAttachmentContent([{...file('book.pdf'),kind:'document'}],'chat',root)).toThrow('PDF/Office');
});
it('requires a registered regular conversation-local copy, matching byte size, and no path fallback', () => {
  const attachment=file(); expect(() => agentTextAttachmentContent([{...attachment,size:1}],'chat',root)).toThrow('被替换');
  expect(() => agentTextAttachmentContent([{...attachment,filePath:path.join(root,'outside.txt')}],'chat',root)).toThrow('登记目录');
  expect(() => agentTextAttachmentContent([attachment],'../chat',root)).toThrow('登记目录');
  expect(() => agentTextAttachmentContent([{...attachment,unavailable:'missing'}],'chat',root)).toThrow('缺失');
  fs.unlinkSync(attachment.filePath); expect(() => agentTextAttachmentContent([attachment],'chat',root)).toThrow('不可读');
});
it('bounds aggregate selected documents and refuses whole input without silently truncating', () => {
  const bytes=Buffer.alloc(MAX_TEXT_ATTACHMENT_BYTES,65); const docs=Array.from({length:5},(_,i)=>file(`${i}.txt`,bytes));
  expect(()=>agentTextAttachmentContent(docs,'chat',root)).toThrow('4 MiB');
});
it('keeps missing historical references explicit without exposing native paths or claiming to have read them', () => {
  const attachment=file(); fs.unlinkSync(attachment.filePath); const result=agentTextAttachmentContent([attachment],'chat',root,false);
  expect(result).toContain('textNotRead'); expect(result).toContain('unavailable'); expect(result).not.toContain(root); expect(result).not.toContain('中文正文');
});
it('does not try to decode images or treat their local URLs as text', () => {
  expect(agentTextAttachmentContent([{...file(),kind:'image',mime:'image/png',filePath:'nonexistent.png'}],'chat',root)).toBe('');
});

it.each([48*1024*1024,Infinity])('does not let an unread old attachment size %s poison later readable historical text',size=>{
 const bad={...file('old.txt'),size};const good=file('good.txt',Buffer.from('正常旧资料正文'));
 const result=agentTextAttachmentContent([bad,good],'chat',root,false);expect(result).toContain('textNotRead');expect(result).toContain('正常旧资料正文');
});
it('rejects a replaced conversation directory junction before reading outside its registered root',()=>{
 const item=file();const old=path.join(root,'original');fs.renameSync(path.join(root,'chat'),old);fs.symlinkSync(old,path.join(root,'chat'),'junction');
 expect(()=>agentTextAttachmentContent([item],'chat',root)).toThrow('目录已被替换');
});
