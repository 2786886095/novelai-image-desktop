// Read-only macOS-host observer for a process already running in Simulator.
// No launchctl, signals, target environment/command-line reads or synthetic PID fallback.
// Identity only: no kernel-private status macros or standalone liveness claim.
// Actual XCTest state/actions and Dart bookmark/bytes checks remain required.
#include <libproc.h>
#include <sys/proc_info.h>
#include <errno.h>
#include <inttypes.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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
int main(int argc, char **argv) {
  if (argc != 2 || !argv[1][0]) return fail("one exact positive PID required");
  for (const char *c = argv[1]; *c; c++) {
    if (*c < '0' || *c > '9') return fail("nondecimal PID refused");
  }
  errno = 0;
  char *end = NULL;
  long value = strtol(argv[1], &end, 10);
  if (errno || !end || *end || value < 1 || value > INT_MAX) return fail("PID range");
  int pid = (int)value;
  struct proc_bsdinfo before, after;
  char first[PROC_PIDPATHINFO_MAXSIZE] = {0};
  char second[PROC_PIDPATHINFO_MAXSIZE] = {0};
  if (!read_info(pid, &before)) return fail("first proc_pidinfo");
  int first_len = proc_pidpath(pid, first, (uint32_t)sizeof(first));
  if (first_len <= 0 || first_len >= (int)sizeof(first) || first[0] != '/' ||
      first[first_len] != '\0') return fail("first proc_pidpath");
  int second_len = proc_pidpath(pid, second, (uint32_t)sizeof(second));
  if (!read_info(pid, &after)) return fail("second proc_pidinfo");
  if (second_len != first_len || strcmp(first, second) != 0 ||
      before.pbi_start_tvsec != after.pbi_start_tvsec ||
      before.pbi_start_tvusec != after.pbi_start_tvusec) return fail("process changed during observation");
  printf("IOS_PROCESS_IDENTITY:{\"schemaVersion\":1,\"observer\":\"darwin-libproc\",\"pid\":%d,\"executablePath\":", pid);
  json_string(first);
  printf(",\"startSeconds\":\"%" PRIu64 "\",\"startMicroseconds\":%" PRIu64 "}\n",
      before.pbi_start_tvsec, before.pbi_start_tvusec);
  return ferror(stdout) ? fail("stdout") : 0;
}
