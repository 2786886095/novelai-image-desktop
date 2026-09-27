import test from 'node:test';import assert from 'node:assert/strict';
import {approvalSummary} from '../plugins/studio-library/approval-summary.js';
test('operation confirmation shows user-facing target, categories and effect instead of opaque tool names',()=>{
 const backup=approvalSummary({tool:'langbai_backup',parameters:{action:'restore','备份':'yesterday.naisbackup',categories:['promptPresets','apiCredentials']}});
 assert.equal(backup.title,'恢复所选备份');assert.match(backup.categories,/API 凭据/);assert.equal(backup.target,'yesterday.naisbackup');
 const library=approvalSummary({tool:'langbai_library',parameters:{action:'delete',collection:'characters','名称':'小雨'}});assert.equal(library.target,'角色卡 · 小雨');assert.equal(library.confirm,'确认删除');
 const tasks=approvalSummary({tool:'langbai_tasks',parameters:{action:'resume'}});assert.match(tasks.description,/Anlas/);
});

test('API confirmation presents destination and credential reuse before saving',()=>{const s=approvalSummary({tool:'langbai_api',parameters:{action:'configure','名称':'提示词转换','修改':{baseUrl:'https://new.example/v1'}}});assert.match(s.target,/https:\/\/new.example/);assert.match(s.description,/现有凭据/);});
