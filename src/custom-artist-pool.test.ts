import {describe,expect,it} from 'vitest';
import {parseCustomArtistPool} from './custom-artist-pool';
import {generatePopularArtistRecipes} from './artist-recipe';
describe('custom artist candidate pool (#15)',()=>{
 it('accepts the issue example, deduplicates and retains compound names',()=>{
  expect(parseCustomArtistPool('{artist:One},{artist:Two}\nartist:one，foo (bar)').map(p=>p.name)).toEqual(['one','two','foo_(bar)']);
 });
 it('does not fall back to ranking or built-in candidates on empty input',()=>expect(parseCustomArtistPool(' ,\n')).toEqual([]));
 it('rejects URLs and nested malformed tags',()=>expect(parseCustomArtistPool('https://example.com,{{broken}tag}')).toEqual([]));
 it('draws only the explicitly provided artists',()=>{
  const pool=parseCustomArtistPool('artist:one,artist:two');
  const rows=generatePopularArtistRecipes(pool,{count:10,minArtists:1,maxArtists:2,random:()=>.45} as any);
  expect(rows.length).toBeGreaterThan(0);
  for(const row of rows)for(const artist of row.artists)expect(['one','two']).toContain(artist.name);
 });
});
