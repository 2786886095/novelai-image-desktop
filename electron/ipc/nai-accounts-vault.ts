import { validateAccountProfile, normalizeNaiAccountInput, type NaiAccountInput, type NaiAccountProfile } from '../../src/nai-accounts';
interface Cipher { isEncryptionAvailable(): boolean; getSelectedStorageBackend?(): string; encryptString(value: string): Buffer; decryptString(value: Buffer): string }
export function accountCipherAvailable(cipher: Cipher): boolean {
  try { return cipher.isEncryptionAvailable() && cipher.getSelectedStorageBackend?.() !== 'basic_text'; }
  catch { return false; }
}
export interface AccountVaultDocument { version: 1; selectedId?: string; legacyMigrated?:boolean; managed?:boolean; accounts: Array<NaiAccountProfile & { encryptedToken: string }> }
/** Secrets never enter list results. Failed decryption does not rewrite ciphertext. */
export class NaiAccountsVault {
  private leases = 0;
  constructor(private document: AccountVaultDocument, private cipher: Cipher, private persist: (document: AccountVaultDocument) => void) {}
  list(): NaiAccountProfile[] { return this.document.accounts.map(a => ({id:a.id,label:a.label,method:a.method,apiBaseUrl:a.apiBaseUrl,imageBaseUrl:a.imageBaseUrl,...(a.legacyConfiguration?{legacyConfiguration:{...a.legacyConfiguration}}:{})})); }
  legacyMigrated(){return this.document.legacyMigrated===true;}
  managed(){return this.document.managed===true||this.document.legacyMigrated===true||this.document.accounts.length>0;}
  /** Identity is the main API endpoint + key, not a display label, login method or ciphertext. */
  assertUnique(input: NaiAccountInput): void {
    let candidate:ReturnType<typeof normalizeNaiAccountInput>;
    try{candidate=normalizeNaiAccountInput(input);validateAccountProfile(candidate);}
    catch{throw Error('NAI_ACCOUNT_VALIDATION:invalid-input:0');}
    if(!accountCipherAvailable(this.cipher))throw Error('OS credential encryption unavailable');
    const endpoint=(value:string)=>new URL(value.trim()).href.replace(/\/+$/,'');
    const address=endpoint(candidate.apiBaseUrl),key=candidate.token.trim();
    for(const account of this.document.accounts){
      if(endpoint(account.apiBaseUrl)!==address)continue;
      let storedKey:string;
      try{storedKey=this.cipher.decryptString(Buffer.from(account.encryptedToken,'base64')).trim();}
      catch{throw Error('Stored account key unavailable');}
      if(storedKey===key)throw Error('NAI_ACCOUNT_DUPLICATE');
    }
  }
  importLegacy(id:string,input:NaiAccountInput,configuration:NonNullable<NaiAccountProfile['legacyConfiguration']>):NaiAccountProfile{
    if(this.leases)throw Error('Account operation in flight');
    if(this.document.legacyMigrated)throw Error('Legacy configuration already migrated');
    if(!input.token.trim()||/[\r\n]/.test(input.token)||input.token.length>16384)throw Error('Invalid legacy token');
    for(const raw of [input.apiBaseUrl,input.imageBaseUrl!]){const url=new URL(raw);if((url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))||url.username||url.password||url.search||url.hash)throw Error('Invalid legacy endpoint');}
    if(!accountCipherAvailable(this.cipher))throw Error('OS credential encryption unavailable');
    const profile:NaiAccountProfile={id,label:input.label,method:input.method,apiBaseUrl:input.apiBaseUrl,imageBaseUrl:input.imageBaseUrl!,legacyConfiguration:{...configuration}};
    const old=this.document.accounts.find(a=>a.id===id);if(old)throw Error('Duplicate legacy account');
    const account={...profile,encryptedToken:this.cipher.encryptString(input.token.trim()).toString('base64')};
    const next:AccountVaultDocument={...this.document,legacyMigrated:true,selectedId:this.document.selectedId??id,accounts:[...this.document.accounts,account]};
    this.persist(next);this.document=next;return profile;
  }
  add(id: string, input: NaiAccountInput): NaiAccountProfile {
    const normalized=normalizeNaiAccountInput(input);
    validateAccountProfile(input);
    if (this.document.accounts.some(a => a.id === id)) throw new Error('Duplicate account id');
    if (!accountCipherAvailable(this.cipher)) throw new Error('OS credential encryption unavailable');
    // Recheck at the synchronous write boundary, including concurrent IPC additions.
    this.assertUnique(normalized);
    const token=input.token;
    const profile={label:normalized.label,method:normalized.method,apiBaseUrl:normalized.apiBaseUrl,imageBaseUrl:normalized.imageBaseUrl};
    const account = { ...profile, id, encryptedToken: this.cipher.encryptString(token.trim()).toString('base64') };
    const next: AccountVaultDocument = { ...this.document, managed:true, accounts: [...this.document.accounts, account] };
    this.persist(next); this.document = next;
    return { ...profile, id };
  }
  remove(id: string): void {
    if (this.leases) throw new Error('Account operation in flight');
    if(!this.document.accounts.some(a=>a.id===id))throw Error('Unknown account');
    const accounts=this.document.accounts.filter(a=>a.id!==id);
    const selectedId=this.document.selectedId===id?accounts[0]?.id:this.document.selectedId;
    // A durable tombstone prevents deleted credentials from being reimported on restart.
    const next: AccountVaultDocument = { ...this.document, managed:true, legacyMigrated:true, selectedId, accounts };
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
    if(!account.legacyConfiguration)validateAccountProfile({ ...account, token });
    else {if(!token.trim()||/[\r\n]/.test(token))throw Error('Invalid legacy token');for(const raw of [account.apiBaseUrl,account.imageBaseUrl]){const url=new URL(raw);if((url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))||url.username||url.password||url.search||url.hash)throw Error('Invalid legacy endpoint');}}
    this.leases++; let ended = false;
    const { encryptedToken: _secret, ...profile } = account;
    return { snapshot: Object.freeze({ ...profile, token }), release: () => { if (!ended) { ended = true; this.leases--; } } };
  }
}
