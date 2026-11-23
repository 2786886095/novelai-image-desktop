import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';

const task = new AsyncLocalStorage<string>();
export const withGoTask = <T>(fn: () => T): T => task.run(randomUUID(), fn);
export function goSession(conversationId?: string): string {
  return conversationId ? createHash('sha256').update('studio-go-conversation:' + conversationId).digest('hex')
    : task.getStore() ?? randomUUID();
}
export function goHeaders(raw: string, id: string): Record<string,string> {
  try {
    const u = new URL(raw);
    if (u.origin === 'https://opencode.ai' && !u.username && !u.password && !u.search && !u.hash &&
        ['/inference/go/v1/chat/completions','/inference/go/v1/responses','/inference/go/v1/messages'].includes(u.pathname)) {
      return {'x-opencode-session':id,'User-Agent':'Langbai-NovelAI-Studio/desktop'};
    }
  } catch { /* Other transports retain their existing validation. */ }
  return {};
}
