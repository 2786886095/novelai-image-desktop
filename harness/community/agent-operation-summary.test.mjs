import test from 'node:test';import assert from 'node:assert/strict';
import {approvalSummary} from '../plugins/studio-library/approval-summary.js';
test('collection removals retain files and navigation reset only changes ordering',()=>{
 for(const action of ['favorites.local.remove','favorites.online.remove']){
  const s=approvalSummary({tool:'langbai_software_action',parameters:{action,id:'bookmark-1'}});assert.match(s.description,/保留|不影响/);assert.equal(s.confirm,'确认移出收藏');
 }
 const s=approvalSummary({tool:'langbai_software_action',parameters:{action:'navigation.reset'}});assert.match(s.description,/排列/);
});
test('Android software update explains system authorization rather than promising silent restart',()=>{
 const s=approvalSummary({tool:'langbai_software_action',parameters:{action:'app.update.install',platform:'android',currentVersion:'2.4.3',version:'2.4.4',downloadBytes:1048576}});
 assert.match(s.description,/Android 系统可能要求安装权限或确认/);assert.match(s.description,/不代表更新成功/);assert.equal(s.confirm,'确认更新软件');assert.doesNotMatch(s.title,/自动重启/);
});
test('operation confirmation shows user-facing target, categories and effect instead of opaque tool names',()=>{
 const backup=approvalSummary({tool:'langbai_backup',parameters:{action:'restore','备份':'yesterday.naisbackup',categories:['promptPresets','apiCredentials']}});
 assert.equal(backup.title,'恢复所选备份');assert.match(backup.categories,/API 凭据/);assert.equal(backup.target,'yesterday.naisbackup');
 const library=approvalSummary({tool:'langbai_library',parameters:{action:'delete',collection:'characters','名称':'小雨'}});assert.equal(library.target,'角色卡 · 小雨');assert.equal(library.confirm,'确认删除');
 const tasks=approvalSummary({tool:'langbai_tasks',parameters:{action:'resume'}});assert.match(tasks.description,/Anlas/);
});

test('API confirmation presents destination and credential reuse before saving',()=>{const s=approvalSummary({tool:'langbai_api',parameters:{action:'configure','名称':'提示词转换','修改':{baseUrl:'https://new.example/v1'}}});assert.match(s.target,/https:\/\/new.example/);assert.match(s.description,/现有凭据/);});
test('resource installation confirmation shows target, size, origin and retained data',()=>{
 const s=approvalSummary({tool:'langbai_software_action',parameters:{action:'resources.download',id:'tagCatalog',resource:{label:'标签数据库',downloadBytes:46772224,sourceUrl:'https://example.test/source',license:'Unlicense'}}});
 assert.match(s.target,/44.6 MiB/);assert.match(s.target,/example.test/);assert.match(s.target,/Unlicense/);assert.match(s.description,/旧版保留/);assert.equal(s.confirm,'确认下载安装');
});
test('app update confirmation distinguishes a restart from component installation',()=>{
 const s=approvalSummary({tool:'langbai_software_action',parameters:{action:'app.update.install',currentVersion:'2.4.3',version:'2.4.4',downloadBytes:1048576,sourceUrl:'https://github.com/2786886095/novelai-image-desktop'}});
 assert.match(s.target,/2.4.3 → 2.4.4/);assert.match(s.target,/1.0 MiB/);assert.match(s.description,/重启后核对版本/);assert.equal(s.confirm,'确认更新并重启');
});

test('desktop and Android comic batch approval display actual count and one-shot semantics',()=>{
 for(const count of [{plannedImages:12,estimatedAnlas:24},{count:12}]){
  const summary=approvalSummary({tool:'langbai_software_action',parameters:{action:'comic.generation.start',mode:'initial',...count}});
  assert.match(summary.target,/12 张图片/);assert.match(summary.target,/补足初始候选/);assert.match(summary.description,/不会再次逐张确认/);assert.match(summary.description,/失败会停止/);assert.equal(summary.confirm,'确认本批生成');
 }
});

test('compatible comic approval names the configured model and provider billing, never native Anlas',()=>{
 const summary=approvalSummary({tool:'langbai_software_action',parameters:{action:'comic.generation.start',mode:'initial',imageProvider:'openai-images',model:'configured-model',size:'1024x1024',count:12,estimatedAnlas:0}});
 assert.match(summary.target,/configured-model/);assert.match(summary.target,/1024x1024/);assert.match(summary.target,/12 张图片/);
 assert.match(summary.description,/费用以服务商为准/);assert.doesNotMatch(JSON.stringify(summary),/Anlas/);
 assert.match(summary.description,/不会再次逐张确认/);
});

test('batch redraw approval describes a single batch, not comic panels',()=>{const s=approvalSummary({tool:'langbai_software_action',parameters:{action:'batch.generation.start',mode:'all',projectTitle:'fixtures',plannedImages:12}});assert.equal(s.title,'确认批量重绘');assert.match(s.target,/12 张图片/);assert.match(s.description,/不会再次逐张确认/);assert.doesNotMatch(s.description,/漫画/);});
