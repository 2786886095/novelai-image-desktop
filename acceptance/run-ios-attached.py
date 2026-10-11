"""CI-only native integration driver; read the real VM URI before attaching.

The application library, assertions, authentication and default test deadline
are unchanged. A late Flutter 3.24 unified-log subscription must not hide an
already running simulator VM. Keep full native logs and driver exit status.
"""
import json, os, pathlib, plistlib, re, subprocess, sys, threading, time

root = pathlib.Path(sys.argv[1]).resolve()
out = pathlib.Path(sys.argv[2]).resolve()
sha, device = sys.argv[3:5]
assert os.environ.get('GITHUB_ACTIONS') == 'true'
assert (out / 'device-id.txt').read_text().strip() == device
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip() == sha
with (root / 'mobile/build/ios/iphonesimulator/Runner.app/Info.plist').open('rb') as f:
    bundle = plistlib.load(f)['CFBundleIdentifier']
log_file = (out / 'attached-native-device.log').open('w', encoding='utf-8')
messages = []
reader = subprocess.Popen(['xcrun', 'simctl', 'spawn', device, 'log', 'stream', '--style', 'compact', '--level', 'debug', '--predicate', 'process == "Runner"'], text=True, encoding='utf-8', errors='replace', stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
def capture():
    for line in reader.stdout:
        messages.append(line)
        log_file.write(line)
        log_file.flush()
thread = threading.Thread(target=capture, daemon=True)
thread.start()
try:
    time.sleep(3)  # Subscribe before launch; never retry a failed product test.
    command = ['xcrun', 'simctl', 'launch', device, bundle, '--enable-dart-profiling', '--disable-vm-service-publication', '--enable-checked-mode', '--verify-entry-points']
    launch = subprocess.run(command, text=True, encoding='utf-8', capture_output=True)
    (out / 'attached-launch.json').write_text(json.dumps({'command': command, 'exitStatus': launch.returncode, 'stdout': launch.stdout, 'stderr': launch.stderr}, indent=2))
    print(launch.stdout, end='', flush=True)
    print(launch.stderr, end='', file=sys.stderr, flush=True)
    assert launch.returncode == 0
    pid = int(launch.stdout.strip().rsplit(':', 1)[1])
    uri = None
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        for line in messages:
            if f'Runner[{pid}:' in line and 'Dart VM service is listening on' in line:
                match = re.search(r'http://127\.0\.0\.1:\d+/[A-Za-z0-9_=\-]+/', line)
                if match:
                    uri = match[0]
                    break
        if uri:
            break
        time.sleep(.2)
    assert uri, 'No authenticated loopback VM URI from the launched process; do not count tests as passed'
    driver = root / 'mobile/test_driver/native_acceptance_driver.dart'
    driver.parent.mkdir(exist_ok=True)
    driver.write_text("""import 'dart:convert';
import 'dart:io';
import 'package:integration_test/integration_test_driver.dart';
Future<void> main() async {
  await integrationDriver(
    timeout: const Duration(minutes: 12),
    writeResponseOnFailure: true,
    responseDataCallback: (data) async {
      await File(Platform.environment['NATIVE_RESPONSE_PATH']!).writeAsString(jsonEncode(data));
    },
  );
}
""", encoding='utf-8')
    response_path = out / 'attached-driver-response.json'
    env = {**os.environ, 'NATIVE_RESPONSE_PATH': str(response_path)}
    command = ['flutter', 'drive', '-d', device, '--no-pub', '--use-existing-app=' + uri, '--driver=test_driver/native_acceptance_driver.dart', '--no-keep-app-running']
    print('NATIVE_IOS_ATTACH_COMMAND:' + json.dumps(command), flush=True)
    process = subprocess.run(command, cwd=root / 'mobile', env=env, text=True, encoding='utf-8', errors='replace', capture_output=True, timeout=780)
    print(process.stdout, end='', flush=True)
    print(process.stderr, end='', file=sys.stderr, flush=True)
    (out / 'attached-driver-command.json').write_text(json.dumps({'command': command, 'exitStatus': process.returncode, 'stdout': process.stdout, 'stderr': process.stderr}, indent=2))
    if response_path.exists():
        data = json.loads(response_path.read_text())
        assert isinstance(data, dict) and isinstance(data.get('cases'), list)
        for case in data['cases']:
            print('NATIVE_MOBILE_CASE:' + json.dumps(case), flush=True)
    sys.exit(process.returncode)
finally:
    reader.terminate()
    try:
        reader.wait(timeout=10)
    except subprocess.TimeoutExpired:
        reader.kill()
        reader.wait()
    thread.join(timeout=5)
    log_file.close()
