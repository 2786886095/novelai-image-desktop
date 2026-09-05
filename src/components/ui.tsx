// Shared presentational primitives used across the app's panels.
import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import gsap from "gsap";
import { Icon, iconNameForLegacyGlyph, isIconName } from "./icons";

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
  const normalizedIcon = typeof icon === "string"
    ? (() => {
        const iconName = isIconName(icon) ? icon : iconNameForLegacyGlyph(icon);
        return iconName ? <Icon name={iconName} /> : icon;
      })()
    : icon;
  return (
    <span className="icon-text">
      <span className="btn-icon" aria-hidden="true">{normalizedIcon}</span>
      <span>{children}</span>
    </span>
  );
}

export function AppPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return <>{children}</>;
  return createPortal(children, document.body);
}

export type SelectMenuOption = { value: string; label: string; disabled?: boolean };

export function findTypeaheadOptionIndex(
  options: SelectMenuOption[],
  query: string,
  startIndex: number,
) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle || options.length === 0) return -1;
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (Math.max(-1, startIndex) + offset) % options.length;
    const option = options[index];
    if (!option.disabled && option.label.trim().toLocaleLowerCase().startsWith(needle)) return index;
  }
  return -1;
}

function optionText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(optionText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return optionText(node.props.children);
  return String(node);
}

function collectSelectOptions(children: ReactNode, inheritedDisabled = false): SelectMenuOption[] {
  const options: SelectMenuOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) {
      options.push(...collectSelectOptions((child.props as { children?: ReactNode }).children, inheritedDisabled));
      return;
    }
    if (child.type === "optgroup") {
      const props = child.props as { children?: ReactNode; disabled?: boolean };
      options.push(...collectSelectOptions(props.children, inheritedDisabled || Boolean(props.disabled)));
      return;
    }
    if (child.type !== "option") return;
    const props = (child as ReactElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>).props;
    const label = optionText(props.children).trim();
    options.push({
      value: String(props.value ?? label),
      label,
      disabled: inheritedDisabled || Boolean(props.disabled),
    });
  });
  return options;
}

