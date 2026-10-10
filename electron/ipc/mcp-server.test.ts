import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
it("accepts local MCP clients without widening credential, network or spending boundaries", () => {
  const result = spawnSync(process.execPath, [path.resolve("scripts/check-local-mcp.cjs"), process.cwd()], { encoding: "utf8", timeout: 20000 });
  expect(result.stderr, result.stdout).toContain("MCP token is locked; recover local credential encryption");
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).checks.length).toBeGreaterThanOrEqual(21);
});
