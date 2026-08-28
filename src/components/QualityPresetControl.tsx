import clsx from "clsx";
import { desktopUiText } from "../i18n";
import {
  isNAIV5Model,
  type QualityPreset,
} from "../types";
import { Icon } from "./icons";

function splitLocalizedLabel(label: string) {
  const match = label.match(/^(.+?)[（(]([^）)]+)[）)]$/);
  return match
    ? { primary: match[1].trim(), secondary: match[2].trim() }
    : { primary: label, secondary: "" };
}

export function QualityPresetControl({
  language,
  model,
  value,
  transparentBackground,
  onChange,
  onTransparentChange,
  className,
  compact = false,
}: {
  language: unknown;
  model: string;
  value: QualityPreset;
  transparentBackground: boolean;
  onChange: (value: QualityPreset) => void;
  onTransparentChange: (value: boolean) => void;
  className?: string;
  compact?: boolean;
}) {
  const t = (key: string) => desktopUiText(language, key);
  const v5 = isNAIV5Model(model);
  const selected = !v5 && value === "light" ? "standard" : value;
  const options: Array<{
    value: QualityPreset;
    label: string;
    fullLabel: string;
    description: string;
    disabled?: boolean;
  }> = [
    {
      value: "standard",
      label: t("quality.standardShort"),
      fullLabel: t("quality.standardLabel"),
      description: t("quality.standardDesc"),
    },
    {
      value: "light",
      label: t("quality.lightShort"),
      fullLabel: t("quality.lightLabel"),
      description: t("quality.lightDesc"),
      disabled: !v5,
    },
    {
      value: "none",
      label: t("quality.noneShort"),
      fullLabel: t("quality.noneLabel"),
      description: t("quality.noneDesc"),
    },
  ];
  const heading = splitLocalizedLabel(t("quality.label"));

  return (
    <div className={clsx("quality-preset-control", compact && "compact", className)}>
      <div className="quality-preset-heading">
        <span className="quality-preset-title">
          <span>{heading.primary}</span>
          {heading.secondary && <small>{heading.secondary}</small>}
        </span>
        {v5 && (
          <button
            type="button"
            className={clsx(
              "quality-transparent-chip",
              transparentBackground && "active",
            )}
            aria-pressed={transparentBackground}
            title={t("quality.transparentDesc")}
            onClick={() => onTransparentChange(!transparentBackground)}
          >
            <Icon name={transparentBackground ? "check" : "close"} />
            {t("quality.transparent")}
          </button>
        )}
      </div>
      <div
        className="quality-preset-segments"
        role="radiogroup"
        aria-label={t("quality.label")}
      >
        {options.map((option) => {
          const isSelected = option.value === selected;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={clsx(isSelected && "active")}
              disabled={option.disabled}
              title={option.disabled
                ? `${option.fullLabel} · ${t("quality.v5Only")}`
                : `${option.fullLabel}：${option.description}`}
              onClick={() => onChange(option.value)}
            >
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      <small className="quality-preset-explanation">
        {selected === "none"
          ? t("quality.noneDesc")
          : t("quality.comparisonHint")}
      </small>
    </div>
  );
}
