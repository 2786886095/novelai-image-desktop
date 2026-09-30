import {describe,it,expect} from 'vitest';import {readFileSync} from 'node:fs';
const source=readFileSync('src/App.tsx','utf8');
import {COMPACT_RESOLUTIONS,parseResolution,selectedResolution,capsulePromptUnits,removeCapsuleUnit,compactText} from './compact-prompt';
describe('compact generation controls wiring',()=>{
 it('uses one Furry switch',()=>expect(source).toContain('<FurryModeSwitch'));
 it('uses one resolution selector',()=>expect(source).toContain('<ResolutionPicker'));
 it('opens capsule editing in a secondary dialog',()=>expect(source).toContain('<CapsuleEditor'));
});
describe('resolution and prompt editing',()=>{
 it('keeps all eleven existing resolution presets',()=>{expect(COMPACT_RESOLUTIONS).toHaveLength(11);for(const [width,height] of COMPACT_RESOLUTIONS){expect(parseResolution(`${width}x${height}`)).toEqual({width,height});expect(selectedResolution(width,height)).not.toBe('custom');}});
 it('preserves custom sizes and does not invent a size for invalid options',()=>{expect(selectedResolution(896,1152)).toBe('custom');expect(parseResolution('custom')).toBeNull();expect(parseResolution('999999x2')).toBeNull();});
 it('retains numeric weight groups and comma-containing braces',()=>{expect(capsulePromptUnits('1girl, 1.2::blue sky, clouds::, {white hair, blue eyes}, solo').map(x=>x.text)).toEqual(['1girl','1.2::blue sky, clouds::','{white hair, blue eyes}','solo']);});
 it('retains nested brackets and parentheses',()=>{expect(capsulePromptUnits('foo, [a, {b,c}], name (alias, name), bar').map(x=>x.text)).toEqual(['foo','[a, {b,c}]','name (alias, name)','bar']);});
 it('removes a middle unit without rewriting neighboring weights or spacing',()=>{expect(removeCapsuleUnit('1girl, 1.2::blue sky, clouds::,  white hair',1)).toBe('1girl,  white hair');});
 it('removes exactly one duplicate tag',()=>{expect(removeCapsuleUnit('solo, solo, solo',1)).toBe('solo, solo');});
 it('supports removing first, last and only tag',()=>{expect(removeCapsuleUnit('a, b',0)).toBe(' b');expect(removeCapsuleUnit('a, b',1)).toBe('a');expect(removeCapsuleUnit('a',0)).toBe('');});
 it('preserves empty and invalid removal requests',()=>{expect(removeCapsuleUnit('',0)).toBe('');expect(removeCapsuleUnit('a, b',9)).toBe('a, b');});
 it('handles unfinished scope conservatively rather than splitting it',()=>{expect(capsulePromptUnits('a, 1.3::b, c').map(x=>x.text)).toEqual(['a','1.3::b, c']);});
 it('provides accessible names in every app language',()=>{for(const l of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR'])expect(compactText(l).length).toBe(8);});
 it('retains custom dimension normalization and inpaint prompt isolation',()=>{expect(source).toContain('snapNAIDimensionWithinArea');expect(source).toContain('onChange={value=>setPromptField(promptKey,value)}');});
});
