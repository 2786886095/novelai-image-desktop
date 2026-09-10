import { useState } from 'react';
import { useAppStore } from '../store';
import { FolderOpenIcon, CloseIcon } from '../tavern/MaterialIcons';

const labels = {
  'zh-CN': ['旧图片已恢复到新位置', '图片恢复未完成，原路径已保留', '已校验文件', '新保存位置', '打开新位置', '打开原位置', '知道了', '原文件与备份没有删除。更新前请先将安装目录中的用户文件移到外部。'],
  'zh-TW': ['舊圖片已恢復到新位置', '圖片恢復未完成，原路徑已保留', '已驗證檔案', '新儲存位置', '開啟新位置', '開啟原位置', '知道了', '原檔案與備份未刪除。更新前請將安裝目錄中的使用者檔案移到外部。'],
  'en-US': ['Previous images recovered', 'Recovery incomplete; original location retained', 'Verified files', 'New save location', 'Open new location', 'Open original location', 'Dismiss', 'Original files and backups were not deleted. Move user files outside the installation folder before updating.'],
  'ja-JP': ['以前の画像を新しい場所に復元しました', '復元が未完了です。元の場所を保持しています', '検証済みファイル', '新しい保存先', '新しい場所を開く', '元の場所を開く', '閉じる', '元のファイルとバックアップは削除していません。更新前にユーザーファイルをインストール先の外へ移動してください。'],
  'ko-KR': ['이전 이미지를 새 위치에 복구했습니다', '복구 미완료: 원래 위치를 유지합니다', '검증된 파일', '새 저장 위치', '새 위치 열기', '원래 위치 열기', '닫기', '원본과 백업을 삭제하지 않았습니다. 업데이트 전에 사용자 파일을 설치 폴더 밖으로 옮기세요.'],
};

/** Persisted until explicitly dismissed, including after another restart. */
export function OutputRecoveryNotice() {
  const settings = useAppStore(state => state.settings);
  const [error, setError] = useState('');
  const notice = settings?.outputMigrationNotice;
  if (!notice) return null;
  const text = labels[settings.language] ?? labels['en-US'];
  const open = (path: string) => void window.naiDesktop.openInExplorer(path).then(result => {
    if (!result.ok) setError('Open location failed');
  }).catch(reason => setError(String(reason)));
  return <section className="image-save-notice" role="status" aria-live="polite" aria-atomic="true">
    <div className="image-save-notice-content">
      <strong>{text[notice.status === 'recovered' ? 0 : 1]}</strong>
      <p>{text[2]}: {notice.copiedFiles}</p><p>{text[7]}</p>
      <p className="image-save-path">{text[3]}: {notice.targetPath}</p>
      {notice.status === 'failed' && notice.error && <p>{notice.error}</p>}
      {notice.status === 'recovered' && <button type="button" className="btn" onClick={() => open(notice.targetPath)}><FolderOpenIcon />{text[4]}</button>}
      {notice.sourcePaths.map(path => <button type="button" className="btn" key={path} title={path} onClick={() => open(path)}>{text[5]}</button>)}
      {error && <p role="alert">{error}</p>}
    </div>
    <button type="button" className="image-save-dismiss" aria-label={text[6]} onClick={() => {
      void window.naiDesktop.setSetting('outputMigrationNotice', null).then(() => useAppStore.getState().refreshSettings()).catch(reason => setError(String(reason)));
    }}><CloseIcon /></button>
  </section>;
}
