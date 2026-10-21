// Host-only diagnostic authoring tests, not a native scenario receipt.
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import '../integration_test/native_scenario_support.dart';

const _source = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const _profile = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
NativeFailureDiagnostics _diagnostics(List<String> output) =>
    NativeFailureDiagnostics(sourceIdentity: _source,
      profileIdentity: _profile, entry: 'batch_mcp7', output: output.add);
List<Map<String, dynamic>> _records(List<String> output) {
  final groups = <int, List<Map<String, dynamic>>>{};
  for (final line in output.where((v) => v.startsWith('NATIVE_DIAGNOSTIC_CHUNK:'))) {
    final packet = jsonDecode(line.substring('NATIVE_DIAGNOSTIC_CHUNK:'.length))
        as Map<String, dynamic>;
    groups.putIfAbsent(packet['id'] as int, () => []).add(packet);
  }
  return groups.values.map((packets) {
    packets.sort((a,b) => (a['index'] as int).compareTo(b['index'] as int));
    expect(packets.length, packets.first['count']);
    final bytes = packets.expand((p) => base64Decode(p['data'] as String)).toList();
    expect(bytes.length, packets.first['bytes']);
    expect(digest(bytes), packets.first['sha256']);
    return jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
  }).toList();
}
Map<String, dynamic> _summary(List<String> output) => jsonDecode(
    output.singleWhere((v) => v.startsWith('NATIVE_DIAGNOSTIC_SUMMARY:'))
      .substring('NATIVE_DIAGNOSTIC_SUMMARY:'.length)) as Map<String,dynamic>;
