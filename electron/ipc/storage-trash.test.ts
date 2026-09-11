import { beforeEach, expect, it, vi } from "vitest";
import path from "node:path";
const mocks = vi.hoisted(() => ({ trash: vi.fn(), remove: vi.fn(), history: vi.fn(), setting: vi.fn() }));
vi.mock("electron", () => ({ shell: { trashItem: mocks.trash }, dialog: {} }));
vi.mock("./store", () => ({ getHistory: mocks.history, getSetting: mocks.setting, removeHistory: mocks.remove }));
import { deleteHistoryItem } from "./storage";
const root = path.resolve("test-output");
beforeEach(() => {
 vi.resetAllMocks();
 mocks.setting.mockReturnValue(root);
 mocks.history.mockReturnValue([{ id: "image", filePath: path.join(root, "image.png") }]);
});
it("moves to the recycle bin before removing the record", async () => {
 mocks.trash.mockImplementation(async () => { expect(mocks.remove).not.toHaveBeenCalled(); });
 expect(await deleteHistoryItem("image")).toEqual({ ok: true });
 expect(mocks.trash).toHaveBeenCalledWith(path.join(root,"image.png"));
 expect(mocks.remove).toHaveBeenCalledWith("image");
});
it("keeps the record when recycling fails", async () => {
 mocks.trash.mockRejectedValue(new Error("Recycle failed"));
 await expect(deleteHistoryItem("image")).rejects.toThrow("Recycle failed");
 expect(mocks.remove).not.toHaveBeenCalled();
});
it("does not recycle images outside the current output directory", async () => {
 mocks.history.mockReturnValue([{ id: "image", filePath: path.resolve("outside.png") }]);
 await expect(deleteHistoryItem("image")).rejects.toThrow("当前输出目录");
 expect(mocks.trash).not.toHaveBeenCalled();
 expect(mocks.remove).not.toHaveBeenCalled();
});
