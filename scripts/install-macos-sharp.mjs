// Universal apps keep sharp's two architecture-named packages side by side.
// Install BOTH from the lockfile, rather than npm's runner-architecture subset.
import fs from "node:fs";
import { spawnSync } from "node:child_process";

if (process.platform !== "darwin") throw new Error("macOS packaging helper only");
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const packages = [
  "@img/sharp-darwin-arm64", "@img/sharp-darwin-x64",
  "@img/sharp-libvips-darwin-arm64", "@img/sharp-libvips-darwin-x64",
];
const specs = packages.map((name) => {
  const version = lock.packages[`node_modules/${name}`]?.version;
  if (!version || !/^\d+\.\d+\.\d+/.test(version)) throw new Error(`Missing locked package: ${name}`);
  return `${name}@${version}`;
});
const result = spawnSync("npm", ["install", "--no-save", "--package-lock=false", "--force", ...specs], {
  stdio: "inherit", timeout: 300_000,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
for (const name of packages) {
  const installed = JSON.parse(fs.readFileSync(`node_modules/${name}/package.json`, "utf8"));
  if (installed.version !== lock.packages[`node_modules/${name}`].version) throw new Error(`Version mismatch: ${name}`);
}
console.log("MAC_SHARP_BOTH_ARCHITECTURES_OK");