class _Unprintable {
  @override
  String toString() => throw StateError('unprintable value');
}
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('framework detail is source/profile/entry/check bound, including silent', () {
    final output = <String>[];
    final diagnostics = _diagnostics(output);
    final original = StateError('CONTROLLED_FRAMEWORK_DIAGNOSTIC');
    diagnostics.framework(FlutterErrorDetails(exception: original,
        stack: StackTrace.fromString('controlled_frame:13:7'),
        library: 'controlled rendering library',
        context: ErrorDescription('while mounting controlled fixture'), silent: true),
      checkIndex: 4);
    final record = _records(output).single;
    expect(record['schema'], 'native-failure-diagnostic/v1');
    expect(record['sourceSha'], _source);
    expect(record['profileSha'], _profile);
    expect(record['entry'], 'batch_mcp7');
    expect(record['checkIndex'], 4);
    expect(record['kind'], 'framework');
    expect(record['exception'], contains('CONTROLLED_FRAMEWORK_DIAGNOSTIC'));
    expect(record['stack'], 'controlled_frame:13:7');
    expect(record['library'], 'controlled rendering library');
    expect(record['context'], 'while mounting controlled fixture');
    expect(record['silent'], true);
  });
  test('actual framework handler retains original error and presentError behavior', () {
    final output = <String>[], presented = <FlutterErrorDetails>[];
    final suite = NativeScenarios(7, diagnostics: _diagnostics(output));
    final before = FlutterError.presentError;
    FlutterError.presentError = presented.add;
    final original = StateError('CONTROLLED_SILENT_FAILURE');
    final details = FlutterErrorDetails(exception: original, silent: true);
    try { suite.recordFrameworkFailure(details); }
    finally { FlutterError.presentError = before; }
    expect(suite.errors, [same(original)]);
    expect(presented, [same(details)]);
    expect(_records(output).single['silent'], true);
    expect(suite.verifyNoFrameworkFailures,
      throwsA(isA<StateError>().having((v) => v.message, 'message',
        'Native framework/async failure')));
  });
  test('actual async handler records stack and still fails the original gate', () {
    final output = <String>[];
    final suite = NativeScenarios(7, diagnostics: _diagnostics(output));
    final original = StateError('CONTROLLED_ASYNC_FAILURE');
    expect(suite.recordAsyncFailure(original,
      StackTrace.fromString('controlled_async:23:5')), true);
    expect(suite.errors.single, same(original));
    final record = _records(output).single;
    expect(record['kind'], 'async');
    expect(record['stack'], 'controlled_async:23:5');
    expect(record['checkIndex'], 0);
    expect(suite.verifyNoFrameworkFailures, throwsStateError);
    expect(output.any((v) => v.contains('FEATURE_')), false);
  });
  test('clean collector emits no failure, and native defaults use actual binding', () {
    final output = <String>[];
    _diagnostics(output).finish(checkIndex: 7);
    expect(output, isEmpty);
    final suite = NativeScenarios(7);
    expect(suite.failureDiagnostics.sourceIdentity, sourceSha);
    expect(suite.failureDiagnostics.profileIdentity, profileSha);
    expect(suite.failureDiagnostics.entry, testEntry);
    expect(suite.verifyNoFrameworkFailures, returnsNormally);
  });
  test('credentials are redacted in all fields before output', () {
    final output = <String>[];
    const sensitive = 'Authorization: Bearer BEARER_CREDENTIAL\n'
      'api_key="API_CREDENTIAL" token=TOKEN_CREDENTIAL; password=PASSWORD_CREDENTIAL\n'
      'https://USER_CREDENTIAL:PASS_CREDENTIAL@fixture.invalid/?secret=QUERY_CREDENTIAL';
    _diagnostics(output).framework(FlutterErrorDetails(exception: sensitive,
      stack: StackTrace.fromString(sensitive), library: sensitive,
      context: ErrorDescription(sensitive)), checkIndex: 2);
    final literal = jsonEncode(_records(output));
    for (final secret in ['BEARER_CREDENTIAL','API_CREDENTIAL','TOKEN_CREDENTIAL',
        'PASSWORD_CREDENTIAL','USER_CREDENTIAL','PASS_CREDENTIAL','QUERY_CREDENTIAL']) {
      expect(literal, isNot(contains(secret)), reason: secret);
    }
    expect(literal, contains('<redacted>'));
  });
  test('private paths are redacted while repository-relative stack remains', () {
    final output = <String>[];
    const paths = 'file:///home/runner/work/_temp/private/source/mobile/integration_test/entry.dart:8:4\n'
      'file:///data/user/0/PRIVATE_APP/cache/PRIVATE_FILE.png\n'
      'C:\\Users\\PRIVATE_USER\\PRIVATE_FILE.png\n'
      '/storage/emulated/0/PRIVATE_FILE.png\n'
      'package:novelai_mobile/state/app_state.dart:23:8';
    _diagnostics(output).asynchronous(StateError(paths),
      StackTrace.fromString(paths), checkIndex: 3);
    final literal = jsonEncode(_records(output));
    for (final secret in ['PRIVATE_APP','PRIVATE_USER','PRIVATE_FILE','/home/runner']) {
      expect(literal, isNot(contains(secret)));
    }
    expect(literal, contains('<source>/mobile/integration_test/entry.dart:8:4'));
    expect(literal, contains('package:novelai_mobile/state/app_state.dart:23:8'));
  });
  test('UTF8 byte bounds and explicit framing remain small, valid and non-proof', () {
    final output = <String>[];
    final large = List.filled(12000, '界🦊').join();
    _diagnostics(output).framework(FlutterErrorDetails(exception: large,
      stack: StackTrace.fromString(large), library: large,
      context: ErrorDescription(large)), checkIndex: 7);
    final record = _records(output).single;
    for (final field in {'exception': NativeFailureDiagnostics.maxExceptionBytes,
        'stack': NativeFailureDiagnostics.maxStackBytes,
        'context': NativeFailureDiagnostics.maxContextBytes, 'library': 256}.entries) {
      expect(utf8.encode(record[field.key] as String).length,
        lessThanOrEqualTo(field.value), reason: field.key);
    }
    for (final line in output) {
      expect(ascii.encode(line).length, lessThan(900));
      expect(line, isNot(contains('FEATURE_ACCEPTANCE_')));
      expect(line, isNot(contains('NATIVE_PROOF_')));
      expect(line, isNot(contains('Unhandled Exception:')));
    }
  });
  test('record cap counts omitted diagnostics without clearing any original error', () {
    final output = <String>[];
    final diagnostics = _diagnostics(output);
    final suite = NativeScenarios(7, diagnostics: diagnostics);
    for (var i=0; i<NativeFailureDiagnostics.maxRecords+5; i++) {
      suite.recordAsyncFailure(StateError('controlled $i'), StackTrace.empty);
    }
    diagnostics.finish(checkIndex: 7);
    expect(_records(output).length, NativeFailureDiagnostics.maxRecords);
    expect(suite.errors.length, NativeFailureDiagnostics.maxRecords+5);
    final summary = _summary(output);
    expect(summary['observed'], NativeFailureDiagnostics.maxRecords+5);
    expect(summary['retained'], NativeFailureDiagnostics.maxRecords);
    expect(summary['dropped'], 5);
    expect(summary['checkIndex'], 7);
    expect(suite.verifyNoFrameworkFailures, throwsStateError);
  });
  test('diagnostic sink failure cannot replace original failure or skip presenter', () {
    final diagnostics = NativeFailureDiagnostics(sourceIdentity: _source,
      profileIdentity: _profile, entry: 'batch_mcp7',
      output: (_) => throw StateError('controlled sink failure'));
    final suite = NativeScenarios(7, diagnostics: diagnostics);
    final original = StateError('CONTROLLED_ORIGINAL_ERROR');
    final before = FlutterError.presentError;
    var presented = false;
    FlutterError.presentError = (_) { presented = true; };
    try { suite.recordFrameworkFailure(FlutterErrorDetails(exception: original)); }
    finally { FlutterError.presentError = before; }
    diagnostics.finish(checkIndex: 0);
    expect(suite.errors.single, same(original));
    expect(diagnostics.outputFailures, greaterThan(0));
    expect(presented, true);
    expect(suite.verifyNoFrameworkFailures, throwsStateError);
  });
  test('hostile diagnostic toString cannot replace the captured original error', () {
    final output = <String>[];
    final suite = NativeScenarios(7, diagnostics: _diagnostics(output));
    final original = _Unprintable();
    suite.recordAsyncFailure(original, StackTrace.empty);
    expect(suite.errors.single, same(original));
    expect(_records(output).single['exception'], '<unprintable diagnostic>');
    expect(suite.verifyNoFrameworkFailures, throwsStateError);
  });
}
