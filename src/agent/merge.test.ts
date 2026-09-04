import { describe, expect, it } from "vitest";
import { mergeAgentWorkspaces } from "./merge";
import { AGENT_WORKSPACE_VERSION, type AgentWorkspaceData } from "./types";

const empty = (): AgentWorkspaceData => ({
  version: AGENT_WORKSPACE_VERSION,
  conversations: [],
  skills: [],
  memories: [],
  characters: [],
  personas: [],
  lorebooks: [],
  samplerPresets: [],
  defaultGenerationMode: "confirm",
  updatedAt: new Date(0).toISOString(),
});

describe("agent backup merge", () => {
  it("never overwrites a conflicting conversation", () => {
    const current = empty();
    current.conversations.push({
      id: "same",
      title: "角色设计",
      messages: [],
      draftAttachments: [],
      status: "idle",
      context: { used: 0, limit: 128000, percent: 0, danger: false, estimated: true, updatedAt: current.updatedAt },
      compactCount: 0,
      characterIds: [], lorebookIds: [], generationMode: "confirm", autoPlayGroup: false, pinned: false,
      createdAt: current.updatedAt,
      updatedAt: current.updatedAt,
    });
    const incoming = JSON.parse(JSON.stringify(current)) as AgentWorkspaceData;
    incoming.conversations[0].messages.push({
      id: "m1", role: "user", content: "different", attachments: [], tools: [], status: "complete", createdAt: incoming.updatedAt,
    });
    const result = mergeAgentWorkspaces(current, incoming);
    expect(result.workspace.conversations).toHaveLength(2);
    expect(result.workspace.conversations[1].title).toBe("角色设计 (1)");
    expect(result.workspace.conversations[1].id).not.toBe("same");
    expect(result.renamed).toBe(1);
  });

  it("treats device-local attachment paths as the same durable conversation", () => {
    const current = empty();
    const incoming = empty();
    const conversation = {
      id: "portable",
      title: "参考图设计",
      messages: [{
        id: "m1",
        role: "user" as const,
        content: "分析这张图",
        attachments: [{
          id: "a1", name: "ref.png", mime: "image/png", size: 128, kind: "image" as const,
          filePath: "C:/one/ref.png", fileUrl: "local-media://one", createdAt: current.updatedAt,
        }],
        tools: [],
        status: "complete" as const,
        createdAt: current.updatedAt,
      }],
      draftAttachments: [],
      status: "idle" as const,
      context: { used: 12, limit: 128000, percent: 0.1, danger: false, estimated: true, updatedAt: current.updatedAt },
      compactCount: 0,
      characterIds: [], lorebookIds: [], generationMode: "confirm" as const, autoPlayGroup: false, pinned: false,
      createdAt: current.updatedAt,
      updatedAt: current.updatedAt,
    };
    current.conversations.push(conversation);
    incoming.conversations.push(JSON.parse(JSON.stringify(conversation)));
    incoming.conversations[0].messages[0].attachments[0].filePath = "D:/restored/ref (1).png";
    incoming.conversations[0].messages[0].attachments[0].fileUrl = "local-media://restored";
    incoming.conversations[0].context.used = 999;
    const result = mergeAgentWorkspaces(current, incoming);
    expect(result.workspace.conversations).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it("remaps conversation-scoped memory when a conflicting chat is copied", () => {
    const current = empty();
    current.conversations.push({
      id: "chat",
      title: "已有会话",
      messages: [],
      draftAttachments: [],
      status: "idle",
      context: { used: 0, limit: 128000, percent: 0, danger: false, estimated: true, updatedAt: current.updatedAt },
      compactCount: 0,
      characterIds: [], lorebookIds: [], generationMode: "confirm", autoPlayGroup: false, pinned: false,
      createdAt: current.updatedAt,
      updatedAt: current.updatedAt,
    });
    const incoming = empty();
    incoming.conversations.push({
      ...JSON.parse(JSON.stringify(current.conversations[0])),
      title: "导入会话",
      messages: [{ id: "m", role: "user", content: "不同内容", attachments: [], tools: [], status: "complete", createdAt: current.updatedAt }],
    });
    incoming.memories.push({
      id: "memory",
      title: "偏好",
      content: "喜欢电影光照",
      scope: "conversation",
      conversationId: "chat",
      createdAt: current.updatedAt,
      updatedAt: current.updatedAt,
    });
    const result = mergeAgentWorkspaces(current, incoming);
    const imported = result.workspace.conversations.find((item) => item.title === "导入会话");
    expect(imported).toBeTruthy();
    expect(result.workspace.memories[0].conversationId).toBe(imported?.id);
  });
});
