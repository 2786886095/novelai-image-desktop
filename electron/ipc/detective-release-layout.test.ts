import {expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import release from './detective-release.json';

// Published ZIP central directories read at immutable Hugging Face revision
// 968dfdf901d378958ec9d3742a5428cb8023e8ac. Both 33-entry assets archives
// actually contain novelai-desktop-assets/manifest.json. This is a metadata
// regression, not a claim that whole archives/model inference were executed.
for(const variant of ['full','light'])it(`${variant}: uses the actual published archive root`,()=>{
 const p=release.packages.find(x=>x.kind==='assets'&&x.variant===variant)!;
 expect(p.directory).toBe('novelai-desktop-assets');
});
it('keeps all three pinned archive byte counts and hashes unchanged',()=>{
 expect(release.packages.map(p=>[p.file,p.bytes,p.sha256])).toEqual([
 ['novelai-desktop-assets-20260926.zip',8621242078,'49f95f9f22820da6955395ffe8c8e62a89218d1b58afe82d74f556d4762d171a'],
 ['artist-detective-novelai-light-desktop-assets-20260926.zip',1958012035,'90b09b7f70cc0182ed9cbe5cc5b51bb759177635f6a22e7d45ae2df922d76014'],
 ['artist-detective-runtime-win-x64-cu128-f970abe.zip',3535322169,'4935701575788f20e2545fd04300b70a3bde4763af0d5db3416686d31991565c']]);
});
it('retains variant-separated fresh installation roots and real runtime validation',()=>{
 const source=fs.readFileSync(path.join(import.meta.dirname,'detective-download.ts'),'utf8');
 expect(source).toContain('`${release.version}-${variant}-${Date.now()}`');
 expect(source).toContain('path.join(install, chosen.find(p => p.kind === "assets")?.directory');
 expect(source).toContain('await validateDetectiveRuntime({python,assets,variant},true)');
 expect(source).toContain("if(verified.state!=='passed')throw");
});
