import {describe,it,expect} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {normalizeTypography,validateFont,typographyText,FONT_MAX_BYTES} from './typography';
import {UiFontRepository} from '../electron/ipc/ui-fonts';
const font=path.resolve('mobile/test/fixtures/typography-roboto.ttf');
describe('global typography',()=>{
 it('migrates defaults and clamps only finite numbers',()=>{
  expect(normalizeTypography(undefined)).toEqual({font:'default',scale:100});
  for(const raw of [null,[],{font:'../../private',scale:NaN},{scale:'200'},{scale:Infinity}])expect(normalizeTypography(raw)).toEqual({font:'default',scale:100});
  expect(normalizeTypography({font:'serif',scale:500})).toEqual({font:'serif',scale:200});expect(normalizeTypography({font:'mono',scale:0})).toEqual({font:'mono',scale:80});
 });
 it('validates both native font types and refuses corrupt/truncated/bounded tables',()=>{
  validateFont(fs.readFileSync(font));for(const data of [new Uint8Array(0),new Uint8Array(20),new Uint8Array(FONT_MAX_BYTES+1)])expect(()=>validateFont(data)).toThrow();
  const bad=Buffer.from(fs.readFileSync(font));bad.writeUInt32BE(0xffffffff,20);expect(()=>validateFont(bad)).toThrow('FONT_BOUNDS');
 });
 it('copies unchanged bytes, deduplicates, persists and isolates lookups',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-fonts-'));try{
   const repo=new UiFontRepository(dir),before=fs.readFileSync(font),entry=repo.importFile(font);
   expect(entry.id).toBe('font-'+crypto.createHash('sha256').update(before).digest('hex'));expect(repo.importFile(font)).toEqual(entry);
   expect(new UiFontRepository(dir).list()).toEqual([entry]);expect(repo.read(entry.id)).toEqual(before);expect(fs.readFileSync(font)).toEqual(before);
   expect(()=>repo.read('../../private')).toThrow('FONT_ID');expect(()=>repo.read('font-'+ 'a'.repeat(64))).toThrow('FONT_MISSING');
   repo.remove(entry.id);expect(repo.list()).toEqual([]);expect(fs.existsSync(path.join(dir,entry.id+'.font'))).toBe(false);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
 });
 it('invalid import retains the existing catalog',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-fonts-'));try{const repo=new UiFontRepository(dir),entry=repo.importFile(font),bad=path.join(dir,'bad.otf');fs.writeFileSync(bad,'invalid');expect(()=>repo.importFile(bad)).toThrow();expect(repo.list()).toEqual([entry]);}finally{fs.rmSync(dir,{recursive:true,force:true})}
 });
 it('provides matching complete wording in all five languages',()=>{for(const l of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR'])expect(Object.keys(typographyText(l))).toEqual(Object.keys(typographyText('zh-CN')));});
});
