import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { compactRemoteErrorText, errorText } from "./error-message";

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

describe("errorText", () => {
  it("shows a rejected IPC call as the handler's own message", () => {
    const rejected = new Error("Error invoking remote method 'dataBackup:activateRecovery': Error: 请先停止目标画风自动迭代（Artist Detective），再备份或恢复画风结果。");
    expect(errorText(rejected)).toBe("请先停止目标画风自动迭代（Artist Detective），再备份或恢复画风结果。");
    expect(errorText(String(rejected))).toBe("请先停止目标画风自动迭代（Artist Detective），再备份或恢复画风结果。");
    expect(errorText(new Error("Error invoking remote method 'x': TypeError: fetch failed"))).toBe("TypeError: fetch failed");
  });

  it("keeps an ordinary message as it is, without String()'s error name", () => {
    expect(errorText(new Error("词库文件超过 5 MB。"))).toBe("词库文件超过 5 MB。");
    expect(errorText(new TypeError("Failed to fetch"))).toBe("Failed to fetch");
    expect(errorText("保存失败")).toBe("保存失败");
    expect(errorText({ message: "读取失败" })).toBe("读取失败");
    // Only a leading wrapper is removed; line breaks inside the message stay.
    expect(errorText(new Error("导入失败：Error invoking remote method 'x': Error: y"))).toBe("导入失败：Error invoking remote method 'x': Error: y");
    expect(errorText(new Error("第一行\n第二行"))).toBe("第一行\n第二行");
  });

  it("falls back when there is nothing to show", () => {
    expect(errorText(new Error(""))).toBe("操作失败。");
    expect(errorText(new Error("Error invoking remote method 'x': Error: "))).toBe("操作失败。");
    expect(errorText(undefined)).toBe("操作失败。");
    expect(errorText(null, "读取设置失败，请重试。")).toBe("读取设置失败，请重试。");
    expect(errorText("  ", "TRANSLATION_FAILED")).toBe("TRANSLATION_FAILED");
  });
});

it("UI code shows caught errors through errorText", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) files.push(file);
    }
  };
  walk("src");
  // Showing e.message or String(e) directly would bring back "Error invoking remote method ...".
  const raw = /set(?:Error|Message|Toast|LocalError)\(\s*(?:String\(\s*(?:e|err|error|reason)\s*\)|(?:e|err|error|reason) instanceof Error\s*\?\s*\w+\.message)/;
  expect(files.filter((file) => raw.test(fs.readFileSync(file, "utf8")))).toEqual([]);
});
