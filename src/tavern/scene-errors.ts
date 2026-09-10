import labels from '../../shared/tavern-scene-ui.json';

export function sceneUiText(language: unknown) {
  return labels[language as keyof typeof labels] ?? labels['en-US'];
}

/** Translate at the display boundary; persisted error codes remain diagnosable. */
export function sceneErrorMessage(error: unknown, language: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const code = message.match(/\bSCENE_(?:REQUIRED|STALE|LOCKED|REBIND|OPERATION|INVALID|MODEL_CAPACITY|LAST_CHARACTER)\b/)?.[0];
  const text = sceneUiText(language);
  return code && code in text.errors ? text.errors[code as keyof typeof text.errors] : message;
}
