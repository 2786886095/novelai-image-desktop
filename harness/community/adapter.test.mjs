import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
import {descriptor,allowedTools} from '../plugins/studio-library/protocol.js';
test('UI RPC is bounded and exposes only the existing data operations',()=>{
 assert.equal(allowedTools.size,4);assert.equal(allowedTools.has('langbai_generate_image'),false);
 assert.throws(()=>descriptor.parameters[0].codec.schema.parse({}));assert.throws(()=>descriptor.result.schema.parse('x'.repeat(2_000_001)));
 assert.equal(descriptor.result.schema.parse('{"ok":true}'),'{"ok":true}');
});
test('community seed contains licensed standalone clients and the persona API adapter',async()=>{
 const root=path.resolve('.tmp/harness-community');const meta=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
 assert.equal(meta.packages.length,28);assert.equal(meta.harnessServices,'0.1.7-rc.2');
 for(const name of meta.packages){const folder=path.join(root,'packages',name),pkg=JSON.parse(await fs.readFile(path.join(folder,'package.json'),'utf8'));assert.equal(pkg.name,name);assert.match(await fs.readFile(path.join(folder,'LICENSE'),'utf8'),/MIT|Permission is hereby granted/);if(pkg.exports?.['./client'])assert.ok((await fs.stat(path.join(folder,pkg.exports['./client']))).size>0);}
 assert.match(await fs.readFile(path.join(root,'packages/dsh-roleplay-rp-standard/presets/roleplay/agent.cordis.yml'),'utf8'),/prefix: __RP_PERSONA_TEXT__/);
 assert.match(await fs.readFile(path.join(root,'packages/dsh-roleplay-rp-standard/src/index.js'),'utf8'),/hasUserPresetChanges/);
 assert.match(await fs.readFile(path.join(root,'packages/dsh-roleplay-rp-library/src/session-bootstrap.js'),'utf8'),/message, stream: \[\]/);
 assert.match(await fs.readFile(path.join(root,'community.patch.yml'),'utf8'),/maintenanceEnabled: false/);
});
