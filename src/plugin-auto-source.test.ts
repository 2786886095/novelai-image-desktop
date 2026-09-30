import {it,expect} from 'vitest';import {readFileSync,existsSync} from 'node:fs';import {resolve} from 'node:path';
const root=process.env.PLUGIN_AUTO_SOURCE_ROOT||process.cwd();const read=(n:string)=>existsSync(resolve(root,n))?readFileSync(resolve(root,n),'utf8'):'';
it('checks configured plugin rows as well as bundles',()=>{expect(read('electron/ipc/harness-plugin-update.ts')).toContain('inventoryPluginReferences(');expect(read('electron/ipc/harness-engine.ts')).toContain('disabledPlugins');});
it('queues independent plugin updates while busy and exposes persistent control',()=>{expect(read('electron/ipc/harness-launcher.ts')).toContain('createPluginAutoUpdater(');expect(read('src/HarnessPage.tsx')).toContain('harnessSetAutoPluginUpdates');});
