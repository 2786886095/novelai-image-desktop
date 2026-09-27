import {test} from 'node:test';import assert from 'node:assert/strict';
import {approvalSummary} from '../plugins/studio-library/approval-summary.js';
import fs from 'node:fs';
test('template consent names actual operation and target, never promises generation',()=>{
 const s=approvalSummary({tool:'langbai_templates',parameters:{action:'restore',kind:'reverse',templateVersion:'v4.5',mode:'mixed'}});
 assert.equal(s.confirm,'确认恢复');assert.equal(s.target,'图片反推 · v4.5 · 混合模式');assert.match(s.description,/备份/);assert.match(s.description,/不生成图片/);
});
test('public model catalog exposes templates, never private credential resolution or automatic self-authorization',()=>{
 const src=fs.readFileSync('harness/plugins/studio-data/index.js','utf8');
 assert.match(src,/templates:/);assert.match(src,/expectedRevision/);
 assert.doesNotMatch(src,/studio_resolve_api_input|studio_generation_policy|studio_resolve_image_approval/);
});
