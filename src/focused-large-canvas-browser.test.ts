import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

it.skipIf(process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY)('renders a preserved 4K canvas with bounded NovelAI focus, legal work and uncapped OpenAI regions', () => {
 const electron=createRequire(import.meta.url)('electron') as string;
 const output=process.env.FOCUSED_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'focused-large-canvas-test-'));
 const env:NodeJS.ProcessEnv={...process.env,FOCUSED_SOURCE:process.env.FOCUSED_SOURCE||process.cwd(),FOCUSED_OUTPUT:output};
 delete env.ELECTRON_RUN_AS_NODE;
 const result=spawnSync(electron,[path.resolve('scripts/check-focused-large-canvas.cjs')],{env,encoding:'utf8',timeout:70000,windowsHide:true});
 fs.writeFileSync(path.join(output,'ELECTRON.stdout.txt'),result.stdout||'');
 fs.writeFileSync(path.join(output,'ELECTRON.stderr.txt'),result.stderr||'');
 fs.writeFileSync(path.join(output,'ELECTRON.exit.json'),JSON.stringify({status:result.status,signal:result.signal,error:result.error?.message??null}));
 expect(result.status,result.stdout+result.stderr).toBe(0);
 const report=JSON.parse(fs.readFileSync(path.join(output,'RESULT.json'),'utf8'));
 expect(report.loadedSourceStable).toBe(true);expect(report.passed).toBe(report.total);expect(report.total).toBe(22);
 expect(report.realChromiumInput).toBe(true);expect(report.realReactCanvas).toBe(true);expect(report.realZustandActions).toBe(true);expect(report.actualAppPanelAST).toBe(true);expect(report.realPaidCalls).toBe(false);
},75000);
