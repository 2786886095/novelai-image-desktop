import { EventEmitter } from "node:events";
import path from "node:path";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { writeWindowsPngClipboard } from "./windows-png-clipboard";
const fixture = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: fixture.spawn }));
let child: EventEmitter & { stdin: EventEmitter & { end: ReturnType<typeof vi.fn> }; kill: ReturnType<typeof vi.fn> };
beforeEach(() => {
  // The writer is mocked; use the host's absolute syntax even on macOS/Linux CI.
  vi.stubEnv("SystemRoot", path.resolve("fixture-windows-root"));
  fixture.spawn.mockReset();
  child = Object.assign(new EventEmitter(), {
    stdin: Object.assign(new EventEmitter(), { end: vi.fn() }), kill: vi.fn(),
  });
  fixture.spawn.mockReturnValue(child);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
it("passes payload only over stdin, hides the helper and ignores output", async () => {
  const bytes = Buffer.from("private fixture payload");
  const pending = writeWindowsPngClipboard(bytes);
  const [exe, args, options] = fixture.spawn.mock.calls[0];
  expect(path.isAbsolute(exe)).toBe(true);
  expect(args).toContain("-STA"); expect(args).toContain("-NoProfile");
  expect(args.join(" ")).not.toContain(bytes.toString("base64"));
  expect(options).toEqual({ windowsHide: true, stdio: ["pipe", "ignore", "ignore"] });
  expect(child.stdin.end).toHaveBeenCalledExactlyOnceWith(bytes.toString("base64"));
  child.emit("close", 0); await expect(pending).resolves.toBeUndefined();
});
it("returns only a fixed error on native helper failure", async () => {
  const pending = writeWindowsPngClipboard(Buffer.from("fixture"));
  child.emit("error", new Error("private fixture details"));
  await expect(pending).rejects.toThrow("IMAGE_COPY_NATIVE_FAILED");
});
it("does not treat a nonzero exit as successful copy", async () => {
  const pending = writeWindowsPngClipboard(Buffer.from("fixture")); child.emit("close", 1);
  await expect(pending).rejects.toThrow("IMAGE_COPY_NATIVE_FAILED");
});
it("bounds native-helper latency and terminates a hung process", async () => {
  vi.useFakeTimers();
  const pending = writeWindowsPngClipboard(Buffer.from("fixture"));
  const rejected = expect(pending).rejects.toThrow("IMAGE_COPY_NATIVE_FAILED");
  vi.advanceTimersByTime(10000); await rejected;
  expect(child.kill).toHaveBeenCalledOnce();
});
