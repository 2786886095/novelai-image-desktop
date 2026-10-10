import { describe, expect, it } from "vitest";
import locales from "./feature-locales.json";
import { MCP_TOKEN_PLACEHOLDER, mcpClientConfigs } from "./mcp-client-configs";

const url = "http://127.0.0.1:39280/mcp";
const token = "abc123";

describe("mcpClientConfigs", () => {
  const configs = mcpClientConfigs({ url, token });

  it("covers the mainstream harnesses with unique ids", () => {
    const ids = configs.map((config) => config.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([
      "pi", "claude-code", "codex", "gemini-cli", "cursor", "vscode", "windsurf", "cline", "opencode", "claude-desktop", "generic",
    ]));
  });

  it("puts the URL and the bearer token into every client", () => {
    for (const config of configs) {
      const all = config.snippets.map((snippet) => snippet.content).join("\n");
      expect(all, config.id).toContain(url);
      expect(all, config.id).toContain(`Bearer ${token}`);
    }
  });

  it("emits valid JSON for every JSON snippet", () => {
    for (const config of configs) {
      for (const snippet of config.snippets.filter((item) => item.kind === "json")) {
        expect(() => JSON.parse(snippet.content), `${config.id}: ${snippet.title}`).not.toThrow();
      }
    }
  });

  it("uses each client's own field names", () => {
    const parsed = (id: string) => JSON.parse(configs.find((config) => config.id === id)!.snippets.find((item) => item.kind === "json")!.content);
    expect(parsed("gemini-cli").mcpServers.langbai).toMatchObject({ httpUrl: url, timeout: 600_000 });
    expect(parsed("vscode").servers.langbai).toMatchObject({ type: "http", url });
    expect(parsed("windsurf").mcpServers.langbai).toMatchObject({ serverUrl: url });
    expect(parsed("cline").mcpServers.langbai).toMatchObject({ type: "streamableHttp", url, timeout: 600 });
    expect(parsed("opencode").mcp.langbai).toMatchObject({ type: "remote", url, enabled: true });
    expect(parsed("claude-code").mcpServers.langbai).toMatchObject({ type: "http", url });
    expect(parsed("claude-desktop").mcpServers.langbai.env.LANGBAI_AUTH).toBe(`Bearer ${token}`);
    expect(parsed("pi").mcpServers.langbai).toMatchObject({ url, timeout: 600, headers: { Authorization: `Bearer ${token}` } });
  });

  it("writes a codex TOML table with headers and timeout", () => {
    const toml = configs.find((config) => config.id === "codex")!.snippets[0].content;
    expect(toml).toContain("[mcp_servers.langbai]");
    expect(toml).toContain(`url = "${url}"`);
    expect(toml).toContain(`http_headers = { "Authorization" = "Bearer ${token}" }`);
    expect(toml).toContain("tool_timeout_sec = 600");
  });

  it("has five-language catalog rows for every translatable caption", () => {
    const texts = configs.flatMap((config) => [config.label, config.note ?? "", ...config.snippets.map((snippet) => snippet.title)]);
    for (const value of texts.filter((item) => /[\u4e00-\u9fff]/.test(item))) {
      expect(locales, value).toHaveProperty([value]);
    }
  });

  it("falls back to a placeholder when no token exists yet", () => {
    const pi = mcpClientConfigs({ url, token: "  " }).find((config) => config.id === "pi")!;
    expect(pi.snippets[0].content).toContain(`Bearer ${MCP_TOKEN_PLACEHOLDER}`);
  });

  it("honours custom names and timeouts", () => {
    const custom = mcpClientConfigs({ url, token, name: "studio", timeoutSeconds: 120 });
    expect(JSON.parse(custom.find((config) => config.id === "cursor")!.snippets[0].content).mcpServers.studio.url).toBe(url);
    expect(custom.find((config) => config.id === "codex")!.snippets[0].content).toContain("tool_timeout_sec = 120");
  });
});
