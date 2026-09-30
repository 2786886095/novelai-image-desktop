import { beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  workspace: null as any,
  turn: vi.fn(),
  summary: vi.fn(),
  settings: { agentAutoCompact: false, agentAutoCompactThreshold: 0.8, agentContextWindow: 8192 },
}));
vi.mock('./store', () => ({ getSettings: () => ({
  agentApiBaseUrl: 'https://fixture.invalid/v1', agentApiModel: 'fixture',
  agentApiKey: 'fixture-key', agentApiProtocol: 'openai-compatible',
  agentVisionEnabled: false, ...fixture.settings,
}) }));
vi.mock('./agent-store', () => ({
  readAgentWorkspace: () => structuredClone(fixture.workspace),
  updateAgentConversation: (id: string, update: (chat: any) => void) => {
    const chat = fixture.workspace.conversations.find((item: any) => item.id === id);
    if (chat) update(chat);
  },
}));
vi.mock('./pi-agent-turn', () => ({ completeStudioPiTurn: fixture.turn, completeStudioPiSummary: fixture.summary }));
vi.mock('./agent-tools', () => ({ executeAgentTool: vi.fn() }));
vi.mock('./proxy', () => ({ proxyConfig: () => ({}) }));
import { compactAgentConversation, sendAgentMessage, getAgentPendingPermissions, respondAgentPermission, abortAgentMessage, hasActiveAgentRequests, stopAgentRuntime } from './agent-runtime';

beforeEach(() => {
  delete process.env.LANGBAI_PI_AGENT;
  fixture.workspace = { conversations: [{
    id: 'studio', title: '新对话', messages: [], draftAttachments: [], status: 'idle', compactCount: 0,
  }] };
  stopAgentRuntime();
  fixture.settings.agentAutoCompact = false;
  fixture.summary.mockReset();
  fixture.turn.mockReset();
});

it('defaults to Pi without requiring a Tavern character or sampler', async () => {
  fixture.turn.mockResolvedValue({ content: '已整理提示词。', reasoning: '',
    usage: { input: 10, output: 5, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 15 } });
  const result = await sendAgentMessage({ conversationId: 'studio', text: '整理猫的提示词' });
  expect(result.ok).toBe(true);
  expect(fixture.turn).toHaveBeenCalledTimes(1);
  const prompt = fixture.turn.mock.calls[0][0].prompt;
  expect(prompt.at(-1)).toMatchObject({ role: 'user', content: '整理猫的提示词' });
  expect(fixture.workspace.conversations[0].messages.at(-1)).toMatchObject({
    role: 'assistant', content: '已整理提示词。', status: 'complete',
  });
});

it('persists a tool result and generated image without legacy proposal parsing', async () => {
  fixture.turn.mockImplementation(async (options) => {
    options.onTool({ id: 'tool-1', name: 'langbai_generate_image', title: '生图',
      status: 'completed', generatedImages: [{ id: 'image-1', kind: 'image', name: 'a.png', fileUrl: 'local://a.png' }] });
    return { content: '已生成。', reasoning: '',
      usage: { input: 1, output: 1, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 2 } };
  });
  const result = await sendAgentMessage({ conversationId: 'studio', text: '生图' });
  expect(result.ok).toBe(true);
  const message = fixture.workspace.conversations[0].messages.at(-1);
  expect(message.tools[0].name).toBe('langbai_generate_image');
  expect(message.attachments[0].id).toBe('image-1');
  expect(message.imageProposal).toBeUndefined();
});

it('pauses on an application-owned approval and consumes only a one-shot user answer', async () => {
  let authorized: boolean | undefined;
  fixture.turn.mockImplementation(async (options) => {
    authorized = await options.authorize('langbai_apply_prompt', { positivePrompt: 'cat' }, options.signal);
    return { content: authorized ? '已应用' : '已取消', reasoning: '', usage: {} };
  });
  const turn = sendAgentMessage({ conversationId: 'studio', text: '应用猫的提示词' });
  await vi.waitFor(() => expect(getAgentPendingPermissions()).toHaveLength(1));
  const request = getAgentPendingPermissions()[0];
  expect(fixture.workspace.conversations[0].status).toBe('waiting-permission');
  expect(authorized).toBeUndefined();
  expect(request.metadata).toMatchObject({ positivePrompt: 'cat', paid: false });
  expect(respondAgentPermission(request.id, 'always').ok).toBe(false);
  expect(respondAgentPermission(request.id, 'once').ok).toBe(true);
  expect((await turn).ok).toBe(true);
  expect(authorized).toBe(true);
  expect(getAgentPendingPermissions()).toEqual([]);
  expect(respondAgentPermission(request.id, 'once').ok).toBe(false);
});

