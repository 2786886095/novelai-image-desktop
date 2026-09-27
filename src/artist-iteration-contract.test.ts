import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("target style iteration UI contract", () => {
  const source = readFileSync(new URL("./ArtistLab.tsx", import.meta.url), "utf8");
  it("uses a shared 300-image default instead of the legacy 60-image cap", () => {
    expect(source).toContain("imageBudget: DEFAULT_ARTIST_IMAGE_BUDGET");
    expect(source).not.toContain("max={240}");
  });
  it("exposes a persisted round count and bounds the running loop by it", () => {
    expect(source).toContain("label={iterationText.rounds}");
    expect(source).toContain("round < session.iterationRounds");
    expect(source).toContain("...restoreArtistIteration(raw)");
  });
});
