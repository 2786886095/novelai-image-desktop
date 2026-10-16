import {describe,expect,it} from 'vitest';
import {redactAiCredentials} from './ai-prompt-response';
describe('AI diagnostic credential redaction',()=>{
 it('removes repeated configured keys and their URL-encoded form',()=>{
  const secret='synthetic /龙白 key';
  expect(redactAiCredentials(`first ${secret}; query=${encodeURIComponent(secret)}; again ${secret}`,[secret])).toBe('first [REDACTED]; query=[REDACTED]; again [REDACTED]');
 });
 it('redacts longer overlapping keys before their prefixes',()=>{
  expect(redactAiCredentials('abc-def abc',['abc','abc-def'])).toBe('[REDACTED] [REDACTED]');
 });
 it('keeps helpful non-secret provider diagnostics and ignores absent keys',()=>{
  expect(redactAiCredentials('HTTP 422: unsupported quality_boost',[undefined,null,'','   '])).toBe('HTTP 422: unsupported quality_boost');
 });
});
