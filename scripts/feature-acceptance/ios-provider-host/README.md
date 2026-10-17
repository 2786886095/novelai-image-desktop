# Disposable iOS local Files provider fixture (not acceptance proof)

This standalone UIKit application and XCUITest target are not part of Runner,
not a shipping app, not a File Provider extension, and not a cloud simulator.
Its own Documents are exposed by **Apple's system local Files provider** using
`UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace`. That second
application container is external to Runner. Runner's own Documents, a copied
path string, app-group storage, mock channel results and host screenshots cannot
substitute for an actual picker grant.

Windows authoring can check project/source structure only. Xcode compilation,
installation, OS picker hierarchy, bookmark restoration and CRUD require a fresh
**GitHub macOS runner and explicitly disposable iPhone simulator**. None have
been proved merely by adding this project. No cloud/offline/revocation coverage
is claimed.

Primary references: [File Provider local sharing](https://developer.apple.com/documentation/fileprovider),
[directory grants and coordinated access](https://developer.apple.com/documentation/uikit/providing-access-to-directories),
[activate can launch a stopped app](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/activate()).
The test checks Runner is running before calling activate; it never launches,
reinstalls, resets permissions, clears preferences or deletes Runner's data.

## Fixed interfaces

- App ID: `org.langbai.nativefixture.providerhost`; UI test ID is that ID plus
  `.uitests`. App target `ProviderHost`, real UI-test target `ProviderHostUITests`,
  scheme `ProviderHost`. Swift files are in the project's Sources build phases.
- Runner ID: exactly `com.codex.novelai.novelaiMobile` (current iOS Runner ID).
- Required runtime input, supplied only from a validated **current** native
  folder request: `GITHUB_ACTIONS=true`, `FEATURE_DISPOSABLE_DEVICE=true`,
  `FEATURE_SOURCE_SHA` (40 lower-case hex), `FEATURE_PROFILE_SHA` (64 hex),
  `FEATURE_RUNNER_PID` (positive Int32), `FEATURE_FOLDER_NONCE` with exact PID
  prefix plus 11–20 decimal digits, and test-only `FEATURE_PICKER_LOCALE=en`.
- The source and profile must also equal the app Info.plist build values.
  Runtime environment alone cannot relabel a different compiled host build.
- Host exclusively `mkdir`s its own `Documents/NativeOutput-<nonce>` and writes
  `provider-marker.json` with `.withoutOverwriting`. Existing content fails;
  no directory is reused, overwritten, recursively removed or cleaned up.
- Host ready UI JSON binds source/profile/nonce/expected Runner PID/host PID.
  This is **fixture preparation**, not a security grant or feature receipt.
- XCUITest requires the already-running Runner, then the actual English system
  document picker; only exact On My iPhone → Langbai Provider Fixture → nonce
  folder rows are tapped. The current navigation breadcrumb must equal the
  nonce folder before one unique Open/Done control is used. Unexpected,
  ambiguous, stale or non-hittable hierarchy fails. Unsupported versions fail;
  there is no parent-folder choice or path-result substitution.
- The driver's observation uses `IOS_PROVIDER_DRIVER_OBSERVATION` and
  `acceptanceCredit:false`. It does not emit a native acceptance CHECK. Its
  `expectedRunnerPid` is **not** an independently read process PID; the outer
  current-source native stream must confirm Runner's actual PID before/after.

## Future macOS execution (not automatically wired or dispatched)

First verify the checkout/index/HEAD, exact source manifest and fixed profile;
create a simulator with the existing `create-disposable-ios-simulator.mjs`.
Use the same fresh simulator for host and Runner; do not sign in to any account.
Compile before starting Runner's 180-second picker request window:

```sh
xcodebuild -list -project scripts/feature-acceptance/ios-provider-host/ProviderHost.xcodeproj
xcodebuild build-for-testing \
  -project scripts/feature-acceptance/ios-provider-host/ProviderHost.xcodeproj \
  -scheme ProviderHost -configuration Debug \
  -destination "platform=iOS Simulator,id=$UDID" \
  -derivedDataPath "$RUNNER_TEMP/provider-host-build" \
  CODE_SIGNING_ALLOWED=NO FEATURE_SOURCE_SHA="$SOURCE_SHA" FEATURE_PROFILE_SHA="$PROFILE_SHA"
```

Preserve the raw xcodebuild result, built app/UI-test bundle SHA and generated
`.xctestrun`. Do not infer success from a host source-contract test. The future
controller must verify the simulator ID, install the built host, launch the
actual native Runner folder entry, and validate live BEGIN/source/profile/PID
plus the single matching nonce request **before** running this driver.

The generated `.xctestrun` must receive the required fixed runtime fields in
`EnvironmentVariables` of exactly the `ProviderHostUITests` test target (the
format may use `TestConfigurations[*].TestTargets[*]`). Validate exactly one
matching BlueprintName/TestBundlePath; reject missing/ambiguous targets rather
than editing arbitrary plist keys. Host launchEnvironment is then set explicitly
by this test, not inherited from a user's app. Execute the already-built test:

```sh
xcodebuild test-without-building -xctestrun "$QUALIFIED_XCTESTRUN" \
  -destination "platform=iOS Simulator,id=$UDID" \
  -only-testing:ProviderHostUITests/PickerDriverTests/testSelectNonceFolderInActualSystemPicker \
  -resultBundlePath "$RUNNER_TEMP/provider-host-result.xcresult"
```

An actual Runner native journey is still missing for iOS. It must operate the
production settings chooser, assert the returned folder is outside the real
Runner container and inside the separately identified host container, and read
the exact source/profile/nonce marker **through IosOutputFolder.read**, not host
path injection. Then production Storage/coordinated CRUD and history readback
must prove bytes/no-clobber/imported/shared-path/partial-failure semantics.

## Cold process work is deliberately NOT enabled here

Existing `verifyMobilePredecessor` permits only text15→skill_reopen1, with same
source/profile/device/app, qualified sidecar and different actual native PID.
Do not rename a folder test to skill_reopen1 or add an arbitrary preserve flag.
A future dedicated, fixed folder preparation/reopen protocol must bind the live
source/profile/UDID/Runner ID/PID/nonce/marker digest and source qualification.
Preparation evidence has **zero acceptance credit** in a distinct schema; it is
not a missing-DONE exception in the current native parser. Stop Runner without
uninstall/clear, launch a separately bound cold fixture with a different actual
PID, restore the bookmark, perform real coordinated read/CRUD/history checks,
and only then admit the existing folder-choice-history-link scenario once.
This requires explicit controller and registry review; it is not implemented by
this independent project. No full195, cloud, provider move, revocation or offline
pass follows from this fixture. Current strict registries/parser remain intact.
