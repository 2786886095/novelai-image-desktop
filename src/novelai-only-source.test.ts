import {it,expect} from 'vitest';import {readFileSync,existsSync} from 'node:fs';import {resolve} from 'node:path';
const root=process.env.NOVELAI_ONLY_SOURCE_ROOT||process.cwd();const read=(name:string)=>existsSync(resolve(root,name))?readFileSync(resolve(root,name),'utf8'):'';
it('uses one NovelAI settings surface with distinct relay opt-in and authentication fallback help',()=>{
 const app=read('src/App.tsx');expect(app).not.toContain('<CompatibleImageSettingsCard');expect(app).not.toContain('<CompatibleGenerationPanel');
 expect(app).toContain('settings.allowCustomEndpointHint');expect(app).toContain('settings.allowCustomEndpointFallbackHint');
});
it('normalizes persisted settings and retires the old image service IPC',()=>{
 const store=read('electron/ipc/store.ts');expect(store).toContain('normalizeNovelAiSettings');
 const ipc=read('electron/ipc/compatible-settings-ipc.ts');expect(ipc).toContain('novelai-only');expect(ipc).not.toContain('generateConfiguredImages(request)');
});
