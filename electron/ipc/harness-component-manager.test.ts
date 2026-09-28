import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
import {HarnessEngine} from './harness-engine';
const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0)){if(path.dirname(root)!==os.tmpdir()||!path.basename(root).startsWith('studio-manager-'))throw Error('bad fixture');await fs.rm(root,{recursive:true,force:true});}});
it('opening the desktop page is metadata-only, never prepares or downloads automatically',async()=>{
 const source=await fs.readFile('src/HarnessPage.tsx','utf8');expect(source).not.toContain('autoPrepared');expect(source).toContain('harnessPlanDownload');expect(source.indexOf('await confirmAction')).toBeLessThan(source.indexOf('harnessPrepareUpdate('));
});
it('start without an installed component performs no download',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-manager-'));roots.push(root);const download=vi.fn();
 const engine=new HarnessEngine({root,seed:path.join(root,'absent'),workspace:root,updateSource:download,openBrowser:async()=>{},bridge:async()=>({env:{},close:async()=>{}})});
 await engine.start();expect(download).not.toHaveBeenCalled();expect(engine.snapshot().version).toBeNull();expect(engine.snapshot().logs.some(l=>l.text.includes('安装'))).toBe(true);
});
it('Android asks before preparation and exposes data-preserving uninstall',async()=>{
 const screen=await fs.readFile('mobile/lib/screens/local_agent_screen.dart','utf8');expect(screen).toContain('_prepareConfirmed');expect(screen).toContain("_act('uninstall'");
 const runtime=await fs.readFile('mobile/android/app/src/main/kotlin/com/codex/novelai/novelai_mobile/agent/LocalAgentRuntime.kt','utf8');expect(runtime).toContain('downloadConsent');expect(runtime).toContain('uninstallComponent');
});
it('presentation replaces existing favicon links instead of only appending one',async()=>{
 const install=await fs.readFile('harness/plugins/studio-responsive/install.js','utf8');expect(install).toContain('studioFavicon');expect(install).toContain('MutationObserver');
});
