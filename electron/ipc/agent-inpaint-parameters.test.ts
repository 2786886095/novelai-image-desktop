import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

it("uses the actual inpaint model and reference-inclusive budget in the Agent/MCP production flow", () => {
  const tempRoot = path.resolve(os.tmpdir());
  const output = fs.mkdtempSync(path.join(tempRoot, "langbai-agent-inpaint-regression-"));
  try {
    const result = spawnSync(process.execPath, [
      path.resolve("scripts/check-agent-inpaint-parameters.cjs"), process.cwd(), output,
    ], { encoding: "utf8", timeout: 20_000 });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const report = JSON.parse(fs.readFileSync(path.join(output, "RESULTS.json"), "utf8"));
    expect(report.checks).toHaveLength(15);
    expect(report.checks.every((check: { pass: boolean }) => check.pass)).toBe(true);
  } finally {
    // Delete only this fixture directory immediately beneath the verified temp root.
    if (path.dirname(path.resolve(output)) !== tempRoot ||
        !path.basename(output).startsWith("langbai-agent-inpaint-regression-")) {
      throw new Error("Unsafe Agent/MCP regression fixture path");
    }
    fs.rmSync(output, { recursive: true, force: true });
  }
});
