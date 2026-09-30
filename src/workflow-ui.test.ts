import {it,expect} from 'vitest';import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(p,'utf8');
it('offers visible collection action in works',()=>expect(read('src/components/WorksLibrary.tsx')).toContain('<ImageFavoriteButton'));
it('uses click preview instead of embedded wheel viewer',()=>{const s=read('src/components/WorksLibrary.tsx');expect(s).toContain('<ImagePreviewDialog');expect(s).not.toContain('<PreviewImageViewer');});
it('uses native nonpassive wheel listener in enlarged viewer',()=>expect(read('src/components/PreviewImageViewer.tsx')).toContain('passive:false'));
it('inpainting exposes original tags and AI reverse',()=>expect(read('src/App.tsx')).toContain('<InpaintPromptSource'));
it('focused inpainting reaches native preparation',()=>expect(read('electron/ipc/nai.ts')).toContain('prepareFocusedInpaintInput'));
it('removes decorative wildcard and source-policy footnotes',()=>{const s=read('src/App.tsx');expect(s).not.toContain('className="wildcard-hint"');expect(s).not.toContain('<small className="field-hint">{t("inpaint.sourceHint")}</small>');});
