import {it,expect} from 'vitest';
import fs from 'node:fs';
const read=(p:string)=>fs.readFileSync(p,'utf8');
it('history thumbnails no longer use a wrapping click-intercepting toolbar',()=>{
 const app=read('src/App.tsx');expect(app).toContain('<HistoryItemMenu src={item.fileUrl}');expect(app).not.toContain('<div className="history-item-controls"');
 expect(app).toContain('aria-label={t("history.thumbAlt")} onClick={() => selectImage(item)}');
});
it('the more menu closes without preventing an outside image click, and preserves delete confirmation',()=>{
 const menu=read('src/components/HistoryItemMenu.tsx');expect(menu).toContain("document.addEventListener('pointerdown',outside,true)");
 const outside=menu.slice(menu.indexOf('const outside='),menu.indexOf('const scroll='));expect(outside).not.toContain('preventDefault');expect(outside).not.toContain('stopPropagation');
 expect(menu).not.toContain('className="backdrop"');expect(menu).toContain("event.key==='Escape'");
 expect(read('src/App.tsx')).toContain('if (!(await confirmAction(');
});
it('local sizing keeps a single desktop affordance and larger touch menu rows',()=>{
 const css=read('src/components/history-item-menu.css');expect(css).toContain('width:32px;height:32px');expect(css).toContain('pointer:coarse');expect(css).toContain('min-height:44px');
 expect(css).not.toContain('grid-template-columns:repeat(3');
 expect(css).toContain('width:min(160px');expect(css).toContain('min-height:24px');expect(css).toContain('width:14px;height:14px');
 expect(read('src/components/HistoryItemMenu.tsx')).toContain('getBoundingClientRect().width');
});
