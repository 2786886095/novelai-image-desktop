import { describe, expect, it } from "vitest";
import {
  calculateDirectorAnlas,
  calculateImageGenerationAnlas,
  calculateUpscaleAnlas,
} from "./anlas";
import { DEFAULT_PARAMS, type AccountSummary } from "./types";

const paidAccount: AccountSummary = {
  hasToken: true,
  tierLevel: 1,
  tierName: "Tablet",
  hasActiveSubscription: true,
  anlasBalance: 1000,
};

const opusAccount: AccountSummary = {
  hasToken: true,
  tierLevel: 3,
  tierName: "Opus",
  hasActiveSubscription: true,
  anlasBalance: 1000,
};

describe("official Anlas pricing", () => {
  it("prices the default 832x1216, 28-step image at 20 Anlas", () => {
    const quote = calculateImageGenerationAnlas({
      params: DEFAULT_PARAMS,
      account: paidAccount,
    });
    expect(quote.amount).toBe(20);
  });

  it("makes eligible single-image text generation free for active Opus", () => {
    const quote = calculateImageGenerationAnlas({
      params: DEFAULT_PARAMS,
      account: opusAccount,
    });
    expect(quote.amount).toBe(0);
  });

  it("applies image-to-image strength to the official base price", () => {
    const quote = calculateImageGenerationAnlas({
      params: DEFAULT_PARAMS,
      account: paidAccount,
      action: "img2img",
      strength: 0.7,
    });
    expect(quote.amount).toBe(14);
  });

  it("includes V4 vibe encoding on every desktop request", () => {
    const quote = calculateImageGenerationAnlas({
      params: DEFAULT_PARAMS,
      account: opusAccount,
      batchCount: 3,
      extras: {
        vibeImages: [
          { base64: "", infoExtracted: 0.7, strength: 0.5 },
          { base64: "", infoExtracted: 0.7, strength: 0.5 },
        ],
        charCaptions: [],
      },
    });
    expect(quote.amount).toBe(12);
  });

  it("charges 5 Anlas per precise reference per request", () => {
    const quote = calculateImageGenerationAnlas({
      params: DEFAULT_PARAMS,
      account: opusAccount, // base image is free for Opus, so only the reference fee remains
      batchCount: 2,
      extras: {
        vibeImages: [],
        charCaptions: [],
        preciseReferences: [{ base64: "", type: "character", strength: 1, fidelity: 1 }],
      },
    });
    expect(quote.amount).toBe(10); // 5 Anlas x 1 reference x 2 requests
  });

  it("uses the official upscale pixel tier", () => {
    const quote = calculateUpscaleAnlas({
      image: { width: 1024, height: 1024 },
      account: opusAccount,
      scale: 4,
    });
    expect(quote.amount).toBe(7);
  });

  it("uses the fixed background-removal price", () => {
    const quote = calculateDirectorAnlas({
      tool: "bg-removal",
      account: paidAccount,
    });
    expect(quote.amount).toBe(65);
  });
});
