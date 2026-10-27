import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
const root=process.env.TEMPLATE_SOURCE_ROOT||process.cwd();
const read=(name:string)=>readFileSync(path.join(root,name),'utf8');

describe('Japanese comic integration wiring (source contract, not native click acceptance)',()=>{
 it('uses an early comic-only converter branch before the image three-mode UI',()=>{
  const app=read('src/App.tsx');const start=app.indexOf("if(convertTarget==='comic')");expect(start).toBeGreaterThan(0);const end=app.indexOf('\n  return (',start);expect(end).toBeGreaterThan(start);const branch=app.slice(start,end);
  expect(branch).toContain('<ComicPromptComposer');expect(branch).not.toContain('mode-selector');expect(branch).not.toContain('runConvertPrompt');expect(branch).not.toContain('PromptSkillControls');
  expect(app.slice(end,app.indexOf('function ',end))).toContain('mode-selector');
 });
 it('keeps prior template editors in a closed-by-default disclosure rather than replacing their storage',()=>{
  const app=read('src/App.tsx');const wrapper=app.match(/<details className="template-library-legacy"[^>]*>/)?.[0];expect(wrapper).toBe('<details className="template-library-legacy">');
  const start=app.indexOf(wrapper!),end=app.indexOf('</details>',start);const old=app.slice(start,end);expect(old).toContain('reversePromptTemplatesV2');expect(old).toContain('convertPromptTemplatesV2');expect(old).toContain('allowV3={false}');
 });
 it('registers text and template IPC directly without selected NAI account-bound handlers',()=>{
  const main=read('electron/main.ts');for(const name of ['comicPrompt:run','comicPrompt:cancel','templateLibrary:get','templateLibrary:mutate']){
   expect(main).toContain(`ipcMain.handle("${name}"`);expect(main).not.toMatch(new RegExp('accountBoundHandle\\(\\s*["\']'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'["\']'));
  }
  expect(main).toContain('runComicPromptRequest(request,event.sender.id)');expect(main).toContain('cancelComicPromptRequest(requestId,event.sender.id)');
 });
 it('sets the shared template revision only after a successful backend library mutation',()=>{
  const main=read('electron/main.ts');const line=main.split('\n').find(x=>x.includes('ipcMain.handle("templateLibrary:mutate"'))??'';
  expect(line).toContain('mutatePromptTemplateLibrary(request)');expect(line).toMatch(/if\(result\.ok\)setSetting\("templateLibraryRevision",result\.state\.revision\)/);
 });
 it('preload exposes the same typed routes and the settings panel refreshes its library event',()=>{
  const preload=read('electron/preload.ts');for(const [method,route] of [['comicPrompt','comicPrompt:run'],['cancelComicPrompt','comicPrompt:cancel'],['templateLibraryGet','templateLibrary:get'],['templateLibraryMutate','templateLibrary:mutate']]){
   const line=preload.split('\n').find(x=>x.trimStart().startsWith(method+':'))??'';expect(line).toContain(`ipcRenderer.invoke("${route}"`);
  }
  expect(read('src/features/settings/TemplateLibraryPanel.tsx')).toContain("new Event('langbai:template-library-changed')");expect(read('src/comic/ComicPromptComposer.tsx')).toContain("window.addEventListener('langbai:template-library-changed'");
 });
});
