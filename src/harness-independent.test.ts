import {it,expect} from 'vitest';import {readFileSync,existsSync} from 'node:fs';import {resolve} from 'node:path';
const root=process.env.HARNESS_INDEPENDENT_SOURCE_ROOT||process.cwd();const read=(p:string)=>existsSync(resolve(root,p))?readFileSync(resolve(root,p),'utf8'):'';
it('official planning uses the registry independently of adapter releases',()=>{
 expect(read('electron/ipc/harness-launcher.ts')).toContain('planOfficialRuntime');
 expect(read('electron/ipc/harness-download-plan.ts')).toContain('return queryOfficial(official)');
});
it('same-component official runtime candidates reach compatibility verification',()=>{
 expect(read('electron/ipc/harness-engine.ts')).toContain("kind==='component'&&active&&!isNewerBundle");
 expect(read('electron/ipc/harness-official-runtime.ts')).toContain('--ignore-scripts');
 expect(read('electron/ipc/harness-official-runtime.ts')).toContain('updateFetch');
});
