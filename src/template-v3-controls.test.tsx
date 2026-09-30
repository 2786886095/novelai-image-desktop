import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const root=process.env.TEMPLATE_SOURCE_ROOT||process.cwd();
const read=(file:string)=>existsSync(resolve(root,file))?readFileSync(resolve(root,file),'utf8'):'';
describe('v3 template and manual comic contract',()=>{
 it('removes the automatic story split endpoint end to end',()=>{
  for(const file of ['electron/main.ts','electron/preload.ts','electron/ipc/nai.ts','src/types.ts']) {
   expect(read(file)).not.toMatch(/comic:analyzeScript|comicAnalyzeScript|function analyzeComicScript/);
  }
  expect(read('src/App.tsx')).not.toContain('settings.comicAnalyzeTemplateTitle');
  expect(read('src/comic/TagComicGenerator.tsx')).toContain('void importFile(');
 });
 it('uses compact file buttons without nested upload labels',()=>{
  const source=read('src/comic/TagComicGenerator.tsx');
  expect(source).not.toMatch(/<label className=.{0,30}tag-comic-file-button/);
  expect(source.match(/<FilePicker\s+compact/g)?.length).toBe(2);
  expect(read('src/components/FilePicker.tsx')).toContain('buttonLabel');
  expect(read('src/main.tsx')).toContain('studio-controls.css');
 });
 it('registers both independently editable assistant templates',()=>{
  for(const key of ['promptOptimizeTemplate','promptAssistantTemplate']) {
   for(const file of ['src/App.tsx','src/types.ts','electron/ipc/store.ts','src/studio-agent-contract.ts','src/prompt-assistant.ts'])expect(read(file)).toContain(key);
  }
  expect(read('electron/ipc/nai.ts')).toContain('preparePromptAssistance(chineseText,assistant,settings)');
 });
 it('ships exact supplied v3 templates and preserves former defaults for migration',()=>{
  const content=read('src/data/prompt-template-v3.json');expect(content).not.toBe('');
  const data=JSON.parse(content);
  const hashes={"reverse": "a66d4be6201e2cde9d83b25cd99cd59f82665a3ff57f07f5ef61a173b26a0121", "convert": "d038f93e3f5fa9c0bde07fdbb08ad8ea177c3d6b5b31c74092e03abc9abbcb82"};
  for(const [kind,hash] of Object.entries(hashes))expect(createHash('sha256').update(data[kind]).digest('hex')).toBe(hash);
  expect(read('src/data/prompt-template-migration.ts')).toContain('prompt-templates-pre-v3');
 });
});
