import path from 'node:path';
import type {AgentAttachment, AgentWorkspaceData} from '../../src/agent/types';

export function workspaceAttachments(workspace: AgentWorkspaceData): AgentAttachment[] {
  return workspace.conversations.flatMap(conversation => [
    ...conversation.draftAttachments,
    ...conversation.messages.flatMap(message => [
      ...message.attachments,
      ...(message.swipeAttachments ?? []).flat(),
      ...message.tools.flatMap(tool => tool.generatedImages ?? []),
    ]),
  ]);
}

const key = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);

/** Keep tombstones: a new file at the old pathname is never the old attachment. */
export function invalidateHistoryAttachments(workspace: AgentWorkspaceData, id: string): boolean {
  let changed = false;
  for (const attachment of workspaceAttachments(workspace)) {
    if (attachment.id !== id) continue;
    if (attachment.unavailable !== 'deleted' || attachment.fileUrl) changed = true;
    attachment.unavailable = 'deleted';
    delete attachment.fileUrl;
  }
  return changed;
}

/** Match record identity first, not basename, file existence, or the latest image. */
export function reconcileHistoryAttachments(
  workspace: AgentWorkspaceData,
  history: Array<{id: string; filePath: string}>,
  outputDir: string,
  exists: (file: string) => boolean,
  urlFor: (file: string, revision: string) => string,
): boolean {
  const byId = new Map(history.map(item => [item.id, item]));
  const byPath = new Map(history.map(item => [key(item.filePath), item]));
  let changed = false;
  for (const attachment of workspaceAttachments(workspace)) {
    const old = [attachment.filePath, attachment.fileUrl, attachment.unavailable];
    if (attachment.unavailable === 'deleted' || attachment.unavailable === 'replaced') {
      delete attachment.fileUrl;
    } else {
      const record = byId.get(attachment.id);
      const occupant = byPath.get(key(attachment.filePath));
      const relative = outputDir ? path.relative(path.resolve(outputDir), path.resolve(attachment.filePath)) : '..';
      const managed = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
      if (record) {
        attachment.filePath = record.filePath;
        attachment.unavailable = exists(record.filePath) ? undefined : 'missing';
      } else if (occupant && occupant.id !== attachment.id) {
        attachment.unavailable = 'replaced';
      } else if (managed && !attachment.id.startsWith('reference-preset:')) {
        attachment.unavailable = 'deleted';
      } else {
        attachment.unavailable = exists(attachment.filePath) ? undefined : 'missing';
      }
      if (attachment.unavailable) delete attachment.fileUrl;
      else attachment.fileUrl = urlFor(attachment.filePath, attachment.id);
    }
    if (old[0] !== attachment.filePath || old[1] !== attachment.fileUrl || old[2] !== attachment.unavailable) changed = true;
  }
  return changed;
}
