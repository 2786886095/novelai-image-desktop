"""Build an Android-extractable rootfs: regular ZIP files, explicit relative links.

Never follows rootfs links into the build host. APK installs immutable rootfs
slots; /studio-home and /workspace are separate runtime bind mounts.
"""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile


def normalized_link(name, target):
    if not target or '\\' in target or '\0' in target:
        raise ValueError('Invalid link')
    parts = [] if target.startswith('/') else name.split('/')[:-1]
    for part in target.split('/'):
        if part in ('', '.'):
            continue
        if part == '..':
            if not parts:
                raise ValueError('Link escapes rootfs: ' + name)
            parts.pop()
        else:
            parts.append(part)
    if not parts:
        raise ValueError('Link points to rootfs root: ' + name)
    return '/'.join(parts)


def pack(root, output, lock):
    root, output = Path(root), Path(output)
    links, executables, sizes = {}, [], 0
    count = 0
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for directory, dirs, files in os.walk(root, followlinks=False):
            for item in sorted(dirs + files):
                file = Path(directory) / item
                name = file.relative_to(root).as_posix()
                mode = file.lstat().st_mode
                if stat.S_ISLNK(mode):
                    links[name] = normalized_link(name, os.readlink(file))
                elif stat.S_ISDIR(mode):
                    archive.writestr(name + '/', b'')
                elif stat.S_ISREG(mode):
                    archive.write(file, name)
                    sizes += file.stat().st_size
                    count += 1
                    if mode & 0o111:
                        executables.append(name)
                else:
                    raise ValueError('Unsupported rootfs object: ' + name)
        archive.writestr('.studio-rootfs.json', json.dumps({
            'format': 1, 'links': links, 'executables': executables,
            'files': count, 'unpackedBytes': sizes,
        }, separators=(',', ':')))
    seed = {key: lock[key] for key in ('format', 'protocol', 'version', 'upstream', 'platform', 'arch', 'minSdk')}
    with output.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    seed.update(sha256=digest,
                bytes=output.stat().st_size, unpackedBytes=sizes, asset=output.name)
    output.with_name('seed.json').write_text(json.dumps(seed, indent=2) + '\n', encoding='utf-8')
    print(f'ROOTFS PACK PASS: {count} files; {len(links)} links; {sizes} expanded bytes')


if __name__ == '__main__':
    pack(sys.argv[1], sys.argv[2], json.loads(Path(sys.argv[3]).read_text()))
