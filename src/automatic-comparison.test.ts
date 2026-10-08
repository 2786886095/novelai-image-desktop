import {expect,it} from 'vitest';
import {normalizeAutomaticComparison,COMPARISON_SURFACES,comparisonText} from './automatic-comparison';
import {normalizeCharacterCaptions,normalizeCharacterPresets} from './character-presets';
import {reorderCharacters} from './components/CharacterEditing';
it('text generation never auto-compares; five editing surfaces default on and preserve false',()=>{
 for(const value of [null,{},'false',false])expect(Object.values(normalizeAutomaticComparison(value))).toEqual([false,true,true,true,true,true]);
 for(const key of COMPARISON_SURFACES){const v=normalizeAutomaticComparison({[key]:false,other:false});expect(v[key]).toBe(false);expect(Object.values(v).filter(Boolean)).toHaveLength(key==='generate:t2i'?5:4);expect(normalizeAutomaticComparison(JSON.parse(JSON.stringify(v)))).toEqual(v);}
 expect(normalizeAutomaticComparison({inpaint:'false'}).inpaint).toBe(true);
});
it('named characters retain identities, prompts, pause and coordinates through presets and reorder',()=>{
 const original=[{id:'a',name:'芙宁娜',prompt:'exact, text',negativePrompt:'red',enabled:false,useCoords:true,x:0,y:1},{id:'b',prompt:'bob',negativePrompt:'',useCoords:false,x:.5,y:.5}];
 const restored=normalizeCharacterCaptions(original);expect(restored).toEqual(original);expect(reorderCharacters(restored,0,1)[1]).toEqual(original[0]);
 expect(normalizeCharacterPresets([{id:'p',name:'Preset',captions:restored}])[0].captions[0].name).toBe('芙宁娜');
 expect(normalizeCharacterCaptions([{...original[0],name:'   '}])[0].name).toBeUndefined();expect(normalizeCharacterCaptions([{...original[0],name:'x'.repeat(100)}])[0].name).toHaveLength(64);
});
it('new controls are translated in every supported locale',()=>{for(const l of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR'])expect(Object.values(comparisonText(l)).every(Boolean)).toBe(true);});
