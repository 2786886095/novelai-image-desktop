import {it,expect} from 'vitest';import {readFileSync,existsSync} from 'node:fs';import {resolve} from 'node:path';
const root=process.env.HARNESS_COMBINED_SOURCE_ROOT||process.cwd();const read=(p:string)=>existsSync(resolve(root,p))?readFileSync(resolve(root,p),'utf8'):'';
it('awaits both metadata checks before returning a completed snapshot',()=>expect(read('electron/ipc/harness-launcher.ts')).toContain("if(action==='checkUpdates'){await engine!.checkUpdates();"));
it('offers an explicit now/later choice after both checks, including entry checks',()=>{
 const s=read('src/HarnessPage.tsx');expect(s).toContain('reviewCheckedSnapshot');expect(s).toContain('reviewRef.current(snapshot)');expect(s).toContain('立即更新');expect(s).toContain('稍后');expect(s).toContain('combinedUpdateKind(snapshot)');
 expect(read('src/components/confirm.ts')).toContain('buttonLabels');
});
