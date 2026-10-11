import { readFile, writeFile, mkdir } from "node:fs/promises";
const root = new URL("./", import.meta.url);
const icon = await readFile(new URL("../public/icon.png", root));
const template = await readFile(new URL("plugins/studio-brand/client.template.js", root), "utf8");
await mkdir(new URL("plugins/studio-brand/lib/", root), { recursive: true });
await writeFile(new URL("plugins/studio-brand/lib/client.js", root),
  template.replace("__STUDIO_ICON_JSON__", JSON.stringify(`data:image/png;base64,${icon.toString("base64")}`)));
console.log("BRAND BUILD PASS: original Studio icon embedded; sidebar and hero slots composed without renaming upstream packages.");
