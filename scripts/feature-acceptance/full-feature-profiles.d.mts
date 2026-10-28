export interface FullFeatureProfile {
  readonly feature: string;
  readonly scenarios: readonly string[];
  readonly acceptance: string;
}
export const fullFeatureProfiles: Readonly<Record<string, Readonly<FullFeatureProfile>>>;
export const profileSha256: string;
export const releaseFeatures: readonly string[];
export const releasePlatforms: readonly string[];
export const supportedPlatforms: readonly string[];
export interface ScenarioReceiptBindings {
  sourceSha?: string;
  platform?: string;
  windowsArtistProof?: unknown;
}
/** Checks source/runtime/proof/scenario semantics; callers must not infer native execution from types. */
export function assertScenarioReceipt(receipt: unknown, options?: ScenarioReceiptBindings): unknown;
