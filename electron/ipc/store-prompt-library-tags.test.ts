import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ root: "" }));
vi.mock("electron", () => ({
  app: { isPackaged: false, getPath: () => fixture.root, getAppPath: () => fixture.root },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
}));
beforeEach(() => { fixture.root = fs.mkdtempSync(path.join(os.tmpdir(), "nai-prompt-tags-")); vi.resetModules(); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(fixture.root, { recursive: true, force: true }); });

it("keeps saved-prompt tags across reloads and leaves untagged entries unchanged", async () => {
  fs.writeFileSync(path.join(fixture.root, "novelai-image-desktop.json"), JSON.stringify({ settings: {
    positivePromptPresets: [
      { id: "p1", name: "Night", prompt: "night", tags: [" 夜景 ", "#夜景", "City"], createdAt: "2026-10-01T00:00:00.000Z" },
      { id: "p2", name: "Plain", prompt: "plain", createdAt: "2026-10-01T00:00:00.000Z" },
    ],
    promptChunks: [
      { id: "c1", name: "Outfit", content: "white dress", tags: "服装, 角色", createdAt: "x", updatedAt: "y" },
      { id: "c2", name: "Plain", content: "smile", tags: [], createdAt: "x", updatedAt: "y" },
    ],
    negativePromptPresets: [{ id: "n1", name: "Hands", prompt: "bad hands", tags: ["手部"], createdAt: "x" }],
  } }));
  const store = await import("./store");
  const settings = store.getSettings();
  expect(settings.positivePromptPresets.map((preset) => preset.tags)).toEqual([["夜景", "City"], undefined]);
  expect(Object.keys(settings.positivePromptPresets[1])).not.toContain("tags");
  expect(settings.promptChunks.map((chunk) => chunk.tags)).toEqual([["服装", "角色"], undefined]);
  expect(settings.negativePromptPresets[0].tags).toEqual(["手部"]);

  store.setSetting("promptChunks", [...settings.promptChunks, { id: "c3", name: "New", content: "hat", tags: ["配饰"], createdAt: "x", updatedAt: "y" }]);
  store.setSetting("negativePromptPresets", [{ ...settings.negativePromptPresets[0], tags: ["手部", "质量"] }]);
  vi.resetModules();
  const reloaded = (await import("./store")).getSettings();
  expect(reloaded.promptChunks.find((chunk) => chunk.id === "c3")?.tags).toEqual(["配饰"]);
  expect(reloaded.negativePromptPresets[0].tags).toEqual(["手部", "质量"]);
});
