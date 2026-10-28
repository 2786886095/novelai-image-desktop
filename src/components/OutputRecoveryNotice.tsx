import { useState } from 'react';
import { errorText } from '../error-message';
import { useAppStore } from '../store';
import { FolderOpenIcon, CloseIcon } from '../tavern/MaterialIcons';

const labels = {
  'zh-CN': ['旧图片已恢复到新位置', '图片恢复未完成，原路径已保留', '已校验文件', '新保存位置', '打开新位置', '打开原位置', '知道了', '原文件与备份没有删除。更新前请先将安装目录中的用户文件移到外部。'],
};

/** Persisted until explicitly dismissed, including after another restart. */
export function OutputRecoveryNotice() {
  const settings = useAppStore(state => state.settings);
  const [error, setError] = useState('');
  const notice = settings?.outputMigrationNotice;
  if (!notice) return null;
  const text = labels[settings.language] ?? labels['zh-CN'];
  const open = (path: string) => void window.naiDesktop.openInExplorer(path).then(result => {
    if (!result.ok) setError('打开位置失败');
  }).catch(reason => setError(errorText(reason)));
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
      void window.naiDesktop.setSetting('outputMigrationNotice', null).then(() => useAppStore.getState().refreshSettings()).catch(reason => setError(errorText(reason)));
    }}><CloseIcon /></button>
  </section>;
}
