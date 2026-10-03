import {it,expect} from 'vitest';import {readFileSync,existsSync} from 'node:fs';import {resolve} from 'node:path';
const root=process.env.NOVELAI_ONLY_SOURCE_ROOT||process.cwd();const read=(name:string)=>existsSync(resolve(root,name))?readFileSync(resolve(root,name),'utf8'):'';
it('uses one NovelAI settings surface with distinct relay opt-in and authentication fallback help',()=>{
 const app=read('src/App.tsx');expect(app).toContain('<CompatibleImageSettingsCard');expect(app).toContain('<CompatibleGenerationPanel');
 expect(app).toContain('<NaiAccountManager variant="settings"');const accounts=read('src/components/NaiAccountManager.tsx');expect(accounts).toContain("nt('relaySafety')");expect(accounts).toContain("nt('apiHelp')");
});
it('normalizes persisted settings and keeps native default with explicit verified NovelAI envelope IPC',()=>{
 const store=read('electron/ipc/store.ts');expect(store).toContain('normalizeNovelAiSettings');
 const ipc=read('electron/ipc/compatible-settings-ipc.ts');expect(ipc).toContain('verifyNovelAiImageEnvelope');expect(ipc).toContain('generateConfiguredImages(request)');
});
