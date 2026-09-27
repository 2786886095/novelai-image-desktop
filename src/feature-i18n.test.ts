import {describe,it,expect} from 'vitest';
import {readFileSync,readdirSync,existsSync} from 'node:fs';import path from 'node:path';import ts from 'typescript';
import entries from './feature-locales.json';
import {FEATURE_LANGUAGES,featureText,featureKey} from './feature-text';
const placeholders=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
describe('five-language feature catalog',()=>{
 for(const [key,row] of Object.entries(entries))it(key,()=>{
  expect(row).toHaveLength(5);expect(row[0]).toBe(key);
  for(const text of row){expect(text.trim().length).toBeGreaterThan(0);expect(placeholders(text)).toEqual(placeholders(key));}
  expect(row[2]).not.toMatch(/[\u3400-\u9fff]/);
 });
 it('localizes own status templates, preserving parameters and raw diagnostics',()=>{
  expect(featureText('en-US','校验 Agent 0.1.2（Harness 0.1.7-rc.2）…')).toBe('Verifying Agent 0.1.2 (Harness 0.1.7-rc.2)…');
  expect(featureText('en-US','Error: 请选择目标图片。')).toBe('Error: Select a target image.');
  const raw='EPERM: symlink C:/用户/sdk -> D:/目标/sdk';expect(featureText('en-US',raw)).toBe(raw);
  for(const language of FEATURE_LANGUAGES)expect(featureText(language,'画风候选 {number}',{number:5})).toContain('5');
  expect(featureKey('Confirm')).toBe('确认');expect(featureText('unsupported','确认')).toBe('确认');
 });
 it('audits all desktop JSX literal text and literal accessibility labels for Chinese leaks',()=>{
  const leaks:string[]=[];
  const walk=(dir:string)=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(p.endsWith('.tsx')){
   const ast=ts.createSourceFile(p,readFileSync(p,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
   const visit=(n:ts.Node)=>{
    if(ts.isJsxText(n)&&/[\u4e00-\u9fff]/.test(n.text))leaks.push(p+':'+n.text.trim());
    if(ts.isJsxAttribute(n)&&n.initializer&&ts.isStringLiteral(n.initializer)&&/[\u4e00-\u9fff]/.test(n.initializer.text))leaks.push(p+':'+n.initializer.text);
    if(ts.isCallExpression(n)&&n.expression.getText(ast)==='ft'&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0]))expect(entries).toHaveProperty(n.arguments[0].text);
    ts.forEachChild(n,visit);
   };visit(ast);
  }}};walk('src');expect(leaks).toEqual([]);
 });
 it('provides reciprocal README language links and valid local targets',()=>{
  const names=['README.md','README.zh-TW.md','README.en.md','README.ja.md','README.ko.md'];
  for(const name of names){const source=readFileSync(name,'utf8');for(const other of names)expect(source).toContain(`](./${other})`);
   for(const match of source.matchAll(/\]\(\.\/([^\s)]+)\)/g)){expect(existsSync(decodeURIComponent(match[1].split('#')[0])),name+': '+match[1]).toBe(true);}
  }
 });
});
