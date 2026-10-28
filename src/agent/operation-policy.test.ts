import {it,expect} from 'vitest';
import {SOFTWARE_ACTIONS} from './software-action-contract';
import {ordinaryAgentMutations,requiresAgentConfirmation} from './operation-policy';
it('ordinary changes direct; cost/deletion/overwrite/unknown require Agent confirmation',()=>{
 for(const tool of ordinaryAgentMutations)expect(requiresAgentConfirmation(tool,{})).toBe(false);
 for(const tool of ['langbai_generate_image','langbai_convert_prompt','langbai_reverse_prompt','langbai_memory_delete','unknown'])expect(requiresAgentConfirmation(tool,{})).toBe(true);
 expect(requiresAgentConfirmation('langbai_save_style_preset',{})).toBe(false);
 expect(requiresAgentConfirmation('langbai_save_style_preset',{id:'existing'})).toBe(true);
 expect(requiresAgentConfirmation('langbai_memory_upsert',{memoryId:'existing'})).toBe(true);
});
it('software action effects decide which catalog actions require Agent confirmation',()=>{
 for(const [action,spec] of Object.entries(SOFTWARE_ACTIONS))expect(requiresAgentConfirmation('langbai_software_action',{action})).toBe(spec.effect==='confirm');
});
