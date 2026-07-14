import { describe, expect, it } from "vitest";
import {
  aitagImageUrl,
  aitagMetadataRecord,
  normalizeAitagConfig,
  normalizeAitagDetail,
  normalizeAitagSearch,
} from "./aitag";
import { inspectImageMetadata } from "./png-meta";

describe("AITag public data normalization", () => {
  it("normalizes list fields returned as JSON strings", () => {
    const result = normalizeAitagSearch({
      page: 2,
      page_size: 60,
      total: 61,
      items: [{
        id: 7,
        userId: "42",
        title: "work",
        tags: '["blue_hair","solo"]',
        AI_type: "NovelAI",
        image_count: 3,
      }],
    });
    expect(result.page).toBe(2);
    expect(result.items[0].tags).toEqual(["blue_hair", "solo"]);
    expect(result.items[0].imageCount).toBe(3);
  });

  it("builds encoded CDN URLs from detail image data", () => {
    const detail = normalizeAitagDetail({
      work: { id: 7 },
      images: [{ id: 1, author_id: "42", image_type: "pixiv", file_name: "a b" }],
    });
    expect(aitagImageUrl(normalizeAitagConfig({ asset_base_url: "https://cdn.example/" }), detail.images[0]))
      .toBe("https://cdn.example/pixiv/42/a%20b.webp");
  });

  it("routes AITag Stable Diffusion metadata through the shared inspector", () => {
    const detail = normalizeAitagDetail({
      work: { id: 7, AI_type: "Stable Diffusion" },
      images: [{
        id: 1,
        ai_json: JSON.stringify({
          parameters: "1girl\nNegative prompt: lowres\nSteps: 28, Sampler: Euler a, CFG scale: 6, Seed: 12, Size: 832x1216",
        }),
      }],
    });
    const report = inspectImageMetadata(aitagMetadataRecord(detail.images[0], "Stable Diffusion"));
    expect(report.kind).toBe("stable-diffusion");
    expect(report.imported.steps).toBe(28);
    expect(report.imported.width).toBe(832);
  });
});
