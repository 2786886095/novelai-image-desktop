import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {featureText} from './feature-text';
import {useFeatureText} from './feature-i18n';
describe('application message formatting',()=>{
 it('fills placeholders and keeps prefixes, unknown placeholders and raw diagnostics intact',()=>{
  expect(featureText('zh-CN','画风候选 {number}',{number:5})).toBe('画风候选 5');
  expect(featureText(undefined,'Error: 请选择目标图片。')).toBe('Error: 请选择目标图片。');
  expect(featureText('en-US','Error: 画风候选 {number}',{number:5})).toBe('Error: 画风候选 5');
  expect(featureText('zh-CN','{done}/{total} 已完成',{done:1})).toBe('1/{total} 已完成');
  const raw='EPERM: symlink C:/用户/sdk -> D:/目标/sdk';expect(featureText('zh-CN',raw)).toBe(raw);
 });
 it('gives components one stable formatter',()=>{
  const ft=useFeatureText();
  expect(useFeatureText()).toBe(ft);
  expect(ft('移除 {name}',{name:'A'})).toBe('移除 A');
 });
 it('keeps README.md local links valid and drops the removed translated READMEs',()=>{
  const source=readFileSync('README.md','utf8');
  expect(source).not.toMatch(/README\.(?:zh-TW|en|ja|ko)\.md/);
  for(const match of source.matchAll(/\]\(\.\/([^\s)]+)\)/g)){expect(existsSync(decodeURIComponent(match[1].split('#')[0])),'README.md: '+match[1]).toBe(true);}
 });
});
