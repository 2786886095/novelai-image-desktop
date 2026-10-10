import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
it.skipIf(process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY)("ends paint capture at visible bounds and cleans up cancellation without breaking pan", () => {
  const electron=createRequire(import.meta.url)("electron") as string;
  const output=fs.mkdtempSync(path.join(os.tmpdir(),"inpaint-pointer-test-"));
  const env: NodeJS.ProcessEnv={...process.env,POINTER_SOURCE:process.cwd(),POINTER_OUTPUT:output};
  delete env.ELECTRON_RUN_AS_NODE;
  const result=spawnSync(electron,[path.resolve("scripts/check-inpaint-pointer.cjs")],{env,encoding:"utf8",timeout:35000,windowsHide:true});
  expect(result.status,result.stdout+result.stderr).toBe(0);
  const report=JSON.parse(result.stdout);expect(report.passed).toBe(13);expect(report.total).toBe(13);
  expect(report.physicalPointerWarpTested).toBe(false);
},35000);

