import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'template-catalog-sync-test-'));
 t.after(()=>{const resolved=fs.realpathSync(root),parent=fs.realpathSync(os.tmpdir());assert.equal(path.dirname(resolved).toLowerCase(),parent.toLowerCase());assert.ok(path.basename(resolved).startsWith('template-catalog-sync-test-'));fs.rmSync(resolved,{recursive:true});});
 fs.mkdirSync(path.join(root,'scripts'),{recursive:true});fs.mkdirSync(path.join(root,'mobile/assets'),{recursive:true});
 fs.cpSync(path.join(source,'shared/templates'),path.join(root,'shared/templates'),{recursive:true});
 fs.copyFileSync(path.join(source,'scripts/build-template-catalog.mjs'),path.join(root,'scripts/build-template-catalog.mjs'));
 for(const name of ['prompt-skill-catalog-v3.json','comic-template-catalog.json']){
  fs.copyFileSync(path.join(source,'shared',name),path.join(root,'shared',name));fs.copyFileSync(path.join(source,'mobile/assets',name),path.join(root,'mobile/assets',name));
 }
 return root;
}
function run(root,...args){return spawnSync(process.execPath,[path.join(root,'scripts/build-template-catalog.mjs'),...args],{encoding:'utf8',timeout:30000});}
test('source body checks and byte-identical mobile catalogs both pass',t=>{
 const root=fixture(t),r=run(root,'--check');assert.equal(r.status,0,r.stderr);
});
test('check rejects byte-only mobile drift and normal generation repairs the mirror',t=>{
 const root=fixture(t),mobile=path.join(root,'mobile/assets/comic-template-catalog.json');fs.appendFileSync(mobile,'\n');
 const bad=run(root,'--check');assert.notEqual(bad.status,0);assert.match(bad.stderr,/Mobile template catalog bytes differ/);
 const fixed=run(root);assert.equal(fixed.status,0,fixed.stderr);
 for(const name of ['prompt-skill-catalog-v3.json','comic-template-catalog.json'])assert.deepEqual(fs.readFileSync(path.join(root,'shared',name)),fs.readFileSync(path.join(root,'mobile/assets',name)));
 assert.equal(run(root,'--check').status,0);
});
test('a source raw change updates both platforms without editing the raw input',t=>{
 const root=fixture(t),raw=path.join(root,'shared/templates/comic/single-panel.md');fs.appendFileSync(raw,'\r\nsource fixture change\r\n');const before=fs.readFileSync(raw);
 assert.notEqual(run(root,'--check').status,0);assert.equal(run(root).status,0);
 assert.deepEqual(fs.readFileSync(raw),before);assert.equal(run(root,'--check').status,0);
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'mobile/assets/comic-template-catalog.json'),'utf8'));
 assert.ok(catalog.templates.find(t=>t.slot==='comic.single-panel').body.endsWith('\r\nsource fixture change\r\n'));
});
