import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
it('registers dedicated live read and confirmed configuration tools',()=>{
 const source=readFileSync('harness/plugins/studio-data/index.js','utf8');
 expect(source).toContain('read_studio_state');expect(source).toContain('update_studio_config');expect(source).toContain('save_style_preset');
});
it('connects the live renderer rather than pretending persisted settings are current',()=>{
 expect(readFileSync('src/main.tsx','utf8')).toContain('installStudioAgent');
 expect(readFileSync('electron/preload.ts','utf8')).toContain('onStudioAgentRequest');
});
it('routes software data requests through a dedicated handler',()=>{
 expect(readFileSync('electron/ipc/harness-launcher.ts','utf8')).toContain('createStudioDataTools');
});
