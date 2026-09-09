import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, CloseIcon, FolderOpenIcon, RefreshIcon } from "../tavern/MaterialIcons";
import { normalizeAppLanguage } from "../i18n";
import type { ImageSaveNotice } from "../image-save-feedback";

export function imageSaveText(language: unknown) {
  switch (normalizeAppLanguage(language)) {
    case "zh-TW": return { pending: "正在儲存圖片…", download: "正在下載圖片…", archive: "正在匯出圖片…", wait: "請完成儲存位置選擇；完成後會在此通知，無需重複點擊。", success: "圖片儲存成功", archiveDone: "圖片匯出成功", partial: "部分圖片儲存成功", error: "儲存失敗", cancelled: "已取消儲存", saved: "已儲存", failed: "失敗", images: "張", location: "儲存位置", open: "開啟儲存位置", close: "關閉提示", failure: "請檢查網路、剩餘空間與資料夾存取權限後重試。", openFailed: "開啟儲存位置失敗", cancelledHint: "沒有新增儲存檔案。" };
    case "en-US": return { pending: "Saving images…", download: "Downloading images…", archive: "Exporting images…", wait: "Finish choosing a location if prompted. You will be notified here; no need to click again.", success: "Images saved", archiveDone: "Images exported", partial: "Some images were saved", error: "Save failed", cancelled: "Save cancelled", saved: "Saved", failed: "Failed", images: "images", location: "Saved to", open: "Open saved location", close: "Dismiss notification", failure: "Check your connection, free space and folder access, then retry.", openFailed: "Could not open saved location", cancelledHint: "No new file was saved." };
    case "ja-JP": return { pending: "画像を保存中…", download: "画像をダウンロード中…", archive: "画像を書き出し中…", wait: "必要に応じて保存先を選択してください。完了はここに表示されます。", success: "画像を保存しました", archiveDone: "画像を書き出しました", partial: "一部の画像を保存しました", error: "保存に失敗しました", cancelled: "保存をキャンセルしました", saved: "保存済み", failed: "失敗", images: "枚", location: "保存先", open: "保存先を開く", close: "通知を閉じる", failure: "接続、空き容量、フォルダーへのアクセスを確認して再試行してください。", openFailed: "保存先を開けませんでした", cancelledHint: "新しいファイルは保存されていません。" };
    case "ko-KR": return { pending: "이미지 저장 중…", download: "이미지 다운로드 중…", archive: "이미지 내보내는 중…", wait: "필요하면 저장 위치를 선택하세요. 완료되면 여기에 표시됩니다.", success: "이미지 저장 완료", archiveDone: "이미지 내보내기 완료", partial: "일부 이미지 저장 완료", error: "저장 실패", cancelled: "저장 취소", saved: "저장", failed: "실패", images: "장", location: "저장 위치", open: "저장 위치 열기", close: "알림 닫기", failure: "연결, 여유 공간 및 폴더 접근 권한을 확인한 뒤 다시 시도하세요.", openFailed: "저장 위치를 열지 못했습니다", cancelledHint: "새 파일이 저장되지 않았습니다." };
    default: return { pending: "正在保存图片…", download: "正在下载图片…", archive: "正在导出图片…", wait: "如有提示，请先选择保存位置；完成后会在此通知，无需重复点击。", success: "图片保存成功", archiveDone: "图片导出成功", partial: "部分图片保存成功", error: "保存失败", cancelled: "已取消保存", saved: "已保存", failed: "失败", images: "张", location: "保存位置", open: "打开保存位置", close: "关闭提示", failure: "请检查网络、剩余空间和文件夹访问权限后重试。", openFailed: "打开保存位置失败", cancelledHint: "没有新增保存文件。" };
  }
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
  return createPortal(<div className="image-save-feedback">{notices.map(notice => <ImageSaveNoticeCard key={notice.id} notice={notice} language={language}
    onDismiss={() => window.naiDesktop.dismissImageSaveFeedback(notice.id)} onOpen={path => window.naiDesktop.openInExplorer(path)} />)}</div>, document.body);
}
