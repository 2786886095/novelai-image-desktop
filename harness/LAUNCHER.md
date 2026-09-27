# Tavern Agent launcher

The Windows entry opens the managed Harness browser UI. The two compact update controls leave most space for logs. Opening the page checks metadata; compatible updates require explicit confirmation before activation.

## Persistent layout

`<userData>/TavernAgent/` stores `versions/`, `active.json`, `previous.json`, `user-home/`, `backups/`, `downloads/`, and `tool-journal/` outside the replaceable application directory.

The installer supplies a seed. It does not replace conversations or customized plugins. Known unmodified bundled plugins can migrate as complete packages; custom/unknown packages block the compatibility approval instead of being overwritten.

## Update sequence

Check metadata → choose a platform/protocol-compatible component → verify archive and manifest hashes → check plugin compatibility and isolated engine startup → ask user → revalidate single-use expiring approval and file fingerprints → backup → install. A running Agent is not upgraded. Neither button installs arbitrary npm latest.

Keep the old component and matching user-data backup. Use the launcher's restore action while stopped; restoration preserves the current state first and does not start tasks automatically.

## Platform and validation limits

This component targets Windows x64. macOS/Linux and mobile retain their existing Tavern implementation. The compatibility probe checks startup health; it is not a proof of every browser interaction, model provider, or user plugin combination. No paid generation is needed for release checks.
