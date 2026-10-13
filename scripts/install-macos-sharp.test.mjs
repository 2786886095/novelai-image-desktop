import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { PACKAGES, lockedPackages, verifyArchive, installMacosSharp } from "./install-macos-sharp.mjs";

function tarball(files) {
  const chunks = [];
  for (const [name, payload, type = "0"] of files) {
    const body = Buffer.from(payload);
    const header = Buffer.alloc(512);
    const field = (value, offset, size) => header.write(value, offset, size, "ascii");
    field(name, 0, 100);
    field("0000644\0", 100, 8); field("0000000\0", 108, 8); field("0000000\0", 116, 8);
    field(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12);
    field("00000000000\0", 136, 12); field("        ", 148, 8);
    field(type, 156, 1); field("ustar\0", 257, 6); field("00", 263, 2);
    field(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0")}\0 `, 148, 8);
    chunks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}
const sri = (bytes) => `sha512-${crypto.createHash("sha512").update(bytes).digest("base64")}`;

function fixture(t, alter = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mac-sharp-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lock = { packages: {} };
  const archives = new Map();
  for (const name of PACKAGES) {
    const cpu = name.endsWith("-arm64") ? "arm64" : "x64";
    const version = name.includes("libvips") ? "1.3.3" : "0.35.4";
    const pkg = { name, version, os: ["darwin"], cpu: [cpu] };
    const files = [["package/package.json", JSON.stringify(pkg)],
      [name.includes("libvips") ? "package/lib/libvips-cpp.8.18.6.dylib" : `package/lib/sharp-darwin-${cpu}-${version}.node`, "fixture-native-payload"]];
    alter({ name, pkg, files });
    files[0][1] = JSON.stringify(pkg);
    const bytes = tarball(files);
    const resolved = `https://registry.npmjs.org/${name}/-/${name.slice(5)}-${version}.tgz`;
    lock.packages[`node_modules/${name}`] = { version, resolved, integrity: sri(bytes), os: ["darwin"], cpu: [cpu] };
    archives.set(resolved, bytes);
    const target = path.join(root, "node_modules", name);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "old.txt"), `baseline:${name}`);
  }
  fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify(lock));
  fs.writeFileSync(path.join(root, "package.json"), '{"fixture":true}\n');
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    if (command === "npm") {
      assert.equal(args[0], "pack", "old whole-project npm install is forbidden");
      assert.ok(args.includes("--ignore-scripts")); assert.ok(args.includes("--json"));
      assert.equal(options.cwd, args.at(-1)); assert.notEqual(options.cwd, root);
      const filename = args[1].split("/").at(-1);
      fs.writeFileSync(path.join(options.cwd, filename), archives.get(args[1]));
      return { status: 0, stdout: JSON.stringify([{ filename }]), stderr: "" };
    }
    assert.equal(command, "tar");
    return spawnSync(command, args, options);
  };
  const unchanged = () => {
    for (const name of PACKAGES) assert.equal(fs.readFileSync(path.join(root, "node_modules", name, "old.txt"), "utf8"), `baseline:${name}`);
    assert.deepEqual(fs.readdirSync(path.join(root, "node_modules")).sort(), ["@img"]);
  };
  return { root, lock, archives, calls, run, unchanged };
}

test("four locked tarballs replace all four packages, never npm install", (t) => {
  const f = fixture(t);
  const lockBefore = fs.readFileSync(path.join(f.root, "package-lock.json"));
  const manifestBefore = fs.readFileSync(path.join(f.root, "package.json"));
  assert.equal(installMacosSharp({ root: f.root, platform: "darwin", run: f.run }).length, 4);
  assert.equal(f.calls.filter(({ command }) => command === "npm").length, 4);
  assert.equal(f.calls.filter(({ command }) => command === "tar").length, 4);
  for (const name of PACKAGES) {
    const directory = path.join(f.root, "node_modules", name);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "package.json"))).name, name);
    assert.equal(fs.existsSync(path.join(directory, "old.txt")), false);
  }
  assert.deepEqual(fs.readFileSync(path.join(f.root, "package-lock.json")), lockBefore);
  assert.deepEqual(fs.readFileSync(path.join(f.root, "package.json")), manifestBefore);
  assert.deepEqual(fs.readdirSync(path.join(f.root, "node_modules")).sort(), ["@img"]);
});

test("non-macOS guard rejects before filesystem/subprocess work", () => {
  assert.throws(() => installMacosSharp({ root: "does-not-exist", platform: "win32", run: () => assert.fail("must not execute") }), /macOS packaging helper only/);
});

