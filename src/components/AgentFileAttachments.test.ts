import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AgentFileAttachments } from './AgentFileAttachments';
import type { AgentAttachment } from '../agent/types';
import { studioUxText } from '../agent/ux';
const attachment: AgentAttachment = { id: 'fixture', name: '正文.txt <script>not-code</script>', kind: 'text', mime: 'text/plain', size: 2048, filePath: 'PRIVATE_NATIVE_PATH', createdAt: '2026-10-22T00:00:00Z' };
const render = (patch: Partial<AgentAttachment>, mode: 'draft' | 'message', language: string) => renderToStaticMarkup(createElement(AgentFileAttachments, { attachments: [{ ...attachment, name: '正文.txt', ...patch }], mode, language, onRemove: () => undefined }));
it('shows filename, size and staged status rather than pretending the model has read a file', () => {
  const html = render({}, 'draft', 'zh-CN'); expect(html).toContain('正文.txt'); expect(html).toContain('2 KiB');
  expect(html).toContain('data-agent-attachment-state="staged"'); expect(html).toContain(studioUxText('zh-CN', 'attachmentStaged'));
  expect(html).not.toContain('PRIVATE_NATIVE_PATH'); expect(html).not.toContain('<img');
});
it('keeps sent reference metadata visible without a remove action or read-success claim', () => {
  const html = render({}, 'message', 'en-US'); expect(html).toContain('data-agent-attachment-state="message"');
  expect(html).toContain('2 KiB'); expect(html).not.toContain('<button'); expect(html).not.toContain('PRIVATE_NATIVE_PATH');
});
it('escapes a malicious filename and provides an explicit unsupported-format explanation', () => {
  const html = render({ name: attachment.name }, 'draft', 'en-US'); expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>');
  const invalid = render({ name: 'novel.pdf', kind: 'document' }, 'draft', 'en-US'); expect(invalid).toContain('data-agent-attachment-state="unsupported"'); expect(invalid).toContain(studioUxText('en-US', 'attachmentUnsupported'));
});
it.each(['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR'])('localizes the new feedback and recovery vocabulary for %s', language => {
  for (const key of ['pendingTextFiles','messageTextFiles','attachmentStaged','attachmentReference','attachmentUnavailable','attachmentUnsupported','attachmentOversize','attachmentInvalidSize','textAttachmentHint','unsentDraftTitle','unsentDraftHint','appendUnsentDraft','copyUnsentDraft','dismissUnsentDraft','unsentActionLimit']) {
    expect(studioUxText(language,key)).not.toBe(key); expect(studioUxText(language,key).trim()).not.toBe('');
  }
});
