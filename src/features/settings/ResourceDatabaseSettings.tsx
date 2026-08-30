import { useEffect, useMemo, useState } from "react";
import { Button, IconText } from "../../components/ui";
import { Icon } from "../../components/icons";
import type {
  AppLanguage,
  ResourceDatabaseId,
  ResourceDatabaseOverview,
  ResourceDatabaseProgressEvent,
} from "../../types";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatSpeed(bytes: number) {
  return bytes > 0 ? `${formatBytes(bytes)}/s` : "—";
}

const PHASE_LABEL: Record<ResourceDatabaseProgressEvent["phase"], string> = {
  downloading: "正在下载",
  paused: "已暂停",
  verifying: "正在校验",
  extracting: "正在解压",
  installing: "正在安全替换",
  complete: "安装完成",
  error: "下载失败",
};

export default function ResourceDatabaseSettings({ language: _language }: { language: AppLanguage }) {
  const [overview, setOverview] = useState<ResourceDatabaseOverview | null>(null);
  const [progress, setProgress] = useState<Partial<Record<ResourceDatabaseId, ResourceDatabaseProgressEvent>>>({});
  const [busy, setBusy] = useState<ResourceDatabaseId | "">("");
  const [confirm, setConfirm] = useState<{ id: ResourceDatabaseId; mode: "install" | "restore" } | null>(null);
  const [message, setMessage] = useState("");
  const [galleryCache, setGalleryCache] = useState({ files: 0, bytes: 0 });

  const refresh = async () => {
    const [resources, gallery] = await Promise.all([
      window.naiDesktop.getResourceDatabaseOverview(),
      window.naiDesktop.aitagCacheStats().catch(() => ({ files: 0, bytes: 0 })),
    ]);
    setOverview(resources);
    setGalleryCache(gallery);
  };

  useEffect(() => {
    void refresh().catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    return window.naiDesktop.onResourceDatabaseProgress((event) => {
      setProgress((current) => ({ ...current, [event.id]: event }));
      if (event.phase === "complete" || event.phase === "error" || event.phase === "paused") {
        setBusy("");
        void refresh();
      }
    });
  }, []);

  const installedBytes = useMemo(
    () => overview?.resources.reduce((total, resource) => total + resource.sizeBytes, 0) ?? 0,
    [overview],
  );

  const runConfirmed = async () => {
    if (!confirm) return;
    const request = confirm;
    setConfirm(null);
    setBusy(request.id);
    setMessage("");
    try {
      const result = request.mode === "install"
        ? await window.naiDesktop.downloadResourceDatabase(request.id, true)
        : await window.naiDesktop.restorePreviousResourceDatabase(request.id, true);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
      await refresh().catch(() => undefined);
    }
  };

  const clearCaches = async () => {
    await Promise.all([
      window.naiDesktop.clearResourceQueryCache(),
      window.naiDesktop.aitagClearCache(),
    ]);
    setMessage("内存查询缓存和在线画廊磁盘缓存已清理；资源数据库未删除。");
    await refresh();
  };

  return (
    <div className="resource-settings-stack">
      <section className="settings-section-card resource-paths-card">
        <div className="settings-section-heading">
          <span className="settings-section-icon"><Icon name="database" /></span>
          <div><strong>模型与资源库</strong><span>资源路径和可替换的本地补全数据库。不会把用户图片当作缓存删除。</span></div>
        </div>
        <div className="resource-path-row"><Icon name="smartToy" /><span><strong>本地 ONNX Tagger 模型</strong><small>未配置（当前版本尚未接入本地 ONNX Tagger）</small></span></div>
        <div className="resource-path-row"><Icon name="database" /><span><strong>数据存储路径</strong><small title={overview?.dataDirectory}>{overview?.dataDirectory || "读取中…"}</small></span><Button variant="ghost" onClick={() => void window.naiDesktop.openResourceDatabaseDirectory()}><Icon name="folderOpen" /></Button></div>
      </section>

      <section className="settings-section-card resource-database-card">
        <div className="settings-section-heading">
          <span className="settings-section-icon"><Icon name="download" /></span>
          <div><strong>数据源与本地数据库</strong><span>数据库只能在你确认后替换；替换前会留下上一版回滚副本。</span></div>
        </div>
        <div className="resource-merge-notice"><Icon name="shield" /><span><strong>图片数据始终合并，不参与数据库覆盖。</strong>相同内容跳过；同名不同内容使用“(1)”递增；参考预设、日期分组和历史只合并。</span></div>
        <div className="resource-list">
          {(overview?.resources ?? []).map((resource) => {
            const event = progress[resource.id];
            const running = busy === resource.id || resource.downloading;
            const canPause = running && (!event || event.phase === "downloading");
            const percent = event?.percent ?? (resource.installed && resource.valid ? 100 : 0);
            return (
              <article className="resource-item" key={resource.id}>
                <div className="resource-item-main">
                  <span className="resource-item-icon"><Icon name={resource.id === "tagCatalog" ? "template" : "collections"} /></span>
                  <div>
                    <strong>{resource.label}</strong>
                    <p>{resource.description}</p>
                    <small>
                      {resource.installed
                        ? resource.valid
                          ? `已安装 · ${resource.version} · ${formatBytes(resource.sizeBytes)}`
                          : `数据库异常：${resource.message || "需要修复"}`
                        : resource.resumableBytes > 0
                          ? `已下载 ${formatBytes(resource.resumableBytes)}，可继续`
                          : `未安装 · 下载 ${formatBytes(resource.downloadBytes)}`}
                    </small>
                    <small>来源：{resource.sourceName} · {resource.license}</small>
                  </div>
                </div>
                <div className="resource-item-actions">
                  <Button variant="ghost" onClick={() => void window.naiDesktop.openExternal(resource.sourceUrl)}>来源</Button>
                  {canPause ? (
                    <Button onClick={() => void window.naiDesktop.pauseResourceDatabaseDownload(resource.id)}>暂停</Button>
                  ) : !running ? (
                    <Button variant="primary" onClick={() => setConfirm({ id: resource.id, mode: "install" })}>
                      {resource.resumableBytes > 0 ? "继续下载" : resource.installed ? "更新 / 修复" : "下载并安装"}
                    </Button>
                  ) : null}
                  {resource.hasPrevious && !running ? <Button onClick={() => setConfirm({ id: resource.id, mode: "restore" })}>恢复上一版</Button> : null}
                </div>
                {(running || event) ? (
                  <div className={`resource-progress ${event?.phase ?? "downloading"}`}>
                    <div><span>{event ? PHASE_LABEL[event.phase] : "正在准备"}</span><strong>{percent.toFixed(1)}%</strong></div>
                    <progress max={100} value={percent} />
                    <small>{event ? `${formatBytes(event.receivedBytes)} / ${formatBytes(event.totalBytes)} · ${formatSpeed(event.speedBytesPerSecond)}` : "准备下载…"}</small>
                  </div>
                ) : null}
              </article>
            );
          })}
          {!overview ? <div className="resource-loading"><Icon name="loader" /> 正在读取资源状态…</div> : null}
        </div>
      </section>

      <section className="settings-section-card cache-maintenance-card">
        <div className="settings-section-heading">
          <span className="settings-section-icon"><Icon name="speed" /></span>
          <div><strong>缓存维护</strong><span>查看三级数据状态；清理只移除可再生成的缓存，不删除数据库或用户图片。</span></div>
        </div>
        <div className="cache-level-list">
          <div className="cache-level l1"><Icon name="smartToy" /><span><strong>L1 内存查询缓存</strong><small>{overview?.cache.memoryEntries ?? 0} 条 · 命中率 {((overview?.cache.memoryHitRate ?? 0) * 100).toFixed(1)}%</small></span></div>
          <div className="cache-level l2"><Icon name="images" /><span><strong>L2 在线画廊磁盘缓存</strong><small>{galleryCache.files} 个文件 · {formatBytes(galleryCache.bytes)}</small></span></div>
          <div className="cache-level l3"><Icon name="database" /><span><strong>L3 SQLite 资源数据库</strong><small>{overview?.resources.filter((item) => item.installed && item.valid).length ?? 0} 个数据库 · {formatBytes(installedBytes)}</small></span></div>
        </div>
        <div className="row-actions"><Button onClick={() => void refresh()}><IconText icon={<Icon name="refresh" />}>重新扫描</IconText></Button><Button onClick={() => void clearCaches()}><IconText icon={<Icon name="clear" />}>清理可再生成缓存</IconText></Button></div>
      </section>

      {message ? <div className="status-box">{message}</div> : null}

      {confirm ? (
        <div className="data-confirm-backdrop" role="dialog" aria-modal="true">
          <div className="data-confirm-card resource-confirm-card">
            <span className="data-confirm-icon"><Icon name="warning" /></span>
            <div>
              <strong>{confirm.mode === "install" ? "确认替换本地资源数据库" : "确认恢复上一版数据库"}</strong>
              <p>此操作只替换所选的本地标签/关联数据库，并保留可回滚副本。不会覆盖、重命名或删除任何生成图片、参考图、参考预设、收藏夹或历史记录。</p>
            </div>
            <div className="row-actions"><Button onClick={() => setConfirm(null)}>取消</Button><Button variant="danger" onClick={() => void runConfirmed()}>{confirm.mode === "install" ? "同意并开始" : "同意恢复"}</Button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
