import { describe, expect, it, vi } from "vitest";

vi.mock("./store", () => ({
  getSettings: () => ({ agentContextWindow: 128000, agentAutoCompactThreshold: 0.8 }),
  atomicWriteFileSync: vi.fn(),
  readWithBackupRecoverySync: vi.fn(),
  rotateBackupsSync: vi.fn(),
}));

import { createEmptyAgentWorkspace, normalizeAgentWorkspace } from "./agent-store";
import { LYRA_IMAGE_SAMPLER_ID, TAVERN_PRESET_LIBRARY_VERSION } from "../../src/tavern/builtins";

describe("Tavern preset library persistence", () => {
  it("seeds only the Lyra preset for a fresh workspace", () => {
    const workspace = createEmptyAgentWorkspace();
    expect(workspace.samplerPresets).toHaveLength(1);
    expect(workspace.samplerPresets[0].id).toBe(LYRA_IMAGE_SAMPLER_ID);
  });

  it("does not recreate a renamed or deleted built-in after migration", () => {
    const workspace = createEmptyAgentWorkspace();
    const renamed = { ...workspace.samplerPresets[0], name: "我的图像预设" };
    const normalized = normalizeAgentWorkspace({
      ...workspace,
      presetLibraryVersion: TAVERN_PRESET_LIBRARY_VERSION,
      samplerPresets: [renamed],
    });
    expect(normalized.samplerPresets).toHaveLength(1);
    expect(normalized.samplerPresets[0].name).toBe("我的图像预设");
  });

  it("replaces the previous preset library during the v2 migration", () => {
    const workspace = createEmptyAgentWorkspace();
    const imported = { ...workspace.samplerPresets[0], id: "sampler-imported", source: "sillytavern-json" as const };
    const normalized = normalizeAgentWorkspace({
      ...workspace,
      presetLibraryVersion: 1,
      samplerPresets: [
        { ...workspace.samplerPresets[0], id: "builtin-darkside-image-sampler" },
        { ...workspace.samplerPresets[0], id: "builtin-software-image-sampler" },
        imported,
      ],
    });
    expect(normalized.samplerPresets.map((item) => item.id)).toEqual([LYRA_IMAGE_SAMPLER_ID]);
  });
});
