import type { ComfyLocalConfig, ComfyResponse } from './contract';

/** Paths are observations only. All path selection and execution belongs to main. */
export interface ComfyEnvironmentCandidate {
  id: string;
  label: string;
  root: string;
  python: string;
  layout: 'aki' | 'portable' | 'venv' | 'source';
  modelDirectory: string | null;
  reason: 'static-layout-detected' | 'python-not-found';
  warnings: string[];
  sourceRoot: string;
  /** Main-owned provenance; every adoption still requires explicit confirmation. */
  source?: 'configured' | 'discovered' | 'managed';
  isCurrent?: boolean;
  pythonArgs?: string[];
}
export interface ComfyDiscoveryResult {
  environments: ComfyEnvironmentCandidate[];
  warnings: string[];
  examinedEntries: number;
  truncated: boolean;
  current?: ComfyEnvironmentCandidate | null;
  /** Distinct interpreters for the same source are choices, never auto-replacements. */
  conflict?: boolean;
}
export interface ComfySetupPackage {
  id: string;
  name: string;
  bytes: number;
  sha256: string;
  officialHash: null;
  source: 'user-import';
}
export interface ComfyManagedEnvironment {
  id: string;
  root: string;
  python: string;
  launcherPath: string;
  launcherSha256: string;
  modelDirectory: string | null;
  createdAt: string;
}
export type ComfySetupPhase = 'idle' | 'hashing' | 'preflight' | 'extracting' | 'validating' | 'completed' | 'cancelled' | 'failed';
export interface ComfySetupState {
  supported: boolean;
  defaultRoot: string;
  selectedRoot: string;
  rootsChecked: string[];
  discovery: ComfyDiscoveryResult | null;
  package: ComfySetupPackage | null;
  phase: ComfySetupPhase;
  jobId: string | null;
  message: string | null;
  progress: { completed: number; total: number; unit: 'bytes' | 'entries' } | null;
  environments: ComfyManagedEnvironment[];
  installed: ComfyManagedEnvironment | null;
  shortcutPath: string | null;
}
export const COMFY_SETUP_IPC = {
  getState: 'comfyui-setup:getState',
  discover: 'comfyui-setup:discover',
  chooseDiscoveryRoot: 'comfyui-setup:chooseDiscoveryRoot',
  adoptCandidate: 'comfyui-setup:adoptCandidate',
  openOfficialPage: 'comfyui-setup:openOfficialPage',
  chooseTargetDirectory: 'comfyui-setup:chooseTargetDirectory',
  chooseArchive: 'comfyui-setup:chooseArchive',
  install: 'comfyui-setup:install',
  cancel: 'comfyui-setup:cancel',
  createShortcut: 'comfyui-setup:createShortcut',
  event: 'comfyui-setup:event',
} as const;
export interface ComfySetupApi {
  getState(): Promise<ComfyResponse<ComfySetupState>>;
  discover(): Promise<ComfyResponse<ComfySetupState>>;
  chooseDiscoveryRoot(): Promise<ComfyResponse<ComfySetupState>>;
  adoptCandidate(id: string, confirmExecution: boolean): Promise<ComfyResponse<ComfyLocalConfig>>;
  openOfficialPage(): Promise<ComfyResponse<void>>;
  chooseTargetDirectory(): Promise<ComfyResponse<ComfySetupState>>;
  chooseArchive(): Promise<ComfyResponse<ComfySetupState>>;
  install(options: { acknowledgeUnverifiedSource: boolean }): Promise<ComfyResponse<ComfySetupState>>;
  cancel(): Promise<ComfyResponse<ComfySetupState>>;
  createShortcut(environmentId: string): Promise<ComfyResponse<ComfySetupState>>;
  onEvent(listener: (state: ComfySetupState) => void): () => void;
}
