import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.env.REFERENCE_ASSET_ROOT || "D:/Downloads/26.08.21二游角色正面图");
const out = path.resolve(process.env.REFERENCE_CATALOG_OUT || "public/reference-catalog/index.json");
const sizes = ["1024x1536", "1472x1472", "1536x1024"];
const languages = ["zh-CN", "zh-TW", "ja-JP", "ko-KR", "en-US"];
const imageRe = /\.(png|jpe?g|webp)$/i;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else if (entry.isFile()) files.push(file);
  }
  return files;
}

function categoryFor(parent) {
  if (parent.includes("游戏内角色图")) return "游戏内角色图";
  if (parent.includes("角色立绘")) return "角色立绘";
  return "角色资源";
}

function parseRole(file) {
  const stem = path.basename(file).replace(/\.(png|jpe?g|webp)$/i, "");
  return stem.replace(/__(1024x1536|1472x1472|1536x1024)$/i, "").trim();
}

const files = await walk(root);
const precise = files.filter((file) => {
  const name = path.basename(file);
  return imageRe.test(name) && path.basename(path.dirname(file)) === "NovelAI精准参考";
});
const grouped = new Map();
for (const file of precise) {
  const rel = path.relative(root, file).replaceAll(path.sep, "/");
  const parts = rel.split("/");
  const game = parts[0];
  const category = categoryFor(rel);
  const roleId = parseRole(file);
  const size = sizes.find((value) => path.basename(file).includes(`__${value}.`));
  if (!size) continue;
  const key = `${game}\0${category}\0${roleId}`;
  const current = grouped.get(key);
  const rank = sizes.indexOf(size);
  if (!current || rank < current.rank) grouped.set(key, { file, rel, game, category, roleId, size, rank });
}

const selected = [...grouped.values()].sort((a, b) => `${a.game}/${a.category}/${a.roleId}`.localeCompare(`${b.game}/${b.category}/${b.roleId}`, "zh-CN"));
const assets = [];
for (let index = 0; index < selected.length; index += 1) {
  const item = selected[index];
  const stat = await fs.stat(item.file);
  assets.push({
    id: `${item.game}/${item.category}/${item.roleId}`,
    game: item.game,
    category: item.category,
    roleId: item.roleId,
    names: Object.fromEntries(languages.map((language) => [language, item.roleId])),
    variant: item.roleId,
    width: Number(item.size.split("x")[0]),
    height: Number(item.size.split("x")[1]),
    bytes: stat.size,
    downloadUrl: `assets/${item.rel}`,
    storagePath: item.rel,
    source: "local verified precise-reference catalog",
    order: index,
  });
}

await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, JSON.stringify({ schema: "langbai-reference-catalog/v1", generatedAt: new Date().toISOString(), provider: "Langbai NovelAI Studio", assets }, null, 2), "utf8");
console.log(JSON.stringify({ root, output: out, sourcePreciseFiles: precise.length, uniqueAssets: assets.length, duplicateSizesCollapsed: precise.length - assets.length }));
