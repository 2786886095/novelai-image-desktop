import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const releaseDir = path.resolve(projectRoot, "release");
const unpackedDirs = [
  path.resolve(releaseDir, "win-unpacked"),
  path.resolve(releaseDir, "win-unpacked.tmp"),
];

for (const target of unpackedDirs) {
  if (!target.startsWith(projectRoot + path.sep)) {
    throw new Error(`Refusing to remove unexpected path: ${target}`);
  }
}

for (const target of unpackedDirs) {
  try {
    await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch (err) {
    console.warn(`Cleanup failed: ${target}`);
    console.warn(err instanceof Error ? err.message : String(err));
  }
}

console.log("Cleaned release/win-unpacked and release/win-unpacked.tmp.");
