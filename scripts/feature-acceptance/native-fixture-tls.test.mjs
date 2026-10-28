import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import {X509Certificate} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {nativeFixtureTlsConfig, createNativeFixtureTls, createNativeFixtureTlsAsync} from './native-fixture-tls.mjs';

const hosts = ['safebooru.donmai.us', 'cdn.donmai.us'];
const openssl = process.platform === 'win32' && fs.existsSync('F:/AI/Git/usr/bin/openssl.exe')
  ? 'F:/AI/Git/usr/bin/openssl.exe' : 'openssl';
function temporary(t) {
  const parent = fs.realpathSync(os.tmpdir()), directory = fs.mkdtempSync(path.join(parent, 'native-fixture-tls-unit-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(directory)), parent);
    assert(path.basename(directory).startsWith('native-fixture-tls-unit-'));
    fs.rmSync(directory, {recursive: true});
  });
  return directory;
}
function command(environment = process.env, ledger = []) {
  return argv => {
    const row = spawnSync(argv[0], argv.slice(1), {env: environment, encoding: 'utf8',
      shell: false, windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024});
    ledger.push({command: argv, stdout: row.stdout ?? '', stderr: row.stderr ?? '',
      exitStatus: row.status, error: row.error?.message ?? null});
    return row;
  };
}
test('explicit fixture profile has distinct signing CA and DNS-bound server extensions, no ambient section', () => {
  const config = nativeFixtureTlsConfig(hosts);
  assert.match(config, /\[fixture_ca\]\nbasicConstraints = critical,CA:TRUE,pathlen:0\nkeyUsage = critical,keyCertSign,cRLSign/);
  assert.match(config, /\[fixture_server\]\nbasicConstraints = critical,CA:FALSE/);
  assert.match(config, /extendedKeyUsage = serverAuth/);
  assert.match(config, /DNS\.1 = safebooru\.donmai\.us\nDNS\.2 = cdn\.donmai\.us/);
  assert.doesNotMatch(config, /\.include|ENV::|default_ca|usr_cert|v3_ca/);
});
test('host and output validation rejects configuration injection, duplicate hosts and existing key targets', t => {
  for (const invalid of [[], ['good.invalid', 'good.invalid'], ['evil.invalid\nkeyUsage=keyCertSign'],
    ['*.invalid'], ['https://good.invalid'], ['good.invalid,IP:127.0.0.1'], ['127.0.0.1'], ['-good.invalid']])
    assert.throws(() => nativeFixtureTlsConfig(invalid));
  const directory = temporary(t), key = path.join(directory, 'fixture-key.pem');
  fs.writeFileSync(key, 'pristine input');
  assert.throws(() => createNativeFixtureTls({directory, hosts, openssl, command: () => assert.fail('must not execute')}), /fresh/);
  assert.equal(fs.readFileSync(key, 'utf8'), 'pristine input');
});
test('version/generation failures never return a usable fixture', t => {
  const directory = temporary(t), seen = [];
  assert.throws(() => createNativeFixtureTls({directory, hosts, openssl, command: argv => {
    seen.push(argv); return {status: 1, stdout: '', stderr: 'generator failed'};
  }}), /Fixture TLS command failed/);
  assert.deepEqual(seen, [[openssl, 'version', '-a']]);
  assert(!fs.existsSync(path.join(directory, 'fixture-ca.pem')));
});
test('sync and async APIs execute one identical command plan and await every result in order', async t => {
  const syncDirectory = temporary(t), asyncDirectory = temporary(t), syncCommands = [], asyncCommands = [], events = [];
  createNativeFixtureTls({directory: syncDirectory, hosts, openssl, command: argv => {
    syncCommands.push(argv); return {status: 0};
  }});
  let active = false;
  const fixture = await createNativeFixtureTlsAsync({directory: asyncDirectory, hosts, openssl, command: async argv => {
    assert.equal(active, false, 'Previous TLS command must settle before the next starts'); active = true;
    const index = asyncCommands.length; asyncCommands.push(argv); events.push(['begin', index]);
    await new Promise(resolve => setTimeout(resolve, 2));
    active = false; events.push(['end', index]); return {exitStatus: 0};
  }});
  const normalize = (rows, directory) => rows.map(argv => argv.map(arg => arg.replaceAll(directory, '<RUN>')));
  assert.deepEqual(normalize(asyncCommands, asyncDirectory), normalize(syncCommands, syncDirectory));
  assert.deepEqual(events, asyncCommands.flatMap((_argv, index) => [['begin', index], ['end', index]]));
  assert.equal(fixture.ca, path.join(asyncDirectory, 'fixture-ca.pem'));
  assert.equal(fixture.cert, path.join(asyncDirectory, 'fixture-server.pem'));
});
test('async rejection, failed status, spawn error, timeout and overflow stop before another TLS command', async t => {
  for (const failure of [{exitStatus: 1}, {exitStatus: null}, {exitStatus: 0, error: 'spawn failed'},
    {exitStatus: 0, timedOut: true}, {exitStatus: 0, outputOverflow: true}, 'reject']) {
    const directory = temporary(t), seen = [];
    await assert.rejects(createNativeFixtureTlsAsync({directory, hosts, openssl, command: async argv => {
      seen.push(argv); await Promise.resolve();
      if (seen.length === 1) return {exitStatus: 0};
      if (failure === 'reject') throw Error('literal asynchronous rejection');
      return failure;
    }}), /Fixture TLS command failed|literal asynchronous rejection/);
    assert.equal(seen.length, 2); assert.equal(seen[0][1], 'version'); assert.equal(seen[1][1], 'req');
  }
});
test('sync API refuses an accidental Promise rather than returning unverified fixture paths', t => {
  const directory = temporary(t); let calls = 0;
  assert.throws(() => createNativeFixtureTls({directory, hosts, openssl, command: () => {
    calls++; return Promise.resolve({exitStatus: 0});
  }}), /Fixture TLS command failed/);
  assert.equal(calls, 1);
});
test('system controller awaits the async API and trusts only the issuer CA while preserving actual journeys', () => {
  const source = fs.readFileSync(new URL('./run-desktop-system-native.mjs', import.meta.url), 'utf8');
  assert.match(source, /await createNativeFixtureTlsAsync\(/);
  assert.match(source, /if\(tlsCa&&fs\.existsSync\(tlsCa\)\)env\.NODE_EXTRA_CA_CERTS=tlsCa/);
  assert.match(source, /source:root,tlsKey,tlsCert,tlsCa,nodeExecutable/);
  assert.doesNotMatch(source, /'-addext'|NODE_EXTRA_CA_CERTS=tlsCert|rejectUnauthorized:false|ignore-certificate-errors/);
  const journeys = fs.readFileSync(new URL('./desktop-system-journeys.cjs', import.meta.url), 'utf8');
  assert.match(journeys, /key:fs\.readFileSync\(config\.tlsKey\),cert:fs\.readFileSync\(config\.tlsCert\)/);
});

const requestScript = `
const https=require('node:https');
const [port,serverName,expected]=process.argv.slice(1);
const request=https.get({hostname:'127.0.0.1',port:Number(port),servername:serverName,agent:false,rejectUnauthorized:true},response=>{
 let text='';response.on('data',b=>text+=b);response.on('end',()=>{
  console.log(JSON.stringify({status:response.statusCode,authorized:response.socket.authorized,body:text}));
  if(expected!=='accepted'||!response.socket.authorized||text!=='isolated fixture')process.exitCode=1;
 });
});
request.setTimeout(10000,()=>request.destroy(new Error('TLS unit timeout')));
request.on('error',error=>{console.log(JSON.stringify({code:error.code,message:error.message}));if(expected==='accepted'||(expected==='hostname'&&error.code!=='ERR_TLS_CERT_ALTNAME_INVALID')||(expected==='authority'&&!['UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(error.code)))process.exitCode=1;});
`;
async function client({port, serverName, ca, expected}) {
  const env = {...process.env};
  for (const key of Object.keys(env)) if (/^NODE_OPTIONS$|^NODE_EXTRA_CA_CERTS$|^NODE_TLS_REJECT_UNAUTHORIZED$/i.test(key)) delete env[key];
  if (ca) env.NODE_EXTRA_CA_CERTS = ca;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', requestScript, String(port), serverName, expected],
      {env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    const timer = setTimeout(() => {child.kill(); reject(Error('Bounded HTTPS child timeout'));}, 15000);
    child.stdout.on('data', chunk => {stdout += chunk;}); child.stderr.on('data', chunk => {stderr += chunk;});
    child.on('error', error => {clearTimeout(timer); reject(error);});
    child.on('close', exitStatus => {clearTimeout(timer); resolve({exitStatus, stdout, stderr});});
  });
}
async function verifyHttpsTrust(fixture, expectedHosts) {
  const server = https.createServer({key: fs.readFileSync(fixture.key), cert: fs.readFileSync(fixture.cert)},
    (_request, response) => {response.end('isolated fixture');});
  server.on('tlsClientError', () => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    for (const host of expectedHosts) {
      const row = await client({port, serverName: host, ca: fixture.ca, expected: 'accepted'});
      assert.equal(row.exitStatus, 0, JSON.stringify(row)); assert.match(row.stdout, /"authorized":true/);
    }
    const wrong = await client({port, serverName: 'wrong.fixture.invalid', ca: fixture.ca, expected: 'hostname'});
    assert.equal(wrong.exitStatus, 0, JSON.stringify(wrong)); assert.match(wrong.stdout, /ERR_TLS_CERT_ALTNAME_INVALID/);
    const untrusted = await client({port, serverName: expectedHosts[0], expected: 'authority'});
    assert.equal(untrusted.exitStatus, 0, JSON.stringify(untrusted)); assert.match(untrusted.stdout, /UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_GET_ISSUER_CERT_LOCALLY/);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}
test('real OpenSSL profile and Node HTTPS verify extra CA, both hosts, wrong host and unknown CA without insecure flags', async t => {
  const directory = temporary(t), ambient = path.join(directory, 'ambient-openssl.cnf'), ledger = [];
  fs.writeFileSync(ambient, '[req]\nprompt=no\ndistinguished_name=ambient_dn\nx509_extensions=ambient\n[ambient_dn]\nCN=ambient.invalid\n[ambient]\nbasicConstraints=critical,CA:FALSE\nsubjectAltName=DNS:ambient.invalid\n');
  const fixture = createNativeFixtureTls({directory, hosts, openssl,
    command: command({...process.env, OPENSSL_CONF: ambient}, ledger)});
  assert.match(ledger[0].stdout, /OpenSSL|LibreSSL/);
  const ca = new X509Certificate(fs.readFileSync(fixture.ca)), leaf = new X509Certificate(fs.readFileSync(fixture.cert));
  assert.equal(ca.ca, true); assert.equal(leaf.ca, false); assert(leaf.verify(ca.publicKey));
  assert.notEqual(leaf.fingerprint256, ca.fingerprint256); assert.equal(leaf.checkHost('ambient.invalid'), undefined);
  for (const host of hosts) assert.equal(leaf.checkHost(host), host);
  assert(ledger.filter(row => row.command[1] === 'verify').every(row => row.exitStatus === 0));
  assert(ledger.every(row => !row.command.includes('-addext')));
  await verifyHttpsTrust(fixture, hosts);
});
test('real asynchronous system CA and leaf verify every GitHub/relay host with unchanged TLS rejection boundaries', async t => {
  const directory = temporary(t), systemHosts = ['github.com', 'api.github.com', 'objects.githubusercontent.com',
    'relay-a.fixture.invalid', 'relay-b.fixture.invalid'], ledger = [], execute = command(process.env, ledger);
  const fixture = await createNativeFixtureTlsAsync({directory, hosts: systemHosts, openssl, command: async argv => {
    await Promise.resolve(); return execute(argv);
  }});
  assert.equal(new X509Certificate(fs.readFileSync(fixture.ca)).ca, true);
  assert.equal(new X509Certificate(fs.readFileSync(fixture.cert)).ca, false);
  assert.equal(ledger.filter(row => row.command[1] === 'verify' && row.exitStatus === 0).length, systemHosts.length);
  await verifyHttpsTrust(fixture, systemHosts);
});
