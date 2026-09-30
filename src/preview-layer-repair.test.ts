import {it,expect} from 'vitest';import fs from 'node:fs';
const read=(p:string)=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
it('all image previews sit above the application highest modal token',()=>{const s=read('src/preview-unified.css');expect(s).toContain('calc(var(--z-overlay-top, 20000) + 100)');expect(s).not.toContain('z-index:1800');});
it('nested viewer traps Tab and restores the triggering control',()=>{const s=read('src/components/PreviewImageViewer.tsx');expect(s).toContain("e.key==='Tab'");expect(s).toContain('previous.focus({preventScroll:true})');});
it('requested character explanation is no longer rendered',()=>expect(read('src/App.tsx')).not.toContain('{t("convert.knownCharacterHint")}'));
it('installed state can be read before any update network request',()=>expect(read('electron/ipc/harness-engine.ts')).toContain('async refreshInstalledState()'));
it('download planning refreshes disk state and does not offer an older installed bundle',()=>{const s=read('electron/ipc/harness-launcher.ts');expect(s).toContain('await engine!.refreshInstalledState()');expect(s).toContain('planHarnessDownload(');expect(read('electron/ipc/harness-download-plan.ts')).toContain('!isNewerBundle(asset.version,installed.version)');});

it('removes only the viewport-sized preview focus ring, retaining keyboard focus and controls',()=>{
 const styles=fs.readFileSync('src/styles.css','utf8');
 const viewer=fs.readFileSync('src/components/PreviewImageViewer.tsx','utf8');
 expect(styles).toContain('.image-preview-viewer:focus-visible { outline: none; }');
 expect(styles).not.toContain('.image-preview-viewer:focus-visible { outline: 2px');
 expect(viewer).toContain('tabIndex={0}');expect(viewer).toContain("e.key==='Tab'");
 expect(viewer).toContain('root.current?.focus({preventScroll:true})');
 expect(viewer).toContain("e.key==='Escape'");
 expect(styles).toContain('.char-row-toggle:focus-visible { outline: 2px solid var(--accent)');
});

it('the final startup stylesheet excludes canvas and viewport wrappers without removing control rings',()=>{
 const motion=read('src/layout-motion.css');
 expect(motion).toContain('[tabindex]:not(.image-preview-viewer):not(.zoom-frame-shell)');
 expect(motion).toContain('html :is(.image-preview-viewer,.zoom-frame-shell,.canvas-area):focus-visible {outline:none;box-shadow:none;}');
 expect(motion).toContain('button,input,select,textarea');
 const startup=read('src/main.tsx');
 expect(startup.indexOf('"./layout-motion.css"')).toBeGreaterThan(startup.indexOf('"./styles.css"'));
});
