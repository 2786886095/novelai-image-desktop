#!/usr/bin/env bash
set -euo pipefail
[[ "$(uname -s)/$(uname -m)" == 'Linux/x86_64' ]] || { echo 'Expected Linux x86_64' >&2; exit 1; }
version='1.21.0'
# Public microsoft/onnxruntime release v1.21.0, Linux x64 GPU asset from the npm installer.
asset='https://github.com/microsoft/onnxruntime/releases/download/v1.21.0/onnxruntime-linux-x64-gpu-1.21.0.tgz'
sha='ef37a33ba75e457aebfd0d7b342ab20424aa6126bc5f565d247f1201b66996cf'
python3 - "$version" <<'PY'
import json, sys
from pathlib import Path
lock = json.loads(Path('package-lock.json').read_text())['packages']['node_modules/onnxruntime-node']
installed = json.loads(Path('node_modules/onnxruntime-node/package.json').read_text())
if lock['version'] != sys.argv[1] or installed['version'] != sys.argv[1]:
    raise SystemExit('ONNX Runtime version differs from the pinned asset.')
PY
dest='node_modules/onnxruntime-node/bin/napi-v3/linux/x64'
test -f "$dest/onnxruntime_binding.node"
stage="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/official-onnx.XXXXXXXX")"
name="onnxruntime-linux-x64-gpu-$version"
archive="$stage/$name.tgz"
files=(libonnxruntime_providers_cuda.so "libonnxruntime.so.$version" libonnxruntime_providers_shared.so libonnxruntime_providers_tensorrt.so)
cleanup() {
  for item in "${files[@]}"; do rm -f -- "$stage/$item" "$dest/.$item.stage.$$"; done
  rm -f -- "$archive"
  rmdir -- "$stage"
}
trap cleanup EXIT
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
  --retry 2 --connect-timeout 10 --max-time 150 --retry-max-time 180 \
  --max-filesize 225318955 --output "$archive" "$asset"
printf '%s  %s\n' "$sha" "$archive" | sha256sum --check --status
entries=()
for item in "${files[@]}"; do entries+=("$name/lib/$item"); done
tar -xzf "$archive" --directory "$stage" --strip-components=2 -- "${entries[@]}"
for item in "${files[@]}"; do
  test -f "$stage/$item" && test ! -L "$stage/$item"
  install -m 0755 -- "$stage/$item" "$dest/.$item.stage.$$"
done
for item in "${files[@]}"; do mv -f -- "$dest/.$item.stage.$$" "$dest/$item"; done
echo 'Verified all four pinned ONNX CUDA binaries; same Linux GPU runtime retained.'
