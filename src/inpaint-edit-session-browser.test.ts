import { expect,it } from 'vitest';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
it.skipIf(process.platform==='linux'&&!process.env.DISPLAY&&!process.env.WAYLAND_DISPLAY)('returns successful inpaint to its original editable image/mask/ROI without losing history, including safe failures',()=>{
 const output=process.env.EDIT_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'inpaint-edit-session-test-')),electron=createRequire(import.meta.url)('electron') as string;
 const env:NodeJS.ProcessEnv={...process.env,EDIT_SOURCE:process.env.EDIT_SOURCE||process.cwd(),EDIT_OUTPUT:output};delete env.ELECTRON_RUN_AS_NODE;
 const r=spawnSync(electron,[path.resolve('scripts/check-inpaint-edit-session.cjs')],{env,encoding:'utf8',timeout:75000,windowsHide:true});
 fs.writeFileSync(path.join(output,'ELECTRON.stdout.txt'),r.stdout||'');fs.writeFileSync(path.join(output,'ELECTRON.stderr.txt'),r.stderr||'');fs.writeFileSync(path.join(output,'ELECTRON.exit.json'),JSON.stringify({status:r.status,signal:r.signal,error:r.error?.message??null}));
 expect(r.status,r.stdout+r.stderr).toBe(0);const report=JSON.parse(fs.readFileSync(path.join(output,'RESULT.json'),'utf8'));expect(report.total).toBe(15);expect(report.passed).toBe(15);expect(report.loadedSourceStable).toBe(true);expect(report.realRestoreHelper).toBe(true);expect(report.realReactCanvas).toBe(true);expect(report.realChromiumInput).toBe(true);expect(report.paidProviderCalls).toBe(0);
},80000);
