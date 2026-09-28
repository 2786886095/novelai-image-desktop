# Langbai NovelAI Studio

[简体中文](./README.md) · [繁體中文](./README.zh-TW.md) · [English](./README.en.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md)


**v2.4.3 platform note:** The standalone Tavern Agent supports Windows x64 and Android ARM64 (Android 8+); other platforms retain the existing Tavern. Opening its page does not download anything. Installation shows the version and download size and asks for confirmation. Uninstalling the component preserves conversations and user data for reinstallation.

### From an idea to a collection of images.

A NovelAI image-creation workspace with Simplified Chinese, Traditional Chinese, English, Japanese and Korean interfaces.

![Promotional fan illustration; the interface shown is a visual concept](./docs/assets/readme/furina-workbench.png)

**[Download the latest release](https://github.com/2786886095/novelai-image-desktop/releases/latest)** · [Getting started (Chinese)](./docs/guide/GETTING_STARTED.md) · [Feature guide (Chinese)](./docs/guide/FEATURES.md)

> Bring your own **NovelAI Persistent API Token**. Model access and generation charges depend on your NovelAI account. Optional image analysis, prompt conversion and Tavern AI services require separate configuration.

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

Use the [latest release](https://github.com/2786886095/novelai-image-desktop/releases/latest) for available packages and version-specific notes. [Release notes (Chinese)](./docs/RELEASE_NOTES.md).

| Platform | Package | Notes |
| --- | --- | --- |
| Windows x64 | Setup EXE or portable EXE | The installer provides shortcuts and in-app updates. Replace portable packages manually. |
| macOS Intel / Apple silicon | Universal DMG or ZIP | Unsigned; see the installation guide for system prompts. |
| Linux x64 | AppImage | Grant execution permission before running. |
| Android | APK | Install manually. |
| iOS | Unsigned IPA | Requires your own signing or sideloading; not an App Store package. |

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
