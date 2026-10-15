# Langbai NovelAI Studio

> **Latest release**: See the [Latest release page](https://github.com/2786886095/novelai-image-desktop/releases/latest) for the packages currently provided for Windows, macOS, Linux, Android and iOS, their versions, installation limits and verification records.
> Package availability or GitHub's stable label does **not** prove full 39-feature, physical-device or production-provider acceptance. Complete acceptance is not established for the currently delivered build.

[简体中文](./README.md) · [繁體中文](./README.zh-TW.md) · [English](./README.en.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md)



### From an idea to a collection of images.

A NovelAI image-creation workspace with Simplified Chinese, Traditional Chinese, English, Japanese and Korean interfaces.

![Promotional fan illustration; the interface shown is a visual concept](./docs/assets/readme/furina-workbench.png)

**[Download the latest release](https://github.com/2786886095/novelai-image-desktop/releases/latest)** · [Getting started (Chinese)](./docs/guide/GETTING_STARTED.md) · [Feature guide (Chinese)](./docs/guide/FEATURES.md)

> Bring your own **NovelAI Persistent API Token**. Model access and generation charges depend on your NovelAI account. Optional image analysis, prompt conversion and Tavern AI services require separate configuration.

## Changes in this update

- Desktop and mobile inpainting forward character positive/negative prompts, positions and Precise References.
- Character/reference capabilities use the actual inpaint model, avoiding rejection or truncation based on the unrelated main model.
- Agent/MCP inpaint estimates, budgets and submission use the same effective model and references.
- Precise Reference estimates scale with reference and image counts; image-to-image batches cover every image while Vibe encoding is counted once.
- Incompatible Precise Reference and Vibe combinations are explicitly rejected before encoding or generation.

**Verification limits:** Estimates are not measured charges. Controlled tests do not certify paid generation or the full 39 × 5 feature matrix. The maintainer's previous iOS verification waiver remains in effect. The unsigned IPA requires your own signing and cannot be installed directly on a stock iPhone. See [Latest](https://github.com/2786886095/novelai-image-desktop/releases/latest) for files and hashes, and [main](https://github.com/2786886095/novelai-image-desktop/tree/main) for current source.

## Quick start

1. Download the package for your operating system from the release page. End users do not need Node.js or source-build commands.
2. Open **Settings → API configuration**, follow the in-app token guide, and verify the token or refresh your balance.
3. Open **Generate**, choose an available model, enter a prompt, check image size, count and estimated cost, then generate. Desktop results are saved in the output folder and added to history.

```text
1girl, solo, blue hair, blue eyes, white dress, garden, sunlight, smile
```

Start with default parameters. Get one generation working before adding optional AI and tag services. Change the interface language in Settings; your prompts, filenames and conversations are not translated.

## Tools for different tasks

| Task | Tools | Guide (Chinese) |
| --- | --- | --- |
| Create or revise an image | Text-to-image, image-to-image, character prompts and positions | [Generation](./docs/guide/FEATURES.md#generation) |
| Develop ideas in conversation | Tavern AI, confirmed or automatic generation | [Tavern](./docs/guide/FEATURES.md#tavern) |
| Produce a sequence | Comic generator, storyboard parameters, candidates and selected-image ZIP export | [Comics](./docs/guide/FEATURES.md#comic) |
| Reuse character or atmosphere references | Precise references, vibe transfer, online catalog and presets | [References](./docs/guide/FEATURES.md#reference) |
| Explore prompts and styles | Inspiration, image analysis, conversion, Style Lab and personal codex | [Prompts](./docs/guide/FEATURES.md#prompt) |
| Reuse image parameters | Metadata inspection, gallery and compatible parameter import | [Reuse](./docs/guide/FEATURES.md#reuse) |
| Organize your results | History groups, seed-locked variations, renaming and ZIP export | [Management](./docs/guide/FEATURES.md#manage) |

Tavern, comic creation and reference presets have separate workflows. Comic frames can have multiple candidates; export only your selected final images. Reference similarity varies with the model and settings and is not a guarantee of identical results.

The Windows local Artist Detective workflow currently exposes **NAI 4.5 Full only**. The full local scoring model requires at least 8 GB VRAM; the light model targets lower-memory devices, but no universal minimum has been verified. NovelAI generates images in the cloud; local CUDA scores style similarity. A similarity score is **not a reconstruction percentage**. Runtime and model downloads are separate from the desktop application.

Tavern Agent updates install validated compatible components after confirmation, not arbitrary upstream releases. User-added or modified plugins are preserved; compatibility with every third-party plugin combination is not guaranteed. [Agent update and recovery notes (Chinese)](./docs/TAVERN_AGENT_UPDATES.md).

## Preview

The following existing screenshot is from **2026-08-30 / v2.0.1** and illustrates the layout, not every current feature. The illustration above is promotional artwork, not a functional screenshot.

![Light workspace: prompts, canvas and history](./docs/assets/readme/workbench-light.png)

<details><summary>Settings preview</summary>

![Appearance and layout settings](./docs/assets/readme/settings-light.png)

</details>

## Installation and updates

Open the [Latest release page](https://github.com/2786886095/novelai-image-desktop/releases/latest) and choose the package for your platform from its assets. Use that page's version-specific notes rather than an old version or tag link. Package availability and installation requirements may change between releases.

| Platform | Choose on the Latest page | Installation limits |
| --- | --- | --- |
| Windows x64 | [Setup EXE](https://github.com/2786886095/novelai-image-desktop/releases/latest) / [portable EXE](https://github.com/2786886095/novelai-image-desktop/releases/latest) | Check the Latest signing notes. The currently verified Windows delivery has no Authenticode signature; do not assume that security or trust warnings are suppressed. Back up data and update manually. |
| macOS Intel / Apple silicon | [Universal DMG](https://github.com/2786886095/novelai-image-desktop/releases/latest) / [Universal ZIP](https://github.com/2786886095/novelai-image-desktop/releases/latest) | Check the Latest signing and notarization notes. Notarization has not been confirmed for the currently verified delivery; system trust prompts may apply. |
| Linux x64 | [AppImage](https://github.com/2786886095/novelai-image-desktop/releases/latest) | Grant execution permission, then run; replace the package manually. |
| Android | [APK](https://github.com/2786886095/novelai-image-desktop/releases/latest) | Follow the Latest installation and signature notes. Install manually; full physical-device and in-place-upgrade acceptance is not established for the currently verified delivery. |
| iOS | [IPA](https://github.com/2786886095/novelai-image-desktop/releases/latest) | If the Latest asset is an **unsigned IPA**, it is **not directly installable on a stock iPhone**. Your own valid Apple signing and provisioning are required. Do not assume App Store or TestFlight availability unless the Latest notes explicitly confirm it. |

**Manual updates:** download the current package yourself unless the Latest notes explicitly confirm a supported updater path. An updater manifest is not guaranteed, and package versions or tag naming may not trigger an in-app update; do not assume the updater will offer new bytes. Back up settings and works before replacement. Do not uninstall or delete existing data merely to force an update.

Use the verification and checksum files attached to the [Latest page](https://github.com/2786886095/novelai-image-desktop/releases/latest) for the assets you download; their names and availability can change between releases. [Repository source on main](https://github.com/2786886095/novelai-image-desktop/tree/main) is the current repository branch, not proof of a particular binary's exact build source; use the release verification records for that identity. Stable publication does not establish full 39-feature, physical-device or paid production-provider acceptance, which remains incomplete for the currently verified delivery. [Release notes (Chinese)](./docs/RELEASE_NOTES.md).

Windows installer and portable builds share `%APPDATA%\novelai-image-desktop\`. Portable does **not** mean all user data is stored beside the executable. Back up settings and images before replacing packages. Desktop and mobile features may differ; local Artist Detective iteration is Windows-only. [Platform differences](./docs/guide/FEATURES.md#platforms).

## FAQ

- **Does open source mean free generation?** No. NovelAI account permissions, subscription limits and actual Anlas charges still apply. Displayed costs are estimates.
- **Do I need optional AI APIs for basic generation?** No. Start with a NovelAI token. Image analysis, prompt conversion and conversation models have independent configuration and billing.
- **Does reading SD or ComfyUI metadata run those models?** No. Compatible prompts, sizes and seeds can be reused; model, VAE, LoRA and workflow information is for inspection.
- **Is mobile limited to basic generation?** No. It also includes Tavern, comics, references, gallery, image analysis and metadata tools; platform feature sets are not identical.

[Connection and saving troubleshooting (Chinese)](./docs/guide/GETTING_STARTED.md#troubleshooting).

## Data and connections

- The application connects to NovelAI through APIs, not browser automation or cookie extraction. Desktop requests run in Electron's main process; credentials and settings are stored locally.
- Generation sends prompts and required reference images to NovelAI. Optional AI features send their inputs to the providers you configure. Gallery, reference and tag services contact their respective sources.
- Metadata inspection runs locally and does not spend Anlas. Viewing saved references or offline dictionaries does **not** imply offline image generation.
- Remove tokens, API keys, private conversations and sensitive images before submitting an issue. Upstream diagnostic logs may retain their original language.

## Development and community

Desktop: Electron + React + TypeScript. Mobile: Flutter.

[Build guide (Chinese)](./docs/guide/DEVELOPMENT.md) · [Contributing](./CONTRIBUTING.md) · [Third-party notices](./THIRD_PARTY_NOTICES.md) · [MIT code license](./LICENSE)

[Report an issue](https://github.com/2786886095/novelai-image-desktop/issues/new) · [Existing issues](https://github.com/2786886095/novelai-image-desktop/issues) · QQ group: **921985070**

The mascot is Furina from Genshin Impact. Promotional art is unofficial AI-generated fan art; there is no official partnership or endorsement by HoYoverse or NovelAI. The code's MIT license does not grant rights to third-party characters, trademarks or artwork. [Visual asset notes](./docs/assets/readme/ASSETS.md).
