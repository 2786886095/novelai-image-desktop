// Fixture diagnostics only; never an acceptance receipt or relaxed wait.
import 'dart:convert';

class NativeAccountWaitState {
  final bool activeMatch,
      locked,
      apiInFlight,
      vaultLocked,
      busy,
      queueRunning,
      queueAdding;
  const NativeAccountWaitState(
      {required this.activeMatch,
      required this.locked,
      required this.apiInFlight,
      required this.vaultLocked,
      required this.busy,
      required this.queueRunning,
      required this.queueAdding});
  bool get ready => activeMatch && !locked;
  Map<String, bool> toJson() => {
        'activeMatch': activeMatch,
        'locked': locked,
        'apiInFlight': apiInFlight,
        'vaultLocked': vaultLocked,
        'busy': busy,
        'queueRunning': queueRunning,
        'queueAdding': queueAdding
      };
}

class NativeAccountWaitDiagnostic {
  static const maxStateChanges = 8;
  final bool Function() _ready;
  final NativeAccountWaitState Function() read;
  final void Function(String) _emit;
  var _attempts = 0, _samples = 0, _finished = false;
  String? _last;
  NativeAccountWaitDiagnostic(this._ready, this.read,
      {void Function(String)? emit})
      : _emit = emit ?? _print;
  // ignore: avoid_print
  static void _print(String value) => print(value);
  void _report(NativeAccountWaitState value, String phase) {
    try {
      _emit('FEATURE_NATIVE_ACCOUNT_WAIT:${jsonEncode({
            'kind': 'diagnostic',
            'phase': phase,
            'attempt': _attempts,
            ...value.toJson()
          })}');
    } catch (_) {
      // A failed diagnostic sink cannot change the original validation result.
    }
  }

  bool selectedAndIdle() {
    final ready = _ready(); // Exact original predicate, before diagnostics.
    _attempts++;
    try {
      final value = read();
      final signature = jsonEncode(value.toJson());
      if (!_finished && signature != _last && _samples < maxStateChanges) {
        _samples++;
        _report(value, 'sample');
      }
      _last = signature;
    } catch (_) {
      // Reading an optional diagnostic cannot change original readiness.
    }
    return ready;
  }

  void finish({required bool success}) {
    if (_finished) return;
    _finished = true;
    try {
      _report(read(), success ? 'success' : 'failure');
    } catch (_) {
      // Preserve the original caller error even if its state is no longer readable.
    }
  }
}
