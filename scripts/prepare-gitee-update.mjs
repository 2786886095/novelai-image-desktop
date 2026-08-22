import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

// Keep each mainland attachment small enough to upload reliably across the
// GitHub-runner → Gitee route. The former 90 MB parts routinely exceeded the
// three-minute request timeout even though they were below Gitee's hard limit.
const PART_SIZE = 24 * 1024 * 1024;

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

async function sha512(path) {
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("base64");
}

const setupArg = argument("setup");
const outputArg = argument("output");
const version = argument("version").replace(/^v/, "");
if (!setupArg || !outputArg || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) {
  throw new Error("Usage: node prepare-gitee-update.mjs --setup <Setup.exe> --output <dir> --version <x.y.z>");
}
const setup = resolve(setupArg);
const output = resolve(outputArg);

const setupInfo = await stat(setup);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const parts = [];
let offset = 0;
let index = 1;
while (offset < setupInfo.size) {
  const length = Math.min(PART_SIZE, setupInfo.size - offset);
  const name = `${basename(setup)}.part${String(index).padStart(2, "0")}`;
  const path = join(output, name);
  await pipeline(
    createReadStream(setup, { start: offset, end: offset + length - 1 }),
    createWriteStream(path),
  );
  parts.push({ name, size: length, sha512: await sha512(path) });
  offset += length;
  index += 1;
}

const manifest = {
  schemaVersion: 1,
  version,
  filename: basename(setup),
  size: setupInfo.size,
  sha512: await sha512(setup),
  parts,
};
await writeFile(join(output, "gitee-update.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Prepared ${parts.length} Gitee part(s) for ${basename(setup)} (${setupInfo.size} bytes).`);