export function SelectMenu({
  value,
  options,
  onChange,
  label,
  ariaLabel,
  className,
  disabled = false,
  defaultOpen = false,
  id,
}: {
  value: string;
  options: SelectMenuOption[];
  onChange: (value: string) => void;
  label?: ReactNode;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  /** Deterministic open state for visual-regression captures; normal product use leaves this false. */
  defaultOpen?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const menuId = `${id ?? `select-menu-${generatedId.replace(/:/g, "")}`}-listbox`;
  const [open, setOpen] = useState(defaultOpen);
  const [renderMenu, setRenderMenu] = useState(defaultOpen);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 220, maxHeight: 320 });
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const firstEnabledIndex = options.findIndex((option) => !option.disabled);
  const pendingActiveIndexRef = useRef<number | null>(null);
  const typeaheadBufferRef = useRef("");
  const typeaheadResetRef = useRef<number | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportGap = 8;
    const gap = 6;
    const width = Math.min(Math.max(rect.width, 220), window.innerWidth - viewportGap * 2);
    const estimatedHeight = Math.min(320, options.length * 44 + 8);
    const below = window.innerHeight - rect.bottom - viewportGap;
    const above = rect.top - viewportGap;
    const opensUp = below < Math.min(200, estimatedHeight) && above > below;
    const maxHeight = Math.max(132, Math.min(320, opensUp ? above - gap : below - gap));
    const left = Math.min(Math.max(viewportGap, rect.left), window.innerWidth - width - viewportGap);
    const top = opensUp ? Math.max(viewportGap, rect.top - Math.min(estimatedHeight, maxHeight) - gap) : rect.bottom + gap;
    setPosition({ left, top, width, maxHeight });
  }, [options.length]);

  useEffect(() => {
    if (open) setRenderMenu(true);
  }, [open]);

  useLayoutEffect(() => {
    if (open && renderMenu) updatePosition();
  }, [open, renderMenu, updatePosition]);

  useEffect(() => {
    if (!open || !renderMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setRenderMenu(false);
    };
    const onViewportChange = () => updatePosition();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, renderMenu, updatePosition]);

  useLayoutEffect(() => {
    if (!renderMenu || !menuRef.current) return;
    const reduced = document.documentElement.classList.contains("motion-reduced");
    if (reduced) {
      if (!open) setRenderMenu(false);
      return;
    }
    const animation = open
      ? gsap.fromTo(menuRef.current, { autoAlpha: 0, y: -6, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.16, ease: "power2.out", clearProps: "transform,opacity,visibility" })
      : gsap.to(menuRef.current, { autoAlpha: 0, y: -4, scale: 0.99, duration: 0.12, ease: "power1.in", onComplete: () => setRenderMenu(false) });
    return () => { animation.kill(); };
  }, [open, renderMenu]);

  useEffect(() => {
    if (!open || !renderMenu) return;
    const nextIndex = pendingActiveIndexRef.current ?? (selectedIndex >= 0 ? selectedIndex : firstEnabledIndex);
    pendingActiveIndexRef.current = null;
    if (nextIndex < 0) return;
    setActiveIndex(nextIndex);
    const frame = requestAnimationFrame(() => {
      const option = menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]")[nextIndex];
      option?.focus();
      option?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [firstEnabledIndex, open, renderMenu, selectedIndex]);

  useEffect(() => () => {
    if (typeaheadResetRef.current != null) window.clearTimeout(typeaheadResetRef.current);
  }, []);

  const enabledIndexes = useMemo(
    () => options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0),
    [options],
  );
  const move = (direction: 1 | -1) => {
    if (!enabledIndexes.length) return;
    const current = Math.max(0, enabledIndexes.indexOf(activeIndex));
    const next = enabledIndexes[(current + direction + enabledIndexes.length) % enabledIndexes.length];
    setActiveIndex(next);
    menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]")[next]?.focus();
  };
  const choose = (option: SelectMenuOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const typeahead = (key: string, openAfterMatch: boolean) => {
    const normalizedKey = key.toLocaleLowerCase();
    const previous = typeaheadBufferRef.current;
    const repeatedKey = previous.length > 0 && [...previous].every((character) => character === normalizedKey);
    let query = repeatedKey ? normalizedKey : `${previous}${normalizedKey}`;
    let nextIndex = findTypeaheadOptionIndex(options, query, activeIndex);
    if (nextIndex < 0 && query.length > 1) {
      query = normalizedKey;
      nextIndex = findTypeaheadOptionIndex(options, query, activeIndex);
    }
    typeaheadBufferRef.current = query;
    if (typeaheadResetRef.current != null) window.clearTimeout(typeaheadResetRef.current);
    typeaheadResetRef.current = window.setTimeout(() => { typeaheadBufferRef.current = ""; }, 700);
    if (nextIndex < 0) return;
    setActiveIndex(nextIndex);
    if (openAfterMatch && !open) {
      updatePosition();
      pendingActiveIndexRef.current = nextIndex;
      setOpen(true);
      return;
    }
    const option = menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]")[nextIndex];
    option?.focus();
    option?.scrollIntoView({ block: "nearest" });
  };
  const accessibleLabel = selected?.label ? `${ariaLabel}: ${selected.label}` : ariaLabel;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={clsx("select-menu-trigger", className)}
        aria-label={accessibleLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => {
          if (open) {
            setOpen(false);
            requestAnimationFrame(() => triggerRef.current?.focus());
          } else {
            updatePosition();
            setOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Tab" && open) {
            setOpen(false);
            setRenderMenu(false);
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            updatePosition();
            setOpen(true);
          } else if (event.key.length === 1 && event.key !== " " && !event.altKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            typeahead(event.key, true);
          }
        }}
      >
        {label != null && <span className="select-menu-label">{label}</span>}
        <strong className="select-menu-value">{selected?.label ?? ""}</strong>
        <Icon name="chevronDown" className={clsx("select-menu-chevron", open && "open")} />
      </button>
      {renderMenu && <AppPortal><div
        ref={menuRef}
        id={menuId}
        className="select-menu-popover"
        role="listbox"
        aria-label={ariaLabel}
        style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            setOpen(false);
            setRenderMenu(false);
          }
          else if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
          else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
          else if (event.key === "Home") {
            event.preventDefault();
            const next = enabledIndexes[0] ?? 0;
            setActiveIndex(next);
            menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]")[next]?.focus();
          }
          else if (event.key === "End") {
            event.preventDefault();
            const next = enabledIndexes.at(-1) ?? 0;
            setActiveIndex(next);
            menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]")[next]?.focus();
          }
          else if (event.key === "Escape") { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
          else if (event.key.length === 1 && event.key !== " " && !event.altKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            typeahead(event.key, false);
          }
        }}
      >
        {options.map((option, index) => <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={option.value === value}
          className={clsx("select-menu-option", option.value === value && "selected")}
          disabled={option.disabled}
          tabIndex={index === activeIndex ? 0 : -1}
          onFocus={() => setActiveIndex(index)}
          onClick={() => choose(option)}
        >
          <span>{option.label}</span>
          {option.value === value && <Icon name="check" />}
        </button>)}
      </div></AppPortal>}
    </>
  );
}

