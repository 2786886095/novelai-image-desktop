#!/usr/bin/env bash
set -euo pipefail
if [[ ${1:-} != build || ${2:-} != apk ]]; then
  exec "$STUDIO_REAL_FLUTTER" "$@"
fi

state="$RUNNER_TEMP/studio-android-maven"
mkdir -p "$state"
if [[ -f "$state/mirror-ready" ]]; then
  export STUDIO_CI_MAVEN_MIRROR=1
fi

log=$(mktemp "$state/build.XXXXXX")
trap 'rm -f -- "$log"' EXIT
if "$STUDIO_REAL_FLUTTER" "$@" 2>&1 | tee "$log"; then
  exit 0
else
  statuses=("${PIPESTATUS[@]}")
fi
if [[ ${statuses[1]} != 0 ]]; then exit "${statuses[1]}"; fi
if [[ ${STUDIO_CI_MAVEN_MIRROR:-0} == 1 ]] ||
   ! grep -Eq 'https://(repo\.maven\.apache\.org|repo1\.maven\.org)/maven2/.*(status code 429|429 Too Many Requests)' "$log"; then
  exit "${statuses[0]}"
fi

echo 'Maven Central returned 429. Retrying this APK build once via the Google-hosted Maven Central mirror.' >&2
sleep "$((5 + RANDOM % 11))"
STUDIO_CI_MAVEN_MIRROR=1 "$STUDIO_REAL_FLUTTER" "$@"
touch "$state/mirror-ready"
