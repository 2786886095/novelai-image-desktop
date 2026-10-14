import {expect,it} from 'vitest';
import crypto from 'node:crypto';
import {localGenerationTime,preservedGenerationTime} from './history-generation-time';

it('records local completion and binds the final bytes without changing them',()=>{
 const bytes=Buffer.from('saved-image-fixture'),before=Buffer.from(bytes),now=new Date('2026-10-14T01:02:03.004Z');
 expect(localGenerationTime(bytes,now)).toEqual({generatedAt:now.toISOString(),generatedAtSource:'local-completion',generatedImageSha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 expect(bytes).toEqual(before);
});
it('preserves a complete record across backup normalization, canonicalizing its zone',()=>{
 const record=localGenerationTime(Buffer.from('fixture'),new Date('2026-10-14T01:02:03Z'));
 expect(preservedGenerationTime({...record,generatedAt:'2026-10-14T09:02:03+08:00'})).toEqual(record);
});
it.each([
 {},{createdAt:'2026-10-14T01:02:03Z'},
 {generatedAt:'2026-10-14T01:02:03Z',generatedAtSource:'local-completion'},
 {generatedAt:'bad',generatedAtSource:'local-completion',generatedImageSha256:'a'.repeat(64)},
 {generatedAt:'2026-10-14T01:02:03',generatedAtSource:'local-completion',generatedImageSha256:'a'.repeat(64)},
 {generatedAt:'2026-02-30T01:02:03Z',generatedAtSource:'local-completion',generatedImageSha256:'a'.repeat(64)},
 {generatedAt:'2026-10-14T24:00:00Z',generatedAtSource:'local-completion',generatedImageSha256:'a'.repeat(64)},
 {generatedAt:'2026-10-14T01:02:03Z',generatedAtSource:'official',generatedImageSha256:'a'.repeat(64)},
 {generatedAt:'2026-10-14T01:02:03Z',generatedAtSource:'local-completion',generatedImageSha256:'bad'},
])('does not invent completion provenance for malformed/legacy record %#',raw=>{
 expect(preservedGenerationTime(raw as any)).toEqual({});
});
