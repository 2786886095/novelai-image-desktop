import sceneFixture from '../../shared/tavern-scene-fixtures.json';
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


describe("image continuity persistence", () => {
  it("round-trips current and alternate prompts plus the explicit reset boundary", () => {
    const workspace=createEmptyAgentWorkspace();
    const image={id:"image-1",status:"completed",positivePrompt:"red coat, white shirt",negativePrompt:"",stylePrompt:"artist:name",count:1,createdAt:"2026-09-08T00:00:00.000Z",continuity:{baseImageId:"image-0",previousPrompt:"red coat",reviewRequired:false,changes:[{from:"",to:"white shirt"}]}};
    const restored=normalizeAgentWorkspace(JSON.parse(JSON.stringify({...workspace,conversations:[{id:"chat",title:"Continuity",imageStateResetAt:"2026-09-07T00:00:00.000Z",messages:[{id:"m",role:"assistant",content:"scene",attachments:[],tools:[],status:"complete",imageProposal:image,imageProposalSwipes:[null,image]}]}]})));
    expect(restored.conversations[0].imageStateResetAt).toBe("2026-09-07T00:00:00.000Z");
    expect(restored.conversations[0].messages[0].imageProposal?.continuity?.previousPrompt).toBe("red coat");
    expect(restored.conversations[0].messages[0].imageProposalSwipes?.[1]?.positivePrompt).toBe("red coat, white shirt");
  });
});

it('persists bound scenes independently in current and alternate replies',()=>{
 const w=createEmptyAgentWorkspace();
 const image={id:'bound',status:'pending',positivePrompt:'1boy,1girl',negativePrompt:'',stylePrompt:'',count:1,createdAt:'2026-09-09',scene:sceneFixture.scene};
 const data={...w,conversations:[{id:'c',title:'Bound',messages:[{id:'m',role:'assistant',content:'',attachments:[],tools:[],status:'complete',imageProposal:image,imageProposalSwipes:[image,null]}]}]};
 const reopened=normalizeAgentWorkspace(JSON.parse(JSON.stringify(data)));
 expect(reopened.conversations[0].messages[0].imageProposal?.scene).toEqual(sceneFixture.scene);
 expect(reopened.conversations[0].messages[0].imageProposalSwipes?.[0]?.scene).toEqual(sceneFixture.scene);
 expect(reopened.conversations[0].messages[0].imageProposal?.scene).not.toBe(reopened.conversations[0].messages[0].imageProposalSwipes?.[0]?.scene);
});
