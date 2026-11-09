// Read-only macOS-host observer for a process already running in Simulator.
// No launchctl, signals, target environment/command-line reads or synthetic PID fallback.
// Identity only: no kernel-private status macros or standalone liveness claim.
// Actual XCTest state/actions and Dart bookmark/bytes checks remain required.
#define _DARWIN_C_SOURCE
#include <libproc.h>
#include <sys/proc_info.h>
#include <sys/stat.h>
#include <CoreFoundation/CoreFoundation.h>
#include <errno.h>
#include <fcntl.h>
#include <inttypes.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

static int fail(const char *operation) {
  fprintf(stderr, "Host libproc identity failed: %s (errno=%d)\n", operation, errno);
  return 1;
}
static int read_info(int pid, struct proc_bsdinfo *info) {
  memset(info, 0, sizeof(*info));
  int size = proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, info, (int)sizeof(*info));
  return size == (int)sizeof(*info) && info->pbi_pid == (uint32_t)pid &&
      info->pbi_start_tvsec > 0 && info->pbi_start_tvusec < 1000000;
}
static void json_string(const char *text) {
  putchar('"');
  for (const unsigned char *c = (const unsigned char *)text; *c; c++) {
    if (*c == '"' || *c == '\\') { putchar('\\'); putchar(*c); }
    else if (*c < 0x20) printf("\\u%04x", (unsigned)*c);
    else putchar(*c);
  }
  putchar('"');
}
static int metadata_path(const char *executable, const char *data, char *file) {
  char prefix[PATH_MAX];
  int n = snprintf(prefix, sizeof(prefix), "%s/Containers/Bundle/Application/", data);
  if (data[0] != '/' || n < 0 || (size_t)n >= sizeof(prefix) ||
      strncmp(executable, prefix, (size_t)n) != 0) return 0;
  const char *uuid = executable + n;
  if (strlen(uuid) <= 37 || uuid[36] != '/') return 0;
  for (size_t i = 0; i < 36; ++i) {
    const char c = uuid[i];
    if (i == 8 || i == 13 || i == 18 || i == 23) {
      if (c != '-') return 0;
    } else if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') ||
                 (c >= 'A' && c <= 'F'))) return 0;
  }
  const char *app = uuid + 37;
  const char *slash = strchr(app, '/');
  if (!slash || slash - app <= 4 || memcmp(slash - 4, ".app", 4) != 0 ||
      !slash[1] || strchr(slash + 1, '/')) return 0;
  n = snprintf(file, PATH_MAX, "%.*s/Info.plist", (int)(slash - executable), executable);
  if (n < 0 || n >= PATH_MAX) return 0;
  char canonical[PATH_MAX];
  return realpath(file, canonical) && strcmp(file, canonical) == 0;
}

static int get_ascii(CFDictionaryRef plist, CFStringRef key, char *out, size_t size) {
  CFTypeRef value = CFDictionaryGetValue(plist, key);
  if (!value || CFGetTypeID(value) != CFStringGetTypeID()) return 0;
  CFStringRef string = (CFStringRef)value;
  CFIndex length = CFStringGetLength(string);
  return length > 0 && (size_t)length < size &&
      CFStringGetCString(string, out, (CFIndex)size, kCFStringEncodingASCII) &&
      strlen(out) == (size_t)length;
}

static int read_metadata(const char *file, char *identifier, char *executable) {
  int fd = open(file, O_RDONLY | O_NOFOLLOW | O_CLOEXEC | O_NONBLOCK);
  if (fd < 0) return 0;
  struct stat st;
  if (fstat(fd, &st) != 0 || !S_ISREG(st.st_mode) || st.st_size <= 0 || st.st_size > 1048576) {
    close(fd);
    return 0;
  }
  size_t len = (size_t)st.st_size, offset = 0;
  unsigned char *bytes = malloc(len);
  if (!bytes) { close(fd); return 0; }
  while (offset < len) {
    ssize_t got = read(fd, bytes + offset, len - offset);
    if (got < 0 && errno == EINTR) continue;
    if (got <= 0) break;
    offset += (size_t)got;
  }
  unsigned char extra;
  ssize_t tail;
  do { tail = read(fd, &extra, 1); } while (tail < 0 && errno == EINTR);
  close(fd);
  CFDataRef data = offset == len && tail == 0
      ? CFDataCreate(kCFAllocatorDefault, bytes, (CFIndex)len) : NULL;
  free(bytes);
  if (!data) return 0;
  CFPropertyListRef plist = CFPropertyListCreateWithData(
      kCFAllocatorDefault, data, kCFPropertyListImmutable, NULL, NULL);
  CFRelease(data);
  if (!plist) return 0;
  int ok = CFGetTypeID(plist) == CFDictionaryGetTypeID() &&
      get_ascii((CFDictionaryRef)plist, CFSTR("CFBundleIdentifier"), identifier, 256) &&
      get_ascii((CFDictionaryRef)plist, CFSTR("CFBundleExecutable"), executable, PATH_MAX);
  CFRelease(plist);
  return ok;
}

