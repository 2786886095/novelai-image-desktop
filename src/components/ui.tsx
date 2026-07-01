// Shared presentational primitives used across the app's panels.
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Icon } from "./icons";

export function Button({
  children,
  variant = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button className={clsx("btn", `btn-${variant}`, className)} {...props}>
      {children}
    </button>
  );
}

export function IconText({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="icon-text">
      <span className="btn-icon" aria-hidden="true">{icon}</span>
      <span>{children}</span>
    </span>
  );
}

export function AppPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return <>{children}</>;
  return createPortal(children, document.body);
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="toggle-card">
      <span className="toggle-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className={clsx("toggle", checked && "toggle-on")}>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span />
      </span>
    </label>
  );
}

export function SecretInput({
  label,
  showLabel = "Show",
  hideLabel = "Hide",
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  showLabel?: string;
  hideLabel?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className={clsx("field", className)}>
      <span>{label}</span>
      <span className="secret-field">
        <input type={visible ? "text" : "password"} {...props} />
        <button
          type="button"
          className="secret-field-toggle"
          tabIndex={-1}
          aria-label={visible ? hideLabel : showLabel}
          onClick={() => setVisible((value) => !value)}
        >
          <Icon name={visible ? "eye" : "eyeOff"} />
        </button>
      </span>
    </label>
  );
}

export function NumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function SliderInput({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider-field">
      <span>
        {label}
        <strong>{value}</strong>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
