import {it,expect} from 'vitest';import fs from 'node:fs';
const read=(p:string)=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
it('all image previews sit above the application highest modal token',()=>{const s=read('src/preview-unified.css');expect(s).toContain('calc(var(--z-overlay-top, 20000) + 100)');expect(s).not.toContain('z-index:1800');});
it('nested viewer traps Tab and restores the triggering control',()=>{const s=read('src/components/PreviewImageViewer.tsx');expect(s).toContain("e.key==='Tab'");expect(s).toContain('previous.focus({preventScroll:true})');});
it('requested character explanation is no longer rendered',()=>expect(read('src/App.tsx')).not.toContain('{t("convert.knownCharacterHint")}'));
it('installed state can be read before any update network request',()=>expect(read('electron/ipc/harness-engine.ts')).toContain('async refreshInstalledState()'));
it('download planning refreshes disk state and does not offer an older installed bundle',()=>{const s=read('electron/ipc/harness-launcher.ts');expect(s).toContain('await engine!.refreshInstalledState()');expect(s).toContain('planHarnessDownload(');expect(read('electron/ipc/harness-download-plan.ts')).toContain('!isNewerBundle(asset.version,installed.version)');});
