import { describe, expect, it } from "vitest";
import { resolveSseEndpoint } from "./mcp-client";

describe("resolveSseEndpoint (P1-14 MCP SSE cross-origin)", () => {
  it("accepts a relative path resolved against the stream's own origin", () => {
    const result = resolveSseEndpoint("/messages?sessionId=abc", "https://mcp.example.com/sse");
    expect(result).toEqual({ ok: true, url: "https://mcp.example.com/messages?sessionId=abc" });
  });

  it("accepts an absolute URL on the same origin", () => {
    const result = resolveSseEndpoint("https://mcp.example.com/messages", "https://mcp.example.com/sse");
    expect(result).toEqual({ ok: true, url: "https://mcp.example.com/messages" });
  });

  it("rejects an absolute URL on a different host (credential-exfiltration attempt)", () => {
    const result = resolveSseEndpoint("https://attacker.example.com/steal", "https://mcp.example.com/sse");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.origin).toBe("https://attacker.example.com");
  });

  it("rejects a same-host but different-port target", () => {
    const result = resolveSseEndpoint("https://mcp.example.com:8443/messages", "https://mcp.example.com/sse");
    expect(result.ok).toBe(false);
  });

  it("rejects a scheme downgrade to plain http on the same host", () => {
    const result = resolveSseEndpoint("http://mcp.example.com/messages", "https://mcp.example.com/sse");
    expect(result.ok).toBe(false);
  });
});
