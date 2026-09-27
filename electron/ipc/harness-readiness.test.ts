import {it, expect} from 'vitest';
import {isHarnessBootFailure} from './harness-readiness';
it.each([
 'dsh: warning: 4 entries did not activate',
 'Error: typert-loader: codec has no create() factory',
 'rp-standard: Error: Roleplay 与当前 DSH 或插件版本不兼容',
 'Failed to load plugins',
 'AggregateError: typert-loader'
])('rejects failed boot: %s', line=>expect(isHarnessBootFailure(line)).toBe(true));
it.each(['dsh web: http://127.0.0.1:1234','0 entries did not activate','[Studio] Image tool plugin registered.','warning: optional preference missing'])('does not confuse ordinary output with boot failure: %s',line=>expect(isHarnessBootFailure(line)).toBe(false));
