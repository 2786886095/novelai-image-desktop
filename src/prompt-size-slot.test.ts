import {expect,it} from 'vitest';
import fs from 'node:fs';
import {resolvePromptSizeSlot} from './prompt-size-slot';

it('default generation/i2i controls are unchanged',()=>{
 expect(resolvePromptSizeSlot(undefined,'generation-controls')).toBe('generation-controls');
 expect(resolvePromptSizeSlot(undefined,false)).toBe(false);
});
it('independent tool controls replace the default, not add a second size section',()=>{
 expect(resolvePromptSizeSlot('inpaint-controls','generation-controls')).toBe('inpaint-controls');
 expect(resolvePromptSizeSlot('inpaint-controls',false)).toBe('inpaint-controls');
});
it('an explicitly hidden slot stays hidden',()=>expect(resolvePromptSizeSlot(null,'generation-controls')).toBeNull());
it('the shared size slot is after prompt tools, before seed, with one inpaint instance',()=>{
 const src=fs.readFileSync(new URL('./App.tsx',import.meta.url),'utf8');
 const tools=src.indexOf('className="prompt-toolbar-row'),slot=src.indexOf('{resolvePromptSizeSlot(sizeControls,'),seed=src.indexOf('className="seed-mode-switch"');
 expect(tools).toBeGreaterThan(0);expect(slot).toBeGreaterThan(tools);expect(seed).toBeGreaterThan(slot);
 expect(src.match(/<InpaintSizeControls /g)).toHaveLength(1);expect(src).toContain('sizeControls={<InpaintSizeControls');
});
