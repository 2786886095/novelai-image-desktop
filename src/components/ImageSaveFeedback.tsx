import { OutputRecoveryNotice } from "./OutputRecoveryNotice";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, CloseIcon, FolderOpenIcon, RefreshIcon } from "../tavern/MaterialIcons";
import type { ImageSaveNotice } from "../image-save-feedback";

export function imageSaveText(_language: unknown) {
  return { pending: "正在保存图片…", download: "正在下载图片…", archive: "正在导出图片…", wait: "如有提示，请先选择保存位置；完成后会在此通知，无需重复点击。", success: "图片保存成功", archiveDone: "图片导出成功", partial: "部分图片保存成功", error: "保存失败", cancelled: "已取消保存", saved: "已保存", failed: "失败", images: "张", location: "保存位置", open: "打开保存位置", close: "关闭提示", failure: "请检查网络、剩余空间和文件夹访问权限后重试。", openFailed: "打开保存位置失败", cancelledHint: "没有新增保存文件。" };
}

export function ImageSaveNoticeCard({ notice, language, onDismiss, onOpen }: {
  notice: ImageSaveNotice; language: unknown; onDismiss: () => void; onOpen: (path: string) => Promise<{ ok: boolean }>;
}) {
  const text = imageSaveText(language);
  const [paused, setPaused] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const busy = notice.state === "pending";
  useEffect(() => {
    // Long downloads never disappear on a timer. Errors remain until dismissed.
    if (paused || !["success", "cancelled"].includes(notice.state)) return;
    const timer = window.setTimeout(onDismiss, notice.state === "success" ? 8000 : 4000);
    return () => clearTimeout(timer);
  }, [notice.state, onDismiss, paused]);
  const title = busy ? text[notice.kind === "download" ? "download" : notice.kind === "archive" ? "archive" : "pending"]
    : notice.state === "success" ? notice.kind === "archive" ? text.archiveDone : text.success : text[notice.state];
  return <section className={`image-save-notice is-${notice.state}`} role={notice.state === "error" || notice.state === "partial" ? "alert" : "status"}
    aria-live={notice.state === "error" ? "assertive" : "polite"} aria-atomic="true"
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
    <span className="image-save-notice-icon" aria-hidden="true">{busy ? <RefreshIcon /> : notice.state === "success" ? <CheckIcon /> : <CloseIcon />}</span>
    <div className="image-save-notice-content"><strong>{title}</strong>
      {busy ? <><p>{text.wait}{notice.total ? ` (${notice.total} ${text.images})` : ""}</p><div className="image-save-progress" role="progressbar" aria-label={title}><span /></div></> : null}
      {!busy && notice.saved !== undefined ? <p>{text.saved} {notice.saved} {text.images}{notice.failed ? ` · ${text.failed} ${notice.failed} ${text.images}` : ""}</p> : null}
      {notice.state === "cancelled" ? <p>{text.cancelledHint}</p> : null}
      {notice.state === "error" || notice.state === "partial" ? <p>{text.failure}{notice.errorCode ? ` (${notice.errorCode})` : ""}</p> : null}
      {notice.path ? <><p className="image-save-path" title={notice.path}>{text.location}：{notice.path}</p><button type="button" className="btn secondary compact" onClick={() => { void onOpen(notice.path!).then(result => setOpenFailed(!result.ok), () => setOpenFailed(true)); }}><FolderOpenIcon />{text.open}</button></> : null}
      {openFailed ? <p role="alert">{text.openFailed}</p> : null}
    </div>
    {!busy ? <button type="button" className="image-save-dismiss" aria-label={text.close} onClick={onDismiss}><CloseIcon /></button> : null}
  </section>;
}

export function ImageSaveFeedback({ language }: { language: unknown }) {
  const [notices, setNotices] = useState<ImageSaveNotice[]>([]);
  useEffect(() => window.naiDesktop.onImageSaveFeedback?.(setNotices), []);
  return createPortal(<div className="image-save-feedback"><OutputRecoveryNotice />{notices.map(notice => <ImageSaveNoticeCard key={notice.id} notice={notice} language={language}
    onDismiss={() => window.naiDesktop.dismissImageSaveFeedback(notice.id)} onOpen={path => window.naiDesktop.openInExplorer(path)} />)}</div>, document.body);
}
