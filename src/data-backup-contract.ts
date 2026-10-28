/** One desktop contract: renderer selection and archive sanitizer share this list. */
export const DATA_BACKUP_CATEGORIES = [
  "configuration", "apiCredentials", "styleLab",
  "artistLibrary", "textHistory", "referencePresets",
  "imageHistory", "promptPresets", "workspaceData",
] as const;
