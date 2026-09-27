/** A listening HTTP server is not proof that its required plugins booted. */
export function isHarnessBootFailure(line: string) {
  return /\b(?:[1-9]\d* entries did not activate|failed to load plugins|parameter codec has no create\(\) factory|strict codec has no create\(\) factory|AggregateError:|Error:|FATAL\b)/i.test(line)
    || /Roleplay .*不兼容/.test(line);
}
