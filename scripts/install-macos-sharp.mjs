// Universal apps need all four locked sharp packages, not just the runner CPU.
// Fetch in isolation: npm install would resolve the whole project again.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const PACKAGES = Object.freeze([
  "@img/sharp-darwin-arm64", "@img/sharp-darwin-x64",
  "@img/sharp-libvips-darwin-arm64", "@img/sharp-libvips-darwin-x64",
]);

export function lockedPackages(lock) {
  return PACKAGES.map((name) => {
    const entry = lock.packages?.[`node_modules/${name}`];
    if (!entry || !/^\d+\.\d+\.\d+$/.test(entry.version ?? "")) throw new Error(`Missing locked package: ${name}`);
    const url = new URL(entry.resolved ?? "", "file:///");
    if (url.protocol !== "https:" || url.hostname !== "registry.npmjs.org" ||
        url.username || url.password || url.search || url.hash ||
        url.pathname !== `/${name}/-/${name.slice(5)}-${entry.version}.tgz`) throw new Error(`Invalid locked tarball URL: ${name}`);
    if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity ?? "")) throw new Error(`Missing SHA512 integrity: ${name}`);
    const cpu = name.endsWith("-arm64") ? "arm64" : "x64";
    if (entry.os?.length !== 1 || entry.os[0] !== "darwin" || entry.cpu?.length !== 1 || entry.cpu[0] !== cpu) {
      throw new Error(`Invalid locked OS/CPU: ${name}`);
    }
    return { ...entry, name };
  });
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error(`Path escapes managed directory: ${child}`);
  }
}

// The locked npm tarballs contain ordinary files only. Fail closed on links,
// extended headers or traversal instead of relying on tar's path sanitization.
export function verifyArchive(tgz, integrity) {
  const actual = `sha512-${crypto.createHash("sha512").update(tgz).digest("base64")}`;
  if (actual !== integrity) throw new Error("Tarball integrity mismatch");
  const tar = gunzipSync(tgz, { maxOutputLength: 128 * 1024 * 1024 });
  const names = new Set();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, size) => header.subarray(start, start + size).toString("utf8").split("\0")[0];
    const prefix = field(345, 155);
    const name = `${prefix ? `${prefix}/` : ""}${field(0, 100)}`;
    const type = field(156, 1);
    const sizeText = field(124, 12).trim();
    const size = /^[0-7]+$/.test(sizeText) ? parseInt(sizeText, 8) : NaN;
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
    if (checksum !== parseInt(field(148, 8).trim(), 8)) throw new Error("Invalid tar header checksum");
    if (!name.startsWith("package/") || name.includes("\\") || name.includes(":") ||
        name.split("/").some((part) => part === ".." || part === ".") ||
        !["", "0", "5"].includes(type) || !Number.isSafeInteger(size) || size < 0 ||
        offset + 512 + Math.ceil(size / 512) * 512 > tar.length || names.has(name)) {
      throw new Error(`Unsafe or unsupported tar entry: ${name}`);
    }
    names.add(name);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!names.has("package/package.json")) throw new Error("Tarball has no package.json");
  return names;
}

function verifyInstalled(directory, entry) {
  const installed = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  if (installed.name !== entry.name || installed.version !== entry.version ||
      installed.os?.length !== 1 || installed.os[0] !== "darwin" ||
      installed.cpu?.length !== 1 || installed.cpu[0] !== entry.cpu[0]) {
    throw new Error(`Package identity/version/OS/CPU mismatch: ${entry.name}`);
  }
  const lib = path.join(directory, "lib");
  const native = entry.name.startsWith("@img/sharp-libvips-")
    ? fs.readdirSync(lib).filter((file) => /^libvips.*\.dylib$/.test(file))
    : [`sharp-darwin-${entry.cpu[0]}-${entry.version}.node`];
  if (!native.length || native.some((file) => !fs.lstatSync(path.join(lib, file)).isFile())) {
    throw new Error(`Missing native payload: ${entry.name}`);
  }
}

function regularDirectory(directory) {
  if (fs.existsSync(directory) && (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink())) {
    throw new Error(`Managed directory is not a real directory: ${directory}`);
  }
  fs.mkdirSync(directory, { recursive: true });
}

