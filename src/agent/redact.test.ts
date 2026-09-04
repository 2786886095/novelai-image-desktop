import { describe, expect, it } from "vitest";
import { redactAgentToolResponseForModel } from "./redact";

describe("agent tool boundary redaction", () => {
  it("keeps reusable attachment IDs but removes paths, bytes, and credentials", () => {
    const safe = redactAgentToolResponseForModel({
      ok: true,
      title: "generated",
      output: "ignored raw output C:\\private\\image.png",
      data: {
        attachmentId: "history-1",
        filePath: "C:\\private\\image.png",
        fileUrl: "file:///C:/private/image.png",
        nested: { base64: "very-secret-bytes", apiKey: "secret", prompt: "1girl" },
        message: "saved at D:\\outputs\\image.png",
      },
      generatedImages: [{
        id: "history-1",
        name: "image.png",
        mime: "image/png",
        size: 123,
        kind: "image",
        filePath: "C:\\private\\image.png",
        fileUrl: "file:///C:/private/image.png",
        createdAt: new Date(0).toISOString(),
      }],
    });
    const encoded = JSON.stringify(safe);

    expect(encoded).toContain("history-1");
    expect(encoded).toContain("1girl");
    expect(encoded).not.toContain("private");
    expect(encoded).not.toContain("very-secret-bytes");
    expect(encoded).not.toContain("secret");
    expect(encoded).not.toContain("filePath");
    expect(encoded).not.toContain("fileUrl");
  });
});
