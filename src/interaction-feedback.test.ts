import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const css=readFileSync('src/styles.css','utf8');
it('native disclosures expose hover, press, keyboard focus without moving layout',()=>{
 const layer=css.split('/* DISCLOSURE FEEDBACK')[1]?.split('/* END DISCLOSURE FEEDBACK */')[0];expect(layer).toBeTruthy();
 for(const state of [':hover',':active',':focus-visible'])expect(layer).toContain('details > summary'+state);
 expect(layer).not.toMatch(/translate|scale\(|max-height|transition:\s*all/);
 expect(layer).toContain('.tavern-parameters-toggle[aria-expanded="true"] > svg:last-child');
 expect(css).toContain('html.motion-reduced');
});
