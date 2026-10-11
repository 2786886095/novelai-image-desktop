#!/bin/sh
set -eu
# Fresh remote CI secret-service session, not the user's desktop/keyring.
export XDG_CURRENT_DESKTOP=GNOME
export XDG_SESSION_DESKTOP=gnome
export XDG_RUNTIME_DIR="$(mktemp -d)"
chmod 700 "$XDG_RUNTIME_DIR"
printf 'neutral-ci-fixture-password' | gnome-keyring-daemon --unlock --components=secrets
node "$(dirname "$0")/run-desktop.cjs" "$@"
