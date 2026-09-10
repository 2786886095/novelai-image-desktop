import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const css=readFileSync('src/styles.css','utf8');
it('native disclosures expose hover, press, keyboard focus without moving layout',()=>{
 const layer=css.split('/* DISCLOSURE FEEDBACK')[1];expect(layer).toBeTruthy();
 for(const state of [':hover',':active',':focus-visible'])expect(layer).toContain('details > summary'+state);
 expect(layer).not.toMatch(/translate|scale\(|max-height|transition:\s*all/);
 expect(layer).toContain('.tavern-parameters-toggle[aria-expanded="true"] > svg:last-child');
 expect(css).toContain('html.motion-reduced');
});
it('mobile character expansion keeps its own arrow instead of replacing it with lock',()=>{
 const source=readFileSync('mobile/lib/agent/scene_bindings_editor.dart','utf8');
 expect(source).not.toMatch(/trailing:\s*widget.readOnly\s*\?\s*null\s*:\s*lock\('entities'/);
 expect(source).toMatch(/leading:\s*widget.readOnly/);
});
