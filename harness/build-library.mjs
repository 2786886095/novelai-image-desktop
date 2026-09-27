import {build} from 'rolldown';
import fs from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'plugins/studio-library');
await fs.mkdir(path.join(root,'lib'),{recursive:true});
const result=await build({input:path.join(root,'client.js'),external:id=>id==='react'||id.startsWith('@deepseek-ai/'),output:{format:'cjs'}});
await fs.writeFile(path.join(root,'lib/client.js'),`window.__ModuleLoader__.load({id:"@langbai/dsh-studio-library",factory(require){const module={exports:{}};const exports=module.exports;\n${result.output[0].code}\nreturn module.exports;}});\n`);
console.log('LIBRARY BUILD PASS: native Harness UI module created.');
