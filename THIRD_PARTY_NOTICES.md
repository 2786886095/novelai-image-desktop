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

## Pi Agent Core / Pi AI

- Packages: `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` 0.84.4
- Project: https://github.com/earendil-works/pi
- License: MIT; package license files are distributed with `node_modules`.
- Use: desktop Agent loop and model protocol adapters. The Flutter client uses
  an independent Dart adaptation of the bounded tool-loop pattern.

The Studio Agent interaction design was informed by
https://github.com/Aaalice233/Aaalice_NAI_Launcher (MIT). No Launcher source
files or artwork are copied into this application.

## DSH plugin manager trial integration

`dsh-plugin-mgr` 0.2.10 (https://github.com/oxlyn/dsh-plugin-mgr), MIT, is bundled with its LICENSE. Its js-yaml dependency is bundled with LICENSE.js-yaml. The local adapter lists Studio-seeded integrations as protected components so generic updates do not overwrite user customizations. The upstream manager controls additional profile-installed plugins.

Langbai NovelAI Studio uses the following actively maintained open-source
libraries in the Character Tavern interface. Their upstream license texts are
distributed with the corresponding packages in `node_modules`.

## react-markdown / remark-gfm / rehype-sanitize

- Projects: https://github.com/remarkjs/react-markdown,
  https://github.com/remarkjs/remark-gfm,
  https://github.com/rehypejs/rehype-sanitize
- Copyright: their respective contributors
- License: MIT
- Use: safe Markdown rendering, GitHub-flavoured Markdown, and HTML schema
  sanitisation for roleplay messages.

## TanStack Virtual

- Project: https://github.com/TanStack/virtual
- Copyright: Tanner Linsley and contributors
- License: MIT
- Use: virtualised chat rendering for long conversations.

## flutter_markdown_plus

- Project: https://pub.dev/packages/flutter_markdown_plus
- Copyright: the project contributors
- License: BSD-3-Clause
- Use: selectable Markdown and code-block rendering in the Android/iOS
  Character Tavern interface.

## dsh-infinite-gen-3

- Project: https://github.com/Minglink/dsh-infinite-gen-3
- Version: 0.5.0 (`d0c43196079849d4501afb3d1a8e195cf808024a`)
- Copyright: Minglink and contributors
- License: MIT
- Use: a task-scoped adaptation of the execution-first prompt contract for
  the built-in Tavern image, AI reverse-prompt, and prompt-conversion routes.

These projects are not affiliated with or endorsed by Langbai NovelAI Studio.


## Tavern community plugin trial

- dsh-roleplay 0.1.8, lutrodev — MIT; https://github.com/lutrodev/dsh-roleplay. The Studio adapter restores standalone package boundaries and targets the locally bundled 0.1.5-rc.3 service APIs. Upstream declares 0.1.2-rc.1 compatibility.
- Mindspace session memory 0.7.0, Spirtxiaoqi7 — MIT; https://github.com/Spirtxiaoqi7/mindspace-dsh-session-memory. Background model maintenance is initially disabled in the trial composition.
- Original LICENSE files are retained in every installed community package. Pinned archives and SHA-256 checksums are in harness/community. User modifications and conversations are not bundled.

## DSH Market and optional built-in preset
- dshmarket 1.65.0: https://github.com/dsh-market/dsh-market (MIT). Its undici, js-yaml and argparse dependencies retain their licenses in the component.
- dsh-infinite-gen-4 0.4.0: https://github.com/Minglink/dsh-infinite-gen-4 (MIT). Pinned source and license in harness/community/infinite-gen4. Imported once as a selectable per-session Roleplay preset, without global injection or duplicate reinforcement. Existing custom presets, characters and lorebooks are retained.


## Android local Agent integration candidate

The Android launcher uses separate native PRoot executables from DSHA revision
`bdb647c331c4d6c11b5632afdb901c50510720ea`; exact hashes, original license texts
and build recipe are retained in `harness/android/upstream`. DSHA is MIT; Termux
PRoot v5.1.107.92 is GPL-2.0. talloc and libandroid-shmem retain their upstream
licenses. No proprietary proroot binary is included. See `harness/android/README.md`
for build provenance, source requirements and validation gates.

Ubuntu rootfs packages retain their copyright/license files under `/usr/share/doc`.
The build emits the exact installed-package inventory. Node and locked npm packages
retain their own LICENSE files. App MIT licensing does not relicense those components.
