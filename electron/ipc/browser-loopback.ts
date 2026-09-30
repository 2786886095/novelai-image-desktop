import crypto from 'node:crypto';
import type { Server } from 'node:http';

/** Port 0 follows the OS range, which can include Fetch-forbidden ports on customized Windows hosts. */
export async function listenBrowserLoopback(server: Server, pickPort = () => crypto.randomInt(49152, 65536)): Promise<number> {
  for (let attempt = 0; attempt < 32; attempt++) {
    const port = pickPort();
    if (!Number.isInteger(port) || port < 49152 || port > 65535) throw new Error('Invalid browser bridge port');
    try {
      await new Promise<void>((resolve, reject) => {
        const failed = (error: Error) => { cleanup(); reject(error); };
        const ready = () => { cleanup(); resolve(); };
        const cleanup = () => { server.removeListener('error', failed); server.removeListener('listening', ready); };
        server.once('error', failed); server.once('listening', ready);
        try { server.listen(port, '127.0.0.1'); } catch (error) { cleanup(); reject(error); }
      });
      return port;
    } catch (error) {
      if (!['EADDRINUSE', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    }
  }
  throw new Error('本地 Agent 端口暂不可用，请关闭占用程序后重试。');
}
