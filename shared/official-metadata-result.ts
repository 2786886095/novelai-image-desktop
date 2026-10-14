/** Non-enumerable provenance: app mapping wrappers must not appear as original fields. */
export const OFFICIAL_METADATA_ORIGINAL = Symbol("langbai.official-metadata-original");
export type OfficialRecoveryMetadata = Record<string, string> & {
  [OFFICIAL_METADATA_ORIGINAL]?: Record<string, unknown>;
};
export function originalOfficialMetadata(metadata: Record<string, string>): Record<string, unknown> | undefined {
  return (metadata as OfficialRecoveryMetadata)[OFFICIAL_METADATA_ORIGINAL];
}
