import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Button, IconText } from "./components/ui";
import { Icon } from "./components/icons";
import { normalizeAppLanguage } from "./i18n";
import { inspectImageMetadata, parseImageMeta, type ImageMetadataReport } from "./png-meta";
import { useAppStore } from "./store";
import type { AppLanguage, ImportedParams } from "./types";

type MetadataText = {
  eyebrow: string;
  title: string;
  subtitle: string;
  back: string;
  dropTitle: string;
  dropHint: string;
  choose: string;
  imageAlt: string;
  detected: string;
  sourceNovelAi: string;
  sourceSd: string;
  sourceComfy: string;
  sourceUnknown: string;
  compatible: string;
  compatibleHint: string;
  apply: string;
  applied: string;
  noCompatible: string;
  params: string;
  noParams: string;
  raw: string;
  copyRaw: string;
  copied: string;
  localOnly: string;
  replace: string;
  viewOnly: string;
  readFailed: string;
};

const TEXT: Record<AppLanguage, MetadataText> = {
  "zh-CN": {
    eyebrow: "IMAGE METADATA",
    title: "恢复图片原数据",
    subtitle: "读取 NovelAI、Stable Diffusion WebUI / Forge 与 ComfyUI 图片内嵌参数。",
    back: "返回工具首页",
    dropTitle: "导入原始图片",
    dropHint: "拖入或选择 PNG、JPG、JPEG、WebP；全程只在本机读取，不会上传。",
    choose: "选择图片",
    imageAlt: "待解析图片",
    detected: "识别来源",
    sourceNovelAi: "NovelAI",
    sourceSd: "Stable Diffusion WebUI / Forge",
    sourceComfy: "ComfyUI",
    sourceUnknown: "未知或无可识别参数",
    compatible: "可一键使用的参数",
    compatibleHint: "只套用 NovelAI 支持的兼容项；SD 模型、VAE、LoRA 等原值保留在下方供查看。",
    apply: "一键使用到生成",
    applied: "已套用兼容参数并切换到生成面板",
    noCompatible: "没有可直接套用到 NovelAI 的兼容参数",
    params: "逐项参数",
    noParams: "没有读取到可展示的生成参数。图片可能被平台压缩或导出时关闭了元数据。",
    raw: "完整原始数据",
    copyRaw: "复制原始数据",
    copied: "原始数据已复制",
    localOnly: "零积分 · 不调用 AI · 不发送网络请求",
    replace: "更换图片",
    viewOnly: "部分 Stable Diffusion / ComfyUI 专用参数只能查看，无法直接套用到 NovelAI。",
    readFailed: "无法读取该图片，请确认文件未损坏并重新选择原图。",
  },
  "zh-TW": {
    eyebrow: "IMAGE METADATA",
    title: "恢復圖片原始資料",
    subtitle: "讀取 NovelAI、Stable Diffusion WebUI / Forge 與 ComfyUI 圖片內嵌參數。",
    back: "返回工具首頁",
    dropTitle: "匯入原始圖片",
    dropHint: "拖入或選擇 PNG、JPG、JPEG、WebP；全程只在本機讀取，不會上傳。",
    choose: "選擇圖片",
    imageAlt: "待解析圖片",
    detected: "辨識來源",
    sourceNovelAi: "NovelAI",
    sourceSd: "Stable Diffusion WebUI / Forge",
    sourceComfy: "ComfyUI",
    sourceUnknown: "未知或無可辨識參數",
    compatible: "可一鍵使用的參數",
    compatibleHint: "只套用 NovelAI 支援的相容項目；SD 模型、VAE、LoRA 等原值保留於下方供查看。",
    apply: "一鍵套用到生成",
    applied: "已套用相容參數並切換到生成面板",
    noCompatible: "沒有可直接套用到 NovelAI 的相容參數",
    params: "逐項參數",
    noParams: "沒有讀取到可顯示的生成參數。圖片可能被平台壓縮或匯出時關閉了中繼資料。",
    raw: "完整原始資料",
    copyRaw: "複製原始資料",
    copied: "原始資料已複製",
    localOnly: "零積分 · 不呼叫 AI · 不傳送網路請求",
    replace: "更換圖片",
    viewOnly: "部分 Stable Diffusion / ComfyUI 專用參數只能查看，無法直接套用到 NovelAI。",
    readFailed: "無法讀取該圖片，請確認檔案未損壞並重新選擇原圖。",
  },
  "en-US": {
    eyebrow: "IMAGE METADATA",
    title: "Restore Image Metadata",
    subtitle: "Read embedded NovelAI, Stable Diffusion WebUI / Forge, and ComfyUI generation data.",
    back: "Back to tools",
    dropTitle: "Import the original image",
    dropHint: "Drop or choose a PNG, JPG, JPEG, or WebP. Processing stays on this device.",
    choose: "Choose image",
    imageAlt: "Image being inspected",
    detected: "Detected source",
    sourceNovelAi: "NovelAI",
    sourceSd: "Stable Diffusion WebUI / Forge",
    sourceComfy: "ComfyUI",
    sourceUnknown: "Unknown or no recognized parameters",
    compatible: "Parameters ready to reuse",
    compatibleHint: "Only NovelAI-compatible values are applied. SD model, VAE, and LoRA values remain visible below.",
    apply: "Use in Generate",
    applied: "Compatible parameters applied; opened Generate",
    noCompatible: "No compatible parameters can be applied to NovelAI",
    params: "Parameter details",
    noParams: "No generation parameters were found. The image may have been compressed or exported without metadata.",
    raw: "Complete raw metadata",
    copyRaw: "Copy raw metadata",
    copied: "Raw metadata copied",
    localOnly: "0 Anlas · no AI call · no network request",
    replace: "Replace image",
    viewOnly: "Some Stable Diffusion / ComfyUI-only values are view-only and cannot be applied directly to NovelAI.",
    readFailed: "Could not read this image. Check that the file is intact and choose the original again.",
  },
  "ja-JP": {
    eyebrow: "IMAGE METADATA",
    title: "画像の元データを復元",
    subtitle: "NovelAI、Stable Diffusion WebUI / Forge、ComfyUI の埋め込み生成情報を読み取ります。",
    back: "ツールへ戻る",
    dropTitle: "元画像を読み込む",
    dropHint: "PNG、JPG、JPEG、WebP をドロップまたは選択。端末内だけで処理します。",
    choose: "画像を選択",
    imageAlt: "解析する画像",
    detected: "検出元",
    sourceNovelAi: "NovelAI",
    sourceSd: "Stable Diffusion WebUI / Forge",
    sourceComfy: "ComfyUI",
    sourceUnknown: "不明または認識可能な設定なし",
    compatible: "再利用できる設定",
    compatibleHint: "NovelAI と互換性のある項目だけを適用します。SD のモデル、VAE、LoRA は下で確認できます。",
    apply: "生成画面で使用",
    applied: "互換設定を適用し、生成画面を開きました",
    noCompatible: "NovelAI に直接適用できる互換設定がありません",
    params: "設定一覧",
    noParams: "生成設定を読み取れません。圧縮されたか、メタデータなしで保存された可能性があります。",
    raw: "完全な元データ",
    copyRaw: "元データをコピー",
    copied: "元データをコピーしました",
    localOnly: "Anlas 0 · AI 不使用 · ネットワーク送信なし",
    replace: "画像を変更",
    viewOnly: "一部の Stable Diffusion / ComfyUI 専用設定は閲覧のみで、NovelAI へ直接適用できません。",
    readFailed: "画像を読み取れません。ファイルが壊れていないか確認し、元画像を選び直してください。",
  },
  "ko-KR": {
    eyebrow: "IMAGE METADATA",
    title: "이미지 원본 데이터 복원",
    subtitle: "NovelAI, Stable Diffusion WebUI / Forge, ComfyUI 이미지의 내장 생성 정보를 읽습니다.",
    back: "도구로 돌아가기",
    dropTitle: "원본 이미지 가져오기",
    dropHint: "PNG, JPG, JPEG, WebP를 놓거나 선택하세요. 모든 처리는 기기 안에서만 진행됩니다.",
    choose: "이미지 선택",
    imageAlt: "분석할 이미지",
    detected: "감지된 출처",
    sourceNovelAi: "NovelAI",
    sourceSd: "Stable Diffusion WebUI / Forge",
    sourceComfy: "ComfyUI",
    sourceUnknown: "알 수 없거나 인식 가능한 매개변수 없음",
    compatible: "바로 사용할 수 있는 매개변수",
    compatibleHint: "NovelAI와 호환되는 값만 적용합니다. SD 모델, VAE, LoRA 원본 값은 아래에서 확인할 수 있습니다.",
    apply: "생성 화면에서 사용",
    applied: "호환 매개변수를 적용하고 생성 화면을 열었습니다",
    noCompatible: "NovelAI에 바로 적용할 수 있는 호환 매개변수가 없습니다",
    params: "매개변수 상세",
    noParams: "생성 매개변수를 찾지 못했습니다. 이미지가 압축되었거나 메타데이터 없이 저장되었을 수 있습니다.",
    raw: "전체 원본 데이터",
    copyRaw: "원본 데이터 복사",
    copied: "원본 데이터를 복사했습니다",
    localOnly: "Anlas 0 · AI 호출 없음 · 네트워크 전송 없음",
    replace: "이미지 변경",
    viewOnly: "일부 Stable Diffusion / ComfyUI 전용 값은 보기 전용이며 NovelAI에 직접 적용할 수 없습니다.",
    readFailed: "이미지를 읽을 수 없습니다. 파일이 손상되지 않았는지 확인하고 원본을 다시 선택하세요.",
  },
};