it('stopping during confirmation clears the gate without executing the pending tool', async () => {
  let authorized = false;
  fixture.turn.mockImplementation(async (options) => {
    authorized = await options.authorize('langbai_apply_prompt', { positivePrompt: 'cat' }, options.signal);
    return { content: '', reasoning: '', usage: {} };
  });
  const turn = sendAgentMessage({ conversationId: 'studio', text: '应用提示词' });
  await vi.waitFor(() => expect(getAgentPendingPermissions()).toHaveLength(1));
  const request = getAgentPendingPermissions()[0];
  expect(abortAgentMessage('studio').ok).toBe(true);
  await turn;
  expect(authorized).toBe(false);
  expect(getAgentPendingPermissions()).toEqual([]);
  expect(respondAgentPermission(request.id, 'once').ok).toBe(false);
  expect(fixture.workspace.conversations[0].messages.at(-1).status).toBe('aborted');
});

it('tracks real in-flight Pi turns and stops them without executing pending actions',async()=>{
 fixture.turn.mockImplementation(options=>new Promise(resolve=>{
  options.signal.addEventListener('abort',()=>resolve({content:'',reasoning:'',usage:{}}),{once:true});
 }));
 expect(hasActiveAgentRequests()).toBe(false);
 const turn=sendAgentMessage({conversationId:'studio',text:'整理猫的提示词'});
 await vi.waitFor(()=>expect(hasActiveAgentRequests()).toBe(true));
 stopAgentRuntime();expect(hasActiveAgentRequests()).toBe(false);
 await turn;expect(fixture.workspace.conversations[0].messages.at(-1).status).toBe('aborted');
});

function seedHistory(count = 20) {
  const chat = fixture.workspace.conversations[0];
  chat.messages = Array.from({ length: count }, (_, i) => ({
    id: `old-${i}`, role: i % 2 ? 'assistant' : 'user', content: `record-${i} ` + 'important established detail '.repeat(20),
    status: 'complete', attachments: [], tools: [], createdAt: new Date(1_000 + i * 1_000).toISOString(),
  }));
  fixture.summary.mockResolvedValue({ content: 'Compressed established facts.' });
  fixture.turn.mockResolvedValue({ content: 'Next reply', reasoning: '', usage: {} });
  return chat;
}

it('manual Pi compression keeps history and sends summary plus recent turns, not hidden old content', async () => {
  const chat = seedHistory();
  const before = structuredClone(chat.messages);
  expect((await compactAgentConversation('studio')).ok).toBe(true);
  expect(chat.messages).toEqual(before);
  expect(chat.compactCount).toBe(1);
  expect(chat.lastSummary).toBe('Compressed established facts.');
  expect(chat.context.used).toBeGreaterThan(0);
  expect(fixture.summary.mock.calls[0][0].transcript).toContain('record-0');
  await sendAgentMessage({ conversationId: 'studio', text: 'continue' });
  const prompt = fixture.turn.mock.calls[0][0].prompt;
  expect(prompt.some((m: any) => m.role === 'system' && m.content.includes(chat.lastSummary))).toBe(true);
  expect(JSON.stringify(prompt)).not.toContain('record-0 ');
  expect(JSON.stringify(prompt)).toContain('record-14 ');
  expect(prompt.at(-1).content).toBe('continue');
});

it('auto compacts before the Pi provider turn without consuming draft or deleting old messages', async () => {
  const chat = seedHistory(60);
  const oldIds = chat.messages.map((m: any) => m.id);
  fixture.settings.agentAutoCompact = true;
  expect((await sendAgentMessage({ conversationId: 'studio', text: 'continue' })).ok).toBe(true);
  expect(chat.compactCount).toBe(1);
  expect(chat.messages.slice(0, 60).map((m: any) => m.id)).toEqual(oldIds);
  expect(fixture.turn.mock.calls[0][0].prompt.some((m: any) => m.content === chat.lastSummary)).toBe(true);
});

it('does not silently truncate uncompressed history to forty messages', async () => {
  seedHistory(60);
  await sendAgentMessage({ conversationId: 'studio', text: 'continue' });
  expect(JSON.stringify(fixture.turn.mock.calls[0][0].prompt)).toContain('record-0 ');
});

it('abort during summary never commits fallback or advances the boundary', async () => {
  const chat = seedHistory();
  const before = structuredClone(chat.messages);
  fixture.summary.mockImplementation(({ signal }) => new Promise(resolve => signal.addEventListener('abort', () => resolve({ content: 'late summary' }), { once: true })));
  const pending = compactAgentConversation('studio');
  expect((await compactAgentConversation('studio')).ok).toBe(false);
  expect((await sendAgentMessage({ conversationId: 'studio', text: 'racing' })).ok).toBe(false);
  expect(abortAgentMessage('studio').ok).toBe(true);
  expect((await pending).ok).toBe(false);
  expect(chat.messages).toEqual(before);
  expect(chat.lastSummary).toBeUndefined();
  expect(chat.compactCount).toBe(0);
  expect(chat.status).toBe('idle');
});

