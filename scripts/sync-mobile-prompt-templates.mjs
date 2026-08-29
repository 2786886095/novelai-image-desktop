import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src", "data", "prompt-templates.ts");
const outputPath = path.join(root, "mobile", "assets", "prompt_templates.json");
const source = fs.readFileSync(sourcePath, "utf8");

function extractObject(name) {
  const marker = `export const ${name} = `;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`${name} marker not found`);
  const literalStart = start + marker.length;
  const literalEnd = source.indexOf("\n};", literalStart);
  if (literalEnd < 0) throw new Error(`${name} end not found`);
  const literal = source.slice(literalStart, literalEnd + 2);
  return Function(`"use strict"; return (${literal});`)();
}

function extractTemplate(name) {
  const marker = `export const ${name} = `;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`${name} marker not found`);
  const literalStart = start + marker.length;
  const literalEnd = source.indexOf("`;", literalStart);
  if (literalEnd < 0) throw new Error(`${name} end not found`);
  const literal = source.slice(literalStart, literalEnd + 1);
  return Function(`"use strict"; return (${literal});`)();
}

const reverse = extractObject("REVERSE_SYSTEM_PROMPTS");
const output = {
  reverse,
  convert: extractObject("CONVERT_SYSTEM_PROMPTS"),
  scopedReverse: reverse,
  comic: extractObject("COMIC_ANALYZE_SYSTEM_PROMPTS"),
  comicLegacy: extractTemplate("COMIC_ANALYZE_SYSTEM_PROMPT"),
};

for (const key of ["reverse", "convert", "scopedReverse", "comic"]) {
  for (const mode of ["tags", "natural", "mixed"]) {
    if (typeof output[key]?.[mode] !== "string" || !output[key][mode].trim()) {
      throw new Error(`${key}.${mode} is empty`);
    }
  }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Synced desktop prompt templates to ${outputPath}`);
