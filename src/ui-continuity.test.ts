import {it,expect,vi,afterEach} from 'vitest';import fs from 'node:fs';import path from 'node:path';import {motionReduced} from './motion-system';
const read=(p:string)=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
afterEach(()=>vi.unstubAllGlobals());
it('uses only the explicit app preference, even when Windows requests reduced motion',()=>{
 vi.stubGlobal('window',{matchMedia:()=>({matches:true})});vi.stubGlobal('document',{documentElement:{classList:{contains:()=>false}}});expect(motionReduced()).toBe(false);
 vi.stubGlobal('document',{documentElement:{classList:{contains:()=>true}}});expect(motionReduced()).toBe(true);
});
it('no desktop stylesheet inherits the Windows motion switch',()=>{
 const files=(dir:string):string[]=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(path.join(dir,x.name)):x.name.endsWith('.css')?[path.join(dir,x.name)]:[]);
 expect(files('src').filter(p=>read(p).includes('prefers-reduced-motion'))).toEqual([]);
});
it('all preview families share a single viewport/backdrop stylesheet',()=>{expect(read('src/components/PreviewImageViewer.tsx')).toContain("import '../preview-unified.css'");const css=read('src/preview-unified.css');for(const name of ['style-image-lightbox','image-preview-dialog-backdrop','reference-catalog-preview-backdrop','tavern-image-lightbox','redraw-lightbox'])expect(css).toContain(name);});
it('works filters use direct trigger children and the grid gets the remaining height',()=>{const css=read('src/works-library.css');expect(css).toContain('grid-template-columns:minmax(180px,1fr) 160px 140px auto auto');expect(css).toContain('.works-grid {flex:1 1 0;min-height:0;max-height:none;');});
it('toolbar floats inside the input instead of reserving a permanent row',()=>{expect(read('src/layout-motion.css')).toContain('position:absolute;left:8px;right:8px;bottom:14px;margin:0;');expect(read('src/components/PromptEditorChrome.tsx')).toContain("open?'chevronDown':'sparkles'");});
