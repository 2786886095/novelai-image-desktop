import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {derivePromptModeTemplate} from './data/prompt-mode-derived';
import {resolveModePrompt} from './prompt-mode';
import {CONVERT_SYSTEM_PROMPTS,REVERSE_SYSTEM_PROMPTS} from './data/prompt-templates';
const cases=JSON.parse(readFileSync(process.env.PROMPT_DERIVE_CONTENT_INPUT ?? 'tests/fixtures/prompt-derive-content.json','utf8')) as {name:string;source:string;required:string[]}[];
for(const mode of ['tags','natural'] as const)for(const c of cases)it(mode+' '+c.name,()=>{const result=derivePromptModeTemplate(c.source,mode);for(const detail of c.required)expect(result).toContain(detail);expect(result).not.toMatch(/(?:Tag|自然语言)\s*(?:占|保持约)\s*\d+(?:[–—-]\d+)?%/);});
for(const [task,defaults] of Object.entries({reverse:REVERSE_SYSTEM_PROMPTS,convert:CONVERT_SYSTEM_PROMPTS}))for(const mode of ['tags','natural'] as const)it(task+' '+mode+' saved mixed facts survive real resolver',()=>{const mixed=cases.map(c=>c.source).join('\n'),saved={mixed},before=JSON.stringify(saved);const result=resolveModePrompt(mode,saved,undefined,defaults);for(const c of cases)for(const detail of c.required)expect(result).toContain(detail);expect(JSON.stringify(saved)).toBe(before);});
it('mixed remains byte-identical',()=>{for(const c of cases)expect(derivePromptModeTemplate(c.source,'mixed')).toBe(c.source);});
