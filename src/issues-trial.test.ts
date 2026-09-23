import {it,expect} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {copyStylePromptPreviewImages,reconcileStylePromptPreviewImages} from "../electron/ipc/style-preset-images";
it("persists nine style previews across a reload and caps overflow",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"issue23-"));
 try {const source=path.join(root,"input.png");fs.writeFileSync(source,"fixture");
 expect(copyStylePromptPreviewImages(Array(12).fill(source),"fixture",12,root)).toHaveLength(9);
 expect(reconcileStylePromptPreviewImages("fixture",[],root)).toHaveLength(9);
 expect(copyStylePromptPreviewImages([source],"fixture",1,root)).toHaveLength(0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
it("exposes image copying from the native context menu",()=>{
 expect(fs.readFileSync("electron/main.ts","utf8")).toContain("copyImageAt");
});
it("does not await network proxy discovery before creating the window",()=>{
 const startup=fs.readFileSync("electron/main.ts","utf8").split("app.whenReady().then")[1];
 expect(startup).not.toContain("await refreshSystemProxy()");
});
