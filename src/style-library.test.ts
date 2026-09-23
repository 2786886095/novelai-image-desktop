import {describe,it,expect} from 'vitest';
import {STYLE_SORTS,styleMetadata,sortStyles,moveStyle,parseStyleLines,matchStyleImages,styleCoverIndex} from './style-library';
import type {StylePromptPreset} from './types';
const make=(id:string,rating=0,uses=0,date='2026-09-01'):StylePromptPreset=>({id,name:id,prompt:`artist:${id}`,group:'Default',createdAt:date,rating,usageCount:uses});
describe('saved style library',()=>{
 it('normalizes old presets and invalid metadata without changing prompts',()=>{
  expect(styleMetadata({})).toEqual({rating:0,usageCount:0,sortOrder:Number.MAX_SAFE_INTEGER});
  expect(styleMetadata({rating:4.26,usageCount:3.9,sortOrder:-1})).toEqual({rating:4.26,usageCount:3,sortOrder:0});
  expect(styleMetadata({rating:99,usageCount:NaN})).toMatchObject({rating:5,usageCount:0});
 });
 it.each([['default','bac'],['custom','bac'],['rating-desc','abc'],['rating-asc','bca'],['uses-desc','cba'],['uses-asc','abc'],['created-desc','acb'],['created-asc','bca'],['name','abc']])('%s sorts stably', (mode,want)=>{
  const items=[make('b',1,2,'2026-09-01'),make('a',5,0,'2026-09-03'),make('c',1,3,'2026-09-02')];
  expect(sortStyles(items,mode).map(x=>x.id).join('')).toBe(want);expect(items.map(x=>x.id).join('')).toBe('bac');
 });
 it('moves in either direction and preserves original/default order',()=>{
  const original=['a','b','c'].map(x=>make(x));const moved=moveStyle(original,'a','c');
  expect(sortStyles(moved,'custom').map(x=>x.id)).toEqual(['b','c','a']);
  expect(moved.map(x=>x.id)).toEqual(['a','b','c']);expect(original[0].sortOrder).toBeUndefined();
  expect(sortStyles(moveStyle(moved,'a','b'),'custom').map(x=>x.id)).toEqual(['a','b','c']);
  expect(moveStyle(original,'missing','b')).toBe(original);
 });
 it('imports one raw prompt per line without changing weights and supports named tabs',()=>{
  expect(parseStyleLines('\uFEFF1.2::artist:a::, artist:b\r\n\nDream\t0.8::artist:c::')).toEqual([{name:'1.2::artist:a::, artist:b',prompt:'1.2::artist:a::, artist:b'},{name:'Dream',prompt:'0.8::artist:c::'}]);
 });
 it('matches natural filename order, exact names, no-match and rejects ambiguous files',()=>{
  const names=['10.png','2.png','Dream.jpg'];const rows=[{name:'dream'},{name:'missing'}];
  expect(matchStyleImages(names,rows,'name')).toEqual([['Dream.jpg'],[]]);
  expect(matchStyleImages(names,rows,'order')).toEqual([['2.png'],['10.png']]);
  expect(matchStyleImages(names,rows,'none')).toEqual([[],[]]);
  expect(()=>matchStyleImages(['a.png','a.png'],rows,'order')).toThrow('Duplicate');
 });
 it('all five UI languages cover every sort choice',async()=>{const {default:labels}=await import('../shared/style-library-ui.json');for(const t of Object.values(labels)){for(const s of STYLE_SORTS)expect(t[s==='name'?'nameSort':s]).toBeTruthy();}});
});

describe('style cover selection',()=>{
 const previewImages=['first','second','third'].map(id=>({id,name:id,filePath:id,fileUrl:id,createdAt:''}));
 it('preserves image order and selected cover through JSON roundtrip',()=>{
  const p={...make('a'),previewImages,coverImageId:'second'};
  expect(styleCoverIndex(JSON.parse(JSON.stringify(p)))).toBe(1);
  expect(previewImages.map(im=>im.id)).toEqual(['first','second','third']);
 });
 it('falls back to first image for legacy, deleted or missing covers and handles empty',()=>{
  expect(styleCoverIndex({previewImages})).toBe(0);
  expect(styleCoverIndex({previewImages,coverImageId:'deleted'})).toBe(0);
  expect(styleCoverIndex({previewImages:[],coverImageId:'second'})).toBe(-1);
  expect(styleCoverIndex({})).toBe(-1);
 });
});