static int clock_ms(clockid_t clock, uint64_t *out) {
  struct timespec t;
  if (clock_gettime(clock, &t) != 0 || t.tv_sec < 0 || t.tv_nsec < 0 || t.tv_nsec >= 1000000000) return 0;
  *out = (uint64_t)t.tv_sec * 1000 + (uint64_t)t.tv_nsec / 1000000;
  return 1;
}

int main(int argc, char **argv) {
  if (argc != 4 || !argv[1][0] || !argv[3][0]) return fail("exact PID, Simulator data root and deadline required");
  for (const char *c = argv[1]; *c; c++) {
    if (*c < '0' || *c > '9') return fail("nondecimal PID refused");
  }
  errno = 0;
  char *end = NULL;
  long value = strtol(argv[1], &end, 10);
  if (errno || !end || *end || value < 1 || value > INT_MAX) return fail("PID range");
  for (const char *c = argv[3]; *c; c++) {
    if (*c < '0' || *c > '9') return fail("nondecimal observation deadline refused");
  }
  errno = 0;
  const uint64_t deadline = strtoull(argv[3], &end, 10);
  if (errno || !end || *end || !deadline || deadline > 9007199254740991ULL) return fail("observation deadline range");
  uint64_t started, finished, mono_start, mono_finish;
  if (!clock_ms(CLOCK_MONOTONIC, &mono_start) ||
      !clock_ms(CLOCK_REALTIME, &started) || started >= deadline) return fail("observation started after deadline");
  int pid = (int)value;
  struct proc_bsdinfo before, after;
  char first[PROC_PIDPATHINFO_MAXSIZE] = {0};
  char second[PROC_PIDPATHINFO_MAXSIZE] = {0};
  if (!read_info(pid, &before)) return fail("first proc_pidinfo");
  int first_len = proc_pidpath(pid, first, (uint32_t)sizeof(first));
  if (first_len <= 0 || first_len >= (int)sizeof(first) || first[0] != '/' ||
      first[first_len] != '\0') return fail("first proc_pidpath");
  // Bind the real metadata read between independent kernel path/birth reads,
  // so process startup and JSON piping occur once per bounded observation.
  char metadata[PATH_MAX], identifier[256], executable[PATH_MAX];
  if (!metadata_path(first, argv[2], metadata)) return fail("outside Simulator or aliased bundle Info.plist");
  if (!read_metadata(metadata, identifier, executable)) return fail("actual bundle Info.plist read");
  int second_len = proc_pidpath(pid, second, (uint32_t)sizeof(second));
  if (!read_info(pid, &after)) return fail("second proc_pidinfo");
  if (second_len != first_len || strcmp(first, second) != 0 ||
      before.pbi_start_tvsec != after.pbi_start_tvsec ||
      before.pbi_start_tvusec != after.pbi_start_tvusec) return fail("process changed during observation");
  if (!clock_ms(CLOCK_REALTIME, &finished) || !clock_ms(CLOCK_MONOTONIC, &mono_finish) ||
      finished < started || finished >= deadline || mono_finish < mono_start ||
      mono_finish - mono_start >= 5000) return fail("actual observation exceeded deadline");
  printf("IOS_PROCESS_IDENTITY:{\"schemaVersion\":1,\"observer\":\"darwin-libproc\",\"pid\":%d,\"executablePath\":", pid);
  json_string(first);
  printf(",\"startSeconds\":\"%" PRIu64 "\",\"startMicroseconds\":%" PRIu64,
      before.pbi_start_tvsec, before.pbi_start_tvusec);
  printf(",\"observationStartedAtMs\":%" PRIu64 ",\"observationFinishedAtMs\":%" PRIu64
         ",\"observationElapsedMs\":%" PRIu64 ",\"observationDeadlineMs\":%" PRIu64,
      started, finished, mono_finish - mono_start, deadline);
  printf(",\"metadataBracketed\":true,\"metadataPath\":");
  json_string(metadata);
  printf(",\"bundleInfo\":{\"CFBundleIdentifier\":");
  json_string(identifier);
  printf(",\"CFBundleExecutable\":");
  json_string(executable);
  puts("}}");
  return ferror(stdout) ? fail("stdout") : 0;
}
