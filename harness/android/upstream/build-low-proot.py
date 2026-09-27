#!/usr/bin/env python3
"""用 NDK API 23 重编兼容版 proot；不替换标准版原生库。Windows/Linux 均可运行。"""
import argparse
import concurrent.futures
import hashlib
import io
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import urllib.request
import zipfile

REPO = Path(__file__).resolve().parents[1]


def fetch(path, url, sha):
    if not path.is_file():
        path.write_bytes(urllib.request.urlopen(url, timeout=45).read())
    if hashlib.sha256(path.read_bytes()).hexdigest() != sha:
        raise ValueError('源码校验失败：' + str(path))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ndk', required=True)
    args = parser.parse_args()
    build = REPO / 'app/build/low-support'
    build.mkdir(parents=True, exist_ok=True)
    fetch(build / 'proot.zip', 'https://codeload.github.com/termux/proot/zip/refs/tags/v5.1.107.92',
          '29385d1ddb619a9c4449ab512bfd55032034b22f724ddf98fc95ff300ea32135')
    with zipfile.ZipFile(build / 'proot.zip') as archive:
        archive.extractall(build)
    fetch(build / 'talloc.tar.gz', 'https://www.samba.org/ftp/talloc/talloc-2.4.3.tar.gz',
          'dc46c40b9f46bb34dd97fe41f548b0e8b247b77a918576733c528e83abd854dd')
    with tarfile.open(build / 'talloc.tar.gz') as archive:
        header = next(item for item in archive if item.name.endswith('/talloc.h'))
        (build / 'talloc.h').write_bytes(archive.extractfile(header).read())
    source = build / 'proot-5.1.107.92/src'
    # 沿用项目对 /proc/self/fd 特殊路径的断言修复，只去掉该已知错误断言。
    canon = source / 'path/canon.c'
    content = canon.read_text()
    expected = 'assert(status != 1 || sscanf(guest_path, "/proc/%*d/fd/%d", &status) == 1);'
    if expected not in content:
        raise ValueError('canonicalize 补丁位置变化')
    canon.write_text(content.replace(expected, '/* Android 的命名 fd 不满足旧断言，继续按错误码处理。 */'))
    (build / 'build.h').write_text('#define HAVE_PROCESS_VM 1\n#define HAVE_SECCOMP_FILTER 1\n')
    (build / 'android23.h').write_text('''#include <ifaddrs.h>
#include <sys/shm.h>
int dsha_getifaddrs(struct ifaddrs **result);
void dsha_freeifaddrs(struct ifaddrs *result);
int libandroid_shmget(key_t key, size_t size, int flags);
int libandroid_shmctl(int id, int command, struct shmid_ds *buffer);
#define getifaddrs dsha_getifaddrs
#define freeifaddrs dsha_freeifaddrs
#define shmget libandroid_shmget
#define shmctl libandroid_shmctl
''')
    (build / 'android23.c').write_text('''#include <ifaddrs.h>
#include <dlfcn.h>
#include <errno.h>
/* 该合成网络回复只用于新 Android 的 netlink 限制；旧系统继续使用原生 netlink。 */
int dsha_getifaddrs(struct ifaddrs **result) {
    int (*fn)(struct ifaddrs **) = dlsym(RTLD_DEFAULT, "getifaddrs");
    if (fn) return fn(result);
    *result = 0; errno = ENOSYS; return -1;
}
void dsha_freeifaddrs(struct ifaddrs *result) {
    void (*fn)(struct ifaddrs *) = dlsym(RTLD_DEFAULT, "freeifaddrs");
    if (fn) fn(result);
}
''')
    prebuilt = Path(args.ndk) / 'toolchains/llvm/prebuilt'
    host = next(prebuilt.iterdir())
    suffix = '.exe' if (host / 'bin/clang.exe').is_file() else ''
    clang = str(host / ('bin/clang' + suffix))
    readelf = str(host / ('bin/llvm-readelf' + suffix))
    strip = str(host / ('bin/llvm-strip' + suffix))
    cc = [clang, '--target=aarch64-linux-android23', '-O2', '-g0', '-fPIE', '-D_GNU_SOURCE',
          '-D_FILE_OFFSET_BITS=64', '-DARG_MAX=131072', '-DVERSION="5.1.107.92-dsha-android23"',
          '-DPROOT_UNBUNDLE_LOADER="/unused"', '-DWITH_LIBANDROID_SHMEM',
          '-I'+str(build), '-I'+str(source), '-Wno-implicit-function-declaration']
    objects = re.findall(r'([\w/-]+\.o)', (source / 'GNUmakefile').read_text().split('OBJECTS +=',1)[1].split('define define_from_arch',1)[0])
    objdir = build / 'proot-objects'; objdir.mkdir(exist_ok=True)
    def compile_file(item):
        src = source / item.replace('.o','.c')
        obj = objdir / item.replace('/','_')
        result = subprocess.run(cc + ['-include',str(build/'android23.h'),'-c',str(src),'-o',str(obj)],capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stderr.decode('utf-8','replace'))
        return obj
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        objs = list(pool.map(compile_file, objects))
    extra = objdir / 'android23.o'
    subprocess.run(cc + ['-c',str(build/'android23.c'),'-o',str(extra)],check=True)
    objs.append(extra)
    destination = REPO / 'app/src/low/jniLibs/arm64-v8a'
    destination.mkdir(parents=True, exist_ok=True)
    loader = destination / 'libprootloader_legacy.so'
    subprocess.run(cc + ['-ffreestanding','-fPIC','-nostdlib','-static',
                        '-Wl,--build-id=none,-Ttext=0x2000000000,-z,noexecstack,-z,max-page-size=16384',
                        str(source/'loader/loader.c'),str(source/'loader/assembly.S'),'-o',str(loader)],check=True)
    symbols = subprocess.check_output([readelf,'-s','--wide',str(loader)],text=True)
    addresses = {name:int(re.search(r'\s\d+:\s+([0-9a-f]+).*\s'+name+r'\s*$',symbols,re.M).group(1),16)
                 for name in ['_start','pokedata_workaround']}
    info = build/'loader-info.c'
    info.write_text('#include <unistd.h>\nconst ssize_t offset_to_pokedata_workaround = %d;\n' %
                    (addresses['pokedata_workaround']-addresses['_start']))
    infoobj = objdir/'loader-info.o'
    subprocess.run(cc+['-c',str(info),'-o',str(infoobj)],check=True);objs.append(infoobj)
    libs = REPO/'app/src/main/jniLibs/arm64-v8a'
    proot = destination/'libproot_legacy.so'
    subprocess.run(cc + ['-pie','-Wl,-z,noexecstack,-z,max-page-size=16384'] + list(map(str,objs)) +
                   ['-L'+str(libs),'-l:libtalloc.so','-l:libandroidshmem.so','-ldl','-o',str(proot)],check=True)
    for binary in [proot,loader]:
        subprocess.run([strip,'--strip-unneeded',str(binary)],check=True)
        print(binary.name,binary.stat().st_size,hashlib.sha256(binary.read_bytes()).hexdigest())


if __name__ == '__main__':
    main()
