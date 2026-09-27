// Shared, bounded scalar wire contract; the existing Studio bridge validates each operation.
const stringSchema={parse(value){if(typeof value!=='string'||value.length>2_000_000)throw new Error('Invalid Studio RPC value');return value;}};
export const packageName='@langbai/dsh-studio-library';
export const descriptor={id:packageName+'#studioLibrary/call',service:'studioLibrary',namespace:'studioLibrary',method:'call',invocation:{kind:'direct'},
 parameters:['tool','payload','callId'].map(name=>({name,wire:name,source:'json',codec:{mode:'strict',typeSymbol:packageName+'#'+name,schema:stringSchema,create:()=>stringSchema}})),
 cancellation:{parameter:'signal'},result:{mode:'strict',typeSymbol:packageName+'#result',schema:stringSchema,create:()=>stringSchema},
};
export const allowedTools=new Set(['langbai_read_studio_state','langbai_list_studio_data','langbai_update_studio_config','langbai_save_style_preset']);
