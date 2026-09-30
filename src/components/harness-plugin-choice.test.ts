import {it,expect} from 'vitest';import {readFileSync} from 'node:fs';
it('keeps explicit choices, keyboard cancel, focus containment and text-only plugin messages',()=>{
 const source=readFileSync('src/components/harness-plugin-choice.ts','utf8');
 expect(source).toContain("add('cancel','暂不更新，保留现状')");expect(source).toContain("add('upgrade','升级兼容插件并继续'");expect(source).toContain("add('disable'");
 expect(source).toContain("event.key==='Escape'");expect(source).toContain("event.key==='Tab'");expect(source).toContain('cancelButton.focus()');expect(source).not.toContain('innerHTML');
});
