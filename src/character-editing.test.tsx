import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {AnimatedCollapse,reorderCharacters,syncCharacterSlots,characterEditLabels,CharacterPositionMarker} from './components/CharacterEditing';
const cast=[{id:'a',prompt:'blue coat',negativePrompt:'',x:0,y:1,useCoords:true},{id:'b',prompt:'red dress',negativePrompt:'hat',x:.8,y:.2,useCoords:false},{id:'c',prompt:'',negativePrompt:'',x:.5,y:.5,useCoords:true}];
it('reorders whole characters without changing text, IDs, or their positions',()=>{
 const result=reorderCharacters(cast,0,2);expect(result.map(c=>c.id)).toEqual(['b','c','a']);expect(result[2]).toBe(cast[0]);expect(cast[0].id).toBe('a');
});
it('sync applies previous index slots without replacing character content',()=>{
 const result=syncCharacterSlots(reorderCharacters(cast,0,2),cast);
 expect(result.map(c=>c.prompt)).toEqual(['red dress','','blue coat']);expect(result.map(c=>[c.x,c.y,c.useCoords])).toEqual(cast.map(c=>[c.x,c.y,c.useCoords]));
 expect(result[0].negativePrompt).toBe('hat');
});
it('rejects invalid drags and stale slot snapshots',()=>{
 expect(reorderCharacters(cast,0,99)).toBe(cast);expect(reorderCharacters(cast,-1,0)).toBe(cast);expect(reorderCharacters(cast,0,0)).toBe(cast);
 const next=[{...cast[0],id:'new'},cast[1],cast[2]];expect(syncCharacterSlots(next,cast)).toBe(next);
});
it('keeps collapsed fields mounted but inaccessible',()=>{
 const html=renderToStaticMarkup(<AnimatedCollapse open={false}><input defaultValue="unchanged"/></AnimatedCollapse>);
 expect(html).toContain('inert=""');expect(html).toContain('aria-hidden="true"');expect(html).toContain('value="unchanged"');
});
it('marker honors exact zero coordinates and new ordinal',()=>{
 const html=renderToStaticMarkup(<CharacterPositionMarker caption={cast[0]} index={2} label="Role 3" onCommit={()=>{}}/>);
 expect(html).toContain('left:0%');expect(html).toContain('top:100%');expect(html).toContain('>3</button>');
});
it('provides both choices for every supported language',()=>{
 for(const language of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']){const l=characterEditLabels(language);expect(l.sync).not.toBe(l.keep);expect(l.select).toBeTruthy();}
});
