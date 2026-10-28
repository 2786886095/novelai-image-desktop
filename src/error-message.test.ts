import { describe, expect, it } from "vitest";
import { compactRemoteErrorText } from "./error-message";

describe("compactRemoteErrorText", () => {
  it("replaces a Cloudflare 502 HTML document with one bounded message", () => {
    const html = `<!doctype html><html><head><title>Bad gateway</title></head><body>
      <div class="cf-error-details"><h1>Bad gateway</h1><span>Error code 502</span>
      <p>Cloudflare Ray ID: a32d3eee482ea8ad</p></div></body></html>`;
    const message = compactRemoteErrorText(html, {
      status: 502,
      serviceLabel: "NovelAI API 源",
    });

    expect(message).toBe("NovelAI API 源暂时不可用（HTTP 502 Bad Gateway），请稍后重试。");
    expect(message).not.toContain("<html");
    expect(message).not.toContain("Cloudflare Ray ID");
  });

  it("reads nested IPC/Axios payloads and recognizes gateway timeouts", () => {
    const message = compactRemoteErrorText({
      response: {
        status: 504,
        data: "<html><body><h1>Gateway Timeout</h1></body></html>",
      },
    }, { serviceLabel: "NovelAI API 源" });

    expect(message).toContain("HTTP 504 Gateway Timeout");
    expect(message).not.toContain("<");
  });

  it("drops Electron's English wrapper from a rejected IPC call", () => {
    // What ipcRenderer.invoke rejects with when a main-process handler throws.
    const rejected = new Error("Error invoking remote method 'settings:set': Error: 请选择图片保存目录，保存位置不可留空。");
    expect(compactRemoteErrorText(rejected)).toBe("请选择图片保存目录，保存位置不可留空。");
    expect(compactRemoteErrorText(String(rejected))).toBe("请选择图片保存目录，保存位置不可留空。");
    expect(compactRemoteErrorText(rejected.message)).toBe("请选择图片保存目录，保存位置不可留空。");
    expect(compactRemoteErrorText(new Error("Error invoking remote method 'log:selectDir': TypeError: fetch failed")))
      .toBe("TypeError: fetch failed");
    expect(compactRemoteErrorText(new Error("Error invoking remote method 'x': Error: "), { fallback: "操作失败。" })).toBe("操作失败。");
    // Only a leading wrapper is removed.
    expect(compactRemoteErrorText("导出失败：Error invoking remote method 'x': Error: y")).toBe("导出失败：Error invoking remote method 'x': Error: y");
  });

  it("keeps useful plain-text validation errors and caps their length", () => {
    const message = compactRemoteErrorText({ message: `Invalid prompt: ${"x".repeat(600)}` }, { maxLength: 120 });
    expect(message).toMatch(/^Invalid prompt:/);
    expect(message.length).toBeLessThanOrEqual(120);
    expect(message.endsWith("…")).toBe(true);
  });
});
