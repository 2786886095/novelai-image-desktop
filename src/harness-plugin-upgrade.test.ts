import {it,expect} from 'vitest';import {readFileSync,existsSync} from 'node:fs';import {resolve} from 'node:path';
const root=process.env.HARNESS_PLUGIN_SOURCE_ROOT||process.cwd();const read=(p:string)=>existsSync(resolve(root,p))?readFileSync(resolve(root,p),'utf8'):'';
it('plans plugin upgrades before downloading the official runtime',()=>{expect(read('electron/ipc/harness-official-runtime.ts')).toContain('planPluginUpgrades(');expect(read('src/HarnessPage.tsx')).toContain('plan.pluginUpdates');});
it('uses the same transactional plugin upgrade for probe and activation',()=>{const s=read('electron/ipc/harness-engine.ts');expect(s.match(/applyPluginUpgrades\(/g)?.length).toBe(2);expect(s).toContain('pluginMigration.rollback()');});
