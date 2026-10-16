import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer, get} from 'node:http';

const fixture = fs.readFileSync(new URL('./desktop-generation-journeys.cjs', import.meta.url), 'utf8');
const declaration = fixture.slice(fixture.indexOf('async function closeFixtureServer('), fixture.indexOf('\n\nfunction rendererSetup(){'));
const closeFixtureServer = new Function(`${declaration};return closeFixtureServer;`)();

test('actual fixture cleanup releases an intentionally unfinished HTTP response', async () => {
  let held;
  const accepted = new Promise(resolve => { held = resolve; });
  const server = createServer((_req, _res) => { held(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const request = get(`http://127.0.0.1:${server.address().port}/hold`);
  request.on('error', () => {});
  await accepted;
  let previouslyUnboundedCloseReturned = false;
  server.close(() => { previouslyUnboundedCloseReturned = true; });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(previouslyUnboundedCloseReturned, false, 'the old close-only path really waits on this response');
  // Release the old-path reproduction before trying the new helper on a fresh
  // server. Calling close twice is not a valid Node fixture setup.
  server.closeAllConnections();
  await new Promise(resolve => server.once('close', resolve));
  request.destroy();
  let heldNext;
  const acceptedNext = new Promise(resolve => { heldNext = resolve; });
  const next = createServer(() => { heldNext(); });
  await new Promise(resolve => next.listen(0, '127.0.0.1', resolve));
  const requestNext = get(`http://127.0.0.1:${next.address().port}/hold`);
  requestNext.on('error', () => {});
  await acceptedNext;
  const started = Date.now();
  await closeFixtureServer(next, 1500);
  assert(Date.now() - started < 1000);
  assert.equal(previouslyUnboundedCloseReturned, true);
  assert.equal(next.listening, false); requestNext.destroy();
});

test('fixture watchdog is not disabled before the HTTP cleanup finishes', () => {
  const cleanup = fixture.indexOf('await closeFixtureServer(server)');
  assert(cleanup > 0);
  assert.equal(fixture.slice(0, cleanup).includes('clearTimeout(watchdog)'), false);
  assert(fixture.indexOf('clearTimeout(watchdog)', cleanup) > cleanup);
});
