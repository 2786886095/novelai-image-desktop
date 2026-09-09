import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ api: {} as Record<string, (...args: any[]) => any>, invoke: vi.fn() }));
vi.mock("electron", () => ({ contextBridge: { exposeInMainWorld: (_name: string, api: typeof mock.api) => { mock.api = api; } }, ipcRenderer: { invoke: mock.invoke }, webUtils: {} }));
beforeEach(async () => { vi.resetModules(); mock.invoke.mockReset(); await import("./preload"); });

it.each([
  ["exportAgentAttachment", ["conversation", "message", "image"], "agent:exportAttachment"],
  ["downloadOnlineGalleryImages", [{ source: "aitag", itemId: "1", images: [{ id: "a", url: "https://example.test/a.webp" }] }], "online-gallery:download-images"],
  ["exportHistoryGroup", ["group"], "storage:exportGroup"],
  ["exportFiles", [[{ filePath: "a.png" }], "images"], "storage:exportFiles"],
])("announces actual bridge operation %s", async (method, args, channel) => {
  const events = vi.fn(); mock.api.onImageSaveFeedback(events);
  mock.invoke.mockResolvedValue({ ok: true, filePath: "D:/Saved/a.webp" });
  const promise = mock.api[method as string](...args as any[]);
  expect(events.mock.lastCall?.[0][0].state).toBe("pending");
  await promise;
  expect(mock.invoke).toHaveBeenCalledWith(channel, ...args as any[]);
  expect(events.mock.lastCall?.[0][0]).toMatchObject({ state: "success", path: "D:/Saved/a.webp" });
});
