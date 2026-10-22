import type { AgentComposerAction } from './types';
import { normalizeStudioComposerActions } from './composer-actions';

export type StudioComposerFlight = Readonly<{ id: number; conversationId: string; kind: 'send' | 'upload' }>;
export type StudioComposerRecovery = { text: string; actions: AgentComposerAction[] };

/** Synchronous gates supplement (never replace) native admission and React UI.
 * Uploads may stage the next turn during a model request; sends may not race an
 * upload, including its initial asynchronous clipboard discovery. */
export function createStudioComposerInteractions() {
  let serial = 0;
  let sending: StudioComposerFlight | undefined;
  let uploading: StudioComposerFlight | undefined;
  const revisions = new Map<string, number>();
  return {
    revision: (id: string) => revisions.get(id) ?? 0,
    edited(id: string) { const revision = (revisions.get(id) ?? 0) + 1; revisions.set(id, revision); return revision; },
    beginSend(conversationId: string): StudioComposerFlight | undefined {
      if (!conversationId || sending || uploading) return;
      return sending = Object.freeze({ id: ++serial, conversationId, kind: 'send' });
    },
    beginUpload(conversationId: string): StudioComposerFlight | undefined {
      if (!conversationId || uploading) return;
      return uploading = Object.freeze({ id: ++serial, conversationId, kind: 'upload' });
    },
    finish(flight: StudioComposerFlight) {
      if (flight.kind === 'send' && sending === flight) { sending = undefined; return true; }
      if (flight.kind === 'upload' && uploading === flight) { uploading = undefined; return true; }
      return false;
    },
  };
}

/** A late workspace event is not proof of an uncommitted send. Restore only
 * after a fresh readback confirms the original user count AND no new edit. */
export function studioSendRecoveryDecision(input: {
  beforeUsers: number; observedUsers?: number; confirmedUsers?: number;
  clearedRevision: number; currentRevision: number;
}): 'committed' | 'restore' | 'retain' {
  if ((input.observedUsers ?? -1) > input.beforeUsers || (input.confirmedUsers ?? -1) > input.beforeUsers) return 'committed';
  if (input.confirmedUsers === input.beforeUsers && input.currentRevision === input.clearedRevision) return 'restore';
  return 'retain';
}

/** Explicit recovery appends instead of replacing a newer draft. If selected
 * actions cannot fit, return no partial update and keep the recovery available. */
export function appendStudioComposerRecovery(current: StudioComposerRecovery, recovery: StudioComposerRecovery): StudioComposerRecovery | undefined {
  const actions = normalizeStudioComposerActions(current.actions);
  for (const action of normalizeStudioComposerActions(recovery.actions)) {
    if (actions.some(item => JSON.stringify(item) === JSON.stringify(action))) continue;
    if (actions.length === 4) return;
    actions.push(action);
  }
  return { text: current.text && recovery.text ? `${current.text}\n\n${recovery.text}` : current.text || recovery.text, actions };
}
