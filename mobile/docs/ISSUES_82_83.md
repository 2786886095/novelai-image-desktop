# Android artist draw and backup input fixes (#82 / #83)

Refs #82, #83. Candidate only; no release, version bump, merge or issue closure.
Version remains 2.7.8+199. The separate PC stream changes in the supplied dirty
source and all user data are outside this PR.

## Behavior
- Artist pool source is explicitly Local / Online (Danbooru), persisted across reopen.
  Local is the new default and never issues HTTP. Offline category-1 tags, bundled
  artists and cached candidates are merged/deduplicated; CSV names never acquire
  invented positive numeric IDs.
- Broad online discovery uses at most five ID-cursor requests, 100 tags/window,
  1 MiB/response, 8 s/request and 20 s total budget. No page-500 or total-count probe.
  On failure, show a local-fallback warning, retain the previous cache timestamp,
  and keep drawing. Known-candidate counts are not an all-site population count
  or a promise of uniform sampling. Online cache TTL is six hours.
- Fixed artists per recipe is independent from the number of recipes in a batch.
  Random style-tag minimum/maximum controls preserve zero, sort swapped ranges,
  clamp drafts to 0..20 and the engine to the actual distinct random-tag pool.
  Both random draw and weight tuning use the same normalization contract.
- Compressed backup input limit is 4 GiB (4,294,967,296 bytes). ZIP64, directory,
  local headers/data descriptors, paths, overlaps, CRC, declared/actual sizes and
  SHA references are checked. Limits remain: JSON 16 MiB/entry, 48 MiB total JSON,
  asset 64 MiB/entry, expanded 8 GiB, directory 16 MiB, 50,000 entries.
- Import first streams an app-private snapshot with backpressure, then preflights
  payloads/JSON in an isolate before existing rescue/merge logic. Changed originals
  cannot replace a validated snapshot. Temporary snapshots are cleaned up.
  The existing all-category merge is not a newly guaranteed atomic transaction;
  disk failures still require the preserved rescue backup.
- Desktop backup save streams file-to-file with previous-target recovery. Mobile
  exports above 16 MiB use the existing file-based native sharing route rather
  than reading the complete ZIP into a byte array. Opening a share sheet is not
  reported as a successfully saved destination. Import requires temporary space.

## Verification
- 173 related unit/widget/backup tests passed with Flutter 3.24 / Dart 3.5.
- All 15 changed Dart source/test targets analyzed with no issues.
- Whole-project analysis: no errors/warnings, two pre-existing informational lints
  in android_numeric_keyboard_regression_test.dart and startup_update_prompt_test.dart.
- New regressions cover 503/403/429, timeout, malformed/oversized/empty artist data,
  cursor budget/cache/source/fallback, three viewport sizes, actual source selection,
  fixed count, zero/swapped tag bounds and reopen persistence.
- A sparse valid ZIP with 3 GiB offsets, ZIP64 directory, streaming data descriptors,
  comment spoof, invalid offsets/counts/CRC/path, private snapshot cleanup and SHA
  integrity were tested on the Windows host. Existing 128 MiB archive memory
  and all backup-category/credential rescue regressions passed.
- Initial handed-off WIP failed three tests: two obsolete whole-pool contracts and
  one real rejection of valid streaming ZIP data descriptors. New local-source
  layout paths also required old mock services/scroll locators to be adapted;
  the existing layout/scroll assertions remain active.

## Test APK
Build on Windows after `flutter pub get` using the standard Gradle wrapper:

```powershell
# local.properties must keep flutter.versionName=2.7.8 and flutter.versionCode=199
.\gradlew.bat :app:assembleRelease -PstudioIssues8283Candidate=true -Ptarget-platform=android-arm64
```

Opt-in package: `com.codex.novelai.novelai_mobile.issues8283candidate`.
Label: `Langbai Studio 82-83 Test`. The production package/version/signing branch
is unchanged. The local candidate is debug-key-signed and installs separately;
do not uninstall the official app. Test credentials/data remain separate.
The authoritative artifact is `mobile/build/app/outputs/apk/release/app-release.apk`,
not a stale copy in outputs/flutter-apk.

Not performed: Redmi/HyperOS physical-device installation, real paid generation,
network availability under the reporter's ISP, or a real multi-GiB phone restore.
A larger file-size cap does not remove entry/memory/integrity limits.

## API references
- https://github.com/danbooru/danbooru/blob/master/app/models/tag.rb
- https://github.com/danbooru/danbooru/blob/master/app/logical/pagination_extension.rb
The indexed `aID` / `bID` cursor protocol is used instead of deep OFFSET pages.
HTTP503 alone does not establish that Cloudflare caused the original failure.
