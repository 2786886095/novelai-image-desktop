import {describe,it,expect} from 'vitest';
import {drawAllV5ArtistWeights} from './v5-artist-weight-repair';
import {normalizeStyleTagDrawState} from './style-tag-draw-state';
const tags=['watercolor','oil_painting','pencil_sketch'];
function draw(min:number,max:number,pool=tags.join(', '),modes:Record<string,'random'|'always'>=Object.fromEntries(tags.map(t=>[t,'random'])),input='artist:fixture, blue_dress') {
 let seed=42;const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 return drawAllV5ArtistWeights(input,40,.2,1.2,rng,undefined,{customTagPool:pool,customTagModes:modes,minRandomCustomTags:min,maxRandomCustomTags:max});
}
const selected=(prompt:string)=>tags.filter(tag=>prompt.includes(`::${tag} ::`));
describe('artist-string draw library counts',()=>{
 for(const n of [0,1,2,3])it(`fixed ${n} random tags leaves typed input and batch size intact`,()=>{const rows=draw(n,n);expect(rows).toHaveLength(40);for(const r of rows){expect(selected(r.prompt)).toHaveLength(n);expect(r.prompt).toContain('artist:fixture');expect(r.prompt).toContain('blue_dress');}});
 it('inverted and oversized bounds clamp to eligible unique random tags',()=>{for(const r of draw(9,2)){expect(selected(r.prompt).length).toBeGreaterThanOrEqual(2);expect(selected(r.prompt).length).toBeLessThanOrEqual(3);}});
 it('always tags are not counted and legacy modes remain always',()=>{for(const r of draw(0,0,undefined,{watercolor:'always',oil_painting:'random',pencil_sketch:'random'})){expect(selected(r.prompt)).toEqual(['watercolor']);}for(const r of draw(0,0,undefined,{}))expect(selected(r.prompt)).toHaveLength(3);});
 it('typed duplicates remain and do not consume random slots',()=>{for(const r of draw(1,1,'watercolor, WATERCOLOR, oil_painting',{watercolor:'random',oil_painting:'random'},'artist:fixture, watercolor')){expect(selected(r.prompt)).toHaveLength(2);expect(r.prompt.match(/::watercolor ::/g)).toHaveLength(1);}});
 it('normalizes invalid saved values without discarding selected old tags',()=>{expect(normalizeStyleTagDrawState({tags:['watercolor','WATERCOLOR','oil_painting'],min:0,max:99})).toEqual({tags:['watercolor','oil_painting'],modes:{watercolor:'always',oil_painting:'always'},min:0,max:20});expect(normalizeStyleTagDrawState({min:5,max:2}).min).toBe(5);});
});