it('rejects a stale summary if durable history changes while the provider is pending', async () => {
  const chat = seedHistory();
  let resolve!: (value: any) => void;
  fixture.summary.mockImplementation(() => new Promise(r => { resolve = r; }));
  const pending = compactAgentConversation('studio');
  chat.messages[0].content = 'edited meanwhile';
  resolve({ content: 'stale' });
  expect((await pending).ok).toBe(false);
  expect(chat.messages[0].content).toBe('edited meanwhile');
  expect(chat.compactCount).toBe(0);
});

it('preserves image and uncertain/cancelled paid receipts verbatim in subsequent prompt', async () => {
  const chat = seedHistory();
  chat.messages[8].attachments = [{ id: 'generated', kind: 'image', name: 'image.png' }];
  chat.messages[9].status = 'aborted';
  chat.messages[9].tools = [{ id: 'paid', name: 'langbai_generate_image', status: 'error', output: 'uncertain; do not retry' }];
  const before = structuredClone(chat.messages);
  expect((await compactAgentConversation('studio')).ok).toBe(true);
  expect(chat.messages).toEqual(before);
  await sendAgentMessage({ conversationId: 'studio', text: 'what happened?' });
  const prompt = JSON.stringify(fixture.turn.mock.calls[0][0].prompt);
  expect(prompt).toContain('record-8');
  expect(prompt).toContain('aborted');
  expect(prompt).toContain('uncertain; do not retry');
});

it('empty/error/oversized summary leaves the original history and previous summary intact', async () => {
  const chat = seedHistory();
  chat.lastSummary = 'previous facts';
  const before = structuredClone(chat.messages);
  for (const content of ['', 'x'.repeat(100_001)]) {
    fixture.summary.mockResolvedValue({ content });
    expect((await compactAgentConversation('studio')).ok).toBe(false);
    expect(chat.lastSummary).toBe('previous facts');
    expect(chat.messages).toEqual(before);
  }
  fixture.summary.mockRejectedValue(new Error('fixture unavailable'));
  expect((await compactAgentConversation('studio')).ok).toBe(false);
  expect(chat.compactCount).toBe(0);
});

it('stopped stale compaction cannot clear the lock or status of a replacement turn', async () => {
  const chat = seedHistory();
  let finishSummary!: (value: any) => void;
  let finishTurn!: (value: any) => void;
  fixture.summary.mockImplementation(() => new Promise(r => { finishSummary = r; }));
  const pending = compactAgentConversation('studio');
  stopAgentRuntime();
  fixture.turn.mockImplementation(() => new Promise(r => { finishTurn = r; }));
  const next = sendAgentMessage({ conversationId: 'studio', text: 'new turn' });
  finishSummary({ content: 'late stale summary' });
  expect((await pending).ok).toBe(false);
  expect(chat.status).toBe('running');
  expect(hasActiveAgentRequests()).toBe(true);
  expect(chat.compactCount).toBe(0);
  finishTurn({ content: 'new result', reasoning: '', usage: {} });
  expect((await next).ok).toBe(true);
});

it('auto summary abort does not consume input, mutate history, or start a provider turn', async () => {
  const chat = seedHistory(60);
  const before = structuredClone(chat.messages);
  chat.draftAttachments = [{ id: 'draft', kind: 'image', name: 'draft.png' }];
  fixture.settings.agentAutoCompact = true;
  fixture.summary.mockImplementation(({ signal }) => new Promise(resolve => signal.addEventListener('abort', () => resolve({ content: 'late' }), { once: true })));
  const pending = sendAgentMessage({ conversationId: 'studio', text: 'new request' });
  expect(abortAgentMessage('studio').ok).toBe(true);
  expect((await pending).ok).toBe(false);
  expect(chat.messages).toEqual(before);
  expect(chat.draftAttachments[0].id).toBe('draft');
  expect(chat.compactCount).toBe(0);
  expect(fixture.turn).not.toHaveBeenCalled();
});

