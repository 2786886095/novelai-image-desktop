# Native feature acceptance (work in progress)

The current release scope is `desktop-windows-local-capabilities/v5`
(`scripts/release-platform-contract.mjs`): 36 features on the two desktop
release targets, Windows and macOS, declare 72 cells, with **71 required and one
not-supported**. Local `artist-iteration` is Windows-only; its three scenarios
remain required on Windows and its macOS cell is not a pass. Every other feature
remains required on both targets. Nothing here bypasses it, marks missing rows
as verified, publishes a release, or treats compilation, a screen mount, or a
version check as full feature acceptance.

## Separate native CI entries (all remain partial)

`feature-acceptance.yml` does not publish. On fresh Windows and macOS runners it
executes eight desktop entries: `run-desktop-native.mjs`,
`run-desktop-offline-native.mjs`, `run-desktop-ai-native.mjs`,
`run-desktop-generation-native.mjs`, `run-desktop-library-native.mjs`,
`run-desktop-system-native.mjs`, `run-desktop-browser-native.mjs` and
`run-desktop-tools-gallery-native.mjs`. Each has a separate output directory,
native receipt and literal command ledger. A failing entry does not hide other
independent observations, but the CI job fails. Only the actual checkout Git SHA
is accepted in CI. Ten pinned official public JS/WASM resources are fetched with
GET and checked against production byte counts/SHA before controlled ID-only
loopback transport. No images are uploaded.

The Windows `artist-iteration` cell needs a locally executed GPU proof committed
to this repository. `import-windows-artist-evidence.mjs` admits it read-only
from one immutable commit given as `windows_artist_evidence_commit`; a missing
or failed proof leaves that cell unverified. All 71 currently required release
cells remain mandatory; the not-supported cell is not a pass and no component
success is automatically promoted to a whole row.

## Client scenario profiles and strict aggregation

`full-feature-profiles.mjs` binds the 36 actual client feature IDs to explicit
scenario IDs (defined in `full-feature-profile-definitions.mjs`). This is client
acceptance using production state/API/storage, real native codecs/files and
isolated loopback services, not a claim about upstream model visual quality,
live subscription prices or paid accounts. No provider credentials are needed.
A hash of the definitions travels with each scenario receipt. Precise
per-feature profiles and their scenario IDs remain intact; missing required
evidence is not a pass.

The AI records profile follows the actual existing panel: refresh, expand,
clear-all and the in-memory-log versus persisted text-history boundary. It does
not invent filter/selective-delete controls or require memory logs to persist.

`run-desktop-offline-native.mjs OUTPUT SOURCE_SHA` executes 18 production native
filesystem/library scenarios, then launches a separate Electron process to
reopen their stored records and verify image bytes. Fresh GitHub runners also
execute three native clipboard scenarios; a human desktop clipboard is never
modified. Both source snapshots must be clean and raw-byte identical to HEAD.
Uncommitted local observations explicitly remain unqualified.

`build-full-feature-matrix.mjs EVIDENCE OUTPUT SHA VERSION --require-release-scope` copies
and hashes receipt bytes, accepts only clean same-SHA native scenario proofs,
and keeps missing/partial rows visible. It checks all registered scenarios for
the 71 required feature/platform cells, retains the excluded macOS
`artist-iteration` cell as not-supported, then invokes the versioned release
contract and on-disk evidence verifier. Missing required evidence exits nonzero.
The legacy `--require-full` flag still cannot certify full195 under this explicit
scope, and `full195Certified`, `full156Certified` and `releaseReady` remain false.
A host unit test of the aggregator is never itself feature acceptance evidence.

## Versioned skill and expanded client entries

The scenario definitions include the requirements for skill versions,
target-model compatibility, inline stale-result protection, editing overlays,
and cold-process preference/custom-slot retention. There are 36 features and
113 scenario IDs. Applicability requires 223 scenario/platform observations for
the 71 required cells; the three scenario declarations of the not-supported
cell remain visible but are not executed passes.

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
`desktop-feature-evidence`; its relative evidence paths and SHA bindings
are preserved. Native CI and the strict 71-cell matrix must actually pass before
release, alongside unchanged package, signature and installation gates. Existing
candidate packages/receipts bind only their recorded source SHA and cannot be
relabeled as evidence for a new final commit or scope. Source-qualified native
receipts and exact evidence SHA bindings remain mandatory even when excluded
observations are retained as diagnostics.
