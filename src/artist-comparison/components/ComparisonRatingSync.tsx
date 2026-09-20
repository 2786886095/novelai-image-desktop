import { useEffect, useMemo, useState } from "react";
import type { ComparisonStrings } from "../strings";
import type { RatingLevel } from "../model";
import { Button, SelectMenuCompat } from "../../components/ui";

const UNRATED_VALUE = "__comparison_unrated__";

export interface ComparisonRatingSyncProps {
  text: ComparisonStrings;
  legacyRatings: RatingLevel[];
  levels: RatingLevel[];
  busy: boolean;
  onSync: (mapping: Record<string, string | null>) => void;
}

function optionValue(ratingId: string | null | undefined) {
  if (ratingId === undefined) return "";
  if (ratingId === null) return UNRATED_VALUE;
  return `level:${ratingId}`;
}

function parseOption(value: string): string | null | undefined {
  if (!value) return undefined;
  if (value === UNRATED_VALUE) return null;
  return value.startsWith("level:") ? value.slice("level:".length) : undefined;
}

export function ComparisonRatingSyncPanel({ text, legacyRatings, levels, busy, onSync }: ComparisonRatingSyncProps) {
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [error, setError] = useState("");
  const legacySignature = useMemo(() => legacyRatings.map((level) => level.id).join("\u001f"), [legacyRatings]);

  useEffect(() => {
    setMapping({});
    setError("");
  }, [legacySignature]);

  if (legacyRatings.length === 0) return null;
  const complete = legacyRatings.every((level) => Object.prototype.hasOwnProperty.call(mapping, level.id));
  const confirm = () => {
    if (!complete) {
      setError(text.syncRatingsRequired);
      return;
    }
    setError("");
    onSync({ ...mapping });
  };

  return <section className="comparison-rating-sync" aria-label={text.legacyRatingsTitle}>
    <div className="comparison-section-heading"><div><h3>{text.legacyRatingsTitle}</h3><p>{text.legacyRatingsHint}</p></div><span className="comparison-rating-sync-count">{legacyRatings.length}</span></div>
    <div className="comparison-rating-sync-list">{legacyRatings.map((legacy) => <label className="comparison-rating-sync-row" key={legacy.id}>
      <span className="comparison-rating-sync-old"><i style={{ background: legacy.color }} />{legacy.label}</span>
      <SelectMenuCompat value={optionValue(mapping[legacy.id])} aria-label={`${text.legacyRatingMap}: ${legacy.label}`} onChange={(event) => {
        const value = parseOption(event.target.value);
        setMapping((current) => {
          const next = { ...current };
          if (value === undefined) delete next[legacy.id];
          else next[legacy.id] = value;
          return next;
        });
        setError("");
      }}>
        <option value="">{text.chooseRatingMapping}</option>
        {levels.map((level) => <option key={level.id} value={optionValue(level.id)}>{level.label}</option>)}
        <option value={UNRATED_VALUE}>{text.mapToUnrated}</option>
      </SelectMenuCompat>
    </label>)}</div>
    {error && <p className="comparison-field-error" role="alert">{error}</p>}
    <Button variant="primary" disabled={busy || !complete} onClick={confirm}>{text.syncRatings}</Button>
  </section>;
}
