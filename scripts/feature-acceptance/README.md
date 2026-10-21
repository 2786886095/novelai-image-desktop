# Native feature acceptance (work in progress)

The product/native inventory retains **39 features × 5 platforms = 195**.
The current release scope is `windows-local-capabilities-no-ios/v2`: 39 features
on four release targets declare 156 cells, with **150 required and six
not-supported**. Local `agent-components` and `artist-iteration` are Windows-only;
their three scenarios each remain required on Windows and their other six cells
are not passes. The other 37 features, including the separate `image-agent`,
remain required on all four targets. iOS is excluded from functional acceptance
and may accompany the release only as a separately checked unsigned IPA requiring
user signing, not direct normal-iPhone installation or iOS feature certification.
Nothing here bypasses it, marks missing rows as verified, publishes a release,
or treats compilation, a host Flutter test, a screen mount, or a version check
as full feature acceptance.

`run-mobile-native.mjs INPUT.json` records literal commands, stdout, stderr,
exit statuses, source identity and actual Android/iOS component journeys.
The input supplies `sourceRoot`, `projectRoot`, `outputRoot`, `platform`, `appId`,
`device`, `flutter`, `isolated: true`, and, for Android, `adb` and `androidSdk`.
`sourceSha` is the current committed source SHA in CI. Local uncommitted work
is explicitly labelled `uncommitted` with `sourceSnapshotSha256`; it is not
eligible for the release contract. No secret is needed. All server responses
come from a real loopback HTTP fixture inside the disposable native app.

The runner refuses physical Android devices and non-Simulator iOS targets.
Use a **new disposable** emulator/Simulator, not an existing human profile.
The test intentionally resets only that disposable test application's native
preferences. It uses real platform plugins, production state/API/parser/storage
code, real filesystem and real HTTP; it does not replace those with fake APIs.

Existing bounded journey coverage includes credential/preferences/clipboard
roundtrips; generation-to-history/files; character and negative payloads; V5
Medium; img2img/inpaint/colorize/upscale; offline selected metadata application;
favorites copy/rename/remove; selective archive restore; group move, managed
batch delete and conclusive missing-file reconciliation. Each emitted check
states its narrow scope and untested sub-behaviors. All remain **component-only**.

Still required before any full-row proof: end-to-end user controls and adverse
paths for each feature, mobile new-default/import/online-mode/time-sort journeys,
provider errors/cancellation/retry, all remaining 39-feature scopes, and actual
execution for every currently required feature/platform cell. Windows local
CUDA/Agent component requirements are not silently imposed on mobile. This
explicit local-component scope does not exempt remote conversations, the image
agent, or any of the other 37 features. Precise per-feature profiles and their
original scenario IDs remain intact; missing required evidence is not a pass.

## Separate native CI entries (all remain partial)

`feature-acceptance.yml` does not publish. The original six entries remain:
core19, metadata/favorites16, queue-lifecycle4, release-parity7, library33 and generation24. Each has a separate
input, native receipt, literal command ledger and output directory. A failing
entry does not hide other independent observations, but the CI job fails.
Only the actual checkout Git SHA is accepted in CI. Ten pinned official public
JS/WASM resources are fetched with GET and checked against production byte
counts/SHA before controlled ID-only loopback transport. No images are uploaded.
The metadata entry leaves the real Android WebView/iOS WKWebView sandbox intact.

Android queue4 checks actual native service lifecycle. iOS queue4 instead checks
its explicit unsupported-background policy, once-only warning and safe no-op
calls on a real Simulator. It does NOT certify Android-like iOS keepalive, or
entire batch/generation features. The iOS device type is chosen using installed
available runtime/version compatibility, never an unrelated first/last pair.
Linux reuses the release CI's Xvfb/CJK-font and root-owned setuid Chromium sandbox
configuration; it does not disable the sandbox. All 150 currently required
release cells remain mandatory; six not-supported cells are not passes and no
component success is automatically promoted to a whole row.

## Client scenario profiles and strict aggregation

`full-feature-profiles.mjs` binds the 39 actual client feature IDs to explicit
scenario IDs. This is client acceptance using production state/API/storage,
real native codecs/files/plugins and isolated loopback services, not a claim
about upstream model visual quality, live subscription prices or paid accounts.
No provider credentials are needed. A hash of the definitions travels with each
scenario receipt and with `FEATURE_PROFILE_SHA` in the native parity app.

The AI records profile follows the actual existing panel: refresh, expand,
clear-all and the in-memory-log versus persisted text-history boundary. It does
not invent filter/selective-delete controls or require memory logs to persist.

