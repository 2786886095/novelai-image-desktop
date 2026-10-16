# Android Agent native acceptance (separate QA installation)

This controller is **not** the Linux rootfs build, and does not call a real paid
model. It needs a disposable native ARM64 CI host with an actually supported
Android emulator/hypervisor. The provisioner installs the real API 34 ARM64
Google APIs image and runs `emulator -accel-check`; unsupported images, hosts,
virtualization or boot failures are errors, never an x86 or source-only pass.

After normal exact-source checkout, Node/Java/Flutter dependencies and verified
`harness/android/prepare-native.mjs`, write a JSON input outside the source:

```json
{
  "projectRoot": "/absolute/clean/checkout",
  "outputRoot": "/absolute/fresh/evidence",
  "sourceSha": "EXACT_40_HEX_COMMIT",
  "isolated": true,
  "androidSdk": "/absolute/android-sdk",
  "aapt": "/absolute/android-sdk/build-tools/35.0.0/aapt",
  "gradle": "/absolute/gradle/bin/gradle"
}
```

Run `node harness/android/test-runner/arm64-emulator.mjs /absolute/input.json`.
No output folder can be inside the checkout. The runner builds both QA APKs
itself with `-PstudioAgentQa`, extracts their manifests, and refuses a normal
installation or a test APK aimed at another package. Only the exact disposable
`.agenttest` package is cleared. No shared-storage pointer is permitted.

The production runtime still requires an actually published compatible component
and verified public download. Missing publication/network/space is a genuine
failed prerequisite, not permission to inject a fake executable or bypass the
production download checks.

The exact three existing Agent scenarios exercise preparation vs confirmation,
activation, real PRoot web process health, explicit stop, byte-exact backup and
restore, explicit restart, missing-install error, and a real pinned SDK process.
The SDK uses the production process launcher and real built-in `read` tool. A
native loopback HTTP SSE fixture requests a unique workspace file, then checks
the second actual request contains its bytes. The file bytes are not supplied to
the first model request. The first response waits until the external controller
has independently checked the live native PID, UID, command line and start time.
Only synthetic API credentials are supplied to this loopback fixture.

Success requires Android Instrumentation `RESULT_OK` (`-1`), exact source,
profile, nonce, app/test APK hashes, live app and SDK processes, fixed three log
checks and an identical pulled native file. It emits
`android-agent-scenarios-receipt.json` plus `controller-proof.json`. The central
gate must revalidate that proof and deep-compare the derived receipt. The new
`android-instrumentation` type must never be admitted for iOS or other features.
Host schema/compile tests cannot replace this run. iOS currently has no matching
local Node runtime route and remains an explicit capability gap.
