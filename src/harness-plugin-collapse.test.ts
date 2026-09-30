import {it,expect} from 'vitest';import {readFileSync} from 'node:fs';import {resolve} from 'node:path';
const root=process.env.PLUGIN_COLLAPSE_SOURCE_ROOT||process.cwd();
it('defaults the plugin update panel to a collapsed disclosure while preserving its controls',()=>{
 const s=readFileSync(resolve(root,'src/HarnessPage.tsx'),'utf8');
 const opening=s.match(/<details className="harness-update-card harness-plugin-card"[^>]*>/)?.[0];
 expect(opening).toBeDefined();expect(opening).not.toMatch(/\bopen(?:\s|=|>)/);
 expect(s).toContain('harness-plugin-summary');
 expect(s).toContain('harnessSetAutoPluginUpdates');expect(s).toContain('harnessCheckPluginUpdates');
});
