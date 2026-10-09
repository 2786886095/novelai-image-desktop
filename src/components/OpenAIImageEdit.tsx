// OpenAI Images edits: inpaint-panel controls and the settings card.
import { useEffect, useState } from "react";
import type { AppSettings } from "../types";
import { useAppStore } from "../store";
import { useFeatureText } from "../feature-i18n";
import {
  DEFAULT_OPENAI_EDIT_MODEL,
  imageEditEndpoint,
  normalizeOpenAIImageEditSettings,
  OPENAI_EDIT_FIDELITIES,
  OPENAI_EDIT_QUALITIES,
  type OpenAIImageEditSettings,
} from "../openai-image-edit";
import { Button, SecretInput, SelectMenuCompat } from "./ui";

async function saveSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  await window.naiDesktop.setSetting(key, value);
  await useAppStore.getState().refreshSettings();
}

function endpointHost(baseUrl: string) {
  try { return new URL(baseUrl).host; } catch { return baseUrl; }
}

export function useOpenAIImageEditConfig() {
  const settings = useAppStore((state) => state.settings);
  const edit = normalizeOpenAIImageEditSettings(settings?.openaiImageEdit);
  const configured = Boolean(settings?.openaiImageEditApiKey?.trim() && edit.baseUrl && edit.model);
  return { settings, edit, configured };
}

/** NovelAI ↔ OpenAI switch at the top of the inpaint panel. */
export function InpaintEngineSwitch() {
  const ft = useFeatureText();
  const engine = useAppStore((state) => state.settings?.inpaintEngine) === "openai" ? "openai" : "novelai";
  const busy = useAppStore((state) => state.isGenerating);
  return (
    <div className="field">
      <span>{ft("重绘引擎")}</span>
      <div className="mode-buttons" role="group" aria-label={ft("重绘引擎")}>
        <Button variant={engine === "novelai" ? "primary" : "secondary"} disabled={busy} onClick={() => void saveSetting("inpaintEngine", "novelai")}>NovelAI</Button>
        <Button variant={engine === "openai" ? "primary" : "secondary"} disabled={busy} onClick={() => void saveSetting("inpaintEngine", "openai")}>{ft("OpenAI 图像编辑")}</Button>
      </div>
    </div>
  );
}

/** Replaces the NovelAI prompt/parameter block when the OpenAI engine is selected. */
export function OpenAIInpaintControls({ openSettings }: { openSettings: () => void }) {
  const ft = useFeatureText();
  const { edit, configured } = useOpenAIImageEditConfig();
  const prompt = useAppStore((state) => state.openaiEditPrompt);
  const setPrompt = useAppStore((state) => state.setOpenaiEditPrompt);
  const update = (patch: Partial<OpenAIImageEditSettings>) => void saveSetting("openaiImageEdit", { ...edit, ...patch });
  return (
    <>
      <div className="info-card">
        <strong>{ft("OpenAI 图像编辑")}</strong>
        <span>{configured ? `${edit.model} · ${endpointHost(edit.baseUrl)}` : ft("尚未配置接口密钥。")}</span>
      </div>
      {!configured && <Button className="full" onClick={openSettings}>{ft("前往设置")}</Button>}
      <label className="field">
        <span>{ft("重绘指令")}</span>
        <textarea
          aria-label={ft("重绘指令")}
          rows={6}
          value={prompt}
          placeholder={ft("用自然语言描述蒙版区域要变成什么，例如：把标题换成写着 DREAM ENGINE 的霓虹 logo")}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </label>
      <label className="field">
        <span>{ft("质量")}</span>
        <SelectMenuCompat value={edit.quality} onChange={(event) => update({ quality: event.target.value as OpenAIImageEditSettings["quality"] })}>
          {OPENAI_EDIT_QUALITIES.map((value) => <option key={value} value={value}>{value === "auto" ? ft("自动（不发送）") : value}</option>)}
        </SelectMenuCompat>
      </label>
      <label className="field">
        <span>{ft("输入保真度")}</span>
        <SelectMenuCompat value={edit.inputFidelity} onChange={(event) => update({ inputFidelity: event.target.value as OpenAIImageEditSettings["inputFidelity"] })}>
          {OPENAI_EDIT_FIDELITIES.map((value) => <option key={value || "none"} value={value}>{value || ft("不发送")}</option>)}
        </SelectMenuCompat>
      </label>
      <p className="settings-hint">{ft("只把蒙版区域（外扩并羽化）贴回原图，蒙版外像素保持不变。由 OpenAI 或中转服务按其价格计费，不消耗 Anlas；失败不会自动重试。")}</p>
    </>
  );
}