export function installMacosSharp({ root = process.cwd(), platform = process.platform,
  run = spawnSync, rename = fs.renameSync, attempts = 2, timeoutMs = 120_000 } = {}) {
  if (platform !== "darwin") throw new Error("macOS packaging helper only");
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3 ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) throw new Error("Invalid fetch bounds");
  const entries = lockedPackages(JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")));
  const modules = path.resolve(root, "node_modules");
  regularDirectory(modules);
  const scope = path.join(modules, "@img");
  regularDirectory(scope);
  // Stages/backups share node_modules' filesystem; rename cannot cross devices.
  const temp = fs.mkdtempSync(path.join(modules, ".mac-sharp-"));
  const records = [];
  let preserveTemp = false;
  try {
    for (const entry of entries) {
      const workspace = path.join(temp, entry.name.slice(5));
      fs.mkdirSync(workspace);
      let result;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        result = run("npm", ["pack", entry.resolved, "--ignore-scripts", "--json", "--pack-destination", workspace], {
          cwd: workspace, encoding: "utf8", timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024,
          env: { ...process.env, npm_config_fetch_retries: "0", npm_config_fetch_timeout: String(Math.min(timeoutMs, 90_000)) },
        });
        if (!result.error && result.status === 0) break;
        console.error(`MAC_SHARP_FETCH_FAILED ${entry.name} attempt=${attempt}/${attempts} status=${result.status} code=${result.error?.code ?? "none"}`);
        if (result.stderr) process.stderr.write(result.stderr);
      }
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`npm pack failed: ${entry.name} (exit ${result.status})`);
      const packed = JSON.parse(result.stdout);
      if (!Array.isArray(packed) || packed.length !== 1 || typeof packed[0].filename !== "string" ||
          packed[0].filename !== path.basename(packed[0].filename) || !packed[0].filename.endsWith(".tgz")) {
        throw new Error(`Invalid npm pack result: ${entry.name}`);
      }
      const archive = path.join(workspace, packed[0].filename);
      inside(workspace, archive);
      if (!fs.lstatSync(archive).isFile()) throw new Error(`Tarball is not a regular file: ${entry.name}`);
      verifyArchive(fs.readFileSync(archive), entry.integrity);
      const stage = path.join(workspace, "stage");
      fs.mkdirSync(stage);
      const unpack = run("tar", ["-xzf", archive, "--strip-components=1", "-C", stage], {
        cwd: workspace, encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024,
      });
      if (unpack.error) throw unpack.error;
      if (unpack.status !== 0) throw new Error(`tar failed: ${entry.name} (exit ${unpack.status}) ${unpack.stderr ?? ""}`);
      verifyInstalled(stage, entry);
      const target = path.join(scope, entry.name.slice(5));
      inside(scope, target);
      if (fs.existsSync(target) && (!fs.lstatSync(target).isDirectory() || fs.lstatSync(target).isSymbolicLink())) {
        throw new Error(`Package target is not a real directory: ${entry.name}`);
      }
      records.push({ entry, stage, target, backup: path.join(workspace, "baseline"), backedUp: false, installed: false });
    }
    // All four stages must pass before any original directory is changed.
    try {
      for (const record of records) {
        if (fs.existsSync(record.target)) { rename(record.target, record.backup); record.backedUp = true; }
        rename(record.stage, record.target);
        record.installed = true;
      }
      for (const record of records) verifyInstalled(record.target, record.entry);
    } catch (error) {
      const failures = [];
      for (const record of records.toReversed()) {
        try {
          if (record.installed) { inside(scope, record.target); fs.rmSync(record.target, { recursive: true, force: true }); }
          if (record.backedUp) rename(record.backup, record.target);
        } catch (restoreError) { failures.push(restoreError); }
      }
      if (failures.length) {
        preserveTemp = true;
        throw new AggregateError([error, ...failures], `Installation/rollback failed; backups retained at ${temp}`);
      }
      throw error;
    }
    console.log("MAC_SHARP_BOTH_ARCHITECTURES_OK");
    return entries.map(({ name, version }) => ({ name, version }));
  } finally {
    if (!preserveTemp) { inside(modules, temp); fs.rmSync(temp, { recursive: true, force: true }); }
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) installMacosSharp();
