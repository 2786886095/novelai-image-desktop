import { describe, it, expect } from "vitest";
import { detectiveBudget, detectiveRounds, detectiveRoundBudget } from "./artist-detective-contract";
import { readFileSync } from "node:fs";

describe("Artist Detective official search budget", () => {
  it("defaults to nine search rounds and 300 total images including 16 final renders", () => {
    expect(detectiveBudget(300)).toBe(300);
    expect(detectiveRounds(300)).toBe(9);
    expect(8 * 32 + 14 * 2 + 16).toBe(300);
  });
  it("lets users change rounds without a product-specific cap", () => {
    expect(detectiveRoundBudget(9)).toBe(304);
    expect(detectiveRoundBudget(300)).toBe(9616);
    expect(detectiveRounds(10000)).toBe(312);
  });
  it("rejects impossible/partial seed groups and invalid counts", () => {
    for (const budget of [0, 23, 25, 301, Infinity, NaN, 24.5, "300"]) expect(() => detectiveBudget(budget)).toThrow();
    for (const rounds of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) expect(() => detectiveRoundBudget(rounds)).toThrow();
  });
  it("always opens the chooser and routes target iteration only to Detective", () => {
    const page = readFileSync(new URL("./ArtistLab.tsx", import.meta.url), "utf8");
    expect(page).toContain('useState<ArtistLabScreen>("home")');
    expect(page).toContain('if (screen === "target") return <DetectiveArtistLab');
    expect(page).not.toContain("SCREEN_KEY");
    expect(page).not.toContain('screen === "legacy"');
  });
});
