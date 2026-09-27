import {it,expect} from 'vitest';
import fs from 'node:fs';
import {SOFTWARE_ACTIONS} from './software-action-contract';
import {ordinaryAgentMutations,requiresAgentConfirmation} from './operation-policy';
it('ordinary changes direct; cost/deletion/overwrite/unknown require Agent confirmation',()=>{
 for(const tool of ordinaryAgentMutations)expect(requiresAgentConfirmation(tool,{})).toBe(false);
 for(const tool of ['langbai_generate_image','langbai_convert_prompt','langbai_reverse_prompt','langbai_memory_delete','unknown'])expect(requiresAgentConfirmation(tool,{})).toBe(true);
 expect(requiresAgentConfirmation('langbai_save_style_preset',{})).toBe(false);
 expect(requiresAgentConfirmation('langbai_save_style_preset',{id:'existing'})).toBe(true);
 expect(requiresAgentConfirmation('langbai_memory_upsert',{memoryId:'existing'})).toBe(true);
});
it('Android ordinary-operation policy matches desktop',()=>{
 const source=fs.readFileSync('mobile/lib/agent/operation_policy.dart','utf8');
 const set=source.slice(source.indexOf('<String>{'),source.indexOf('};'));
 expect([...set.matchAll(/'(langbai_[^']+)'/g)].map(m=>m[1]).sort()).toEqual([...ordinaryAgentMutations].sort());
});

it('Android operation catalog and effects exactly match the desktop source',()=>{
 const source=fs.readFileSync('mobile/lib/agent/software_action_catalog.dart','utf8');
 const json=source.split("r'''")[1].split("'''")[0];
 expect(JSON.parse(json)).toEqual(SOFTWARE_ACTIONS);
 for(const [action,spec] of Object.entries(SOFTWARE_ACTIONS))expect(requiresAgentConfirmation('langbai_software_action',{action})).toBe(spec.effect==='confirm');
});
