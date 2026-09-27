// Shared, bounded scalar wire contract; the existing Studio bridge validates each operation.
const stringSchema={parse(value){if(typeof value!=='string'||value.length>2_000_000)throw new Error('Invalid Studio RPC value');return value;}};
export const packageName='@langbai/dsh-studio-library';
export const descriptor={id:packageName+'#studioLibrary/call',service:'studioLibrary',namespace:'studioLibrary',method:'call',invocation:{kind:'direct'},
 parameters:['tool','payload','callId'].map(name=>({name,wire:name,source:'json',codec:{mode:'strict',typeSymbol:packageName+'#'+name,schema:stringSchema,create:()=>stringSchema}})),
 cancellation:{parameter:'signal'},result:{mode:'strict',typeSymbol:packageName+'#result',schema:stringSchema,create:()=>stringSchema},
};
export const allowedTools=new Set(['studio_session_material','studio_api_input','studio_resolve_api_input','langbai_read_studio_state','langbai_list_studio_data','langbai_update_studio_config','langbai_save_style_preset','langbai_import_studio_data']);
allowedTools.add('studio_reveal_image');
for(const name of ['studio_session_state','studio_set_session_style','studio_generation_policy','studio_style_preview','studio_stop_generation','studio_workspaces','studio_cleanup_empty_workspaces'])allowedTools.add(name);
for(const name of ['studio_image_approval','studio_resolve_image_approval','studio_prompt_template','studio_save_prompt_template','studio_panel_layout','studio_save_panel_layout'])allowedTools.add(name);