it('repeated compaction includes previous summary and only advances after new safe history exists', async () => {
  const chat = seedHistory();
  expect((await compactAgentConversation('studio')).ok).toBe(true);
  expect((await compactAgentConversation('studio')).ok).toBe(true);
  expect(fixture.summary).toHaveBeenCalledTimes(1);
  const last = chat.messages.at(-1);
  chat.messages.push(...Array.from({ length: 8 }, (_, i) => ({ ...last, id: `added-${i}`, content: 'fresh detail '.repeat(30), createdAt: new Date(30_000 + i * 1000).toISOString() })));
  fixture.summary.mockResolvedValue({ content: 'Merged facts.' });
  expect((await compactAgentConversation('studio')).ok).toBe(true);
  expect(fixture.summary.mock.calls[1][0].transcript).toContain('Previous summary:\nCompressed established facts.');
  expect(chat.compactCount).toBe(2);
  expect(chat.messages).toHaveLength(28);
});

it('upserts a lifecycle tool row and never duplicates generated attachments on progress updates', async () => {
  fixture.turn.mockImplementation(async options => {
    const base = { id: 'stable-call', name: 'fixture', title: 'fixture' };
    options.onTool({ ...base, status: 'pending' });
    options.onTool({ ...base, status: 'running' });
    options.onTool({ ...base, status: 'running', generatedImages: [{ id: 'generated', kind: 'image' }] });
    options.onTool({ ...base, status: 'completed', generatedImages: [{ id: 'generated', kind: 'image' }] });
    return { content: 'done', reasoning: '', usage: {} };
  });
  expect((await sendAgentMessage({ conversationId: 'studio', text: 'fixture' })).ok).toBe(true);
  const reply = fixture.workspace.conversations[0].messages.at(-1);
  expect(reply.tools).toHaveLength(1);
  expect(reply.tools[0].status).toBe('completed');
  expect(reply.attachments).toHaveLength(1);
});

it('abort retains completed image receipts and marks in-flight paid records uncertain without deleting them', async () => {
  fixture.turn.mockImplementation(options => new Promise((_resolve, reject) => {
    options.onTool({ id: 'completed', name: 'langbai_generate_image', title: 'fixture', status: 'completed', output: 'saved receipt', generatedImages: [{ id: 'saved-image', kind: 'image' }] });
    options.onTool({ id: 'inflight', name: 'langbai_upscale_image', title: 'fixture', status: 'running', output: 'request submitted' });
    options.onTool({ id: 'waiting', name: 'langbai_apply_prompt', title: 'fixture', status: 'pending' });
    options.signal.addEventListener('abort', () => reject(new Error('fixture aborted')), { once: true });
  }));
  const pending = sendAgentMessage({ conversationId: 'studio', text: 'fixture' });
  expect(abortAgentMessage('studio').ok).toBe(true);
  expect((await pending).ok).toBe(false);
  const chat = fixture.workspace.conversations[0];
  const reply = chat.messages.at(-1);
  expect(reply.status).toBe('aborted'); expect(reply.tools).toHaveLength(3);
  expect(reply.tools[0]).toMatchObject({ status: 'completed', output: 'saved receipt' });
  expect(reply.tools[1]).toMatchObject({ status: 'error', output: 'request submitted' });
  expect(reply.tools[1].error).toContain('勿自动重试');
  expect(reply.tools[2].status).toBe('error'); expect(reply.attachments[0].id).toBe('saved-image');
  fixture.turn.mockResolvedValue({ content: 'review existing receipts', reasoning: '', usage: {} });
  await sendAgentMessage({ conversationId: 'studio', text: 'show results only' });
  const prompt = JSON.stringify(fixture.turn.mock.calls[1][0].prompt);
  expect(prompt).toContain('saved receipt'); expect(prompt).toContain('request submitted'); expect(prompt).toContain('勿自动重试');
});

it('actual post-compaction Pi prompt retains every exact image proposal field, not a summary snapshot label', async () => {
  const chat = seedHistory();
  const proposal = { id: 'exact-image', status: 'error', positivePrompt: 'red coat, 1.25::exact tag::',
    stylePrompt: '0.8::watercolor::', negativePrompt: 'blur', width: 832, height: 1216, count: 1,
    error: 'provider outcome uncertain; do not retry', continuity: { reviewRequired: true, changes: [] } };
  chat.messages[2].imageProposal = structuredClone(proposal);
  const before = structuredClone(chat.messages);
  expect((await compactAgentConversation('studio')).ok).toBe(true);
  expect(chat.messages).toEqual(before);
  expect(fixture.summary.mock.calls[0][0].transcript).not.toContain(proposal.positivePrompt);
  await sendAgentMessage({ conversationId: 'studio', text: 'inspect existing results only' });
  const prompt = fixture.turn.mock.calls[0][0].prompt;
  const protectedMessage = prompt.find((item: any) => item.content.includes(proposal.id));
  expect(protectedMessage.content).toContain(JSON.stringify(proposal));
  expect(prompt.some((item: any) => item.role === 'system' && item.content === chat.lastSummary)).toBe(true);
  expect(JSON.stringify(prompt)).not.toContain('record-0 ');
});
