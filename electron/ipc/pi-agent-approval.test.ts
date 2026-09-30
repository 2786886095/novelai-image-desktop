import { expect, it, vi } from 'vitest';
import { StudioPiApprovals } from './pi-agent-approval';
const request = { id: 'p1', conversationId: 'chat', runtimeSessionId: 'chat', type: 'langbai_generate_image', title: '生成图片', createdAt: 'fixture' };
it('waits for the application decision, rejects always and consumes once', async () => {
  const gate = new StudioPiApprovals(); const emit = vi.fn();
  const waiting = gate.request(request, new AbortController().signal, emit);
  expect(gate.pending()).toEqual([request]);
  expect(gate.respond('p1', 'always').ok).toBe(false);
  expect(gate.pending()).toHaveLength(1);
  expect(gate.respond('p1', 'once').ok).toBe(true);
  expect(await waiting).toBe(true);
  expect(gate.respond('p1', 'once').ok).toBe(false);
  expect(gate.pending()).toEqual([]);
});
it('aborting dismisses the card and does not authorize execution', async () => {
  const gate = new StudioPiApprovals(); const controller = new AbortController();
  const waiting = gate.request(request, controller.signal, vi.fn());
  controller.abort(); expect(await waiting).toBe(false);
  expect(gate.pending()).toEqual([]);
});
it('an unattended approval expires without execution', async () => {
  vi.useFakeTimers();
  try {
    const gate = new StudioPiApprovals();
    const waiting = gate.request(request, new AbortController().signal, vi.fn());
    await vi.advanceTimersByTimeAsync(600_000);
    expect(await waiting).toBe(false); expect(gate.pending()).toEqual([]);
  } finally { vi.useRealTimers(); }
});