`run-desktop-offline-native.mjs OUTPUT SOURCE_SHA` executes 18 production native
filesystem/library scenarios, then launches a separate Electron process to
reopen their stored records and verify image bytes. Fresh GitHub runners also
execute three native clipboard scenarios; a human desktop clipboard is never
modified. Both source snapshots must be clean and raw-byte identical to HEAD.
Uncommitted local observations explicitly remain unqualified.

`release_parity7` is independent of the old fixed 19/16/4 component counts. Its
seven actual CHECKs must match a real DONE and source/profile identity. Only its
four explicitly asserted inpaint scenarios are adapted into a scenario receipt;
the other three reverse checks remain bounded components. The native source
post-build dirty guard is unchanged: tool-generated tracked edits require review
and cannot become a qualified release proof by allowlisting or restoring files.

`build-full-feature-matrix.mjs EVIDENCE OUTPUT SHA VERSION --require-release-scope` copies
and hashes receipt bytes, accepts only clean same-SHA native scenario proofs,
and keeps missing/partial rows visible. It checks all original registered
scenarios for the 150 required feature/platform cells, retains the six excluded
local-capability cells as not-supported, then invokes the versioned release
contract and on-disk evidence verifier. Missing required evidence exits nonzero.
The legacy `--require-full` flag still cannot certify full195 under this explicit
scope, and `full195Certified`, `full156Certified` and `releaseReady` remain false.
A host unit test of the aggregator is never itself feature acceptance evidence.


The new mobile scenario entries have independent CHECK totals 7/33/24. Their
explicit scenario counts are 4/30/23; the remaining 3/3/1 bounded components are
not promoted. The shared host entry policy is also used by the pristine Git
worktree creator, preventing newly registered entries from being rejected by an
outdated three-entry allowlist. Host policy tests exercise real disposable Git
worktrees; they are not native device feature proofs.

## Versioned skill and expanded client entries

The original 118 scenario requirements remain, with four additional requirements
for skill versions, target-model compatibility, inline stale-result protection,
editing overlays, and cold-process preference/custom-slot retention. There are
still 39 features and 122 scenario IDs. Applicability requires 470 scenario/platform
observations for the 150 required cells; the 18 scenario/platform declarations in
the six not-supported cells remain visible but are not executed passes.

The fixed host registry also includes text15, skill_reopen1, batch_mcp7,
comic_openai6, image_agent3, tools3, ui9, os6, and Android-only android_update2.
Independent CI shards run all applicable registered entries. Sharding is not a
waiver for required cells. Historical iOS native observations remain diagnostics,
not functional prerequisites or passes for this unsigned package supplement.
Each entry keeps its independently fixed CHECK total and exact scenario inventory;
neither the app's DONE count nor merely opening a screen certifies a feature.

text15 and skill_reopen1 must run consecutively on the same disposable device.
The latter alone may retain test app data after qualified same-source predecessor
receipts are read back. It requires a force-stop/closed predecessor and a different
native PID; a new Dart object or cached SharedPreferences read is not a cold restart.
All ordinary entries still clear only their disposable test app data.

TLS fixture certificates and private keys are public synthetic test material.
They add trust only in the disposable test process, keep normal hostname checks,
and never install system trust, bypass TLS checks, or use real provider credentials.
Desktop bootstrap phases and bounded macOS-only stack diagnostics are artifacts,
not acceptance checks or substitutes for failed native scenarios.

The desktop library runner covers actual native/renderer styles, negative
libraries, font loading/import/removal/reset and the real bundled-catalog Worker,
then validates independent-process persisted data. The desktop browser runner
uses a Node-disabled sandboxed Chromium renderer, actual production metadata
Worker/WASM and explicit ID-only loopback public assets, actual NAIRP file
writer/importer plus reference manager selection, and native AppTabBar navigation.
NAIRP file API execution is not described as OS file-dialog automation.

`feature-parity.json` is a byte-identical alias of `FULL_FEATURE_MATRIX.json` for
the publisher. Both retain all pending and partial slots. The artifact name is
`four-platform-feature-evidence`; its relative evidence paths and SHA bindings
are preserved. Native CI and the strict 150-cell matrix must actually pass before
release, alongside unchanged package, signature and installation gates. Existing
candidate packages/receipts bind only their recorded source SHA and cannot be
relabeled as evidence for a new final commit or scope. Source-qualified native
receipts and exact evidence SHA bindings remain mandatory even when excluded
observations are retained as diagnostics.
