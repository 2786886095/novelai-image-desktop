export const releasePlatforms: readonly string[];
export const releaseFeatures: readonly string[];
export function assertReleasePlatformContract(
  report: unknown,
  options: {version: string; sourceSha: string},
): {platforms: number; features: number};
export function assertReleaseEvidenceFiles(report: unknown, evidenceRoot: string): void;
