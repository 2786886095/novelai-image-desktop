#!/usr/bin/env bash
set -euo pipefail
# Dedicated ARM64 Linux CI builder only. Never executes on a user's phone/home.
[[ "$(uname -m)" == aarch64 ]] || { echo 'ARM64 builder required'; exit 1; }
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="$(mktemp -d)"
ROOT="$BUILD/rootfs"
OUT="$REPO/artifacts/android-runtime"
mkdir -p "$ROOT" "$OUT"
python3 - "$REPO/harness/android/runtime-lock.json" "$BUILD" <<'PY'
import hashlib,json,pathlib,sys,urllib.request
lock=json.loads(pathlib.Path(sys.argv[1]).read_text())
for key in ('ubuntu','node'):
    dest=pathlib.Path(sys.argv[2])/key
    urllib.request.urlretrieve(lock[key]['url'],dest)
    assert hashlib.file_digest(dest.open('rb'),'sha256').hexdigest()==lock[key]['sha256'], key
print('SOURCE HASHES PASS')
PY
sudo tar -xpf "$BUILD/ubuntu" -C "$ROOT"
sudo tar -xpf "$BUILD/node" -C "$ROOT/usr/local" --strip-components=1
sudo cp -L /etc/resolv.conf "$ROOT/etc/resolv.conf"
sudo mkdir -p "$ROOT/dev" "$ROOT/proc" "$ROOT/opt/agent" "$ROOT/studio-home" "$ROOT/probe-home" "$ROOT/workspace"
sudo mount --bind /dev "$ROOT/dev"
sudo mount -t proc proc "$ROOT/proc"
cleanup(){ sudo umount "$ROOT/proc" 2>/dev/null || true; sudo umount "$ROOT/dev" 2>/dev/null || true; }
trap cleanup EXIT
sudo chroot "$ROOT" /usr/bin/env DEBIAN_FRONTEND=noninteractive /bin/bash -euc '
 apt-get update
 apt-get install --no-install-recommends -y ca-certificates git python3 make g++ bash curl
 apt-get clean
'
sudo cp "$REPO/harness/android/runtime/"package*.json "$ROOT/opt/agent/"
sudo chroot "$ROOT" /bin/bash -euc 'cd /opt/agent && /usr/local/bin/npm ci --omit=dev --no-audit --no-fund'
# All community sources are integrity-checked by this existing adapter.
node "$REPO/harness/build-community.mjs"
sudo cp -a "$REPO/.tmp/harness-community" "$ROOT/opt/agent/community"
sudo cp -a "$REPO/harness/plugins" "$ROOT/opt/agent/plugins"
sudo cp "$REPO/harness/android/seed-home.mjs" "$ROOT/opt/agent/seed-home.mjs"
sudo cp "$REPO/harness/android/hardlink-publish.mjs" "$ROOT/opt/agent/hardlink-publish.mjs"
sudo mkdir -p "$ROOT/opt/agent/runtime"
sudo mv "$ROOT/opt/agent/node_modules" "$ROOT/opt/agent/runtime/node_modules"
sudo cp "$REPO/harness/android/runtime/"package*.json "$ROOT/opt/agent/runtime/"
sudo python3 - "$ROOT" <<'PY'
import pathlib,sys
root=pathlib.Path(sys.argv[1])
files=list(root.glob('opt/agent/runtime/node_modules/**/dsh-session-persistence-jsonl/lib/index.js'))
assert files, 'Missing pinned JSONL implementation'
for file in files:
    text=file.read_text()
    for before,after in [
        ('await internals.fs.link(staged, currentPath);','await publishAndroid(staged, currentPath, internals.fs);'),
        ('await link(tmp, finalPath);','await publishAndroid(tmp, finalPath);'),
    ]:
        assert text.count(before)==1, 'JSONL adapter drift'
        text=text.replace(before,after)
    file.write_text("import {publishAndroid} from '/opt/agent/hardlink-publish.mjs';\n"+text)
print('PINNED JSONL ADAPTER PASS')
PY
sudo chroot "$ROOT" /usr/local/bin/node --version
sudo chroot "$ROOT" /usr/bin/env DSH_HOME=/probe-home /usr/local/bin/node /opt/agent/seed-home.mjs
sudo chroot "$ROOT" /usr/bin/env DSH_HOME=/probe-home /usr/local/bin/node /opt/agent/runtime/node_modules/@deepseek-ai/dsh/lib/bin.js web --help
sudo chroot "$ROOT" /usr/bin/dpkg-query -W > "$OUT/ubuntu-packages.txt"
# Empty runtime mount points; no CI/developer credentials or test sessions shipped.
sudo find "$ROOT/probe-home" -mindepth 1 -delete
sudo find "$ROOT/root" -mindepth 1 -delete
sudo find "$ROOT/tmp" -mindepth 1 -delete
sudo find "$ROOT/var/log" -type f -exec truncate -s0 {} \;
sudo umount "$ROOT/proc"
sudo umount "$ROOT/dev"
trap - EXIT
# Devices are provided as bind mounts at runtime, not serialized special files.
sudo find "$ROOT/dev" -mindepth 1 -delete
sudo python3 "$REPO/harness/android/pack_rootfs.py" "$ROOT" "$OUT/agent-rootfs.zip" "$REPO/harness/android/runtime-lock.json"
sudo chmod a+r "$OUT/agent-rootfs.zip" "$OUT/seed.json"
echo 'ANDROID ROOTFS BUILD PASS (Linux build validation, not Android device validation)'
