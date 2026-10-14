import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
const f = vi.hoisted(() => ({ root: "", pick: vi.fn(), writes: vi.fn() }));
vi.mock("electron", () => ({ dialog: { showOpenDialog: f.pick }, app: { isPackaged: false, getAppPath: () => path.join(f.root, "app"), getPath: (name: string) => path.join(f.root, name) }, safeStorage: { isEncryptionAvailable: () => false } }));
vi.mock("./agent-workspace-location", () => ({ agentWorkspaceDirectory: () => path.join(f.root, "workspace"), rebaseAgentWorkspaceFile: (p: string) => p }));
vi.mock("./local-media-protocol", () => ({ toLocalMediaUrl: (p: string) => `fixture:${p}` }));
vi.mock("./store", () => ({ getSettings: () => ({ language: "en-US", agentContextWindow: 128000, agentAutoCompactThreshold: .8, outputDir: path.join(f.root, "output") }), getHistoryReferenceItems: () => [], fileExistsWithDirectoryCache: (p: string) => fs.existsSync(p), atomicWriteFileSync: (p: string, value: string) => { f.writes(p, value); fs.writeFileSync(p, value); }, rotateBackupsSync: () => {}, readWithBackupRecoverySync: () => undefined }));
beforeEach(() => { f.root = fs.mkdtempSync(path.join(os.tmpdir(), "qa-system-prompt-import-")); f.pick.mockReset(); f.writes.mockReset(); vi.resetModules(); });
afterEach(() => { if (path.dirname(f.root) !== path.resolve(os.tmpdir()) || !path.basename(f.root).startsWith("qa-system-prompt-import-")) throw Error("Unsafe fixture path"); fs.rmSync(f.root, { recursive: true, force: true }); });
const file = (name: string, body: string | Uint8Array) => { const p = path.join(f.root, name); fs.writeFileSync(p, body); return p; };
it("imports a full Markdown file, selects only the active chat and persists the raw-byte hash", async () => {
  const store = await import("./agent-store");
  const before = store.createAgentConversation("Fixture").workspace;
  const body = "\uFEFF# 完整\r\n Preserve visual evidence.\n";
  const p = file("creative.md", body), inputHash = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  f.pick.mockResolvedValue({ canceled: false, filePaths: [p] });
  const result = await store.importStudioPresetFiles();
  expect(result.ok).toBe(true);
  const preset = result.workspace.samplerPresets.at(-1)!;
  expect(preset).toMatchObject({ name: "creative", systemPrompt: body.slice(1), jailbreakPrompt: "", sourceHash: inputHash });
  expect(result.workspace.conversations.find(c => c.id === before.selectedConversationId)?.studioPresetId).toBe("tavern:" + preset.id);
  // Existing normalization recalculates the context measurement timestamp.
  // Preserve every other field, including the inactive chats' preset choices.
  const stableChats = (workspace: typeof before) => workspace.conversations.filter(c => c.id !== before.selectedConversationId).map(c => ({ ...c, context: c.context ? { ...c.context, updatedAt: "measurement-clock" } : c.context }));
  expect(stableChats(result.workspace)).toEqual(stableChats(before));
  expect(crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex")).toBe(inputHash);
  expect(f.pick.mock.calls[0][0].filters[0].extensions).toEqual(["json", "md", "txt"]);
});
it("deduplicates byte-identical input preserving the entire edited body, sampler and timestamps", async () => {
  const store = await import("./agent-store"), p = file("fixture.json", JSON.stringify({ name: "Original", system_prompt: "Rules", jailbreak_prompt: "Post" }));
  f.pick.mockResolvedValue({ canceled: false, filePaths: [p] });
  const first = await store.importStudioPresetFiles(), preset = first.workspace.samplerPresets.at(-1)!;
  const renamed = first.workspace;
  Object.assign(renamed.samplerPresets.at(-1)!, { name: "User rename", systemPrompt: "USER EDITED SYSTEM", jailbreakPrompt: "USER EDITED POST", temperature: .31, topP: .43, frequencyPenalty: .1, presencePenalty: .2, maxOutputTokens: 3210, stop: ["User stop"], updatedAt: "2001-02-03T04:05:06.000Z" });
  store.writeAgentWorkspace(renamed);
  const edited = store.readAgentWorkspace().samplerPresets.find(item => item.id === preset.id)!;
  const second = await store.importStudioPresetFiles(), duplicate = second.workspace.samplerPresets.find(item => item.id === preset.id)!;
  expect(second.workspace.samplerPresets).toHaveLength(first.workspace.samplerPresets.length);
  expect(duplicate).toEqual(edited);
});
it("does not deduplicate imports against a builtin's source hash", async () => {
  const store = await import("./agent-store"), p = file("fixture.txt", "Different imported text"), workspace = store.readAgentWorkspace();
  const builtin = workspace.samplerPresets.find(item => item.source === "builtin")!;
  builtin.sourceHash = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  store.writeAgentWorkspace(workspace);
  const before = store.readAgentWorkspace(), original = before.samplerPresets.find(item => item.id === builtin.id)!;
  f.pick.mockResolvedValue({ canceled: false, filePaths: [p] });
  const result = await store.importStudioPresetFiles(), imported = result.workspace.samplerPresets.at(-1)!;
  expect(result.ok).toBe(true); expect(result.workspace.samplerPresets).toHaveLength(before.samplerPresets.length + 1);
  expect(imported.id).not.toBe(builtin.id); expect(imported.systemPrompt).toBe("Different imported text");
  expect(result.workspace.samplerPresets.find(item => item.id === builtin.id)).toEqual(original);
});
it.each(["malformed", "empty", "utf8", "system-limit", "postscript-limit", "bytes"])("rejects %s before any write, even when another file in the batch is valid", async kind => {
  const store = await import("./agent-store"), before = store.readAgentWorkspace(), valid = file("valid.txt", "Keep this intact");
  const invalid = kind === "malformed" ? file("bad.json", "{") : kind === "empty" ? file("bad.json", "{}") : kind === "utf8" ? file("bad.txt", new Uint8Array([0xc3, 0x28])) : kind === "system-limit" ? file("bad.md", "x".repeat(200001)) : kind === "postscript-limit" ? file("bad.json", JSON.stringify({ systemPrompt: "Rule", jailbreakPrompt: "x".repeat(100001) })) : file("bad.txt", "x".repeat(2 * 1024 * 1024 + 1));
  f.writes.mockClear(); f.pick.mockResolvedValue({ canceled: false, filePaths: [valid, invalid] });
  expect((await store.importStudioPresetFiles()).ok).toBe(false);
  expect(store.readAgentWorkspace()).toEqual(before);
  expect(f.writes).not.toHaveBeenCalled();
});
it("retains an explicit template off switch and a concurrent streaming result during file selection", async () => {
  const store = await import("./agent-store"), before = store.createAgentConversation("stream").workspace, id = before.selectedConversationId!;
  store.updateAgentConversation(id, chat => { chat.studioTemplateEnabled = false; chat.messages.push({ id: "fixture-message", role: "assistant", content: "before", attachments: [], tools: [], status: "streaming", createdAt: new Date().toISOString() }); });
  let resolve: (v: unknown) => void = () => {};
  f.pick.mockImplementation(() => new Promise(r => { resolve = r; }));
  const pending = store.importStudioPresetFiles();
  store.updateAgentConversation(id, chat => { chat.messages[0].content = "fresh streamed receipt"; });
  resolve({ canceled: false, filePaths: [file("fixture.txt", "Visual rules")] });
  const result = await pending, chat = result.workspace.conversations.find(c => c.id === id)!;
  expect(result.ok).toBe(true); expect(chat.messages[0].content).toBe("fresh streamed receipt"); expect(chat.studioTemplateEnabled).toBe(false);
});
it("cancellation preserves the current selection without writing", async () => {
  const store = await import("./agent-store"), before = store.readAgentWorkspace();
  f.writes.mockClear(); f.pick.mockResolvedValue({ canceled: true, filePaths: [] });
  const result = await store.importStudioPresetFiles();
  expect(result).toMatchObject({ ok: true, cancelled: true, workspace: before });
  expect(f.writes).not.toHaveBeenCalled();
});