export function OpenAIInpaintRunButton() {
  const ft = useFeatureText();
  const { configured } = useOpenAIImageEditConfig();
  const isGenerating = useAppStore((state) => state.isGenerating);
  const prompt = useAppStore((state) => state.openaiEditPrompt);
  const hasMask = useAppStore((state) => Boolean(state.inpaintMask));
  const run = useAppStore((state) => state.openaiInpaint);
  const cancel = useAppStore((state) => state.cancel);
  const reason = !configured ? ft("尚未配置接口密钥。") : !hasMask ? ft("请先涂抹蒙版。") : !prompt.trim() ? ft("请输入重绘指令。") : "";
  return (
    <div className="left-footer">
      {reason && !isGenerating && <small className="field-hint">{reason}</small>}
      <Button className="full" variant="primary" disabled={!isGenerating && Boolean(reason)} onClick={() => void (isGenerating ? cancel() : run())}>
        {isGenerating ? ft("停止") : ft("OpenAI 重绘")}
      </Button>
    </div>
  );
}

/** Settings → API: endpoint, key and defaults for OpenAI image edits. */
export function OpenAIImageEditSettingsCard({ settings }: { settings: AppSettings }) {
  const ft = useFeatureText();
  const stored = normalizeOpenAIImageEditSettings(settings.openaiImageEdit);
  const [draft, setDraft] = useState<OpenAIImageEditSettings>(stored);
  const [key, setKey] = useState(settings.openaiImageEditApiKey ?? "");
  const [customSize, setCustomSize] = useState(stored.size === "fit" || stored.size === "auto" ? "" : stored.size);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(normalizeOpenAIImageEditSettings(settings.openaiImageEdit)); }, [settings.openaiImageEdit]);
  const sizeMode = draft.size === "fit" || draft.size === "auto" ? draft.size : "custom";

  async function save() {
    setSaving(true);
    try {
      const size = sizeMode === "custom" ? customSize.trim() : draft.size;
      if (sizeMode === "custom" && !/^[1-9]\d{1,4}x[1-9]\d{1,4}$/.test(size)) throw Error(ft("尺寸应为 WIDTHxHEIGHT。"));
      imageEditEndpoint(draft.baseUrl);
      if (!draft.model.trim()) throw Error(ft("请输入模型名称。"));
      if (/[\r\n]/.test(key)) throw Error(ft("密钥格式无效。"));
      await window.naiDesktop.setSetting("openaiImageEdit", normalizeOpenAIImageEditSettings({ ...draft, size }));
      await window.naiDesktop.setSetting("openaiImageEditApiKey", key.trim());
      await useAppStore.getState().refreshSettings();
      setMessage(ft("已保存；尚未发送任何请求。"));
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage(/[\u4e00-\u9fff]/.test(text) ? ft(text) : text || ft("保存失败，请检查接口地址（须为 HTTPS）、模型和密钥。"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="compatible-images" aria-label={ft("OpenAI 图像编辑")}>
      <h3>{ft("OpenAI 图像编辑")}</h3>
      <p className="settings-hint">{ft("用于重绘页的“OpenAI 图像编辑”引擎。支持官方接口和 OpenAI 兼容中转；不会改变当前的生图服务。")}</p>
      <label className="field">
        <span>{ft("接口地址")}</span>
        <input aria-label={ft("接口地址")} value={draft.baseUrl} autoComplete="off" placeholder="https://api.openai.com/v1" onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} />
        <small>{ft("填写到 /v1 即可，会自动使用 /images/edits。")}</small>
      </label>
      <SecretInput label={ft("API 密钥")} value={key} autoComplete="off" showLabel={ft("显示")} hideLabel={ft("隐藏")} onChange={(event) => setKey(event.target.value)} />
      <label className="field">
        <span>{ft("模型")}</span>
        <input aria-label={ft("模型")} value={draft.model} placeholder={DEFAULT_OPENAI_EDIT_MODEL} onChange={(event) => setDraft({ ...draft, model: event.target.value })} />
      </label>
      <label className="field">
        <span>{ft("请求尺寸")}</span>
        <SelectMenuCompat value={sizeMode} onChange={(event) => {
          const mode = event.target.value;
          if (mode === "custom") {
            const value = customSize || "1536x1024";
            setCustomSize(value);
            setDraft({ ...draft, size: value });
          } else setDraft({ ...draft, size: mode });
        }}>
          <option value="fit">{ft("自动匹配标准尺寸（推荐）")}</option>
          <option value="auto">{ft("由服务端决定（auto）")}</option>
          <option value="custom">{ft("自定义")}</option>
        </SelectMenuCompat>
        {sizeMode === "custom" && <input aria-label={ft("自定义尺寸")} value={customSize} placeholder="1536x1024" onChange={(event) => setCustomSize(event.target.value)} />}
        <small>{ft("图片会先补边到请求比例再上传，结果按原尺寸裁回，不会拉伸。")}</small>
      </label>
      <Button variant="primary" disabled={saving} onClick={() => void save()}>{saving ? ft("保存中…") : ft("保存")}</Button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
