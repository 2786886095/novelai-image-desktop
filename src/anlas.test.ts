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

  it("charges V4 vibe encoding as a one-time fee, not per batch image", () => {
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
    // 2 vibes x 2 Anlas one-time = 4 (NOT multiplied by the 3-image batch).
    expect(quote.amount).toBe(4);
  });

  it("does not re-charge vibe encoding for already-cached references", () => {
    const vibes = {
      vibeImages: [
        { base64: "", infoExtracted: 0.7, strength: 0.5 },
        { base64: "", infoExtracted: 0.7, strength: 0.5 },
      ],
      charCaptions: [],
    };
    // Both already encoded+cached → no encode charge.
    expect(
      calculateImageGenerationAnlas({ params: DEFAULT_PARAMS, account: opusAccount, extras: vibes, alreadyEncodedVibes: 2 })
        .amount,
    ).toBe(0);
    // One cached, one new → only the new one is charged (2 Anlas).
    expect(
      calculateImageGenerationAnlas({ params: DEFAULT_PARAMS, account: opusAccount, extras: vibes, alreadyEncodedVibes: 1 })
        .amount,
    ).toBe(2);
  });

  it("charges a flat 5 Anlas per image for precise reference, regardless of reference count", () => {
    const oneRef = calculateImageGenerationAnlas({
      params: DEFAULT_PARAMS,
      account: opusAccount, // base image is free for Opus, so only the reference fee remains
      batchCount: 2,
      extras: {
        vibeImages: [],
        charCaptions: [],
        preciseReferences: [{ base64: "", type: "character", strength: 1, fidelity: 1 }],
      },
    });
    expect(oneRef.amount).toBe(10); // 5 Anlas x 2 images (flat per image)

    const twoRefs = calculateImageGenerationAnlas({
      params: DEFAULT_PARAMS,
      account: opusAccount,
      batchCount: 2,
      extras: {
        vibeImages: [],
        charCaptions: [],
        preciseReferences: [
          { base64: "", type: "character", strength: 1, fidelity: 1 },
          { base64: "", type: "style", strength: 1, fidelity: 1 },
        ],
      },
    });
    // Official docs: "5 Anlas to each image generation" — flat, NOT per reference.
    expect(twoRefs.amount).toBe(10);
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
