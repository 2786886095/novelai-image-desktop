import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "./types";

const root = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("release version consistency", () => {
  it("keeps desktop and mobile user-facing versions aligned with package.json", () => {
    const packageVersion = JSON.parse(read("package.json")).version as string;
    const mobileModel = read("mobile/lib/models/nai_models.dart");
    const mobilePubspec = read("mobile/pubspec.yaml");
    const mcpClient = read("electron/ipc/mcp-client.ts");

    expect(APP_VERSION).toBe(packageVersion);
    expect(mobileModel).toContain(`const appVersion = '${packageVersion}';`);
    expect(mobilePubspec).toMatch(
      new RegExp(`^version:\\s+${packageVersion.replaceAll(".", "\\.")}\\+\\d+$`, "m"),
    );
    expect(mcpClient).toContain(`version: "${packageVersion}"`);
  });

  it("derives the desktop display version instead of hard-coding it", () => {
    const desktopVersionSource = read("src/types.ts");

    expect(desktopVersionSource).toContain(
      'import { version as packageVersion } from "../package.json";',
    );
    expect(desktopVersionSource).toContain(
      "export const APP_VERSION = packageVersion;",
    );
  });

  it("uses moving Latest and main entries in all README languages", () => {
    const repo = "https://github.com/OldLi1337/novelai-image-desktop";
    for (const file of ["README.md", "README.en.md", "README.ja.md", "README.ko.md", "README.zh-TW.md"]) {
      const readme = read(file);
      const releaseLinks = readme.match(/https?:\/\/[^\s)\]<>"']+\/releases(?:\/[^\s)\]<>"']*)?/g) ?? [];

      expect(readme, file).not.toContain("gitee.com");
      expect(readme, file).toContain(`${repo}/releases/latest`);
      expect(readme, file).toContain(`${repo}/tree/main`);
      expect(releaseLinks.length, file).toBeGreaterThan(0);
      for (const link of releaseLinks) {
        expect(link, file).toBe(`${repo}/releases/latest`);
      }
      // Dated screenshots and historical facts may retain their real versions.
      expect(readme.split(/\r?\n/).slice(0, 12).join("\n"), file)
        .not.toMatch(/\bv?\d+\.\d+\.\d+\b/i);
      const download = readme.split(/^## /m).find((section) =>
        /^(下载与安装|Installation and updates|インストールと更新|설치 및 업데이트|下載與更新)\r?\n/.test(section));
      expect(download, file).toBeDefined();
      expect(download, file).not.toMatch(/\bv?\d+\.\d+\.\d+\b/i);
    }
  });

  it("uses current-only Latest notes and preserves byte-authentic history separately", () => {
    const repo = "https://github.com/OldLi1337/novelai-image-desktop";
    const releaseNotes = read("docs/RELEASE_NOTES.md");
    const entries = [...releaseNotes.matchAll(/^##\s+.+$/gm)];
    expect(entries.length).toBe(1);
    const first = releaseNotes.slice(entries[0].index);

    expect(entries[0][0]).toMatch(/^## Latest\b/);
    expect(first).toContain(`${repo}/releases/latest`);
    expect(first).toContain(`${repo}/tree/main`);
    expect(first).not.toMatch(/\bv?\d+\.\d+\.\d+\b|\/releases\/(?:tag|download)\/|\/(?:tree|blob|commit)\/[a-f0-9]{7,40}\b/i);
    const history = read("docs/history/RELEASE_NOTES-through-2.5.8.md");
    expect(history).toMatch(/\bv?\d+\.\d+\.\d+\b/);
    expect(history).toContain("2026-10-12");
    expect(releaseNotes).not.toContain("## 2026-10-12");
  });
});