test("missing lock/SRI and unlocked registry URL are rejected", (t) => {
  const f = fixture(t);
  for (const [key, bad] of [["integrity", ""], ["resolved", "https://example.com/package.tgz"], ["version", "latest"], ["cpu", ["x64"]]]) {
    const changed = structuredClone(f.lock);
    changed.packages[`node_modules/${PACKAGES[0]}`][key] = bad;
    assert.throws(() => lockedPackages(changed));
  }
  assert.throws(() => lockedPackages({ packages: {} }), /Missing locked package/);
});

test("pack success cannot override corrupt actual archive integrity", (t) => {
  const f = fixture(t);
  const last = f.lock.packages[`node_modules/${PACKAGES.at(-1)}`];
  f.archives.set(last.resolved, Buffer.from("corrupt"));
  assert.throws(() => installMacosSharp({ root: f.root, platform: "darwin", run: f.run }), /integrity mismatch/);
  f.unchanged();
});

for (const key of ["name", "version", "os", "cpu"]) {
  test(`wrong staged ${key} rejected before original replacement`, (t) => {
    const f = fixture(t, ({ name, pkg }) => { if (name === PACKAGES.at(-1)) pkg[key] = Array.isArray(pkg[key]) ? ["wrong"] : "wrong"; });
    assert.throws(() => installMacosSharp({ root: f.root, platform: "darwin", run: f.run }), /identity\/version\/OS\/CPU mismatch/);
    f.unchanged();
  });
}

test("missing native payload is not a complete package", (t) => {
  const f = fixture(t, ({ name, files }) => { if (name === PACKAGES.at(-1)) files[1][0] = "package/lib/README.txt"; });
  assert.throws(() => installMacosSharp({ root: f.root, platform: "darwin", run: f.run }), /Missing native payload/);
  f.unchanged();
});

test("tar traversal, absolute paths, links and extended headers rejected", () => {
  for (const [name, type] of [["package/../../escape", "0"], ["/absolute", "0"], ["package/lib/link", "2"], ["package/lib/hard", "1"], ["package/pax", "x"], ["package\\escape", "0"]]) {
    const bytes = tarball([["package/package.json", "{}"], [name, "", type]]);
    assert.throws(() => verifyArchive(bytes, sri(bytes)), /Unsafe or unsupported tar entry/);
  }
});

test("bounded fetch failure/timeout are fatal and preserve originals", (t) => {
  for (const result of [{ status: 1, stderr: "fixture pack failure\n" }, { status: null, error: Object.assign(new Error("fixture timeout"), { code: "ETIMEDOUT" }) }]) {
    const f = fixture(t);
    let count = 0;
    assert.throws(() => installMacosSharp({ root: f.root, platform: "darwin", attempts: 2, timeoutMs: 100, run: () => { count++; return result; } }));
    assert.equal(count, 2); f.unchanged();
  }
});

test("one transient failure retries the same locked URL", (t) => {
  const f = fixture(t);
  let count = 0;
  const run = (...args) => ++count === 1 ? { status: 1, stderr: "fixture retry\n" } : f.run(...args);
  assert.equal(installMacosSharp({ root: f.root, platform: "darwin", run }).length, 4);
  assert.equal(count, 9);
});

test("failed extraction preserves every original package", (t) => {
  const f = fixture(t);
  const run = (command, ...args) => command === "tar" ? { status: 2, stderr: "fixture tar failure" } : f.run(command, ...args);
  assert.throws(() => installMacosSharp({ root: f.root, platform: "darwin", run }), /tar failed/);
  f.unchanged();
});

test("partial replacement failure rolls back every original package", (t) => {
  const f = fixture(t);
  let stages = 0;
  const rename = (from, to) => {
    if (path.basename(from) === "stage" && ++stages === 3) throw new Error("fixture rename failure");
    fs.renameSync(from, to);
  };
  assert.throws(() => installMacosSharp({ root: f.root, platform: "darwin", run: f.run, rename }), /fixture rename failure/);
  f.unchanged();
});

test("symlinked target is refused, never followed or overwritten", (t) => {
  const f = fixture(t);
  const target = path.join(f.root, "node_modules", PACKAGES[0]);
  const external = path.join(f.root, "external");
  fs.mkdirSync(external); fs.writeFileSync(path.join(external, "keep.txt"), "untouched");
  fs.rmSync(target, { recursive: true }); fs.symlinkSync(external, target, "junction");
  assert.throws(() => installMacosSharp({ root: f.root, platform: "darwin", run: f.run }), /not a real directory/);
  assert.equal(fs.readFileSync(path.join(external, "keep.txt"), "utf8"), "untouched");
});
