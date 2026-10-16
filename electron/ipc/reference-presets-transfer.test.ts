import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, expect, it } from "vitest";
import { exportReferencePresetsFile, importReferencePresetsFile, listReferencePresets, saveReferencePreset } from "./reference-presets";

const roots: string[] = [];
async function root() { const value = await fs.mkdtemp(path.join(os.tmpdir(), "reference-transfer-")); roots.push(value); return value; }
afterEach(async () => { for (const value of roots.splice(0)) await fs.rm(value, { recursive: true, force: true }); });
it("round trips selected group and exact asset bytes without exposing absolute source paths", async () => {
  const source = await root(), target = await root(), output = path.join(await root(), "selected.nairp");
  const image = Buffer.from("reference-image-exact-bytes");
  await saveReferencePreset({ name: "selected", group: "chosen", kind: "precise", base64: image.toString("base64"), extension: "png", fidelity: 0.6 }, source);
  await saveReferencePreset({ name: "other", group: "other", kind: "vibe", base64: Buffer.from("other").toString("base64") }, source);
  expect(await exportReferencePresetsFile({ group: "chosen" }, output, source)).toMatchObject({ ok: true, count: 1, path: output });
  const zip = await JSZip.loadAsync(await fs.readFile(output));
  const manifestText = await zip.file("manifest.json")!.async("string");
  expect(manifestText).not.toContain(JSON.stringify(source).slice(1,-1));
  const manifest = JSON.parse(manifestText);
  expect(manifest).toMatchObject({ format: "langbai-reference-presets", version: 1, presets: [{ name: "selected", filePath: "", asset: "images/1.png" }] });
  expect(await zip.file("images/1.png")!.async("nodebuffer")).toEqual(image);
  expect(await importReferencePresetsFile(output, target)).toMatchObject({ ok: true, count: 1 });
  const result = await listReferencePresets(target);
  expect(result.presets[0]).toMatchObject({ name: "selected", group: "chosen", kind: "precise", fidelity: 0.6 });
  expect(await fs.readFile(result.presets[0].filePath)).toEqual(image);
});
it("does not create an archive when a group has no presets", async () => {
  const source = await root(), output = path.join(source, "empty.nairp");
  expect(await exportReferencePresetsFile({ group: "absent" }, output, source)).toMatchObject({ ok: false });
  await expect(fs.stat(output)).rejects.toMatchObject({ code: "ENOENT" });
});
it("rejects damaged archives while preserving existing library and image bytes", async () => {
  const target = await root(), bad = path.join(await root(), "bad.nairp");
  const saved = await saveReferencePreset({ name: "keep", kind: "vibe", base64: Buffer.from("keep-exact").toString("base64") }, target);
  const before = await fs.readFile(path.join(target,"reference-presets","library.json"));
  await fs.writeFile(bad,"not an archive");
  expect(await importReferencePresetsFile(bad,target)).toMatchObject({ok:false});
  expect(await fs.readFile(path.join(target,"reference-presets","library.json"))).toEqual(before);
  expect(await fs.readFile(saved.preset!.filePath,"utf8")).toBe("keep-exact");
});
it("ignores unsafe archive asset paths instead of extracting them outside the library", async () => {
  const target = await root(), output = path.join(await root(), "unsafe.nairp");
  const zip = new JSZip();
  zip.file("manifest.json",JSON.stringify({ format:"langbai-reference-presets",version:1,groups:[],presets:[{name:"bad",asset:"images/../../outside.png"}] }));
  zip.file("outside.png","unsafe");
  await fs.writeFile(output,await zip.generateAsync({type:"nodebuffer"}));
  expect(await importReferencePresetsFile(output,target)).toMatchObject({ok:true,count:0});
  expect((await listReferencePresets(target)).presets).toEqual([]);
  await expect(fs.stat(path.join(target,"outside.png"))).rejects.toMatchObject({code:"ENOENT"});
});
