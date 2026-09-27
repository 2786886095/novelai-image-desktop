import ts from 'typescript';import fs from 'node:fs';
const source=fs.readFileSync('src/agent/software-action-contract.ts','utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const result={};new Function('exports',code)(result);
const json=JSON.stringify(result.SOFTWARE_ACTIONS,null,2);
fs.writeFileSync('mobile/lib/agent/software_action_catalog.dart',`// Generated from src/agent/software-action-contract.ts; do not hand-edit.\nimport 'dart:convert';\nfinal Map<String,dynamic> softwareActionCatalog=Map<String,dynamic>.from(jsonDecode(r'''${json}'''));\n`);
console.log('Shared action catalog generated: '+Object.keys(result.SOFTWARE_ACTIONS).length);

const librarySource=fs.readFileSync('src/agent/library-contract.ts','utf8');const libraryCode=ts.transpileModule(librarySource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const library={};new Function('exports',libraryCode)(library);
fs.writeFileSync('mobile/lib/agent/library_fields.dart',`// Generated from src/agent/library-contract.ts; do not edit.\nimport 'dart:convert';\nfinal Map<String,dynamic> libraryFields=Map<String,dynamic>.from(jsonDecode(r'''${JSON.stringify(library.LIBRARY_FIELDS,null,2)}'''));\n`);
console.log('Shared library schemas generated: '+Object.keys(library.LIBRARY_FIELDS).length);

const workflowCode=ts.transpileModule(fs.readFileSync('src/agent/workflow-catalog.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const workflows={};new Function('exports',workflowCode)(workflows);
fs.writeFileSync('mobile/lib/agent/workflow_catalog.dart',`// Generated from src/agent/workflow-catalog.ts; do not edit.\nimport 'dart:convert';\nfinal List<dynamic> softwareWorkflows=jsonDecode(r'''${JSON.stringify(workflows.SOFTWARE_WORKFLOWS,null,2)}''') as List;\n`);
console.log('Shared user workflows generated: '+workflows.SOFTWARE_WORKFLOWS.length);

const apiCode=ts.transpileModule(fs.readFileSync('src/agent/api-contract.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const api={};new Function('exports',apiCode)(api);
fs.writeFileSync('mobile/lib/agent/api_catalog.dart',`// Generated from src/agent/api-contract.ts; do not edit.\nimport 'dart:convert';\nfinal Map<String,dynamic> apiProfiles=Map<String,dynamic>.from(jsonDecode(r'''${JSON.stringify(api.API_PROFILES,null,2)}'''));\n`);
console.log('API profiles generated: '+Object.keys(api.API_PROFILES).length);
