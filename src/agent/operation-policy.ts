import {SOFTWARE_ACTIONS} from './software-action-contract';
export const ordinaryAgentMutations=new Set([
  'langbai_update_studio_config','langbai_import_studio_data','langbai_apply_prompt','langbai_save_prompt_preset',
]);
export function requiresAgentConfirmation(tool:string,args:Record<string,unknown>):boolean {
  if(tool==='langbai_templates')return !['read','select'].includes(String(args.action));
  if(tool==='langbai_api')return !['read','test','credential'].includes(String(args.action));
  if(tool==='langbai_library')return !['read','create'].includes(String(args.action));
  if(tool==='langbai_tasks')return !['list','pause','cancel'].includes(String(args.action));
  if(tool==='langbai_backup')return !['list','inspect','create'].includes(String(args.action))||(args.action==='create'&&Array.isArray(args.categories)&&args.categories.includes('apiCredentials'));
  if(tool==='langbai_software_action'){const action=String(args.action??'');return !Object.hasOwn(SOFTWARE_ACTIONS,action)||SOFTWARE_ACTIONS[action as keyof typeof SOFTWARE_ACTIONS].effect==='confirm';}
  if(ordinaryAgentMutations.has(tool))return false;
  if(tool==='langbai_save_style_preset')return !!args.id;
  if(tool==='langbai_memory_upsert')return !!(args.id??args.memoryId);
  // New operations start confirmed until their contract is classified explicitly.
  return true;
}
