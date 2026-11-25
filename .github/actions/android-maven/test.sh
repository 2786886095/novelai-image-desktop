#!/usr/bin/env bash
set -euo pipefail
wrapper="$(cd "$(dirname "$0")" && pwd)/flutter-apk.sh"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
export RUNNER_TEMP="$work/runner" STUDIO_REAL_FLUTTER="$work/tool"
mkdir -p "$work/bin"
printf '#!/usr/bin/env bash\nexit 0\n' > "$work/bin/sleep"
export PATH="$work/bin:$PATH"

cat > "$STUDIO_REAL_FLUTTER" <<'SH'
#!/usr/bin/env bash
printf '%s %s\n' "${STUDIO_CI_MAVEN_MIRROR:-0}" "$*" >> "$RUNNER_TEMP.calls"
case "$CASE:${STUDIO_CI_MAVEN_MIRROR:-0}" in
  ok:*|limited:1) exit 0 ;;
  unrelated:*) echo 'Dart compilation failed' >&2; exit 14 ;;
  elsewhere:*) echo 'https://example.org/maven2/a.pom Received status code 429' >&2; exit 12 ;;
  both:1) exit 23 ;;
  *) echo "Could not GET 'https://repo.maven.apache.org/maven2/com/squareup/javawriter/2.5.0/javawriter-2.5.0.pom'. Received status code 429 from server: Too Many Requests" >&2; exit 17 ;;
esac
SH
chmod +x "$STUDIO_REAL_FLUTTER" "$work/bin/sleep"
check() {
  export CASE="$1"
  local expected="$2" routes="$3" result=0
  shift 3
  : > "$RUNNER_TEMP.calls"
  bash "$wrapper" "$@" || result=$?
  [[ "$result" == "$expected" ]]
  [[ "$(cut -d' ' -f1 "$RUNNER_TEMP.calls" | paste -sd, -)" == "$routes" ]]
  while read -r line; do [[ "${line#* }" == "$*" ]]; done < "$RUNNER_TEMP.calls"
}
check ok 0 0 build apk --debug
check unrelated 14 0 build apk
check elsewhere 12 0 build apk
check limited 17 0 test --no-pub
check both 23 0,1 build apk
check limited 0 0,1 build apk -t integration_test/text.dart
check limited 0 1 build apk --release
echo 'Maven 429 recovery regression passed'
