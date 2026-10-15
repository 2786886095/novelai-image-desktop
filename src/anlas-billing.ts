import type { AnlasQuoteResult } from "./types";
import { desktopUiText, desktopUiFormat } from "./i18n";
export interface ScopedAnlasQuote { key: string; quote: AnlasQuoteResult }
export function visibleAnlasQuote(state: ScopedAnlasQuote | null, currentKey: string, accountId?: string): AnlasQuoteResult | null {
  if (!state || state.key !== currentKey || (accountId !== undefined && state.quote.accountId !== accountId)) return null;
  return state.quote;
}
export function anlasBillingDisplay({ quote, language, loading = false }: { quote: AnlasQuoteResult | null; language?: unknown; loading?: boolean }) {
  const t = (key: string) => desktopUiText(language, key);
  const f = (key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values);
  const isReferenceOnly = quote?.billingContext === "independent-relay";
  const isEstimate = quote?.source === "estimate-formula" || quote?.source === "estimate-fixed";
  const reasonKeys: Record<string, string> = { "missing-token": "cost.configureToken", "missing-image": "cost.loadImageFirst", "missing-params": "cost.invalidParams", "image-too-large": "cost.imageTooLarge" };
  const sourceLabel = isReferenceOnly ? t("cost.relaySource") : quote?.source === "official-api" ? t("cost.official") : quote?.source === "estimate-formula" ? t("cost.estimateFormula") : quote?.source === "estimate-fixed" ? t("cost.estimateFixed") : "";
  const primary = quote?.ok && typeof quote.amount === "number"
    ? isReferenceOnly ? t("cost.relayUnknown") : isEstimate ? f("cost.estimated", { amount: quote.amount }) : f("cost.preQuote", { amount: quote.amount })
    : loading ? t("cost.loading") : t(reasonKeys[quote?.reason ?? ""] ?? "cost.unavailable");
  const referenceKnown = quote?.ok && typeof quote.referenceAmount === "number" && Number.isFinite(quote.referenceAmount);
  const secondary = referenceKnown ? f(isReferenceOnly ? "cost.relayReference" : "cost.officialReference", { amount: quote.referenceAmount }) + (isReferenceOnly ? " · " + t("cost.relayNoOpus") : "") : "";
  return { title: t("cost.previewTitle"), sourceLabel, primary, secondary, isReferenceOnly, isEstimate };
}
