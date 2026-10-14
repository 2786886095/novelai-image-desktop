// Read the real electron-builder payload, not file-list declarations or a fixture archive.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function verifyIg5Package(archive,root=sourceRoot){
  const require=createRequire(path.join(root,'package.json'));
  const {extractFile}=require('@electron/asar');
  assert.equal(path.basename(archive),'app.asar','Expected the real packaged app.asar');
  assert.ok(fs.statSync(archive).isFile(),'Packaged app.asar is missing');
  const expectedPackage=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const packagedPackage=JSON.parse(extractFile(archive,'package.json').toString('utf8'));
  assert.equal(packagedPackage.version,expectedPackage.version,'Packaged version differs from source');
  const files=['shared/ig5-image-prompts.json','shared/ig5-NOTICE.txt','shared/ig5-LICENSE.txt','THIRD_PARTY_NOTICES.md'];
  const checks=files.map(file=>{
    const expected=fs.readFileSync(path.join(root,file)),actual=extractFile(archive,file);
    assert.deepEqual(actual,expected,'Packaged legal/provenance bytes differ: '+file);
    return {file,bytes:actual.length,sha256:crypto.createHash('sha256').update(actual).digest('hex')};
  });
  const provenance=JSON.parse(extractFile(archive,files[0]).toString('utf8'));
  assert.equal(provenance.commit,'eeff0bbeb905bdc57952dc7497d5fdfc33653c0f');
  assert.equal(provenance.license,'CC BY-NC-SA 4.0');
  assert.equal(provenance.modified,true);
  for(const task of ['convert','reverse','studio']){
    assert.equal(typeof provenance.prompts[task],'string');
    assert.equal(crypto.createHash('sha256').update(provenance.prompts[task],'utf8').digest('hex'),provenance.promptSha256[task]);
  }
  return {archive:path.resolve(archive),version:packagedPackage.version,files:checks,observed:'Source-owned IG5 attribution, full license, provenance and all three adapted prompt bodies are byte-identical inside the actual desktop package.',scope:'Desktop payload only; not a mobile-feature, legal-authorization or image-generation acceptance claim.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const archive=process.argv[2];
  if(!archive)throw Error('Usage: node scripts/verify-ig5-package.mjs /absolute/path/to/resources/app.asar');
  console.log(JSON.stringify(verifyIg5Package(archive),null,2));
}
