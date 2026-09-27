// Transport envelope only. rp-core keeps its strict union validation at execute.
// Harness disallows type + oneOf at one schema node; model gateways require an
// object at the tool root. Do not weaken/replace the internal validation schema.
export function commitToolEnvelope(schema){
 return {type:'object',additionalProperties:false,
  description:'Submit either a complete roleplay commit (runSummary/effects/references/extensions) OR retry only. Never combine retry with other fields. The runtime validates exact-one full-or-retry before any effect is committed.',
  properties:Object.assign({},...schema.oneOf.map(arm=>arm.properties))};
}
export function adaptCommitSchema(source){
 const old='get: () => runtime.commitParametersSchema(),';
 if(!source.includes(old))return source;
 return source.replace(old,'get: () => commitToolEnvelope(runtime.commitParametersSchema()),')+'\n'+commitToolEnvelope.toString()+'\n';
}
