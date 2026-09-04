import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeSource = readFileSync("electron/ipc/agent-runtime.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");
const storeSource = readFileSync("electron/ipc/agent-store.ts", "utf8");

describe("Character Tavern direct runtime", () => {
  it("calls supported model protocols directly without OpenCode", () => {
    expect(runtimeSource).toContain("async function openAiChat");
    expect(runtimeSource).toContain("async function openAiResponses");
    expect(runtimeSource).toContain("async function anthropic");
    expect(runtimeSource).toContain("async function gemini");
    expect(runtimeSource).not.toContain("spawn(");
    expect(packageSource).not.toContain("opencode-ai");
  });

  it("assembles roleplay context and never exposes legacy arbitrary tools", () => {
    expect(runtimeSource).toContain("buildTavernPromptMessages");
    expect(runtimeSource).toContain("parseLangbaiImageProposal");
    expect(runtimeSource).not.toContain("agentToolSchemas");
    expect(runtimeSource).not.toContain("tool_choice");
  });

  it("separates confirmation mode from full-auto image generation", () => {
    expect(runtimeSource).toContain('updated?.generationMode === "auto"');
    expect(runtimeSource).toContain("generateTavernImage");
    expect(runtimeSource).toContain("langbai_generate_image");
    expect(runtimeSource).toContain('status: "running"');
  });

  it("uses abort controllers for provider requests and stop actions", () => {
    expect(runtimeSource).toContain("new AbortController()");
    expect(runtimeSource).toContain("controller.abort()");
    expect(runtimeSource).toContain("activeRequests.delete");
  });

  it("forwards image-planning effort when supported and safely retries legacy gateways", () => {
    expect(runtimeSource).toContain("activeReasoningEffort");
    expect(runtimeSource).toContain("reasoning_effort");
    expect(runtimeSource).toContain('reasoning: { effort }');
    expect(runtimeSource).toContain("unsupportedReasoning");
    expect(runtimeSource).toContain("delete body.reasoning_effort");
    expect(runtimeSource).toContain("delete body.reasoning");
  });

  it("sends only user-owned image attachments back to vision providers", () => {
    expect(runtimeSource).toContain('message.role !== "user" || !message.sourceMessageId');
    expect(runtimeSource).toContain('backing.role !== "user"');
    expect(runtimeSource).toContain("sourceById.get(message.sourceMessageId)");
    expect(runtimeSource).toContain("messages.map((message) => plain(message))");
  });

  it("resets the unreleased legacy Agent workspace instead of migrating it", () => {
    expect(storeSource).toContain("Number(input.version) !== AGENT_WORKSPACE_VERSION");
    expect(storeSource).toContain("createSoftwareImageStarterKit");
  });
});
