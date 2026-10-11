import "../compatible-images.css";
import { compatibleImageText } from "../compatible-image-text";
import { useState } from "react";
import type { AppSettings, CompatibleImageSettings } from "../types";
import { useAppStore } from "../store";
import { Button, CommittedNumberInput, SecretInput, SelectMenuCompat } from "./ui";

export function CompatibleImageSettingsCard({ settings, refresh }: { settings: AppSettings; refresh: () => Promise<void> }) {
  const text = compatibleImageText(settings.language);
  const [config, setConfig] = useState<CompatibleImageSettings>(settings.compatibleImage ?? { baseUrl: "", model: "", size: "1024x1024", responseFormat: "auto" });
  const [key, setKey] = useState(settings.imageApiKey ?? "");
  const [extensions, setExtensions] = useState(JSON.stringify(config.extensions ?? {}, null, 2));
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadedRevision, setLoadedRevision] = useState(settings.imageServiceRevision ?? "");
  const [conflict, setConflict] = useState(false);
  const stale = conflict || loadedRevision !== (settings.imageServiceRevision ?? "");
  async function reload() {
    setSaving(true);
    try {
      const next = await window.naiDesktop.getSettings();
      const nextConfig = next.compatibleImage ?? { baseUrl: "", model: "", size: "1024x1024", responseFormat: "auto" as const };
      setConfig(nextConfig); setKey(next.imageApiKey ?? "");
      setExtensions(JSON.stringify(nextConfig.extensions ?? {}, null, 2));
      setLoadedRevision(next.imageServiceRevision ?? ""); setConflict(false); setMessage("");
      await refresh();
    } catch { setMessage(text.invalid); }
    finally { setSaving(false); }
  }
  async function save() {
    if (stale || !loadedRevision) return;
    setSaving(true);
    try {
      const parsed = JSON.parse(extensions || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error();
      const result = await window.naiDesktop.saveCompatibleImageSettings({ ...config, extensions: parsed }, key, "openai-images", loadedRevision);
      setMessage(result.ok ? text.saved : result.code === "stale" ? text.changed : text.invalid);
      if (result.ok) { setLoadedRevision(result.revision ?? ""); setConflict(false); }
      if (result.code === "stale") setConflict(true);
      if (result.ok || result.code === "stale") await refresh();
    } catch { setMessage(text.invalid); }
    finally { setSaving(false); }
  }
  return <section className="compatible-images" aria-label={text.config}>
    <h3>{text.title}</h3>
    <p>{text.current}{settings.imageProvider === "openai-images" ? `${text.panel} · ${settings.compatibleImage?.model ?? ""}` : text.native}</p>
    <p className="settings-hint">{text.scope}</p>
    {settings.imageProvider === "openai-images" && <Button disabled={saving} onClick={async () => {
      setSaving(true);
      try {
        const result = await window.naiDesktop.setCompatibleImageProvider("novelai", settings.imageServiceRevision ?? "");
        if (result.ok && !stale) setLoadedRevision(result.revision ?? "");
        if (result.code === "stale") setConflict(true);
        await refresh(); setMessage(result.ok ? text.switched : result.code === "stale" ? text.changed : text.switchFailed);
      }
      catch { setMessage(text.switchFailed); }
      finally { setSaving(false); }
    }}>{text.switchNative}</Button>}
    {stale && <div role="alert"><p className="settings-hint">{text.changed}</p><Button disabled={saving} onClick={() => void reload()}>{text.reload}</Button></div>}
    <details open={settings.imageProvider === "openai-images" || undefined}>
      <summary>{text.setup}</summary>
      <label className="field"><span>{text.url}</span><input aria-label={text.url} value={config.baseUrl} autoComplete="off" placeholder="https://gateway.example/v1" onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })} /><small>{text.urlHelp}</small></label>
      <SecretInput label={text.key} value={key} autoComplete="off" showLabel={text.show} hideLabel={text.hide} onChange={(e) => setKey(e.target.value)} />
      <label className="field"><span>{text.model}</span><input value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} placeholder={text.modelHint} /></label>
      <label className="field"><span>{text.size}</span><input aria-label={text.size} value={config.size} onChange={(e) => setConfig({ ...config, size: e.target.value })} placeholder={text.sizeHint} /><small>{text.sizeHelp}</small></label>
      <label className="field"><span>{text.format}</span><SelectMenuCompat value={config.responseFormat} onChange={(e) => setConfig({ ...config, responseFormat: e.target.value as CompatibleImageSettings["responseFormat"] })}>
        <option value="auto">{text.auto}</option><option value="b64_json">b64_json</option><option value="url">URL</option>
      </SelectMenuCompat></label>
      <label className="field"><span>{text.extensions}</span><textarea aria-label={text.extensions} rows={3} value={extensions} onChange={(e) => setExtensions(e.target.value)} /><small>{text.extensionHelp}</small></label>
      <Button variant="primary" disabled={saving || stale || !loadedRevision} onClick={() => void save()}>{saving ? text.saving : text.save}</Button>
    </details>
    {message && <p role="status">{message}</p>}
    <small>{text.privacy}</small>
  </section>;
}

/** Separate controls avoid implying that unsupported NovelAI parameters affect this request. */
export function CompatibleGenerationPanel({ openSettings }: { openSettings: () => void }) {
  const state = useAppStore();
  const config = state.settings?.compatibleImage;
  const text = compatibleImageText(state.settings?.language);
  return <div className="compatible-generation">
    <div className="panel-scroll">
      <div className="account-card"><strong>{text.panel}</strong><span>{config?.model || text.missingModel} · {config?.size || text.missingSize}</span></div>
      <label className="field"><span>{text.prompt}</span><textarea aria-label={text.prompt} rows={10} value={state.params.positivePrompt} onChange={(e) => state.setParam("positivePrompt", e.target.value)} /></label>
      <CommittedNumberInput label={text.count} value={state.batchCount} min={1} onCommit={(n) => state.setBatchCount(Math.max(1, Math.round(n)))} />
      <p className="settings-hint">{text.requestHelp}</p>
      <p className="settings-hint">{text.controlsHelp}</p>
      <Button onClick={openSettings}>{text.settings}</Button>
    </div>
    <div className="left-footer"><Button variant="primary" disabled={!state.isGenerating && !state.params.positivePrompt.trim()} onClick={() => void (state.isGenerating ? state.cancel() : state.generate())}>{state.isGenerating ? text.stop : text.generate}</Button></div>
  </div>;
}
