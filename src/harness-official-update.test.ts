import {it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';import {resolve} from 'node:path';
const root=process.env.HARNESS_UPDATE_SOURCE_ROOT||process.cwd();
const read=(p:string)=>existsSync(resolve(root,p))?readFileSync(resolve(root,p),'utf8'):'';
it('official download planning checks the runtime independently of component version',()=>{
 const s=read('electron/ipc/harness-launcher.ts');
 expect(s).toContain('planHarnessDownload(');
 expect(s).not.toContain("if(!reinstall&&installed.version&&!isNewerBundle(asset.version,installed.version))return {current:true");
 expect(read('electron/ipc/harness-download-plan.ts')).toContain('installedUpstream');
});
it('shows an explicit official upgrade action and separates blocked from current',()=>{
 const s=read('src/HarnessPage.tsx');
 expect(s).toContain('officialUpdateStatus(state)');
 expect(s).toContain('检查并升级官方版本');
 expect(s).toContain('plan.blocked');
 expect(s).toContain('plan.message');
});
