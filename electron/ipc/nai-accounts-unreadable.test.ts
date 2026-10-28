import { expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import JSZip from 'jszip';

// Settings copied from another PC or OS account: safeStorage only decrypts what this machine encrypted.
// keychain: 'unavailable' = isEncryptionAvailable() false; 'denied' = the OS refuses every encrypt/decrypt.
const fixture = vi.hoisted(() => ({ root: '', handlers: new Map<string, Function>(), machine: 1, keychain: 'ok' as 'ok' | 'unavailable' | 'denied' }));
vi.mock('electron', () => ({
  app: { isPackaged: false, getVersion: () => 'fixture', getPath: (n: string) => n === 'exe' ? path.join(fixture.root, 'app', 'desktop.exe') : n === 'pictures' ? path.join(fixture.root, 'pictures') : fixture.root, getAppPath: () => path.join(fixture.root, 'app') },
  dialog: {},
  ipcMain: { handle: (name: string, handler: Function) => fixture.handlers.set(name, handler) },
  safeStorage: {
    isEncryptionAvailable: () => fixture.keychain !== 'unavailable',
    encryptString: (s: string) => {
      if (fixture.keychain === 'denied') throw Error('Error while encrypting the text provided to safeStorage.encryptString.');
      return Buffer.concat([Buffer.from([fixture.machine]), Buffer.from(s).map((x) => x ^ 73)]);
    },
    decryptString: (b: Buffer) => {
      if (fixture.keychain === 'denied' || b[0] !== fixture.machine) throw Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.');
      return Buffer.from(b.subarray(1)).map((x) => x ^ 73).toString();
    },
  },
}));
vi.mock('./artist-favorites', () => ({ ARTIST_FAVORITE_COLLECTIONS: ['random', 'v5-repair', 'artist-string-draw'], loadArtistFavoriteLibrary: async () => ({ collections: { random: [], 'v5-repair': [], 'artist-string-draw': [] } }) }));
vi.mock('./reference-presets', () => ({ listReferencePresets: async () => ({ groups: [], presets: [] }) }));

const official = (token: string, label: string) => ({ label, method: 'token', token, apiBaseUrl: 'https://api.novelai.net', imageBaseUrl: 'https://image.novelai.net' });
const TOKENS = ['fixture-token-copied', 'fixture-token-works', 'fixture-token-incoming'];

/** A fresh main process over the same userData folder. */
async function boot() {
  fixture.handlers.clear();
  vi.resetModules();
  const axios = (await import('axios')).default;
  vi.spyOn(axios, 'get').mockImplementation(async () => ({ status: 200, data: { subscription: { tier: 0, active: false, trainingStepsLeft: { fixedTrainingStepsLeft: 42, purchasedTrainingSteps: 0 } } } }));
  vi.spyOn(axios, 'post').mockImplementation(async () => { throw Error('Paid request forbidden'); });
  const store = await import('./store');
  const accounts = await import('./nai-accounts');
  accounts.registerNaiAccountsIpc();
  const backup = await import('./data-backup');
  const vault = await import('./nai-accounts-vault');
  const call = async (name: string, ...args: unknown[]) => {
    try { return { ok: true as const, value: await fixture.handlers.get(name)!({}, ...args) }; }
    catch (error: any) { return { ok: false as const, error: String(error?.message ?? error) }; }
  };
  return { store, backup, vault, call };
}

async function owned(work: () => Promise<void>) {
  fixture.root = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-accounts-unreadable-'));
  fixture.machine = 1;
  fixture.keychain = 'ok';
  try { await work(); }
  finally { vi.restoreAllMocks(); fs.rmSync(fixture.root, { recursive: true, force: true }); }
}

function seedStore(store: Awaited<ReturnType<typeof boot>>['store']) {
  store.writeStore({ settings: { ...store.defaultSettings(), outputDir: path.join(fixture.root, 'images'), backupDir: path.join(fixture.root, 'backups') }, history: [], historyGroups: [], convertHistory: [], reverseHistory: [] } as any);
}

function expectNoTokens(...texts: unknown[]) {
  for (const text of texts) for (const token of TOKENS) expect(JSON.stringify(text)).not.toContain(token);
}

it('starts with an unreadable selected account deselected, and the account can be removed and added again', () => owned(async () => {
  let c = await boot();
  seedStore(c.store);
  const copied = await c.call('naiAccounts:add', official('fixture-token-copied', 'copied'));
  expect(copied.ok, copied.ok ? '' : copied.error).toBe(true);
  const id = (copied as any).value.id;
  expect((await c.call('naiAccounts:select', id)).ok).toBe(true);

  // The same userData folder on another PC.
  fixture.machine = 2;
  c = await boot();
  expect(() => c.store.getSettings()).not.toThrow();
  const state = await c.call('naiAccounts:state');
  expect(state).toMatchObject({ ok: true, value: { selectedId: undefined, selectionUnreadable: true } });
  const list = await c.call('naiAccounts:list');
  expect(list.ok && (list.value as any[]).map((a) => a.id)).toEqual([id]);

  // Re-adding the same token is not blocked by the entry that cannot be decrypted.
  const again = await c.call('naiAccounts:add', official('fixture-token-copied', 'copied again'));
  expect(again.ok, again.ok ? '' : again.error).toBe(true);
  expect((await c.call('naiAccounts:select', (again as any).value.id)).ok).toBe(true);
  expect(await c.call('naiAccounts:state')).toMatchObject({ value: { selectionUnreadable: false } });
  expect((await c.call('naiAccounts:remove', id)).ok).toBe(true);
  // With the unreadable account gone the notice stays off, even when nothing is selected again.
  expect((await c.call('naiAccounts:remove', (again as any).value.id)).ok).toBe(true);
  expect(await c.call('naiAccounts:state')).toMatchObject({ value: { selectedId: undefined, selectionUnreadable: false } });
  expectNoTokens(state, list, again);
}));

it('keeps the selection and stops at startup when the keychain is unavailable or denied', () => owned(async () => {
  let c = await boot();
  seedStore(c.store);
  const account = await c.call('naiAccounts:add', official('fixture-token-works', 'works'));
  expect(account.ok).toBe(true);
  const id = (account as any).value.id;
  expect((await c.call('naiAccounts:select', id)).ok).toBe(true);
  const vaultFile = path.join(fixture.root, 'nai-accounts-v1.json');
  const before = fs.readFileSync(vaultFile, 'utf8');
  for (const keychain of ['unavailable', 'denied'] as const) {
    fixture.keychain = keychain;
    c = await boot();
    const state = await c.call('naiAccounts:state');
    expect(state, keychain).toMatchObject({ ok: false, error: c.vault.ACCOUNT_VAULT_ERRORS.encryptionUnavailable });
    expect(fs.readFileSync(vaultFile, 'utf8'), keychain).toBe(before);
  }
  // The keychain works again on the next launch: the same account is still selected.
  fixture.keychain = 'ok';
  c = await boot();
  expect(await c.call('naiAccounts:state')).toMatchObject({ ok: true, value: { selectedId: id, selectionUnreadable: false } });
}));

it('leaves nothing selected when the selected account is removed and the next one cannot be decrypted', () => owned(async () => {
  let c = await boot();
  seedStore(c.store);
  const copied = await c.call('naiAccounts:add', official('fixture-token-copied', 'copied'));
  expect(copied.ok).toBe(true);
  fixture.machine = 2;
  c = await boot();
  const works = await c.call('naiAccounts:add', official('fixture-token-works', 'works'));
  expect(works.ok).toBe(true);
  expect((await c.call('naiAccounts:select', (works as any).value.id)).ok).toBe(true);
  const removed = await c.call('naiAccounts:remove', (works as any).value.id);
  expect(removed.ok, removed.ok ? '' : removed.error).toBe(true);
  expect(await c.call('naiAccounts:state')).toMatchObject({ ok: true, value: { selectedId: undefined } });
  expect((await c.call('naiAccounts:list') as any).value.map((a: any) => a.id)).toEqual([(copied as any).value.id]);
}));

it('shows the Chinese decrypt message, not a file-system error, when the deselection cannot be saved', () => owned(async () => {
  let c = await boot();
  seedStore(c.store);
  const copied = await c.call('naiAccounts:add', official('fixture-token-copied', 'copied'));
  expect((await c.call('naiAccounts:select', (copied as any).value.id)).ok).toBe(true);
  fixture.machine = 2;
  c = await boot();
  const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw Object.assign(Error("EPERM: operation not permitted, rename '/somewhere/nai-accounts-v1.json'"), { code: 'EPERM' }); });
  const state = await c.call('naiAccounts:state');
  rename.mockRestore();
  expect(state).toMatchObject({ ok: false, error: c.vault.ACCOUNT_VAULT_ERRORS.decryptFailed });
}));

