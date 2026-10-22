import { LuFileText, LuTriangleAlert, LuX } from 'react-icons/lu';
import type { AgentAttachment } from '../agent/types';
import { agentAttachmentIssue, agentAttachmentSize } from '../agent/attachment-feedback';
import { studioUxText } from '../agent/ux';

export function AgentFileAttachments({ attachments, language, mode, onRemove, disabled = false }: {
  attachments: readonly AgentAttachment[];
  language: unknown;
  mode: 'draft' | 'message';
  onRemove?: (id: string) => void;
  disabled?: boolean;
}) {
  const files = attachments.filter(item => item.kind !== 'image');
  if (!files.length) return null;
  const t = (key: string) => studioUxText(language, key);
  return <div className={`pi-attachments pi-file-attachments${mode === 'draft' ? ' is-draft' : ''}`} aria-label={t(mode === 'draft' ? 'pendingTextFiles' : 'messageTextFiles')}>
    {files.map(item => {
      const issue = agentAttachmentIssue(item);
      const label = t(issue?.key ?? (mode === 'draft' ? 'attachmentStaged' : 'attachmentReference'));
      return <div key={item.id} data-agent-attachment-id={item.id} data-agent-attachment-state={issue?.state ?? (mode === 'draft' ? 'staged' : 'message')} className={`pi-file-card${issue ? ' has-issue' : ''}`} aria-invalid={!!issue}>
        {issue ? <LuTriangleAlert aria-hidden/> : <LuFileText aria-hidden/>}
        <span className="pi-file-body"><span className="pi-file-name" title={item.name}>{item.name}</span><small className="pi-file-meta">{agentAttachmentSize(item.size, language)} · {label}</small>{item.unavailable && <small role="status">{t('reattach')}</small>}</span>
        {mode === 'draft' && onRemove && <button type="button" className="pi-icon pi-file-remove" disabled={disabled} aria-label={`${t('removeAttachment')}: ${item.name}`} title={t('removeAttachment')} onClick={() => onRemove(item.id)}><LuX aria-hidden/></button>}
      </div>;
    })}
    {mode === 'draft' && <p className="pi-file-help">{t('textAttachmentHint')}</p>}
  </div>;
}
