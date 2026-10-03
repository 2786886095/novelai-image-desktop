import { validateAccountProfile, normalizeNaiAccountInput, type NaiAccountInput, type NaiAccountProfile } from '../../src/nai-accounts';
import {stableNaiAccountSummary,type NaiAccountSummary} from './nai-account-summary';
import crypto from 'node:crypto';
interface Cipher { isEncryptionAvailable(): boolean; getSelectedStorageBackend?(): string; encryptString(value: string): Buffer; decryptString(value: Buffer): string }
export function accountCipherAvailable(cipher: Cipher): boolean {
  try { return cipher.isEncryptionAvailable() && cipher.getSelectedStorageBackend?.() !== 'basic_text'; }
  catch { return false; }
}
export interface AccountVaultDocument { version: 1; selectedId?: string; legacyMigrated?:boolean; managed?:boolean; accounts: Array<NaiAccountProfile & { encryptedToken: string; accountSummary?: NaiAccountSummary }> }

/** Portable sensitive archive only. Never returned by account IPC list/state. */
export interface PortableNaiAccounts {
  version: 1; selectedId: string | null;
  accounts: Array<NaiAccountProfile & {token: string; accountSummary?: NaiAccountSummary}>;
}
export function parsePortableNaiAccounts(value: unknown,allowLegacyForExport=false): PortableNaiAccounts {
  const fail=()=>{throw Error('Invalid portable NovelAI account backup');};
  const obj=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
  if(!obj(value)||JSON.stringify(value).length>4*1024*1024||value.version!==1||
    Object.keys(value).some(k=>!['version','selectedId','accounts'].includes(k))||
    !Array.isArray(value.accounts)||value.accounts.length>128||
    !(value.selectedId===null||typeof value.selectedId==='string'))return fail();
  const ids=new Set<string>();
  const accounts=value.accounts.map((raw:unknown)=>{
    if(!obj(raw)||Object.keys(raw).some(k=>!['id','label','method','apiBaseUrl','imageBaseUrl','token','accountSummary',...(allowLegacyForExport?['legacyConfiguration']:[])].includes(k))||
      !['id','label','method','apiBaseUrl','imageBaseUrl','token'].every(k=>typeof raw[k]==='string')||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(raw.id)||ids.has(raw.id))return fail();
    ids.add(raw.id);
    let normalized:ReturnType<typeof normalizeNaiAccountInput>;
    try{
      normalized=normalizeNaiAccountInput(raw as unknown as NaiAccountInput);
      if(allowLegacyForExport&&raw.legacyConfiguration){
        const legacy=raw.legacyConfiguration;
        if(!obj(legacy)||Object.keys(legacy).some(k=>!['allowCustomEndpoint','allowCustomEndpointFallback'].includes(k))||
          typeof legacy.allowCustomEndpoint!=='boolean'||typeof legacy.allowCustomEndpointFallback!=='boolean'||
          !['token','official-login','relay'].includes(raw.method)||!raw.label.trim()||raw.label.length>120||!raw.token.trim()||raw.token.length>16384||/[\r\n]/.test(raw.token))return fail();
        for(const base of [raw.apiBaseUrl,raw.imageBaseUrl]){const u=new URL(base);if(u.username||u.password||u.search||u.hash||
          (u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))return fail();}
      }else validateAccountProfile(normalized);
    }catch{return fail();}
    for(const base of [raw.apiBaseUrl,raw.imageBaseUrl]){
      if(base.length>4096||base.includes('\\')||new URL(base).pathname.split('/').some(p=>['.','..'].includes(decodeURIComponent(p))))return fail();
    }
    const summary=raw.accountSummary;
    if(summary!==undefined&&(!obj(summary)||Object.keys(summary).some(k=>!['tierName','tierLevel','anlasBalance','expiresAt','hasActiveSubscription'].includes(k))||
      (summary.tierName!==undefined&&(typeof summary.tierName!=='string'||summary.tierName.length>32))||
      ['tierLevel','anlasBalance'].some(k=>summary[k]!==undefined&&(!Number.isSafeInteger(summary[k])||summary[k]<0))||
      (summary.expiresAt!==undefined&&(typeof summary.expiresAt!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(summary.expiresAt)))||
      (summary.hasActiveSubscription!==undefined&&typeof summary.hasActiveSubscription!=='boolean')))return fail();
    return {id:raw.id,label:raw.label.trim(),method:normalized.method,apiBaseUrl:normalized.apiBaseUrl,
      imageBaseUrl:normalized.imageBaseUrl,token:raw.token.trim(),...(allowLegacyForExport&&raw.legacyConfiguration?{legacyConfiguration:{...raw.legacyConfiguration}}:{}),...(summary?{accountSummary:stableNaiAccountSummary(summary)}:{})};
  });
  if(value.selectedId!==null&&!ids.has(value.selectedId))return fail();
  return {version:1,selectedId:value.selectedId,accounts};
}

