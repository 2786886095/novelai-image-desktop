import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "mobile", "assets", "capsule_taxonomy.json");

function evaluateTypeScript(filePath, dependencies = {}) {
  const source = fs.readFileSync(filePath, "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: filePath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const require = (specifier) => {
    if (Object.hasOwn(dependencies, specifier)) return dependencies[specifier];
    throw new Error(`Unsupported sync-script import: ${specifier}`);
  };
  Function("require", "module", "exports", compiled)(require, module, module.exports);
  return module.exports;
}

const capsuleData = evaluateTypeScript(path.join(root, "src", "capsule-data.ts"));
const promptData = evaluateTypeScript(
  path.join(root, "src", "prompt-data.ts"),
  { "./capsule-data": capsuleData },
);
const taxonomy = promptData.CAPSULE_TAXONOMY;

if (!Array.isArray(taxonomy) || taxonomy.length === 0) {
  throw new Error("CAPSULE_TAXONOMY evaluated as an empty value");
}
for (const category of taxonomy) {
  if (!category?.name || !Array.isArray(category.subgroups)) {
    throw new Error("CAPSULE_TAXONOMY contains an invalid category");
  }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(taxonomy, null, 2)}\n`, "utf8");
console.log(`Synced ${taxonomy.length} capsule categories to ${outputPath}`);
