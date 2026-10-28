# Third-party notices

## NovelAI account authentication utilities

- `hash-wasm` 4.12.0, https://github.com/Daninet/hash-wasm, MIT (Dani Biro).
  Used for local BLAKE2b-128 and Argon2id access-key derivation on desktop.
- Flutter `cryptography` 2.9.0, https://pub.dev/packages/cryptography,
  Apache-2.0. Used for equivalent local access-key derivation on Android/iOS.
- Authentication algorithm and wire format were checked against the reference
  implementation https://github.com/Aedial/novelai-api (utils.py, _high_level.py,
  _low_level.py). This is not an official NovelAI support guarantee.
- Official email/password input is transient. Derived keys are sent only to the
  fixed official HTTPS login endpoint. Passwords are not stored or sent to relay
  accounts; the resulting token is stored using the platform credential vault.

Langbai NovelAI Studio uses the following actively maintained open-source
libraries. Their upstream license texts are distributed with the corresponding
packages in `node_modules`.

## TanStack Virtual

- Project: https://github.com/TanStack/virtual
- Copyright: Tanner Linsley and contributors
- License: MIT
- Use: virtualised rendering of long image histories.

## dsh-infinite-gen-3

- Project: https://github.com/Minglink/dsh-infinite-gen-3
- Version: 0.5.0 (`d0c43196079849d4501afb3d1a8e195cf808024a`)
- Copyright: Minglink and contributors
- License: MIT
- Use: a task-scoped adaptation of the execution-first prompt contract for
  the built-in AI reverse-prompt and prompt-conversion routes.

These projects are not affiliated with or endorsed by Langbai NovelAI Studio.


## Bundled Chinese UI style fonts

These original, unmodified fonts are distributed under SIL Open Font License 1.1, separately from the application MIT license. Copyright notices and full licenses are bundled alongside fonts in `dist/ui-fonts/` and `mobile/assets/ui-fonts/`. `catalog.json` records pinned source URLs, versions and SHA-256 hashes. They are not installed into the operating system.

- **霞鹜文楷 轻便版 / LXGW WenKai Lite** v1.522: https://github.com/lxgw/LxgwWenKai-Lite; license `builtin-wenkai.OFL.txt`.
- **小赖字体 / Xiaolai** v3.126: https://github.com/lxgw/kose-font; license `builtin-xiaolai.OFL.txt`.
- **悠哉字体 / Yozai** v0.868: https://github.com/lxgw/yozai-font; license `builtin-yozai.OFL.txt`.
- **霞鹜漫黑 / LXGW Marker Gothic** v1.003: https://github.com/lxgw/LxgwMarkerGothic; license `builtin-marker.OFL.txt`.
- **得意黑 / Smiley Sans** v2.0.1: https://github.com/atelier-anchor/smiley-sans; license `builtin-smiley.OFL.txt`.
- **思源宋体 CN / Source Han Serif CN** 2.003R: https://github.com/adobe-fonts/source-han-serif; license `builtin-source-serif.OFL.txt`.

## IG5 image-task rule adaptations

- Source: https://github.com/Minglink/dsh-infinite-gen-5
- Pinned revision: `eeff0bbeb905bdc57952dc7497d5fdfc33653c0f`.
- Attribution: Minglink and the upstream contributors.
- License: CC BY-NC-SA 4.0; full text and attribution notice are bundled as
  `shared/ig5-LICENSE.txt` and `shared/ig5-NOTICE.txt`.
- Modified: three task-scoped rewrites of general workflow, evidence, output-format
  and authorization rules for desktop prompt conversion, image reconstruction
  and Studio image planning/generation. These are not upstream native NovelAI
  prompts, do not imply upstream endorsement, and bundle no IG5 executable tools.
- Scope: these adaptation texts retain CC BY-NC-SA 4.0 terms; that notice does not
  relicense unrelated application code, existing presets or other dependencies.
  Commercial-use authorization has not been established. The fixed source URLs,
  byte sizes, hashes and adaptation statement are in `shared/ig5-image-prompts.json`.
- Platform boundary: packaging the desktop adaptations does not assert Android
  or iOS default-prompt parity. Their separate Flutter implementation and declared
  assets determine what is actually enabled on those platforms.


## ComfyUI archive import: 7-Zip 26.04 (Windows x64)

Unmodified 7za.exe from the official 7-Zip Extra distribution is included only for local ZIP/7z import. The original LGPL-2.1-or-later and BSD license text, NOTICE and exact binary/source provenance ship beside it in resources/comfy-archive/. Upstream source: https://github.com/ip7z/7zip/tree/26.04 ; distribution: https://www.7-zip.org/download.html . This is not the Aki/ComfyUI environment and does not download or include image model weights.
