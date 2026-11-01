# Desktop control contract

Preserve the current theme and semantic tokens. This is a consistency contract,
not a new palette, navigation design or a replacement for specialized editors.

## Shared controls

- Use `Button` from `src/components/ui.tsx` for ordinary actions. `primary`,
  `secondary`, `ghost` and `danger` express purpose; do not invent feature-specific
  gradients, heights or danger colors. An existing scoped specialized control
  may keep its own class rather than being converted indiscriminately.
- Ordinary actions use `--studio-action-height` (36px), compact actions opt into
  `size="sm"` (28px). These are minimum heights, not fixed text boxes. Labels,
  explicit submit types, forms, refs and event handlers must survive migration.
- `loading` sets native `disabled`, `aria-busy` and the existing spinner class.
  Keep the accessible name and children. Callers still own the async operation,
  cancellation and duplicate-submission protection.
- Use the existing `FilePicker` for file actions instead of a styled label with
  a hidden input: its real button supports native keyboard activation. Preserve
  accept, multiple, disabled, input reset and the original onChange callback.
- Password visibility is a named, keyboard-reachable button. Never log a secret
  to verify the visual state; use synthetic fixture values only.

## Final visual authority

`src/studio-controls.css`, imported after the legacy/page styles, owns shared
metrics, radius, spacing, focus, disabled, loading and invalid states. It uses
the existing light/dark palette tokens. `src/works-library.css` consumes these
metrics for its legacy scoped actions instead of introducing another button size.

- Controls use `--radius-sm`; floating dialogs use `--radius-lg`.
- Action gaps use 8px; the spacing vocabulary is 4/8/12/16/24px.
- Shared `.field` text/number/select inputs use the ordinary control minimum;
  textarea content height remains owned by its editor. Checkbox, radio, range,
  file and color geometry is not normalized to text-field dimensions.
- Dialog surface/chrome shares tokens, but existing focus management, scroll
  ownership, portals, Escape handling and cancellable exits remain unchanged.
- Keep visible keyboard focus and distinct disabled/invalid/busy states in both
  themes. Press feedback must not scale text and make it blur.
- Respect the existing explicit in-app reduced-motion setting; do not silently
  replace that product policy with a different system-preference policy.

Do not add a global `button`, `input` or wildcard style reset. Navigation tabs,
window controls, thumbnails, image viewers and canvas controls have deliberate
specialized geometry. A native-looking control needs a source/DOM check, not a
blanket class replacement based on `appearance:auto`.

## Review and evidence

Check the actual full-app route, not just an isolated component. Record which
routes/dialogs, languages, themes, widths and states were exercised. Background
browser fixtures must block paid/provider operations and must not read a real
profile or userData. Synthetic screenshots prove the tested layout and control
states, not every installed-device or paid generation workflow.

The focused shared-control, consumer and FilePicker tests guard rendering and
callback contracts. Browser computed-style and keyboard checks cover the actual
cascade. A candidate is packaged separately with its existing version and is
not a formal release unless the user explicitly requests publication.