/** Secrets never enter list results. Failed decryption does not rewrite ciphertext. */
export class NaiAccountsVault {
  private leases = 0;
  constructor(private document: AccountVaultDocument, private cipher: Cipher, private persist: (document: AccountVaultDocument) => void) {}
  list(): NaiAccountProfile[] { return this.document.accounts.map(a => ({id:a.id,label:a.label,method:a.method,apiBaseUrl:a.apiBaseUrl,imageBaseUrl:a.imageBaseUrl,...(a.legacyConfiguration?{legacyConfiguration:{...a.legacyConfiguration}}:{})})); }
  accountSummary(id:string){const value=this.document.accounts.find(a=>a.id===id)?.accountSummary;return value?stableNaiAccountSummary(value):undefined;}
  rememberAccountSummary(id:string,summary:NaiAccountSummary){
    const account=this.document.accounts.find(a=>a.id===id);if(!account)return;
    const stable=stableNaiAccountSummary(summary);if(JSON.stringify(account.accountSummary)===JSON.stringify(stable))return;
    const next={...this.document,accounts:this.document.accounts.map(a=>a.id===id?{...a,accountSummary:stable}:a)};
    this.persist(next);this.document=next;
  }

  revision(){return JSON.stringify(this.document);}
  exportBackup():PortableNaiAccounts {
    const accounts=this.document.accounts.map(a=>{
      const lease=this.bind(a.id);
      try{
        const {legacyConfiguration:legacy,...profile}=lease.snapshot;
        // Preserve ambiguous migrated routing in the archive rather than losing
        // its key or forwarding it to a guessed provider during restore.
        let needsReview=false;try{validateAccountProfile(profile);}catch{needsReview=true;}
        return {...profile,...(needsReview&&legacy?{legacyConfiguration:{...legacy}}:{}),...(a.accountSummary?{accountSummary:stableNaiAccountSummary(a.accountSummary)}:{})};
      }
      finally{lease.release();}
    });
    return parsePortableNaiAccounts({version:1,selectedId:this.document.selectedId??null,accounts},true);
  }
  /** All verification is completed by the caller before this single durable write. */
  prepareBackupRestore(portable:PortableNaiAccounts,expected:string,verified:Map<string,NaiAccountSummary>){
    if(this.revision()!==expected||this.leases)throw Error('Account vault changed during backup import');
    if(!accountCipherAvailable(this.cipher))throw Error('OS credential encryption unavailable');
    const accounts=[...this.document.accounts],mapping=new Map<string,string>();
    const endpoint=(value:string)=>new URL(value.trim()).href.replace(/\/+$/,'');
    for(const incoming of portable.accounts){
      const duplicate=accounts.find(a=>endpoint(a.apiBaseUrl)===endpoint(incoming.apiBaseUrl)&&
        this.cipher.decryptString(Buffer.from(a.encryptedToken,'base64')).trim()===incoming.token);
      const id=duplicate?.id??(accounts.some(a=>a.id===incoming.id)?crypto.randomUUID():incoming.id);
      mapping.set(incoming.id,id);
      const fresh=verified.get(incoming.id)??{},cached=duplicate?.accountSummary??incoming.accountSummary;
      const accountSummary=stableNaiAccountSummary({...cached,...fresh,anlasBalance:fresh.anlasBalance??cached?.anlasBalance,
        hasActiveSubscription:incoming.method==='relay'?false:fresh.hasActiveSubscription});
      if(duplicate){accounts[accounts.indexOf(duplicate)]={...duplicate,accountSummary};continue;}
      const {token,accountSummary:_cached,...profile}=incoming;
      accounts.push({...profile,id,encryptedToken:this.cipher.encryptString(token).toString('base64'),accountSummary});
    }
    if(accounts.length>128)throw Error('Account backup exceeds saved account limit');
    const next:AccountVaultDocument={...this.document,managed:true,legacyMigrated:true,accounts,
      selectedId:portable.accounts.length?(portable.selectedId===null?undefined:mapping.get(portable.selectedId)):this.document.selectedId};
    const selected=next.accounts.find(a=>a.id===next.selectedId);
    const snapshot=selected?{id:selected.id,label:selected.label,method:selected.method,apiBaseUrl:selected.apiBaseUrl,imageBaseUrl:selected.imageBaseUrl,
      ...(selected.legacyConfiguration?{legacyConfiguration:selected.legacyConfiguration}:{}),
      token:this.cipher.decryptString(Buffer.from(selected.encryptedToken,'base64'))}:undefined;
    return {snapshot,commit:()=>{
      if(this.revision()!==expected||this.leases)throw Error('Account vault changed during backup import');
      // Preserve an empty/logged-out archive without clearing saved credentials.
      if(!portable.accounts.length)return;
      this.persist(next);this.document=next;
    }};
  }
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
    return this.addVerified(id,input);
  }
  /** Caller has completed read-only authentication. Credentials and initial summary commit together. */
  addVerified(id: string, input: NaiAccountInput, summary?: NaiAccountSummary): NaiAccountProfile {
    const normalized=normalizeNaiAccountInput(input);
    validateAccountProfile(input);
    if (this.document.accounts.some(a => a.id === id)) throw new Error('Duplicate account id');
    if (!accountCipherAvailable(this.cipher)) throw new Error('OS credential encryption unavailable');
    // Recheck at the synchronous write boundary, including concurrent IPC additions.
    this.assertUnique(normalized);
    const token=input.token;
    const profile={label:normalized.label,method:normalized.method,apiBaseUrl:normalized.apiBaseUrl,imageBaseUrl:normalized.imageBaseUrl};
    const account = { ...profile, id, encryptedToken: this.cipher.encryptString(token.trim()).toString('base64'),
      ...(summary ? {accountSummary:stableNaiAccountSummary(summary)} : {}) };
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
    const { encryptedToken: _secret, accountSummary: _summary, ...profile } = account;
    return { snapshot: Object.freeze({ ...profile, token }), release: () => { if (!ended) { ended = true; this.leases--; } } };
  }
}
