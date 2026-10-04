# Issues #35–#37: implementation and verification

Based on released v2.4.7 (`ef2adc64ee09daca8ab380c6ea179d57f40da6fc`).
Application and mobile version/build numbers are unchanged. This is a repair
candidate, not a new formal release.

## Changes

- #35: discover models in the provider settings draft; explicitly add selected
  models or a manual model ID. The composer lists only added models. Context
  length and default low/medium/high reasoning effort are persisted per model
  and provider. Existing manual configurations migrate as one selected model.
  Switching providers does not delete the other provider's saved models.
- #36: the attachment picker remains usable while a reply streams. Files added
  during a turn are draft attachments for the next message, not changes to the
  running request. Re-read the latest workspace after the picker resolves and
  retain live runtime status while persisting files. Disk recovery still resets
  interrupted runtime statuses.
- #37: retain the picker and add composer file drops and explicit clipboard
  pastes. Ordinary text paste remains unchanged. Native Windows FileNameW
  clipboard documents and clipboard images use a separate agent-only bridge.
  Mobile has a native paste action and native drop adapter; imported bytes are
  copied into app-managed attachment storage. Unsupported formats, read-only
  archived conversations and oversized batches are rejected.

No clipboard polling, credential changes or automatic model API calls.
Uploads are limited to 48 MiB per file, 192 MiB per batch and 64 files per
paste/drop batch. Reasoning effort is a default; a chat's explicit override
continues to take precedence, and providers may not support that parameter.

## Observed checks

- Desktop: TypeScript renderer and Electron typechecks passed.
- Desktop regression: 2920 tests passed, one existing test skipped.
- Electron-rendered actual React page: picker usable during streaming, pasted
  and dropped byte receipts correct, plain text paste not intercepted, long
  discovery list bounded to a searchable scrolling area, only added models in
  the picker, and context/effort saved. No uncaught renderer errors observed.
- Flutter regression: 1728 tests passed, one existing test skipped. New widget
  tests exercised the plus button during output and mock native channel
  paste/drop callbacks. File-copy tests used real temporary files.
- Flutter analyzer: no errors or warnings; informational style diagnostics
  remain and were not treated as fatal.
- Android: `:app:compileDebugKotlin` passed after explicit local build-proxy
  configuration. No application proxy preference was changed.

## Boundaries

Model discovery/provider wire tests use controlled loopback fixtures, not every
commercial provider. Android native gestures have not been device-tested in
this run. iOS/iPadOS adapters are included in source but have not been compiled
or device-tested here (Windows host). These are not claims of zero bugs or
native mobile acceptance. Only fresh Windows candidate binaries are delivered.

Reproducible UI harness: run Vite on 127.0.0.1:19437, then run the installed
Electron executable with `tests/issues35-37-driver.cjs`. Set
`QA_SCREENSHOT_PATH` to an absolute disposable output path. The harness uses
synthetic credentials and an isolated mock bridge, not the user's real profile.