/**
 * Migration adapter for former native selects. It intentionally renders the
 * shared SelectMenu and only preserves the familiar option/onChange authoring
 * shape, so feature panels cannot silently fall back to browser-native UI.
 */
export function SelectMenuCompat({
  value,
  defaultValue,
  children,
  onChange,
  disabled,
  className,
  name,
  title,
  "aria-label": ariaLabel,
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "defaultValue" | "multiple" | "size"> & {
  value?: string | number;
  defaultValue?: string | number;
}) {
  const options = useMemo(() => collectSelectOptions(children), [children]);
  const triggerId = useId();
  const [inferredLabel, setInferredLabel] = useState("");
  const [uncontrolledValue, setUncontrolledValue] = useState(
    () => String(defaultValue ?? options[0]?.value ?? ""),
  );
  const selectedValue = value == null ? uncontrolledValue : String(value);
  useLayoutEffect(() => {
    if (ariaLabel || title || name || typeof document === "undefined") return;
    const trigger = document.getElementById(triggerId);
    const field = trigger?.closest("label");
    const fieldLabel = field
      ? Array.from(field.children).find((element) => element.tagName === "SPAN")?.textContent?.trim()
      : "";
    if (fieldLabel) setInferredLabel((current) => current === fieldLabel ? current : fieldLabel);
  }, [ariaLabel, children, name, title, triggerId]);
  const resolvedLabel = ariaLabel || title || name || inferredLabel || "Select option";

  const commit = (nextValue: string) => {
    if (value == null) setUncontrolledValue(nextValue);
    if (!onChange) return;
    const target = { value: nextValue } as EventTarget & HTMLSelectElement;
    onChange({ target, currentTarget: target } as ChangeEvent<HTMLSelectElement>);
  };

  return (
    <SelectMenu
      value={selectedValue}
      options={options}
      onChange={commit}
      ariaLabel={resolvedLabel}
      id={triggerId}
      className={clsx("select-menu-compat", className)}
      disabled={disabled}
    />
  );
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
    <CommittedNumberInput
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      normalize={(next) => Math.min(max ?? next, Math.max(min ?? next, next))}
      onCommit={onChange}
    />
  );
}

/**
 * Numeric field that keeps a local text draft and only commits after the user
 * has finished typing (blur or Enter).  This avoids turning `1024` into `64`
 * as soon as the first `1` is entered when a normalizer snaps to 64-pixel
 * generation blocks.
 */
export function CommittedNumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  normalize = (next) => next,
  onCommit,
  disabled = false,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  normalize?: (value: number) => number;
  onCommit: (value: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    const next = Number.isFinite(parsed) ? normalize(parsed) : value;
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
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
