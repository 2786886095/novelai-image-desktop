import { describe, expect, it } from 'vitest';
import type { AgentAttachment } from './types';
import { agentAttachmentIssue, agentAttachmentSize, agentDraftAttachmentIssue, MAX_TEXT_ATTACHMENT_BYTES, MAX_TURN_TEXT_ATTACHMENT_BYTES, AGENT_TEXT_EXTENSIONS } from './attachment-feedback';
import { MAX_TEXT_ATTACHMENT_BYTES as nativeLimit, MAX_TURN_TEXT_ATTACHMENT_BYTES as nativeTurnLimit } from '../../electron/ipc/agent-text-attachments';

const file = (patch: Partial<AgentAttachment> = {}): AgentAttachment => ({ id: 'fixture', name: '合成正文.txt', kind: 'text', mime: 'text/plain', size: 2048, filePath: 'NEVER_READ_BY_RENDERER', createdAt: '2026-10-22T00:00:00Z', ...patch });
describe('attachment feedback without reading file contents', () => {
  it('shares the native reader limits rather than promising a different input capacity', () => {
    expect(nativeLimit).toBe(MAX_TEXT_ATTACHMENT_BYTES);
    expect(nativeTurnLimit).toBe(MAX_TURN_TEXT_ATTACHMENT_BYTES);
  });
  it.each(AGENT_TEXT_EXTENSIONS)('accepts the supported extension %s, including upper-case names', extension => {
    expect(agentAttachmentIssue(file({ name: `合成${extension.toUpperCase()}` }))).toBeUndefined();
  });
  it('does not apply the text limit to an image or claim to have decoded it', () => {
    expect(agentAttachmentIssue(file({ kind: 'image', name: 'fixture.png', size: 2_000_000 }))).toBeUndefined();
  });
  it('provides explicit recovery reasons for unsupported, oversized, unavailable and invalid references', () => {
    expect(agentAttachmentIssue(file({ name: 'novel.pdf', kind: 'document' }))?.state).toBe('unsupported');
    expect(agentAttachmentIssue(file({ name: '.txt' }))?.state).toBe('unsupported');
    expect(agentAttachmentIssue(file({ kind: 'other' }))?.state).toBe('unsupported');
    expect(agentAttachmentIssue(file({ size: MAX_TEXT_ATTACHMENT_BYTES + 1 }))?.state).toBe('oversize');
    expect(agentAttachmentIssue(file({ unavailable: 'missing' }))?.state).toBe('unavailable');
    for (const size of [0, -1, NaN, Infinity, 1.5]) expect(agentAttachmentIssue(file({ size }))?.state).toBe('invalid');
  });
  it('does not silently drop bad files or mutate metadata while inspecting a draft', () => {
    const bad = file({ id: 'pdf', name: 'book.pdf' }); const items = [file(), bad]; const before = structuredClone(items);
    expect(agentDraftAttachmentIssue(items)?.attachment).toBe(bad); expect(items).toEqual(before);
  });
  it('formats binary units with bounded fractions and no path or encoding assumptions', () => {
    expect(agentAttachmentSize(1024, 'en-US')).toBe('1 KiB'); expect(agentAttachmentSize(1_048_576, 'zh-CN')).toBe('1 MiB');
    expect(agentAttachmentSize(12, 'bad-locale')).toBe('12 B'); expect(agentAttachmentSize(Infinity, 'en-US')).toBe('—');
  });
});
