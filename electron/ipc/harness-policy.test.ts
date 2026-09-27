import {describe,it,expect} from 'vitest';
import {engineLaunchUrl,isNewerBundle,redactHarnessLog,safeBundlePath,validateManifest} from './harness-policy';
describe('Harness component boundaries',()=>{
  it('never downgrades a separately updated component to an older app-bundled engine',()=>{
    expect(isNewerBundle('0.1.0','0.2.0')).toBe(false);
    expect(isNewerBundle('0.1.0','0.1.0')).toBe(false);
    expect(isNewerBundle('0.1.1','0.1.0')).toBe(true);
  });
  it.each(['../x','/tmp/a','C:/data','a\\b','a/../b','a//b','a:ads'])('rejects unsafe component path %s',p=>expect(()=>safeBundlePath('bundle',p)).toThrow());
  it('only accepts loopback bootstrap URL',()=>{
    expect(engineLaunchUrl('Started http://evil.test:3000')).toBeNull();
    expect(engineLaunchUrl('\x1b[32mhttp://127.0.0.1:3011/?token=abc\x1b[0m')).toBe('http://127.0.0.1:3011/?token=abc');
  });
  it('removes launch token, ANSI and API credentials from log snapshots',()=>{
    const value=redactHarnessLog('\x1b[32mhttp://127.0.0.1:30/?token=secret api_key=xyz Authorization: Bearer abc sk-1234567890');
    expect(value).not.toContain('secret');expect(value).not.toContain('xyz');expect(value).not.toContain('abc');expect(value).not.toContain('1234567890');expect(value).not.toContain('\x1b');
  });
  it('rejects ABI and protocol mismatches before file installation',()=>{
    const m={format:1,protocol:1,version:'0.1.0',upstream:'0.1.5-rc.2',platform:process.platform,arch:process.arch,node:'node.exe',cli:'runtime/bin.js',files:{'node.exe':'a'.repeat(64),'runtime/bin.js':'b'.repeat(64)}};
    expect(validateManifest(m)).toEqual(m);
    expect(()=>validateManifest({...m,protocol:2})).toThrow();
    expect(()=>validateManifest({...m,arch:'unexpected'})).toThrow();
  });
});
