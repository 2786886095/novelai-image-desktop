import { dialog } from 'electron';
import { ArtistReferenceService } from './references';
import { exportReferenceBackup, importReferenceBackup } from './reference-backup';
import type { ReferenceAction, ReferenceResponse } from '../../src/artist-comparison/reference-types';
let service: ArtistReferenceService | undefined;
let backupBusy = false;
let mutations = 0;
function getService() { return service ??= new ArtistReferenceService(); }
/** Lazily initialized after the selected userData profile is applied. */
export async function referenceAction(action: ReferenceAction): Promise<ReferenceResponse> {
  if (backupBusy && action.type !== 'load') throw Error('原作库正在备份或导入，请稍后再试');
  if (action.type !== 'load') mutations++;
  try {
    if (action.type === 'local-upload') {
      const chosen = await dialog.showOpenDialog({
        title: '选择本地原作参考图片',
        properties: ['openFile'],
        filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'bmp', 'gif'] }],
      });
      if (chosen.canceled || !chosen.filePaths[0]) return getService().action({ type: 'load' });
      return await getService().importLocalReference(action.tag, chosen.filePaths[0]);
    }
    return await getService().action(action);
  }
  finally { if (action.type !== 'load') mutations--; }
}
export async function referenceBackup(mode: 'export' | 'import'): Promise<{ message: string }> {
  if (backupBusy || mutations) throw Error('原作资料正在处理，请稍后再试');
  if (mode !== 'export' && mode !== 'import') throw Error('无效的备份操作');
  backupBusy = true;
  try {
    const library = getService();
    if (mode === 'export') {
      const chosen = await dialog.showSaveDialog({ title: '备份共享原作库', defaultPath: 'artist-original-references.zip', filters: [{ name: 'ZIP', extensions: ['zip'] }] });
      if (chosen.canceled || !chosen.filePath) return { message: '已取消备份' };
      const { state } = await library.action({ type: 'load' });
      await exportReferenceBackup(library.libraryRoot, state, chosen.filePath);
      return { message: '共享原作库备份完成（与项目 ZIP 分开保存）' };
    }
    const chosen = await dialog.showOpenDialog({ title: '导入共享原作库', properties: ['openFile'], filters: [{ name: '原作库 ZIP', extensions: ['zip'] }] });
    if (chosen.canceled || !chosen.filePaths[0]) return { message: '已取消导入' };
    const { state } = await library.action({ type: 'load' });
    const count = await importReferenceBackup(library.libraryRoot, library.libraryStateFile, state, chosen.filePaths[0]);
    service = new ArtistReferenceService();
    return { message: `已合并 ${count} 位画师的共享原作资料，已有资料保持不变` };
  } finally { backupBusy = false; }
}
