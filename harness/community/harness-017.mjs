// Preserve existing validation and user code; adapt the 0.1.7 lazy-codec contract.
import iconAliases from './harness-017-icons.json' with {type:'json'};
export function adaptIcons(source){return source.replace(/\bIcon\w+(?:12|14|16|18|20|24|28|32|48)\b/g,name=>iconAliases[name]??name);}
export function adaptStrictCodecs(source) {
 return source.replace(/(mode:\s*['"]strict['"],\s*typeSymbol:\s*[^,\n]+,\s*)schema:\s*([A-Za-z_$][\w$]*)(?![\w$])/g,
  (all,prefix,schema,offset,text)=>{
   if(/^\s*,\s*create:/.test(text.slice(offset+all.length)))return all;
   return `${prefix}schema: ${schema}, create: () => ${schema}`;
  });
}
export function adaptSettingsScope(source){
 return source.replace(/(['"])settingsScope\1/g,'$1configForms$1')
  .replace(/ctx\.settingsScope\.bind\(\{\s*namespace:\s*SETTINGS_NAMESPACE\s*\}\)/g,'ctx.configForms.get(SETTINGS_NAMESPACE)');
}
