import {describe,it,expect} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {BUILTIN_FONTS,builtinFont,builtinFontLabel,builtinFontHint} from './builtin-fonts';
import {DEFAULT_TYPOGRAPHY,FONT_LIMIT,fontFamily,isImportedFont,normalizeTypography} from './typography';
describe('bundled style fonts',()=>{
 it('adds six stable IDs without changing defaults, scale, imported IDs or import quota',()=>{
  expect(BUILTIN_FONTS).toHaveLength(6);expect(new Set(BUILTIN_FONTS.map(f=>f.id)).size).toBe(6);
  expect(DEFAULT_TYPOGRAPHY).toEqual({font:'default',scale:100});expect(FONT_LIMIT).toBe(16);
  expect(normalizeTypography({font:'serif',scale:150})).toEqual({font:'serif',scale:150});
  const imported='font-'+'a'.repeat(64);expect(normalizeTypography({font:imported,scale:125}).font).toBe(imported);
  for(const f of BUILTIN_FONTS){expect(normalizeTypography({font:f.id,scale:150})).toEqual({font:f.id,scale:150});expect(isImportedFont(f.id)).toBe(false);expect(fontFamily(f.id)).toContain('Studio-'+f.id);}
  expect(builtinFont('builtin-../../private')).toBeUndefined();expect(normalizeTypography({font:'builtin-unknown'}).font).toBe('default');
 });
 it('ships identical original font bytes, full OFL notices and catalog on desktop and mobile',()=>{
  const catalog=JSON.parse(fs.readFileSync('public/ui-fonts/catalog.json','utf8'));
  expect(fs.readFileSync('mobile/assets/ui-fonts/catalog.json','utf8')).toBe(fs.readFileSync('public/ui-fonts/catalog.json','utf8'));
  const hashes=new Set();
  for(const f of BUILTIN_FONTS){const entry=catalog.find((x:{id:string})=>x.id===f.id);expect(entry).toMatchObject({...f,license:'SIL OFL 1.1',unmodifiedUpstreamBytes:true});
   const bytes=fs.readFileSync(path.join('public/ui-fonts',f.file));expect(fs.readFileSync(path.join('mobile/assets/ui-fonts',f.file)).equals(bytes)).toBe(true);
   const hash=crypto.createHash('sha256').update(bytes).digest('hex');expect(hash).toBe(entry.sha256);hashes.add(hash);
   const license=fs.readFileSync(path.join('public/ui-fonts',entry.licenseFile));expect(license.toString()).toContain('SIL OPEN FONT LICENSE');expect(fs.readFileSync(path.join('mobile/assets/ui-fonts',entry.licenseFile)).equals(license)).toBe(true);
   expect(crypto.createHash('sha256').update(license).digest('hex')).toBe(entry.licenseSha256);
   expect(fs.readFileSync('THIRD_PARTY_NOTICES.md','utf8')).toContain(entry.licenseFile);
  }expect(hashes.size).toBe(6);
 });
 it('offers meaningful labels and offline/fallback guidance in five UI locales',()=>{
  for(const l of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']){expect(builtinFontHint(l).length).toBeGreaterThan(30);for(const f of BUILTIN_FONTS){const label=builtinFontLabel(f.id,l);expect(label).not.toBe(f.id);expect(label).toContain(' · ');}}
 });
 it('mobile normalization and runtime assets register the same IDs without OS font installation',()=>{
  const dart=fs.readFileSync('mobile/lib/models/builtin_ui_fonts.dart','utf8');for(const f of BUILTIN_FONTS){expect(dart).toContain('"'+f.id+'"');expect(dart).toContain('"'+f.file+'"');}
  expect(fs.readFileSync('mobile/pubspec.yaml','utf8')).toContain('    - assets/ui-fonts/');
 });
});
