// Connection snippets for the local MCP server, one entry per mainstream agent
// harness. Pure module (no DOM / Electron) so it can be unit-tested.
// `label`, `title` and `note` are feature-locales keys: render them with ft().

export type McpClientId =
  | "pi"
  | "claude-code"
  | "codex"
  | "gemini-cli"
  | "cursor"
  | "vscode"
  | "windsurf"
  | "cline"
  | "opencode"
  | "claude-desktop"
  | "generic";

export type McpSnippetKind = "command" | "json" | "toml" | "text";

export interface McpClientSnippet {
  /** Short Chinese caption shown above the snippet. */
  title: string;
  kind: McpSnippetKind;
  content: string;
}

export interface McpClientConfig {
  id: McpClientId;
  label: string;
  snippets: McpClientSnippet[];
  /** Short Chinese hint shown under the snippets. */
  note?: string;
}

export interface McpClientConfigInput {
  url: string;
  /** Bearer token; an empty value renders the `<token>` placeholder. */
  token: string;
  /** Server name used in client configs. */
  name?: string;
  /** Tool-call timeout for clients that need an explicit one. */
  timeoutSeconds?: number;
}

export const MCP_TOKEN_PLACEHOLDER = "<token>";

const json = (value: unknown) => JSON.stringify(value, null, 2);
const tomlString = (value: string) => JSON.stringify(value); // TOML basic strings share JSON escaping for this charset
const tomlKey = (value: string) => (/^[A-Za-z0-9_-]+$/.test(value) ? value : tomlString(value));

export function mcpClientConfigs(input: McpClientConfigInput): McpClientConfig[] {
  const url = input.url;
  const name = input.name?.trim() || "langbai";
  const timeout = Math.max(60, Math.trunc(input.timeoutSeconds ?? 600));
  const token = input.token.trim() || MCP_TOKEN_PLACEHOLDER;
  const bearer = `Bearer ${token}`;
  const headers = { Authorization: bearer };

  return [
    {
      id: "pi",
      label: "pi",
      snippets: [
        {
          title: "终端执行",
          kind: "command",
          content: `pi mcp add ${name} --url ${url} --header "Authorization=${bearer}" --exposure direct`,
        },
        {
          title: "或写入 ~/.pi/agent/mcp.json",
          kind: "json",
          content: json({ mcpServers: { [name]: { url, headers, timeout, exposure: "direct" } } }),
        },
      ],
      note: "添加后在 pi 会话里执行 /reload；`pi mcp list` 可检查连接。",
    },
    {
      id: "claude-code",
      label: "Claude Code",
      snippets: [
        {
          title: "终端执行（--scope user 对所有项目生效）",
          kind: "command",
          content: `claude mcp add --transport http --scope user ${name} ${url} --header "Authorization: ${bearer}"`,
        },
        {
          title: "或写入项目根目录 .mcp.json",
          kind: "json",
          content: json({ mcpServers: { [name]: { type: "http", url, headers } } }),
        },
      ],
      note: "在 Claude Code 里用 /mcp 查看状态。长任务可把环境变量 MCP_TOOL_TIMEOUT 设为 600000（毫秒）。",
    },
    {
      id: "codex",
      label: "Codex CLI",
      snippets: [
        {
          title: "写入 ~/.codex/config.toml",
          kind: "toml",
          content: [
            `[mcp_servers.${tomlKey(name)}]`,
            `url = ${tomlString(url)}`,
            `http_headers = { "Authorization" = ${tomlString(bearer)} }`,
            `tool_timeout_sec = ${timeout}`,
          ].join("\n"),
        },
        {
          title: "或用环境变量保存令牌",
          kind: "command",
          content: `codex mcp add ${name} --url ${url} --bearer-token-env-var LANGBAI_MCP_TOKEN`,
        },
      ],
      note: "使用第二种方式时，需要先把令牌设为环境变量 LANGBAI_MCP_TOKEN。Codex 里用 /mcp 查看状态。",
    },
    {
      id: "gemini-cli",
      label: "Gemini CLI",
      snippets: [
        {
          title: "合并到 ~/.gemini/settings.json",
          kind: "json",
          content: json({ mcpServers: { [name]: { httpUrl: url, headers, timeout: timeout * 1000 } } }),
        },
      ],
      note: "注意字段是 httpUrl（Streamable HTTP），timeout 单位为毫秒。",
    },
    {
      id: "cursor",
      label: "Cursor",
      snippets: [
        {
          title: "合并到 ~/.cursor/mcp.json（或项目 .cursor/mcp.json）",
          kind: "json",
          content: json({ mcpServers: { [name]: { url, headers } } }),
        },
      ],
      note: "保存后在 Cursor 设置 → MCP 中确认服务已启用。",
    },
    {
      id: "vscode",
      label: "VS Code (Copilot)",
      snippets: [
        {
          title: "命令面板 “MCP: Open User Configuration”，合并到 mcp.json（或项目 .vscode/mcp.json）",
          kind: "json",
          content: json({ servers: { [name]: { type: "http", url, headers } } }),
        },
      ],
      note: "VS Code 使用 servers 而不是 mcpServers。",
    },
    {
      id: "windsurf",
      label: "Windsurf",
      snippets: [
        {
          title: "合并到 ~/.codeium/windsurf/mcp_config.json",
          kind: "json",
          content: json({ mcpServers: { [name]: { serverUrl: url, headers } } }),
        },
      ],
      note: "Windsurf 的远程地址字段是 serverUrl。",
    },
    {
      id: "cline",
      label: "Cline",
      snippets: [
        {
          title: "Cline 面板 → MCP Servers → Configure，合并到 cline_mcp_settings.json",
          kind: "json",
          content: json({ mcpServers: { [name]: { type: "streamableHttp", url, headers, timeout } } }),
        },
      ],
      note: "必须写 type: streamableHttp，否则 Cline 会按旧 SSE 方式连接。timeout 单位为秒。",
    },
    {
      id: "opencode",
      label: "OpenCode",
      snippets: [
        {
          title: "合并到 opencode.json（项目根目录或 ~/.config/opencode/）",
          kind: "json",
          content: json({
            $schema: "https://opencode.ai/config.json",
            mcp: { [name]: { type: "remote", url, headers, enabled: true } },
          }),
        },
      ],
    },
    {
      id: "claude-desktop",
      label: "Claude Desktop",
      snippets: [
        {
          title: "合并到 claude_desktop_config.json（设置 → 开发者 → 编辑配置）",
          kind: "json",
          content: json({
            mcpServers: {
              [name]: {
                command: "npx",
                args: ["-y", "mcp-remote", url, "--transport", "http-only", "--allow-http", "--header", "Authorization:${LANGBAI_AUTH}"],
                env: { LANGBAI_AUTH: bearer },
              },
            },
          }),
        },
      ],
      note: "Claude Desktop 的配置文件只支持本地命令，这里用 mcp-remote 桥接（需要 Node.js）。--header 的冒号两侧不要加空格。",
    },
    {
      id: "generic",
      label: "其他客户端",
      snippets: [
        {
          title: "Cherry Studio、Trae 等：选择 Streamable HTTP（可流式 HTTP）类型后填写",
          kind: "text",
          content: [`URL: ${url}`, `Header: Authorization: ${bearer}`, `Timeout: ${timeout}s`].join("\n"),
        },
      ],
      note: "传输方式为 Streamable HTTP（无状态，不支持旧 SSE 端点）；协议版本 2024-11-05 ～ 2025-11-25。",
    },
  ];
}
