# Studio Harness integration

Windows x64 integration for Langbai NovelAI Studio 2.3.7. See [update and recovery](../docs/TAVERN_AGENT_UPDATES.md) and [launcher contract](./LAUNCHER.md).

Pinned runtime: Harness 0.1.7-rc.2, compatible component 0.1.2. Native file, terminal and plugin tools remain available alongside Studio image tools. Paid image actions require confirmation. Persistent profiles live outside the application installation.

macOS/Linux currently retain the existing Tavern interface; Android/iOS retain the mobile Tavern. A local full Harness engine for those platforms is not included in this release. Old Tavern data is retained, not silently converted into resumable Harness conversations.

Build the Windows runtime from an isolated pinned dependency tree using `build-community.mjs` and `build-component.mjs`; package only hash-manifest members with `scripts/package-harness-release.mjs`. CI fetches the exact component archive pinned by `release-seed.json`, never a user profile or floating latest build.
