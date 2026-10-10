// Settings panel + renderer bridge for the local MCP server.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppSettings, McpServerStatus } from "../types";
import { useAppStore } from "../store";
import { featureText, useFeatureText } from "../feature-i18n";
import { mcpClientConfigs, type McpClientId } from "../mcp-client-configs";
import { Button, IconText, NumberInput, SecretInput, SelectMenu, Toggle } from "./ui";

const CLIENT_STORAGE_KEY = "langbai.mcp.client";

const toastText = (key: string, params?: Record<string, string | number>) =>
  featureText(useAppStore.getState().settings?.language, key, params);

/** Refresh history / balance when an MCP client generated images. Mount once. */
export function McpEventSupport() {
  useEffect(() => window.naiDesktop.onMcpEvent?.((event) => {
    if (event.kind !== "history") return;
    const state = useAppStore.getState();
    void state.refreshHistory(event.date).catch(() => undefined);
    void state.refreshAccount().catch(() => undefined);
    state.setToast(toastText("MCP：已生成 {count} 张图片", { count: event.count }));
  }), []);
  return null;
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text);
  useAppStore.getState().setToast(toastText("已复制到剪贴板"));
}

export function McpServerSettings({ settings, update }: {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
}) {
  const ft = useFeatureText();
  const refreshSettings = useAppStore((state) => state.refreshSettings);
  const [status, setStatus] = useState<McpServerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState<McpClientId>(() => (localStorage.getItem(CLIENT_STORAGE_KEY) as McpClientId | null) ?? "pi");
  const reload = useCallback(async () => setStatus(await window.naiDesktop.mcpStatus()), []);
  useEffect(() => { void reload(); }, [reload, settings.mcpServerEnabled, settings.mcpServerPort]);

  const enabled = settings.mcpServerEnabled === true;
  const port = settings.mcpServerPort ?? 39280;
  const token = settings.mcpServerToken ?? "";
  const url = status?.url || `http://127.0.0.1:${port}/mcp`;
  const clients = useMemo(() => mcpClientConfigs({ url, token }), [url, token]);
  const client = clients.find((item) => item.id === clientId) ?? clients[0];
  const chooseClient = (value: string) => {
    setClientId(value as McpClientId);
    localStorage.setItem(CLIENT_STORAGE_KEY, value);
  };

  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    try { await operation(); await refreshSettings(); await reload(); }
    catch (error) { useAppStore.getState().setToast(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  const statusText = status?.running
    ? ft("运行中：{url}", { url: status.url ?? url })
    : status?.error ? ft("启动失败：{error}", { error: status.error }) : ft("未运行");

  return (
    <div className="settings-form">
      <div className="info-card">
        <strong>{ft("本地 MCP 服务")}</strong>
        <span>{ft("让外部智能体（pi、Claude Code、Codex 等）通过 MCP 控制本软件：文生图、图生图、局部重绘、超分、查看历史和图片。仅监听 127.0.0.1，需要 Bearer Token；生成结果照常保存到历史记录。")}</span>
      </div>
      <div className="toggle-list">
        <Toggle
          checked={enabled}
          onChange={(value) => { if (!busy) void run(() => update("mcpServerEnabled", value)); }}
          label={ft("启用 MCP 服务")}
          description={statusText}
        />
      </div>
      <NumberInput
        label={ft("端口")}
        value={port}
        min={1024}
        max={65535}
        disabled={busy}
        onChange={(value) => void run(() => update("mcpServerPort", Math.trunc(value)))}
      />
      <NumberInput
        label={ft("单次调用 Anlas 上限（0 = 只允许免费操作）")}
        value={settings.mcpMaxAnlasPerCall ?? 0}
        min={0}
        max={100000}
        onChange={(value) => void update("mcpMaxAnlasPerCall", Math.max(0, Math.trunc(value)))}
      />
      <p className="settings-hint">
        {ft("每次付费操作执行前都会先估价，超过上限直接拒绝，不会扣点。Opus 免费范围：≤1MP、≤28 步、单张、无精准参考。精准参考按每张参考图 5 Anlas 计入上限（偏保守）。")}
      </p>
      <SecretInput label={ft("访问令牌（Bearer Token）")} value={token} readOnly placeholder={ft("启用后自动生成")} />
      <div className="row-actions">
        <Button disabled={!token} onClick={() => void copy(token)}><IconText icon="copy">{ft("复制令牌")}</IconText></Button>
        <Button disabled={busy || !enabled} onClick={() => void run(() => window.naiDesktop.mcpRegenerateToken())}>
          <IconText icon="refresh">{ft("重新生成令牌")}</IconText>
        </Button>
      </div>
      <label className="field">
        <span>{ft("接入客户端")}</span>
        <SelectMenu
          ariaLabel={ft("接入客户端")}
          value={client.id}
          options={clients.map((item) => ({ value: item.id, label: ft(item.label) }))}
          onChange={chooseClient}
        />
      </label>
      {client.snippets.map((snippet) => (
        <div key={`${client.id}-${snippet.title}`} className="mcp-client-snippet">
          <label className="field">
            <span>{ft(snippet.title)}</span>
            <textarea
              readOnly
              spellCheck={false}
              rows={Math.min(14, snippet.content.split("\n").length + (snippet.kind === "command" ? 1 : 0))}
              value={snippet.content}
              style={{ fontFamily: "ui-monospace, Consolas, monospace", whiteSpace: snippet.kind === "command" ? "pre-wrap" : "pre" }}
            />
          </label>
          <div className="row-actions">
            <Button disabled={!token} onClick={() => void copy(snippet.content)}><IconText icon="copy">{ft("复制")}</IconText></Button>
          </div>
        </div>
      ))}
      {client.note && <p className="settings-hint">{ft(client.note)}</p>}
      <p className="settings-hint">
        {ft("配置里包含访问令牌，请勿分享。长时间生成会通过进度通知保持连接；如果客户端不支持，请把它的 MCP 工具超时调到 600 秒左右。")}
      </p>
    </div>
  );
}
