import { useEffect, useMemo, useState } from "react";
import { Button, IconText, Toggle } from "../../components/ui";
import { Icon } from "../../components/icons";
import { normalizeAppLanguage } from "../../i18n";
import { flushArtistFavoritePersistence, hydrateArtistFavoriteLibrary } from "../../artist-favorite-library";
import { useAppStore } from "../../store";
import type {
  AppLanguage,
  AppSettings,
  DataBackupCategory,
  DataBackupInspectResult,
  DataBackupStatus,
} from "../../types";
import {
  collectPortableWorkspaceData,
  mergePortableWorkspaceData,
} from "./data-backup-workspace";

const CATEGORIES: DataBackupCategory[] = [
  "configuration",
  "apiCredentials",
  "artistLibrary",
  "textHistory",
  "referencePresets",
  "imageHistory",
  "promptPresets",
  "workspaceData",
];

const TEXT = {
  "zh-CN": {
    portabilityTitle: "跨端数据导入与导出",
    portabilityDesc: "生成一个桌面端、Android 与 iOS 共用的 .naisbackup 归档。默认选择全部数据，可逐项排除。",
    sensitive: "API Token 与第三方密钥会按你的选择直接写入备份，请只把文件交给可信设备。",
    selectAll: "全选",
    clear: "清空",
    export: "导出所选数据",
    exporting: "正在整理备份…",
    chooseImport: "选择备份文件",
    importing: "正在安全合并…",
    importSelected: "导入所选数据",
    archive: "待导入归档",
    firstConfirmTitle: "确认合并所选数据",
    firstConfirm: "相同图片会按内容跳过；同名不同图片自动添加 (1)；记录与时间分组只合并，不覆盖。导入前还会自动生成完整安全备份。",
    configConfirmTitle: "再次确认覆盖配置",
    configConfirm: "配置/API 类会覆盖现有对应配置（设备路径除外）。图片、画师收藏、提示词预设、参考预设和历史仍只做非破坏合并。",
    cancel: "取消",
    continue: "继续",
    overwrite: "确认覆盖并导入",
    noCategory: "请至少选择一类数据。",
    autoTitle: "自动备份与恢复",
    autoDesc: "自动备份默认开启并包含图片。只清理超出保留数量的旧自动备份，不会删除手动备份或原始数据。",
    autoEnabled: "启用自动备份",
    autoEnabledDesc: "应用启动后在后台检查是否到期；导入前无条件额外创建安全备份。",
    includeImages: "自动备份包含图片与参考图",
    includeImagesDesc: "关闭后自动备份更小；手动导出仍按上方勾选项执行。",
    interval: "备份间隔（小时）",
    retention: "保留自动备份数量",
    directory: "备份目录",
    chooseDirectory: "选择目录",
    openDirectory: "打开目录",
    backupNow: "立即完整备份",
    refresh: "刷新状态",
    latest: "最近备份",
    none: "尚无自动备份",
    count: "{count} 个自动备份 · {size}",
    config: "应用配置",
    api: "API 与敏感数据",
    artists: "画师串与独立收藏夹",
    textHistory: "反推与转换历史",
    references: "参考预设与参考图",
    images: "本机图片与生成记录",
    prompts: "提示词、风格与预设图",
    workspace: "工具项目与其它本机数据",
  },
  "zh-TW": {
    portabilityTitle: "跨端資料匯入與匯出", portabilityDesc: "建立桌面、Android 與 iOS 共用的 .naisbackup；預設全選，可逐項排除。", sensitive: "API Token 與第三方金鑰會依選擇直接寫入備份，請只交給可信裝置。", selectAll: "全選", clear: "清空", export: "匯出所選資料", exporting: "正在整理備份…", chooseImport: "選擇備份檔", importing: "正在安全合併…", importSelected: "匯入所選資料", archive: "待匯入封存", firstConfirmTitle: "確認合併所選資料", firstConfirm: "相同圖片依內容略過；同名不同圖自動加 (1)；記錄與時間群組只合併。匯入前會先建立完整安全備份。", configConfirmTitle: "再次確認覆蓋設定", configConfirm: "設定/API 類會覆蓋現有對應設定（裝置路徑除外）；其它資料仍只合併。", cancel: "取消", continue: "繼續", overwrite: "確認覆蓋並匯入", noCategory: "請至少選擇一類資料。", autoTitle: "自動備份與還原", autoDesc: "預設開啟且包含圖片；只移除超出保留數量的舊自動備份。", autoEnabled: "啟用自動備份", autoEnabledDesc: "啟動後背景檢查；匯入前一定另建安全備份。", includeImages: "自動備份包含圖片與參考圖", includeImagesDesc: "關閉可縮小檔案；手動匯出不受影響。", interval: "備份間隔（小時）", retention: "保留自動備份數量", directory: "備份目錄", chooseDirectory: "選擇目錄", openDirectory: "開啟目錄", backupNow: "立即完整備份", refresh: "更新狀態", latest: "最近備份", none: "尚無自動備份", count: "{count} 個自動備份 · {size}", config: "應用設定", api: "API 與敏感資料", artists: "畫家串與獨立收藏", textHistory: "反推與轉換歷史", references: "參考預設與參考圖", images: "本機圖片與生成記錄", prompts: "提示詞、風格與預設圖", workspace: "工具專案與其它本機資料",
  },
  "en-US": {
    portabilityTitle: "Cross-device data import and export", portabilityDesc: "Create one .naisbackup archive shared by desktop, Android, and iOS. Everything is selected by default.", sensitive: "API tokens and third-party keys are written directly when selected. Only share the archive with trusted devices.", selectAll: "Select all", clear: "Clear", export: "Export selected data", exporting: "Preparing archive…", chooseImport: "Choose backup file", importing: "Merging safely…", importSelected: "Import selected data", archive: "Archive to import", firstConfirmTitle: "Confirm safe merge", firstConfirm: "Byte-identical images are skipped, same-name different images receive (1), and histories/date groups are merged only. A complete rescue backup is created first.", configConfirmTitle: "Confirm configuration overwrite again", configConfirm: "Configuration/API categories replace matching settings (device paths are preserved). Images, favorites, presets, and history are still merge-only.", cancel: "Cancel", continue: "Continue", overwrite: "Overwrite settings and import", noCategory: "Select at least one category.", autoTitle: "Automatic backup and restore", autoDesc: "Automatic backups are on and include images by default. Retention only removes excess automatic archives.", autoEnabled: "Enable automatic backups", autoEnabledDesc: "Checks in the background after launch; imports always create an extra rescue backup.", includeImages: "Include images and references", includeImagesDesc: "Disable for smaller automatic archives. Manual exports follow the choices above.", interval: "Backup interval (hours)", retention: "Automatic backups to keep", directory: "Backup directory", chooseDirectory: "Choose directory", openDirectory: "Open directory", backupNow: "Create full backup now", refresh: "Refresh status", latest: "Latest backup", none: "No automatic backup yet", count: "{count} automatic backups · {size}", config: "Application configuration", api: "APIs and sensitive data", artists: "Artist strings and separate favorites", textHistory: "Reverse and conversion history", references: "Reference presets and images", images: "Local images and generation history", prompts: "Prompt/style presets and previews", workspace: "Tool projects and other local data",
  },
  "ja-JP": {
    portabilityTitle: "端末間データの入出力", portabilityDesc: "デスクトップ・Android・iOS 共通の .naisbackup を作成します。初期状態は全選択です。", sensitive: "選択した API Token と外部キーはバックアップへ直接保存されます。信頼できる端末だけで共有してください。", selectAll: "全選択", clear: "解除", export: "選択データを書き出す", exporting: "バックアップを作成中…", chooseImport: "バックアップを選択", importing: "安全にマージ中…", importSelected: "選択データを読み込む", archive: "読み込み対象", firstConfirmTitle: "安全マージを確認", firstConfirm: "同一画像は内容でスキップし、同名別画像は (1) を追加、履歴と日付グループはマージのみです。先に完全バックアップを作成します。", configConfirmTitle: "設定上書きを再確認", configConfirm: "設定/API は対応項目を上書きします（端末固有パスを除く）。その他はマージのみです。", cancel: "キャンセル", continue: "続行", overwrite: "上書きを確認して読み込む", noCategory: "1項目以上選択してください。", autoTitle: "自動バックアップと復元", autoDesc: "初期状態で有効、画像も含みます。保持数を超えた古い自動バックアップだけを削除します。", autoEnabled: "自動バックアップ", autoEnabledDesc: "起動後に期限を確認し、読み込み前には必ず追加の安全バックアップを作成します。", includeImages: "画像と参照画像を含める", includeImagesDesc: "無効にすると自動バックアップが小さくなります。", interval: "間隔（時間）", retention: "保持数", directory: "保存先", chooseDirectory: "保存先を選択", openDirectory: "フォルダーを開く", backupNow: "完全バックアップを今すぐ作成", refresh: "状態更新", latest: "最新", none: "自動バックアップなし", count: "{count} 件 · {size}", config: "アプリ設定", api: "API と機密データ", artists: "画家列と独立お気に入り", textHistory: "逆推定・変換履歴", references: "参照プリセットと画像", images: "ローカル画像と生成履歴", prompts: "プロンプト・スタイル・プレビュー", workspace: "ツールプロジェクトとその他データ",
  },
  "ko-KR": {
    portabilityTitle: "기기 간 데이터 가져오기/내보내기", portabilityDesc: "데스크톱·Android·iOS 공용 .naisbackup을 만듭니다. 기본값은 전체 선택입니다.", sensitive: "선택한 API Token과 외부 키는 백업에 직접 저장됩니다. 신뢰하는 기기에서만 공유하세요.", selectAll: "전체 선택", clear: "해제", export: "선택 데이터 내보내기", exporting: "백업 준비 중…", chooseImport: "백업 파일 선택", importing: "안전하게 병합 중…", importSelected: "선택 데이터 가져오기", archive: "가져올 백업", firstConfirmTitle: "안전 병합 확인", firstConfirm: "내용이 같은 이미지는 건너뛰고, 이름만 같으면 (1)을 붙이며, 기록/날짜 그룹은 병합만 합니다. 먼저 전체 안전 백업을 만듭니다.", configConfirmTitle: "설정 덮어쓰기 재확인", configConfirm: "설정/API 항목은 대응 설정을 덮어씁니다(기기 경로 제외). 나머지는 병합만 합니다.", cancel: "취소", continue: "계속", overwrite: "덮어쓰기 확인 및 가져오기", noCategory: "항목을 하나 이상 선택하세요.", autoTitle: "자동 백업 및 복원", autoDesc: "기본으로 켜져 있고 이미지도 포함합니다. 보존 수를 넘은 자동 백업만 삭제합니다.", autoEnabled: "자동 백업 사용", autoEnabledDesc: "시작 후 백그라운드에서 확인하며 가져오기 전에는 항상 안전 백업을 만듭니다.", includeImages: "이미지와 참고 이미지 포함", includeImagesDesc: "끄면 자동 백업 크기가 줄어듭니다.", interval: "간격(시간)", retention: "보관 개수", directory: "백업 폴더", chooseDirectory: "폴더 선택", openDirectory: "폴더 열기", backupNow: "지금 전체 백업", refresh: "상태 새로고침", latest: "최근 백업", none: "자동 백업 없음", count: "{count}개 · {size}", config: "앱 설정", api: "API 및 민감 데이터", artists: "작가 문자열과 독립 즐겨찾기", textHistory: "역추론 및 변환 기록", references: "참고 프리셋과 이미지", images: "로컬 이미지와 생성 기록", prompts: "프롬프트·스타일·미리보기", workspace: "도구 프로젝트 및 기타 데이터",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

const LABEL_KEY: Record<DataBackupCategory, keyof typeof TEXT["zh-CN"]> = {
  configuration: "config",
  apiCredentials: "api",
  artistLibrary: "artists",
  textHistory: "textHistory",
  referencePresets: "references",
  imageHistory: "images",
  promptPresets: "prompts",
  workspaceData: "workspace",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function useText(language: AppSettings["language"] | undefined) {
  return TEXT[normalizeAppLanguage(language)];
}

function CategoryChecklist({
  available = CATEGORIES,
  selected,
  setSelected,
  language,
  summaries,
}: {
  available?: DataBackupCategory[];
  selected: Set<DataBackupCategory>;
  setSelected: (next: Set<DataBackupCategory>) => void;
  language: AppSettings["language"] | undefined;
  summaries?: DataBackupInspectResult["categories"];
}) {
  const text = useText(language);
  const summaryMap = new Map(summaries?.map((item) => [item.category, item]));
  return (
    <div className="data-category-checklist">
      {available.map((category) => {
        const info = summaryMap.get(category);
        return (
          <label key={category} className="data-category-row">
            <input
              type="checkbox"
              checked={selected.has(category)}
              onChange={(event) => {
                const next = new Set(selected);
                if (event.target.checked) next.add(category);
                else next.delete(category);
                setSelected(next);
              }}
            />
            <span><strong>{text[LABEL_KEY[category]]}</strong>{info ? <small>{info.items} · {formatBytes(info.bytes)}</small> : null}</span>
          </label>
        );
      })}
    </div>
  );
}

export function DataPortabilitySettings({
  language,
}: {
  language: AppSettings["language"] | undefined;
}) {
  const text = useText(language);
  const [exportSelection, setExportSelection] = useState<Set<DataBackupCategory>>(() => new Set(CATEGORIES));
  const [importSelection, setImportSelection] = useState<Set<DataBackupCategory>>(() => new Set());
  const [archive, setArchive] = useState<DataBackupInspectResult | null>(null);
  const [busy, setBusy] = useState<"export" | "import" | "">("");
  const [message, setMessage] = useState("");
  const [confirmStage, setConfirmStage] = useState<0 | 1 | 2>(0);
  const availableImport = useMemo(
    () => archive?.categories.map((item) => item.category) ?? [],
    [archive],
  );

  const exportSelected = async () => {
    if (!exportSelection.size) return setMessage(text.noCategory);
    setBusy("export");
    setMessage("");
    try {
      await flushArtistFavoritePersistence();
      const result = await window.naiDesktop.exportDataBackup({
        categories: [...exportSelection],
        workspaceData: collectPortableWorkspaceData(),
      });
      setMessage(result.message);
    } finally {
      setBusy("");
    }
  };

  const chooseImport = async () => {
    setMessage("");
    const result = await window.naiDesktop.inspectDataBackup();
    if (!result.ok) {
      if (!result.cancelled) setMessage(result.message ?? "");
      return;
    }
    setArchive(result);
    setImportSelection(new Set(result.categories.map((item) => item.category)));
    setConfirmStage(0);
  };

  const runImport = async (confirmConfigurationOverwrite: boolean) => {
    if (!archive?.path || !importSelection.size) return setMessage(text.noCategory);
    setBusy("import");
    setConfirmStage(0);
    try {
      await flushArtistFavoritePersistence();
      const result = await window.naiDesktop.importDataBackup({
        path: archive.path,
        categories: [...importSelection],
        confirmConfigurationOverwrite,
        currentWorkspaceData: collectPortableWorkspaceData(),
      });
      if (result.workspaceData) {
        const merged = mergePortableWorkspaceData(result.workspaceData);
        result.imported += merged.imported;
        result.skipped += merged.skipped;
      }
      setMessage(result.message);
      if (result.ok) {
        // Rehydrate the live renderer instead of requiring a restart before
        // imported configuration, parameters, histories, and groups appear.
        await useAppStore.getState().load();
        await hydrateArtistFavoriteLibrary();
        window.dispatchEvent(new Event("langbai:reference-presets-changed"));
      }
    } finally {
      setBusy("");
    }
  };

  const firstConfirmed = () => {
    const overwrites = importSelection.has("configuration") || importSelection.has("apiCredentials");
    if (overwrites) setConfirmStage(2);
    else void runImport(false);
  };

  return (
    <div className="data-portability-panel settings-section-card">
      <div className="settings-section-heading">
        <span className="settings-section-icon"><Icon name="database" /></span>
        <div><strong>{text.portabilityTitle}</strong><span>{text.portabilityDesc}</span></div>
      </div>
      <div className="data-sensitive-note"><Icon name="warning" /><span>{text.sensitive}</span></div>
      <div className="data-selection-toolbar">
        <Button variant="ghost" onClick={() => setExportSelection(new Set(CATEGORIES))}>{text.selectAll}</Button>
        <Button variant="ghost" onClick={() => setExportSelection(new Set())}>{text.clear}</Button>
      </div>
      <CategoryChecklist selected={exportSelection} setSelected={setExportSelection} language={language} />
      <div className="row-actions data-primary-actions">
        <Button variant="primary" disabled={Boolean(busy) || !exportSelection.size} onClick={() => void exportSelected()}>
          <IconText icon={busy === "export" ? <Icon name="loader" /> : <Icon name="archive" />}>{busy === "export" ? text.exporting : text.export}</IconText>
        </Button>
        <Button disabled={Boolean(busy)} onClick={() => void chooseImport()}>
          <IconText icon={<Icon name="upload" />}>{text.chooseImport}</IconText>
        </Button>
      </div>
      {archive?.ok && (
        <div className="data-import-preview">
          <div className="data-import-file"><Icon name="archive" /><span><strong>{text.archive}</strong><small>{archive.createdAt ? new Date(archive.createdAt).toLocaleString() : ""} · {archive.sourcePlatform} · v{archive.appVersion}</small></span></div>
          <CategoryChecklist available={availableImport} selected={importSelection} setSelected={setImportSelection} language={language} summaries={archive.categories} />
          <Button variant="primary" disabled={Boolean(busy) || !importSelection.size} onClick={() => setConfirmStage(1)}>
            <IconText icon={busy === "import" ? <Icon name="loader" /> : <Icon name="restore" />}>{busy === "import" ? text.importing : text.importSelected}</IconText>
          </Button>
        </div>
      )}
      {confirmStage > 0 && (
        <div className="data-confirm-backdrop" role="dialog" aria-modal="true">
          <div className="data-confirm-card">
            <span className="data-confirm-icon"><Icon name={confirmStage === 2 ? "warning" : "restore"} /></span>
            <div><strong>{confirmStage === 2 ? text.configConfirmTitle : text.firstConfirmTitle}</strong><p>{confirmStage === 2 ? text.configConfirm : text.firstConfirm}</p></div>
            <div className="row-actions">
              <Button onClick={() => setConfirmStage(0)}>{text.cancel}</Button>
              <Button variant={confirmStage === 2 ? "danger" : "primary"} onClick={() => confirmStage === 2 ? void runImport(true) : firstConfirmed()}>{confirmStage === 2 ? text.overwrite : text.continue}</Button>
            </div>
          </div>
        </div>
      )}
      {message && <div className="status-box">{message}</div>}
    </div>
  );
}

export function BackupRestoreSettings({
  settings,
  update,
}: {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
}) {
  const text = useText(settings.language);
  const [status, setStatus] = useState<DataBackupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = () => window.naiDesktop.getDataBackupStatus().then(setStatus).catch(() => undefined);
  useEffect(() => { void refresh(); }, [settings.backupDir, settings.autoBackupEnabled, settings.autoBackupIntervalHours, settings.autoBackupRetentionCount]);

  const chooseDirectory = async () => {
    const selected = await window.naiDesktop.selectBackupDirectory();
    if (!selected) return;
    await update("backupDir", selected);
    await refresh();
  };

  const backupNow = async () => {
    setBusy(true);
    try {
      await flushArtistFavoritePersistence();
      const result = await window.naiDesktop.exportDataBackup({
        categories: CATEGORIES,
        workspaceData: collectPortableWorkspaceData(),
        destination: "internal",
      });
      setMessage(result.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-form backup-restore-settings">
      <div className="settings-section-card">
        <div className="settings-section-heading">
          <span className="settings-section-icon"><Icon name="cloudSync" /></span>
          <div><strong>{text.autoTitle}</strong><span>{text.autoDesc}</span></div>
        </div>
        <div className="toggle-list">
          <Toggle checked={settings.autoBackupEnabled !== false} onChange={(value) => void update("autoBackupEnabled", value)} label={text.autoEnabled} description={text.autoEnabledDesc} />
          <Toggle checked={settings.autoBackupIncludeImages !== false} onChange={(value) => void update("autoBackupIncludeImages", value)} label={text.includeImages} description={text.includeImagesDesc} />
        </div>
        <div className="backup-number-grid">
          <label className="field"><span>{text.interval}</span><input type="number" min={1} max={720} value={settings.autoBackupIntervalHours ?? 24} onChange={(event) => void update("autoBackupIntervalHours", Math.max(1, Math.min(720, Number(event.target.value) || 24)))} /></label>
          <label className="field"><span>{text.retention}</span><input type="number" min={1} max={100} value={settings.autoBackupRetentionCount ?? 7} onChange={(event) => void update("autoBackupRetentionCount", Math.max(1, Math.min(100, Number(event.target.value) || 7)))} /></label>
        </div>
        <label className="field"><span>{text.directory}</span><input readOnly value={status?.directory ?? settings.backupDir ?? ""} /></label>
        <div className="row-actions">
          <Button onClick={() => void chooseDirectory()}><IconText icon={<Icon name="folderOpen" />}>{text.chooseDirectory}</IconText></Button>
          <Button onClick={() => void window.naiDesktop.openBackupDirectory()}><IconText icon={<Icon name="externalLink" />}>{text.openDirectory}</IconText></Button>
          <Button variant="primary" disabled={busy} onClick={() => void backupNow()}><IconText icon={busy ? <Icon name="loader" /> : <Icon name="archive" />}>{text.backupNow}</IconText></Button>
        </div>
      </div>
      <div className="backup-status-card">
        <Icon name="history" />
        <div><strong>{text.latest}</strong><span>{status?.latestCreatedAt ? new Date(status.latestCreatedAt).toLocaleString() : text.none}</span><small>{text.count.replace("{count}", String(status?.backupCount ?? 0)).replace("{size}", formatBytes(status?.totalBytes ?? 0))}</small></div>
        <Button variant="ghost" onClick={() => void refresh()}><IconText icon={<Icon name="refresh" />}>{text.refresh}</IconText></Button>
      </div>
      {message && <div className="status-box">{message}</div>}
    </div>
  );
}
