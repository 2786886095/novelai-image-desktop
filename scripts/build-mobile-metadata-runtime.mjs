// Compile the SAME production official Worker for isolated Android/iOS WebViews.
// Public parser/WASM assets are NOT bundled: online mode downloads/validates them.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {build}=require('vite');
const result=await build({root,configFile:false,logLevel:'warn',build:{write:false,target:'es2020',minify:true,
  lib:{entry:path.join(root,'src/official-metadata-worker.ts'),formats:['iife'],name:'OfficialMetadataWorker'}}});
const output=Array.isArray(result)?result[0].output:result.output;
const entry=output.find(item=>item.type==='chunk'&&item.isEntry);
if(!entry)throw Error('Actual production official Worker was not bundled');
const worker=Buffer.from(entry.code);
const host=fs.readFileSync(path.join(root,'mobile/assets/metadata/official_metadata_host.js'));
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const sourceFiles=['src/official-metadata-worker.ts','src/png-metadata-codecs.ts','src/image-metadata-pixels.ts','shared/official-metadata-assets.ts'];
const manifest={schema:1,workerSha256:hash(worker),hostSha256:hash(host),sources:sourceFiles.map(file=>({file,sha256:hash(fs.readFileSync(path.join(root,file)))}))};
const shared=fs.readFileSync(path.join(root,'shared/official-metadata-assets.ts'),'utf8');
const assets=[...shared.matchAll(/\{ id: "([^"]+)", url: "([^"]+)", bytes: (\d+), sha256: "([a-f0-9]{64})", kind: "([^"]+)" \}/g)].map(m=>({id:m[1],url:m[2],bytes:Number(m[3]),sha256:m[4],kind:m[5]}));
if(assets.length!==10)throw Error('Review required: official asset inventory changed');
const dart=`// GENERATED from shared/official-metadata-assets.ts; do not discover remote URLs.\nclass OfficialMetadataAsset {\n  final String id, url, sha256, kind;\n  final int bytes;\n  const OfficialMetadataAsset(this.id,this.url,this.bytes,this.sha256,this.kind);\n}\nconst officialMetadataAssets = <OfficialMetadataAsset>[\n${assets.map(a=>`  OfficialMetadataAsset('${a.id}','${a.url}',${a.bytes},'${a.sha256}','${a.kind}'),`).join('\n')}\n];\n`;
const licenses=['Metadata runtime source codec dependencies (unused exports may be tree-shaken):\n'];
for(const name of ['pako','fast-png','iobuffer']){
  const directory=path.join(root,'node_modules',name);
  const pkg=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
  licenses.push(`\n--- ${name} ${pkg.version} ---\n`+fs.readFileSync(path.join(directory,'LICENSE'),'utf8'));
}
licenses.push('\n--- Project-owned worker/adapters: MIT ---\n'+fs.readFileSync(path.join(root,'LICENSE'),'utf8'));
const outputs=[['mobile/assets/metadata/official_metadata_worker.js',worker],['mobile/assets/metadata/runtime_manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n')],['mobile/lib/images/official_metadata_assets.dart',Buffer.from(dart)],['mobile/assets/metadata/THIRD_PARTY_LICENSES.txt',Buffer.from(licenses.join('\n'))]];
for(const [file,bytes] of outputs){
  const target=path.join(root,file);
  if(process.argv.includes('--check')){if(!fs.existsSync(target)||!fs.readFileSync(target).equals(bytes))throw Error('Stale mobile official runtime: '+file);}
  else {fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
}
console.log(JSON.stringify({observed:process.argv.includes('--check')?'MOBILE_METADATA_RUNTIME_CURRENT':'MOBILE_METADATA_RUNTIME_COMPILED',workerBytes:worker.length,workerSha256:hash(worker),assets:assets.length,manifest},null,2));
