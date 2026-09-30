import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {it,expect} from 'vitest';
const root=process.env.TYPOGRAPHY_SOURCE_ROOT||process.cwd();
const read=(name:string)=>existsSync(resolve(root,name))?readFileSync(resolve(root,name),'utf8'):'';
it('loads the shared typography policy at the desktop entry point',()=>{
 expect(read('src/main.tsx')).toContain('import "./studio-typography.css"');
});
it('defines medium chrome, semibold headings and semantic labels in a priority layer',()=>{
 const css=read('src/studio-typography.css');
 expect(css).toContain('@layer studio-typography');
 expect(css).toContain('--studio-weight-body: 500');
 expect(css).toContain('--studio-weight-title: 600');
 expect(css).toContain('font-weight: var(--studio-weight-body) !important');
 expect(css).toContain('font-weight: var(--studio-weight-title) !important');
 expect(css).toContain('color: var(--text-secondary) !important');
 expect(css).not.toMatch(/opacity\s*:/);
});
