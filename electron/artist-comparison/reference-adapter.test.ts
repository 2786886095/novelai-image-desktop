import { describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  action: vi.fn(async () => ({ state: { records: {} } })),
  local: vi.fn(),
}));
vi.mock('electron', () => ({ dialog: { showOpenDialog: mocks.open } }));
vi.mock('./references', () => ({
  ArtistReferenceService: class {
    action = mocks.action;
    importLocalReference = mocks.local;
  },
}));
vi.mock('./reference-backup', () => ({ exportReferenceBackup: vi.fn(), importReferenceBackup: vi.fn() }));
import { referenceAction, referenceBackup } from './reference-adapter';

describe('local reference native picker', () => {
  it('uses only the native selected path and keeps the mutation lock until import finishes', async () => {
    mocks.open.mockResolvedValueOnce({ canceled: false, filePaths: ['/native/chosen.png'] });
    let complete!: (value: any) => void;
    mocks.local.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const upload = referenceAction({ type: 'local-upload', tag: 'demo', filePath: '/untrusted/renderer.png' } as any);
    await vi.waitFor(() => expect(mocks.local).toHaveBeenCalledWith('demo', '/native/chosen.png'));
    await expect(referenceBackup('export')).rejects.toThrow('正在处理');
    complete({ state: { records: {} } });
    await upload;
  });
  it('canceling the picker does not import or change a cover', async () => {
    mocks.local.mockClear();
    mocks.open.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    await referenceAction({ type: 'local-upload', tag: 'demo' });
    expect(mocks.local).not.toHaveBeenCalled();
    expect(mocks.action).toHaveBeenCalledWith({ type: 'load' });
  });
});
