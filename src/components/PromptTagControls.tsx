import clsx from "clsx";
import { useId } from "react";
import {
  addPromptTagToInput,
  collectPromptTags,
  normalizePromptTags,
  promptTagText,
  UNTAGGED_PROMPT_FILTER,
} from "../prompt-library-tags";
import "../prompt-library-tags.css";

/** Single-select tag chips for a saved-prompt library. Hidden until an entry has a tag. */
export function PromptTagFilter({ items, value, onChange, language, className }: {
  items: ReadonlyArray<{ tags?: readonly string[] }>;
  value: string;
  onChange: (value: string) => void;
  language: unknown;
  className?: string;
}) {
  const text = promptTagText(language);
  const tags = collectPromptTags(items);
  if (!tags.length) return null;
  const untagged = items.filter((item) => !normalizePromptTags(item.tags).length).length;
  const chip = (key: string, label: string, count: number) => (
    <button
      type="button"
      key={key || "all"}
      className={clsx("prompt-tag-chip", value.toLocaleLowerCase() === key.toLocaleLowerCase() && "active")}
      aria-pressed={value.toLocaleLowerCase() === key.toLocaleLowerCase()}
      onClick={() => onChange(key && value.toLocaleLowerCase() === key.toLocaleLowerCase() ? "" : key)}
    ><span>{label}</span><small>{count}</small></button>
  );
  return (
    <div className={clsx("prompt-tag-filter", className)} role="group" aria-label={text.filter}>
      {chip("", text.all, items.length)}
      {tags.map(({ tag, count }) => chip(tag, `#${tag}`, count))}
      {untagged > 0 && chip(UNTAGGED_PROMPT_FILTER, text.untagged, untagged)}
    </div>
  );
}

/** Read-only tag list for list rows and detail headers. */
export function PromptTagList({ tags, className }: { tags?: readonly string[]; className?: string }) {
  const list = normalizePromptTags(tags);
  if (!list.length) return null;
  return <span className={clsx("prompt-tag-list", className)}>{list.map((tag) => <span key={tag}>#{tag}</span>)}</span>;
}

/** Comma-separated tag field with one-click suggestions from the existing library. */
export function PromptTagInput({ value, onChange, suggestions, language, disabled }: {
  value: string;
  onChange: (value: string) => void;
  suggestions: readonly string[];
  language: unknown;
  disabled?: boolean;
}) {
  const text = promptTagText(language);
  const id = useId();
  const current = normalizePromptTags(value).map((tag) => tag.toLocaleLowerCase());
  const available = suggestions.filter((tag) => !current.includes(tag.toLocaleLowerCase())).slice(0, 16);
  return (
    <div className="prompt-tag-input">
      <label htmlFor={id}>{text.tags}</label>
      <input
        id={id}
        value={value}
        disabled={disabled}
        maxLength={400}
        placeholder={text.tagsPlaceholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {available.length > 0 && (
        <div className="prompt-tag-suggestions" role="group" aria-label={text.addTag}>
          {available.map((tag) => (
            <button type="button" key={tag} disabled={disabled} onClick={() => onChange(addPromptTagToInput(value, tag))}>+ {tag}</button>
          ))}
        </div>
      )}
      <small>{text.tagsHint}</small>
    </div>
  );
}
