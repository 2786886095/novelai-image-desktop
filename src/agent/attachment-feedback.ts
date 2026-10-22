import type { AgentAttachment } from './types';

// Shared with the native reader. This is a format/size check, not proof that a
// file was decoded, sent, or read by a model. Decoding remains native-only.
export const MAX_TEXT_ATTACHMENT_BYTES = 1_048_576;
export const MAX_TURN_TEXT_ATTACHMENT_BYTES = 4_194_304;
export const AGENT_TEXT_EXTENSIONS = ['.txt', '.md', '.json', '.jsonl', '.csv', '.tsv', '.yaml', '.yml'] as const;
export type AgentAttachmentIssue = {
  attachment: AgentAttachment;
  key: 'attachmentUnavailable' | 'attachmentUnsupported' | 'attachmentOversize' | 'attachmentInvalidSize';
  state: 'unavailable' | 'unsupported' | 'oversize' | 'invalid';
};

export function agentAttachmentIssue(attachment: AgentAttachment): AgentAttachmentIssue | undefined {
  if (attachment.unavailable) return { attachment, key: 'attachmentUnavailable', state: 'unavailable' };
  if (attachment.kind === 'image') return;
  const basename = attachment.name.split(/[\\/]/).at(-1) ?? '';
  const dot = basename.lastIndexOf('.');
  const extension = dot > 0 ? basename.slice(dot).toLowerCase() : undefined;
  if (attachment.kind !== 'text' || !AGENT_TEXT_EXTENSIONS.some(value => value === extension)) {
    return { attachment, key: 'attachmentUnsupported', state: 'unsupported' };
  }
  if (!Number.isSafeInteger(attachment.size) || attachment.size <= 0) {
    return { attachment, key: 'attachmentInvalidSize', state: 'invalid' };
  }
  if (attachment.size > MAX_TEXT_ATTACHMENT_BYTES) return { attachment, key: 'attachmentOversize', state: 'oversize' };
}

export function agentDraftAttachmentIssue(attachments: readonly AgentAttachment[]) {
  for (const attachment of attachments) {
    const issue = agentAttachmentIssue(attachment);
    if (issue) return issue;
  }
}

export function agentAttachmentSize(bytes: number, language: unknown): string {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return '—';
  const locale = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR'].includes(String(language)) ? String(language) : 'zh-CN';
  const divisor = bytes < 1024 ? 1 : bytes < 1_048_576 ? 1024 : 1_048_576;
  const unit = divisor === 1 ? 'B' : divisor === 1024 ? 'KiB' : 'MiB';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: divisor === 1 ? 0 : 1 }).format(bytes / divisor)} ${unit}`;
}
