import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

describe("desktop startup window contract", () => {
  it("creates only the main BrowserWindow, not an extra startup popup", () => {
    expect(source.match(/new BrowserWindow\s*\(/g)).toHaveLength(1);
    expect(source).not.toContain("startupWindow");
  });

  it("keeps the main window hidden until ready, and preserves capture mode", () => {
    expect(source).toMatch(/mainWindow = new BrowserWindow\(\{[\s\S]*?show: false/);
    expect(source).toMatch(/once\("ready-to-show", \(\) => \{\s*if \(!uiCapturePath\) mainWindow\?\.show\(\)/);
  });

  it("retains the startup error dialog rather than leaving a silent process", () => {
    expect(source).toContain('dialog.showErrorBox("启动失败 / Startup failed", String(error))');
    expect(source).toMatch(/\.catch\(\(error: unknown\) => \{[\s\S]*?app.quit\(\)/);
  });
});
