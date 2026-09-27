import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {adaptCommitSchema,commitToolEnvelope} from './commit-schema.mjs';
import {assertObjectJsonSchema,assertSupportedJsonSchema,validateJsonSchemaValue} from '../../.tmp/harness-component013/runtime/node_modules/@deepseek-ai/dsh-tools/lib/index.js';
const root='.tmp/harness-component013/community/packages/dsh-roleplay-rp-core/src/';
const source=fs.readFileSync(root+'runtime.js','utf8');
const retry=fs.readFileSync(root+'commit-retry.js','utf8').split('export function commitRetryParameterSchema()')[1].split('export function isRetryCommitArguments')[0];
function schema(code){const functions=code.slice(code.indexOf('function fullCommitParametersSchema(effectSchemas)'),code.indexOf('function normalizeCommitError(error)'));
 return Function('assertObjectJsonSchema','assertSupportedJsonSchema',`const MAX_COMMIT_RETRY_PATCHES=64;function commitRetryParameterSchema()${retry}\n${functions};return commitParametersSchema([]);`)(assertObjectJsonSchema,assertSupportedJsonSchema)}
test('reproduces missing object root and adds explicit model-facing properties',()=>{
 assert.equal(schema(source).type,undefined);const fixed=adaptCommitSchema(source),s=commitToolEnvelope(schema(fixed));
 assert.equal(s.type,'object');assert.deepEqual(Object.keys(s.properties),['runSummary','effects','references','extensions','retry']);assert.doesNotThrow(()=>assertObjectJsonSchema(s));assert.equal(schema(fixed).oneOf.length,2);assert.equal(adaptCommitSchema(fixed),fixed);
 assert.match(fixed,/get: \(\) => commitToolEnvelope\(runtime.commitParametersSchema\(\)\)/);
});
test('keeps strict full/retry mutual exclusion and malformed-input rejection',()=>{
 const before=schema(source),after=schema(adaptCommitSchema(source));
 for(const value of [{},{runSummary:'test',effects:[]},{retry:{token:'t',patches:[{op:'remove',path:'/runSummary'}]}},null,[],{unexpected:1},{runSummary:'test',retry:{token:'t',patches:[]}},{effects:'wrong'}]){
  assert.equal(validateJsonSchemaValue(before,value,'').length===0,validateJsonSchemaValue(after,value,'').length===0);
 }
 assert.ok(validateJsonSchemaValue(after,{runSummary:'x',retry:{token:'t',patches:[]}},'').length>0);
});
