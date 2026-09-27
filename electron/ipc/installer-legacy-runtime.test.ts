import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {it,expect,afterEach,describe} from 'vitest';
const roots:string[]=[];
afterEach(()=>{for(const p of roots.splice(0)){if(path.dirname(p)!==os.tmpdir()||!path.basename(p).startsWith('studio-legacy-'))throw Error('Unexpected fixture');fs.rmSync(p,{recursive:true,force:true});}});
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-legacy-'));roots.push(root);
 const install=path.join(root,'Studio'),seed=path.join(install,'resources','harness-seed'),ledger=path.join(root,'ledger.json');fs.mkdirSync(seed,{recursive:true});
 fs.writeFileSync(path.join(seed,'manifest.json'),JSON.stringify({format:1,platform:'win32',cli:'runtime/bin.js',files:{'runtime/bin.js':'abc'}}));
 const long=path.join(seed,'runtime','node_modules','deep'.repeat(35),'nested'.repeat(18),'file.txt');fs.mkdirSync(path.dirname(long),{recursive:true});fs.writeFileSync(long,'original bytes');
 fs.writeFileSync(path.join(seed,'unknown-custom-file.txt'),'retain custom file');
 const user=path.join(root,'user-home.txt');fs.writeFileSync(user,'user data');
 const run=(operation:string,selectedInstall=install)=>spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('build/stage-legacy-runtime.ps1'),'-Operation',operation,'-Ledger',ledger,'-InstallDir',selectedInstall],{windowsHide:true,encoding:'utf8',timeout:20000});
 return {root,install,seed,ledger,long,user,run};
}
describe.skipIf(process.platform!=='win32')('legacy NSIS long-path migration',()=>{
 it('moves a whole runtime, preserves long/custom files, and restores exact bytes on cancellation',()=>{
  const f=fixture();const r=f.run('Stage');expect(r.status,r.stdout+r.stderr).toBe(0);expect(fs.existsSync(f.seed)).toBe(false);
  const entries=JSON.parse(fs.readFileSync(f.ledger,'utf8').replace(/^\uFEFF/,''));expect(entries).toHaveLength(1);
  expect(fs.readFileSync(path.join(entries[0].destination,path.relative(f.seed,f.long)),'utf8')).toBe('original bytes');
  expect(f.run('Restore').status).toBe(0);expect(fs.readFileSync(f.long,'utf8')).toBe('original bytes');expect(fs.readFileSync(f.user,'utf8')).toBe('user data');
 },30000);
 it('keeps a recovery receipt after success and never overwrites a replacement source',()=>{
  const f=fixture();expect(f.run('Stage').status).toBe(0);expect(f.run('Commit').status).toBe(0);
  const [e]=JSON.parse(fs.readFileSync(f.ledger,'utf8').replace(/^\uFEFF/,''));expect(fs.existsSync(path.join(path.dirname(e.destination),'preserved-runtime.json'))).toBe(true);
  const receipt=JSON.parse(fs.readFileSync(path.join(path.dirname(e.destination),'preserved-runtime.json'),'utf8').replace(/^\uFEFF/,''));expect(receipt).toEqual(e);
  fs.mkdirSync(f.seed);fs.writeFileSync(path.join(f.seed,'replacement'),'new');expect(f.run('Restore').status).toBe(22);
  expect(fs.readFileSync(path.join(e.destination,'unknown-custom-file.txt'),'utf8')).toBe('retain custom file');expect(fs.readFileSync(path.join(f.seed,'replacement'),'utf8')).toBe('new');
 },30000);
 it('refuses unknown runtime roots without moving user files',()=>{
  const f=fixture();fs.writeFileSync(path.join(f.seed,'manifest.json'),'{}');expect(f.run('Stage').status).toBe(22);expect(fs.existsSync(f.long)).toBe(true);
 },30000);
 it('refuses a linked runtime directory without traversing or moving its target',()=>{
  const f=fixture(),external=path.join(f.root,'external-runtime');fs.renameSync(f.seed,external);fs.symlinkSync(external,f.seed,'junction');
  expect(f.run('Stage').status).toBe(22);expect(fs.readFileSync(f.long,'utf8')).toBe('original bytes');expect(fs.lstatSync(f.seed).isSymbolicLink()).toBe(true);
 },30000);
 it('serializes separate recovery records for multiple old install locations',()=>{
  const a=fixture(),b=fixture();expect(a.run('Stage').status).toBe(0);expect(a.run('Stage',b.install).status).toBe(0);
  const entries=JSON.parse(fs.readFileSync(a.ledger,'utf8').replace(/^\uFEFF/,''));expect(entries).toHaveLength(2);
  expect(a.run('Commit').status).toBe(0);
  for(const e of entries){expect(JSON.parse(fs.readFileSync(path.join(path.dirname(e.destination),'preserved-runtime.json'),'utf8').replace(/^\uFEFF/,''))).toEqual(e);}
  expect(a.run('Restore').status).toBe(0);expect(fs.readFileSync(a.long,'utf8')).toBe('original bytes');expect(fs.readFileSync(b.long,'utf8')).toBe('original bytes');
 },30000);
});
