import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import '../integration_test/native_account_wait_diagnostic.dart';

NativeAccountWaitState state(int bits) => NativeAccountWaitState(
    activeMatch: (bits & 1) != 0,
    locked: (bits & 2) != 0,
    apiInFlight: (bits & 4) != 0,
    vaultLocked: (bits & 8) != 0,
    busy: (bits & 16) != 0,
    queueRunning: (bits & 32) != 0,
    queueAdding: (bits & 64) != 0);
void main() {
  test(
      'all128boolean combinations retain original selection and idle predicate',
      () {
    for (var i = 0; i < 128; i++) {
      final v = state(i), lines = <String>[];
      final d =
          NativeAccountWaitDiagnostic(() => v.ready, () => v, emit: lines.add);
      expect(d.selectedAndIdle(), v.activeMatch && !v.locked);
      d.finish(success: v.ready);
      expect(lines, hasLength(2));
      for (final s in lines) {
        expect(s, startsWith('FEATURE_NATIVE_ACCOUNT_WAIT:'));
        expect(s, isNot(contains('FEATURE_ACCEPTANCE_')));
        final j = jsonDecode(s.substring(s.indexOf(':') + 1)) as Map;
        expect(
            j.keys.toSet(), {'kind', 'phase', 'attempt', ...v.toJson().keys});
        expect(j['kind'], 'diagnostic');
        expect(j['attempt'], 1);
        for (final k in v.toJson().keys) {
          expect(j[k], v.toJson()[k]);
          expect(j[k], isA<bool>());
        }
      }
    }
  });
  test(
      '400identical polls emit one sample plus terminal without changing readiness',
      () {
    final lines = <String>[];
    final d = NativeAccountWaitDiagnostic(() => state(3).ready, () => state(3),
        emit: lines.add);
    for (var i = 0; i < 400; i++) {
      expect(d.selectedAndIdle(), false);
    }
    d.finish(success: false);
    d.finish(success: false);
    expect(lines, hasLength(2));
    expect(jsonDecode(lines.last.split(':').skip(1).join(':'))['attempt'], 400);
    expect(lines.last, contains('"phase":"failure"'));
  });
  test('changed states cap at8samples plus actual terminal state', () {
    var bits = 0;
    final lines = <String>[];
    final d = NativeAccountWaitDiagnostic(
        () => state(bits).ready, () => state(bits),
        emit: lines.add);
    for (var i = 0; i < 128; i++) {
      bits = i;
      d.selectedAndIdle();
    }
    d.finish(success: false);
    expect(lines, hasLength(9));
    final last = jsonDecode(lines.last.substring(lines.last.indexOf(':') + 1));
    expect(last['attempt'], 128);
    expect(last['activeMatch'], true);
    expect(last['queueAdding'], true);
  });
  test(
      'diagnostic sink failure cannot change success or original caller failure',
      () {
    final d = NativeAccountWaitDiagnostic(() => state(1).ready, () => state(1),
        emit: (_) => throw StateError('sink'));
    expect(d.selectedAndIdle(), true);
    expect(() => d.finish(success: true), returnsNormally);
    final original = StateError('original');
    Object? caught;
    try {
      try {
        throw original;
      } catch (_) {
        d.finish(success: false);
        rethrow;
      }
    } catch (e) {
      caught = e;
    }
    expect(identical(caught, original), true);
  });
  test(
      'unreadable diagnostic preserves ready decision and original predicate error',
      () {
    for (final value in [false, true]) {
      final d = NativeAccountWaitDiagnostic(
          () => value, () => throw StateError('diagnostic read'));
      expect(d.selectedAndIdle(), value);
      expect(() => d.finish(success: value), returnsNormally);
    }
    final original = StateError('original predicate');
    var readCalled = false;
    final d = NativeAccountWaitDiagnostic(() => throw original, () {
      readCalled = true;
      throw StateError('unused');
    });
    Object? caught;
    try {
      try {
        d.selectedAndIdle();
      } catch (_) {
        d.finish(success: false);
        rethrow;
      }
    } catch (e) {
      caught = e;
    }
    expect(identical(caught, original), true);
    expect(readCalled, true);
  });
  test('integration still has exact400wait, real tap, nine checks and rethrow',
      () {
    final ui = File('integration_test/native_ui_scenarios.dart')
        .readAsStringSync()
        .replaceAll('\r\n', '\n');
    final actions = File('integration_test/native_ui_actions.dart')
        .readAsStringSync()
        .replaceAll('\r\n', '\n');
    expect(actions, contains('{int frames = 400}'));
    expect(ui, contains('NativeScenarios(9)'));
    expect(ui, contains('await nativeUiTap(nativeUiElements('));
    expect(ui, contains('await nativeUiWait(diagnostic.selectedAndIdle,'));
    expect(ui, contains('diagnostic.finish(success:false);\n    rethrow;'));
    expect(RegExp(r"suite\.check\(").allMatches(ui), hasLength(9));
  });
}
