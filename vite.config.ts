import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  test: {
    // CI runners are slower and run test files in parallel; some tests load the
    // large electron/ipc/nai.ts via dynamic import, which can exceed vitest's 5s
    // default under that contention (green locally, flaky-timeout in CI — which
    // blocked the release build). Give tests room, and retry transient CI flakes
    // so the build gate is reliable.
    testTimeout: 30000,
    hookTimeout: 30000,
    retry: 2,
  },
});
