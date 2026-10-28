// Private regression HTTP server. The OS chooses the port; no random port
// guesses, wildcard listener, Vite fallback port, HMR listener, or user server.
import {createServer as createHttpServer} from 'node:http';
import {createServer as createViteServer} from 'vite';

function listen(server) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { server.off('error', failed); server.off('listening', ready); };
    const failed = error => { cleanup(); reject(error); };
    const ready = () => { cleanup(); resolve(); };
    server.once('error', failed); server.once('listening', ready);
    try { server.listen({host: '127.0.0.1', port: 0, exclusive: true}); }
    catch (error) { failed(error); }
  });
}

async function closeHttp(server) {
  if (!server) return;
  await new Promise((resolve, reject) => {
    // Only our listener/connections. Also close a failed or never-bound attempt.
    server.closeAllConnections?.();
    server.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve());
  });
}

export async function startMetadataBrowserServer({root, cacheDir}, dependencies = {}) {
  const {viteFactory = createViteServer, httpFactory = createHttpServer, maxAttempts = 30} = dependencies;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 30) throw new Error('Invalid bounded listener attempts');
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let vite, http;
    const close = async () => {
      const errors = [];
      try { await closeHttp(http); } catch (error) { errors.push(error); }
      try { await vite?.close(); } catch (error) { errors.push(error); }
      if (errors.length) throw new AggregateError(errors, 'Metadata listener cleanup failed');
    };
    try {
      // Vite 8 server.listen() treats port:0 as a fallback to 5173. Its public
      // middleware API leaves the one real port-0 listener under Node's control.
      vite = await viteFactory({root, configFile: false, logLevel: 'error', cacheDir,
        optimizeDeps: {entries: [], noDiscovery: true, include: ['pako']},
        server: {host: '127.0.0.1', port: 0, strictPort: true, middlewareMode: true,
          hmr: false, ws: false, watch: {ignored: ['**/*']}},
        plugins: [{name: 'metadata-regression-shell', configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url !== '/__metadata_regression__') return next();
            res.setHeader('Content-Type', 'text/html');
            res.end('<!doctype html><title>Metadata regression</title>');
          });
        }}]});
      http = httpFactory(vite.middlewares);
      await listen(http);
      const address = http.address();
      if (!address || typeof address === 'string' || address.address !== '127.0.0.1' ||
          !Number.isSafeInteger(address.port) || address.port < 1 || address.port > 65535) {
        throw new Error('Metadata server did not bind an OS-assigned IPv4 loopback port');
      }
      return {port: address.port, close};
    } catch (error) {
      try { await close(); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Metadata listener failed and could not close', {cause: error}); }
      if (!['EACCES', 'EADDRINUSE'].includes(error.code) || attempt === maxAttempts - 1) throw error;
    }
  }
  throw new Error('Unreachable bounded listener state');
}
