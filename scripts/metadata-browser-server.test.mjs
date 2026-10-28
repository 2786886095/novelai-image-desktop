import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {startMetadataBrowserServer} from './metadata-browser-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errorWithCode = code => Object.assign(new Error('Injected bind fixture ' + code), {code});
function fixture(failures, {cleanupFailure} = {}) {
  const attempts = [], configs = [], vites = [];
  return {attempts, configs, vites, dependencies: {
    viteFactory: async config => {
      configs.push(config);
      const vite = {closed: 0, middlewares: (_req, res) => res.end('actual HTTP fixture'),
        async close() { this.closed++; if (cleanupFailure) throw cleanupFailure; }};
      vites.push(vite); return vite;
    },
    httpFactory: handler => {
      const server = http.createServer(handler), index = attempts.length;
      const actualListen = server.listen.bind(server), actualClose = server.close.bind(server);
      const observation = {server, listen: [], closed: 0}; attempts.push(observation);
      server.listen = options => {
        observation.listen.push(options);
        if (failures[index]) { process.nextTick(() => server.emit('error', failures[index])); return server; }
        return actualListen(options);
      };
      server.close = callback => { observation.closed++; return actualClose(callback); };
      return server;
    },
  }};
}
const options = {root, cacheDir: path.join(os.tmpdir(), 'unused-bind-fixture')};

test('real concurrent Vite middleware servers bind two OS-selected loopback ports and serve responses', {timeout: 30000}, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-port-zero-'));
  const running = [];
  const observedListens = [], originalListen = net.Server.prototype.listen;
  net.Server.prototype.listen = function (...args) {
    observedListens.push(args); return originalListen.apply(this, args);
  };
  try {
    const results = await Promise.allSettled([0, 1].map(async index => {
      const server = await startMetadataBrowserServer({root, cacheDir: path.join(temp, String(index))});
      running.push(server); return server;
    }));
    for (const result of results) assert.equal(result.status, 'fulfilled', result.reason?.stack);
    assert.equal(running.length, 2); assert.notEqual(running[0].port, running[1].port);
    // hmr:false alone still opens Vite 8's middleware WebSocket port 24678.
    // Verify actual listeners, not merely the accepted configuration fields.
    assert.deepEqual(observedListens, [[{host: '127.0.0.1', port: 0, exclusive: true}],
      [{host: '127.0.0.1', port: 0, exclusive: true}]]);
    for (const server of running) {
      assert(Number.isSafeInteger(server.port) && server.port >= 1 && server.port <= 65535);
      const response = await fetch(`http://127.0.0.1:${server.port}/__metadata_regression__`);
      assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/html/);
      assert.equal(await response.text(), '<!doctype html><title>Metadata regression</title>');
    }
  } finally {
    net.Server.prototype.listen = originalListen;
    await Promise.all(running.map(server => server.close()));
    assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
    fs.rmSync(temp, {recursive: true, force: true});
  }
  for (const server of running) await assert.rejects(fetch(`http://127.0.0.1:${server.port}/__metadata_regression__`));
});

test('EACCES and EADDRINUSE retries close each attempt, retain strict loopback and request port zero', async () => {
  const f = fixture([errorWithCode('EACCES'), errorWithCode('EADDRINUSE')]);
  const result = await startMetadataBrowserServer(options, {...f.dependencies, maxAttempts: 3});
  try {
    assert.equal(f.attempts.length, 3);
    assert.deepEqual(f.attempts.map(a => a.closed), [1, 1, 0]);
    assert.deepEqual(f.vites.map(v => v.closed), [1, 1, 0]);
    for (const config of f.configs) {
      assert.equal(config.server.host, '127.0.0.1'); assert.equal(config.server.port, 0);
      assert.equal(config.server.strictPort, true); assert.equal(config.server.middlewareMode, true); assert.equal(config.server.hmr, false); assert.equal(config.server.ws, false);
    }
    for (const a of f.attempts) assert.deepEqual(a.listen, [{host: '127.0.0.1', port: 0, exclusive: true}]);
    assert.equal(await (await fetch(`http://127.0.0.1:${result.port}`)).text(), 'actual HTTP fixture');
  } finally { await result.close(); }
  assert.deepEqual(f.attempts.map(a => a.closed), [1, 1, 1]);
  assert.deepEqual(f.vites.map(v => v.closed), [1, 1, 1]);
});

test('last EACCES or EADDRINUSE is surfaced unchanged after the bounded attempts are all closed', async () => {
  for (const code of ['EACCES', 'EADDRINUSE']) {
    const failures = [errorWithCode(code), errorWithCode(code), errorWithCode(code)], f = fixture(failures);
    await assert.rejects(startMetadataBrowserServer(options, {...f.dependencies, maxAttempts: 3}), error => error === failures[2]);
    assert.equal(f.attempts.length, 3); assert(f.attempts.every(a => a.closed === 1)); assert(f.vites.every(v => v.closed === 1));
  }
});

test('other listener errors are not retried or swallowed', async () => {
  const error = errorWithCode('EINVAL'), f = fixture([error]);
  await assert.rejects(startMetadataBrowserServer(options, f.dependencies), value => value === error);
  assert.equal(f.attempts.length, 1); assert.equal(f.attempts[0].closed, 1); assert.equal(f.vites[0].closed, 1);
});

test('cleanup failure preserves the bind error and does not start another attempt', async () => {
  const error = errorWithCode('EACCES'), cleanup = Error('Injected cleanup failure'), f = fixture([error], {cleanupFailure: cleanup});
  await assert.rejects(startMetadataBrowserServer(options, f.dependencies), value => {
    assert(value instanceof AggregateError); assert.equal(value.cause, error); assert.equal(value.errors[0], error);
    assert.equal(value.errors[1].errors[0], cleanup); return true;
  });
  assert.equal(f.attempts.length, 1); assert.equal(f.attempts[0].closed, 1);
});

test('attempt bounds reject zero, oversized and fractional counts before creating resources', async () => {
  for (const maxAttempts of [0, 31, 1.5]) {
    const f = fixture([]); await assert.rejects(startMetadataBrowserServer(options, {...f.dependencies, maxAttempts}), /bounded/);
    assert.equal(f.attempts.length, 0); assert.equal(f.vites.length, 0);
  }
});
