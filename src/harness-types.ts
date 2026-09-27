export type HarnessPhase = 'stopped' | 'installing' | 'starting' | 'running' | 'stopping' | 'updating' | 'error';
export interface HarnessLog { id: number; time: string; level: 'info' | 'warn' | 'error'; text: string }
export interface HarnessSnapshot {
  phase: HarnessPhase;
  version: string | null;
  installedUpstream?: string | null;
  logs: HarnessLog[];
  dataDirectory: string;
  updateInfo?: {checkedAt:string;component:string|null;official:string|null;plugins:Record<string,string>;errors:string[];componentFailed?:boolean;officialFailed?:boolean;bundledComponent?:string;bundledUpdate?:boolean} | null;
  checkingUpdates?: boolean;
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
}
