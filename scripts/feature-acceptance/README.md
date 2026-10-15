# Native feature acceptance (work in progress)

The existing release contract remains **39 features × 5 platforms = 195**.
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

Implemented first journey coverage includes credential/preferences/clipboard
roundtrips; generation-to-history/files; character and negative payloads; V5
Medium; img2img/inpaint/colorize/upscale; offline selected metadata application;
favorites copy/rename/remove; selective archive restore; group move, managed
batch delete and conclusive missing-file reconciliation. Each emitted check
states its narrow scope and untested sub-behaviors. All remain **component-only**.

Still required before any full-row proof: end-to-end user controls and adverse
paths for each feature, mobile new-default/import/online-mode/time-sort journeys,
provider errors/cancellation/retry, all remaining 39-feature scopes, and actual
execution on all five target platforms. In particular, no Windows-only optional
CUDA installation is silently required on mobile, and no mobile remote agent is
declared absent merely because a local native agent handler is absent. Precise
per-feature acceptance profiles must distinguish those sub-capabilities without
deleting or exempting any of the 195 required feature rows.

## Separate native CI entries (all remain partial)

`feature-acceptance.yml` does not publish. Android/iOS run three independent
entries: core19, metadata/favorites16, and queue-lifecycle4. Each has a separate
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
configuration; it does not disable the sandbox. All 195 release slots remain
required and no component success is automatically promoted to a whole row.
