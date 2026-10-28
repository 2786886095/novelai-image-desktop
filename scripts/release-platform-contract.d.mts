export const supportedPlatforms: readonly string[];
export const releasePlatforms: readonly string[];
export const releaseExcludedPlatforms: readonly string[];
export const releaseFeatures: readonly string[];
export function assertReleasePlatformContract(
  report: unknown,
  options: {version: string; sourceSha: string},
): {platforms: number; features: number};
export function assertReleaseEvidenceFiles(report: unknown, evidenceRoot: string): void;

export const releaseScopeId: 'desktop-windows-local-capabilities/v5';
export const artistIterationScenarios: readonly string[];
export function releaseFeatureApplicability(feature: string, platform: string): 'required' | 'not-supported';
export const releaseScopeSha256: string;
export const releaseScopeCounts: Readonly<{declaredSlots: 72; requiredSlots: 71; notSupportedSlots: 1}>;
