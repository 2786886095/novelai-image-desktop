# Issue 81 — mobile artist tools candidate

Scope: only #81. #80 and every relay-recommendation entry are unchanged. Version remains 2.7.7+198. No release, tag, issue closure, account access or paid generation is part of this change.

## Behavior
- Random artist laboratory: optional whole-pool mode establishes the current Danbooru nondeprecated artist-tag range, then draws 32 distinct uniform ranks (or all records for a smaller pool). Recipes use that new random candidate sample, not the popularity top-N cache. Network failure is explicit and cannot silently substitute a popular pool. At most 10 count-search requests plus 32 sample-page requests; count/sample deadlines are bounded. A server range at the numbered-page ceiling is refused rather than called complete. An input-weight draw links to this separate whole-pool tool.
- All three artist tools (random, input-weight draw, weight repair) have bounded favorites pages (12/24/48), secondary starred favorites without deleting primary favorites, persisted page/filters and last-preview bookmark/scroll. Preview galleries are limited to the current page. Old records default to not shortlisted; `shortlisted` survives normal save and backup JSON.
- Favorite folders hide the long editor configuration while keeping its controllers/data intact. New view metadata is saved separately, not by rewriting the entire library on each scroll.
- A reproduced nested-expansion exception read an ExpansionTile boolean as a TextField scroll double. Dedicated PageStorageKey identities now separate editor, list and grid positions from expansion flags. Selected tags are lazy-built in a <=176 logical-pixel list; catalog grids are <=280.
- Artist lookup accepts an exact artist name or a Pixiv/X/Twitter artist profile. Only fixed Danbooru endpoints are contacted; supplied URLs are never arbitrary fetch destinations. Identity candidates are shown for review, with source URLs, tag and NAI-formatted string copy actions. Similar names are not automatically merged. Up to 20 results, 2 MiB response cap, explicit empty/network/invalid-input messages. Five application languages supported. This does not guarantee a model knows an artist.

## Backup resource boundary
Archive inspection/import uses a disk-backed InputFileStream instead of reading the whole ZIP into RAM. Central-directory bounds are checked before inflating entries; actual decompressed size and CRC are checked too. JSON is validated before rescue creation or preference writes. Rescue/export image data is hashed and streamed through a disk-writing isolate instead of keeping all images and a second ZIP byte array in memory. File handles and app-owned staging directories are closed/cleaned in finally blocks. Existing account-vault transactions remain intact.

Mobile limits: file <=2 GiB; <=50,000 entries; central directory <=16 MiB; individual JSON <=16 MiB, total JSON <=48 MiB; individual asset <=64 MiB. Native portable capsules have an additional aggregate 64 MiB input / 128 MiB declared expanded bound. Unsafe, malformed, oversized or corrupt input fails with an actionable error instead of deliberately exhausting RAM. Oversized export assets are not silently omitted. These are explicit support limits, not a claim that arbitrary huge archives or every low-RAM phone can be restored. Original backup/user data is retained. Split categories when a limit is exceeded.

## Evidence and limitations
Synthetic public-method ZIP/oversized/forged-size tests, disk-backed 128 MiB archive RSS observation, real nested-editor widget interaction, three-tool favorite reopen/shortlist/page tests, fixed-origin Danbooru service fixtures and existing related suites are recorded outside the repository in the task verification ledger.

Official API basis:
- https://github.com/danbooru/danbooru/blob/master/app/models/artist.rb (url_matches / any_name_matches)
- https://github.com/danbooru/danbooru/blob/master/app/models/tag.rb (category/order/is_deprecated search)
- https://github.com/danbooru/danbooru/blob/master/app/logical/pagination_extension.rb (numbered pages and maximum limit)
A credential-free public endpoint probe returned HTTP 503 on this host. Live lookup/global-pool end-to-end availability therefore is not claimed; fixture tests cover response and failure behavior.

## Candidate installation
Build release with opt-in Gradle property `studioIssue81Candidate=true` and Android ARM64 target. The application ID becomes `com.codex.novelai.novelai_mobile.issue81candidate`, alongside rather than replacing the signed official release. Same version, separate application storage; do not uninstall or clear the official app. This candidate uses local debug signing when the production keystore is absent. It is not an official update package. No physical Redmi K70 / iPhone certification is implied by host widget tests.
