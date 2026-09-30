import type { AgentEvent, AgentPermissionRequest } from '../../src/agent/types';

/** UI confirmation is one-shot, abortable and never grants future access. */
export class StudioPiApprovals {
  private readonly entries = new Map<string, { request: AgentPermissionRequest; settle: (allowed: boolean) => void }>();
  pending() { return [...this.entries.values()].map(({ request }) => structuredClone(request)); }

  request(request: AgentPermissionRequest, signal: AbortSignal, emit: (event: AgentEvent) => void) {
    signal.throwIfAborted();
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (allowed: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        this.entries.delete(request.id);
        emit({ kind: 'permission-resolved', permissionId: request.id, response: allowed ? 'once' : 'reject' });
        resolve(allowed);
      };
      const abort = () => settle(false);
      const timer = setTimeout(abort, 600_000);
      timer.unref?.();
      this.entries.set(request.id, { request: structuredClone(request), settle });
      signal.addEventListener('abort', abort, { once: true });
      emit({ kind: 'permission', request });
      // Covers cancellation racing the permission event.
      if (signal.aborted) settle(false);
    });
  }

  respond(id: string, response: 'once' | 'always' | 'reject') {
    const entry = this.entries.get(id);
    if (!entry) return { ok: false, message: '此确认已失效，请查看最新方案。' };
    if (response === 'always') return { ok: false, message: '每次操作都需单独确认。' };
    entry.settle(response === 'once');
    return { ok: true };
  }
}
