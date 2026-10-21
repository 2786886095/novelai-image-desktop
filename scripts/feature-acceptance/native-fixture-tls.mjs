// Disposable native-test certificates only; never change product TLS policy or
// trust stores. An explicit CA/leaf profile avoids ambient openssl.cnf extensions.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

export function nativeFixtureTlsConfig(hosts) {
  assert(Array.isArray(hosts) && hosts.length > 0 && hosts.length <= 8);
  assert(new Set(hosts).size === hosts.length);
  for (const host of hosts) assert(typeof host === 'string' && host.length <= 253 &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/.test(host),
  'Fixture TLS hosts must be literal DNS names, not OpenSSL configuration');
  return `[req]
prompt = no
distinguished_name = fixture_dn
default_md = sha256
[fixture_dn]
CN = Isolated native fixture
[fixture_ca]
basicConstraints = critical,CA:TRUE,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
[fixture_server]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
subjectAltName = @fixture_names
[fixture_names]
${hosts.map((host, index) => `DNS.${index + 1} = ${host}`).join('\n')}
`;
}

function nativeFixtureTlsPlan({directory, hosts, openssl, command}) {
  assert(typeof openssl === 'string' && openssl.length > 0 && typeof command === 'function');
  assert(path.isAbsolute(directory) && fs.lstatSync(directory).isDirectory() &&
    !fs.lstatSync(directory).isSymbolicLink(), 'Fixture TLS directory must be a real directory');
  const config = path.join(directory, 'fixture-openssl.cnf'), ca = path.join(directory, 'fixture-ca.pem'),
    caKey = path.join(directory, 'fixture-ca-key.pem'), key = path.join(directory, 'fixture-key.pem'),
    request = path.join(directory, 'fixture-server.csr'), cert = path.join(directory, 'fixture-server.pem');
  const configText = nativeFixtureTlsConfig(hosts);
  for (const file of [config, ca, caKey, key, request, cert])
    assert(!fs.lstatSync(file, {throwIfNoEntry: false}), 'Fixture TLS paths must be fresh');
  fs.writeFileSync(config, configText, {flag: 'wx', mode: 0o600});
  const commands = [[openssl, 'version', '-a'],
  [openssl, 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1',
    '-config', config, '-extensions', 'fixture_ca', '-subj', '/CN=Isolated native fixture CA',
    '-keyout', caKey, '-out', ca],
  [openssl, 'req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-config', config,
    '-subj', '/CN=' + hosts[0], '-keyout', key, '-out', request],
  [openssl, 'x509', '-req', '-sha256', '-days', '1', '-in', request, '-CA', ca,
    '-CAkey', caKey, '-set_serial', '1', '-extfile', config, '-extensions', 'fixture_server', '-out', cert],
  // The same verification remains mandatory in the native CI runner. In
  // particular, a generator that silently merges invalid extensions fails here.
  [openssl, 'x509', '-in', ca, '-noout', '-text'],
  [openssl, 'x509', '-in', cert, '-noout', '-text'],
  ...hosts.map(host => [openssl, 'verify', '-CAfile', ca, '-purpose', 'sslserver', '-verify_hostname', host, cert])];
  return {files: {ca, key, cert, config}, commands};
}

function checkedResult(result, argv) {
  assert(result && typeof result.then !== 'function' && (result.exitStatus ?? result.status) === 0 &&
    !result.error && !result.timedOut && !result.outputOverflow, 'Fixture TLS command failed: ' + argv[1]);
}

export function createNativeFixtureTls(options) {
  const {files, commands} = nativeFixtureTlsPlan(options);
  for (const argv of commands) checkedResult(options.command(argv), argv);
  return files;
}

export async function createNativeFixtureTlsAsync(options) {
  const {files, commands} = nativeFixtureTlsPlan(options);
  for (const argv of commands) checkedResult(await options.command(argv), argv);
  return files;
}
