import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
import * as translation from '../../src/translation';
import * as prompts from '../../src/google-prompt-translation';
function production(respond:(q:string)=>unknown, categories:Record<string,number>={}) {
 const ast=ts.createSourceFile('nai.ts',fs.readFileSync('electron/ipc/nai.ts','utf8'),ts.ScriptTarget.Latest,true);
 const fn=ast.statements.find((n):n is ts.FunctionDeclaration=>ts.isFunctionDeclaration(n)&&n.name?.text==='googleTranslate')!;
 const get=vi.fn(async(_url:string,options:any)=>({data:respond(options.params.q)}));
 const fnCode=ts.transpileModule(fn.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const api=vm.runInNewContext(fnCode+'\ngoogleTranslate',{...translation,...prompts,exports:{},axios:{get},proxyConfig:(scope:string)=>{expect(scope).toBe('translate');return{};},searchDanbooru:async(tag:string)=>categories[tag]===undefined?[]:[{tag,category:categories[tag]}]});
 return {api,get};
}
describe('real Google production function / Issue66 request boundaries',()=>{
 it('normalizes descriptions only, sends one batch, and restores exact names and controls',async()=>{
  const f=production(q=>[[[q.split('\n').map(s=>({'black hat':'黑色帽子','blonde hair':'金发','white dress':'白色连衣裙'} as Record<string,string>)[s]).join('\n')]],null,'en']);
  const input='1.2::{black_hat}, [blonde_hair] | artist:some_artist, character:misumi_uika, sumimi_(bang_dream!), -0.5::white_dress::';
  expect(await f.api(input,'zh-CN','en')).toMatchObject({ok:true,text:'1.2::{黑色帽子}, [金发] | artist:some_artist, character:misumi_uika, sumimi_(bang_dream!), -0.5::白色连衣裙::',sourceLanguage:'en'});
  expect(f.get).toHaveBeenCalledTimes(1);expect(f.get.mock.calls[0][1].params.q).toBe('black hat\nblonde hair\nwhite dress');
 });
 it('local name categories override misleading descriptive-looking names',async()=>{
  const f=production(()=>[[['金发']],null,'en'],{black_hat:4});
  expect(await f.api('black_hat, blonde_hair','zh-CN','en')).toMatchObject({ok:true,text:'black_hat, 金发'});
 });
 it('429 is a failure, without automatic reissue or partial translation',async()=>{
  const f=production(()=>{throw Error('HTTP 429');});
  const r=await f.api('black_hat, white_dress','zh-CN','en');expect(r.ok).toBe(false);expect(r.text).toBeUndefined();expect(f.get).toHaveBeenCalledTimes(1);
 });
 it('merged or malformed batches do not silently mismatch labels',async()=>{
  for(const response of [[[['黑帽金发']],null,'en'],[[[null]],null,'en'],[[],null,'en']]) {
   const f=production(()=>response),r=await f.api('black_hat, blonde_hair','zh-CN','en');expect(r.ok).toBe(false);expect(r.text).toBeUndefined();
  }
 });
 it('same language, or protected labels only, do not send redundant requests',async()=>{
  const f=production(()=>{throw Error('should not call');});
  expect(await f.api('black_hat, blonde_hair','en','en')).toMatchObject({ok:true,text:'black_hat, blonde_hair'});
  expect(await f.api('artist:some_artist, character:misumi_uika','zh-CN','en')).toMatchObject({ok:true,text:'artist:some_artist, character:misumi_uika'});expect(f.get).not.toHaveBeenCalled();
 });
 it('ordinary prose is unchanged on the wire and source detection remains available for swap',async()=>{
  const f=production(()=>[[['你好']],null,'en']);expect(await f.api('Hello world.','zh-CN','auto')).toMatchObject({ok:true,text:'你好',sourceLanguage:'en'});expect(f.get.mock.calls[0][1].params.q).toBe('Hello world.');
 });
 it('actual production caller exercises shared missing-index counterexamples',async()=>{
  const rows=JSON.parse(fs.readFileSync('shared/google-prompt-translation-fixtures.json','utf8')).filter((r:any)=>r.id);
  for(const row of rows) {
   const words=Object.fromEntries(row.queries.flatMap((q:string,i:number)=>q.split('\n').map((s,j)=>[s,row.responses[i].split('\n')[j]])));
   const f=production(q=>[[[q.split('\n').map(s=>words[s]??s).join('\n')]],null,row.detected]);
   expect(await f.api(row.input,row.target,row.source)).toMatchObject({ok:true,text:row.output,sourceLanguage:row.detected});
   expect(f.get.mock.calls.map(c=>c[1].params.q)).toEqual(row.queries);
  }
 });
 it('category 4 bare names stay raw, category 5 metadata is translatable',async()=>{
  const f=production(()=>[[['黑色帽子']],null,'en'],{misumi_uika:4,black_hat:5});
  expect(await f.api('misumi_uika, black_hat','zh-CN','en')).toMatchObject({ok:true,text:'misumi_uika, 黑色帽子'});
 });

});