it('reports an unreadable saved account in Chinese on backup export and restore, without the read-error prefix', () => owned(async () => {
  let c = await boot();
  seedStore(c.store);
  const copied = await c.call('naiAccounts:add', official('fixture-token-copied', 'copied'));
  expect(copied.ok).toBe(true);
  // Copied to another PC, where a second account is added and selected.
  fixture.machine = 2;
  c = await boot();
  const works = await c.call('naiAccounts:add', official('fixture-token-works', 'works'));
  expect(works.ok, works.ok ? '' : works.error).toBe(true);
  expect((await c.call('naiAccounts:select', (works as any).value.id)).ok).toBe(true);
  c = await boot();
  const decryptFailed = c.vault.ACCOUNT_VAULT_ERRORS.decryptFailed;
  const exported = await c.backup.exportDataBackup({ categories: ['apiCredentials'], destination: 'internal' } as any)
    .then((result: any) => String(result?.message ?? ''), (error: any) => String(error?.message ?? error));
  expect(exported).toContain(decryptFailed);

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: 'langbai-novelai-studio-backup', version: 1, categories: ['apiCredentials'] }));
  zip.file('data/api-credentials.json', JSON.stringify({ settings: {}, novelAiAccounts: { version: 1, selectedId: null, accounts: [{ id: 'n1', ...official('fixture-token-incoming', 'incoming') }] } }));
  const file = path.join(fixture.root, crypto.randomUUID() + '.naisbackup');
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }));
  const restored = await c.backup.importDataBackup({ path: file, categories: ['apiCredentials'], confirmConfigurationOverwrite: true } as any);
  expect(restored.ok).toBe(false);
  expect(restored.message).toBe(decryptFailed);

  // Following the message works: remove the unreadable account, then export and re-add succeed.
  expect((await c.call('naiAccounts:remove', (copied as any).value.id)).ok).toBe(true);
  const after = await c.backup.exportDataBackup({ categories: ['apiCredentials'], destination: 'internal' } as any)
    .then((result: any) => String(result?.message ?? ''), (error: any) => String(error?.message ?? error));
  expect(after).not.toContain(decryptFailed);
  expect((await c.call('naiAccounts:add', official('fixture-token-copied', 'copied again'))).ok).toBe(true);
  expectNoTokens(exported, restored, after);
}));
