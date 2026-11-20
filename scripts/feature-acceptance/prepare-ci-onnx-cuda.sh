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
  rm -f -- "$archive" "$stage/reference.AppImage"
  rmdir -- "$stage"
}
trap cleanup EXIT
download() {
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
    --retry 2 --connect-timeout 10 --max-time 240 --retry-max-time 300 "$@"
}
if download --max-filesize 225318955 --output "$archive" "$asset"; then
  printf '%s  %s\n' "$sha" "$archive" | sha256sum --check --status
  entries=()
  for item in "${files[@]}"; do entries+=("$name/lib/$item"); done
  tar -xzf "$archive" --directory "$stage" --strip-components=2 -- "${entries[@]}"
else
  # The previously verified Linux release included these exact upstream 1.21.0
  # libraries. Do not execute the old image or take any application code from it.
  image="$stage/reference.AppImage"
  ref='https://github.com/2786886095/novelai-image-desktop/releases/download/v2.9.7/Langbai-NovelAI-Studio-2.9.7.AppImage'
  download --retry-all-errors --max-filesize 365609421 --output "$image" "$ref"
  printf '%s  %s\n' 'bd53922e165719ee9dac343d395e42d4cfe8887d9a36ac9c760dcafa94f1f8d3' "$image" | sha256sum --check --status
  if ! command -v unsquashfs >/dev/null; then
    sudo apt-get update -qq && sudo apt-get install -y squashfs-tools
  fi
  base='resources/app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v3/linux/x64'
  for item in "${files[@]}"; do
    unsquashfs -offset 188392 -cat "$image" "$base/$item" > "$stage/$item"
  done
fi
(cd "$stage" && sha256sum --check --strict <<'PINS'
05b2eed531d4c806ed3d46b2f6fe72076417c26e2fd5b3b02bb79b00dd4ff62e  libonnxruntime_providers_cuda.so
f8c0c324121b7086aa2bfb43e169bf31d26f7e4658c6bc096f916dbb4dd1bf7f  libonnxruntime.so.1.21.0
ebbfc73b7da61d56eba58cb3eb76caa6dcba8b3026f1d75626bb580ffe3cb69b  libonnxruntime_providers_shared.so
3e9821e97abd8f0ed0d5cd2af26f1bab6eeeea32aee316d87b1372a1499ec51a  libonnxruntime_providers_tensorrt.so
PINS
)
for item in "${files[@]}"; do
  test -f "$stage/$item" && test ! -L "$stage/$item"
  install -m 0755 -- "$stage/$item" "$dest/.$item.stage.$$"
done
for item in "${files[@]}"; do mv -f -- "$dest/.$item.stage.$$" "$dest/$item"; done
echo 'Verified all four pinned ONNX CUDA binaries; same Linux GPU runtime retained.'
