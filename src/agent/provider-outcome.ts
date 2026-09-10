import labels from "../../shared/provider-outcome-ui.json";
export type ProviderIssue = "limit" | "empty" | "incomplete" | "failed";
export function providerIssueMessage(language: string | undefined, issue: ProviderIssue) {
  return (labels[language as keyof typeof labels] ?? labels["zh-CN"])[issue];
}
export function responseIssue(payload: Record<string, unknown>): ProviderIssue | undefined {
  if (payload.status === "failed" || payload.error) return "failed";
  if (payload.status !== "incomplete") return undefined;
  const details = payload.incomplete_details as {reason?: string} | undefined;
  return details?.reason === "max_output_tokens" ? "limit" : "incomplete";
}
