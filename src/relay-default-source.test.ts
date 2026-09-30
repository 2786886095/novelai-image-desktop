import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=process.env.STYLE_PICKER_SOURCE_ROOT||process.cwd();
it('defaults custom endpoints on but leaves official fallback off',()=>{
 const source=readFileSync(resolve(root,'electron/ipc/store.ts'),'utf8');
 expect(source).toContain('allowCustomEndpoint: true,');
 expect(source).toContain('allowCustomEndpointFallback: false,');
 expect(source).toContain('{ ...defaults, ...rawSettings }');
});
it('documents the enabled default without changing the retry default',()=>{
 const source=readFileSync(resolve(root,'src/i18n.ts'),'utf8');
 const labels=[...source.matchAll(/"settings.allowCustomEndpoint":\s*"([^"\n]+)"/g)].map(m=>m[1]);
 expect(labels).toHaveLength(5);
 expect(labels.join(' ')).not.toMatch(/默认关闭|預設關閉|off by default|既定はオフ|기본 꺼짐/);
});
