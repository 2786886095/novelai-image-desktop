import { validateAccountProfile, normalizeNaiAccountInput, type NaiAccountInput, type NaiAccountProfile } from '../../src/nai-accounts';
interface Cipher { isEncryptionAvailable(): boolean; getSelectedStorageBackend?(): string; encryptString(value: string): Buffer; decryptString(value: Buffer): string }
export function accountCipherAvailable(cipher: Cipher): boolean {
  try { return cipher.isEncryptionAvailable() && cipher.getSelectedStorageBackend?.() !== 'basic_text'; }
  catch { return false; }
}
export interface AccountVaultDocument { version: 1; selectedId?: string; accounts: Array<NaiAccountProfile & { encryptedToken: string }> }
/** Secrets never enter list results. Failed decryption does not rewrite ciphertext. */
export class NaiAccountsVault {
  private leases = 0;
  constructor(private document: AccountVaultDocument, private cipher: Cipher, private persist: (document: AccountVaultDocument) => void) {}
  list(): NaiAccountProfile[] { return this.document.accounts.map(a => ({id:a.id,label:a.label,method:a.method,apiBaseUrl:a.apiBaseUrl,imageBaseUrl:a.imageBaseUrl})); }
  add(id: string, input: NaiAccountInput): NaiAccountProfile {
    const normalized=normalizeNaiAccountInput(input);
    validateAccountProfile(input);
    if (this.document.accounts.some(a => a.id === id)) throw new Error('Duplicate account id');
    if (!accountCipherAvailable(this.cipher)) throw new Error('OS credential encryption unavailable');
    const token=input.token;
    const profile={label:normalized.label,method:normalized.method,apiBaseUrl:normalized.apiBaseUrl,imageBaseUrl:normalized.imageBaseUrl};
    const account = { ...profile, id, encryptedToken: this.cipher.encryptString(token.trim()).toString('base64') };
    const next: AccountVaultDocument = { ...this.document, accounts: [...this.document.accounts, account] };
    this.persist(next); this.document = next;
    return { ...profile, id };
  }
  remove(id: string): void {
    if (this.leases) throw new Error('Account operation in flight');
    if(this.document.selectedId===id) throw new Error('请先切换账户，再删除当前账户。');
    const next: AccountVaultDocument = { ...this.document, accounts: this.document.accounts.filter(a => a.id !== id) };
    this.persist(next); this.document = next;
  }
  selectedId() { return this.document.selectedId; }
  select(id?: string) {
    if(this.leases) throw new Error('Account operation in flight');
    if(id && !this.document.accounts.some(a=>a.id===id)) throw new Error('Unknown account');
    const next={...this.document,selectedId:id}; this.persist(next); this.document=next;
  }
  bind(id: string) {
    const account = this.document.accounts.find(a => a.id === id);
    if (!account) throw new Error('Unknown account');
    if (!accountCipherAvailable(this.cipher)) throw new Error('OS credential encryption unavailable');
    const token = this.cipher.decryptString(Buffer.from(account.encryptedToken, 'base64'));
    validateAccountProfile({ ...account, token });
    this.leases++; let ended = false;
    const { encryptedToken: _secret, ...profile } = account;
    return { snapshot: Object.freeze({ ...profile, token }), release: () => { if (!ended) { ended = true; this.leases--; } } };
  }
}
