/** One desktop contract: renderer selection and archive sanitizer share this list.
 * Native profiles may contain plugin credentials; they are explicitly labelled
 * rather than silently coupled to the application's unrelated API settings. */
export const DATA_BACKUP_CATEGORIES = [
  "configuration", "apiCredentials", "tavernAgent", "styleLab",
  "agentWorkspace", "artistLibrary", "textHistory", "referencePresets",
  "imageHistory", "promptPresets", "workspaceData",
] as const;
export const NATIVE_BACKUP_CATEGORIES = ["tavernAgent", "styleLab"] as const;
