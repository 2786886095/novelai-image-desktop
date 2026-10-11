export type HarnessPhase = 'stopped' | 'installing' | 'starting' | 'running' | 'stopping' | 'updating' | 'error';
export interface HarnessLog { id: number; time: string; level: 'info' | 'warn' | 'error'; text: string }
export interface HarnessPluginChoice {name:string;fromVersion:string;version?:string;description?:string;reason:string;canDisable:boolean;incompatible?:boolean;checkError?:boolean}
export interface HarnessSnapshot {
  pluginAuto?:HarnessPluginAutoState;
  disabledPlugins?:string[];
  phase: HarnessPhase;
  version: string | null;
  installedUpstream?: string | null;
  logs: HarnessLog[];
  dataDirectory: string;
  updateInfo?: {checkedAt:string;component:string|null;official:string|null;plugins:Record<string,string>;errors:string[];componentFailed?:boolean;officialFailed?:boolean;bundledComponent?:string;bundledUpdate?:boolean} | null;
  checkingUpdates?: boolean;
  componentOperation?: {id:string;action:string;state:string;message:string;updatedAt:string}|null;
}

export interface HarnessUpdateProposal {
  status: 'ready' | 'current' | 'blocked';
  kind: 'component' | 'official';
  message: string;
  token?: string;
  version?: string;
  upstream?: string;
  fromVersion?: string;
  fromUpstream?: string;
  pluginUpdates?: Array<HarnessPluginChoice & {action?:'upgrade'|'disable'}>;
}

export interface HarnessPluginAutoState {
 phase:'idle'|'paused'|'checking'|'waiting'|'updating'|'updated'|'current'|'blocked'|'error';
 message:string;enabled?:boolean;checkedAt?:string;
 plugins:Array<Pick<HarnessPluginChoice,'name'|'fromVersion'|'version'|'reason'|'incompatible'|'checkError'>>;
}
