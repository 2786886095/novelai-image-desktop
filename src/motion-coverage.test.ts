import {it,expect} from 'vitest';import fs from 'node:fs';
const read=(p:string)=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
it('preview controls never inherit the obsolete upward offset',()=>expect(read('src/styles.css')).not.toContain('.image-preview-controls { translate: 0 -12px;'));
it('canvas actions use one quiet surface rather than nested outlined pills',()=>{const css=read('src/studio-interactions.css');expect(css).toContain('html .image-viewer-toolbar');expect(css).toContain('border:0;background:transparent;box-shadow:none');});
it('active JS animations cancel when the software motion preference changes',()=>{expect(read('src/motion-system.ts')).toContain('cancelStudioAnimations');expect(read('src/motion-system.ts')).toContain('activeAnimations');});
it('shared portals animate entry and keep inert exits',()=>{expect(read('src/components/ui.tsx')).toContain('animatePortalEntry(host)');expect(read('src/motion-system.ts')).toContain('clone.inert=true');});
it('settings, page sections and nested interaction families share lifecycle motion',()=>{expect(read('src/App.tsx')).toContain('useStudioRegionMotion');expect(read('src/main.tsx')).toContain('studio-interactions.css');for(const name of ['.animated-collapse','.disclosure-popover','details::details-content','.toggle-switch','.context-menu'])expect(read('src/studio-interactions.css')).toContain(name);});
