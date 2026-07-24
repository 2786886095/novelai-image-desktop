import { cp, copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoSkill = join(root, "skills", "novelai-prompt-codex");
const guidance = join(repoSkill, "references", "guidance.json");
const fullCodex = join(root, "src", "data", "prompt-codex.json");
const mobileGuidance = join(
  root,
  "mobile",
  "assets",
  "prompt_codex_guidance.json",
);
const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), ".codex");
const personalSkill = join(codexHome, "skills", "novelai-prompt-codex");

await mkdir(dirname(mobileGuidance), { recursive: true });
await copyFile(guidance, mobileGuidance);

await mkdir(personalSkill, { recursive: true });
await cp(repoSkill, personalSkill, { recursive: true, force: true });
await mkdir(join(personalSkill, "references"), { recursive: true });
await copyFile(
  fullCodex,
  join(personalSkill, "references", "prompt-codex.json"),
);

console.log(`Synced mobile guidance: ${mobileGuidance}`);
console.log(`Installed personal skill: ${personalSkill}`);
