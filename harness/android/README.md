# Android local Agent — integration candidate

This is an on-device ARM64 Harness runtime, not a desktop remote connection.
Android 8+ is required for this optional feature; other app features retain their
existing Android minimum. No separate Termux installation or root is used.
iOS continues using the existing Tavern screen.

## Storage and updates

`files/TavernAgent/versions/<version>-<uuid>` holds replaceable runtime slots.
`user-home`, `workspace`, `backups`, and the paid-tool journal are outside slots.
An APK update does not copy over a populated home. Seed packages are copied only
if missing. User-modified plugins are tested from a separate home copy. A failed
probe never changes `active.json`. Successful preparation requires explicit
confirmation; a backup is made before activation. Launch is a separate action.

The launcher checks the Studio component channel and official Harness version
separately on entry. Official npm versions are informational until a matching
Studio adapter passes the protocol and startup checks. It does not run `npm
update` in a user's home. No process is automatically restarted after OS death.

Backups can be restored from the launcher after stopping Agent. Restoration
first preserves current data and never installs executable runtime content from
an archive. Internal plugin symlinks and executable flags are retained; links
outside the home require explicit manual review rather than being traversed.

## Native and component build

1. `node harness/android/prepare-native.mjs` verifies pinned native files and
   stages them in Android `jniLibs`; Android extracts executables itself.
2. On ARM64 Linux, `bash harness/android/build-rootfs.sh` builds a fresh Ubuntu
   guest with hash-pinned Node and locked Harness dependencies. It never uses a
   developer's existing user home or a community app's older prebuilt runtime.
3. The mobile workflow stages only a verified, hash-pinned download descriptor in
   the APK. Publish `agent-rootfs.zip` and `android-agent.json` together in the
   matching `agent-v<version>` component release before releasing the app. The
   user explicitly downloads the runtime on first use; checks alone never do so.
   A private hash-addressed partial download supports retry/resume. The launcher
   displays size, progress and transfer speed; activation still requires a
   compatibility probe and confirmation. App updates preserve installed slots
   and user data. The Gradle asset guard rejects embedded runtime archives.
4. The Android foreground service starts PRoot, then Harness on loopback only.
   The authenticated bootstrap URL is opened in the phone browser, not logged.
5. The Studio bridge accepts only authenticated loopback requests with stable
   call identities. Mutations need an in-app approval; uncertain results stay
   journaled and are not automatically retried.

The guest can access its own home and Studio workspace, not arbitrary shared
storage by default. API keys remain in user configuration and are not baked into
the runtime. Model calls still need a network API; local Agent is not local LLM
inference. Existing mobile conversations stay available via “Existing Tavern &
history”; no destructive automatic migration is performed.

## Release gates still required

Host unit tests and APK compilation do not establish Android device compatibility.
Before promoting the shared app/Agent release: validate an ARM64 phone's initial
install, plugin-loaded web UI, message persistence across restart, background
lifecycle, decline/approve/deduplicate a tool request, upgrade from an existing
user home, backup restoration, and battery/process limits. Until those results
exist, keep the app and component releases in draft.

## Third-party provenance

Architecture reference: [DSHA](https://github.com/DSH-APP/DSHA), pinned revision
`bdb647c331c4d6c11b5632afdb901c50510720ea`. No proprietary proroot binary is used.
`upstream/sources.json` records exact files, URLs and hashes; original MIT/GPL
notices and the PRoot build recipe are retained. PRoot is a separate GPL-2.0
executable. Its corresponding source is Termux PRoot `v5.1.107.92`; talloc source
is `2.4.3`. Ubuntu packages keep `/usr/share/doc` copyright files; the build emits
an installed package inventory. Redistribution must include corresponding-source
access for native/Ubuntu components, not only this app's MIT license.
