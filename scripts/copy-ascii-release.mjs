import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const releaseDir = path.resolve(projectRoot, "release");
const files = await fs.readdir(releaseDir);
const candidates = await Promise.all(
  files
    .filter((name) =>
      /^Langbai-NovelAI-Studio-.+\.exe$/i.test(name) ||
      /^NovelAI-Image-Desktop-.+\.exe$/i.test(name) ||
      /^NovelAI.+\.exe$/i.test(name),
    )
    .filter((name) => name !== "NovelAI-Image-Desktop.exe" && name !== "Langbai-NovelAI-Studio.exe")
    .map(async (name) => ({
      name,
      mtimeMs: (await fs.stat(path.join(releaseDir, name))).mtimeMs,
    })),
);
const portable = candidates.sort((a, b) => a.mtimeMs - b.mtimeMs).at(-1)?.name;

if (!portable) {
  throw new Error("Portable exe was not found in release directory.");
}

const source = path.join(releaseDir, portable);
const target = path.join(releaseDir, "Langbai-NovelAI-Studio.exe");
const legacyTarget = path.join(releaseDir, "NovelAI-Image-Desktop.exe");

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastError;
for (let attempt = 1; attempt <= 10; attempt += 1) {
  try {
    await fs.rm(target, { force: true });
    await fs.copyFile(source, target);
    await fs.rm(legacyTarget, { force: true });
    await fs.copyFile(source, legacyTarget);
    lastError = undefined;
    break;
  } catch (err) {
    lastError = err;
    await wait(1000);
  }
}

if (lastError) {
  throw new Error(
    `Failed to create release/Langbai-NovelAI-Studio.exe. Close the running app and retry: ${
      lastError.message || lastError
    }`,
  );
}

console.log("Created release/Langbai-NovelAI-Studio.exe and legacy NovelAI-Image-Desktop.exe.");
