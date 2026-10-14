import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_METADATA_RECOVERY_MODE,
  loadMetadataRecoveryMode,
  saveMetadataRecoveryMode,
  readImageMetadataForRecovery,
  type MetadataRecoveryMode,
} from "./metadata-recovery";

const calls = vi.hoisted(() => ({ offline: vi.fn(), online: vi.fn() }));
vi.mock("./png-meta", () => ({ parseImageMetaAsync: calls.offline }));
vi.mock("./official-metadata-online", () => ({ parseOfficialImageMetadataOnline: calls.online }));
const buffer = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
const localResult = { Software: "fixture-local", Comment: '{"prompt":"fixture","seed":123}' };
const officialResult = { Software: "fixture-official", Comment: '{"prompt":"fixture","seed":123}' };

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
}
beforeEach(() => {
  calls.offline.mockReset().mockResolvedValue(localResult);
  calls.online.mockReset().mockResolvedValue(officialResult);
});
afterEach(() => vi.unstubAllGlobals());

describe("explicit metadata recovery mode", () => {
  it("defaults to online without a saved preference", () => {
    expect(DEFAULT_METADATA_RECOVERY_MODE).toBe("online");
    expect(loadMetadataRecoveryMode({ getItem: () => null })).toBe("online");
  });
  it.each<MetadataRecoveryMode>(["online", "offline"])("accepts saved %s", (mode) => {
    expect(loadMetadataRecoveryMode({ getItem: () => mode })).toBe(mode);
  });
  it.each(["", "unknown", "OFFLINE", "null", '{"mode":"offline"}'])("invalid stored %s uses online default", (value) => {
    expect(loadMetadataRecoveryMode({ getItem: () => value })).toBe("online");
  });
  it("unreadable storage uses online default without throwing", () => {
    expect(loadMetadataRecoveryMode({ getItem: () => { throw new Error("storage denied"); } })).toBe("online");
  });
  it("missing browser storage uses online default", () => {
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("window", undefined);
    expect(loadMetadataRecoveryMode()).toBe("online");
  });
  it.each<MetadataRecoveryMode>(["online", "offline"])("persists explicit %s and reloads it", (mode) => {
    const storage = memoryStorage();
    expect(saveMetadataRecoveryMode(mode, storage)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(loadMetadataRecoveryMode(storage)).toBe(mode);
  });
  it("storage write failure reports false instead of throwing", () => {
    expect(saveMetadataRecoveryMode("offline", { setItem: () => { throw new Error("read-only storage"); } })).toBe(false);
  });
  it("uses actual default localStorage adapter when available", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { localStorage: storage });
    expect(saveMetadataRecoveryMode("offline")).toBe(true);
    expect(loadMetadataRecoveryMode()).toBe("offline");
  });
  it("offline awaits only the original local reader with the same buffer", async () => {
    await expect(readImageMetadataForRecovery(buffer, "offline")).resolves.toEqual(localResult);
    expect(calls.offline).toHaveBeenCalledExactlyOnceWith(buffer);
    expect(calls.online).not.toHaveBeenCalled();
  });
  it("online awaits only the official parser interface with the same buffer", async () => {
    await expect(readImageMetadataForRecovery(buffer, "online")).resolves.toEqual(officialResult);
    expect(calls.online).toHaveBeenCalledExactlyOnceWith(buffer, undefined);
    expect(calls.offline).not.toHaveBeenCalled();
  });
  it("online failure is not silently converted to offline metadata", async () => {
    const error = new Error("official parser unavailable");
    calls.online.mockRejectedValue(error);
    await expect(readImageMetadataForRecovery(buffer, "online")).rejects.toBe(error);
    expect(calls.offline).not.toHaveBeenCalled();
  });
  it("empty official result is retained without a hidden local fallback", async () => {
    calls.online.mockResolvedValue({});
    await expect(readImageMetadataForRecovery(buffer, "online")).resolves.toEqual({});
    expect(calls.offline).not.toHaveBeenCalled();
  });
  it("offline failure never invokes the online parser", async () => {
    const error = new Error("local decode failure");
    calls.offline.mockRejectedValue(error);
    await expect(readImageMetadataForRecovery(buffer, "offline")).rejects.toBe(error);
    expect(calls.online).not.toHaveBeenCalled();
  });
  it.each<MetadataRecoveryMode>(["online", "offline"])("%s routing does not mutate input bytes", async (mode) => {
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const before = bytes.slice();
    await readImageMetadataForRecovery(bytes.buffer, mode);
    expect(bytes).toEqual(before);
  });
  it.each<MetadataRecoveryMode>(["online", "offline"])("already-aborted %s signal rejects before either reader is called", async (mode) => {
    const controller = new AbortController();
    const reason = new Error("fixture mode-switch cancellation");
    controller.abort(reason);
    await expect(readImageMetadataForRecovery(buffer, mode, controller.signal)).rejects.toBe(reason);
    expect(calls.offline).not.toHaveBeenCalled();
    expect(calls.online).not.toHaveBeenCalled();
  });
  it("passes the live online AbortSignal to the official parser interface", async () => {
    const controller = new AbortController();
    await expect(readImageMetadataForRecovery(buffer, "online", controller.signal)).resolves.toEqual(officialResult);
    expect(calls.online).toHaveBeenCalledExactlyOnceWith(buffer, controller.signal);
    expect(calls.offline).not.toHaveBeenCalled();
  });
});
