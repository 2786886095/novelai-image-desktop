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
});
