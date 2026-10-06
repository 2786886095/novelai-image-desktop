import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ root: "" }));
vi.mock("electron", () => ({
  app: { isPackaged: false, getPath: () => fixture.root, getAppPath: () => fixture.root },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
}));
beforeEach(() => { fixture.root = fs.mkdtempSync(path.join(os.tmpdir(), "nai-copy-setting-")); vi.resetModules(); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(fixture.root, { recursive: true, force: true }); });
it("defaults OFF independently of saved-image metadata", async () => {
  const store = await import("./store");
  expect(store.defaultSettings().copyImageMetadata).toBe(false);
  expect(store.getSetting("copyImageMetadata")).toBe(false);
  expect(store.getSetting("keepImageMetadata")).toBe(true);
});
it.each([undefined, null, "true", 1, false])("does not opt in from a legacy/malformed value %s", async value => {
  fs.writeFileSync(path.join(fixture.root, "novelai-image-desktop.json"), JSON.stringify({ settings: { copyImageMetadata: value } }));
  expect((await import("./store")).getSetting("copyImageMetadata")).toBe(false);
});
it("persists ON and OFF across reloads without changing disk metadata policy", async () => {
  let store = await import("./store");
  expect(store.setSetting("copyImageMetadata", true)).toBe(true);
  expect(JSON.parse(fs.readFileSync(path.join(fixture.root, "novelai-image-desktop.json"), "utf8")).settings.copyImageMetadata).toBe(true);
  vi.resetModules(); store = await import("./store");
  expect(store.getSetting("copyImageMetadata")).toBe(true);
  expect(store.getSetting("keepImageMetadata")).toBe(true);
  store.setSetting("copyImageMetadata", false);
  vi.resetModules(); store = await import("./store");
  expect(store.getSetting("copyImageMetadata")).toBe(false);
});
it("rejects non-boolean IPC values and retains committed state", async () => {
  const store = await import("./store"); store.setSetting("copyImageMetadata", true);
  expect(() => store.setSetting("copyImageMetadata", "true" as any)).toThrow("Invalid image metadata copy setting");
  expect(store.getSetting("copyImageMetadata")).toBe(true);
});