const IMPORT_LABELS: Record<keyof ImportedParams, string> = {
  positivePrompt: "Positive prompt",
  negativePrompt: "Negative prompt",
  model: "Model",
  steps: "Steps",
  cfgScale: "CFG scale",
  cfgRescale: "CFG rescale",
  sampler: "Sampler",
  noiseSchedule: "Noise schedule",
  seed: "Seed",
  seedMode: "Seed mode",
  width: "Width",
  height: "Height",
  smea: "SMEA",
  smeaDyn: "SMEA Dyn",
};

function sourceLabel(report: ImageMetadataReport, text: MetadataText) {
  if (report.kind === "novelai") return text.sourceNovelAi;
  if (report.kind === "stable-diffusion") return text.sourceSd;
  if (report.kind === "comfyui") return text.sourceComfy;
  return text.sourceUnknown;
}

export default function MetadataInspector({ onBack }: { onBack: () => void }) {
  const language = normalizeAppLanguage(useAppStore((state) => state.settings?.language));
  const settings = useAppStore((state) => state.settings);
  const applyParams = useAppStore((state) => state.applyParams);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setToast = useAppStore((state) => state.setToast);
  const text = TEXT[language];
  const [report, setReport] = useState<ImageMetadataReport | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const compatibleEntries = useMemo(
    () =>
      report
        ? (Object.entries(report.imported) as [keyof ImportedParams, ImportedParams[keyof ImportedParams]][])
            .filter(([, value]) => value !== undefined)
        : [],
    [report],
  );

  const readFile = useCallback(async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const next = inspectImageMetadata(parseImageMeta(buffer));
      setReport(next);
      setFileName(file.name);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(file);
      });
    } catch {
      setToast(text.readFailed);
    }
  }, [setToast, text.readFailed]);

  function applyCompatible() {
    if (!report || !compatibleEntries.length) {
      setToast(text.noCompatible);
      return;
    }
    const patch = { ...report.imported };
    if (settings?.lockNegativePrompt) delete patch.negativePrompt;
    applyParams(patch);
    setActiveTab("generate");
    setToast(text.applied);
  }

  async function copyRaw() {
    if (!report?.rawText) return;
    await navigator.clipboard.writeText(report.rawText);
    setToast(text.copied);
  }

  return (
    <main className="metadata-inspector">
      <header className="metadata-header">
        <div>
          <span className="eyebrow">{text.eyebrow}</span>
          <h2>{text.title}</h2>
          <p>{text.subtitle}</p>
        </div>
        <Button onClick={onBack} variant="secondary">{text.back}</Button>
      </header>

      <section
        className={clsx("metadata-drop", dragging && "dragging", report && "has-image")}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void readFile(file);
        }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={text.imageAlt} />
        ) : (
          <div className="metadata-drop-icon"><Icon name="eye" /></div>
        )}
        <div className="metadata-drop-copy">
          <strong>{fileName || text.dropTitle}</strong>
          <span>{text.dropHint}</span>
          <small>{text.localOnly}</small>
        </div>
        <Button onClick={() => inputRef.current?.click()} variant={report ? "secondary" : "primary"}>
          <IconText icon={<Icon name="folderOpen" />}>{report ? text.replace : text.choose}</IconText>
        </Button>
        <input
          ref={inputRef}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
            event.target.value = "";
          }}
        />
      </section>

      {report && (
        <>
          <section className="metadata-summary">
            <div>
              <span>{text.detected}</span>
              <strong>{sourceLabel(report, text)}</strong>
              <small>{report.software}</small>
            </div>
            <div>
              <span>{text.compatible}</span>
              <strong>{compatibleEntries.length}</strong>
              <small>{text.compatibleHint}</small>
            </div>
            <Button
              variant="primary"
              disabled={!compatibleEntries.length}
              onClick={applyCompatible}
            >
              {text.apply}
            </Button>
          </section>

          {compatibleEntries.length > 0 && (
            <section className="metadata-section">
              <h3>{text.compatible}</h3>
              <div className="metadata-compatible-grid">
                {compatibleEntries.map(([key, value]) => (
                  <div key={key}>
                    <span>{IMPORT_LABELS[key]}</span>
                    <strong>{String(value)}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="metadata-section">
            <h3>{text.params}</h3>
            {report.entries.length ? (
              <div className="metadata-param-list">
                {report.entries.map((entry, index) => (
                  <article key={entry.group + "-" + entry.key + "-" + index}>
                    <div>
                      <span>{entry.group}</span>
                      <strong>{entry.key}</strong>
                    </div>
                    <pre>{entry.value}</pre>
                  </article>
                ))}
              </div>
            ) : (
              <p className="metadata-empty">{text.noParams}</p>
            )}
          </section>

          {(report.kind === "stable-diffusion" || report.kind === "comfyui") && (
            <section className="metadata-warnings" aria-live="polite">
              <Icon name="warning" />
              <div><p>{text.viewOnly}</p></div>
            </section>
          )}

          <details className="metadata-raw">
            <summary>{text.raw}</summary>
            <div className="metadata-raw-actions">
              <Button onClick={() => void copyRaw()} variant="secondary">{text.copyRaw}</Button>
            </div>
            <pre>{report.rawText || text.noParams}</pre>
          </details>
        </>
      )}
    </main>
  );
}
