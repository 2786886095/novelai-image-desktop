import { useEffect, useMemo, useState } from "react";
import { Button, IconText } from "../../components/ui";
import { Icon } from "../../components/icons";
import type {
  AppLanguage,
  ResourceDatabaseId,
  ResourceDatabaseOverview,
  ResourceDatabaseProgressEvent,
} from "../../types";
import { resourceDefinitionText, resourcePhaseText, resourceText } from "./resource-ui-i18n";

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

export default function ResourceDatabaseSettings({ language }: { language: AppLanguage }) {
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
    setMessage(resourceText(language, "cleared"));
    await refresh();
  };

  return (
    <div className="resource-settings-stack">
      <section className="settings-section-card resource-paths-card">
        <div className="settings-section-heading">
          <span className="settings-section-icon"><Icon name="database" /></span>
          <div><strong>{resourceText(language, "title")}</strong><span>{resourceText(language, "subtitle")}</span></div>
        </div>
        <div className="resource-path-row"><Icon name="smartToy" /><span><strong>{resourceText(language, "localModel")}</strong><small>{resourceText(language, "unavailable")}</small></span></div>
        <div className="resource-path-row"><Icon name="database" /><span><strong>{resourceText(language, "dataPath")}</strong><small title={overview?.dataDirectory}>{overview?.dataDirectory || resourceText(language, "loading")}</small></span><Button variant="ghost" onClick={() => void window.naiDesktop.openResourceDatabaseDirectory()}><Icon name="folderOpen" /></Button></div>
      </section>

      <section className="settings-section-card resource-database-card">
        <div className="settings-section-heading">
          <span className="settings-section-icon"><Icon name="download" /></span>
          <div><strong>{resourceText(language, "databases")}</strong><span>{resourceText(language, "databaseHint")}</span></div>
        </div>
        <div className="resource-merge-notice"><Icon name="shield" /><span><strong>{resourceText(language, "mergeTitle")}</strong>{resourceText(language, "mergeHint")}</span></div>
        <div className="resource-list">
          {(overview?.resources ?? []).map((resource) => {
            const event = progress[resource.id];
            const running = busy === resource.id || resource.downloading;
            const canPause = running && (!event || event.phase === "downloading");
            const percent = event?.percent ?? (resource.installed && resource.valid ? 100 : 0);
            const localizedResource = resourceDefinitionText(language, resource.id);
            return (
              <article className="resource-item" key={resource.id}>
                <div className="resource-item-main">
                  <span className="resource-item-icon"><Icon name={resource.id === "tagCatalog" ? "template" : "collections"} /></span>
                  <div>
                    <strong>{localizedResource.label}</strong>
                    <p>{localizedResource.description}</p>
                    <small>
                      {resource.installed
                        ? resource.valid
                          ? resourceText(language, "installed", { version: resource.version, size: formatBytes(resource.sizeBytes) })
                          : resourceText(language, "invalid", { message: resource.message || resourceText(language, "repair") })
                        : resource.resumableBytes > 0
                          ? resourceText(language, "downloaded", { size: formatBytes(resource.resumableBytes) })
                          : resourceText(language, "notInstalled", { size: formatBytes(resource.downloadBytes) })}
                    </small>
                    <small>{resourceText(language, "sourceLine", { source: resource.sourceName, license: resource.license })}</small>
                  </div>
                </div>
                <div className="resource-item-actions">
                  <Button variant="ghost" onClick={() => void window.naiDesktop.openExternal(resource.sourceUrl)}>{resourceText(language, "source")}</Button>
                  {canPause ? (
                    <Button onClick={() => void window.naiDesktop.pauseResourceDatabaseDownload(resource.id)}>{resourceText(language, "pause")}</Button>
                  ) : !running ? (
                    <Button variant="primary" onClick={() => setConfirm({ id: resource.id, mode: "install" })}>
                      {resource.resumableBytes > 0 ? resourceText(language, "resume") : resource.installed ? resourceText(language, "update") : resourceText(language, "install")}
                    </Button>
                  ) : null}
                  {resource.hasPrevious && !running ? <Button onClick={() => setConfirm({ id: resource.id, mode: "restore" })}>{resourceText(language, "restore")}</Button> : null}
                </div>
                {(running || event) ? (
                  <div className={`resource-progress ${event?.phase ?? "downloading"}`}>
                    <div><span>{event ? resourcePhaseText(language, event.phase) : resourceText(language, "preparing")}</span><strong>{percent.toFixed(1)}%</strong></div>
                    <progress max={100} value={percent} />
                    <small>{event ? `${formatBytes(event.receivedBytes)} / ${formatBytes(event.totalBytes)} · ${formatSpeed(event.speedBytesPerSecond)}` : resourceText(language, "prepareDownload")}</small>
                  </div>
                ) : null}
              </article>
            );
          })}
          {!overview ? <div className="resource-loading"><Icon name="loader" /> {resourceText(language, "reading")}</div> : null}
        </div>
      </section>

      <section className="settings-section-card cache-maintenance-card">
        <div className="settings-section-heading">
          <span className="settings-section-icon"><Icon name="speed" /></span>
          <div><strong>{resourceText(language, "cacheTitle")}</strong><span>{resourceText(language, "cacheHint")}</span></div>
        </div>
        <div className="cache-level-list">
          <div className="cache-level l1"><Icon name="smartToy" /><span><strong>{resourceText(language, "memory")}</strong><small>{resourceText(language, "entries", { count: overview?.cache.memoryEntries ?? 0, rate: ((overview?.cache.memoryHitRate ?? 0) * 100).toFixed(1) })}</small></span></div>
          <div className="cache-level l2"><Icon name="images" /><span><strong>{resourceText(language, "gallery")}</strong><small>{resourceText(language, "files", { count: galleryCache.files, size: formatBytes(galleryCache.bytes) })}</small></span></div>
          <div className="cache-level l3"><Icon name="database" /><span><strong>{resourceText(language, "sqlite")}</strong><small>{resourceText(language, "databaseCount", { count: overview?.resources.filter((item) => item.installed && item.valid).length ?? 0, size: formatBytes(installedBytes) })}</small></span></div>
        </div>
        <div className="row-actions"><Button onClick={() => void refresh()}><IconText icon={<Icon name="refresh" />}>{resourceText(language, "rescan")}</IconText></Button><Button onClick={() => void clearCaches()}><IconText icon={<Icon name="clear" />}>{resourceText(language, "clear")}</IconText></Button></div>
      </section>

      {message ? <div className="status-box">{message}</div> : null}

      {confirm ? (
        <div className="data-confirm-backdrop" role="dialog" aria-modal="true">
          <div className="data-confirm-card resource-confirm-card">
            <span className="data-confirm-icon"><Icon name="warning" /></span>
            <div>
              <strong>{confirm.mode === "install" ? resourceText(language, "confirmInstall") : resourceText(language, "confirmRestore")}</strong>
              <p>{resourceText(language, "confirmBody")}</p>
            </div>
            <div className="row-actions"><Button onClick={() => setConfirm(null)}>{resourceText(language, "cancel")}</Button><Button variant="danger" onClick={() => void runConfirmed()}>{confirm.mode === "install" ? resourceText(language, "agreeInstall") : resourceText(language, "agreeRestore")}</Button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
