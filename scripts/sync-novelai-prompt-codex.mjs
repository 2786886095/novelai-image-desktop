import { cp, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { gunzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoSkill = join(root, "skills", "novelai-prompt-codex");

const fullCodex = join(root, "public", "prompt-codex.json.gz");
const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), ".codex");
const personalSkill = join(codexHome, "skills", "novelai-prompt-codex");

await mkdir(personalSkill, { recursive: true });
await cp(repoSkill, personalSkill, { recursive: true, force: true });
await mkdir(join(personalSkill, "references"), { recursive: true });
await writeFile(
  join(personalSkill, "references", "prompt-codex.json"),
  gunzipSync(await readFile(fullCodex)),
);

console.log(`Installed personal skill: ${personalSkill}`);
