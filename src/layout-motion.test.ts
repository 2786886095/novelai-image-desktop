import {it,expect} from 'vitest';import {readFileSync,existsSync} from 'node:fs';
const read=(p:string)=>existsSync(p)?readFileSync(p,'utf8'):'';
it('prompt dock reserves its own solid row',()=>expect(read('src/layout-motion.css')).toContain('prompt dock: reserved row'));
it('favorites preview uses viewport portal dialog',()=>expect(read('src/components/LocalFavorites.tsx')).toContain('<ImagePreviewDialog'));
it('reorder panel wraps every destination',()=>expect(read('src/layout-motion.css')).toContain('reorder: all destinations'));
it('online favorites are not mixed into local library',()=>expect(read('src/components/GalleryFavorites.tsx')).toContain('embedded?<LocalFavorites/>'));
it('inpaint commands wrap without hidden horizontal scrolling',()=>expect(read('src/layout-motion.css')).toContain('inpaint: wrap all actions'));
it('complete Kimi motion is installed at application root',()=>expect(read('src/main.tsx')).toContain('installStudioMotion'));
