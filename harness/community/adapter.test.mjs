import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
import {descriptor,allowedTools} from '../plugins/studio-library/protocol.js';
test('UI RPC is bounded and exposes only the existing data operations',()=>{
 assert.deepEqual([...allowedTools].sort(),['studio_reveal_image','studio_session_material','studio_api_input','studio_resolve_api_input','langbai_read_studio_state','langbai_list_studio_data','langbai_update_studio_config','langbai_save_style_preset','langbai_import_studio_data','studio_session_state','studio_set_session_style','studio_generation_policy','studio_style_preview','studio_stop_generation','studio_workspaces','studio_cleanup_empty_workspaces','studio_image_approval','studio_resolve_image_approval','studio_prompt_template','studio_save_prompt_template','studio_panel_layout','studio_save_panel_layout'].sort());assert.ok(allowedTools.has('studio_generation_policy'));assert.ok(allowedTools.has('studio_resolve_image_approval'));assert.ok(allowedTools.has('studio_save_prompt_template')); assert.equal(allowedTools.has('langbai_generate_image'),false);
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
