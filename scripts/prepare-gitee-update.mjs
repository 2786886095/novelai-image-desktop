import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

// Keep each mainland attachment small enough to upload reliably across the
// GitHub-runner → Gitee route. Even 24 MiB parts can stall at Gitee's ingress,
// so use smaller chunks and verify every completed remote attachment.
const PART_SIZE_MIB = 8;
const PART_SIZE = PART_SIZE_MIB * 1024 * 1024;

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
  // Include the chunk scheme in the filename. This keeps retries idempotent
  // without confusing an older release attachment produced with 24 MiB parts.
  const name = `${basename(setup)}.gitee-part${String(PART_SIZE_MIB).padStart(2, "0")}m-${String(index).padStart(3, "0")}`;
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
