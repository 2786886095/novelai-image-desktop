/** Runtime validation is authoritative; opaque observations are never trusted by typing. */
export interface WindowsArtistControllerHash {
  path: string;
  sha256: string;
}
export interface WindowsArtistBindings {
  sourceSha: string;
  profileSha256: string;
  controllerHashes?: readonly WindowsArtistControllerHash[];
}
export interface WindowsArtistPackage {
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly kind: string;
}
export const windowsArtistRuntimeType: 'windows-artist-gpu';
export const windowsArtistScenarioIds: readonly ['model-runtime-lifecycle', 'search-score-selected-generation', 'install-resume-error'];
export const windowsArtistControllerPaths: readonly [
  'scripts/feature-acceptance/run-windows-artist-native.mjs',
  'scripts/feature-acceptance/windows-artist-contract.mjs',
  'scripts/feature-acceptance/windows-artist-journeys.cjs',
];
export const windowsArtistPackages: readonly Readonly<WindowsArtistPackage>[];
export const windowsArtistFullManifestSha256: string;
export const windowsArtistEncoderSha256: string;
export function readWindowsArtistControllerHashes(sourceRoot: string): WindowsArtistControllerHash[];
export function windowsArtistControllerSources(): WindowsArtistControllerHash[];
export function parseWindowsArtistStream(stdout: string): Array<{
  type: 'BEGIN' | 'CHECK' | 'DONE' | 'FAILED';
  value: unknown;
}>;
export function assertWindowsArtistProof(proof: unknown, bindings: WindowsArtistBindings): unknown;
export function windowsArtistScenarioReceipt(proof: unknown, bindings: WindowsArtistBindings): unknown;
