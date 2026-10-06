# Artist model and image-workflow candidate verification

Candidate keeps version 2.4.8; this is not a formal Release/version bump.

- Random artist gacha preserves selected V4.5/V5 Full/Curated through settings restore, reopen and the actual request boundary. Target iteration remains V4.5 Full only.
- #42: generation drag/drop and paste explicitly restore available embedded parameters. History thumbnail selection remains image-only. Native image menu offers Load parameters. Missing metadata preserves the current form and explains the fallback; paid requests are protected from delayed imports.
- #43: inline and fullscreen previews navigate the same current history list; loaded workbench files are matched by durable path. Fullscreen stays open; input editing is not hijacked.
- #44: copyImageMetadata defaults false on desktop/mobile. Windows ON copies the exact original PNG with metadata plus standard bitmap paste support. OFF retains prior native copy behavior. Unsupported sources fall back with a truthful notice. Destination applications may strip metadata.
- #45: image clicks, double-clicks and cursor use painted/transformed image bounds, not the letterboxed container. Existing wheel zoom, pan and click preview remain available.
- #46: local favorites Apply to generation restores original parameters between Rename and Remove.

Observed local checks: renderer/Electron typecheck, desktop regression suite, real hidden Electron combined interaction checks (native mouse/keyboard), real Windows clipboard roundtrip, packaged native runtime/startup/UI audits, Windows installer extraction/hash comparison. Tests use offline image/model fixtures, not paid API calls. Shared Flutter source includes Android/iOS clipboard bridges, painted-image hit tests and history/favorites behavior; native/device-specific verification must be stated separately.

The transaction ledger records literal commands, stdout, stderr, exits, retries/corrections, original/modified hashes, same-input baseline/modified/rollback comparisons and reopen verification. Original source remains unchanged; copies and build outputs are isolated by date.

Final local results: desktop 2994 passed / 1 existing skipped; Flutter 1755 passed / 1 existing skipped. Strict analysis found no issues. Android debug native compilation passed (validation only, no Android delivery); iOS native compilation and real phone clipboards not exercised on this Windows host.
