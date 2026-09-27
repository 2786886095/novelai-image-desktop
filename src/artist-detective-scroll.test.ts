import { expect, it } from "vitest";
import fs from "node:fs";

it("disables scroll anchoring in both ranked artist galleries", () => {
  const css = fs.readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for (const selector of [".target-artist-lab", ".target-artist-lab .artist-candidate-grid", ".target-artist-lab .artist-candidate", ".random-artist-lab"]) {
    expect(rules.some(([, selectors, body]) => selectors.split(",").map(s => s.trim()).includes(selector) && /overflow-anchor:\s*none/.test(body))).toBe(true);
  }
});
