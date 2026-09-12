import { expect, it, vi } from "vitest";
vi.mock("./store", () => ({getSettings:()=>({agentContextWindow:128000,agentAutoCompactThreshold:0.8}), atomicWriteFileSync:vi.fn(),readWithBackupRecoverySync:vi.fn(),rotateBackupsSync:vi.fn()}));
import { createEmptyAgentWorkspace, normalizeAgentWorkspace } from "./agent-store";
import { activeLorebookEntries } from "../../src/tavern/prompt";

it("refreshes old linked worldbooks and preserves switches, custom books, conversation and image defaults", () => {
  const old = createEmptyAgentWorkspace();
  const book = old.lorebooks[0];
  book.entries = book.entries.filter(e => !e.id.startsWith("builtin-moyu-"));
  book.entries[0].enabled = false;
  old.characters[0].visual.stylePrompt = "";
  old.characters[0].visual.negativePrompt = "";
  old.lorebooks.push({...book,id:"user-book",name:"My custom book",entries:[{...book.entries[0],id:"user-rule",content:"preserve me"}]});
  const before = JSON.parse(JSON.stringify(old));
  const updated = normalizeAgentWorkspace(before);
  const builtin = updated.lorebooks.find(b=>b.id===book.id)!;
  expect(builtin.entries.find(e=>e.id==="builtin-moyu-v5-9.7-3")?.enabled).toBe(true);
  expect(builtin.entries.find(e=>e.id===book.entries[0].id)?.enabled).toBe(false);
  expect(updated.lorebooks.find(b=>b.id==="user-book")?.entries[0].content).toBe("preserve me");
  expect(updated.characters[0].visual.stylePrompt).toBe("");
  expect(updated.characters[0].visual.negativePrompt).toBe("");
  expect(updated.conversations.map(c=>c.lorebookIds)).toEqual(old.conversations.map(c=>c.lorebookIds));
  builtin.entries.find(e=>e.id==="builtin-moyu-v5-9.7-3")!.enabled=false;
  const reloaded=normalizeAgentWorkspace(JSON.parse(JSON.stringify(updated)));
  expect(activeLorebookEntries(reloaded.lorebooks,[],"nai-diffusion-5-full").some(x=>x.entry.id==="builtin-moyu-v5-9.7-3")).toBe(false);
  expect(before.lorebooks[0].entries.some((e: {id:string})=>e.id==="builtin-moyu-v5-9.7-3")).toBe(false);
});
