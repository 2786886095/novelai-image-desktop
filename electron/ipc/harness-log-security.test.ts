import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {HarnessEngine} from './harness-engine';
import {redactHarnessLog} from './harness-policy';

// Synthetic markers only. Do not load a user profile, start the Agent, or call an API.
const secret = 'SYNTHETIC_CREDENTIAL_FOR_LOCAL_TEST';
const cases = [
  ['JSON Authorization', JSON.stringify({headers:{Authorization:`Bearer ${secret}`},status:401})],
  ['inspected Authorization', `{ headers: { 'Authorization': 'Bearer ${secret}' }, status: 401 }`],
  ['Basic Authorization', `Authorization: Basic ${secret}, status=401`],
  ['quoted proxy authorization', JSON.stringify({'Proxy-Authorization':`Basic ${secret}`,status:407})],
  ['hyphenated API key', JSON.stringify({'x-api-key':secret,status:401})],
  ['quoted password containing spaces', JSON.stringify({password:`first part; ${secret}`,status:401})],
] as const;

describe('Agent log credential boundaries', () => {
  it.each(cases)('redacts %s while retaining diagnostics', (_name, line) => {
    const output = redactHarnessLog(line);
    expect(output).not.toContain(secret);
    expect(output).toContain('status');
    expect(output).toMatch(/401|407/);
  });

  it('does not expose a JSON header credential in the renderer-facing engine snapshot', () => {
    const unused = path.resolve('.tmp/security-lesson-2/unused-profile');
    const engine = new HarnessEngine({
      root:unused, seed:unused, workspace:unused,
      openBrowser:async()=>{throw Error('Test must not open a browser');},
      bridge:async()=>{throw Error('Test must not start a bridge');},
    });
    engine.log(JSON.stringify({event:'request_failed',headers:{Authorization:`Bearer ${secret}`},status:401}), 'error');
    const snapshot = engine.snapshot();
    expect(snapshot.logs).toHaveLength(1);
    expect(snapshot.logs[0].level).toBe('error');
    expect(snapshot.logs[0].text).toContain('request_failed');
    expect(snapshot.logs[0].text).toContain('401');
    expect(JSON.stringify(snapshot)).not.toContain(secret);
  });

  it.each(['"', "'"] as const)('hides a Bearer credential quoted with %s in the real engine snapshot', (quote) => {
    const unused = path.resolve('.tmp/security-lesson-2/unused-quoted-bearer-profile');
    const engine = new HarnessEngine({
      root:unused, seed:unused, workspace:unused,
      openBrowser:async()=>{throw Error('Test must not open a browser');},
      bridge:async()=>{throw Error('Test must not start a bridge');},
    });
    engine.log(`Authorization: Bearer ${quote}${secret}${quote}, status=401`, 'error');
    const snapshot = engine.snapshot();
    expect(snapshot.logs).toHaveLength(1);
    expect(snapshot.logs[0].level).toBe('error');
    expect(snapshot.logs[0].text).toContain('Authorization:');
    expect(snapshot.logs[0].text).toContain('[redacted]');
    expect(snapshot.logs[0].text).toContain('status=401');
    expect(JSON.stringify(snapshot)).not.toContain(secret);
    expect(redactHarnessLog(snapshot.logs[0].text)).toBe(snapshot.logs[0].text);
  });

  it('retains ordinary operational messages', () => {
    const line = 'request failed: status=401 retry=2 elapsed=35ms';
    expect(redactHarnessLog(line)).toBe(line);
  });

  it('continues to hide the already-supported unquoted Bearer header', () => {
    expect(redactHarnessLog(`Authorization: Bearer ${secret}`)).not.toContain(secret);
  });

  it('preserves JSON diagnostics while hiding credentials with escapes and punctuation', () => {
    const line = JSON.stringify({
      headers:{Authorization:`Bearer ${secret}`},
      password:`a quoted \"word\"; ${secret}`,
      access_token:`a\\path ${secret}`,
      status:401, message:'request rejected',
    });
    const output = redactHarnessLog(line);
    expect(output).not.toContain(secret);
    expect(JSON.parse(output)).toEqual({
      headers:{Authorization:'[redacted]'}, password:'[redacted]', access_token:'[redacted]',
      status:401, message:'request rejected',
    });
  });

  it.each([
    `Authorization: "Bearer ${secret}`,
    `password: 'prefix ${secret}`,
    `password: "prefix ${secret}\\`,
  ])('hides a quoted credential even when the log line is truncated: %s', (line) => {
    expect(redactHarnessLog(line)).not.toContain(secret);
  });

  it('does not damage already-redacted messages when redaction runs again', () => {
    for (const line of [`Authorization: Bearer ${secret}`, `token=${secret}`, JSON.stringify({password:secret})]) {
      const output = redactHarnessLog(line);
      expect(redactHarnessLog(output)).toBe(output);
    }
  });
});
