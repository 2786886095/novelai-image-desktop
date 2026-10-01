import type { AccountSummary } from './types';
export function naiAccountSummaryMatches(summary:AccountSummary,id?:string){return summary.accountId===id;}
export type NaiAccountMethod = 'token' | 'official-login' | 'relay';
export const NAI_ACCOUNT_METHODS: readonly NaiAccountMethod[]=['token','official-login','relay'];
export function naiAccountTabKey(method:NaiAccountMethod,key:string):NaiAccountMethod {
  const index=NAI_ACCOUNT_METHODS.indexOf(method);
  if(key==='Home') return NAI_ACCOUNT_METHODS[0];
  if(key==='End') return NAI_ACCOUNT_METHODS[2];
  if(key==='ArrowRight') return NAI_ACCOUNT_METHODS[(index+1)%3];
  if(key==='ArrowLeft') return NAI_ACCOUNT_METHODS[(index+2)%3];
  return method;
}
export interface NaiAccountProfile {
  id: string; label: string; method: NaiAccountMethod;
  apiBaseUrl: string; imageBaseUrl: string;
  /** Backend-only provenance for an unchanged pre-multi-account configuration. */
  legacyConfiguration?: {allowCustomEndpoint:boolean;allowCustomEndpointFallback:boolean};
}
export interface NaiAccountInput extends Omit<NaiAccountProfile, 'id'|'imageBaseUrl'> { token: string; imageBaseUrl?:string }
export function normalizeNaiAccountInput(input:NaiAccountInput):NaiAccountInput & {imageBaseUrl:string} {
  return {...input,apiBaseUrl:input.apiBaseUrl.trim(),imageBaseUrl:input.imageBaseUrl?.trim() || (input.method==='relay'?input.apiBaseUrl.trim():'https://image.novelai.net')};
}
export function validateAccountProfile(input: NaiAccountInput): void {
  input=normalizeNaiAccountInput(input);
  if (!['token','official-login','relay'].includes(input.method)) throw new Error('Unknown account method');
  if (!input.label.trim() || input.label.length > 120 || !input.token.trim() || input.token.length > 16384 || /[\r\n]/.test(input.token)) throw new Error('Invalid account fields');
  for (const [field, official] of [['apiBaseUrl','api.novelai.net'],['imageBaseUrl','image.novelai.net']] as const) {
    const url = new URL(input[field]!);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /\/(?:dashboard|login|sign-in)(?:\/|$)/i.test(url.pathname)) throw new Error('Use an explicit HTTPS API base, not a dashboard/login URL');
    if (input.method !== 'relay' && (url.hostname !== official || url.port !== '' || url.pathname !== '/')) throw new Error('Official credentials require exact official endpoints');
    if (input.method === 'relay' && (url.hostname === 'novelai.net' || url.hostname.endsWith('.novelai.net'))) throw new Error('Relay credentials cannot use official endpoints');
  }
}
export interface NaiAccountValidationResult {
  account?: Omit<AccountSummary,'hasToken'|'accountId'>;ok:boolean;code:'passed'|'auth'|'unsupported'|'network'|'invalid-input'|'invalid-response'|'http';status:number}
export interface NaiAccountsBridge {
  list(): Promise<NaiAccountProfile[]>;
  add(input: NaiAccountInput): Promise<NaiAccountProfile>;
  remove(id: string): Promise<void>;
  reveal(id:string):Promise<string>;
  state(): Promise<{ selectedId?: string; busy: boolean; migrationIssue?:string }>;
  select(id?: string): Promise<{ selectedId?: string }>;
  login(input: {label:string;email:string;password:string;otp?:string}): Promise<{ok:true;account:NaiAccountProfile} | {ok:false;code:string;message:string;validation?:NaiAccountValidationResult}>;
  migrate(): Promise<{ migrated: boolean; message: string }>;
  probe(id: string): Promise<{ ok?:boolean;code?:NaiAccountValidationResult['code'];status: number; subscription: 'skipped' | 'available'; protocol: 'unverified'; message: string }>;
}
export function nextNaiAccountLabel(accounts:ReadonlyArray<Pick<NaiAccountProfile,'label'>>):string {
  let n=1;const names=new Set(accounts.map(a=>a.label));while(names.has('用户'+n))n++;return '用户'+n;
}
/** Explicit relay profile only: dashboard normalization is not protocol discovery. */
export function relayDashboardOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use HTTPS');
  return url.origin;
}
