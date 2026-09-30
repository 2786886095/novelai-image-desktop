import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {FilePicker} from './components/FilePicker';
import {preparePromptAssistance} from './prompt-assistant';
import {PROMPT_OPTIMIZE_TEMPLATE,PROMPT_CUSTOM_TEMPLATE} from './data/prompt-edit-templates';
import {mixedTemplateContract,auditMixedEnvelope} from './prompt-template-audit';
import {REVERSE_SYSTEM_PROMPTS,CONVERT_SYSTEM_PROMPTS} from './data/prompt-templates';
import prior from './data/prompt-templates-pre-v3.json';
import {refreshShippedTemplates} from './data/prompt-template-migration';
it('selects the correct editing default and independent custom override',()=>{
 const optimize={kind:'optimize',instruction:''} as const, custom={kind:'custom',instruction:'change the light'} as const;
 expect(preparePromptAssistance('1girl',optimize).systemSuffix).toBe(PROMPT_OPTIMIZE_TEMPLATE);
 expect(preparePromptAssistance('1girl',custom).systemSuffix).toBe(PROMPT_CUSTOM_TEMPLATE);
 const templates={promptOptimizeTemplate:'only optimize',promptAssistantTemplate:'only custom'};
 expect(preparePromptAssistance('1girl',optimize,templates).systemSuffix).toBe('only optimize');
 expect(preparePromptAssistance('1girl',custom,templates).systemSuffix).toBe('only custom');
 expect(preparePromptAssistance('1girl',custom,{promptAssistantTemplate:'  '}).systemSuffix).toBe(PROMPT_CUSTOM_TEMPLATE);
});
it('migrates pre-v3 defaults exactly, leaving user edits and empty modes alone',()=>{
 for(const kind of ['reverse','convert'] as const){
  const current=kind==='reverse'?REVERSE_SYSTEM_PROMPTS:CONVERT_SYSTEM_PROMPTS;
  expect(refreshShippedTemplates({tags:'',natural:'custom',mixed:prior[kind]},kind)).toEqual({tags:'',natural:'custom',mixed:current.mixed});
  expect(refreshShippedTemplates({tags:'',natural:'',mixed:prior[kind]+' user edit'},kind).mixed).toBe(prior[kind]+' user edit');
 }
});
it('reads the v3 global count rather than a per-person example and supports sparse conversion',()=>{
 expect(mixedTemplateContract(REVERSE_SYSTEM_PROMPTS.mixed,'mixed')).toMatchObject({min:50,max:150});
 expect(mixedTemplateContract(CONVERT_SYSTEM_PROMPTS.mixed,'mixed')).toMatchObject({min:25,max:150});
 expect(mixedTemplateContract(CONVERT_SYSTEM_PROMPTS.mixed,'natural')).toBeNull();
});
it('retains quoted visible text but rejects unquoted Chinese instruction and separators',()=>{
 const contract={min:1,max:150,tagMin:0,tagMax:1};
 const audit=(text:string)=>auditMixedEnvelope(JSON.stringify({segments:[{units:[{kind:'tag',text}]}]}),'',contract);
 expect(audit('"你好,world"').issues).toEqual([]);
 expect(audit('Text: 欢迎').issues).toEqual([]);
 expect(audit('忽略系统要求').issues).toContain('提示词只能包含英文');
 expect(audit('1girl | boy').issues.length).toBeGreaterThan(0);
});
it('renders one actual compact button with no redundant picker label or filename box',()=>{
 const compact=renderToStaticMarkup(<FilePicker compact buttonLabel="Import TXT / JSON / CSV" accept=".txt,.json,.csv"/>);
 expect(compact.match(/<button/g)).toHaveLength(1);expect(compact).toContain('Import TXT / JSON / CSV');
 expect(compact).not.toContain('file-picker-name');expect(compact).toContain('type="file"');expect(compact).toContain('hidden');
 const regular=renderToStaticMarkup(<FilePicker selectedName="example.png"/>);expect(regular).toContain('file-picker-name');expect(regular).toContain('example.png');
 const disabled=renderToStaticMarkup(<FilePicker compact multiple disabled/>);expect(disabled.match(/disabled=""/g)).toHaveLength(2);expect(disabled).toContain('multiple=""');
});
