import {beforeEach,describe,it,expect,vi} from 'vitest';
import type {AppSettings} from '../../types';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {getBuiltinTemplates,type TemplateLibraryState} from '../../../shared/template-library';

const fixture=vi.hoisted(()=>({family:'image' as 'image'|'comic',library:null as TemplateLibraryState|null}));
vi.mock('react',async original=>{
 const real=await original<typeof import('react')>();
 return {...real,useState:(initial:any)=>real.useState(()=>{
  const value=typeof initial==='function'?initial():initial;
  if(value&&typeof value==='object'&&Array.isArray(value.builtins)&&fixture.library)return fixture.library;
  if(value==='image')return fixture.family;
  if(value==='image.reverse.tags'&&fixture.family==='comic')return 'comic.jp-page';
  return value;
 })};
});
vi.mock('../../components/ui',()=>({Button:({children,variant:_,...props}:any)=>createElement('button',props,children),SelectMenuCompat:({children,...props}:any)=>createElement('select',props,children)}));
vi.mock('../../components/confirm',()=>({confirmAction:vi.fn(async()=>false)}));
import {TemplateLibraryPanel,templateLibraryCopy,templateSlotLabel} from './TemplateLibraryPanel';

const bridge={templateLibraryGet:vi.fn(),templateLibraryMutate:vi.fn(),setSetting:vi.fn()};
const settings={language:'zh-CN',reversePromptSkillVersion:'2.0.0',convertPromptSkillVersion:'2.0.0'} as AppSettings;
const render=(s=settings)=>renderToStaticMarkup(createElement(TemplateLibraryPanel,{settings:s,onSettingsChanged:vi.fn(async()=>{})}));
beforeEach(()=>{fixture.family='image';fixture.library=null;vi.clearAllMocks();vi.stubGlobal('window',{naiDesktop:bridge,dispatchEvent:vi.fn()});});

describe('template library SSR structure (not real click acceptance)',()=>{
 it('renders six independent image slots and a read-only complete builtin body',()=>{
  const html=render(),nav=html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)?.[0]??'';
  expect(nav.match(/<button\b/g)).toHaveLength(6);expect(nav).toContain('反推 · 纯 Tag');expect(nav).toContain('文字转换 · 混合');
  expect(html).toMatch(/<textarea\b[^>]*readOnly/i);expect(html).toContain('图片模板 · 6 套');expect(html).toContain('漫画模板 · 2 套');
  expect(html).toContain(getBuiltinTemplates().find(x=>x.slot==='image.reverse.tags')!.body.split('\n')[0]);
 });
 it('comic category has exactly two slots with true original versions, not three image modes',()=>{
  fixture.family='comic';const html=render(),nav=html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)?.[0]??'';
  expect(nav.match(/<button\b/g)).toHaveLength(2);expect(nav).toContain('日式整页');expect(nav).toContain('单分镜');expect(nav).toContain('v4.1');expect(nav).toContain('v1.0');expect(nav).not.toContain('3.0.0');expect(nav).not.toContain('自然语言');expect(nav).not.toContain('纯 Tag');
  expect(html).toContain('单分镜是一张单格图算一页');
 });
 it('does not claim a V3 image slot is currently active when settings still select an older edition',()=>{
  expect(render()).toContain('当前图片使用旧版');const modern={...settings,reversePromptSkillVersion:'3.0.0'} as AppSettings;expect(render(modern)).not.toContain('当前图片使用旧版');
 });
 it('custom body is escaped as inert textarea text and remains editable rather than changing a builtin',()=>{
  fixture.library={revision:'fixture',custom:[{id:'custom-one',slot:'image.reverse.tags',name:'Private <name>',body:'<script>notExecuted()</script> {{input}}',sha256:'fixture-only',origin:{kind:'blank'},createdAt:'2026-10-27',updatedAt:'2026-10-27',rev:1}],selection:{'image.reverse.tags':{kind:'custom',id:'custom-one'}},builtins:getBuiltinTemplates(),warnings:[]};
  const html=render(),textarea=html.match(/<textarea\b[^>]*>/)?.[0]??'';expect(textarea).not.toMatch(/readOnly/i);expect(html).toContain('&lt;script&gt;notExecuted()&lt;/script&gt;');expect(html).not.toContain('<script>');expect(html).toContain('Private &lt;name&gt;');expect(html).toContain('保存修改');
 });
 it('supports five existing languages and retains distinct labels for eight slots',()=>{
  for(const language of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']){
   const copy=templateLibraryCopy(language);expect(copy[0]).toBeTruthy();expect(copy[1]).toContain('6');expect(copy[2]).toContain('2');expect(new Set(getBuiltinTemplates().map(t=>templateSlotLabel(t.slot,language))).size).toBe(8);
  }
 });
 it('exposes explicit TXT/MD/JSON import without executing effects or any account/paid operation during SSR',()=>{
  const html=render();expect(html).toContain('.txt,.md,.json');expect(html).toContain('导入不会覆盖已有模板');expect(bridge.templateLibraryGet).not.toHaveBeenCalled();expect(bridge.templateLibraryMutate).not.toHaveBeenCalled();expect(bridge.setSetting).not.toHaveBeenCalled();
 });
});
