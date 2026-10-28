import {DATA_BACKUP_CATEGORIES} from "../../data-backup-contract";
import {errorText} from "../../error-message";
import { useEffect, useMemo, useState } from "react";
import { Button, CommittedNumberInput, IconText, Toggle } from "../../components/ui";
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
  DataBackupRecovery,
} from "../../types";
import {
  collectPortableWorkspaceData,
  mergePortableWorkspaceData,
} from "./data-backup-workspace";

const CATEGORIES: DataBackupCategory[] = [...DATA_BACKUP_CATEGORIES];

const TEXT = {
  "zh-CN": {
    available: "已有恢复副本；可打开核对或恢复使用",
    exportDone: "备份已保存：",
    importDone: "导入完成：新增 {i} 项，跳过 {s} 项，重命名 {r} 项。",
    restoreGuide: "选择备份文件即可恢复；先核对分类，再确认导入。",
    rescue: "导入前完整备份：",
    preserved: "原数据保留位置：",
    activateHelp: "恢复前将保留当前工作区，再切换到所选数据；不会自动启动任务。模型和运行环境沿用本机配置，请确认兼容后手动启动。",
    activateRecovery: "恢复使用此数据…",
    openRecovery: "打开恢复目录",
    staged: "已保存在恢复目录，尚未替换当前工作区",
    restored: "已恢复；任务未启动",
    recoveryTitle: "恢复结果与入口",
    styleLab: "画风实验室：当前自动迭代结果与参考图",
    coverage: "备份前停止画风任务。模型、运行环境与符号链接不迁移。自动轻量备份不含画风结果，请使用完整备份。",
    portabilityTitle: "数据导入与导出",
    portabilityDesc: "生成 Windows 与 macOS 通用的 .naisbackup 归档，也能导入旧版桌面端或移动端导出的归档。默认选择全部数据，可逐项排除。",
    sensitive: "API Key 与第三方密钥会按你的选择直接写入备份，请只把文件交给可信设备。",
    selectAll: "全选",
    clear: "清空",
    export: "导出所选数据",
    exporting: "正在整理备份…",
    chooseImport: "选择备份文件",
    importing: "正在安全合并…",
    importSelected: "导入所选数据",
    archive: "待导入归档",
    firstConfirmTitle: "确认合并所选数据",
    firstConfirm: "所选数据均独立处理。常规记录只合并；画风结果先保存完整恢复副本，当前工作区存在时需在导入结果中手动切换。导入前会生成完整备份。",
    configConfirmTitle: "再次确认覆盖配置",
    configConfirm: "配置/API 类会覆盖现有对应配置（设备路径除外）。图片、画师收藏、提示词预设、参考预设和历史仍只做非破坏合并。",
    cancel: "取消",
    continue: "继续",
    overwrite: "确认覆盖并导入",
    noCategory: "请至少选择一类数据。",
    autoTitle: "自动备份与恢复",
    autoDesc: "自动备份默认开启并采用轻量模式，不会在启动后压缩整套图库。需要时可单独开启图片备份。",
    autoEnabled: "启用自动备份",
    autoEnabledDesc: "应用启动后在后台检查是否到期；导入前无条件额外创建安全备份。",
    includeImages: "自动备份包含图片与参考图",
    includeImagesDesc: "开启后会复制整套图库，耗时与空间占用会明显增加；手动导出不受影响。",
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
    workspace: "工具草稿、画风参数与其他本机状态",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

const LABEL_KEY: Record<DataBackupCategory, keyof typeof TEXT["zh-CN"]> = {
  styleLab: "styleLab",
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
  const [recoveries,setRecoveries] = useState<DataBackupRecovery[]>([]);
  const [rescuePath,setRescuePath] = useState("");
  const [activate,setActivate] = useState<DataBackupRecovery|null>(null);
  useEffect(()=>{
    let cancelled=false;
    window.naiDesktop.listPortableRecoveries().then(items=>{if(!cancelled)setRecoveries(items);})
      .catch(error=>{if(!cancelled)setMessage(errorText(error));});
    return()=>{cancelled=true;};
  },[]);
  const performActivation = async () => {
    if(!activate)return;
    setBusy("import");
    try {
      const result=await window.naiDesktop.activatePortableRecovery(activate.kind,activate.id);
      setRecoveries(items=>items.map(item=>item.id===activate.id?{...item,status:"restored"}:item));
      setMessage(text.preserved+" "+result.preserved);
      window.dispatchEvent(new Event("langbai:workspace-imported"));
      setActivate(null);
    } catch(error) {setMessage(errorText(error));} finally {setBusy("");}
  };
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
      setMessage(result.ok ? text.exportDone+" "+(result.path ?? "") : result.message);
    } catch(error) { setMessage(errorText(error)); } finally {
      setBusy("");
    }
  };

  const chooseImport = async () => {
    setMessage("");
    let result: DataBackupInspectResult;
    try { result = await window.naiDesktop.inspectDataBackup(); } catch(error) { setMessage(errorText(error)); return; }
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
      setMessage(result.ok ? text.importDone.replace("{i}",String(result.imported)).replace("{s}",String(result.skipped)).replace("{r}",String(result.renamed)) : result.message);
      setRecoveries(result.recoveries ?? []);
      setRescuePath(result.rescueBackupPath ?? "");
      if (result.ok) {
        // Rehydrate the live renderer instead of requiring a restart before
        // imported configuration, parameters, histories, and groups appear.
        await useAppStore.getState().load();
        await hydrateArtistFavoriteLibrary();
        window.dispatchEvent(new Event("langbai:reference-presets-changed"));
        window.dispatchEvent(new Event("langbai:workspace-imported"));
      }
    } catch(error) { setMessage(errorText(error)); } finally {
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
        <div><strong>{text.portabilityTitle}</strong><span>{text.portabilityDesc}</span><span>{text.coverage}</span></div>
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
          <div className="data-import-file"><Icon name="archive" /><span><strong>{text.archive}</strong><small>{archive.createdAt ? new Date(archive.createdAt).toLocaleString("zh-CN") : ""} · {archive.sourcePlatform} · v{archive.appVersion}</small></span></div>
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
      {rescuePath && <div className="status-box"><strong>{text.rescue}</strong><p style={{overflowWrap:"anywhere"}}>{rescuePath}</p><p>{text.restoreGuide}</p></div>}
      {!!recoveries.length && <section className="settings-section-card" aria-label={text.recoveryTitle}>
        <h4>{text.recoveryTitle}</h4>
        {recoveries.map(item=><div className="status-box" key={item.id}>
          <strong>{text.styleLab}</strong>
          <p>{text[item.status]}</p><p style={{overflowWrap:"anywhere"}}>{item.path}</p>
          <div className="row-actions">
            <Button disabled={!!busy} onClick={()=>void window.naiDesktop.openPortableRecovery(item.kind,item.id).catch(e=>setMessage(errorText(e)))}>{text.openRecovery}</Button>
            {item.status!=="restored" && <Button disabled={!!busy} onClick={()=>setActivate(item)}>{text.activateRecovery}</Button>}
          </div>
        </div>)}
      </section>}
      {activate && <div className="data-confirm-backdrop" role="dialog" aria-modal="true" aria-label={text.activateRecovery}>
        <div className="data-confirm-card"><div><strong>{text.activateRecovery}</strong><p>{text.activateHelp}</p></div>
        <div className="row-actions"><Button disabled={!!busy} onClick={()=>setActivate(null)}>{text.cancel}</Button><Button disabled={!!busy} onClick={()=>void performActivation()}>{text.continue}</Button></div></div>
      </div>}
      {message && <div className="status-box" role="status">{message}</div>}
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
    try {
      const selected = await window.naiDesktop.selectBackupDirectory();
      if (!selected) return;
      await update("backupDir", selected); await refresh(); setMessage("");
    } catch (error) { setMessage(errorText(error)); }
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
      setMessage(result.ok ? text.exportDone+" "+(result.path ?? "") : result.message);
      await refresh();
    } catch(error) {setMessage(errorText(error));} finally {
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
          <CommittedNumberInput label={text.interval} value={settings.autoBackupIntervalHours ?? 24} min={1} max={720} normalize={(value) => Math.max(1, Math.min(720, Math.round(value)))} onCommit={(value) => void update("autoBackupIntervalHours", value)} />
          <CommittedNumberInput label={text.retention} value={settings.autoBackupRetentionCount ?? 7} min={1} max={100} normalize={(value) => Math.max(1, Math.min(100, Math.round(value)))} onCommit={(value) => void update("autoBackupRetentionCount", value)} />
        </div>
        <label className="field"><span>{text.directory}</span><input readOnly value={status?.directory ?? settings.backupDir ?? ""} /></label>
        <div className="row-actions">
          <Button onClick={() => void chooseDirectory()}><IconText icon={<Icon name="folderOpen" />}>{text.chooseDirectory}</IconText></Button>
          <Button onClick={() => void window.naiDesktop.openBackupDirectory().catch(error=>setMessage(errorText(error)))}><IconText icon={<Icon name="externalLink" />}>{text.openDirectory}</IconText></Button>
          <Button variant="primary" disabled={busy} onClick={() => void backupNow()}><IconText icon={busy ? <Icon name="loader" /> : <Icon name="archive" />}>{text.backupNow}</IconText></Button>
        </div>
      </div>
      <div className="backup-status-card">
        <Icon name="history" />
        <div><strong>{text.latest}</strong><span>{status?.latestCreatedAt ? new Date(status.latestCreatedAt).toLocaleString("zh-CN") : text.none}</span><small>{text.count.replace("{count}", String(status?.backupCount ?? 0)).replace("{size}", formatBytes(status?.totalBytes ?? 0))}</small></div>
        <Button variant="ghost" onClick={() => void refresh()}><IconText icon={<Icon name="refresh" />}>{text.refresh}</IconText></Button>
      </div>
      {message && <div className="status-box">{message}</div>}
    </div>
  );
}
