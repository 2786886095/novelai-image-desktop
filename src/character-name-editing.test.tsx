import {it, expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {CharacterNameControl} from './components/CharacterNameControl';
import {characterNameEditText, normalizeCharacterNameDraft} from './character-name-editing';
import fs from 'node:fs';
const fallback='角色 1';
it('shows a static default name and a pencil, without any idle input', () => {
  const html = renderToStaticMarkup(<CharacterNameControl fallback={fallback} language="zh-CN" onSave={()=>{throw Error('idle must not save');}}/>);
  expect(html).toContain('角色 1'); expect(html).toContain('character-name-edit');
  expect(html).not.toContain('<input'); expect(html).not.toContain('role="dialog"');
});
it('preserves an existing name and safely escapes HTML', () => {
  const html=renderToStaticMarkup(<CharacterNameControl name={'<role>'} fallback={fallback} language="zh-CN" onSave={()=>{}}/>);
  expect(html).toContain('&lt;role&gt;'); expect(html).not.toContain('<input');
});
it('normalizes only committed drafts; blank restores the default and length stays bounded', () => {
  expect(normalizeCharacterNameDraft('  芙宁娜  ')).toBe('芙宁娜');
  expect(normalizeCharacterNameDraft('   ')).toBeUndefined();
  expect(normalizeCharacterNameDraft('a'.repeat(90))).toHaveLength(64);
});
it('has matching save and cancel controls in every app language', () => {
  for (const l of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']) {
    const t=characterNameEditText(l); expect(t.edit).toBeTruthy(); expect(t.save).not.toBe(t.cancel);
  }
});
it('loads the responsive typography stylesheet and reuses the shared range primitive', () => {
  expect(fs.readFileSync('src/main.tsx','utf8')).toContain('import "./typography.css"');
  expect(fs.readFileSync('src/components/TypographySettings.tsx','utf8')).toContain('<RangeInput');
  expect(fs.readFileSync('src/typography.css','utf8')).toContain('grid-template-columns:minmax(0,1fr)');
});
