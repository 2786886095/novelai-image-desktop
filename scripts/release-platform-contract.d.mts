export const releasePlatforms: readonly string[];
export const releaseFeatures: readonly string[];
export function assertReleasePlatformContract(
  report: unknown,
  options: {version: string; sourceSha: string},
): {platforms: number; features: number};
export function assertReleaseEvidenceFiles(report: unknown, evidenceRoot: string): void;

export const releaseScopeId: 'artist-iteration-windows-only/v1';
export const artistIterationScenarios: readonly string[];
export function releaseFeatureApplicability(feature: string, platform: string): 'required' | 'not-supported';
export const releaseScopeSha256: string;
export const releaseScopeCounts: Readonly<{declaredSlots: 195; requiredSlots: 191; notSupportedSlots: 4}>;
