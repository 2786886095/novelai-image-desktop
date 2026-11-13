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
export type NaiRelayProtocol = 'native' | 'models' | 'openai-images';
export type NaiAccountRoute = '/user/data' | '/user/subscription' | '/v1/models';
export function naiAccountRoute(value:unknown):NaiAccountRoute|undefined {
  return value==='/user/data'||value==='/user/subscription'||value==='/v1/models'?value:undefined;
}
export const novelAiRelayV1Base = (base:string) => {
  if(!base.trim())return '';
  const prefix=base.trim().replace(/\/+$/,'').replace(/\/v1\/(?:models|images\/generations)$/,'/v1');
  return prefix.endsWith('/v1')?prefix:prefix+'/v1';
};
export interface NaiAccountProfile {
  id: string; label: string; method: NaiAccountMethod;
  apiBaseUrl: string; imageBaseUrl: string;
  relayProtocol?: NaiRelayProtocol; relayModel?: string;
  /** Backend-only provenance for an unchanged pre-multi-account configuration. */
  legacyConfiguration?: {allowCustomEndpoint:boolean;allowCustomEndpointFallback:boolean};
}
export interface NaiAccountInput extends Omit<NaiAccountProfile, 'id'|'imageBaseUrl'> { token: string; imageBaseUrl?:string }
export function normalizeNaiAccountInput(input:NaiAccountInput):NaiAccountInput & {imageBaseUrl:string} {
  let apiBaseUrl=input.apiBaseUrl.trim();
  if(input.method==='relay'&&(input.relayProtocol==='models'||input.relayProtocol==='openai-images')) apiBaseUrl=novelAiRelayV1Base(apiBaseUrl);
  const imageBaseUrl=input.method==='relay'&&input.relayProtocol==='openai-images'?apiBaseUrl:
    input.imageBaseUrl?.trim() || (input.method==='relay'?(input.relayProtocol==='models'?apiBaseUrl.slice(0,-3):input.apiBaseUrl.trim()):'https://image.novelai.net');
  return {...input,apiBaseUrl,imageBaseUrl,...(typeof input.relayModel==='string'?{relayModel:input.relayModel.trim()}:{})};
}
export function validateAccountProfile(input: NaiAccountInput): void {
  input=normalizeNaiAccountInput(input);
  if (!['token','official-login','relay'].includes(input.method)) throw new Error('Unknown account method');
  if (!input.label.trim() || input.label.length > 120 || !input.token.trim() || input.token.length > 16384 || /[\r\n]/.test(input.token)) throw new Error('Invalid account fields');
  if(input.relayProtocol!==undefined&&(input.method!=='relay'||!['native','models','openai-images'].includes(input.relayProtocol))) throw Error('Invalid relay interface type');
  if(input.relayProtocol==='openai-images') {
    if(typeof input.relayModel!=='string'||!input.relayModel.trim()||input.relayModel.length>256||/[\x00-\x1f\x7f]/.test(input.relayModel)) throw Error('Invalid relay image model');
  } else if(input.relayModel!==undefined) throw Error('Unexpected relay image model');
  for (const [field, official] of [['apiBaseUrl','api.novelai.net'],['imageBaseUrl','image.novelai.net']] as const) {
    const url = new URL(input[field]!);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /\/(?:dashboard|login|sign-in)(?:\/|$)/i.test(url.pathname)) throw new Error('Use an explicit HTTPS API base, not a dashboard/login URL');
    if (input.method !== 'relay' && (url.hostname !== official || url.port !== '' || url.pathname !== '/')) throw new Error('Official credentials require exact official endpoints');
    if (input.method === 'relay' && (url.hostname === 'novelai.net' || url.hostname.endsWith('.novelai.net'))) throw new Error('Relay credentials cannot use official endpoints');
  }
}
export interface NaiAccountValidationResult {
  /** Read-only model access, not proof of a generation envelope or billing. */
  modelIds?: string[]; route?:NaiAccountRoute;
  account?: Omit<AccountSummary,'hasToken'|'accountId'>;ok:boolean;code:'passed'|'auth'|'unsupported'|'network'|'invalid-input'|'invalid-response'|'http';status:number}

/** Exact supported NovelAI identities only; arbitrary provider/model aliases are not inferred. */
export const NAI_RELAY_MODEL_IDS = [
  'nai-diffusion-5-full','nai-diffusion-5-curated',
  'nai-diffusion-4-5-full','nai-diffusion-4-5-curated',
  'nai-diffusion-4-full','nai-diffusion-4-curated','nai-diffusion-3','nai-diffusion-furry-3',
  'nai-diffusion-5-full-inpainting','nai-diffusion-5-curated-inpainting',
  'nai-diffusion-4-5-full-inpainting','nai-diffusion-4-5-curated-inpainting',
  'nai-diffusion-4-full-inpainting','nai-diffusion-4-curated-inpainting','nai-diffusion-3-inpainting',
] as const;
export function relayModelIds(data:unknown):string[]|undefined {
  if(!data||typeof data!=='object'||Array.isArray(data))return undefined;
  const body=data as Record<string,unknown>;
  if(body.object!=='list'||!Array.isArray(body.data)||body.data.length>10000||body.success===false||(body.error!==undefined&&body.error!==null))return undefined;
  if(!body.data.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&typeof row.id==='string'&&row.id.length<=256))return undefined;
  return [...new Set(body.data.map(row=>row.id as string))];
}
export function novelAiRelayModelIds(data:unknown):string[]|undefined {
  const allowed=new Set<string>(NAI_RELAY_MODEL_IDS);
  return relayModelIds(data)?.filter(id=>allowed.has(id));
}
/** Retains an explicitly entered prefix; does not append /v1 twice or replace the origin. */
export function novelAiRelayModelsUrl(base:string):string {
  const prefix=base.replace(/\/+$/,'');
  return prefix+(prefix.endsWith('/v1')?'/models':'/v1/models');
}
export interface NaiAccountsBridge {
  relayImportStatus?:()=>Promise<import('../electron/ipc/relay-account-import').RelayImportNotice|undefined>;
  onRelayImportNotice?:(callback:(notice:import('../electron/ipc/relay-account-import').RelayImportNotice)=>void)=>()=>void;
  list(): Promise<NaiAccountProfile[]>;
  add(input: NaiAccountInput): Promise<NaiAccountProfile>;
  remove(id: string): Promise<void>;
  reveal(id:string):Promise<string>;
  state(): Promise<{ selectedId?: string; busy: boolean; migrationIssue?:string }>;
  select(id?: string): Promise<{ selectedId?: string }>;
  login(input: {label:string;email:string;password:string;otp?:string}): Promise<{ok:true;account:NaiAccountProfile} | {ok:false;code:string;status?:number;message:string;validation?:NaiAccountValidationResult}>;
  migrate(): Promise<{ migrated: boolean; message: string }>;
  probe(id: string): Promise<{ ok?:boolean;code?:NaiAccountValidationResult['code'];status: number; route?:NaiAccountRoute; subscription: 'skipped' | 'available'; protocol: 'unverified'; message: string }>;
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
